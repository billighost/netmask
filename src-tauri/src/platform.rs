use std::collections::HashMap;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use regex::Regex;
use crate::types::{Connection, ElevationStatus, Network, NetworkDetails};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
#[link(name = "psapi")]
unsafe extern "system" {
    fn EmptyWorkingSet(h_process: isize) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetCurrentProcess() -> isize;
}

pub fn trim_working_set() {
    #[cfg(target_os = "windows")]
    unsafe {
        let handle = GetCurrentProcess();
        EmptyWorkingSet(handle);
    }
}

pub fn run_cmd_output(cmd: &str, args: &[&str]) -> String {
    let mut command = Command::new(cmd);
    command.args(args);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

pub fn is_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("fltmc");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.status().map(|s| s.success()).unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe { libc::geteuid() == 0 }
    }
}

pub fn is_task_configured() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("schtasks.exe");
        cmd.args(["/query", "/tn", "NetMask_Elevated"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.status().map(|s| s.success()).unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

pub fn get_elevation_status() -> ElevationStatus {
    let elevated = is_admin();
    let task_cfg = is_task_configured();
    let tier = if task_cfg {
        "task"
    } else if elevated {
        "broker"
    } else {
        "jit"
    };

    ElevationStatus {
        is_elevated: elevated,
        silent_elevation_enabled: true,
        task_configured: task_cfg,
        tier: tier.into(),
    }
}

pub fn setup_silent_elevation() -> (bool, String) {
    #[cfg(target_os = "windows")]
    {
        let exe = std::env::current_exe().unwrap_or_default().to_string_lossy().to_string();
        if is_admin() {
            let mut cmd = Command::new("schtasks.exe");
            cmd.args(["/create", "/tn", "NetMask_Elevated", "/tr", &format!("\"{}\"", exe), "/rl", "HIGHEST", "/sc", "ONLOGON", "/f"]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            if cmd.status().map(|s| s.success()).unwrap_or(false) {
                (true, "Silent elevation task registered successfully".into())
            } else {
                (false, "Failed to create elevation task".into())
            }
        } else {
            let ps_cmd = format!(
                "Start-Process -FilePath 'schtasks.exe' -ArgumentList @('/create', '/tn', 'NetMask_Elevated', '/tr', '\"`\"{}\"`\"', '/rl', 'HIGHEST', '/sc', 'ONLOGON', '/f') -Verb RunAs -Wait -WindowStyle Hidden",
                exe
            );
            let mut cmd = Command::new("powershell.exe");
            cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
            if ok && is_task_configured() {
                (true, "Zero-prompt task registered successfully".into())
            } else {
                (false, "Elevation prompt was canceled or failed".into())
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        (true, "Platform manages elevation natively".into())
    }
}

pub fn remove_silent_elevation() -> (bool, String) {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("schtasks.exe");
        cmd.args(["/delete", "/tn", "NetMask_Elevated", "/f"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        let ok = cmd.status().map(|s| s.success()).unwrap_or(false);
        (ok, if ok { "Task removed".into() } else { "Task does not exist or deletion failed".into() })
    }
    #[cfg(not(target_os = "windows"))]
    {
        (true, "Removed".into())
    }
}

pub fn elevate() {
    #[cfg(target_os = "windows")]
    {
        if is_task_configured() {
            let mut cmd = Command::new("schtasks.exe");
            cmd.args(["/run", "/tn", "NetMask_Elevated"]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.spawn();
            std::process::exit(0);
        } else {
            let exe = std::env::current_exe().unwrap_or_default().to_string_lossy().to_string();
            let ps_cmd = format!("Start-Process -FilePath '{}' -Verb RunAs", exe);
            let mut cmd = Command::new("powershell.exe");
            cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.spawn();
            std::process::exit(0);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Linux/macOS
    }
}

pub fn map_radio_to_generation(radio: &str, band: &str) -> String {
    let r = radio.to_lowercase();
    let b = band.to_lowercase();
    if r.contains("802.11be") {
        "Wi-Fi 7".into()
    } else if r.contains("802.11ax") {
        if b.contains('6') { "Wi-Fi 6E".into() } else { "Wi-Fi 6".into() }
    } else if r.contains("802.11ac") {
        "Wi-Fi 5".into()
    } else if r.contains("802.11n") {
        "Wi-Fi 4".into()
    } else if r.contains("802.11g") || r.contains("802.11a") || r.contains("802.11b") {
        "Wi-Fi 3".into()
    } else {
        "Wi-Fi".into()
    }
}

pub fn get_channel_frequency(channel: i32, band: &str) -> String {
    if channel <= 0 {
        return if band.is_empty() { "Wi-Fi".into() } else { band.into() };
    }
    if (1..=14).contains(&channel) {
        let mhz = 2407 + channel * 5;
        format!("{:.3} GHz (Ch {})", mhz as f64 / 1000.0, channel)
    } else if (32..=177).contains(&channel) {
        let mhz = 5000 + channel * 5;
        format!("{:.3} GHz (Ch {})", mhz as f64 / 1000.0, channel)
    } else if band.contains('6') {
        let mhz = 5950 + channel * 5;
        format!("{:.3} GHz (Ch {})", mhz as f64 / 1000.0, channel)
    } else {
        format!("{} (Ch {})", band, channel)
    }
}

pub fn get_current_connection() -> Option<Connection> {
    #[cfg(target_os = "windows")]
    {
        let out = run_cmd_output("netsh", &["wlan", "show", "interfaces"]);
        let re_ssid = Regex::new(r"(?m)^\s*SSID\s*:\s*(.+)$").ok()?;
        let ssid_caps = re_ssid.captures(&out)?;
        let ssid = ssid_caps.get(1)?.as_str().trim().to_string();

        let get_field = |pat: &str| -> Option<String> {
            Regex::new(pat).ok().and_then(|re| {
                re.captures(&out).and_then(|c| c.get(1).map(|m| m.as_str().trim().to_string()))
            })
        };

        let profile = get_field(r"(?m)^\s*Profile\s*:\s*(.+)$").unwrap_or_else(|| ssid.clone());
        let bssid = get_field(r"(?m)^\s*BSSID\s*:\s*(.+)$");
        let signal_str = get_field(r"(?m)^\s*Signal\s*:\s*(\d+)%").unwrap_or_default();
        let signal: i32 = signal_str.parse().unwrap_or(0);
        let radio = get_field(r"(?m)^\s*Radio type\s*:\s*(.+)$").unwrap_or_default();
        let mut band = get_field(r"(?m)^\s*Band\s*:\s*(.+)$").unwrap_or_default();
        if band.is_empty() {
            band = if radio.contains("802.11ax") || radio.contains("802.11ac") {
                "5 GHz".into()
            } else if radio.contains("802.11g") || radio.contains("802.11n") {
                "2.4 GHz".into()
            } else {
                "Wi-Fi".into()
            };
        }

        let chan_str = get_field(r"(?m)^\s*Channel\s*:\s*(\d+)");
        let channel = chan_str.and_then(|s| s.parse().ok());
        let signal_dbm = Some(signal / 2 - 100);
        let snr = Some(std::cmp::max(0, signal_dbm.unwrap_or(0) + 95));
        let generation = Some(map_radio_to_generation(&radio, &band));
        let frequency = channel.map(|ch| get_channel_frequency(ch, &band)).or(Some(band.clone()));

        let rx_rate = get_field(r"(?m)^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)").and_then(|s| s.parse().ok());
        let tx_rate = get_field(r"(?m)^\s*Transmit rate \(Mbps\)\s*:\s*([\d.]+)").and_then(|s| s.parse().ok());

        Some(Connection {
            name: if !profile.is_empty() { profile.clone() } else { ssid.clone() },
            ssid,
            profile,
            signal,
            signal_dbm,
            snr,
            channel,
            frequency,
            band,
            generation,
            radio_type: Some(radio),
            bssid,
            rx_rate_mbps: rx_rate,
            tx_rate_mbps: tx_rate,
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

pub fn get_networks(backup: &HashMap<String, String>) -> Vec<Network> {
    let mut nets = Vec::new();
    let conn = get_current_connection();

    #[cfg(target_os = "windows")]
    {
        let reg_out = run_cmd_output("reg", &["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles", "/s"]);
        if reg_out.contains("HKEY_LOCAL_MACHINE") {
            let re_guid = Regex::new(r"\{[0-9A-Fa-f-]{36}\}").unwrap();
            let re_pn = Regex::new(r"(?m)ProfileName\s+REG_SZ\s+(.+)$").unwrap();
            let re_nt = Regex::new(r"(?m)NameType\s+REG_DWORD\s+0x([0-9a-fA-F]+)").unwrap();

            for block in reg_out.split("HKEY_LOCAL_MACHINE") {
                if let Some(gm) = re_guid.find(block) {
                    let guid = gm.as_str().to_string();
                    if let Some(pm) = re_pn.captures(block) {
                        let profile_name = pm.get(1).unwrap().as_str().trim().to_string();
                        let name_type = re_nt.captures(block)
                            .and_then(|c| u32::from_str_radix(c.get(1).unwrap().as_str(), 16).ok())
                            .unwrap_or(0);
                        let net_type = if name_type == 71 { "wifi" } else { "ethernet" };
                        let original = backup.get(&guid).cloned().unwrap_or_else(|| profile_name.clone());

                        let is_live = if let Some(ref c) = conn {
                            c.profile.eq_ignore_ascii_case(&profile_name)
                                || c.ssid.eq_ignore_ascii_case(&profile_name)
                                || c.profile.eq_ignore_ascii_case(&original)
                                || c.ssid.eq_ignore_ascii_case(&original)
                                || c.name.eq_ignore_ascii_case(&profile_name)
                                || c.name.eq_ignore_ascii_case(&original)
                        } else {
                            false
                        };

                        nets.push(Network {
                            guid: guid.clone(),
                            name: profile_name.clone(),
                            original_name: original.clone(),
                            renamed: profile_name != original,
                            live: is_live,
                            network_type: net_type.into(),
                        });
                    }
                }
            }
        }

        // Fallback: netsh wlan show profiles
        if nets.is_empty() {
            let prof_out = run_cmd_output("netsh", &["wlan", "show", "profiles"]);
            let re_prof = Regex::new(r":\s*(.+)$").unwrap();
            for line in prof_out.lines() {
                if line.contains("All User Profile") || line.contains("User Profile") {
                    if let Some(cap) = re_prof.captures(line) {
                        let name = cap.get(1).unwrap().as_str().trim().to_string();
                        let guid = format!("wlan-{}", name);
                        let orig = backup.get(&guid).cloned().unwrap_or_else(|| name.clone());
                        let is_live = conn.as_ref().map(|c| c.profile.eq_ignore_ascii_case(&name) || c.ssid.eq_ignore_ascii_case(&name)).unwrap_or(false);
                        nets.push(Network {
                            guid: guid.clone(),
                            name: name.clone(),
                            original_name: orig.clone(),
                            renamed: name != orig,
                            live: is_live,
                            network_type: "wifi".into(),
                        });
                    }
                }
            }
        }
    }

    nets
}

pub fn get_network_details(guid: &str) -> NetworkDetails {
    let conn = get_current_connection();
    let bssid = conn.as_ref().and_then(|c| c.bssid.clone()).unwrap_or_else(|| "00:00:00:00:00:00".into());
    let channel = conn.as_ref().and_then(|c| c.channel).unwrap_or(0);
    let band = conn.as_ref().map(|c| c.band.clone()).unwrap_or_else(|| "Wi-Fi".into());
    let freq = conn.as_ref().and_then(|c| c.frequency.clone()).unwrap_or_else(|| band.clone());
    let gen_val = conn.as_ref().and_then(|c| c.generation.clone());
    let sig_dbm = conn.as_ref().and_then(|c| c.signal_dbm);
    let snr = conn.as_ref().and_then(|c| c.snr);
    let radio = conn.as_ref().and_then(|c| c.radio_type.clone());
    let rx = conn.as_ref().and_then(|c| c.rx_rate_mbps);
    let tx = conn.as_ref().and_then(|c| c.tx_rate_mbps);

    // masked BSSID
    let masked = if bssid.len() >= 8 {
        format!("XX:XX:XX:{}", &bssid[9..])
    } else {
        bssid.clone()
    };

    NetworkDetails {
        guid: guid.into(),
        bssid,
        masked_bssid: Some(masked),
        channel,
        auth: "WPA2-Personal".into(),
        band,
        frequency: freq,
        generation: gen_val,
        signal_dbm: sig_dbm,
        snr,
        radio_type: radio,
        rx_rate_mbps: rx,
        tx_rate_mbps: tx,
        last_connected: "Active Now".into(),
    }
}

pub fn rename_network(guid: &str, new_name: &str, _current_display_name: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if guid.starts_with('{') && guid.ends_with('}') {
            let key = format!("HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles\\{}", guid);
            let mut cmd = Command::new("reg");
            cmd.args(["add", &key, "/v", "ProfileName", "/t", "REG_SZ", "/d", new_name, "/f"]);
            cmd.creation_flags(CREATE_NO_WINDOW);
            if cmd.status().map(|s| s.success()).unwrap_or(false) {
                return Ok(());
            }
            // If failed due to permissions, try elevated
            let ps_script = format!("reg add '{}' /v ProfileName /t REG_SZ /d '{}' /f", key, new_name.replace('\'', "''"));
            let mut el_cmd = Command::new("powershell.exe");
            el_cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &format!("Start-Process cmd -ArgumentList '/c {}' -Verb RunAs -Wait -WindowStyle Hidden", ps_script)]);
            el_cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = el_cmd.status();
        }
    }
    Ok(())
}

pub fn reconnect_network(profile: Option<&str>) -> bool {
    #[cfg(target_os = "windows")]
    {
        let _ = run_cmd_output("netsh", &["wlan", "disconnect"]);
        std::thread::sleep(std::time::Duration::from_millis(600));
        if let Some(prof) = profile {
            let out = run_cmd_output("netsh", &["wlan", "connect", &format!("name={}", prof)]);
            return out.contains("successfully") || out.contains("completed");
        }
        true
    }
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}
