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
            .ok_or("Connect to Wi-Fi to inspect its device identity")?;
        let data = system::powershell_json(&format!(
            "$adapter = Get-NetAdapter | Where-Object {{ $_.InterfaceGuid.ToString('B') -eq {} }} | Select-Object -First 1; if (-not $adapter) {{ throw 'Wi-Fi adapter unavailable' }}; $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_' + $adapter.InterfaceGuid.ToString('B'); $netbios = (Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue).NetbiosOptions; [pscustomobject]@{{ hostname = $env:COMPUTERNAME; name = $adapter.Name; guid = $adapter.InterfaceGuid.ToString('B'); mac = $adapter.MacAddress; netbios = $netbios }}",
            system::powershell_literal(&guid)
        ))?;
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
            .ok_or("Connect to Wi-Fi to inspect its device identity")?;
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
            .ok_or("Connect to Wi-Fi to inspect its device identity")?;
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
        if !profiles.iter().any(|saved| saved.name == profile) {
            return Err("Saved Wi-Fi profile not found".into());
        }
        let command = format!(
            "& netsh.exe wlan set profileparameter {} {}; if ($LASTEXITCODE -ne 0) {{ throw 'MAC randomization was rejected' }}",
            system::powershell_literal(&format!("name={profile}")),
            system::powershell_literal(&format!("Randomization={mode}"))
        );
        system::powershell(&command, !platform::is_admin())?;
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
    let value = if enabled { 2 } else { 0 };
    let key = format!(
        "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{}",
        identity.interface_guid
    );
    let command = format!(
        "Set-ItemProperty -LiteralPath {} -Name NetbiosOptions -Type DWord -Value {value} -ErrorAction Stop",
        system::powershell_literal(&key)
    );
    system::powershell(&command, !platform::is_admin())?;
    if get_device_identity()?.netbios_silenced != Some(enabled) {
        return Err("Windows did not confirm the NetBIOS change".into());
    }
    Ok(true)
}
