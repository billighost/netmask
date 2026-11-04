use crate::settings;
use crate::system::{self, powershell, powershell_json, powershell_literal};
use crate::types::{
    Connection, ElevationStatus, Network, NetworkDetails, NetworkSnapshot, PlatformCapabilities,
};
use std::collections::HashMap;
use std::sync::{
    Mutex,
    atomic::{AtomicU64, Ordering},
};
use std::time::Duration;
static CONNECTION_KEY: Mutex<Option<Option<String>>> = Mutex::new(None);
static CONNECTION_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn connection_generation() -> u64 {
    CONNECTION_GENERATION.load(Ordering::SeqCst)
}

fn observe_connection(connection: Option<&Connection>) {
    let key = connection.map(|connection| {
        serde_json::json!([
            connection.ssid,
            connection.interface_guid,
            connection.interface_name,
            connection.bssid
        ])
        .to_string()
    });
    let mut previous = CONNECTION_KEY.lock().unwrap_or_else(|e| e.into_inner());
    if previous.as_ref() != Some(&key) {
        *previous = Some(key);
        CONNECTION_GENERATION.fetch_add(1, Ordering::SeqCst);
        crate::speed::reset_speed_baseline();
    }
}
pub mod linux;
pub mod macos;
#[cfg(windows)]
pub mod nlm;
#[cfg(windows)]
pub mod windows;

pub fn run_cmd_output(program: &str, arguments: &[&str]) -> String {
    system::run(program, arguments).unwrap_or_default()
}
#[cfg(windows)]
#[link(name = "shell32")]
unsafe extern "system" {
    fn IsUserAnAdmin() -> i32;
}
#[cfg(windows)]
#[link(name = "psapi")]
unsafe extern "system" {
    fn EmptyWorkingSet(process: isize) -> i32;
}
#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> isize;
}

pub fn is_admin() -> bool {
    #[cfg(windows)]
    {
        unsafe { IsUserAnAdmin() != 0 }
    }
    #[cfg(unix)]
    {
        unsafe { libc::geteuid() == 0 }
    }
}
pub fn trim_working_set() -> Result<(), String> {
    #[cfg(windows)]
    {
        if unsafe { EmptyWorkingSet(GetCurrentProcess()) } != 0 {
            Ok(())
        } else {
            Err("Windows could not trim the process working set".into())
        }
    }
    #[cfg(not(windows))]
    {
        Err("This platform manages process memory automatically".into())
    }
}

pub fn show_existing_instance() {
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn FindWindowW(class: *const u16, title: *const u16) -> *mut std::ffi::c_void;
            fn ShowWindow(window: *mut std::ffi::c_void, command: i32) -> i32;
            fn SetForegroundWindow(window: *mut std::ffi::c_void) -> i32;
        }
        let title: Vec<u16> = "NetMask".encode_utf16().chain(Some(0)).collect();
        unsafe {
            let window = FindWindowW(std::ptr::null(), title.as_ptr());
            if !window.is_null() {
                ShowWindow(window, 9);
                SetForegroundWindow(window);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = system::run(
            "osascript",
            &["-e", "tell application \"NetMask\" to activate"],
        );
    }
    #[cfg(target_os = "linux")]
    {
        let _ = system::run("wmctrl", &["-a", "NetMask"]);
    }
}
pub fn is_guid(value: &str) -> bool {
    let value = value
        .strip_prefix('{')
        .and_then(|v| v.strip_suffix('}'))
        .unwrap_or(value);
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if matches!(i, 8 | 13 | 18 | 23) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
pub fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Invalid Wi-Fi SSID encoding".into());
    }
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            u8::from_str_radix(std::str::from_utf8(pair).map_err(|_| "Invalid SSID")?, 16)
                .map_err(|_| "Invalid SSID".into())
        })
        .collect()
}
pub fn band_from_mhz(frequency: u32) -> &'static str {
    match frequency {
        5925..=7125 => "6 GHz",
        4900..=5895 => "5 GHz",
        2400..=2500 => "2.4 GHz",
        _ => "Wi-Fi",
    }
}
pub fn map_radio_to_generation(radio: &str, band: &str) -> String {
    let radio = radio.to_ascii_lowercase();
    if radio.contains("802.11be") {
        "Wi-Fi 7"
    } else if radio.contains("802.11ax") {
        if band.starts_with('6') {
            "Wi-Fi 6E"
        } else {
            "Wi-Fi 6"
        }
    } else if radio.contains("802.11ac") {
        "Wi-Fi 5"
    } else if radio.contains("802.11n") {
        "Wi-Fi 4"
    } else {
        "Wi-Fi"
    }
    .into()
}
pub fn get_channel_frequency(channel: i32, band: &str) -> String {
    let mhz = if band.starts_with('6') && (1..=233).contains(&channel) {
        Some(5950 + channel * 5)
    } else if band.starts_with("2.4") && channel == 14 {
        Some(2484)
    } else if band.starts_with("2.4") && (1..=13).contains(&channel) {
        Some(2407 + channel * 5)
    } else if band.starts_with('5') && (32..=177).contains(&channel) {
        Some(5000 + channel * 5)
    } else {
        None
    };
    mhz.map(|mhz| format!("{:.3} GHz (Ch {channel})", mhz as f64 / 1000.0))
        .unwrap_or_else(|| band.into())
}
pub fn mask_bssid(value: &str, mode: &str) -> String {
    let parts: Vec<_> = value.split([':', '-']).collect();
    if mode == "full"
        || parts.len() != 6
        || parts
            .iter()
            .any(|p| p.len() != 2 || !p.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        "XX:XX:XX:XX:XX:XX".into()
    } else {
        format!(
            "{}:{}:{}:••:••:••",
            parts[0].to_uppercase(),
            parts[1].to_uppercase(),
            parts[2].to_uppercase()
        )
    }
}
fn raw_connection() -> Result<Option<Connection>, String> {
    #[cfg(windows)]
    {
        windows::get_connection()
    }
    #[cfg(target_os = "linux")]
    {
        linux::get_connection()
    }
    #[cfg(target_os = "macos")]
    {
        macos::get_connection()
    }
}
pub fn get_network_snapshot(backup: &HashMap<String, String>) -> Result<NetworkSnapshot, String> {
    let (mut connection, connection_error) = match raw_connection() {
        Ok(connection) => (connection, None),
        Err(error) => (None, Some(error)),
    };
    #[cfg(windows)]
    let mut networks = windows::get_networks(backup, connection.as_ref())?;
    #[cfg(target_os = "linux")]
    let mut networks = linux::get_networks(backup, connection.as_ref())?;
    #[cfg(target_os = "macos")]
    let mut networks = macos::get_networks(backup, connection.as_ref())?;
    networks.sort_by_cached_key(|network| (!network.live, network.name.to_lowercase()));
    if let Some(current) = connection.as_mut() {
        if let Some(network) = networks.iter().find(|network| {
            network.live
                && network.network_type == "wifi"
                && (network
                    .profile
                    .as_ref()
                    .is_some_and(|p| p == &current.profile)
                    || network.original_name == current.ssid)
        }) {
            current.name = network.name.clone();
            current.network_guid = Some(network.guid.clone());
        }
    }
    observe_connection(connection.as_ref());
    Ok(NetworkSnapshot {
        networks,
        connection,
        connection_error,
    })
}
pub fn get_current_connection() -> Result<Option<Connection>, String> {
    let snapshot = get_network_snapshot(&settings::read_backup()?)?;
    if let Some(error) = snapshot.connection_error {
        Err(error)
    } else {
        Ok(snapshot.connection)
    }
}
pub fn get_networks(backup: &HashMap<String, String>) -> Result<Vec<Network>, String> {
    get_network_snapshot(backup).map(|snapshot| snapshot.networks)
}
pub fn get_network_details(guid: &str) -> Result<NetworkDetails, String> {
    let snapshot = get_network_snapshot(&settings::read_backup()?)?;
    let network = snapshot
        .networks
        .iter()
        .find(|n| n.guid == guid || n.profile.as_deref() == Some(guid))
        .ok_or("Network details are no longer available. Refresh the network list.")?;
    let current = snapshot
        .connection
        .as_ref()
        .filter(|c| network.live && c.network_guid.as_deref() == Some(network.guid.as_str()));
    let bssid = current.and_then(|c| c.bssid.clone()).unwrap_or_default();
    let settings = settings::get_settings();
    Ok(NetworkDetails {
        guid: network.guid.clone(),
        masked_bssid: (!bssid.is_empty()).then(|| mask_bssid(&bssid, &settings.bssid_mask_mode)),
        bssid,
        channel: current.and_then(|c| c.channel).unwrap_or(0),
        auth: current
            .and_then(|c| c.auth.clone())
            .unwrap_or_else(|| "Unavailable".into()),
        band: current.map(|c| c.band.clone()).unwrap_or_else(|| {
            if network.network_type == "wifi" {
                "Saved Wi-Fi"
            } else {
                "Ethernet"
            }
            .into()
        }),
        frequency: current
            .and_then(|c| c.frequency.clone())
            .unwrap_or_else(|| "Unavailable".into()),
        generation: current.and_then(|c| c.generation.clone()),
        signal_dbm: current.and_then(|c| c.signal_dbm),
        snr: current.and_then(|c| c.snr),
        radio_type: current.and_then(|c| c.radio_type.clone()),
        rx_rate_mbps: current.and_then(|c| c.rx_rate_mbps),
        tx_rate_mbps: current.and_then(|c| c.tx_rate_mbps),
        last_connected: if network.live {
            "Active now"
        } else {
            "Saved profile"
        }
        .into(),
    })
}
pub fn rename_with_mode(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
    allow_prompt: bool,
) -> Result<(), String> {
    settings::validate_display_name(new_name)?;
    if let Some(expected) = current_name {
        let networks = get_networks(&settings::read_backup()?)?;
        if !networks
            .iter()
            .any(|network| network.guid == guid && network.name == expected)
        {
            return Err("The network name changed. Refresh before applying a new name.".into());
        }
    }
    #[cfg(windows)]
    windows::rename(guid, new_name, allow_prompt)?;
    #[cfg(target_os = "linux")]
    linux::rename(guid, new_name, current_name, allow_prompt)?;
    #[cfg(target_os = "macos")]
    macos::rename(guid, new_name, current_name, allow_prompt)?;
    let networks = get_networks(&settings::read_backup()?)?;
    if networks
        .iter()
        .any(|n| n.guid == guid && n.name == new_name)
    {
        Ok(())
    } else {
        Err("The operating system did not confirm the new display name. The original name is still saved.".into())
    }
}
pub fn rename_network(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<(), String> {
    rename_with_mode(guid, new_name, current_name, true)
}
pub fn reconnect_network(profile: Option<&str>) -> Result<bool, String> {
    let profile = profile
        .filter(|p| !p.trim().is_empty())
        .ok_or("Choose a saved Wi-Fi profile before reconnecting")?;
    #[cfg(windows)]
    {
        system::run("netsh", &["wlan", "connect", &format!("name={profile}")])?;
        for _ in 0..10 {
            if windows::get_connection()?.is_some_and(|connection| connection.profile == profile) {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        Err("Windows has not confirmed the Wi-Fi connection".into())
    }
    #[cfg(target_os = "linux")]
    {
        system::run("nmcli", &["connection", "up", "uuid", profile])?;
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        let interface = macos::wifi_interface()?;
        system::run("networksetup", &["-setairportnetwork", &interface, profile])?;
        for _ in 0..10 {
            let current = system::run("networksetup", &["-getairportnetwork", &interface])?;
            if current.strip_prefix("Current Wi-Fi Network: ") == Some(profile) {
                return Ok(true);
            }
            std::thread::sleep(Duration::from_millis(300));
        }
        Err("macOS has not confirmed the Wi-Fi connection. Check Wi-Fi permissions and saved credentials.".into())
    }
}
pub fn get_capabilities() -> PlatformCapabilities {
    let windows = cfg!(windows);
    let managed = !cfg!(target_os = "linux") || system::run("nmcli", &["--version"]).is_ok();
    PlatformCapabilities {
        platform: std::env::consts::OS.into(),
        network_rename: managed,
        wifi_sharing: managed,
        dns_configuration: managed,
        mac_randomization: windows,
        netbios_control: windows,
        roaming_tuning: windows,
        elevation_task: windows,
        gpu_control: false,
    }
}
pub fn is_task_configured() -> bool {
    cfg!(windows) && system::run("schtasks.exe", &["/query", "/tn", "NetMask_Elevated"]).is_ok()
}
pub fn get_elevation_status() -> ElevationStatus {
    let elevated = is_admin();
    let task = is_task_configured();
    ElevationStatus {
        is_elevated: elevated,
        silent_elevation_enabled: settings::get_settings().silent_elevation,
        task_configured: task,
        tier: if elevated {
            "admin"
        } else if task {
            "task"
        } else {
            "jit"
        }
        .into(),
    }
}
pub fn setup_silent_elevation() -> (bool, String) {
    if !cfg!(windows) {
        return (
            false,
            "Scheduled elevation tasks are available only on Windows".into(),
        );
    }
    let result: Result<(), String> = (|| {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let user =
            powershell_json("[Security.Principal.WindowsIdentity]::GetCurrent().User.Value")?
                .as_str()
                .ok_or("Cannot determine the current Windows user")?
                .to_owned();
        let script = format!(
            "$action = New-ScheduledTaskAction -Execute {} -Argument '--handoff'; $principal = New-ScheduledTaskPrincipal -UserId {} -LogonType Interactive -RunLevel Highest; $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName 'NetMask_Elevated' -Action $action -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null",
            powershell_literal(&exe.to_string_lossy()),
            powershell_literal(&user)
        );
        powershell(&script, !is_admin())?;
        if is_task_configured() {
            Ok(())
        } else {
            Err("Windows did not confirm the elevation task".into())
        }
    })();
    match result {
        Ok(()) => (true, "On-demand elevation task registered".into()),
        Err(error) => (false, error),
    }
}
pub fn remove_silent_elevation() -> (bool, String) {
    if !cfg!(windows) {
        return (
            false,
            "Scheduled elevation tasks are available only on Windows".into(),
        );
    }
    match powershell(
        "Unregister-ScheduledTask -TaskName 'NetMask_Elevated' -Confirm:$false -ErrorAction Stop",
        !is_admin(),
    ) {
        Ok(_) => (true, "Elevation task removed".into()),
        Err(error) => (false, error),
    }
}
pub fn elevate() -> Result<(), String> {
    if !cfg!(windows) {
        return Err("This platform prompts for permission for each supported operation".into());
    }
    if is_admin() {
        return Ok(());
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe = powershell_literal(&exe.to_string_lossy());
    let script = if settings::get_settings().silent_elevation && is_task_configured() {
        format!(
            "$task = Get-ScheduledTask -TaskName 'NetMask_Elevated' -ErrorAction Stop; if ($task.Actions.Execute -ne {exe} -or $task.Actions.Arguments -ne '--handoff') {{ throw 'Elevation task needs to be registered again for this installation.' }}; Start-ScheduledTask -TaskName 'NetMask_Elevated' -ErrorAction Stop"
        )
    } else {
        format!(
            "Start-Process -FilePath {exe} -ArgumentList '--handoff' -Verb RunAs -PassThru -WindowStyle Hidden | Out-Null"
        )
    };
    let script = system::encode_powershell(&format!("$ErrorActionPreference = 'Stop'; {script}"));
    system::run_checked(
        "powershell.exe",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &script,
        ],
        Duration::from_secs(120),
    )?;
    Ok(())
}
pub fn set_launch_on_startup(enabled: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
        if enabled {
            system::run(
                "reg.exe",
                &[
                    "add",
                    key,
                    "/v",
                    "NetMask",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\" --minimized", exe.to_string_lossy()),
                    "/f",
                ],
            )?;
        } else if system::run("reg.exe", &["query", key, "/v", "NetMask"]).is_ok() {
            system::run("reg.exe", &["delete", key, "/v", "NetMask", "/f"])?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        let directory = std::path::PathBuf::from(
            std::env::var_os("HOME").ok_or("Home directory is unavailable")?,
        )
        .join("Library/LaunchAgents");
        let file = directory.join("com.billighost.netmask.plist");
        if enabled {
            std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            let plist = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>Label</key><string>com.billighost.netmask</string><key>ProgramArguments</key><array><string>{}</string><string>--minimized</string></array><key>RunAtLoad</key><true/></dict></plist>",
                system::xml_escape(&exe.to_string_lossy())
            );
            std::fs::write(file, plist).map_err(|e| e.to_string())?;
        } else if file.exists() {
            std::fs::remove_file(file).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let base = std::env::var_os("XDG_CONFIG_HOME")
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| {
                std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
                    .join(".config")
            });
        let directory = base.join("autostart");
        let file = directory.join("netmask.desktop");
        if enabled {
            std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
            let quoted = exe
                .to_string_lossy()
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('$', "\\$")
                .replace(char::from(96), &format!("\\{}", char::from(96)))
                .replace('%', "%%");
            std::fs::write(file, format!("[Desktop Entry]\nType=Application\nName=NetMask\nExec=\"{quoted}\" --minimized\nTerminal=false\nX-GNOME-Autostart-enabled=true\n")).map_err(|e| e.to_string())?;
        } else if file.exists() {
            std::fs::remove_file(file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn radio_bands_do_not_confuse_overlapping_6ghz_channels() {
        assert_eq!(get_channel_frequency(37, "6 GHz"), "6.135 GHz (Ch 37)");
        assert_eq!(get_channel_frequency(14, "2.4 GHz"), "2.484 GHz (Ch 14)");
        assert_eq!(band_from_mhz(6115), "6 GHz");
        assert_eq!(map_radio_to_generation("802.11ax", "6 GHz"), "Wi-Fi 6E");
        assert_eq!(map_radio_to_generation("802.11ax", "2.4 GHz"), "Wi-Fi 6");
    }
    #[test]
    fn identifiers_and_bssid_masks_reject_malformed_input() {
        assert!(is_guid("{00112233-4455-6677-8899-aabbccddeeff}"));
        assert!(!is_guid("{../../Software}"));
        assert!(!is_guid("{zz112233-4455-6677-8899-aabbccddeeff}"));
        assert_eq!(
            mask_bssid("9A:B3:E0:F6:36:C3", "partial"),
            "9A:B3:E0:••:••:••"
        );
        assert_eq!(mask_bssid("bad", "partial"), "XX:XX:XX:XX:XX:XX");
        assert_eq!(decode_hex("436166C3A9").unwrap(), "Café".as_bytes());
    }
}
