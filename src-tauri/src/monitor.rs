use serde::{Deserialize, Serialize};

use crate::analysis::{
    AlertCategories, AlertEvent, AlertInput, AlertState, evaluate_alerts, robust_baseline,
};
use crate::observations::{ObservationDb, ObservationSample, SampleStatus, UsageUpdate};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterCheckpoint {
    pub boot_id: String,
    pub network_key: String,
    pub interface_key: String,
    pub received_bytes: u64,
    pub sent_bytes: u64,
    pub timestamp_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterObservation {
    pub boot_id: String,
    pub network_key: String,
    pub network_label: String,
    pub network_kind: String,
    pub interface_key: String,
    pub received_bytes: u64,
    pub sent_bytes: u64,
    pub timestamp_ms: i64,
    pub cycle_start_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveObservation {
    pub timestamp_ms: i64,
    pub boot_id: String,
    pub continuity_generation: u64,
    pub network_id: Option<String>,
    pub display_label: Option<String>,
    pub network_type: Option<String>,
    pub interface_id: Option<String>,
    pub interface_name: Option<String>,
    pub access_point_fingerprint: Option<String>,
    pub signal_dbm: Option<i32>,
    pub gateway_ms: Option<i64>,
    pub internet_ms: Option<i64>,
    pub jitter_ms: Option<f64>,
    pub received_bytes: Option<u64>,
    pub sent_bytes: Option<u64>,
    pub missing_reason: Option<String>,
    pub usage_cycle_start_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonitorConfig {
    pub history_enabled: bool,
    pub usage_enabled: bool,
    pub access_point_alerts_enabled: bool,
    pub behavior_alerts_enabled: bool,
    pub maximum_counter_gap_ms: i64,
    pub alert_baseline_window_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorOutcome {
    pub sample_recorded: bool,
    pub usage: Option<UsageUpdate>,
    pub alerts: Vec<AlertEvent>,
}

pub fn record_active_observation(
    database: &ObservationDb,
    observation: &ActiveObservation,
    config: MonitorConfig,
) -> Result<MonitorOutcome, String> {
    if observation.timestamp_ms <= 0 {
        return Err("Active observation timestamp is invalid".into());
    }
    let connected = observation.network_id.is_some();
    let status = if !connected {
        SampleStatus::Disconnected
    } else if observation.gateway_ms.is_some() && observation.internet_ms.is_some() {
        SampleStatus::Measured
    } else if observation.gateway_ms.is_some()
        || observation.internet_ms.is_some()
        || observation.signal_dbm.is_some()
    {
        SampleStatus::Partial
    } else {
        SampleStatus::Missing
    };
    let missing_reason = if status == SampleStatus::Missing {
        Some(
            observation
                .missing_reason
                .clone()
                .unwrap_or_else(|| "measurement unavailable".into()),
        )
    } else {
        observation.missing_reason.clone()
    };
    let sample = ObservationSample {
        timestamp_ms: observation.timestamp_ms,
        network_key: observation.network_id.clone(),
        network_label: observation.display_label.clone(),
        network_kind: observation.network_type.clone(),
        session_id: connected.then(|| {
            format!(
                "{}:{}",
                observation.boot_id, observation.continuity_generation
            )
        }),
        access_point_fingerprint: observation.access_point_fingerprint.clone(),
        gateway_ms: observation.gateway_ms,
        internet_ms: observation.internet_ms,
        jitter_ms: observation.jitter_ms,
        signal_dbm: observation.signal_dbm,
        status,
        missing_reason,
    };
    if config.history_enabled {
        database.record_sample(&sample)?;
    }
    let usage = if config.usage_enabled {
        match (
            observation.network_id.as_deref(),
            observation.display_label.as_deref(),
            observation.network_type.as_deref(),
            observation.interface_id.as_deref(),
            observation.received_bytes,
            observation.sent_bytes,
        ) {
            (
                Some(network),
                Some(label),
                Some(kind),
                Some(interface),
                Some(received),
                Some(sent),
            ) => Some(database.update_usage(
                &CounterObservation {
                    boot_id: observation.boot_id.clone(),
                    network_key: network.into(),
                    network_label: label.into(),
                    network_kind: kind.into(),
                    interface_key: interface.into(),
                    received_bytes: received,
                    sent_bytes: sent,
                    timestamp_ms: observation.timestamp_ms,
                    cycle_start_ms: observation.usage_cycle_start_ms,
                },
                config.maximum_counter_gap_ms,
            )?),
            _ => None,
        }
    } else {
        None
    };
    let mut alerts = Vec::new();
    if config.access_point_alerts_enabled || config.behavior_alerts_enabled {
        if let (Some(network), Some(label)) = (
            observation.network_id.as_deref(),
            observation.display_label.as_deref(),
        ) {
            let start = observation
                .timestamp_ms
                .saturating_sub(config.alert_baseline_window_ms.max(1));
            let latency: Vec<_> = if config.behavior_alerts_enabled {
                database
                    .samples_between(start, observation.timestamp_ms)?
                    .iter()
                    .filter(|sample| {
                        sample.network_key.as_deref() == Some(network)
                            && sample.status == SampleStatus::Measured
                    })
                    .filter_map(|sample| sample.internet_ms.map(|value| value as f64))
                    .collect()
            } else {
                Vec::new()
            };
            let baseline = robust_baseline(&latency);
            let mut state = database
                .load_alert_state::<AlertState>(network)?
                .unwrap_or_default();
            alerts = evaluate_alerts(
                &mut state,
                &AlertInput {
                    timestamp_ms: observation.timestamp_ms,
                    network_label: label.into(),
                    access_point_fingerprint: observation.access_point_fingerprint.clone(),
                    internet_ms: observation.internet_ms,
                    baseline_sample_count: latency.len() as u64,
                    baseline_median_ms: baseline.map(|value| value.median),
                    baseline_mad_ms: baseline.map(|value| value.mad),
                },
                AlertCategories {
                    access_point: config.access_point_alerts_enabled,
                    behavior: config.behavior_alerts_enabled,
                },
            );
            database.save_alert_state(network, &state)?;
            for alert in &alerts {
                database.record_alert(
                    observation.timestamp_ms,
                    network,
                    &alert.category,
                    &alert.message,
                )?;
            }
        }
    }
    Ok(MonitorOutcome {
        sample_recorded: config.history_enabled,
        usage,
        alerts,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum CounterDelta {
    Baseline {
        reason: String,
    },
    Measured {
        received_bytes: u64,
        sent_bytes: u64,
    },
}

pub fn counter_delta(
    previous: Option<&CounterCheckpoint>,
    current: &CounterObservation,
    maximum_gap_ms: i64,
) -> CounterDelta {
    let Some(previous) = previous else {
        return CounterDelta::Baseline {
            reason: "first sample".into(),
        };
    };
    if previous.boot_id != current.boot_id {
        return CounterDelta::Baseline {
            reason: "system restarted".into(),
        };
    }
    if previous.network_key != current.network_key {
        return CounterDelta::Baseline {
            reason: "network changed".into(),
        };
    }
    if previous.interface_key != current.interface_key {
        return CounterDelta::Baseline {
            reason: "adapter changed".into(),
        };
    }
    let elapsed = current.timestamp_ms.saturating_sub(previous.timestamp_ms);
    if elapsed <= 0 || elapsed > maximum_gap_ms.max(1) {
        return CounterDelta::Baseline {
            reason: "measurement gap".into(),
        };
    }
    if current.received_bytes < previous.received_bytes || current.sent_bytes < previous.sent_bytes
    {
        return CounterDelta::Baseline {
            reason: "counter reset".into(),
        };
    }
    CounterDelta::Measured {
        received_bytes: current.received_bytes - previous.received_bytes,
        sent_bytes: current.sent_bytes - previous.sent_bytes,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MonitoringPlan {
    pub connection_probe_seconds: u64,
    pub counter_seconds: Option<u64>,
    pub latency_seconds: Option<u64>,
    pub process_scan_seconds: Option<u64>,
}

pub fn monitoring_plan(
    visible: bool,
    history_enabled: bool,
    usage_enabled: bool,
    context_enabled: bool,
    process_detection_enabled: bool,
) -> MonitoringPlan {
    MonitoringPlan {
        connection_probe_seconds: if visible {
            2
        } else if context_enabled {
            5
        } else if history_enabled || usage_enabled {
            15
        } else {
            60
        },
        counter_seconds: if visible {
            Some(1)
        } else if usage_enabled {
            Some(10)
        } else {
            None
        },
        latency_seconds: if visible {
            Some(2)
        } else if history_enabled {
            Some(15)
        } else {
            None
        },
        process_scan_seconds: process_detection_enabled.then_some(5),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn observation() -> CounterObservation {
        CounterObservation {
            boot_id: "boot-a".into(),
            network_key: "network-a".into(),
            network_label: "Studio".into(),
            network_kind: "wifi".into(),
            interface_key: "adapter-a".into(),
            received_bytes: 1_500,
            sent_bytes: 2_500,
            timestamp_ms: 20_000,
            cycle_start_ms: 0,
        }
    }

    fn checkpoint() -> CounterCheckpoint {
        CounterCheckpoint {
            boot_id: "boot-a".into(),
            network_key: "network-a".into(),
            interface_key: "adapter-a".into(),
            received_bytes: 1_000,
            sent_bytes: 2_000,
            timestamp_ms: 10_000,
        }
    }

    #[test]
    fn only_continuous_monotonic_counters_produce_usage() {
        assert_eq!(
            counter_delta(Some(&checkpoint()), &observation(), 15_000),
            CounterDelta::Measured {
                received_bytes: 500,
                sent_bytes: 500
            }
        );
        let mut changed = observation();
        changed.network_key = "network-b".into();
        assert!(matches!(
            counter_delta(Some(&checkpoint()), &changed, 15_000),
            CounterDelta::Baseline { ref reason } if reason == "network changed"
        ));
        changed = observation();
        changed.interface_key = "adapter-b".into();
        assert!(matches!(
            counter_delta(Some(&checkpoint()), &changed, 15_000),
            CounterDelta::Baseline { ref reason } if reason == "adapter changed"
        ));
        changed = observation();
        changed.received_bytes = 10;
        assert!(matches!(
            counter_delta(Some(&checkpoint()), &changed, 15_000),
            CounterDelta::Baseline { ref reason } if reason == "counter reset"
        ));
    }

    #[test]
    fn restart_and_long_gap_are_never_attributed() {
        let mut current = observation();
        current.boot_id = "boot-b".into();
        assert!(matches!(
            counter_delta(Some(&checkpoint()), &current, 15_000),
            CounterDelta::Baseline { ref reason } if reason == "system restarted"
        ));
        current = observation();
        current.timestamp_ms = 60_000;
        assert!(matches!(
            counter_delta(Some(&checkpoint()), &current, 15_000),
            CounterDelta::Baseline { ref reason } if reason == "measurement gap"
        ));
    }

    #[test]
    fn tray_plan_skips_every_disabled_feature() {
        assert_eq!(
            monitoring_plan(false, false, false, false, false),
            MonitoringPlan {
                connection_probe_seconds: 60,
                counter_seconds: None,
                latency_seconds: None,
                process_scan_seconds: None,
            }
        );
        assert_eq!(
            monitoring_plan(false, true, true, true, true).latency_seconds,
            Some(15)
        );
        assert_eq!(
            monitoring_plan(false, true, false, false, false).connection_probe_seconds,
            15
        );
    }
}
