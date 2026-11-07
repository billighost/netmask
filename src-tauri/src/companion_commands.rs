use crate::{
    CompanionRuntime, analysis, companion, evidence, observations, ping, portal, settings, streamer,
};
use std::collections::{BTreeSet, HashMap, HashSet};
use tauri::{AppHandle, Emitter, State};

async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| error.to_string())?
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn range_bounds(range: &str) -> Result<(i64, i64, i64), String> {
    let end = now_ms();
    let (span, bucket) = match range {
        "24h" => (24 * 60 * 60 * 1000, 15 * 60 * 1000),
        "7d" => (7 * 24 * 60 * 60 * 1000, 2 * 60 * 60 * 1000),
        "30d" => (30 * 24 * 60 * 60 * 1000, 8 * 60 * 60 * 1000),
        _ => return Err("History range must be 24h, 7d, or 30d".into()),
    };
    Ok((end - span, end, bucket))
}

fn selected_key(value: Option<&str>) -> Result<Option<String>, String> {
    value
        .map(|value| {
            if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                Ok(value.to_owned())
            } else {
                settings::fingerprint_local("network", value)
            }
        })
        .transpose()
}

fn percentile(values: impl Iterator<Item = f64>, value: f64) -> Option<f64> {
    analysis::percentile(&values.collect::<Vec<_>>(), value)
}

fn missing_reason(
    start_ms: i64,
    end_ms: i64,
    samples: &[&observations::ObservationSample],
    gaps: &[observations::ObservationGap],
) -> Option<String> {
    if !samples.is_empty() {
        if samples.iter().any(|sample| {
            sample
                .missing_reason
                .as_deref()
                .is_some_and(|reason| reason.to_ascii_lowercase().contains("permission"))
        }) {
            return Some("permission".into());
        }
        return samples
            .iter()
            .all(|sample| sample.internet_ms.is_none())
            .then(|| "unavailable".into());
    }
    gaps.iter()
        .find(|gap| gap.start_ms < end_ms && gap.end_ms.unwrap_or(end_ms) > start_ms)
        .map(|gap| {
            if gap.reason.to_ascii_lowercase().contains("paused") {
                "paused"
            } else {
                "unavailable"
            }
            .into()
        })
        .or_else(|| Some("not-running".into()))
}

fn connection_events(
    samples: &[observations::ObservationSample],
    gaps: &[observations::ObservationGap],
    alerts: &[observations::AlertRecord],
) -> Vec<companion::ConnectionEvent> {
    let mut internet_by_network: HashMap<&str, Vec<f64>> = HashMap::new();
    let mut jitter_by_network: HashMap<&str, Vec<f64>> = HashMap::new();
    for sample in samples {
        let Some(network) = sample.network_key.as_deref() else {
            continue;
        };
        if let Some(value) = sample.internet_ms {
            internet_by_network
                .entry(network)
                .or_default()
                .push(value as f64);
        }
        if let Some(value) = sample.jitter_ms {
            jitter_by_network.entry(network).or_default().push(value);
        }
    }
    let latency_thresholds: HashMap<&str, f64> = internet_by_network
        .into_iter()
        .filter_map(|(network, values)| {
            analysis::robust_baseline(&values)
                .map(|baseline| (network, analysis::latency_threshold(baseline)))
        })
        .collect();
    let jitter_thresholds: HashMap<&str, f64> = jitter_by_network
        .into_iter()
        .filter_map(|(network, values)| {
            analysis::robust_baseline(&values).map(|baseline| {
                (
                    network,
                    30.0_f64.max(baseline.median + (baseline.mad * 3.0).max(15.0)),
                )
            })
        })
        .collect();
    let mut events = Vec::new();
    let mut previous_network: Option<&str> = None;
    for (index, sample) in samples.iter().enumerate() {
        if let Some(network) = sample.network_key.as_deref() {
            if previous_network.is_some_and(|previous| previous != network) {
                events.push(companion::ConnectionEvent {
                    id: format!("switch-{}-{index}", sample.timestamp_ms),
                    at_ms: sample.timestamp_ms,
                    kind: "network-switch".into(),
                    title: "Network changed".into(),
                    detail: "NetMask began measuring a different saved network.".into(),
                    redacted_detail: Some(
                        "NetMask began measuring a different saved network.".into(),
                    ),
                    network_guid: None,
                });
            }
            previous_network = Some(network);
        }
        if sample.gateway_ms.is_some() && sample.internet_ms.is_none() {
            let detail = format!(
                "The gateway answered{} but the internet target did not.",
                sample
                    .gateway_ms
                    .map(|value| format!(" in {value} ms"))
                    .unwrap_or_default()
            );
            events.push(companion::ConnectionEvent {
                id: format!("drop-{}-{index}", sample.timestamp_ms),
                at_ms: sample.timestamp_ms,
                kind: "drop".into(),
                title: "Internet check did not answer".into(),
                detail: detail.clone(),
                redacted_detail: Some(detail),
                network_guid: None,
            });
        }
        let latency_threshold = sample
            .network_key
            .as_deref()
            .and_then(|network| latency_thresholds.get(network))
            .copied();
        if let (Some(value), Some(threshold)) = (sample.internet_ms, latency_threshold) {
            if value as f64 >= threshold {
                let detail = format!(
                    "Internet response was {value} ms, above the measured baseline threshold of {:.0} ms.",
                    threshold
                );
                events.push(companion::ConnectionEvent {
                    id: format!("latency-{}-{index}", sample.timestamp_ms),
                    at_ms: sample.timestamp_ms,
                    kind: "latency-spike".into(),
                    title: "Latency spike".into(),
                    detail: detail.clone(),
                    redacted_detail: Some(detail),
                    network_guid: None,
                });
            }
        }
        let jitter_threshold = sample
            .network_key
            .as_deref()
            .and_then(|network| jitter_thresholds.get(network))
            .copied();
        if let (Some(value), Some(threshold)) = (sample.jitter_ms, jitter_threshold) {
            if value >= threshold {
                let detail = format!(
                    "Jitter was {:.1} ms, above the measured baseline threshold of {:.1} ms.",
                    value, threshold
                );
                events.push(companion::ConnectionEvent {
                    id: format!("jitter-{}-{index}", sample.timestamp_ms),
                    at_ms: sample.timestamp_ms,
                    kind: "jitter-spike".into(),
                    title: "Jitter spike".into(),
                    detail: detail.clone(),
                    redacted_detail: Some(detail),
                    network_guid: None,
                });
            }
        }
    }
    for (index, gap) in gaps.iter().enumerate() {
        if gap.reason.to_ascii_lowercase().contains("paused") {
            events.push(companion::ConnectionEvent {
                id: format!("paused-{}-{index}", gap.start_ms),
                at_ms: gap.start_ms,
                kind: "monitoring-paused".into(),
                title: "Monitoring paused".into(),
                detail: "No connection measurements were recorded during this gap.".into(),
                redacted_detail: Some(
                    "No connection measurements were recorded during this gap.".into(),
                ),
                network_guid: None,
            });
            if let Some(end) = gap.end_ms {
                events.push(companion::ConnectionEvent {
                    id: format!("resumed-{end}-{index}"),
                    at_ms: end,
                    kind: "monitoring-resumed".into(),
                    title: "Monitoring resumed".into(),
                    detail: "Connection measurements resumed after the recorded gap.".into(),
                    redacted_detail: Some(
                        "Connection measurements resumed after the recorded gap.".into(),
                    ),
                    network_guid: None,
                });
            }
        }
    }
    for alert in alerts {
        if alert.category == "access_point" {
            events.push(companion::ConnectionEvent {
                id: format!("alert-{}", alert.id),
                at_ms: alert.timestamp_ms,
                kind: "access-point-change".into(),
                title: "Access point changed".into(),
                detail: alert.message.clone(),
                redacted_detail: Some(
                    "A confirmed access-point change was recorded for a saved network.".into(),
                ),
                network_guid: None,
            });
        }
    }
    events.sort_by_key(|event| event.at_ms);
    events.dedup_by(|left, right| left.id == right.id);
    events
}

fn history_series(
    database: &observations::ObservationDb,
    range: &str,
    network_guid: Option<&str>,
) -> Result<companion::HistorySeries, String> {
    let (from_ms, to_ms, bucket_ms) = range_bounds(range)?;
    let selected = selected_key(network_guid)?;
    let samples: Vec<_> = database
        .samples_between(from_ms, to_ms)?
        .into_iter()
        .filter(|sample| {
            selected
                .as_deref()
                .is_none_or(|key| sample.network_key.as_deref() == Some(key))
        })
        .collect();
    let gaps = database.gaps_between(from_ms, to_ms)?;
    let alerts: Vec<_> = database
        .alert_inbox(true, 500)?
        .into_iter()
        .filter(|alert| {
            alert.timestamp_ms >= from_ms
                && alert.timestamp_ms < to_ms
                && selected
                    .as_deref()
                    .is_none_or(|key| alert.network_key == key)
        })
        .collect();
    let bucket_count = ((to_ms - from_ms + bucket_ms - 1) / bucket_ms) as usize;
    let mut groups: Vec<Vec<&observations::ObservationSample>> = vec![Vec::new(); bucket_count];
    for sample in &samples {
        let index = ((sample.timestamp_ms - from_ms) / bucket_ms) as usize;
        if let Some(group) = groups.get_mut(index) {
            group.push(sample);
        }
    }
    let buckets: Vec<_> = groups
        .into_iter()
        .enumerate()
        .map(|(index, group)| {
            let start = from_ms + index as i64 * bucket_ms;
            let end = (start + bucket_ms).min(to_ms);
            companion::HistoryBucket {
                start_ms: start,
                end_ms: end,
                sample_count: group.len() as u64,
                expected_sample_count: ((end - start + 14_999) / 15_000) as u64,
                missing_reason: missing_reason(start, end, &group, &gaps),
                gateway_median_ms: percentile(
                    group
                        .iter()
                        .filter_map(|sample| sample.gateway_ms.map(|value| value as f64)),
                    0.5,
                ),
                internet_median_ms: percentile(
                    group
                        .iter()
                        .filter_map(|sample| sample.internet_ms.map(|value| value as f64)),
                    0.5,
                ),
                internet_p95_ms: percentile(
                    group
                        .iter()
                        .filter_map(|sample| sample.internet_ms.map(|value| value as f64)),
                    0.95,
                ),
                jitter_median_ms: percentile(
                    group.iter().filter_map(|sample| sample.jitter_ms),
                    0.5,
                ),
                jitter_max_ms: group
                    .iter()
                    .filter_map(|sample| sample.jitter_ms)
                    .max_by(f64::total_cmp),
                drop_count: group
                    .iter()
                    .filter(|sample| sample.gateway_ms.is_some() && sample.internet_ms.is_none())
                    .count() as u64,
            }
        })
        .collect();
    let measured_count = samples
        .iter()
        .filter(|sample| sample.status == observations::SampleStatus::Measured)
        .count() as u64;
    let expected = ((to_ms - from_ms + 14_999) / 15_000) as u64;
    let mut events = connection_events(&samples, &gaps, &alerts);
    if events.len() > 200 {
        events.drain(0..events.len() - 200);
    }
    Ok(companion::HistorySeries {
        from_ms,
        to_ms,
        network_guid: network_guid.map(str::to_owned),
        coverage_percent: if expected == 0 {
            0.0
        } else {
            measured_count as f64 * 100.0 / expected as f64
        },
        sample_count: samples.len() as u64,
        events,
        buckets,
    })
}

#[tauri::command]
pub async fn nm_get_ui_session() -> Result<companion::UiSession, String> {
    blocking(companion::load_ui_session).await
}

#[tauri::command]
pub async fn nm_save_ui_session(session: companion::UiSession) -> Result<(), String> {
    blocking(move || companion::save_ui_session(session)).await
}

#[tauri::command]
pub async fn nm_get_connection_history(
    runtime: State<'_, CompanionRuntime>,
    range: String,
    network_guid: Option<String>,
) -> Result<companion::HistorySeries, String> {
    let database = runtime.database()?;
    blocking(move || history_series(&database, &range, network_guid.as_deref())).await
}

#[tauri::command]
pub async fn nm_get_network_usage(
    runtime: State<'_, CompanionRuntime>,
) -> Result<companion::UsageReport, String> {
    let database = runtime.database()?;
    blocking(move || {
        let settings = settings::get_settings_checked()?;
        let totals = database.usage_totals()?;
        let mut seen_networks = HashSet::new();
        let networks = totals
            .into_iter()
            .filter(|total| seen_networks.insert(total.network_key.clone()))
            .map(|total| {
                let all = total.received_bytes.saturating_add(total.sent_bytes);
                companion::NetworkUsageSummary {
                    network_guid: total.network_key,
                    display_name: total.network_label,
                    from_ms: total.cycle_start_ms,
                    to_ms: total.updated_at_ms,
                    downloaded_bytes: total.received_bytes,
                    uploaded_bytes: total.sent_bytes,
                    total_bytes: all,
                    limit_bytes: total.limit_bytes,
                    limit_percent: total
                        .limit_bytes
                        .filter(|limit| *limit > 0)
                        .map(|limit| all as f64 * 100.0 / limit as f64),
                    counter_resets: total.counter_reset_count,
                    adapter_changes: total.adapter_change_count,
                }
            })
            .collect::<Vec<_>>();
        let from_ms = networks
            .iter()
            .map(|total| total.from_ms)
            .min()
            .unwrap_or_else(now_ms);
        let to_ms = networks
            .iter()
            .map(|total| total.to_ms)
            .max()
            .unwrap_or_else(now_ms);
        let unavailable_reason = (!settings.usage_tracking_enabled && networks.is_empty()).then(|| {
            "Data-use tracking is off. Turn it on in Settings to begin local per-network totals."
                .into()
        });
        Ok(companion::UsageReport {
            from_ms,
            to_ms,
            networks,
            unavailable_reason,
        })
    })
    .await
}

#[tauri::command]
pub async fn nm_set_network_usage_limit(
    runtime: State<'_, CompanionRuntime>,
    network_guid: String,
    limit_bytes: Option<u64>,
) -> Result<(), String> {
    let database = runtime.database()?;
    blocking(move || {
        if limit_bytes.is_some_and(|value| value == 0 || value > 1_000_000 * 1024_u64.pow(3)) {
            return Err("The data limit is outside the supported range".into());
        }
        let key = selected_key(Some(&network_guid))?.ok_or("Network identifier is missing")?;
        database.set_usage_limit(&key, limit_bytes, 1)
    })
    .await
}

#[tauri::command]
pub async fn nm_get_weekly_digest(
    runtime: State<'_, CompanionRuntime>,
) -> Result<companion::WeeklyDigestView, String> {
    let database = runtime.database()?;
    blocking(move || {
        let end = now_ms();
        let start = end - 7 * 24 * 60 * 60 * 1000;
        let samples = database.samples_between(start, end)?;
        let mut dns = HashMap::new();
        for key in samples
            .iter()
            .filter_map(|sample| sample.network_key.clone())
            .collect::<BTreeSet<_>>()
        {
            if let Some(value) = database.latest_dns_evidence(&key, start)? {
                dns.insert(key, value);
            }
        }
        let digest = analysis::weekly_digest(&samples, start, end, &dns);
        let summary = if !digest.enough_data {
            "Not enough measured history for a weekly conclusion yet.".into()
        } else if digest.drop_count > 0 {
            format!(
                "NetMask measured {} internet drop(s) and {} unusual latency sample(s).",
                digest.drop_count, digest.spike_count
            )
        } else if digest.spike_count > 0 {
            format!(
                "No measured internet drops, with {} unusual latency sample(s).",
                digest.spike_count
            )
        } else {
            "No clear reliability problem appeared in the measured week.".into()
        };
        let evidence = format!(
            "{} measured samples across {} day(s); {:.1}% of 15-second opportunities.",
            digest.measured_count,
            digest.monitored_days,
            digest.coverage_ratio * 100.0
        );
        Ok(companion::WeeklyDigestView {
            from_ms: start,
            to_ms: end,
            enough_data: digest.enough_data,
            coverage_percent: digest.coverage_ratio * 100.0,
            summary,
            insufficient_reason: (!digest.enough_data).then(|| {
                format!(
                    "Only {} measured samples across {} day(s) were available. NetMask does not fill the missing time.",
                    digest.measured_count, digest.monitored_days
                )
            }),
            findings: digest
                .findings
                .into_iter()
                .enumerate()
                .filter(|(_, finding)| finding.level != "insufficient")
                .map(|(index, finding)| companion::DigestFindingView {
                    id: format!("finding-{index}"),
                    title: finding.title,
                    detail: finding.detail,
                    evidence: evidence.clone(),
                    suggestion: finding.suggestion,
                })
                .collect(),
        })
    })
    .await
}

#[tauri::command]
pub async fn nm_delete_monitoring_data(runtime: State<'_, CompanionRuntime>) -> Result<(), String> {
    let database = runtime.database()?;
    let operation = runtime.operation_lock();
    blocking(move || {
        let _guard = operation.lock().unwrap_or_else(|error| error.into_inner());
        database.delete_all()?;
        settings::delete_monitoring_identity()
    })
    .await
}

#[tauri::command]
pub async fn nm_get_context_prompt(
    runtime: State<'_, CompanionRuntime>,
) -> Result<Option<companion::ContextPrompt>, String> {
    if let Some(prompt) = runtime.pending_prompt() {
        return Ok(Some(prompt));
    }
    let preferences = settings::get_settings();
    let status = streamer::get_streamer_status();
    if status.is_cloaked {
        return Ok(None);
    }
    let Some(app) = status.detected_app else {
        runtime.clear_broadcast_dismissal();
        return Ok(None);
    };
    if preferences.streamer_detection_mode != "suggest" || !preferences.context_prompts_enabled {
        return Ok(None);
    }
    let id = format!("broadcast:{}", app.to_ascii_lowercase());
    if runtime.prompt_was_dismissed(&id) {
        return Ok(None);
    }
    Ok(Some(companion::ContextPrompt {
        id,
        kind: "broadcast-app".into(),
        title: format!("Prepare for {app}?"),
        detail: "NetMask can check the connection and turn on sharing mode before you begin."
            .into(),
        app_name: Some(app),
        network_guid: None,
    }))
}

#[tauri::command]
pub async fn nm_respond_context_prompt(
    runtime: State<'_, CompanionRuntime>,
    prompt_id: String,
    response: String,
) -> Result<(), String> {
    if !matches!(response.as_str(), "accept" | "dismiss" | "disable") {
        return Err("Context response is invalid".into());
    }
    if response == "disable" {
        settings::set_setting("streamerDetectionMode", serde_json::json!("off"))?;
    }
    if response != "accept" || prompt_id.starts_with("broadcast:") {
        runtime.dismiss_prompt(prompt_id);
    } else {
        runtime.clear_pending_prompt();
    }
    Ok(())
}

pub(crate) fn alert_view(alert: observations::AlertRecord) -> companion::NetworkAlert {
    let (kind, title) = match alert.category.as_str() {
        "access_point" => ("access-point-change", "Access point changed"),
        "usage_near_limit" => ("usage-near-limit", "Data limit is getting close"),
        "usage_over_limit" => ("usage-over-limit", "Data limit was reached"),
        _ => ("behavior-change", "Connection behavior changed"),
    };
    companion::NetworkAlert {
        id: alert.id.to_string(),
        kind: kind.into(),
        title: title.into(),
        detail: alert.message,
        detected_at_ms: alert.timestamp_ms,
        network_guid: None,
    }
}

#[tauri::command]
pub async fn nm_get_network_alert(
    runtime: State<'_, CompanionRuntime>,
) -> Result<Option<companion::NetworkAlert>, String> {
    let database = runtime.database()?;
    blocking(move || Ok(database.alert_inbox(false, 1)?.pop().map(alert_view))).await
}

#[tauri::command]
pub async fn nm_dismiss_network_alert(
    runtime: State<'_, CompanionRuntime>,
    alert_id: String,
) -> Result<(), String> {
    let database = runtime.database()?;
    blocking(move || {
        let id = alert_id
            .parse::<i64>()
            .map_err(|_| "Alert identifier is invalid")?;
        database.dismiss_alert(id)
    })
    .await
}

#[tauri::command]
pub async fn nm_get_network_preset(
    network_guid: String,
) -> Result<companion::NetworkPreset, String> {
    blocking(move || companion::get_network_preset(&network_guid)).await
}

#[tauri::command]
pub async fn nm_get_pending_preset_undo() -> Result<Option<companion::PresetApplication>, String> {
    blocking(companion::pending_preset_undo).await
}

#[tauri::command]
pub async fn nm_preview_network_preset(
    preset: companion::NetworkPreset,
) -> Result<companion::PresetPreview, String> {
    blocking(move || companion::preview_network_preset(&preset)).await
}

#[tauri::command]
pub async fn nm_save_network_preset(preset: companion::NetworkPreset) -> Result<(), String> {
    blocking(move || companion::save_network_preset(preset)).await
}

#[tauri::command]
pub async fn nm_apply_network_preset(
    app: AppHandle,
    network_guid: String,
) -> Result<companion::PresetApplication, String> {
    let result = blocking(move || companion::apply_network_preset(&network_guid, true)).await?;
    if result.applied {
        let _ = app.emit("nm:network-changed", ());
    }
    Ok(result)
}

#[tauri::command]
pub async fn nm_undo_network_preset(app: AppHandle, undo_token: String) -> Result<(), String> {
    blocking(move || companion::undo_network_preset(&undo_token)).await?;
    let _ = app.emit("nm:network-changed", ());
    Ok(())
}

fn check_status(value: Option<i64>, ready: i64, caution: i64) -> String {
    match value {
        Some(value) if value <= ready => "ready",
        Some(value) if value <= caution => "caution",
        Some(_) => "not-ready",
        None => "unavailable",
    }
    .into()
}

#[tauri::command]
pub async fn nm_run_going_live() -> Result<companion::GoingLiveResult, String> {
    blocking(|| {
        let telemetry = ping::get_ping_telemetry();
        let portal = portal::check_captive_portal();
        let before = streamer::get_streamer_status();
        let sharing_status = if before.is_cloaked {
            before
        } else {
            streamer::toggle_streamer_cloak()
        };
        let mut checks = vec![
            companion::GoingLiveCheck {
                id: "gateway".into(),
                label: "Router response".into(),
                status: check_status(telemetry.gateway_ms, 30, 100),
                value: telemetry
                    .gateway_ms
                    .map(|value| format!("{value} ms"))
                    .unwrap_or_else(|| "Unavailable".into()),
                detail: "A slow router response can point to local Wi-Fi or adapter trouble.".into(),
            },
            companion::GoingLiveCheck {
                id: "internet".into(),
                label: "Internet response".into(),
                status: check_status(telemetry.internet_ms, 100, 250),
                value: telemetry
                    .internet_ms
                    .map(|value| format!("{value} ms"))
                    .unwrap_or_else(|| "Unavailable".into()),
                detail: "One fresh response check; it is not a guarantee for the whole call.".into(),
            },
            companion::GoingLiveCheck {
                id: "jitter".into(),
                label: "Jitter".into(),
                status: telemetry
                    .jitter_ms
                    .map(|value| {
                        if value <= 20.0 {
                            "ready"
                        } else if value <= 40.0 {
                            "caution"
                        } else {
                            "not-ready"
                        }
                    })
                    .unwrap_or("unavailable")
                    .into(),
                value: telemetry
                    .jitter_ms
                    .map(|value| format!("{value:.1} ms"))
                    .unwrap_or_else(|| "Unavailable".into()),
                detail: "Jitter needs several successful responses, so a fresh check may be unavailable.".into(),
            },
        ];
        checks.push(match portal {
            Ok(status) if status.is_captive => companion::GoingLiveCheck {
                id: "sign-in".into(),
                label: "Network sign-in".into(),
                status: "not-ready".into(),
                value: "Sign-in needed".into(),
                detail: "Finish the network sign-in before starting a call or broadcast.".into(),
            },
            Ok(_) => companion::GoingLiveCheck {
                id: "sign-in".into(),
                label: "Network sign-in".into(),
                status: "ready".into(),
                value: "No sign-in detected".into(),
                detail: "The documented connectivity probe returned its expected response.".into(),
            },
            Err(_) => companion::GoingLiveCheck {
                id: "sign-in".into(),
                label: "Network sign-in".into(),
                status: "unavailable".into(),
                value: "Unavailable".into(),
                detail: "NetMask could not complete the sign-in check.".into(),
            },
        });
        checks.push(companion::GoingLiveCheck {
            id: "sharing".into(),
            label: "Sharing mode".into(),
            status: if sharing_status.is_cloaked {
                "ready"
            } else {
                "not-ready"
            }
            .into(),
            value: if sharing_status.is_cloaked {
                "On"
            } else {
                "Not on"
            }
            .into(),
            detail: sharing_status.error.clone().unwrap_or_else(|| {
                "Sharing mode changes NetMask and supported local display labels; it is not anonymity."
                    .into()
            }),
        });
        let status = if checks.iter().any(|check| check.status == "not-ready") {
            "not-ready"
        } else if checks.iter().any(|check| check.status == "caution") {
            "caution"
        } else if checks.iter().any(|check| check.status == "unavailable") {
            "unavailable"
        } else {
            "ready"
        };
        let summary = match status {
            "ready" => "The fresh checks look ready and sharing mode is on.",
            "caution" => "You can proceed, but one fresh measurement deserves attention.",
            "not-ready" => "Resolve the failed check before relying on this connection.",
            _ => "Some checks were unavailable, so NetMask cannot give a complete readiness answer.",
        };
        Ok(companion::GoingLiveResult {
            status: status.into(),
            summary: summary.into(),
            checked_at_ms: now_ms(),
            sharing_status,
            checks,
        })
    })
    .await
}

#[tauri::command]
pub async fn nm_get_evidence_report(
    runtime: State<'_, CompanionRuntime>,
    range: String,
    network_guid: Option<String>,
) -> Result<companion::EvidenceReportData, String> {
    let database = runtime.database()?;
    blocking(move || {
        let (from_ms, to_ms, _) = range_bounds(&range)?;
        let selected = selected_key(network_guid.as_deref())?;
        let samples: Vec<_> = database
            .samples_between(from_ms, to_ms)?
            .into_iter()
            .filter(|sample| {
                selected
                    .as_deref()
                    .is_none_or(|key| sample.network_key.as_deref() == Some(key))
            })
            .collect();
        let gaps = database.gaps_between(from_ms, to_ms)?;
        let report = evidence::build_provider_evidence(
            &samples,
            &gaps,
            now_ms(),
            from_ms,
            to_ms,
            evidence::ReportPrivacy::default(),
        )?;
        let alerts: Vec<_> = database
            .alert_inbox(true, 500)?
            .into_iter()
            .filter(|alert| {
                alert.timestamp_ms >= from_ms
                    && alert.timestamp_ms < to_ms
                    && selected
                        .as_deref()
                        .is_none_or(|key| alert.network_key == key)
            })
            .collect();
        let mut events = connection_events(&samples, &gaps, &alerts);
        events.retain(|event| {
            matches!(
                event.kind.as_str(),
                "drop" | "latency-spike" | "jitter-spike" | "access-point-change"
            )
        });
        for event in &mut events {
            if event.kind == "access-point-change" {
                event.detail =
                    "A confirmed access-point change was recorded for a saved network.".into();
                event.redacted_detail = Some(event.detail.clone());
            }
        }
        let drop_count = events.iter().filter(|event| event.kind == "drop").count() as u64;
        let latency_spike_count = events
            .iter()
            .filter(|event| event.kind == "latency-spike")
            .count() as u64;
        let jitter_spike_count = events
            .iter()
            .filter(|event| event.kind == "jitter-spike")
            .count() as u64;
        let incident_count = events.len();
        if events.len() > 200 {
            events.drain(0..events.len() - 200);
        }
        let reported_incident_count = events.len();
        let expected = ((to_ms - from_ms + 14_999) / 15_000) as u64;
        let measured = report.summary.measured_samples;
        let networks = samples
            .iter()
            .filter_map(|sample| sample.network_key.as_deref())
            .collect::<BTreeSet<_>>()
            .len() as u64;
        let network_label = selected.as_deref().and_then(|key| {
            samples.iter().find_map(|sample| {
                (sample.network_key.as_deref() == Some(key))
                    .then(|| sample.network_label.clone())
                    .flatten()
            })
        });
        Ok(companion::EvidenceReportData {
            from_ms,
            to_ms,
            generated_at_ms: report.generated_at_ms,
            timezone: "local time on this computer".into(),
            coverage_percent: if expected == 0 {
                0.0
            } else {
                measured as f64 * 100.0 / expected as f64
            },
            sample_count: measured,
            missing_sample_count: expected.saturating_sub(measured),
            drop_count,
            latency_spike_count,
            jitter_spike_count,
            network_count: networks,
            network_label,
            events,
            notes: {
                let mut notes = vec![
                    report.method,
                    "Coverage compares measured samples with 15-second monitoring opportunities in the chosen period.".into(),
                    "A failed internet check can have causes outside the provider, including local Wi-Fi, routing, a firewall, or target availability.".into(),
                    "Network identifiers are redacted by default. Wi-Fi passwords are never stored in connection history or included in this report.".into(),
                ];
                if incident_count > reported_incident_count {
                    notes.push(format!(
                        "The incident table shows the latest {} of {incident_count} recorded incidents in this period; the summary counts include all of them.",
                        reported_incident_count
                    ));
                }
                notes
            },
        })
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn measured(
        timestamp_ms: i64,
        network: &str,
        internet_ms: i64,
    ) -> observations::ObservationSample {
        observations::ObservationSample {
            timestamp_ms,
            network_key: Some(network.into()),
            network_label: Some(network.into()),
            network_kind: Some("wifi".into()),
            session_id: Some("session".into()),
            access_point_fingerprint: None,
            gateway_ms: Some(5),
            internet_ms: Some(internet_ms),
            jitter_ms: Some(2.0),
            signal_dbm: None,
            status: observations::SampleStatus::Measured,
            missing_reason: None,
        }
    }

    #[test]
    fn event_thresholds_do_not_compare_different_network_baselines() {
        let mut samples: Vec<_> = (0..100)
            .map(|index| measured(1_000 + index * 15_000, "network-a", 20))
            .collect();
        samples.extend((100..120).map(|index| measured(1_000 + index * 15_000, "network-b", 200)));
        let events = connection_events(&samples, &[], &[]);
        assert!(events.iter().all(|event| event.kind != "latency-spike"));
    }

    #[test]
    fn evidence_event_details_have_identifier_safe_measurements() {
        let mut samples: Vec<_> = (0..20)
            .map(|index| measured(1_000 + index * 15_000, "network-a", 20))
            .collect();
        let mut drop = measured(400_000, "network-a", 20);
        drop.internet_ms = None;
        drop.status = observations::SampleStatus::Partial;
        samples.push(drop);
        let events = connection_events(&samples, &[], &[]);
        let event = events.iter().find(|event| event.kind == "drop").unwrap();
        assert_eq!(
            event.redacted_detail.as_deref(),
            Some(event.detail.as_str())
        );
        assert!(event.detail.contains("gateway answered"));
    }

    #[test]
    fn event_builder_keeps_complete_counts_for_evidence_summaries() {
        let samples: Vec<_> = (0..220)
            .map(|index| {
                let mut sample = measured(1_000 + index * 15_000, "network-a", 20);
                sample.internet_ms = None;
                sample.status = observations::SampleStatus::Partial;
                sample
            })
            .collect();
        let events = connection_events(&samples, &[], &[]);
        assert_eq!(
            events.iter().filter(|event| event.kind == "drop").count(),
            220
        );
    }
}
