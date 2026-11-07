use crate::analysis::{latency_threshold, percentile, robust_baseline};
use crate::observations::{ObservationGap, ObservationSample, SampleStatus};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPrivacy {
    pub include_network_labels: bool,
    pub include_access_point_identifiers: bool,
}

impl Default for ReportPrivacy {
    fn default() -> Self {
        Self {
            include_network_labels: false,
            include_access_point_identifiers: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSummary {
    pub total_samples: u64,
    pub measured_samples: u64,
    pub partial_samples: u64,
    pub missing_samples: u64,
    pub disconnected_samples: u64,
    pub coverage_ratio: f64,
    pub median_gateway_ms: Option<f64>,
    pub p95_gateway_ms: Option<f64>,
    pub median_internet_ms: Option<f64>,
    pub p95_internet_ms: Option<f64>,
    pub p95_jitter_ms: Option<f64>,
    pub measured_drop_count: u64,
    pub latency_spike_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceIncident {
    pub timestamp_ms: i64,
    pub kind: String,
    pub network: String,
    pub access_point: Option<String>,
    pub gateway_ms: Option<i64>,
    pub internet_ms: Option<i64>,
    pub detail: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceGap {
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEvidence {
    pub generated_at_ms: i64,
    pub period_start_ms: i64,
    pub period_end_ms: i64,
    pub method: String,
    pub identifiers_redacted: bool,
    pub summary: EvidenceSummary,
    pub incidents: Vec<EvidenceIncident>,
    pub gaps: Vec<EvidenceGap>,
    pub limitations: Vec<String>,
}

pub fn build_provider_evidence(
    samples: &[ObservationSample],
    gaps: &[ObservationGap],
    generated_at_ms: i64,
    period_start_ms: i64,
    period_end_ms: i64,
    privacy: ReportPrivacy,
) -> Result<ProviderEvidence, String> {
    if generated_at_ms <= 0 || period_end_ms <= period_start_ms {
        return Err("Evidence report period is invalid".into());
    }
    let selected: Vec<_> = samples
        .iter()
        .filter(|sample| {
            sample.timestamp_ms >= period_start_ms && sample.timestamp_ms < period_end_ms
        })
        .collect();
    let measured: Vec<_> = selected
        .iter()
        .copied()
        .filter(|sample| sample.status == SampleStatus::Measured)
        .collect();
    let gateways: Vec<_> = measured
        .iter()
        .filter_map(|sample| sample.gateway_ms.map(|value| value as f64))
        .collect();
    let internet: Vec<_> = measured
        .iter()
        .filter_map(|sample| sample.internet_ms.map(|value| value as f64))
        .collect();
    let jitter: Vec<_> = measured
        .iter()
        .filter_map(|sample| sample.jitter_ms)
        .collect();
    let baselines = network_baselines(&selected);
    let mut aliases: HashMap<&str, String> = HashMap::new();
    let mut next_alias = 1usize;
    let mut incidents = Vec::new();
    for sample in &selected {
        let network_key = sample.network_key.as_deref().unwrap_or("unidentified");
        let network = if privacy.include_network_labels {
            sample
                .network_label
                .clone()
                .unwrap_or_else(|| "Unidentified network".into())
        } else {
            aliases
                .entry(network_key)
                .or_insert_with(|| {
                    let value = format!("Network {next_alias}");
                    next_alias += 1;
                    value
                })
                .clone()
        };
        let access_point = sample.access_point_fingerprint.as_ref().map(|fingerprint| {
            if privacy.include_access_point_identifiers {
                fingerprint.clone()
            } else {
                "Redacted access point".into()
            }
        });
        if sample.gateway_ms.is_some() && sample.internet_ms.is_none() {
            incidents.push(EvidenceIncident {
                timestamp_ms: sample.timestamp_ms,
                kind: "internet_drop".into(),
                network: network.clone(),
                access_point: access_point.clone(),
                gateway_ms: sample.gateway_ms,
                internet_ms: None,
                detail: "The local gateway answered, but the configured internet target did not answer this check.".into(),
            });
        }
        if let (Some(value), Some(baseline)) = (sample.internet_ms, baselines.get(network_key)) {
            if value as f64 >= latency_threshold(*baseline) {
                incidents.push(EvidenceIncident {
                    timestamp_ms: sample.timestamp_ms,
                    kind: "latency_spike".into(),
                    network,
                    access_point,
                    gateway_ms: sample.gateway_ms,
                    internet_ms: Some(value),
                    detail: format!("Internet response was {value} ms, above this network's measured baseline threshold."),
                });
            }
        }
    }
    let measured_drop_count = incidents
        .iter()
        .filter(|incident| incident.kind == "internet_drop")
        .count() as u64;
    let latency_spike_count = incidents
        .iter()
        .filter(|incident| incident.kind == "latency_spike")
        .count() as u64;
    let total = selected.len() as u64;
    let measured_count = measured.len() as u64;
    Ok(ProviderEvidence {
        generated_at_ms,
        period_start_ms,
        period_end_ms,
        method: "Local timestamped gateway and internet response observations. Nullable values remain unavailable; gaps are reported separately.".into(),
        identifiers_redacted: !privacy.include_network_labels || !privacy.include_access_point_identifiers,
        summary: EvidenceSummary {
            total_samples: total,
            measured_samples: measured_count,
            partial_samples: selected.iter().filter(|sample| sample.status == SampleStatus::Partial).count() as u64,
            missing_samples: selected.iter().filter(|sample| sample.status == SampleStatus::Missing).count() as u64,
            disconnected_samples: selected.iter().filter(|sample| sample.status == SampleStatus::Disconnected).count() as u64,
            coverage_ratio: if total == 0 { 0.0 } else { measured_count as f64 / total as f64 },
            median_gateway_ms: percentile(&gateways, 0.5),
            p95_gateway_ms: percentile(&gateways, 0.95),
            median_internet_ms: percentile(&internet, 0.5),
            p95_internet_ms: percentile(&internet, 0.95),
            p95_jitter_ms: percentile(&jitter, 0.95),
            measured_drop_count,
            latency_spike_count,
        },
        incidents,
        gaps: gaps.iter().filter(|gap| gap.start_ms < period_end_ms && gap.end_ms.unwrap_or(period_end_ms) > period_start_ms).map(|gap| EvidenceGap { start_ms: gap.start_ms.max(period_start_ms), end_ms: gap.end_ms.map(|end| end.min(period_end_ms)), reason: gap.reason.clone() }).collect(),
        limitations: vec![
            "This report describes only checks NetMask actually recorded; it does not fill gaps or estimate missing samples.".into(),
            "A failed internet check can have causes outside the provider, including local Wi-Fi, routing, firewall, or target availability.".into(),
            "Data usage is not included in this evidence summary unless separately exported by the user.".into(),
            "Wi-Fi passwords are never read from connection history and cannot appear in this report.".into(),
        ],
    })
}

fn network_baselines(
    samples: &[&ObservationSample],
) -> HashMap<String, crate::analysis::RobustBaseline> {
    let mut values: HashMap<String, Vec<f64>> = HashMap::new();
    for sample in samples {
        if let (Some(network), Some(value)) = (sample.network_key.as_ref(), sample.internet_ms) {
            if sample.status == SampleStatus::Measured {
                values
                    .entry(network.clone())
                    .or_default()
                    .push(value as f64);
            }
        }
    }
    values
        .into_iter()
        .filter_map(|(network, values)| {
            robust_baseline(&values).map(|baseline| (network, baseline))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(
        timestamp_ms: i64,
        gateway_ms: Option<i64>,
        internet_ms: Option<i64>,
        status: SampleStatus,
    ) -> ObservationSample {
        ObservationSample {
            timestamp_ms,
            network_key: Some("raw-stable-id".into()),
            network_label: Some("Private home name".into()),
            network_kind: Some("wifi".into()),
            session_id: Some("session".into()),
            access_point_fingerprint: Some("raw-ap-fingerprint".into()),
            gateway_ms,
            internet_ms,
            jitter_ms: internet_ms.map(|_| 2.0),
            signal_dbm: Some(-50),
            status,
            missing_reason: (status == SampleStatus::Missing).then(|| "computer asleep".into()),
        }
    }

    #[test]
    fn report_redacts_identifiers_by_default_and_keeps_missing_values_missing() {
        let mut samples: Vec<_> = (0..25)
            .map(|index| {
                sample(
                    1_000 + index * 1_000,
                    Some(5),
                    Some(20),
                    SampleStatus::Measured,
                )
            })
            .collect();
        samples.push(sample(30_000, Some(5), None, SampleStatus::Partial));
        samples.push(sample(31_000, None, None, SampleStatus::Missing));
        let report =
            build_provider_evidence(&samples, &[], 40_000, 0, 40_000, ReportPrivacy::default())
                .unwrap();
        assert!(report.identifiers_redacted);
        assert_eq!(report.summary.measured_drop_count, 1);
        assert_eq!(report.summary.missing_samples, 1);
        let json = serde_json::to_string(&report).unwrap();
        assert!(!json.contains("Private home name"));
        assert!(!json.contains("raw-ap-fingerprint"));
        assert!(!json.to_ascii_lowercase().contains("\"password\":"));
    }

    #[test]
    fn explicit_identifier_choice_includes_only_observed_identifiers() {
        let samples: Vec<_> = (0..25)
            .map(|index| {
                sample(
                    1_000 + index * 1_000,
                    Some(5),
                    Some(if index == 24 { 200 } else { 20 }),
                    SampleStatus::Measured,
                )
            })
            .collect();
        let report = build_provider_evidence(
            &samples,
            &[],
            40_000,
            0,
            40_000,
            ReportPrivacy {
                include_network_labels: true,
                include_access_point_identifiers: true,
            },
        )
        .unwrap();
        assert!(
            report
                .incidents
                .iter()
                .any(|incident| incident.network == "Private home name")
        );
        assert!(
            report
                .incidents
                .iter()
                .any(|incident| incident.access_point.as_deref() == Some("raw-ap-fingerprint"))
        );
    }

    #[test]
    fn gaps_are_clipped_to_the_chosen_period() {
        let report = build_provider_evidence(
            &[],
            &[ObservationGap {
                start_ms: 0,
                end_ms: Some(5_000),
                reason: "paused".into(),
            }],
            10_000,
            1_000,
            4_000,
            ReportPrivacy::default(),
        )
        .unwrap();
        assert_eq!(report.gaps[0].start_ms, 1_000);
        assert_eq!(report.gaps[0].end_ms, Some(4_000));
        assert_eq!(report.summary.coverage_ratio, 0.0);
    }
}
