use crate::types::StreamerStatus;
use crate::{operations, platform, settings, system};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recovery {
    guid: String,
    previous_name: String,
    mask: String,
    manual: bool,
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
        settings::validate_display_name(&record.previous_name)?;
        settings::validate_display_name(&record.mask)?;
        if record.guid.is_empty() || record.guid.len() > 512 {
            return Err("Invalid streamer recovery record".into());
        }
    }
    state.record = record;
    state.loaded = true;
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
        "teams.exe" | "ms-teams.exe" | "msteams.exe" | "microsoft teams" => Some("Microsoft Teams"),
        "twitchstudio.exe" => Some("Twitch Studio"),
        "xsplit.core.exe" => Some("XSplit"),
        _ => None,
    }
}

fn running_broadcast_app() -> Result<Option<String>, String> {
    #[cfg(windows)]
    let output = system::run("tasklist.exe", &["/FO", "CSV", "/NH"])?;
    #[cfg(unix)]
    let output = system::run("ps", &["-A", "-o", "comm="])?;
    Ok(output.lines().find_map(|line| {
        #[cfg(windows)]
        let process = line
            .strip_prefix('"')
            .and_then(|s| s.split('"').next())
            .unwrap_or("");
        #[cfg(unix)]
        let process = line.trim();
        broadcast_app_name(process).map(str::to_owned)
    }))
}

fn status(state: &State, now: Instant) -> StreamerStatus {
    StreamerStatus {
        detected_app: state.detected_app.clone(),
        is_cloaked: state.protected,
        cooldown_seconds: state
            .restore_at
            .map(|deadline| deadline.saturating_duration_since(now).as_secs_f64().ceil() as i32)
            .unwrap_or(0),
        error: state.error.clone(),
    }
}

pub fn get_streamer_status() -> StreamerStatus {
    status(
        &STREAMER.lock().unwrap_or_else(|e| e.into_inner()),
        Instant::now(),
    )
}

fn activate(state: &mut State, manual: bool) -> Result<(), String> {
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
    };
    save_record(&Some(record.clone()))?;
    state.record = Some(record.clone());
    operations::rename(
        &record.guid,
        &record.mask,
        Some(&record.previous_name),
        manual,
    )?;
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
    if scan_due {
        state.last_scan = Some(now);
        match running_broadcast_app() {
            Ok(app) => {
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
    let auto = settings::get_settings().auto_cloak_streamer
        && state.detected_app.is_some()
        && !state.suppressed;
    if auto {
        state.restore_at = None;
    }
    let manual = state.record.as_ref().is_some_and(|record| record.manual);
    if auto && state.record.is_none() && scan_due {
        if let Err(error) = activate(&mut state, false) {
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
            activate(&mut state, true)
        }
    });
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
    fn cooldown_uses_elapsed_time_and_manual_masks_do_not_depend_on_process_detection() {
        let start = Instant::now();
        let record = Recovery {
            guid: "network-id".into(),
            previous_name: "Studio".into(),
            mask: "Private".into(),
            manual: true,
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
    }
}
