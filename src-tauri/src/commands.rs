use crate::types::*;
use crate::{
    CompanionRuntime, dns, observations, operations, ping, platform, portal, privacy, qr, roaming,
    settings, speed, streamer, updater,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Native operation could not finish: {error}"))?
}

#[derive(Serialize)]
pub struct OperationResult {
    success: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentDnsResult {
    primary: String,
    secondary: Option<String>,
    is_dhcp: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoamingParams {
    preferred_band: Option<String>,
    roaming_aggressiveness: Option<String>,
}

#[tauri::command]
pub fn nm_is_admin() -> bool {
    platform::is_admin()
}

#[tauri::command]
pub async fn nm_elevate(app: AppHandle) -> Result<(), String> {
    if platform::is_admin() {
        return Ok(());
    }
    blocking(platform::elevate).await?;
    crate::exit_app(&app);
    Ok(())
}

#[tauri::command]
pub async fn nm_get_elevation_status() -> Result<ElevationStatus, String> {
    blocking(|| Ok(platform::get_elevation_status())).await
}

#[tauri::command]
pub async fn nm_setup_silent_elevation() -> Result<OperationResult, String> {
    blocking(|| {
        let (success, message) = platform::setup_silent_elevation();
        Ok(OperationResult { success, message })
    })
    .await
}

#[tauri::command]
pub async fn nm_remove_silent_elevation() -> Result<OperationResult, String> {
    blocking(|| {
        let (success, message) = platform::remove_silent_elevation();
        Ok(OperationResult { success, message })
    })
    .await
}

#[tauri::command]
pub async fn nm_get_capabilities() -> Result<PlatformCapabilities, String> {
    blocking(|| Ok(platform::get_capabilities())).await
}

#[tauri::command]
pub async fn nm_get_device_identity() -> Result<DeviceIdentity, String> {
    blocking(privacy::get_device_identity).await
}

#[tauri::command]
pub async fn nm_set_mac_randomization(profile_name: String, mode: String) -> Result<bool, String> {
    blocking(move || privacy::set_mac_randomization(&profile_name, &mode)).await
}

#[tauri::command]
pub async fn nm_set_netbios_silencer(enable_silence: bool) -> Result<bool, String> {
    blocking(move || privacy::set_netbios_silencer(enable_silence)).await
}

#[tauri::command]
pub async fn nm_benchmark_dns(
    runtime: State<'_, CompanionRuntime>,
) -> Result<Vec<DnsResolverResult>, String> {
    let database = runtime.database().ok();
    let operation = runtime.operation_lock();
    blocking(move || {
        let results = dns::benchmark_dns()?;
        if let (Some(database), Ok(Some(context))) = (database, platform::active_network_context())
        {
            let current = results.iter().find(|result| result.is_current);
            let candidate = results
                .iter()
                .find(|result| result.is_fastest == Some(true) && result.latency_ms.is_some());
            if let Some(candidate) = candidate {
                let _guard = operation.lock().unwrap_or_else(|error| error.into_inner());
                let _ = database.record_dns_evidence(&observations::DnsEvidence {
                    timestamp_ms: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis()
                        .min(i64::MAX as u128) as i64,
                    network_key: context.network_id,
                    current_name: current
                        .map(|result| result.name.clone())
                        .unwrap_or_else(|| "Current DNS".into()),
                    current_latency_ms: current.and_then(|result| result.latency_ms),
                    candidate_name: candidate.name.clone(),
                    candidate_latency_ms: candidate.latency_ms.unwrap_or_default(),
                });
            }
        }
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn nm_get_current_dns(
    interface_name: Option<String>,
) -> Result<CurrentDnsResult, String> {
    blocking(move || {
        let (primary, secondary, is_dhcp) = dns::get_current_dns(interface_name.as_deref())?;
        Ok(CurrentDnsResult {
            primary,
            secondary,
            is_dhcp,
        })
    })
    .await
}

#[tauri::command]
pub async fn nm_apply_dns(
    resolver_id: String,
    configuration_id: Option<String>,
) -> Result<bool, String> {
    blocking(move || dns::apply_dns(&resolver_id, configuration_id.as_deref())).await
}

#[tauri::command]
pub async fn nm_get_roaming_settings() -> Result<RoamingSettings, String> {
    blocking(roaming::get_roaming_settings).await
}

#[tauri::command]
pub async fn nm_set_roaming_settings(params: RoamingParams) -> Result<bool, String> {
    blocking(move || {
        roaming::set_roaming_settings(
            params.preferred_band.as_deref(),
            params.roaming_aggressiveness.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn nm_get_ping_telemetry() -> Result<PingTelemetry, String> {
    blocking(|| Ok(ping::get_ping_telemetry())).await
}

#[tauri::command]
pub async fn nm_get_wifi_qr(profile_name: String) -> Result<WifiQrData, String> {
    blocking(move || qr::get_wifi_qr(&profile_name)).await
}

#[tauri::command]
pub async fn nm_check_captive_portal() -> Result<CaptivePortalStatus, String> {
    blocking(portal::check_captive_portal).await
}

#[tauri::command]
pub async fn nm_open_external(url: String) -> Result<(), String> {
    blocking(move || updater::open_external(&url)).await
}

#[tauri::command]
pub async fn nm_get_network_snapshot() -> Result<NetworkSnapshot, String> {
    blocking(|| platform::get_network_snapshot(&settings::read_backup()?)).await
}

#[tauri::command]
pub async fn nm_get_networks() -> Result<Vec<Network>, String> {
    blocking(|| platform::get_networks(&settings::read_backup()?)).await
}

#[tauri::command]
pub async fn nm_get_connection() -> Result<Option<Connection>, String> {
    blocking(platform::get_current_connection).await
}

#[tauri::command]
pub async fn nm_get_details(guid: String) -> Result<NetworkDetails, String> {
    blocking(move || platform::get_network_details(&guid)).await
}

#[tauri::command]
pub async fn nm_rename(
    app: AppHandle,
    guid: String,
    new_name: String,
    current_name: Option<String>,
) -> Result<(), String> {
    blocking(move || operations::rename(&guid, &new_name, current_name.as_deref(), true)).await?;
    let _ = app.emit("nm:network-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn nm_get_name_conflict(
    guid: String,
    new_name: String,
    current_name: Option<String>,
) -> Result<Option<NameConflict>, String> {
    blocking(move || operations::get_name_conflict(&guid, &new_name, current_name.as_deref())).await
}

#[tauri::command]
pub async fn nm_repair_name_conflict(
    app: AppHandle,
    guid: String,
    new_name: String,
    current_name: Option<String>,
) -> Result<(), String> {
    blocking(move || operations::repair_name_conflict(&guid, &new_name, current_name.as_deref()))
        .await?;
    let _ = app.emit("nm:network-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn nm_restore(
    app: AppHandle,
    guid: String,
    current_name: Option<String>,
) -> Result<(), String> {
    blocking(move || operations::restore(&guid, current_name.as_deref())).await?;
    let _ = app.emit("nm:network-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn nm_restore_all(app: AppHandle) -> Result<(), String> {
    blocking(operations::restore_all).await?;
    let _ = app.emit("nm:network-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn nm_reconnect(profile: Option<String>) -> Result<bool, String> {
    blocking(move || platform::reconnect_network(profile.as_deref())).await
}

#[tauri::command]
pub async fn nm_run_speed_test() -> Result<SpeedTestResult, String> {
    blocking(speed::run_speed_test).await
}

#[tauri::command]
pub async fn nm_export_backup() -> Result<String, String> {
    blocking(|| {
        serde_json::to_string_pretty(&settings::read_backup()?).map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn nm_import_backup(json: String) -> Result<(), String> {
    blocking(move || operations::import_backup(&json)).await
}

#[tauri::command]
pub async fn nm_get_settings() -> Result<AppSettings, String> {
    blocking(settings::get_settings_checked).await
}

#[tauri::command]
pub async fn nm_set_setting(
    runtime: State<'_, CompanionRuntime>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let database = runtime.database().ok();
    let operation = runtime.operation_lock();
    let previous = settings::get_settings();
    let result = blocking(move || {
        settings::set_setting(&key, value)?;
        let current = settings::get_settings_checked()?;
        if let Some(database) = database {
            let _guard = operation.lock().unwrap_or_else(|error| error.into_inner());
            let was_recording = previous.monitoring_enabled && !previous.monitoring_paused;
            let is_recording = current.monitoring_enabled && !current.monitoring_paused;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
                .min(i64::MAX as u128) as i64;
            if was_recording && !is_recording {
                let reason = if current.monitoring_paused {
                    "recording paused"
                } else {
                    "recording disabled"
                };
                database.begin_gap(now, reason)?;
            } else if !was_recording && is_recording {
                database.close_open_gaps(now, None)?;
            }
            if key == "historyRetentionDays" {
                database.apply_retention(
                    now,
                    observations::RetentionPolicy {
                        days: current.history_retention_days as u32,
                        sample_row_cap: 500_000,
                        usage_cycle_cap: 5_000,
                    },
                )?;
            }
        }
        Ok(())
    })
    .await;
    runtime.set_monitor_error(result.as_ref().err().cloned());
    result
}

#[tauri::command]
pub fn nm_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|error| error.to_string())?;
    let _ = window.emit("nm:visibility", false);
    Ok(())
}

#[tauri::command]
pub fn nm_maximize(window: WebviewWindow) -> Result<bool, String> {
    let maximized = window.is_maximized().map_err(|error| error.to_string())?;
    if maximized {
        window.unmaximize()
    } else {
        window.maximize()
    }
    .map_err(|error| error.to_string())?;
    Ok(!maximized)
}

#[tauri::command]
pub fn nm_is_maximized(window: WebviewWindow) -> Result<bool, String> {
    window.is_maximized().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn nm_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn nm_renderer_ready(app: AppHandle) -> Option<String> {
    crate::renderer_ready(&app)
}

#[tauri::command]
pub async fn nm_trim_memory() -> Result<(), String> {
    blocking(platform::trim_working_set).await
}

#[tauri::command]
pub async fn nm_get_streamer_status() -> Result<StreamerStatus, String> {
    blocking(|| Ok(streamer::get_streamer_status())).await
}

#[tauri::command]
pub async fn nm_get_diagnostic_report() -> Result<DiagnosticReport, String> {
    blocking(|| {
        let backup = settings::read_backup()?;
        let (networks, connected, snapshot_error) = match platform::get_network_snapshot(&backup) {
            Ok(snapshot) => (snapshot.networks, snapshot.connection.is_some(), false),
            Err(_) => (Vec::new(), false, true),
        };
        let sharing = streamer::get_streamer_status();
        let update = updater::get_update_status();
        Ok(DiagnosticReport {
            generated_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            version: updater::CURRENT_VERSION.into(),
            platform: std::env::consts::OS.into(),
            capabilities: platform::get_capabilities(),
            network_count: networks.len(),
            wifi_count: networks
                .iter()
                .filter(|network| network.network_type == "wifi")
                .count(),
            renamed_count: networks.iter().filter(|network| network.renamed).count(),
            sync_pending_count: networks
                .iter()
                .filter(|network| network.name_sync_pending)
                .count(),
            recovery_record_count: backup.len(),
            connected,
            snapshot_error,
            sharing_mode: sharing.is_cloaked,
            sharing_timer_active: sharing.manual_seconds_remaining > 0,
            broadcast_app_detected: sharing.detected_app.is_some(),
            update_available: update.available_update.is_some(),
            update_version: update.available_update.map(|info| info.version),
            update_downloading: update.is_downloading,
            downloaded_version: update.downloaded_version,
        })
    })
    .await
}

#[tauri::command]
pub async fn nm_get_recovery_audit() -> Result<Option<RecoveryAudit>, String> {
    blocking(operations::get_recovery_audit).await
}

#[tauri::command]
pub async fn nm_dismiss_recovery_audit() -> Result<(), String> {
    blocking(operations::dismiss_recovery_audit).await
}

#[tauri::command]
pub async fn nm_toggle_streamer_cloak(app: AppHandle) -> Result<StreamerStatus, String> {
    let status = blocking(|| Ok(streamer::toggle_streamer_cloak())).await?;
    let _ = app.emit("nm:streamer-status", &status);
    Ok(status)
}

#[tauri::command]
pub async fn nm_start_streamer_timer(
    app: AppHandle,
    minutes: i32,
) -> Result<StreamerStatus, String> {
    let status = blocking(move || Ok(streamer::start_streamer_timer(minutes))).await?;
    let _ = app.emit("nm:streamer-status", &status);
    Ok(status)
}

#[tauri::command]
pub fn nm_get_version() -> String {
    updater::CURRENT_VERSION.into()
}

#[tauri::command]
pub async fn nm_get_update_status() -> Result<UpdateStatus, String> {
    blocking(|| Ok(updater::get_update_status())).await
}

#[tauri::command]
pub async fn nm_check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = blocking(updater::check_github_release).await?;
    if let Some(update) = &update {
        let _ = app.emit("nm:update-available", update);
    }
    Ok(update)
}

#[tauri::command]
pub async fn nm_download_update(
    app: AppHandle,
    url: Option<String>,
) -> Result<updater::DownloadOutcome, String> {
    let progress_handle = app.clone();
    let result = blocking(move || {
        updater::download_update(url.as_deref(), |progress| {
            let _ = progress_handle.emit("nm:update-progress", progress);
        })
    })
    .await?;
    if result.success && !result.in_progress {
        let status = updater::get_update_status();
        let _ = app.emit(
            "nm:update-downloaded",
            serde_json::json!({"filePath": result.file_path, "version": status.downloaded_version}),
        );
    }
    Ok(result)
}

#[tauri::command]
pub async fn nm_install_update(app: AppHandle, file_path: Option<String>) -> Result<(), String> {
    let close = blocking(move || updater::install_update(file_path.as_deref())).await?;
    if close {
        crate::exit_app(&app);
    }
    Ok(())
}

#[tauri::command]
pub async fn nm_open_release_url(url: Option<String>) -> Result<(), String> {
    blocking(move || updater::open_release_url(url.as_deref())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_results_match_the_renderer_contract() {
        let dns = serde_json::to_value(CurrentDnsResult {
            primary: "1.1.1.1".into(),
            secondary: None,
            is_dhcp: false,
        })
        .unwrap();
        assert_eq!(
            dns,
            serde_json::json!({"primary":"1.1.1.1", "secondary":null, "isDhcp":false})
        );
        let download = serde_json::to_value(updater::DownloadOutcome {
            success: true,
            file_path: Some("verified-installer.exe".into()),
            error: None,
            in_progress: false,
            already_downloaded: true,
        })
        .unwrap();
        assert_eq!(
            download,
            serde_json::json!({"success":true, "filePath":"verified-installer.exe", "error":null, "inProgress":false, "alreadyDownloaded":true})
        );
        let operation = serde_json::to_value(OperationResult {
            success: false,
            message: "Permission denied".into(),
        })
        .unwrap();
        assert_eq!(
            operation,
            serde_json::json!({"success":false, "message":"Permission denied"})
        );
    }
}
