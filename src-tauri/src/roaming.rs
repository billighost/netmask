use crate::types::RoamingSettings;
use crate::platform::run_cmd_output;

const DEFAULT_PREFERRED_BANDS: &[&str] = &[
    "1. No Preference",
    "2. Prefer 2.4GHz band",
    "3. Prefer 5GHz band",
];

const DEFAULT_ROAMING_LEVELS: &[&str] = &[
    "1. Lowest",
    "2. Medium-low",
    "3. Medium",
    "4. Medium-High",
    "5. Highest",
];

pub fn get_roaming_settings() -> RoamingSettings {
    let adapter_name = "Wi-Fi".to_string();

    #[cfg(target_os = "windows")]
    {
        let ps_script = format!(
            "$res = @{{}}; try {{ $props = Get-NetAdapterAdvancedProperty -Name '{}' -ErrorAction SilentlyContinue | Where-Object {{ $_.DisplayName -match 'Roaming Aggressiveness|Preferred Band' }}; foreach ($p in $props) {{ if ($p.DisplayName -like '*Preferred Band*') {{ $res.preferredBand = $p.DisplayValue; $res.validBands = @($p.ValidDisplayValues) }}; if ($p.DisplayName -like '*Roaming Aggressiveness*') {{ $res.roamingAggressiveness = $p.DisplayValue; $res.validRoaming = @($p.ValidDisplayValues) }} }} }} catch {{}}; $res | ConvertTo-Json -Compress",
            adapter_name
        );
        let raw = run_cmd_output("powershell.exe", &["-NoProfile", "-NonInteractive", "-Command", &ps_script]);
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
            let pref = val.get("preferredBand").and_then(|v| v.as_str()).unwrap_or("1. No Preference").to_string();
            let roam = val.get("roamingAggressiveness").and_then(|v| v.as_str()).unwrap_or("3. Medium").to_string();
            let supported = val.get("preferredBand").is_some() || val.get("roamingAggressiveness").is_some();

            let valid_bands: Vec<String> = val.get("validBands")
                .and_then(|v| v.as_array())
                .filter(|arr| !arr.is_empty())
                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_else(|| DEFAULT_PREFERRED_BANDS.iter().map(|s| s.to_string()).collect());

            let valid_roam: Vec<String> = val.get("validRoaming")
                .and_then(|v| v.as_array())
                .filter(|arr| !arr.is_empty())
                .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_else(|| DEFAULT_ROAMING_LEVELS.iter().map(|s| s.to_string()).collect());

            return RoamingSettings {
                supported,
                adapter_name,
                preferred_band: pref,
                valid_preferred_bands: valid_bands,
                roaming_aggressiveness: roam,
                valid_roaming_aggressiveness: valid_roam,
            };
        }
    }

    RoamingSettings {
        supported: false,
        adapter_name,
        preferred_band: "1. No Preference".into(),
        valid_preferred_bands: DEFAULT_PREFERRED_BANDS.iter().map(|s| s.to_string()).collect(),
        roaming_aggressiveness: "3. Medium".into(),
        valid_roaming_aggressiveness: DEFAULT_ROAMING_LEVELS.iter().map(|s| s.to_string()).collect(),
    }
}

pub fn set_roaming_settings(preferred_band: Option<&str>, roaming_aggressiveness: Option<&str>) -> bool {
    let adapter_name = "Wi-Fi";
    let mut cmds = Vec::new();

    if let Some(band) = preferred_band {
        cmds.push(format!("Set-NetAdapterAdvancedProperty -Name '{}' -DisplayName 'Preferred Band*' -DisplayValue '{}' -ErrorAction SilentlyContinue", adapter_name, band.replace('\'', "''")));
    }
    if let Some(roam) = roaming_aggressiveness {
        cmds.push(format!("Set-NetAdapterAdvancedProperty -Name '{}' -DisplayName 'Roaming Aggressiveness*' -DisplayValue '{}' -ErrorAction SilentlyContinue", adapter_name, roam.replace('\'', "''")));
    }

    if cmds.is_empty() {
        return true;
    }

    let script = cmds.join(" ; ");
    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &format!("Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"{}\"' -Verb RunAs -Wait -WindowStyle Hidden", script.replace('"', "`\""))]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

