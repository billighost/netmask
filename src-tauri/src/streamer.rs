use std::sync::Mutex;
use regex::Regex;
use crate::types::StreamerStatus;
use crate::platform::{get_current_connection, rename_network, run_cmd_output};
use crate::settings::get_settings;

pub struct StreamerState {
    pub detected_app: Option<String>,
    pub is_cloaked: bool,
    pub cloaked_guid: Option<String>,
    pub original_name: Option<String>,
    pub cooldown_seconds: i32,
}

static STREAMER: Mutex<StreamerState> = Mutex::new(StreamerState {
    detected_app: None,
    is_cloaked: false,
    cloaked_guid: None,
    original_name: None,
    cooldown_seconds: 0,
});

pub fn check_running_broadcast_apps() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let out = run_cmd_output("tasklist.exe", &["/FO", "CSV", "/NH"]);
        let re_obs = Regex::new(r"(?i)^(obs64|obs32|obs)\.exe$").unwrap();
        let re_streamlabs = Regex::new(r"(?i)^streamlabs\s*obs\.exe$").unwrap();
        let re_discord = Regex::new(r"(?i)^discord\.exe$").unwrap();
        let re_zoom = Regex::new(r"(?i)^zoom\.exe$").unwrap();
        let re_teams = Regex::new(r"(?i)^(teams|ms-teams|msteams)\.exe$").unwrap();
        let re_twitch = Regex::new(r"(?i)^twitchstudio\.exe$").unwrap();
        let re_xsplit = Regex::new(r"(?i)^xsplit\.core\.exe$").unwrap();

        for line in out.lines() {
            if let Some(first_quote) = line.find('"') {
                if let Some(second_quote) = line[first_quote + 1..].find('"') {
                    let proc = &line[first_quote + 1..first_quote + 1 + second_quote];
                    if re_obs.is_match(proc) { return Some("OBS Studio".into()); }
                    if re_streamlabs.is_match(proc) { return Some("Streamlabs".into()); }
                    if re_discord.is_match(proc) { return Some("Discord".into()); }
                    if re_zoom.is_match(proc) { return Some("Zoom".into()); }
                    if re_teams.is_match(proc) { return Some("Microsoft Teams".into()); }
                    if re_twitch.is_match(proc) { return Some("Twitch Studio".into()); }
                    if re_xsplit.is_match(proc) { return Some("XSplit".into()); }
                }
            }
        }
    }
    None
}

pub fn get_streamer_status() -> StreamerStatus {
    let state = STREAMER.lock().unwrap();
    StreamerStatus {
        detected_app: state.detected_app.clone(),
        is_cloaked: state.is_cloaked,
        cooldown_seconds: state.cooldown_seconds,
    }
}

pub fn check_streamer_now() -> StreamerStatus {
    let app_found = check_running_broadcast_apps();
    let mut state = STREAMER.lock().unwrap();
    state.detected_app = app_found.clone();
    let settings = get_settings();

    if app_found.is_some() {
        state.cooldown_seconds = 0;
        if settings.auto_cloak_streamer && !state.is_cloaked {
            if let Some(conn) = get_current_connection() {
                let mask = settings.streamer_mask_name.trim().to_string();
                if !conn.name.eq_ignore_ascii_case(&mask) {
                    state.original_name = Some(conn.name.clone());
                    state.cloaked_guid = Some(conn.profile.clone());
                    let _ = rename_network(&conn.profile, &mask, Some(&conn.name));
                    state.is_cloaked = true;
                }
            }
        }
    } else if state.is_cloaked {
        if state.cooldown_seconds == 0 {
            state.cooldown_seconds = 10;
        } else {
            state.cooldown_seconds -= 1;
            if state.cooldown_seconds <= 0 {
                if let (Some(guid), Some(orig)) = (&state.cloaked_guid, &state.original_name) {
                    let _ = rename_network(guid, orig, None);
                }
                state.is_cloaked = false;
                state.cloaked_guid = None;
                state.original_name = None;
                state.cooldown_seconds = 0;
            }
        }
    }

    StreamerStatus {
        detected_app: state.detected_app.clone(),
        is_cloaked: state.is_cloaked,
        cooldown_seconds: state.cooldown_seconds,
    }
}

pub fn toggle_streamer_cloak() -> StreamerStatus {
    let mut state = STREAMER.lock().unwrap();
    let settings = get_settings();
    let mask = settings.streamer_mask_name.trim().to_string();

    if state.is_cloaked {
        if let (Some(guid), Some(orig)) = (&state.cloaked_guid, &state.original_name) {
            let _ = rename_network(guid, orig, None);
        }
        state.is_cloaked = false;
        state.cloaked_guid = None;
        state.original_name = None;
        state.cooldown_seconds = 0;
    } else if let Some(conn) = get_current_connection() {
        state.original_name = Some(conn.name.clone());
        state.cloaked_guid = Some(conn.profile.clone());
        let _ = rename_network(&conn.profile, &mask, Some(&conn.name));
        state.is_cloaked = true;
    }

    StreamerStatus {
        detected_app: state.detected_app.clone(),
        is_cloaked: state.is_cloaked,
        cooldown_seconds: state.cooldown_seconds,
    }
}
