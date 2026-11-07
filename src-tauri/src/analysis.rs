use crate::observations::{DnsEvidence, ObservationSample, SampleStatus};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestFinding {
    pub level: String,
    pub title: String,
    pub detail: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyDigest {
    pub start_ms: i64,
    pub end_ms: i64,
    pub enough_data: bool,
    pub sample_count: u64,
    pub measured_count: u64,
    pub monitored_days: u64,
    pub coverage_ratio: f64,
    pub median_internet_ms: Option<f64>,
    pub p95_internet_ms: Option<f64>,
    pub p95_jitter_ms: Option<f64>,
    pub drop_count: u64,
    pub spike_count: u64,
    pub findings: Vec<DigestFinding>,
}

pub fn weekly_digest(
    samples: &[ObservationSample],
    start_ms: i64,
    end_ms: i64,
    dns_by_network: &HashMap<String, DnsEvidence>,
) -> WeeklyDigest {
    let in_range: Vec<_> = samples
        .iter()
        .filter(|sample| sample.timestamp_ms >= start_ms && sample.timestamp_ms < end_ms)
        .collect();
    let measured: Vec<_> = in_range
        .iter()
        .copied()
        .filter(|sample| sample.status == SampleStatus::Measured)
        .collect();
    let days: BTreeSet<_> = measured
        .iter()
        .map(|sample| sample.timestamp_ms.div_euclid(86_400_000))
        .collect();
    let internet: Vec<f64> = measured
        .iter()
        .filter_map(|sample| sample.internet_ms.map(|value| value as f64))
        .collect();
    let jitter: Vec<f64> = measured
        .iter()
        .filter_map(|sample| sample.jitter_ms)
        .collect();
    let mut latency_by_network: HashMap<&str, Vec<f64>> = HashMap::new();
    for sample in &measured {
        if let (Some(network), Some(value)) = (sample.network_key.as_deref(), sample.internet_ms) {
            latency_by_network
                .entry(network)
                .or_default()
                .push(value as f64);
        }
    }
    let latency_thresholds: HashMap<&str, f64> = latency_by_network
        .into_iter()
        .filter_map(|(network, values)| {
            robust_baseline(&values).map(|baseline| (network, latency_threshold(baseline)))
        })
        .collect();
    let spike_count = measured
        .iter()
        .filter(|sample| {
            sample
                .network_key
                .as_deref()
                .and_then(|network| latency_thresholds.get(network))
                .zip(sample.internet_ms)
                .is_some_and(|(threshold, value)| value as f64 >= *threshold)
        })
        .count() as u64;
    let drop_count = in_range
        .iter()
        .filter(|sample| sample.gateway_ms.is_some() && sample.internet_ms.is_none())
        .count() as u64;
    const EXPECTED_INTERVAL_MS: i64 = 15_000;
    let expected_samples = end_ms
        .saturating_sub(start_ms)
        .saturating_add(EXPECTED_INTERVAL_MS - 1)
        / EXPECTED_INTERVAL_MS;
    let coverage_ratio = if expected_samples <= 0 {
        0.0
    } else {
        (measured.len() as f64 / expected_samples as f64).min(1.0)
    };
    let observed_span_ms = measured
        .iter()
        .map(|sample| sample.timestamp_ms)
        .min()
        .zip(measured.iter().map(|sample| sample.timestamp_ms).max())
        .map(|(first, last)| last.saturating_sub(first))
        .unwrap_or(0);
    let enough_data = measured.len() >= 100
        && days.len() >= 2
        && observed_span_ms >= 6 * 60 * 60 * 1000
        && coverage_ratio >= 0.25;
    let mut findings = Vec::new();
    if !enough_data {
        findings.push(DigestFinding {
            level: "insufficient".into(),
            title: "Not enough measured history yet".into(),
            detail: format!(
                "NetMask has {} measured samples across {} day(s). It needs broader coverage before describing a weekly pattern.",
                measured.len(),
                days.len()
            ),
            suggestion: None,
        });
    } else {
        if drop_count > 0 {
            findings.push(DigestFinding {
                level: if drop_count >= 3 { "attention" } else { "note" }.into(),
                title: format!("{drop_count} measured internet drop(s)"),
                detail: "The gateway still answered while the internet target did not. Missing samples were not counted as drops.".into(),
                suggestion: Some("Open the affected times in History before contacting your provider.".into()),
            });
        }
        if spike_count > 0 {
            findings.push(DigestFinding {
                level: if spike_count >= 5 { "attention" } else { "note" }.into(),
                title: format!("{spike_count} unusual latency sample(s)"),
                detail: "These samples were high relative to this network's measured baseline and an absolute latency floor.".into(),
                suggestion: None,
            });
        }
        if drop_count == 0 && spike_count == 0 {
            findings.push(DigestFinding {
                level: "good".into(),
                title: "No clear reliability problem in the measured week".into(),
                detail: "The available samples did not show an internet drop or sustained latency pattern.".into(),
                suggestion: None,
            });
        }
        if let Some(suggestion) = dns_suggestion(&measured, dns_by_network) {
            findings.push(suggestion);
        }
    }
    WeeklyDigest {
        start_ms,
        end_ms,
        enough_data,
        sample_count: in_range.len() as u64,
        measured_count: measured.len() as u64,
        monitored_days: days.len() as u64,
        coverage_ratio,
        median_internet_ms: percentile(&internet, 0.5),
        p95_internet_ms: percentile(&internet, 0.95),
        p95_jitter_ms: percentile(&jitter, 0.95),
        drop_count,
        spike_count,
        findings,
    }
}

fn dns_suggestion(
    samples: &[&ObservationSample],
    evidence: &HashMap<String, DnsEvidence>,
) -> Option<DigestFinding> {
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for key in samples
        .iter()
        .filter_map(|sample| sample.network_key.as_deref())
    {
        *counts.entry(key).or_default() += 1;
    }
    let network = counts.into_iter().max_by_key(|(_, count)| *count)?.0;
    let evidence = evidence.get(network)?;
    let current = evidence.current_latency_ms?;
    let improvement = current.saturating_sub(evidence.candidate_latency_ms);
    if improvement < 10 || evidence.candidate_latency_ms * 100 > current * 80 {
        return None;
    }
    Some(DigestFinding {
        level: "suggestion".into(),
        title: format!(
            "{} was faster in your DNS comparison",
            evidence.candidate_name
        ),
        detail: format!(
            "The user-requested comparison measured {} at {} ms and {} at {} ms. This is a point-in-time result, not a universal guarantee.",
            evidence.current_name, current, evidence.candidate_name, evidence.candidate_latency_ms
        ),
        suggestion: Some(
            "Repeat the comparison before changing DNS if network conditions have changed.".into(),
        ),
    })
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RobustBaseline {
    pub median: f64,
    pub mad: f64,
}

pub fn robust_baseline(values: &[f64]) -> Option<RobustBaseline> {
    if values.len() < 20 {
        return None;
    }
    let median = percentile(values, 0.5)?;
    let deviations: Vec<_> = values.iter().map(|value| (value - median).abs()).collect();
    Some(RobustBaseline {
        median,
        mad: percentile(&deviations, 0.5).unwrap_or(0.0),
    })
}

pub fn latency_threshold(baseline: RobustBaseline) -> f64 {
    100.0_f64.max(baseline.median + (baseline.mad * 3.0).max(30.0))
}

pub fn percentile(values: &[f64], percentile: f64) -> Option<f64> {
    if values.is_empty() || !(0.0..=1.0).contains(&percentile) {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(f64::total_cmp);
    let rank = ((sorted.len() - 1) as f64 * percentile).ceil() as usize;
    Some(sorted[rank])
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlertState {
    pub current_access_point: Option<String>,
    pub candidate_access_point: Option<String>,
    pub candidate_access_point_samples: u8,
    pub last_access_point_alert_ms: Option<i64>,
    pub high_latency_samples: u8,
    pub recovery_samples: u8,
    pub latency_alert_latched: bool,
    pub last_latency_alert_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertInput {
    pub timestamp_ms: i64,
    pub network_label: String,
    pub access_point_fingerprint: Option<String>,
    pub internet_ms: Option<i64>,
    pub baseline_sample_count: u64,
    pub baseline_median_ms: Option<f64>,
    pub baseline_mad_ms: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertEvent {
    pub category: String,
    pub title: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AlertCategories {
    pub access_point: bool,
    pub behavior: bool,
}

pub fn evaluate_alerts(
    state: &mut AlertState,
    input: &AlertInput,
    categories: AlertCategories,
) -> Vec<AlertEvent> {
    const ACCESS_POINT_CONFIRMATIONS: u8 = 3;
    const ACCESS_POINT_COOLDOWN_MS: i64 = 24 * 60 * 60 * 1000;
    const LATENCY_COOLDOWN_MS: i64 = 6 * 60 * 60 * 1000;
    let mut events = Vec::new();
    if categories.access_point
        && let Some(access_point) = input.access_point_fingerprint.as_deref()
    {
        match state.current_access_point.as_deref() {
            None => state.current_access_point = Some(access_point.into()),
            Some(current) if current == access_point => {
                state.candidate_access_point = None;
                state.candidate_access_point_samples = 0;
            }
            Some(_) => {
                if state.candidate_access_point.as_deref() == Some(access_point) {
                    state.candidate_access_point_samples =
                        state.candidate_access_point_samples.saturating_add(1);
                } else {
                    state.candidate_access_point = Some(access_point.into());
                    state.candidate_access_point_samples = 1;
                }
                if state.candidate_access_point_samples >= ACCESS_POINT_CONFIRMATIONS {
                    let cooldown_complete = state.last_access_point_alert_ms.is_none_or(|last| {
                        input.timestamp_ms.saturating_sub(last) >= ACCESS_POINT_COOLDOWN_MS
                    });
                    state.current_access_point = Some(access_point.into());
                    state.candidate_access_point = None;
                    state.candidate_access_point_samples = 0;
                    if cooldown_complete {
                        state.last_access_point_alert_ms = Some(input.timestamp_ms);
                        events.push(AlertEvent {
                            category: "access_point".into(),
                            title: "Access point changed".into(),
                            message: format!("{} is using a different access point. This can be normal on mesh networks.", input.network_label),
                        });
                    }
                }
            }
        }
    }
    let baseline = input
        .baseline_median_ms
        .zip(input.baseline_mad_ms)
        .map(|(median, mad)| RobustBaseline { median, mad });
    if categories.behavior && input.baseline_sample_count >= 100 {
        if let (Some(value), Some(baseline)) = (input.internet_ms, baseline) {
            if value as f64 >= latency_threshold(baseline) {
                state.high_latency_samples = state.high_latency_samples.saturating_add(1);
                state.recovery_samples = 0;
                let cooldown_complete = state.last_latency_alert_ms.is_none_or(|last| {
                    input.timestamp_ms.saturating_sub(last) >= LATENCY_COOLDOWN_MS
                });
                if state.high_latency_samples >= 3
                    && !state.latency_alert_latched
                    && cooldown_complete
                {
                    state.latency_alert_latched = true;
                    state.last_latency_alert_ms = Some(input.timestamp_ms);
                    events.push(AlertEvent {
                        category: "latency".into(),
                        title: "Connection response changed".into(),
                        message: format!(
                            "{} has been slower than its usual measured range for several checks.",
                            input.network_label
                        ),
                    });
                }
            } else {
                state.high_latency_samples = 0;
                state.recovery_samples = state.recovery_samples.saturating_add(1);
                if state.recovery_samples >= 3 {
                    state.latency_alert_latched = false;
                }
            }
        }
    }
    events
}

#[cfg(test)]
mod tests {
    use super::*;

    fn measured(timestamp_ms: i64, internet_ms: i64) -> ObservationSample {
        ObservationSample {
            timestamp_ms,
            network_key: Some("network-a".into()),
            network_label: Some("Studio".into()),
            network_kind: Some("wifi".into()),
            session_id: Some("session".into()),
            access_point_fingerprint: Some("ap-a".into()),
            gateway_ms: Some(5),
            internet_ms: Some(internet_ms),
            jitter_ms: Some(2.0),
            signal_dbm: Some(-50),
            status: SampleStatus::Measured,
            missing_reason: None,
        }
    }

    fn dense_week_samples(count: usize) -> Vec<ObservationSample> {
        (0..count)
            .map(|index| measured(index as i64 * 15_000, 20))
            .collect()
    }

    #[test]
    fn digest_is_honest_when_evidence_is_thin() {
        let samples = vec![measured(1_000, 20); 10];
        let digest = weekly_digest(&samples, 0, 604_800_000, &HashMap::new());
        assert!(!digest.enough_data);
        assert_eq!(digest.findings[0].level, "insufficient");
        assert_eq!(digest.drop_count, 0);
    }

    #[test]
    fn missing_samples_never_become_drops() {
        let mut samples = dense_week_samples(12_000);
        samples[5].status = SampleStatus::Missing;
        samples[5].gateway_ms = None;
        samples[5].internet_ms = None;
        samples[5].missing_reason = Some("computer asleep".into());
        let digest = weekly_digest(&samples, 0, 604_800_000, &HashMap::new());
        assert!(digest.enough_data);
        assert_eq!(digest.drop_count, 0);
    }

    #[test]
    fn clustered_samples_do_not_claim_weekly_coverage() {
        let samples: Vec<_> = (0..100).map(|index| measured(index * 36_000, 20)).collect();
        let digest = weekly_digest(&samples, 0, 604_800_000, &HashMap::new());
        assert!(!digest.enough_data);
        assert!(digest.coverage_ratio < 0.01);
    }

    #[test]
    fn dns_finding_requires_a_large_user_measured_improvement() {
        let samples = dense_week_samples(12_000);
        let mut evidence = HashMap::new();
        evidence.insert(
            "network-a".into(),
            DnsEvidence {
                timestamp_ms: 1,
                network_key: "network-a".into(),
                current_name: "Automatic".into(),
                current_latency_ms: Some(40),
                candidate_name: "Example DNS".into(),
                candidate_latency_ms: 20,
            },
        );
        let digest = weekly_digest(&samples, 0, 604_800_000, &evidence);
        assert!(
            digest
                .findings
                .iter()
                .any(|finding| finding.title.contains("Example DNS"))
        );
        evidence.get_mut("network-a").unwrap().candidate_latency_ms = 35;
        let digest = weekly_digest(&samples, 0, 604_800_000, &evidence);
        assert!(
            !digest
                .findings
                .iter()
                .any(|finding| finding.title.contains("Example DNS"))
        );
    }

    #[test]
    fn digest_compares_latency_with_each_networks_own_baseline() {
        let mut samples: Vec<_> = (0..10_000)
            .map(|index| measured(index * 15_000, 20))
            .collect();
        samples.extend((10_000..12_000).map(|index| {
            let mut sample = measured(index * 15_000, 200);
            sample.network_key = Some("network-b".into());
            sample.network_label = Some("Provider B".into());
            sample
        }));
        let digest = weekly_digest(&samples, 0, 604_800_000, &HashMap::new());
        assert!(digest.enough_data);
        assert_eq!(digest.spike_count, 0);
    }

    #[test]
    fn access_point_alert_requires_three_confirmations_and_cooldown() {
        let mut state = AlertState {
            current_access_point: Some("ap-a".into()),
            ..Default::default()
        };
        for timestamp in [1_000, 2_000] {
            assert!(
                evaluate_alerts(
                    &mut state,
                    &AlertInput {
                        timestamp_ms: timestamp,
                        network_label: "Studio".into(),
                        access_point_fingerprint: Some("ap-b".into()),
                        internet_ms: Some(20),
                        baseline_sample_count: 0,
                        baseline_median_ms: None,
                        baseline_mad_ms: None
                    },
                    AlertCategories {
                        access_point: true,
                        behavior: true,
                    }
                )
                .is_empty()
            );
        }
        let events = evaluate_alerts(
            &mut state,
            &AlertInput {
                timestamp_ms: 3_000,
                network_label: "Studio".into(),
                access_point_fingerprint: Some("ap-b".into()),
                internet_ms: Some(20),
                baseline_sample_count: 0,
                baseline_median_ms: None,
                baseline_mad_ms: None,
            },
            AlertCategories {
                access_point: true,
                behavior: true,
            },
        );
        assert_eq!(events.len(), 1);
        assert!(events[0].message.contains("can be normal"));
    }

    #[test]
    fn behavior_alert_requires_baseline_and_sustained_change() {
        let mut state = AlertState::default();
        let input = |timestamp_ms| AlertInput {
            timestamp_ms,
            network_label: "Studio".into(),
            access_point_fingerprint: None,
            internet_ms: Some(180),
            baseline_sample_count: 100,
            baseline_median_ms: Some(20.0),
            baseline_mad_ms: Some(2.0),
        };
        let categories = AlertCategories {
            access_point: true,
            behavior: true,
        };
        assert!(evaluate_alerts(&mut state, &input(1_000), categories).is_empty());
        assert!(evaluate_alerts(&mut state, &input(2_000), categories).is_empty());
        assert_eq!(
            evaluate_alerts(&mut state, &input(3_000), categories).len(),
            1
        );
        assert!(evaluate_alerts(&mut state, &input(4_000), categories).is_empty());
    }

    #[test]
    fn disabled_alert_categories_do_not_change_state_or_emit() {
        let mut state = AlertState {
            current_access_point: Some("ap-a".into()),
            ..Default::default()
        };
        let original = state.clone();
        let events = evaluate_alerts(
            &mut state,
            &AlertInput {
                timestamp_ms: 1_000,
                network_label: "Studio".into(),
                access_point_fingerprint: Some("ap-b".into()),
                internet_ms: Some(500),
                baseline_sample_count: 200,
                baseline_median_ms: Some(20.0),
                baseline_mad_ms: Some(2.0),
            },
            AlertCategories {
                access_point: false,
                behavior: false,
            },
        );
        assert!(events.is_empty());
        assert_eq!(state, original);
    }
}
