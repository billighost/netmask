use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub guid: String,
    pub name: String,
    pub original_name: String,
    pub renamed: bool,
    pub live: bool,
    #[serde(rename = "type")]
    pub network_type: String, // "wifi" | "ethernet"
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
pub struct AppSettings {
    pub minimize_to_tray: bool,
    pub launch_on_startup: bool,
    pub auto_refresh_interval: i32,
    pub theme: String,
    pub show_ethernet: bool,
    pub ultra_low_memory: bool,
    pub auto_cloak_streamer: bool,
    pub streamer_mask_name: String,
    pub bssid_cloaking: bool,
    pub bssid_mask_mode: String,
    pub silent_elevation: bool,
    pub window_bounds: Option<WindowBounds>,
    pub shortcuts: HashMap<String, String>,
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
    pub netbios_silenced: bool,
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

