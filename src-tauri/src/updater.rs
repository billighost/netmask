use crate::types::{DownloadProgress, UpdateInfo, UpdateStatus};
use crate::{settings, system};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use url::Url;

pub const CURRENT_VERSION: &str = crate::VERSION;
const RELEASES: &str = "https://github.com/billighost/netmask/releases";
const MAX_INSTALLER_BYTES: u64 = 512 * 1024 * 1024;
static DOWNLOAD_LOCK: Mutex<()> = Mutex::new(());
static VERIFIED: Mutex<Option<VerifiedDownload>> = Mutex::new(None);
static UPDATE_STATUS: Mutex<UpdateStatus> = Mutex::new(UpdateStatus {
    is_downloading: false,
    progress: None,
    downloaded_version: None,
    downloaded_file_path: None,
    available_update: None,
});

struct VerifiedDownload {
    path: PathBuf,
    sha256: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOutcome {
    pub success: bool,
    pub file_path: Option<String>,
    pub error: Option<String>,
    pub in_progress: bool,
    pub already_downloaded: bool,
}

fn version(value: &str) -> Result<semver::Version, String> {
    semver::Version::parse(value.trim().trim_start_matches(['v', 'V']))
        .map_err(|_| "Invalid release version".into())
}

pub fn compare_semver(first: &str, second: &str) -> Result<std::cmp::Ordering, String> {
    Ok(version(first)?.cmp(&version(second)?))
}

pub fn native_asset_names(version: &str, os: &str, arch: &str) -> Vec<String> {
    match (os, arch) {
        ("windows", "x86_64") => vec![
            format!("NetMask_{version}_x64-setup.exe"),
            format!("NetMask_{version}_x64_en-US.msi"),
        ],
        ("macos", "aarch64") => vec![format!("NetMask_{version}_aarch64.dmg")],
        ("macos", "x86_64") => vec![
            format!("NetMask_{version}_x64.dmg"),
            format!("NetMask_{version}_x86_64.dmg"),
        ],
        ("linux", "x86_64") => vec![
            format!("NetMask_{version}_amd64.deb"),
            format!("NetMask_{version}_amd64.AppImage"),
        ],
        ("linux", "aarch64") => vec![
            format!("NetMask_{version}_arm64.deb"),
            format!("NetMask_{version}_aarch64.AppImage"),
        ],
        _ => Vec::new(),
    }
}

fn safe_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
}

pub fn trusted_release_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        safe_https(&url)
            && url.host_str() == Some("github.com")
            && url.query().is_none()
            && url.fragment().is_none()
            && (url.path() == "/billighost/netmask/releases"
                || url.path().starts_with("/billighost/netmask/releases/"))
    })
}

fn client(download: bool) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(format!("NetMask/{CURRENT_VERSION}"))
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(if download { 300 } else { 15 }))
        .redirect(if download {
            reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 {
                    return attempt.error("Too many download redirects");
                }
                let url = attempt.url();
                if safe_https(url)
                    && matches!(
                        url.host_str(),
                        Some(
                            "github.com"
                                | "release-assets.githubusercontent.com"
                                | "objects.githubusercontent.com"
                        )
                    )
                {
                    attempt.follow()
                } else {
                    attempt.error("Untrusted download redirect")
                }
            })
        } else {
            reqwest::redirect::Policy::none()
        })
        .build()
        .map_err(|_| "Cannot initialize the update connection".into())
}

pub fn parse_release(
    value: &serde_json::Value,
    os: &str,
    arch: &str,
) -> Result<Option<UpdateInfo>, String> {
    if value["draft"].as_bool() == Some(true) || value["prerelease"].as_bool() == Some(true) {
        return Ok(None);
    }
    let tag = value["tag_name"]
        .as_str()
        .ok_or("Release has no version tag")?;
    let latest = version(tag)?;
    if !latest.pre.is_empty() || latest <= version(CURRENT_VERSION)? {
        return Ok(None);
    }
    let release_url = value["html_url"]
        .as_str()
        .ok_or("Release page is unavailable")?;
    if !trusted_release_url(release_url) {
        return Err("Untrusted release page".into());
    }
    let latest_string = latest.to_string();
    let assets = value["assets"].as_array();
    let selected = native_asset_names(&latest_string, os, arch)
        .iter()
        .find_map(|name| {
            assets
                .and_then(|assets| {
                    assets.iter().find(|asset| {
                        asset["name"].as_str() == Some(name)
                            && asset["state"].as_str() == Some("uploaded")
                    })
                })
                .cloned()
        });
    let mut download_url = None;
    let mut asset_name = None;
    let mut asset_size = None;
    let mut asset_sha256 = None;
    if let Some(asset) = selected {
        let name = asset["name"]
            .as_str()
            .ok_or("Installer name is unavailable")?;
        let url = asset["browser_download_url"]
            .as_str()
            .ok_or("Installer URL is unavailable")?;
        let expected = format!("{RELEASES}/download/{tag}/{name}");
        if url != expected || !trusted_release_url(url) {
            return Err("Untrusted installer URL".into());
        }
        let size = asset["size"]
            .as_u64()
            .filter(|size| *size > 0 && *size <= MAX_INSTALLER_BYTES)
            .ok_or("Invalid installer size")?;
        asset_sha256 = asset["digest"]
            .as_str()
            .and_then(|digest| digest.strip_prefix("sha256:"))
            .filter(|digest| digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()))
            .map(|s| s.to_ascii_lowercase());
        // Offer the release page when verification is unavailable.
        download_url = asset_sha256.as_ref().map(|_| url.into());
        asset_name = Some(name.into());
        asset_size = Some(size as i64);
    }
    Ok(Some(UpdateInfo {
        version: latest_string,
        current_version: CURRENT_VERSION.into(),
        name: value["name"].as_str().unwrap_or("NetMask update").into(),
        notes: value["body"].as_str().unwrap_or("").into(),
        url: release_url.into(),
        download_url,
        asset_name,
        asset_size,
        asset_sha256,
    }))
}

pub fn check_github_release() -> Result<Option<UpdateInfo>, String> {
    let response = client(false)?
        .get("https://api.github.com/repos/billighost/netmask/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|_| "Cannot reach GitHub to check for updates")?
        .error_for_status()
        .map_err(|_| "GitHub could not provide the latest release")?;
    let mut data = Vec::new();
    response
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|_| "Update response was interrupted")?;
    if data.len() > 2 * 1024 * 1024 {
        return Err("Update response is too large".into());
    }
    let value =
        serde_json::from_slice(&data).map_err(|_| "GitHub returned invalid release data")?;
    let update = parse_release(&value, std::env::consts::OS, std::env::consts::ARCH)?;
    UPDATE_STATUS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .available_update = update.clone();
    Ok(update)
}

pub fn get_update_status() -> UpdateStatus {
    UPDATE_STATUS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

fn file_hash(path: &Path) -> Result<(u64, String), String> {
    let mut file = fs::File::open(path).map_err(|_| "Downloaded installer is unavailable")?;
    let mut hash = Sha256::new();
    let mut count = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let size = file
            .read(&mut buffer)
            .map_err(|_| "Cannot verify the downloaded installer")?;
        if size == 0 {
            break;
        }
        count += size as u64;
        if count > MAX_INSTALLER_BYTES {
            return Err("Installer exceeds the download limit".into());
        }
        hash.update(&buffer[..size]);
    }
    Ok((count, format!("{:x}", hash.finalize())))
}

fn download(update: &UpdateInfo, progress: impl Fn(DownloadProgress)) -> Result<String, String> {
    let url = update
        .download_url
        .as_deref()
        .ok_or("This release has no installer for your platform; open its release page")?;
    let name = update
        .asset_name
        .as_deref()
        .ok_or("Installer name is unavailable")?;
    let expected_size = update.asset_size.ok_or("Installer size is unavailable")? as u64;
    let expected_hash = update.asset_sha256.as_deref().ok_or(
        "This release has no SHA-256 checksum; download its installer from the release page",
    )?;
    let directory = settings::get_data_dir().join("updates");
    settings::JsonStorage::new(directory.clone()).ensure()?;
    let directory = directory
        .canonicalize()
        .map_err(|_| "Update directory is unavailable")?;
    let data_directory = settings::get_data_dir()
        .canonicalize()
        .map_err(|_| "App data directory is unavailable")?;
    if !directory.starts_with(&data_directory) {
        return Err("Update directory is outside NetMask's data directory".into());
    }
    let target = directory.join(name);
    let temporary = directory.join(format!(".{name}.{}.part", std::process::id()));
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
            .map_err(|_| "Cannot prepare the installer download")?;
        let mut response = client(true)?
            .get(url)
            .send()
            .map_err(|_| "Installer download failed")?
            .error_for_status()
            .map_err(|_| "GitHub rejected the installer download")?;
        if response
            .content_length()
            .is_some_and(|size| size != expected_size)
        {
            return Err("Installer size does not match the release".into());
        }
        let start = Instant::now();
        let mut last_event = start;
        let mut hash = Sha256::new();
        let mut transferred = 0u64;
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let count = response
                .read(&mut buffer)
                .map_err(|_| "Installer download was interrupted")?;
            if count == 0 {
                break;
            }
            transferred += count as u64;
            if transferred > expected_size || transferred > MAX_INSTALLER_BYTES {
                return Err("Installer exceeds its expected size".into());
            }
            hash.update(&buffer[..count]);
            file.write_all(&buffer[..count])
                .map_err(|_| "Cannot save the installer")?;
            if last_event.elapsed() >= Duration::from_millis(100) || transferred == expected_size {
                let event = DownloadProgress {
                    percent: transferred as f64 * 100.0 / expected_size as f64,
                    transferred: transferred as i64,
                    total: expected_size as i64,
                    bytes_per_second: transferred as f64 / start.elapsed().as_secs_f64().max(0.001),
                };
                UPDATE_STATUS
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .progress = Some(event.clone());
                progress(event);
                last_event = Instant::now();
            }
        }
        let digest = format!("{:x}", hash.finalize());
        if transferred != expected_size || digest != expected_hash {
            return Err(
                "Installer verification failed; the incomplete download was discarded".into(),
            );
        }
        file.sync_all()
            .map_err(|_| "Cannot flush the installer to disk")?;
        drop(file);
        if target.is_symlink() {
            return Err("The installer target is a symbolic link".into());
        }
        fs::rename(&temporary, &target)
            .map_err(|_| "Cannot finish saving the verified installer")?;
        *VERIFIED.lock().unwrap_or_else(|e| e.into_inner()) = Some(VerifiedDownload {
            path: target.clone(),
            sha256: digest,
            size: transferred,
        });
        Ok(target.to_string_lossy().into_owned())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn download_update(
    url: Option<&str>,
    progress: impl Fn(DownloadProgress),
) -> Result<DownloadOutcome, String> {
    let _guard = match DOWNLOAD_LOCK.try_lock() {
        Ok(guard) => guard,
        Err(std::sync::TryLockError::WouldBlock) => {
            return Ok(DownloadOutcome {
                success: true,
                file_path: None,
                error: None,
                in_progress: true,
                already_downloaded: false,
            });
        }
        Err(_) => return Err("Update download state is unavailable".into()),
    };
    let update = get_update_status()
        .available_update
        .ok_or("Check for an update before downloading")?;
    if url.is_some_and(|url| Some(url) != update.download_url.as_deref()) {
        return Err("The requested URL does not match the verified release installer".into());
    }
    let previous = get_update_status();
    if previous.downloaded_version.as_deref() == Some(update.version.as_str()) {
        if let Some(verified) = VERIFIED.lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
            if verified_is_intact(verified) {
                return Ok(DownloadOutcome {
                    success: true,
                    file_path: previous.downloaded_file_path,
                    error: None,
                    in_progress: false,
                    already_downloaded: true,
                });
            }
        }
    }
    *VERIFIED.lock().unwrap_or_else(|e| e.into_inner()) = None;
    {
        let mut status = UPDATE_STATUS.lock().unwrap_or_else(|e| e.into_inner());
        status.is_downloading = true;
        status.progress = None;
        status.downloaded_version = None;
        status.downloaded_file_path = None;
    }
    let result = download(&update, progress);
    let mut status = UPDATE_STATUS.lock().unwrap_or_else(|e| e.into_inner());
    status.is_downloading = false;
    status.progress = None;
    match result {
        Ok(path) => {
            status.downloaded_version = Some(update.version);
            status.downloaded_file_path = Some(path.clone());
            Ok(DownloadOutcome {
                success: true,
                file_path: Some(path),
                error: None,
                in_progress: false,
                already_downloaded: false,
            })
        }
        Err(error) => Err(error),
    }
}

pub fn install_update(requested_path: Option<&str>) -> Result<bool, String> {
    let verified = VERIFIED.lock().unwrap_or_else(|e| e.into_inner());
    let verified = verified
        .as_ref()
        .ok_or("Download and verify an installer before opening it")?;
    if requested_path.is_some_and(|path| Path::new(path) != verified.path) {
        return Err("Only the verified NetMask installer can be opened".into());
    }
    if !verified_is_intact(verified) {
        return Err("The installer changed after downloading; download it again".into());
    }
    #[cfg(windows)]
    {
        if verified
            .path
            .extension()
            .is_some_and(|extension| extension == "msi")
        {
            system::hidden_command("msiexec.exe")
                .arg("/i")
                .arg(&verified.path)
                .spawn()
                .map_err(|_| "Cannot launch the Windows installer")?;
        } else {
            system::hidden_command(&verified.path.to_string_lossy())
                .spawn()
                .map_err(|_| "Cannot launch the Windows installer")?;
        }
        Ok(true)
    }
    #[cfg(target_os = "macos")]
    {
        system::hidden_command("open")
            .arg(&verified.path)
            .spawn()
            .map_err(|_| "Cannot open the macOS installer")?;
        Ok(false)
    }
    #[cfg(target_os = "linux")]
    {
        system::hidden_command("xdg-open")
            .arg(&verified.path)
            .spawn()
            .map_err(|_| "Cannot open the Linux package installer")?;
        Ok(false)
    }
}

fn verified_is_intact(verified: &VerifiedDownload) -> bool {
    !verified.path.is_symlink()
        && file_hash(&verified.path)
            .is_ok_and(|actual| actual == (verified.size, verified.sha256.clone()))
}

pub fn open_external(value: &str) -> Result<(), String> {
    let url = Url::parse(value).map_err(|_| "Invalid website address")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err("Only HTTP and HTTPS websites can be opened".into());
    }
    #[cfg(windows)]
    {
        #[link(name = "shell32")]
        unsafe extern "system" {
            fn ShellExecuteW(
                window: *mut std::ffi::c_void,
                operation: *const u16,
                file: *const u16,
                parameters: *const u16,
                directory: *const u16,
                show: i32,
            ) -> isize;
        }
        let operation: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let address: Vec<u16> = url.as_str().encode_utf16().chain(Some(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                address.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if result <= 32 {
            return Err("Windows could not open your browser".into());
        }
    }
    #[cfg(target_os = "macos")]
    {
        system::hidden_command("open")
            .arg(url.as_str())
            .spawn()
            .map_err(|_| "Cannot open your browser")?;
    }
    #[cfg(target_os = "linux")]
    {
        system::hidden_command("xdg-open")
            .arg(url.as_str())
            .spawn()
            .map_err(|_| "Cannot open your browser")?;
    }
    Ok(())
}

pub fn open_release_url(value: Option<&str>) -> Result<(), String> {
    let value = value.unwrap_or(RELEASES);
    if !trusted_release_url(value) {
        return Err("Only NetMask's GitHub release pages and assets can be opened here".into());
    }
    open_external(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_or_modified_cached_installers_are_retryable() {
        let path =
            std::env::temp_dir().join(format!("netmask-update-fixture-{}", std::process::id()));
        fs::write(&path, b"original fixture").unwrap();
        let (size, sha256) = file_hash(&path).unwrap();
        let verified = VerifiedDownload {
            path: path.clone(),
            size,
            sha256,
        };
        assert!(verified_is_intact(&verified));
        fs::write(&path, b"changed fixture").unwrap();
        assert!(!verified_is_intact(&verified));
        fs::remove_file(&path).unwrap();
        assert!(!verified_is_intact(&verified));
    }
    #[test]
    fn versions_assets_and_update_urls_do_not_accept_legacy_or_arbitrary_installers() {
        assert!(compare_semver("v2.3.0", "2.2.0").unwrap().is_gt());
        assert!(compare_semver("2.3.0-beta.1", "2.3.0").unwrap().is_lt());
        assert!(compare_semver("junk", "2.2.0").is_err());
        assert!(!trusted_release_url(
            "https://github.com.evil.test/billighost/netmask/releases/download/update.exe"
        ));
        assert!(!trusted_release_url("file:///C:/temp/update.exe"));
        assert!(!trusted_release_url(
            "https://user@github.com/billighost/netmask/releases"
        ));
        let current = version(CURRENT_VERSION).unwrap();
        let next = semver::Version::new(current.major, current.minor + 1, 0).to_string();
        let native = format!("NetMask_{next}_x64-setup.exe");
        let legacy = format!("NetMask-Setup-{next}.exe");
        let release = serde_json::json!({"tag_name":format!("v{next}"), "html_url":format!("https://github.com/billighost/netmask/releases/tag/v{next}"), "assets":[
            {"name":legacy, "state":"uploaded", "size":80000000, "browser_download_url":format!("https://github.com/billighost/netmask/releases/download/v{next}/{legacy}")},
            {"name":native, "state":"uploaded", "size":2000000, "digest":format!("sha256:{}", "a".repeat(64)), "browser_download_url":format!("https://github.com/billighost/netmask/releases/download/v{next}/{native}")}]});
        assert_eq!(
            parse_release(&release, "windows", "x86_64")
                .unwrap()
                .unwrap()
                .asset_name
                .as_deref(),
            Some(native.as_str())
        );
        assert!(
            parse_release(&release, "macos", "aarch64")
                .unwrap()
                .unwrap()
                .download_url
                .is_none()
        );
        let mut same_version = release.clone();
        same_version["tag_name"] = serde_json::json!(CURRENT_VERSION);
        assert!(
            parse_release(&same_version, "windows", "x86_64")
                .unwrap()
                .is_none()
        );
        let mut bad = release;
        bad["assets"][1]["digest"] = serde_json::Value::Null;
        assert!(
            parse_release(&bad, "windows", "x86_64")
                .unwrap()
                .unwrap()
                .download_url
                .is_none()
        );
        bad["assets"][1]["browser_download_url"] =
            serde_json::json!("https://example.com/update.exe");
        assert!(parse_release(&bad, "windows", "x86_64").is_err());
    }
}
