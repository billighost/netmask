use crate::types::AppSettings;
use serde::{Serialize, de::DeserializeOwned};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};

const MAX_JSON_BYTES: u64 = 2 * 1024 * 1024;
static WRITE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static SETTINGS_CACHE: Mutex<Option<AppSettings>> = Mutex::new(None);
static STORAGE: LazyLock<JsonStorage> = LazyLock::new(|| JsonStorage::new(get_data_dir()));

/// Storage is injectable so persistence tests never touch a user's network backups.
pub struct JsonStorage {
    pub directory: PathBuf,
}

impl JsonStorage {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn ensure(&self) -> Result<(), String> {
        fs::create_dir_all(&self.directory)
            .map_err(|e| format!("Cannot create NetMask's data directory: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.directory, fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Cannot protect NetMask's data directory: {e}"))?;
        }
        Ok(())
    }

    fn path(&self, name: &str) -> Result<PathBuf, String> {
        if name.is_empty() || name.contains(['/', '\\']) || name == ".." {
            return Err("Invalid storage filename".into());
        }
        Ok(self.directory.join(name))
    }

    pub fn read<T: DeserializeOwned>(&self, name: &str) -> Result<Option<T>, String> {
        let path = self.path(name)?;
        let file = match File::open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("Cannot read {name}: {e}")),
        };
        let mut data = Vec::new();
        file.take(MAX_JSON_BYTES + 1)
            .read_to_end(&mut data)
            .map_err(|e| format!("Cannot read {name}: {e}"))?;
        if data.len() as u64 > MAX_JSON_BYTES {
            return Err(format!("{name} exceeds the storage size limit"));
        }
        serde_json::from_slice(&data)
            .map(Some)
            .map_err(|e| format!("Cannot parse {name}; the existing file has been preserved: {e}"))
    }

    pub fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        self.ensure()?;
        let path = self.path(name)?;
        let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        if bytes.len() as u64 > MAX_JSON_BYTES {
            return Err(format!("{name} exceeds the storage size limit"));
        }
        let sequence = WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary =
            self.directory
                .join(format!(".{name}.{}.{}.tmp", std::process::id(), sequence));
        let result = (|| {
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut file = options
                .open(&temporary)
                .map_err(|e| format!("Cannot prepare {name}: {e}"))?;
            file.write_all(&bytes)
                .map_err(|e| format!("Cannot write {name}: {e}"))?;
            file.sync_all()
                .map_err(|e| format!("Cannot flush {name}: {e}"))?;
            drop(file);
            fs::rename(&temporary, &path).map_err(|e| format!("Cannot replace {name}: {e}"))?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result
    }

    pub fn with_lock<T>(
        &self,
        name: &str,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.ensure()?;
        let lock_path = self.path(&format!(".{name}.lock"))?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(lock_path)
            .map_err(|e| format!("Cannot lock {name}: {e}"))?;
        lock.lock()
            .map_err(|e| format!("Cannot lock {name}: {e}"))?;
        // The operating system releases the lock even after an error or process exit.
        operation()
    }
}

pub fn get_data_dir() -> PathBuf {
    // Used by local diagnostics to isolate settings from the user's data.
    if let Some(directory) = std::env::var_os("NETMASK_DATA_DIR")
        .map(PathBuf::from)
        .filter(|directory| directory.is_absolute())
    {
        return directory;
    }
    #[cfg(windows)]
    {
        let base = std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        base.join("NetMask")
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
            .join("Library/Application Support/NetMask")
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config")
            })
            .join("netmask")
    }
}

pub fn storage() -> &'static JsonStorage {
    &STORAGE
}

pub fn ensure_data_dir() -> Result<(), String> {
    storage().ensure()
}

pub fn instance_lock(wait_for_handoff: bool) -> Result<Option<File>, String> {
    storage().ensure()?;
    let started = std::time::Instant::now();
    loop {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(storage().path(".instance.lock")?)
            .map_err(|_| "Cannot open the app instance lock")?;
        match file.try_lock() {
            Ok(()) => return Ok(Some(file)),
            Err(std::fs::TryLockError::WouldBlock)
                if wait_for_handoff && started.elapsed() < std::time::Duration::from_secs(30) =>
            {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(std::fs::TryLockError::WouldBlock) => return Ok(None),
            Err(_) => return Err("Cannot lock this NetMask instance".into()),
        }
    }
}

/// Previous Windows installations used ProgramData. Copy only missing files;
/// never modify the legacy directory or overwrite an existing per-user file.
pub fn migrate_legacy_data() -> Result<(), String> {
    #[cfg(windows)]
    {
        let legacy = PathBuf::from(
            std::env::var_os("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into()),
        )
        .join("NetMask");
        for name in ["settings.json", "names.json"] {
            if storage().directory.join(name).exists() {
                continue;
            }
            let old_storage = JsonStorage::new(legacy.clone());
            if let Some(value) = old_storage.read::<serde_json::Value>(name)? {
                storage().write(name, &value)?;
            }
        }
    }
    Ok(())
}

pub fn default_shortcuts() -> HashMap<String, String> {
    [
        ("refresh", "Ctrl+R"),
        ("focusRename", "Ctrl+N"),
        ("applyRename", "Ctrl+Enter"),
        ("restoreOriginal", "Ctrl+Shift+Z"),
        ("reconnectWifi", "Ctrl+Shift+R"),
        ("selectNext", "ArrowDown"),
        ("selectPrev", "ArrowUp"),
        ("filterSearch", "Ctrl+F"),
        ("viewDetails", "Ctrl+D"),
        ("toggleStreamer", "Ctrl+Shift+S"),
        ("peekBssid", "Ctrl+Shift+B"),
        ("trimMemory", "Ctrl+Shift+M"),
        ("runSpeedTest", "Ctrl+Shift+T"),
        ("openSettings", "Ctrl+,"),
        ("openShortcuts", "Ctrl+/"),
        ("closeModals", "Escape"),
    ]
    .into_iter()
    .map(|(k, v)| (k.into(), v.into()))
    .collect()
}

pub fn default_settings() -> AppSettings {
    AppSettings {
        minimize_to_tray: true,
        launch_on_startup: false,
        auto_refresh_interval: 30,
        theme: "light".into(),
        show_ethernet: true,
        ultra_low_memory: false,
        auto_cloak_streamer: true,
        streamer_mask_name: "Private network".into(),
        bssid_cloaking: true,
        bssid_mask_mode: "partial".into(),
        silent_elevation: true,
        window_bounds: None,
        shortcuts: default_shortcuts(),
    }
}

pub fn validate_display_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.chars().count() > 128 || name.chars().any(char::is_control) {
        return Err(
            "Use a non-empty display name of up to 128 characters without control characters"
                .into(),
        );
    }
    Ok(())
}

fn validate_settings(settings: &AppSettings) -> Result<(), String> {
    if !matches!(settings.theme.as_str(), "dark" | "light") {
        return Err("Theme must be dark or light".into());
    }
    if settings.auto_refresh_interval != 0 && !(5..=3600).contains(&settings.auto_refresh_interval)
    {
        return Err("Refresh interval must be off or between 5 and 3600 seconds".into());
    }
    if !matches!(settings.bssid_mask_mode.as_str(), "full" | "partial") {
        return Err("BSSID mask must be full or partial".into());
    }
    validate_display_name(&settings.streamer_mask_name)?;
    if settings.shortcuts.len() > 64
        || settings
            .shortcuts
            .iter()
            .any(|(k, v)| k.len() > 80 || v.len() > 80 || v.chars().any(char::is_control))
    {
        return Err("Invalid keyboard shortcuts".into());
    }
    if let Some(bounds) = &settings.window_bounds {
        if !(100..=16384).contains(&bounds.width) || !(100..=16384).contains(&bounds.height) {
            return Err("Invalid window dimensions".into());
        }
    }
    Ok(())
}

pub fn load_settings(store: &JsonStorage) -> Result<AppSettings, String> {
    let mut settings: AppSettings = store.read("settings.json")?.unwrap_or_default();
    for (key, value) in default_shortcuts() {
        settings.shortcuts.entry(key).or_insert(value);
    }
    validate_settings(&settings)?;
    Ok(settings)
}

pub fn get_settings() -> AppSettings {
    let mut cache = SETTINGS_CACHE.lock().unwrap_or_else(|e| e.into_inner());
    cache
        .get_or_insert_with(|| {
            load_settings(storage()).unwrap_or_else(|error| {
                log::warn!("Settings could not be loaded: {error}");
                default_settings()
            })
        })
        .clone()
}

pub fn get_settings_checked() -> Result<AppSettings, String> {
    storage().with_lock("settings", || {
        let settings = load_settings(storage())?;
        *SETTINGS_CACHE
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(settings.clone());
        Ok(settings)
    })
}

pub fn update_settings_value(
    current: &AppSettings,
    key: &str,
    value: serde_json::Value,
) -> Result<AppSettings, String> {
    if !matches!(
        key,
        "minimizeToTray"
            | "launchOnStartup"
            | "autoRefreshInterval"
            | "theme"
            | "showEthernet"
            | "ultraLowMemory"
            | "autoCloakStreamer"
            | "streamerMaskName"
            | "bssidCloaking"
            | "bssidMaskMode"
            | "silentElevation"
            | "windowBounds"
            | "shortcuts"
    ) {
        return Err(format!("Unknown setting: {key}"));
    }
    let mut json = serde_json::to_value(current).map_err(|e| e.to_string())?;
    json.as_object_mut()
        .ok_or("Settings must be an object")?
        .insert(key.into(), value);
    let updated: AppSettings =
        serde_json::from_value(json).map_err(|e| format!("Invalid setting: {e}"))?;
    validate_settings(&updated)?;
    Ok(updated)
}

pub fn set_setting(key: &str, value: serde_json::Value) -> Result<(), String> {
    storage().with_lock("settings", || {
        // Read from disk while holding the process-independent lock.
        let current = load_settings(storage())?;
        let updated = update_settings_value(&current, key, value)?;
        if key == "ultraLowMemory" && updated.ultra_low_memory {
            return Err("GPU disabling is unavailable in this desktop runtime".into());
        }
        if current.launch_on_startup != updated.launch_on_startup {
            crate::platform::set_launch_on_startup(updated.launch_on_startup)?;
        }
        if let Err(error) = storage().write("settings.json", &updated) {
            if current.launch_on_startup != updated.launch_on_startup {
                let _ = crate::platform::set_launch_on_startup(current.launch_on_startup);
            }
            return Err(error);
        }
        *SETTINGS_CACHE.lock().unwrap_or_else(|e| e.into_inner()) = Some(updated);
        Ok(())
    })
}

pub fn read_backup() -> Result<HashMap<String, String>, String> {
    let backup: HashMap<String, String> = storage().read("names.json")?.unwrap_or_default();
    normalize_backup(backup)
}

fn normalize_backup(backup: HashMap<String, String>) -> Result<HashMap<String, String>, String> {
    #[cfg(windows)]
    {
        let mut normalized = HashMap::new();
        for (id, name) in backup {
            let id = if crate::platform::is_guid(&id) {
                format!("{{{}}}", id.trim_matches(['{', '}']).to_ascii_lowercase())
            } else {
                id
            };
            if normalized
                .get(&id)
                .is_some_and(|existing| existing != &name)
            {
                return Err("The backup contains conflicting originals for the same Windows network; the file has been preserved".into());
            }
            normalized.insert(id, name);
        }
        Ok(normalized)
    }
    #[cfg(not(windows))]
    Ok(backup)
}

pub fn write_backup(backup: &HashMap<String, String>) -> Result<(), String> {
    storage().write("names.json", backup)
}

pub fn validate_backup_json(json: &str) -> Result<HashMap<String, String>, String> {
    if json.len() as u64 > MAX_JSON_BYTES {
        return Err("Backup is too large".into());
    }
    let backup: HashMap<String, String> =
        serde_json::from_str(json).map_err(|e| format!("Invalid backup: {e}"))?;
    if backup.len() > 10000 {
        return Err("Backup contains too many networks".into());
    }
    for (id, name) in &backup {
        if id.trim().is_empty() || id.len() > 512 || id.chars().any(char::is_control) {
            return Err("Backup contains an invalid network identifier".into());
        }
        validate_display_name(name)?;
    }
    normalize_backup(backup)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_storage(label: &str) -> JsonStorage {
        JsonStorage::new(std::env::temp_dir().join(format!(
            "netmask-{label}-{}-{}",
            std::process::id(),
            WRITE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        )))
    }

    fn clean_test_storage(store: &JsonStorage) {
        let root = std::env::temp_dir().canonicalize().unwrap();
        let target = store.directory.canonicalize().unwrap();
        assert_eq!(target.parent(), Some(root.as_path()));
        assert!(
            target
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("netmask-")
        );
        fs::remove_dir_all(target).unwrap();
    }

    #[test]
    fn partial_legacy_settings_keep_new_defaults_and_unassigned_shortcuts() {
        let store = test_storage("defaults");
        store
            .write(
                "settings.json",
                &serde_json::json!({"theme": "light", "shortcuts": {"refresh": ""}}),
            )
            .unwrap();
        let settings = load_settings(&store).unwrap();
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.shortcuts["refresh"], "");
        assert_eq!(settings.shortcuts["focusRename"], "Ctrl+N");
        assert!(settings.bssid_cloaking);
        clean_test_storage(&store);
    }

    #[test]
    fn corrupt_storage_is_preserved_and_atomic_replacement_reads_complete_json() {
        let store = test_storage("atomic");
        store.ensure().unwrap();
        fs::write(store.directory.join("names.json"), "{broken").unwrap();
        assert!(store.read::<HashMap<String, String>>("names.json").is_err());
        assert_eq!(
            fs::read_to_string(store.directory.join("names.json")).unwrap(),
            "{broken"
        );
        store
            .write("names.json", &serde_json::json!({"network": "Original"}))
            .unwrap();
        store
            .write("names.json", &serde_json::json!({"network": "Next"}))
            .unwrap();
        assert_eq!(
            store
                .read::<HashMap<String, String>>("names.json")
                .unwrap()
                .unwrap()["network"],
            "Next"
        );
        assert!(store.path("../settings.json").is_err());
        clean_test_storage(&store);
    }

    #[test]
    fn invalid_setting_types_and_values_do_not_change_previous_settings() {
        let settings = default_settings();
        assert!(
            update_settings_value(&settings, "minimizeToTray", serde_json::json!("true")).is_err()
        );
        assert!(update_settings_value(&settings, "theme", serde_json::json!("unknown")).is_err());
        assert!(
            update_settings_value(&settings, "autoRefreshInterval", serde_json::json!(-1)).is_err()
        );
        assert!(update_settings_value(&settings, "unknown", serde_json::json!(true)).is_err());
        assert_eq!(settings.theme, "light");
        assert!(validate_display_name("a\nb").is_err());
        assert!(validate_display_name("Café 🛜").is_ok());
    }

    #[test]
    fn backup_import_rejects_invalid_and_unbounded_data() {
        assert!(validate_backup_json(r#"{"id":42}"#).is_err());
        assert!(validate_backup_json(r#"{"id":""}"#).is_err());
        assert!(validate_backup_json(r#"{"id":"Original"}"#).is_ok());
    }
    #[test]
    fn independent_file_handles_serialize_read_modify_write_operations() {
        let store = test_storage("locks");
        store.write("counter.json", &0u32).unwrap();
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..4)
                .map(|_| {
                    scope.spawn(|| {
                        for _ in 0..12 {
                            store
                                .with_lock("counter", || {
                                    let value: u32 = store.read("counter.json")?.unwrap();
                                    store.write("counter.json", &(value + 1))
                                })
                                .unwrap();
                        }
                    })
                })
                .collect();
            for handle in handles {
                handle.join().unwrap();
            }
        });
        assert_eq!(store.read::<u32>("counter.json").unwrap(), Some(48));
        clean_test_storage(&store);
    }
    #[test]
    #[cfg(windows)]
    fn imported_guid_spellings_are_normalized_before_merging_recovery_records() {
        let backup =
            validate_backup_json(r#"{"00112233-4455-6677-8899-AABBCCDDEEFF":"Original"}"#).unwrap();
        assert_eq!(backup["{00112233-4455-6677-8899-aabbccddeeff}"], "Original");
        assert!(validate_backup_json(r#"{"00112233-4455-6677-8899-AABBCCDDEEFF":"A","{00112233-4455-6677-8899-aabbccddeeff}":"B"}"#).is_err());
    }
}
