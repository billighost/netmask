use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;
use crate::types::*;
use crate::platform::*;
use crate::speed::*;
use crate::ping::*;
use crate::dns::*;
use crate::privacy::*;
use crate::roaming::*;
use crate::portal::*;
use crate::qr::*;
use crate::settings::*;
use crate::streamer::*;
use crate::updater::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    pub message: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentDnsResult {
    pub primary: String,
    pub secondary: Option<String>,
    pub is_dhcp: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadUpdateResult {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub in_progress: Option<bool>,
    pub already_downloaded: Option<bool>,
}

#[derive(Deserialize)]
pub struct RoamingParams {
    #[serde(rename = "preferredBand")]
    pub preferred_band: Option<String>,
    #[serde(rename = "roamingAggressiveness")]
    pub roaming_aggressiveness: Option<String>,
}

#[tauri::command]
pub fn nm_is_admin() -> bool {
    is_admin()
}

#[tauri::command]
pub fn nm_elevate() {
    elevate();
}

#[tauri::command]
pub fn nm_get_elevation_status() -> ElevationStatus {
    get_elevation_status()
}

#[tauri::command]
pub fn nm_setup_silent_elevation() -> OperationResult {
    let (success, message) = setup_silent_elevation();
    OperationResult {
        success,
        message: Some(message),
    }
}

#[tauri::command]
pub fn nm_remove_silent_elevation() -> OperationResult {
    let (success, message) = remove_silent_elevation();
    OperationResult {
        success,
        message: Some(message),
    }
}

#[tauri::command]
pub fn nm_get_device_identity() -> DeviceIdentity {
    get_device_identity()
}

#[tauri::command]
pub fn nm_set_mac_randomization(profile_name: String, mode: String) -> bool {
    set_mac_randomization(&profile_name, &mode)
}

#[tauri::command]
pub fn nm_set_netbios_silencer(enable_silence: bool) -> bool {
    set_netbios_silencer(enable_silence)
}

#[tauri::command]
pub fn nm_benchmark_dns() -> Vec<DnsResolverResult> {
    benchmark_dns()
}

#[tauri::command]
pub fn nm_get_current_dns(interface_name: Option<String>) -> CurrentDnsResult {
    let (primary, secondary, is_dhcp) = get_current_dns(interface_name.as_deref());
    CurrentDnsResult {
        primary,
        secondary,
        is_dhcp,
    }
}

#[tauri::command]
pub fn nm_apply_dns(resolver_id: String) -> bool {
    apply_dns(&resolver_id)
}

#[tauri::command]
pub fn nm_get_roaming_settings() -> RoamingSettings {
    get_roaming_settings()
}

#[tauri::command]
pub fn nm_set_roaming_settings(params: RoamingParams) -> bool {
    set_roaming_settings(params.preferred_band.as_deref(), params.roaming_aggressiveness.as_deref())
}

#[tauri::command]
pub fn nm_get_ping_telemetry() -> PingTelemetry {
    get_ping_telemetry()
}

#[tauri::command]
pub fn nm_get_wifi_qr(profile_name: String) -> WifiQrData {
    let out = run_cmd_output("netsh", &["wlan", "show", "profile", &format!("name={}", profile_name), "key=clear"]);
    let mut ssid = profile_name.clone();
    let mut auth = "WPA2-Personal".to_string();
    let mut password = String::new();

    for line in out.lines() {
        if line.contains("SSID name") {
            if let Some(idx) = line.find(':') {
                ssid = line[idx + 1..].trim().trim_matches('"').to_string();
            }
        } else if line.contains("Authentication") {
            if let Some(idx) = line.find(':') {
                auth = line[idx + 1..].trim().to_string();
            }
        } else if line.contains("Key Content") {
            if let Some(idx) = line.find(':') {
                password = line[idx + 1..].trim().to_string();
            }
        }
    }

    let is_wep = auth.to_uppercase().contains("WEP");
    let is_open = auth.to_uppercase().contains("OPEN") || password.is_empty();
    let qr_string = build_wifi_qr_string(&ssid, &password, &auth);
    let svg = render_qr_svg(&qr_string, 240, 4);

    WifiQrData {
        ssid,
        auth,
        password,
        qr_string,
        svg,
        is_wep,
        is_open,
    }
}

#[tauri::command]
pub fn nm_check_captive_portal() -> CaptivePortalStatus {
    check_captive_portal()
}

#[tauri::command]
pub fn nm_open_external(url: String) {
    open_release_url(Some(&url));
}

#[tauri::command]
pub fn nm_get_networks() -> Vec<Network> {
    let bk = read_backup();
    get_networks(&bk)
}

#[tauri::command]
pub fn nm_get_connection() -> Option<Connection> {
    get_current_connection()
}

#[tauri::command]
pub fn nm_get_details(guid: String) -> NetworkDetails {
    get_network_details(&guid)
}

#[tauri::command]
pub fn nm_rename(guid: String, new_name: String, current_name: Option<String>) -> Result<(), String> {
    let mut bk = read_backup();
    if !bk.contains_key(&guid) {
        let nets = get_networks(&bk);
        if let Some(net) = nets.into_iter().find(|n| n.guid == guid) {
            bk.insert(guid.clone(), net.original_name);
            write_backup(&bk);
        } else if let Some(cur) = current_name.clone() {
            bk.insert(guid.clone(), cur);
            write_backup(&bk);
        }
    }
    rename_network(&guid, &new_name, current_name.as_deref())
}

#[tauri::command]
pub fn nm_restore(guid: String, current_name: Option<String>) -> Result<(), String> {
    let mut bk = read_backup();
    if let Some(original) = bk.get(&guid).cloned() {
        rename_network(&guid, &original, current_name.as_deref())?;
        bk.remove(&guid);
        write_backup(&bk);
    }
    Ok(())
}

#[tauri::command]
pub fn nm_restore_all() -> Result<(), String> {
    let bk = read_backup();
    for (guid, name) in &bk {
        let _ = rename_network(guid, name, None);
    }
    write_backup(&std::collections::HashMap::new());
    Ok(())
}

#[tauri::command]
pub fn nm_reconnect(profile: Option<String>) -> bool {
    reconnect_network(profile.as_deref())
}

#[tauri::command]
pub fn nm_run_speed_test() -> Result<SpeedTestResult, String> {
    run_speed_test()
}

#[tauri::command]
pub fn nm_export_backup() -> String {
    let bk = read_backup();
    serde_json::to_string_pretty(&bk).unwrap_or_else(|_| "{}".into())
}

#[tauri::command]
pub fn nm_import_backup(json: String) -> Result<(), String> {
    let data: std::collections::HashMap<String, String> = serde_json::from_str(&json)
        .map_err(|e| e.to_string())?;
    write_backup(&data);
    Ok(())
}

#[tauri::command]
pub fn nm_get_settings() -> AppSettings {
    get_settings()
}

#[tauri::command]
pub fn nm_set_setting(key: String, value: serde_json::Value) {
    set_setting(&key, value);
}

#[tauri::command]
pub fn nm_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn nm_maximize(window: WebviewWindow) -> bool {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
            false
        } else {
            let _ = window.maximize();
            true
        }
    } else {
        false
    }
}

#[tauri::command]
pub fn nm_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

#[tauri::command]
pub fn nm_close(window: WebviewWindow) {
    let settings = get_settings();
    if settings.minimize_to_tray {
        let _ = window.hide();
        trim_working_set();
    } else {
        let _ = window.close();
    }
}

#[tauri::command]
pub fn nm_trim_memory() {
    trim_working_set();
}

#[tauri::command]
pub fn nm_get_streamer_status() -> StreamerStatus {
    get_streamer_status()
}

#[tauri::command]
pub fn nm_toggle_streamer_cloak() -> StreamerStatus {
    toggle_streamer_cloak()
}

#[tauri::command]
pub fn nm_get_version() -> String {
    CURRENT_VERSION.to_string()
}

#[tauri::command]
pub fn nm_get_update_status() -> UpdateStatus {
    get_update_status()
}

#[tauri::command]
pub fn nm_check_update() -> Option<UpdateInfo> {
    check_github_release()
}

#[tauri::command]
pub fn nm_download_update(url: Option<String>) -> DownloadUpdateResult {
    let (success, file_path, error) = download_update(url.as_deref());
    DownloadUpdateResult {
        success,
        file_path,
        error,
        in_progress: Some(false),
        already_downloaded: Some(false),
    }
}

#[tauri::command]
pub fn nm_install_update(file_path: Option<String>) {
    install_update(file_path.as_deref());
}

#[tauri::command]
pub fn nm_open_release_url(url: Option<String>) {
    open_release_url(url.as_deref());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_current_dns_result_camel_case_serialization() {
        let res = CurrentDnsResult {
            primary: "1.1.1.1".into(),
            secondary: Some("1.0.0.1".into()),
            is_dhcp: false,
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"isDhcp\":false"), "JSON must contain camelCase isDhcp, got: {}", json);
        assert!(!json.contains("is_dhcp"), "JSON must NOT contain snake_case is_dhcp");
    }

    #[test]
    fn test_download_update_result_camel_case_serialization() {
        let res = DownloadUpdateResult {
            success: true,
            file_path: Some("C:\\temp\\update.exe".into()),
            error: None,
            in_progress: Some(false),
            already_downloaded: Some(true),
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"filePath\":"), "JSON must contain camelCase filePath, got: {}", json);
        assert!(json.contains("\"inProgress\":false"), "JSON must contain camelCase inProgress, got: {}", json);
        assert!(json.contains("\"alreadyDownloaded\":true"), "JSON must contain camelCase alreadyDownloaded, got: {}", json);
        assert!(!json.contains("file_path"));
        assert!(!json.contains("in_progress"));
        assert!(!json.contains("already_downloaded"));
    }

    #[test]
    fn test_operation_result_camel_case_serialization() {
        let res = OperationResult {
            success: true,
            message: Some("OK".into()),
        };
        let json = serde_json::to_string(&res).expect("serialization failed");
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"message\":\"OK\""));
    }
}
