use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use crate::types::AppSettings;

pub fn get_data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let prog_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        PathBuf::from(prog_data).join("NetMask")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home).join("Library/Application Support/NetMask")
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let xdg = std::env::var("XDG_CONFIG_HOME").ok();
        if let Some(x) = xdg {
            PathBuf::from(x).join("netmask")
        } else {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".config/netmask")
        }
    }
}

pub fn ensure_data_dir() {
    let dir = get_data_dir();
    let _ = fs::create_dir_all(&dir);
}

pub fn default_shortcuts() -> HashMap<String, String> {
    let mut m = HashMap::new();
    m.insert("refresh".into(), "Ctrl+R".into());
    m.insert("focusRename".into(), "Ctrl+N".into());
    m.insert("applyRename".into(), "Ctrl+Enter".into());
    m.insert("restoreOriginal".into(), "Ctrl+Shift+Z".into());
    m.insert("reconnectWifi".into(), "Ctrl+Shift+R".into());
    m.insert("selectNext".into(), "ArrowDown".into());
    m.insert("selectPrev".into(), "ArrowUp".into());
    m.insert("filterSearch".into(), "Ctrl+F".into());
    m.insert("viewDetails".into(), "Ctrl+D".into());
    m.insert("toggleStreamer".into(), "Ctrl+Shift+S".into());
    m.insert("peekBssid".into(), "Ctrl+Shift+B".into());
    m.insert("trimMemory".into(), "Ctrl+Shift+M".into());
    m.insert("runSpeedTest".into(), "Ctrl+Shift+T".into());
    m.insert("openSettings".into(), "Ctrl+,".into());
    m.insert("openShortcuts".into(), "Ctrl+/".into());
    m.insert("closeModals".into(), "Escape".into());
    m
}

pub fn default_settings() -> AppSettings {
    AppSettings {
        minimize_to_tray: true,
        launch_on_startup: false,
        auto_refresh_interval: 30,
        theme: "dark".into(),
        show_ethernet: true,
        ultra_low_memory: false,
        auto_cloak_streamer: true,
        streamer_mask_name: "StreamSafe-Fiber-Pro".into(),
        bssid_cloaking: true,
        bssid_mask_mode: "partial".into(),
        silent_elevation: true,
        window_bounds: None,
        shortcuts: default_shortcuts(),
    }
}

pub fn read_backup() -> HashMap<String, String> {
    let file = get_data_dir().join("names.json");
    if let Ok(content) = fs::read_to_string(&file) {
        if let Ok(parsed) = serde_json::from_str(&content) {
            return parsed;
        }
    }
    HashMap::new()
}

pub fn write_backup(bk: &HashMap<String, String>) {
    ensure_data_dir();
    let file = get_data_dir().join("names.json");
    if let Ok(serialized) = serde_json::to_string_pretty(bk) {
        let _ = fs::write(file, serialized);
    }
}

pub fn get_settings() -> AppSettings {
    let file = get_data_dir().join("settings.json");
    if let Ok(content) = fs::read_to_string(&file) {
        if let Ok(mut parsed) = serde_json::from_str::<AppSettings>(&content) {
            // merge default shortcuts
            let def_sc = default_shortcuts();
            for (k, v) in def_sc {
                parsed.shortcuts.entry(k).or_insert(v);
            }
            return parsed;
        }
    }
    default_settings()
}

pub fn set_setting(key: &str, value: serde_json::Value) {
    ensure_data_dir();
    let mut current = get_settings();
    let file = get_data_dir().join("settings.json");
    
    // convert current settings to json Value, update key, convert back
    if let Ok(mut val) = serde_json::to_value(&current) {
        if let Some(obj) = val.as_object_mut() {
            obj.insert(key.to_string(), value);
            if let Ok(updated) = serde_json::from_value::<AppSettings>(val) {
                current = updated;
            }
        }
    }
    if let Ok(serialized) = serde_json::to_string_pretty(&current) {
        let _ = fs::write(file, serialized);
    }
}

