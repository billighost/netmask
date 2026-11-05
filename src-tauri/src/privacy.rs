use crate::types::DeviceIdentity;
use crate::{platform, system};

pub fn get_device_identity() -> Result<DeviceIdentity, String> {
    let connection = platform::get_current_connection()?;
    let active_profile = connection
        .as_ref()
        .map(|connection| connection.profile.clone());
    #[cfg(windows)]
    {
        let guid = platform::windows::active_interface_guid()?
            .ok_or("Connect to Wi-Fi to inspect this device and its active adapter")?;
        let data = system::powershell_json(&format!(
            "$adapter = Get-NetAdapter | Where-Object {{ ([Guid]$_.InterfaceGuid).ToString('B') -eq {} }} | Select-Object -First 1; if (-not $adapter) {{ throw 'Wi-Fi adapter unavailable' }}; $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_' + ([Guid]$adapter.InterfaceGuid).ToString('B'); $netbios = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).NetbiosOptions; [pscustomobject]@{{ hostname = $env:COMPUTERNAME; name = $adapter.Name; guid = ([Guid]$adapter.InterfaceGuid).ToString('B'); mac = $adapter.MacAddress; netbios = $netbios }}",
            system::powershell_literal(&guid)
        )).map_err(|error| format!("This device and adapter could not be read. {error}"))?;
        let mac_randomization = active_profile
            .as_deref()
            .and_then(|name| platform::windows::profile_randomization(name).ok())
            .unwrap_or_else(|| "unknown".into());
        Ok(DeviceIdentity {
            hostname: data["hostname"].as_str().unwrap_or("Unavailable").into(),
            mac_address: data["mac"]
                .as_str()
                .unwrap_or("Unavailable")
                .replace('-', ":"),
            interface_name: data["name"]
                .as_str()
                .ok_or("Wi-Fi adapter name unavailable")?
                .into(),
            interface_guid: guid,
            netbios_silenced: data["netbios"].as_u64().map(|value| value == 2),
            mac_randomization,
            active_profile,
        })
    }
    #[cfg(target_os = "linux")]
    {
        let interface = connection
            .and_then(|connection| connection.interface_name)
            .ok_or("Connect to Wi-Fi to inspect this device and its active adapter")?;
        let mac = std::fs::read_to_string(
            std::path::Path::new("/sys/class/net")
                .join(&interface)
                .join("address"),
        )
        .map_err(|_| "The Wi-Fi hardware address is unavailable")?;
        let hostname = system::run("hostname", &[])?;
        Ok(DeviceIdentity {
            hostname,
            mac_address: mac.trim().to_uppercase(),
            interface_name: interface,
            interface_guid: String::new(),
            netbios_silenced: None,
            mac_randomization: "unknown".into(),
            active_profile,
        })
    }
    #[cfg(target_os = "macos")]
    {
        let interface = connection
            .and_then(|connection| connection.interface_name)
            .ok_or("Connect to Wi-Fi to inspect this device and its active adapter")?;
        let output = system::run("ifconfig", &[&interface])?;
        let mac = output
            .lines()
            .find_map(|line| line.trim().strip_prefix("ether "))
            .ok_or("The Wi-Fi hardware address is unavailable")?;
        let hostname = system::run("scutil", &["--get", "LocalHostName"])?;
        Ok(DeviceIdentity {
            hostname,
            mac_address: mac.trim().to_uppercase(),
            interface_name: interface,
            interface_guid: String::new(),
            netbios_silenced: None,
            mac_randomization: "unknown".into(),
            active_profile,
        })
    }
}

pub fn set_mac_randomization(profile: &str, mode: &str) -> Result<bool, String> {
    if !cfg!(windows) {
        return Err(
            "MAC randomization must be configured in this operating system's network settings"
                .into(),
        );
    }
    if !matches!(mode, "yes" | "no" | "daily") {
        return Err("Invalid MAC randomization mode".into());
    }
    #[cfg(windows)]
    {
        let profiles = platform::windows::profiles()?;
        let matches: Vec<_> = profiles
            .iter()
            .filter(|saved| saved.name.eq_ignore_ascii_case(profile))
            .collect();
        if matches.len() != 1 {
            return Err("A unique saved Wi-Fi profile is required to change randomization".into());
        }
        crate::privileged::run(crate::privileged::Request::Randomization {
            guid: platform::windows::guid_string(&matches[0].interface),
            profile: profile.into(),
            mode: mode.into(),
        })?;
        let expected = match mode {
            "yes" => "enabled",
            "daily" => "daily",
            _ => "disabled",
        };
        if platform::windows::profile_randomization(profile)? != expected {
            return Err("The driver did not confirm MAC randomization".into());
        }
        return Ok(true);
    }
    #[cfg(not(windows))]
    Err("MAC randomization is unavailable".into())
}

pub fn set_netbios_silencer(enabled: bool) -> Result<bool, String> {
    if !cfg!(windows) {
        return Err("NetBIOS control is available only on Windows".into());
    }
    let identity = get_device_identity()?;
    if !platform::is_guid(&identity.interface_guid) {
        return Err("The Wi-Fi interface identifier is unavailable".into());
    }
    crate::privileged::run(crate::privileged::Request::Netbios {
        guid: identity.interface_guid,
        enabled,
    })?;
    if get_device_identity()?.netbios_silenced != Some(enabled) {
        return Err("Windows did not confirm the NetBIOS change".into());
    }
    Ok(true)
}
