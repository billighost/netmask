use crate::types::CaptivePortalStatus;
use crate::platform::run_cmd_output;

pub fn check_captive_portal() -> CaptivePortalStatus {
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    // Primary probe: curl msftconnecttest
    let out = run_cmd_output("curl.exe", &["-s", "-i", "--max-time", "3", "http://www.msftconnecttest.com/connecttest.txt"]);
    if out.contains("Microsoft Connect Test") {
        return CaptivePortalStatus {
            is_captive: false,
            portal_url: None,
            checked_at: now_ts,
        };
    }

    if out.contains("302 Found") || out.contains("301 Moved") || out.contains("307 Temporary") || out.contains("<html") || out.contains("login") {
        let mut redirect_url = None;
        for line in out.lines() {
            if line.to_lowercase().starts_with("location:") {
                redirect_url = Some(line[9..].trim().to_string());
                break;
            }
        }
        return CaptivePortalStatus {
            is_captive: true,
            portal_url: redirect_url.or_else(|| Some("http://www.msftconnecttest.com/redirect".into())),
            checked_at: now_ts,
        };
    }

    // Secondary probe: Google 204
    let g_out = run_cmd_output("curl.exe", &["-s", "-i", "--max-time", "3", "http://connectivitycheck.gstatic.com/generate_204"]);
    if g_out.contains("204 No Content") {
        return CaptivePortalStatus {
            is_captive: false,
            portal_url: None,
            checked_at: now_ts,
        };
    }

    CaptivePortalStatus {
        is_captive: false,
        portal_url: None,
        checked_at: now_ts,
    }
}

