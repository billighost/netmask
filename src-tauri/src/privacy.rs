use regex::Regex;
use crate::types::DeviceIdentity;
use crate::platform::run_cmd_output;

pub fn get_device_identity() -> DeviceIdentity {
    let hostname = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "localhost".into());
    let mut mac_address = "00:00:00:00:00:00".to_string();
    let mut interface_name = "Wi-Fi".to_string();
    let mut interface_guid = String::new();
    let mut mac_randomization = "unknown".to_string();
    let mut netbios_silenced = false;
    let mut active_profile = None;

    #[cfg(target_os = "windows")]
    {
        let out = run_cmd_output("netsh", &["wlan", "show", "interfaces"]);
        if let Some(m) = Regex::new(r"(?m)^\s*Name\s*:\s*(.+)$").ok().and_then(|r| r.captures(&out)) {
            interface_name = m.get(1).unwrap().as_str().trim().to_string();
        }
        if let Some(m) = Regex::new(r"(?m)^\s*GUID\s*:\s*([0-9a-fA-F-]{36})").ok().and_then(|r| r.captures(&out)) {
            interface_guid = m.get(1).unwrap().as_str().trim().to_string();
        }
        if let Some(m) = Regex::new(r"(?m)^\s*Physical address\s*:\s*([0-9a-fA-F:]{17})").ok().and_then(|r| r.captures(&out)) {
            mac_address = m.get(1).unwrap().as_str().trim().to_string();
        }
        if let Some(m) = Regex::new(r"(?m)^\s*Profile\s*:\s*(.+)$").ok().and_then(|r| r.captures(&out)) {
            active_profile = Some(m.get(1).unwrap().as_str().trim().to_string());
        }

        if let Some(ref prof) = active_profile {
            let prof_out = run_cmd_output("netsh", &["wlan", "show", "profile", &format!("name={}", prof)]);
            if let Some(m) = Regex::new(r"(?m)MAC Randomization\s*:\s*(.+)$").ok().and_then(|r| r.captures(&prof_out)) {
                let val = m.get(1).unwrap().as_str().to_lowercase();
                if val.contains("daily") {
                    mac_randomization = "daily".into();
                } else if val.contains("enabled") {
                    mac_randomization = "enabled".into();
                } else if val.contains("disabled") {
                    mac_randomization = "disabled".into();
                }
            }
        }

        if !interface_guid.is_empty() {
            let reg_key = format!("HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{{{}}}", interface_guid);
            let reg_out = run_cmd_output("reg", &["query", &reg_key, "/v", "NetbiosOptions"]);
            if let Some(m) = Regex::new(r"(?m)NetbiosOptions\s+REG_DWORD\s+0x([0-9a-fA-F]+)").ok().and_then(|r| r.captures(&reg_out)) {
                if let Ok(opt) = u32::from_str_radix(m.get(1).unwrap().as_str(), 16) {
                    netbios_silenced = opt == 2;
                }
            }
        }
    }

    DeviceIdentity {
        hostname,
        mac_address,
        interface_name,
        interface_guid,
        netbios_silenced,
        mac_randomization,
        active_profile,
    }
}

pub fn set_mac_randomization(profile_name: &str, mode: &str) -> bool {
    let out = run_cmd_output("netsh", &["wlan", "set", "profileparameter", &format!("name={}", profile_name), &format!("Randomization={}", mode)]);
    out.contains("successfully") || out.contains("updated")
}

pub fn set_netbios_silencer(enable_silence: bool) -> bool {
    let id = get_device_identity();
    let val = if enable_silence { 2 } else { 0 };
    let script = format!(
        "$val = {}; $guid = '{}'; if ($guid) {{ reg add \"HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{{$guid}}\" /v NetbiosOptions /t REG_DWORD /d $val /f | Out-Null }}; Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled = True' | ForEach-Object {{ $_.SetTcpipNetbios($val) | Out-Null }}",
        val, id.interface_guid
    );

    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &format!("Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"{}\"' -Verb RunAs -Wait -WindowStyle Hidden", script.replace('"', "`\""))]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

