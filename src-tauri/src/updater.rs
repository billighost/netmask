use std::sync::Mutex;
use crate::types::{UpdateInfo, UpdateStatus};
use crate::platform::run_cmd_output;

pub const CURRENT_VERSION: &str = "2.2.0";

static UPDATE_STATUS: Mutex<UpdateStatus> = Mutex::new(UpdateStatus {
    is_downloading: false,
    progress: None,
    downloaded_version: None,
    downloaded_file_path: None,
    available_update: None,
});

pub fn compare_semver(v1: &str, v2: &str) -> i32 {
    let clean = |v: &str| -> Vec<i64> {
        let trimmed = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
        let base = trimmed.split('-').next().unwrap_or(trimmed);
        base.split('.')
            .map(|p| p.parse::<i64>().unwrap_or(0))
            .collect()
    };

    let p1 = clean(v1);
    let p2 = clean(v2);
    let len = std::cmp::max(p1.len(), p2.len());

    for i in 0..len {
        let n1 = p1.get(i).copied().unwrap_or(0);
        let n2 = p2.get(i).copied().unwrap_or(0);
        if n1 > n2 { return 1; }
        if n1 < n2 { return -1; }
    }
    0
}

pub fn check_github_release() -> Option<UpdateInfo> {
    let out = run_cmd_output(
        "curl.exe",
        &[
            "-s",
            "--max-time", "8",
            "-H", "User-Agent: NetMask/2.2.0 (Tauri; Windows)",
            "https://api.github.com/repos/billighost/netmask/releases/latest",
        ],
    );

    if out.is_empty() || out.contains("Not Found") {
        return None;
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&out) {
        let tag = val.get("tag_name")
            .or_else(|| val.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let latest_version = tag.trim_start_matches(|c| c == 'v' || c == 'V').trim();

        if compare_semver(latest_version, CURRENT_VERSION) > 0 {
            let release_url = val.get("html_url").and_then(|v| v.as_str()).unwrap_or("https://github.com/billighost/netmask/releases");
            let mut download_url = release_url.to_string();
            let mut asset_name = None;
            let mut asset_size = None;

            if let Some(assets) = val.get("assets").and_then(|a| a.as_array()) {
                for a in assets {
                    let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let lower = name.to_lowercase();
                    if lower.ends_with(".exe") || lower.ends_with(".msi") {
                        if let Some(url) = a.get("browser_download_url").and_then(|u| u.as_str()) {
                            download_url = url.to_string();
                            asset_name = Some(name.to_string());
                            asset_size = a.get("size").and_then(|s| s.as_i64());
                            break;
                        }
                    }
                }
            }

            let info = UpdateInfo {
                version: latest_version.to_string(),
                current_version: CURRENT_VERSION.to_string(),
                name: val.get("name").and_then(|v| v.as_str()).unwrap_or("NetMask Update").to_string(),
                notes: val.get("body").and_then(|v| v.as_str()).unwrap_or("A new version of NetMask is available.").to_string(),
                url: release_url.to_string(),
                download_url: Some(download_url),
                asset_name,
                asset_size,
            };

            let mut status = UPDATE_STATUS.lock().unwrap();
            status.available_update = Some(info.clone());
            return Some(info);
        }
    }

    None
}

pub fn get_update_status() -> UpdateStatus {
    let status = UPDATE_STATUS.lock().unwrap();
    status.clone()
}

pub fn download_update(url_opt: Option<&str>) -> (bool, Option<String>, Option<String>) {
    let url = match url_opt {
        Some(u) => u.to_string(),
        None => {
            let status = UPDATE_STATUS.lock().unwrap();
            match status.available_update.as_ref().and_then(|u| u.download_url.clone()) {
                Some(u) => u,
                None => return (false, None, Some("No update available".into())),
            }
        }
    };

    let temp_dir = std::env::temp_dir();
    let target_file = temp_dir.join("netmask-update.exe");
    let target_str = target_file.to_string_lossy().to_string();

    let out = run_cmd_output("curl.exe", &["-s", "-L", "-o", &target_str, &url]);
    if target_file.exists() {
        let mut status = UPDATE_STATUS.lock().unwrap();
        status.is_downloading = false;
        status.downloaded_file_path = Some(target_str.clone());
        status.downloaded_version = status.available_update.as_ref().map(|u| u.version.clone());
        (true, Some(target_str), None)
    } else {
        (false, None, Some(format!("Failed to download update: {}", out)))
    }
}

pub fn install_update(file_path_opt: Option<&str>) {
    let path = match file_path_opt {
        Some(p) => p.to_string(),
        None => {
            let status = UPDATE_STATUS.lock().unwrap();
            match status.downloaded_file_path.clone() {
                Some(p) => p,
                None => return,
            }
        }
    };

    let mut cmd = std::process::Command::new("cmd.exe");
    cmd.args(["/c", "start", "", &path]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let _ = cmd.spawn();
    std::process::exit(0);
}

pub fn open_release_url(url_opt: Option<&str>) {
    let url = url_opt.unwrap_or("https://github.com/billighost/netmask/releases");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("rundll32.exe");
        cmd.args(["url.dll,FileProtocolHandler", url]);
        cmd.creation_flags(0x08000000);
        let _ = cmd.spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_semver_scenarios() {
        assert!(compare_semver("2.1.1", "2.1.0") > 0);
        assert!(compare_semver("v2.2.0", "2.1.0") > 0);
        assert_eq!(compare_semver("2.1.0", "2.1.0"), 0);
        assert!(compare_semver("2.0.9", "2.1.0") < 0);
        assert!(compare_semver("v2.2.1-beta.1", "2.2.0") > 0);
    }
}
