use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub guid: String,
    pub name: String,
    pub original_name: String,
    pub renamed: bool,
    #[serde(default)]
    pub name_sync_pending: bool,
    pub live: bool,
    #[serde(rename = "type")]
    pub network_type: String, // "wifi" | "ethernet"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    #[serde(default = "default_true")]
    pub can_rename: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub ssid: String,
    pub profile: String,
    pub signal: i32,
    pub signal_dbm: Option<i32>,
    pub snr: Option<i32>,
    pub channel: Option<i32>,
    pub frequency: Option<String>,
    pub band: String,
    pub generation: Option<String>,
    pub radio_type: Option<String>,
    pub bssid: Option<String>,
    pub name: String,
    pub rx_rate_mbps: Option<f64>,
    pub tx_rate_mbps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub network_guid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interface_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interface_guid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkDetails {
    pub guid: String,
    pub bssid: String,
    pub masked_bssid: Option<String>,
    pub channel: i32,
    pub auth: String,
    pub band: String,
    pub frequency: String,
    pub generation: Option<String>,
    pub signal_dbm: Option<i32>,
    pub snr: Option<i32>,
    pub radio_type: Option<String>,
    pub rx_rate_mbps: Option<f64>,
    pub tx_rate_mbps: Option<f64>,
    pub last_connected: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamerStatus {
    pub detected_app: Option<String>,
    pub is_cloaked: bool,
    pub cooldown_seconds: i32,
    #[serde(default)]
    pub manual_seconds_remaining: i64,
    #[serde(default)]
    pub manual_timed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedSample {
    pub down_m_bps: f64,
    pub up_m_bps: f64,
    pub down_kbps: i64,
    pub up_kbps: i64,
    pub instant_down_m_bps: Option<f64>,
    pub instant_up_m_bps: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub available: Option<bool>,
}

impl SpeedSample {
    pub fn unavailable() -> Self {
        Self {
            down_m_bps: 0.0,
            up_m_bps: 0.0,
            down_kbps: 0,
            up_kbps: 0,
            instant_down_m_bps: None,
            instant_up_m_bps: None,
            available: Some(false),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub mbps: f64,
    pub mb_per_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub width: i32,
    pub height: i32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub is_maximized: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AppSettings {
    pub onboarding_completed: bool,
    pub minimize_to_tray: bool,
    pub launch_on_startup: bool,
    pub auto_refresh_interval: i32,
    pub theme: String,
    pub show_ethernet: bool,
    pub ultra_low_memory: bool,
    pub auto_cloak_streamer: bool,
    pub streamer_detection_mode: String,
    pub streamer_mask_name: String,
    pub custom_broadcast_apps: Vec<String>,
    pub suppressed_broadcast_apps: Vec<String>,
    pub sharing_timer_minutes: i32,
    pub monitoring_enabled: bool,
    pub monitoring_paused: bool,
    pub history_retention_days: i32,
    pub usage_tracking_enabled: bool,
    pub context_prompts_enabled: bool,
    pub network_change_alerts: bool,
    pub behavior_change_alerts: bool,
    pub usage_limit_alerts: bool,
    pub bssid_cloaking: bool,
    pub bssid_mask_mode: String,
    pub silent_elevation: bool,
    pub window_bounds: Option<WindowBounds>,
    pub shortcuts: HashMap<String, String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        crate::settings::default_settings()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkSnapshot {
    pub networks: Vec<Network>,
    pub connection: Option<Connection>,
    pub connection_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub network_rename: bool,
    pub wifi_sharing: bool,
    pub dns_configuration: bool,
    pub mac_randomization: bool,
    pub netbios_control: bool,
    pub roaming_tuning: bool,
    pub elevation_task: bool,
    pub gpu_control: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElevationStatus {
    pub is_elevated: bool,
    pub silent_elevation_enabled: bool,
    pub task_configured: bool,
    pub tier: String, // "task" | "broker" | "jit"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub hostname: String,
    pub mac_address: String,
    pub interface_name: String,
    pub interface_guid: String,
    pub netbios_silenced: Option<bool>,
    pub mac_randomization: String, // "disabled" | "enabled" | "daily" | "unknown"
    pub active_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DnsResolverResult {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub primary: String,
    pub secondary: Option<String>,
    pub description: String,
    pub is_dhcp: Option<bool>,
    pub latency_ms: Option<i64>,
    pub is_current: bool,
    pub is_fastest: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub configuration_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoamingSettings {
    pub supported: bool,
    pub adapter_name: String,
    pub preferred_band: String,
    pub valid_preferred_bands: Vec<String>,
    pub roaming_aggressiveness: String,
    pub valid_roaming_aggressiveness: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingTelemetry {
    pub gateway_ip: Option<String>,
    pub gateway_ms: Option<i64>,
    pub internet_ms: Option<i64>,
    pub jitter_ms: Option<f64>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WifiQrData {
    pub ssid: String,
    pub auth: String,
    pub password: String,
    pub qr_string: String,
    pub svg: String,
    pub is_wep: bool,
    pub is_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptivePortalStatus {
    pub is_captive: bool,
    pub portal_url: Option<String>,
    pub checked_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub name: String,
    pub notes: String,
    pub url: String,
    pub download_url: Option<String>,
    pub asset_name: Option<String>,
    pub asset_size: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub percent: f64,
    pub transferred: i64,
    pub total: i64,
    pub bytes_per_second: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub is_downloading: bool,
    pub progress: Option<DownloadProgress>,
    pub downloaded_version: Option<String>,
    pub downloaded_file_path: Option<String>,
    pub available_update: Option<UpdateInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    pub generated_at: i64,
    pub version: String,
    pub platform: String,
    pub capabilities: PlatformCapabilities,
    pub network_count: usize,
    pub wifi_count: usize,
    pub renamed_count: usize,
    pub sync_pending_count: usize,
    pub recovery_record_count: usize,
    pub connected: bool,
    pub snapshot_error: bool,
    pub sharing_mode: bool,
    pub sharing_timer_active: bool,
    pub broadcast_app_detected: bool,
    pub update_available: bool,
    pub update_version: Option<String>,
    pub update_downloading: bool,
    pub downloaded_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryAudit {
    pub checked_version: String,
    pub recovery_record_count: usize,
    pub attention_count: usize,
    pub sync_pending_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NameConflict {
    pub conflicting_guid: String,
    pub current_name: String,
    pub suggested_name: String,
}
