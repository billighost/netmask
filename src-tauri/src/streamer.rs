#[cfg(unix)]
use crate::system;
use crate::types::StreamerStatus;
use crate::{operations, platform, settings};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recovery {
    guid: String,
    previous_name: String,
    mask: String,
    manual: bool,
    #[serde(default)]
    manual_until: Option<i64>,
}

#[derive(Default)]
struct State {
    loaded: bool,
    detected_app: Option<String>,
    record: Option<Recovery>,
    protected: bool,
    suppressed: bool,
    restore_at: Option<Instant>,
    last_scan: Option<Instant>,
    error: Option<String>,
}

static STREAMER: Mutex<State> = Mutex::new(State {
    loaded: false,
    detected_app: None,
    record: None,
    protected: false,
    suppressed: false,
    restore_at: None,
    last_scan: None,
    error: None,
});

fn save_record(record: &Option<Recovery>) -> Result<(), String> {
    settings::storage().write("streamer.json", record)
}

fn load_record(state: &mut State) -> Result<(), String> {
    if state.loaded {
        return Ok(());
    }
    let record = settings::storage()
        .read::<Option<Recovery>>("streamer.json")?
        .flatten();
    if let Some(record) = &record {
        validate_recovery(record, unix_now())?;
    }
    state.record = record;
    state.loaded = true;
    Ok(())
}

fn validate_recovery(record: &Recovery, now: i64) -> Result<(), String> {
    settings::validate_display_name(&record.previous_name)?;
    settings::validate_display_name(&record.mask)?;
    if record.guid.is_empty() || record.guid.len() > 512 {
        return Err("Invalid streamer recovery record".into());
    }
    if record.manual_until.is_some() && !record.manual {
        return Err("Only a manual sharing session can have an expiry".into());
    }
    if record
        .manual_until
        .is_some_and(|deadline| deadline <= 0 || deadline > now.saturating_add(24 * 60 * 60))
    {
        return Err("The saved sharing timer is outside its safe recovery window".into());
    }
    Ok(())
}

pub fn broadcast_app_name(process: &str) -> Option<&'static str> {
    let name = process
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(process)
        .trim()
        .trim_matches('"')
        .to_ascii_lowercase();
    match name.as_str() {
        "obs64.exe" | "obs32.exe" | "obs.exe" | "obs" => Some("OBS Studio"),
        "streamlabs obs.exe" | "streamlabs desktop.exe" | "streamlabs" => Some("Streamlabs"),
        "discord.exe" | "discord" => Some("Discord"),
        "zoom.exe" | "zoom" | "zoom.us" => Some("Zoom"),
        "teams.exe" | "ms-teams.exe" | "msteams.exe" | "microsoft teams" | "teams" => {
            Some("Microsoft Teams")
        }
        "twitchstudio.exe" => Some("Twitch Studio"),
        "xsplit.core.exe" | "xsplit.broadcaster.exe" | "xsplit.exe" => Some("XSplit"),
        "webex.exe" | "webex" | "webexhost.exe" | "ciscocollabhost.exe" | "ciscocollabhost" => {
            Some("Cisco Webex")
        }
        "slack.exe" | "slack" => Some("Slack"),
        "skype.exe" | "skype" => Some("Skype"),
        "loom.exe" | "loom" => Some("Loom"),
        "riverside.exe" | "riverside" => Some("Riverside"),
        "nvidia broadcast.exe" | "nvidia broadcast" | "nvidiabroadcast.exe" => {
            Some("NVIDIA Broadcast")
        }
        _ => None,
    }
}

fn detected_name(process: &str, custom: &[String]) -> Option<String> {
    if let Some(name) = broadcast_app_name(process) {
        return Some(name.into());
    }
    let basename = process
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(process)
        .trim()
        .trim_matches('"');
    custom
        .iter()
        .find(|candidate| candidate.trim().eq_ignore_ascii_case(basename))
        .map(|candidate| candidate.trim().to_owned())
}

fn running_broadcast_app() -> Result<Option<String>, String> {
    let preferences = settings::get_settings();
    let detected = running_broadcast_app_with_custom(&preferences.custom_broadcast_apps)?;
    Ok(detected.filter(|app| {
        !preferences
            .suppressed_broadcast_apps
            .iter()
            .any(|ignored| ignored.eq_ignore_ascii_case(app))
    }))
}

fn running_broadcast_app_with_custom(custom: &[String]) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows_sys::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
            TH32CS_SNAPPROCESS,
        };
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("Windows process detection is temporarily unavailable".into());
        }
        struct Snapshot(windows_sys::Win32::Foundation::HANDLE);
        impl Drop for Snapshot {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let snapshot = Snapshot(snapshot);
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if unsafe { Process32FirstW(snapshot.0, &mut entry) } == 0 {
            return Err("Windows process detection is temporarily unavailable".into());
        }
        loop {
            let length = entry
                .szExeFile
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(entry.szExeFile.len());
            let process = String::from_utf16_lossy(&entry.szExeFile[..length]);
            if let Some(app) = detected_name(&process, custom) {
                return Ok(Some(app));
            }
            if unsafe { Process32NextW(snapshot.0, &mut entry) } == 0 {
                return Ok(None);
            }
        }
    }
    #[cfg(unix)]
    {
        let output = system::run("ps", &["-A", "-o", "comm="])?;
        Ok(output
            .lines()
            .find_map(|line| detected_name(line.trim(), custom)))
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn status(state: &State, now: Instant) -> StreamerStatus {
    StreamerStatus {
        detected_app: state.detected_app.clone(),
        is_cloaked: state.protected,
        cooldown_seconds: state
            .restore_at
            .map(|deadline| deadline.saturating_duration_since(now).as_secs_f64().ceil() as i32)
            .unwrap_or(0),
        manual_seconds_remaining: state
            .record
            .as_ref()
            .filter(|record| record.manual)
            .and_then(|record| record.manual_until)
            .map(|deadline| deadline.saturating_sub(unix_now()))
            .unwrap_or(0),
        manual_timed: state
            .record
            .as_ref()
            .is_some_and(|record| record.manual && record.manual_until.is_some()),
        error: state.error.clone(),
    }
}

fn protect_persisted_record(state: &mut State) {
    state.protected = state.record.is_some();
}

pub fn get_streamer_status() -> StreamerStatus {
    let now = Instant::now();
    let mut state = STREAMER.lock().unwrap_or_else(|e| e.into_inner());
    if !state.loaded {
        match load_record(&mut state) {
            Ok(()) => {
                // A persisted record means the previous process intended the
                // UI and supported OS label to remain private. Redact from the
                // first renderer snapshot; the worker verifies the OS state.
                protect_persisted_record(&mut state);
            }
            Err(error) => state.error = Some(error),
        }
    }
    status(&state, now)
}

fn activate(state: &mut State, manual: bool, manual_until: Option<i64>) -> Result<(), String> {
    let snapshot = platform::get_network_snapshot(&settings::read_backup()?)?;
    let connection = snapshot
        .connection
        .ok_or("Connect to Wi-Fi before masking its display name")?;
    let guid = connection
        .network_guid
        .ok_or("The active network has no supported display-name identifier")?;
    let network = snapshot
        .networks
        .iter()
        .find(|n| n.guid == guid && n.can_rename)
        .ok_or("Display-name masking is unavailable for this network")?;
    let mask = settings::get_settings()
        .streamer_mask_name
        .trim()
        .to_owned();
    if network.name == mask {
        return Err("The network already uses the mask name. Choose a different mask name to preserve a recoverable original.".into());
    }
    let record = Recovery {
        guid,
        previous_name: network.name.clone(),
        mask,
        manual,
        manual_until,
    };
    save_record(&Some(record.clone()))?;
    state.record = Some(record.clone());
    if let Err(error) = operations::rename(
        &record.guid,
        &record.mask,
        Some(&record.previous_name),
        manual,
    ) {
        // A rejected change that left the old name intact must permit retry.
        // If the OS changed the name or cannot be inspected, keep recovery data.
        let unchanged = settings::read_backup()
            .and_then(|backup| platform::get_networks(&backup))
            .is_ok_and(|networks| {
                networks.iter().any(|network| {
                    network.guid == record.guid && network.name == record.previous_name
                })
            });
        if unchanged {
            save_record(&None)?;
            state.record = None;
        }
        return Err(error);
    }
    state.protected = true;
    state.restore_at = None;
    state.error = None;
    Ok(())
}

fn restore(state: &mut State, allow_prompt: bool) -> Result<(), String> {
    if let Some(record) = &state.record {
        let networks = platform::get_networks(&settings::read_backup()?)?;
        let network = networks
            .iter()
            .find(|n| n.guid == record.guid)
            .ok_or("The masked profile is unavailable; its recovery record has been kept")?;
        // A later intentional rename takes precedence over automatic restoration.
        if network.name == record.mask {
            operations::rename(
                &record.guid,
                &record.previous_name,
                Some(&record.mask),
                allow_prompt,
            )?;
        }
        save_record(&None)?;
    }
    state.record = None;
    state.protected = false;
    state.restore_at = None;
    state.error = None;
    Ok(())
}

pub fn check_streamer_now() -> StreamerStatus {
    let now = Instant::now();
    let mut state = STREAMER.lock().unwrap_or_else(|e| e.into_inner());
    if let Err(error) = load_record(&mut state) {
        state.error = Some(error);
        return status(&state, now);
    }
    let scan_due = state
        .last_scan
        .is_none_or(|last| now.saturating_duration_since(last) >= Duration::from_secs(5));
    let detection_mode = settings::get_settings().streamer_detection_mode;
    let scan_enabled = matches!(detection_mode.as_str(), "suggest" | "automatic");
    let auto_enabled = detection_mode == "automatic";
    if scan_due {
        state.last_scan = Some(now);
        match if scan_enabled {
            running_broadcast_app()
        } else {
            Ok(None)
        } {
            Ok(app) => {
                state.error = None;
                state.detected_app = app;
                if state.detected_app.is_none() {
                    state.suppressed = false;
                }
            }
            Err(error) => {
                state.error = Some(error);
                return status(&state, now);
            }
        }
        if let Some(record) = state.record.clone() {
            match settings::read_backup().and_then(|backup| platform::get_network_snapshot(&backup))
            {
                Ok(snapshot) => {
                    let current = snapshot.connection.as_ref();
                    state.protected = current.is_some_and(|c| {
                        c.network_guid.as_deref() == Some(record.guid.as_str())
                            && c.name == record.mask
                    });
                    if current.is_some() && !state.protected {
                        if let Err(error) = restore(&mut state, false) {
                            state.error = Some(error);
                        }
                    }
                }
                Err(error) => {
                    state.protected = false;
                    state.error = Some(error);
                }
            }
        }
    }
    let expired_manual = state.record.as_ref().is_some_and(|record| {
        record.manual
            && record
                .manual_until
                .is_some_and(|deadline| deadline <= unix_now())
    });
    if expired_manual {
        // The timer is an explicit user action. Request OS permission when it
        // is required so expiry does not leave the private label behind.
        if let Err(error) = restore(&mut state, true) {
            state.error = Some(error);
            return status(&state, Instant::now());
        }
    }
    let auto = auto_enabled && state.detected_app.is_some() && !state.suppressed;
    if auto {
        state.restore_at = None;
    }
    let manual = state.record.as_ref().is_some_and(|record| record.manual);
    if auto && state.record.is_none() && scan_due {
        if let Err(error) = activate(&mut state, false, None) {
            state.error = Some(error);
        }
    } else if !auto && !manual && state.record.is_some() {
        let deadline = *state
            .restore_at
            .get_or_insert(now + Duration::from_secs(10));
        if now >= deadline {
            if let Err(error) = restore(&mut state, false) {
                state.error = Some(error);
                state.restore_at = Some(now + Duration::from_secs(10));
            }
        }
    }
    status(&state, Instant::now())
}

pub fn toggle_streamer_cloak() -> StreamerStatus {
    let mut state = STREAMER.lock().unwrap_or_else(|e| e.into_inner());
    let result = load_record(&mut state).and_then(|_| {
        if state.record.is_some() {
            restore(&mut state, true)?;
            state.suppressed = true;
            Ok(())
        } else {
            state.suppressed = false;
            activate(&mut state, true, None)
        }
    });
    if let Err(error) = result {
        state.error = Some(error);
    }
    status(&state, Instant::now())
}

pub fn start_streamer_timer(minutes: i32) -> StreamerStatus {
    let mut state = STREAMER.lock().unwrap_or_else(|e| e.into_inner());
    let result = (|| {
        if !matches!(minutes, 15 | 30 | 60) {
            return Err("Choose a 15, 30, or 60 minute sharing session".into());
        }
        load_record(&mut state)?;
        let deadline = unix_now() + i64::from(minutes) * 60;
        if let Some(mut record) = state.record.clone() {
            let snapshot = settings::read_backup()
                .and_then(|backup| platform::get_network_snapshot(&backup))?;
            let still_masked = snapshot.connection.is_some_and(|connection| {
                connection.network_guid.as_deref() == Some(record.guid.as_str())
                    && connection.name == record.mask
            });
            if !still_masked {
                restore(&mut state, true)?;
                state.suppressed = false;
                return activate(&mut state, true, Some(deadline));
            }
            record.manual = true;
            record.manual_until = Some(deadline);
            save_record(&Some(record.clone()))?;
            state.record = Some(record);
            state.protected = true;
            state.restore_at = None;
            state.suppressed = false;
            state.error = None;
            Ok(())
        } else {
            state.suppressed = false;
            activate(&mut state, true, Some(deadline))
        }
    })();
    if let Err(error) = result {
        state.error = Some(error);
    }
    status(&state, Instant::now())
}

pub fn shutdown() {
    let mut state = STREAMER.lock().unwrap_or_else(|e| e.into_inner());
    if state.record.as_ref().is_some_and(|record| !record.manual) {
        if let Err(error) = restore(&mut state, false) {
            log::warn!("Streamer recovery deferred: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[cfg(windows)]
    fn broadcast_detection_uses_the_native_process_snapshot_without_a_shell_timeout() {
        let started = Instant::now();
        running_broadcast_app_with_custom(&[]).unwrap();
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn cooldown_uses_elapsed_time_and_manual_masks_do_not_depend_on_process_detection() {
        let start = Instant::now();
        let record = Recovery {
            guid: "network-id".into(),
            previous_name: "Studio".into(),
            mask: "Private".into(),
            manual: true,
            manual_until: None,
        };
        let state = State {
            record: Some(record),
            protected: true,
            restore_at: Some(start + Duration::from_secs(10)),
            ..State::default()
        };
        assert_eq!(
            status(&state, start + Duration::from_secs(3)).cooldown_seconds,
            7
        );
        assert_eq!(
            status(&state, start + Duration::from_secs(15)).cooldown_seconds,
            0
        );
        assert!(state.record.unwrap().manual);
        assert_eq!(
            broadcast_app_name("C:\\Apps\\obs64.exe"),
            Some("OBS Studio")
        );
        assert_eq!(broadcast_app_name("obs64.exe.backup"), None);
        assert_eq!(broadcast_app_name("Webex.exe"), Some("Cisco Webex"));
        assert_eq!(
            broadcast_app_name("NVIDIA Broadcast.exe"),
            Some("NVIDIA Broadcast")
        );
        assert_eq!(
            detected_name("C:\\Tools\\MyCapture.exe", &["mycapture.exe".into()]),
            Some("mycapture.exe".into())
        );
        assert_eq!(
            detected_name("not-my-capture.exe", &["mycapture.exe".into()]),
            None
        );
    }

    #[test]
    fn persisted_records_are_private_before_the_first_worker_verification() {
        let mut state = State {
            record: Some(Recovery {
                guid: "network-id".into(),
                previous_name: "Original".into(),
                mask: "Private".into(),
                manual: true,
                manual_until: None,
            }),
            ..State::default()
        };
        protect_persisted_record(&mut state);
        assert!(status(&state, Instant::now()).is_cloaked);
    }

    #[test]
    fn expired_timed_records_remain_valid_for_restoration_after_a_long_shutdown() {
        let record = Recovery {
            guid: "network-id".into(),
            previous_name: "Original".into(),
            mask: "Private".into(),
            manual: true,
            manual_until: Some(1_700_000_000),
        };
        assert!(validate_recovery(&record, 1_700_172_800).is_ok());
    }

    #[test]
    fn recovery_rejects_impossible_or_non_manual_timers() {
        let mut record = Recovery {
            guid: "network-id".into(),
            previous_name: "Original".into(),
            mask: "Private".into(),
            manual: false,
            manual_until: Some(1_700_000_100),
        };
        assert!(validate_recovery(&record, 1_700_000_000).is_err());
        record.manual = true;
        record.manual_until = Some(1_700_086_401);
        assert!(validate_recovery(&record, 1_700_000_000).is_err());
    }
}
