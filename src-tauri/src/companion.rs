use crate::{operations, platform, settings};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const UI_STATE_FILE: &str = "ui-state.json";
const PRESETS_FILE: &str = "presets.json";
const PRESET_UNDO_FILE: &str = "preset-undo.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSession {
    pub active_view: String,
    pub journal_tab: String,
    pub history_range: String,
    pub selected_guid: Option<String>,
    pub main_scroll_top: f64,
}

impl Default for UiSession {
    fn default() -> Self {
        Self {
            active_view: "overview".into(),
            journal_tab: "history".into(),
            history_range: "24h".into(),
            selected_guid: None,
            main_scroll_top: 0.0,
        }
    }
}

impl UiSession {
    pub fn validate(self) -> Result<Self, String> {
        if !matches!(self.active_view.as_str(), "overview" | "journal")
            || !matches!(self.journal_tab.as_str(), "history" | "usage" | "week")
            || !matches!(self.history_range.as_str(), "24h" | "7d" | "30d")
            || !self.main_scroll_top.is_finite()
            || !(0.0..=10_000_000.0).contains(&self.main_scroll_top)
            || self.selected_guid.as_ref().is_some_and(|value| {
                value.is_empty() || value.len() > 512 || value.chars().any(char::is_control)
            })
        {
            return Err("The saved interface state is invalid".into());
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPreset {
    pub network_guid: String,
    pub enabled: bool,
    pub apply_mode: String,
    pub label: Option<String>,
    pub theme: String,
    pub bssid_visibility: String,
}

impl NetworkPreset {
    pub fn empty(network_guid: String) -> Self {
        Self {
            network_guid,
            enabled: false,
            apply_mode: "ask".into(),
            label: None,
            theme: "inherit".into(),
            bssid_visibility: "inherit".into(),
        }
    }

    pub fn validate(mut self) -> Result<Self, String> {
        if self.network_guid.is_empty()
            || self.network_guid.len() > 512
            || self.network_guid.chars().any(char::is_control)
        {
            return Err("The preset network identifier is invalid".into());
        }
        if !matches!(self.apply_mode.as_str(), "ask" | "automatic")
            || !matches!(self.theme.as_str(), "inherit" | "light" | "dark")
            || !matches!(
                self.bssid_visibility.as_str(),
                "inherit" | "partial" | "full"
            )
        {
            return Err("The network preset contains an unsupported option".into());
        }
        self.label = self
            .label
            .take()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
        if let Some(label) = self.label.as_deref() {
            settings::validate_display_name(label)?;
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetChange {
    pub label: String,
    pub before: String,
    pub after: String,
    pub requires_permission: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetPreview {
    pub network_guid: String,
    pub changes: Vec<PresetChange>,
    pub can_apply_automatically: bool,
    pub automatic_limit_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetApplication {
    pub applied: bool,
    pub summary: String,
    pub undo_token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryBucket {
    pub start_ms: i64,
    pub end_ms: i64,
    pub sample_count: u64,
    pub expected_sample_count: u64,
    pub missing_reason: Option<String>,
    pub gateway_median_ms: Option<f64>,
    pub internet_median_ms: Option<f64>,
    pub internet_p95_ms: Option<f64>,
    pub jitter_median_ms: Option<f64>,
    pub jitter_max_ms: Option<f64>,
    pub drop_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionEvent {
    pub id: String,
    pub at_ms: i64,
    pub kind: String,
    pub title: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redacted_detail: Option<String>,
    pub network_guid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySeries {
    pub from_ms: i64,
    pub to_ms: i64,
    pub network_guid: Option<String>,
    pub coverage_percent: f64,
    pub sample_count: u64,
    pub buckets: Vec<HistoryBucket>,
    pub events: Vec<ConnectionEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkUsageSummary {
    pub network_guid: String,
    pub display_name: String,
    pub from_ms: i64,
    pub to_ms: i64,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
    pub total_bytes: u64,
    pub limit_bytes: Option<u64>,
    pub limit_percent: Option<f64>,
    pub counter_resets: u64,
    pub adapter_changes: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageReport {
    pub from_ms: i64,
    pub to_ms: i64,
    pub networks: Vec<NetworkUsageSummary>,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DigestFindingView {
    pub id: String,
    pub title: String,
    pub detail: String,
    pub evidence: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyDigestView {
    pub from_ms: i64,
    pub to_ms: i64,
    pub enough_data: bool,
    pub coverage_percent: f64,
    pub summary: String,
    pub insufficient_reason: Option<String>,
    pub findings: Vec<DigestFindingView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextPrompt {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub app_name: Option<String>,
    pub network_guid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkAlert {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub detail: String,
    pub detected_at_ms: i64,
    pub network_guid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoingLiveCheck {
    pub id: String,
    pub label: String,
    pub status: String,
    pub value: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoingLiveResult {
    pub status: String,
    pub summary: String,
    pub checked_at_ms: i64,
    pub sharing_status: crate::types::StreamerStatus,
    pub checks: Vec<GoingLiveCheck>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceReportData {
    pub from_ms: i64,
    pub to_ms: i64,
    pub generated_at_ms: i64,
    pub timezone: String,
    pub coverage_percent: f64,
    pub sample_count: u64,
    pub missing_sample_count: u64,
    pub drop_count: u64,
    pub latency_spike_count: u64,
    pub jitter_spike_count: u64,
    pub network_count: u64,
    pub network_label: Option<String>,
    pub events: Vec<ConnectionEvent>,
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresetUndo {
    version: u8,
    token: String,
    network_guid: String,
    previous_label: String,
    applied_label: Option<String>,
    previous_theme: String,
    previous_bssid_cloaking: bool,
    previous_bssid_mask_mode: String,
    created_at_ms: i64,
}

pub fn load_ui_session() -> Result<UiSession, String> {
    settings::storage()
        .read::<UiSession>(UI_STATE_FILE)?
        .unwrap_or_default()
        .validate()
}

pub fn save_ui_session(session: UiSession) -> Result<(), String> {
    settings::storage().with_lock("ui-state", || {
        settings::storage().write(UI_STATE_FILE, &session.validate()?)
    })
}

fn load_presets() -> Result<HashMap<String, NetworkPreset>, String> {
    let presets = settings::storage()
        .read::<HashMap<String, NetworkPreset>>(PRESETS_FILE)?
        .unwrap_or_default();
    if presets.len() > 10_000 {
        return Err("The network preset file contains too many entries".into());
    }
    presets
        .into_iter()
        .map(|(key, preset)| {
            let preset = preset.validate()?;
            if key != preset.network_guid {
                return Err("A network preset has a mismatched identifier".into());
            }
            Ok((key, preset))
        })
        .collect()
}

pub fn get_network_preset(network_guid: &str) -> Result<NetworkPreset, String> {
    Ok(load_presets()?
        .remove(network_guid)
        .unwrap_or_else(|| NetworkPreset::empty(network_guid.into())))
}

pub fn save_network_preset(preset: NetworkPreset) -> Result<(), String> {
    settings::storage().with_lock("presets", || {
        let preset = preset.validate()?;
        let mut presets = load_presets()?;
        presets.insert(preset.network_guid.clone(), preset);
        settings::storage().write(PRESETS_FILE, &presets)
    })
}

pub fn preview_network_preset(preset: &NetworkPreset) -> Result<PresetPreview, String> {
    let preset = preset.clone().validate()?;
    let current_settings = settings::get_settings_checked()?;
    let snapshot = platform::get_network_snapshot(&settings::read_backup()?)?;
    let network = snapshot
        .networks
        .iter()
        .find(|network| network.guid == preset.network_guid)
        .ok_or("This saved network is no longer available")?;
    let mut changes = Vec::new();
    let label_change = preset
        .label
        .as_deref()
        .filter(|label| *label != network.name.as_str());
    if let Some(label) = label_change {
        changes.push(PresetChange {
            label: "Local network label".into(),
            before: network.name.clone(),
            after: label.into(),
            requires_permission: true,
        });
    }
    if preset.theme != "inherit" && preset.theme != current_settings.theme {
        changes.push(PresetChange {
            label: "Theme".into(),
            before: current_settings.theme.clone(),
            after: preset.theme.clone(),
            requires_permission: false,
        });
    }
    if preset.bssid_visibility != "inherit" {
        let (after_cloaking, after_mode) = match preset.bssid_visibility.as_str() {
            "full" => (true, "full"),
            "partial" => (true, "partial"),
            _ => unreachable!(),
        };
        if !current_settings.bssid_cloaking || current_settings.bssid_mask_mode != after_mode {
            changes.push(PresetChange {
                label: "Access-point display".into(),
                before: if current_settings.bssid_cloaking {
                    current_settings.bssid_mask_mode.clone()
                } else {
                    "visible".into()
                },
                after: if after_cloaking {
                    after_mode.into()
                } else {
                    "visible".into()
                },
                requires_permission: false,
            });
        }
    }
    let can_apply_automatically = label_change.is_none();
    Ok(PresetPreview {
        network_guid: preset.network_guid,
        changes,
        can_apply_automatically,
        automatic_limit_reason: (!can_apply_automatically).then(|| {
            "Local label changes may require system permission, so NetMask asks before applying this preset."
                .into()
        }),
    })
}

fn new_undo_token() -> Result<String, String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Cannot prepare preset recovery: {error}"))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn load_preset_undo() -> Result<Option<PresetUndo>, String> {
    let undo = settings::storage()
        .read::<Option<PresetUndo>>(PRESET_UNDO_FILE)?
        .flatten();
    if undo.as_ref().is_some_and(|undo| {
        undo.version != 1
            || undo.token.is_empty()
            || undo.token.len() > 128
            || undo.network_guid.is_empty()
            || undo.network_guid.len() > 512
    }) {
        return Err("The saved preset undo record is invalid and was preserved".into());
    }
    Ok(undo)
}

pub fn pending_preset_undo() -> Result<Option<PresetApplication>, String> {
    Ok(load_preset_undo()?.map(|undo| PresetApplication {
        applied: true,
        summary: "The most recent network preset change can still be undone.".into(),
        undo_token: Some(undo.token),
    }))
}

pub fn apply_network_preset(
    network_guid: &str,
    allow_permission_prompt: bool,
) -> Result<PresetApplication, String> {
    settings::storage().with_lock("preset-apply", || {
        if !allow_permission_prompt && load_preset_undo()?.is_some() {
            return Ok(PresetApplication {
                applied: false,
                summary: "A previous preset change is still waiting to be undone or replaced from the app. Automatic changes were left untouched."
                    .into(),
                undo_token: None,
            });
        }
        let preset = get_network_preset(network_guid)?.validate()?;
        if !preset.enabled {
            return Ok(PresetApplication {
                applied: false,
                summary: "This network preset is off.".into(),
                undo_token: None,
            });
        }
        let preview = preview_network_preset(&preset)?;
        if preset.apply_mode == "automatic"
            && !preview.can_apply_automatically
            && !allow_permission_prompt
        {
            return Ok(PresetApplication {
                applied: false,
                summary: preview
                    .automatic_limit_reason
                    .unwrap_or_else(|| "This preset needs confirmation.".into()),
                undo_token: None,
            });
        }
        if preview.changes.is_empty() {
            return Ok(PresetApplication {
                applied: false,
                summary: "This network already matches its preset.".into(),
                undo_token: None,
            });
        }
        let current_settings = settings::get_settings_checked()?;
        let snapshot = platform::get_network_snapshot(&settings::read_backup()?)?;
        let network = snapshot
            .networks
            .iter()
            .find(|network| network.guid == network_guid)
            .ok_or("This saved network is no longer available")?;
        let token = new_undo_token()?;
        let undo = PresetUndo {
            version: 1,
            token: token.clone(),
            network_guid: network_guid.into(),
            previous_label: network.name.clone(),
            applied_label: preset.label.clone(),
            previous_theme: current_settings.theme.clone(),
            previous_bssid_cloaking: current_settings.bssid_cloaking,
            previous_bssid_mask_mode: current_settings.bssid_mask_mode.clone(),
            created_at_ms: unix_now_millis(),
        };
        // Recovery reaches durable storage before any OS or preference mutation.
        settings::storage().write(PRESET_UNDO_FILE, &Some(undo.clone()))?;
        let result = (|| {
            if let Some(label) = preset
                .label
                .as_deref()
                .filter(|label| *label != network.name.as_str())
            {
                operations::rename(
                    network_guid,
                    label,
                    Some(&network.name),
                    allow_permission_prompt,
                )?;
            }
            let mut updates = Vec::new();
            if preset.theme != "inherit" {
                updates.push(("theme", serde_json::json!(preset.theme)));
            }
            if preset.bssid_visibility != "inherit" {
                updates.push(("bssidCloaking", serde_json::json!(true)));
                updates.push(("bssidMaskMode", serde_json::json!(preset.bssid_visibility)));
            }
            settings::set_settings_values(&updates)
        })();
        if let Err(error) = result {
            // Keep the durable undo record whenever the final state is uncertain.
            return Err(format!(
                "The preset was not fully applied. Its undo record was kept: {error}"
            ));
        }
        Ok(PresetApplication {
            applied: true,
            summary: format!("Applied {} preset change(s).", preview.changes.len()),
            undo_token: Some(token),
        })
    })
}

pub fn undo_network_preset(token: &str) -> Result<(), String> {
    settings::storage().with_lock("preset-apply", || {
        let undo = load_preset_undo()?.ok_or("There is no preset change to undo")?;
        if undo.version != 1 || token.is_empty() || undo.token != token {
            return Err("The preset undo request is no longer valid".into());
        }
        let snapshot = platform::get_network_snapshot(&settings::read_backup()?)?;
        if let Some(network) = snapshot
            .networks
            .iter()
            .find(|network| network.guid == undo.network_guid)
        {
            if undo
                .applied_label
                .as_deref()
                .is_some_and(|label| network.name == label)
            {
                operations::rename(
                    &undo.network_guid,
                    &undo.previous_label,
                    Some(&network.name),
                    true,
                )?;
            }
        } else if undo.applied_label.is_some() {
            return Err(
                "The saved network is unavailable. Its preset undo record was kept so the local label can be restored later."
                    .into(),
            );
        }
        settings::set_settings_values(&[
            ("theme", serde_json::json!(undo.previous_theme)),
            (
                "bssidCloaking",
                serde_json::json!(undo.previous_bssid_cloaking),
            ),
            (
                "bssidMaskMode",
                serde_json::json!(undo.previous_bssid_mask_mode),
            ),
        ])?;
        settings::storage().write(PRESET_UNDO_FILE, &Option::<PresetUndo>::None)
    })
}

fn unix_now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_session_validation_rejects_unbounded_or_unknown_state() {
        assert!(UiSession::default().validate().is_ok());
        assert!(
            UiSession {
                active_view: "elsewhere".into(),
                ..UiSession::default()
            }
            .validate()
            .is_err()
        );
        assert!(
            UiSession {
                main_scroll_top: f64::NAN,
                ..UiSession::default()
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn presets_trim_optional_labels_and_reject_unsafe_modes() {
        let preset = NetworkPreset {
            network_guid: "network".into(),
            enabled: true,
            apply_mode: "ask".into(),
            label: Some("  Studio  ".into()),
            theme: "inherit".into(),
            bssid_visibility: "partial".into(),
        }
        .validate()
        .unwrap();
        assert_eq!(preset.label.as_deref(), Some("Studio"));
        assert!(
            NetworkPreset {
                apply_mode: "silent".into(),
                ..preset
            }
            .validate()
            .is_err()
        );
    }
}
