use crate::types::RoamingSettings;
use crate::{platform, settings, system};

#[derive(Clone)]
struct Property {
    keyword: String,
    value: String,
    valid: Vec<String>,
}

#[cfg(windows)]
fn properties() -> Result<(String, Vec<Property>), String> {
    let guid = platform::windows::active_interface_guid()?
        .ok_or("Connect to Wi-Fi to inspect its driver settings")?;
    let data = system::powershell_json(&format!(
        "$adapter = Get-NetAdapter | Where-Object {{ $_.InterfaceGuid.ToString('B') -eq {} }} | Select-Object -First 1; if (-not $adapter) {{ throw 'Wi-Fi adapter unavailable' }}; $props = @(Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction Stop | Where-Object {{ $_.Name -eq $adapter.Name -and ($_.RegistryKeyword -match 'PreferredBand|Roam.*Aggress' -or $_.DisplayName -match 'Preferred Band|Roaming Aggressiveness') }} | ForEach-Object {{ [pscustomobject]@{{ keyword = $_.RegistryKeyword; value = $_.DisplayValue; valid = @($_.ValidDisplayValues) }} }}); [pscustomobject]@{{ name = $adapter.Name; properties = $props }}",
        system::powershell_literal(&guid)
    ))?;
    let properties = data["properties"]
        .as_array()
        .map(|rows| {
            rows.iter()
                .filter_map(|row| {
                    Some(Property {
                        keyword: row["keyword"].as_str()?.into(),
                        value: row["value"].as_str().unwrap_or("").into(),
                        valid: row["valid"]
                            .as_array()
                            .map(|a| {
                                a.iter()
                                    .filter_map(|v| v.as_str().map(str::to_owned))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    Ok((
        data["name"]
            .as_str()
            .ok_or("Wi-Fi adapter unavailable")?
            .into(),
        properties,
    ))
}

#[cfg(not(windows))]
fn properties() -> Result<(String, Vec<Property>), String> {
    Ok((String::new(), Vec::new()))
}

fn preferred(property: &Property) -> bool {
    property
        .keyword
        .to_ascii_lowercase()
        .contains("preferredband")
}

pub fn get_roaming_settings() -> Result<RoamingSettings, String> {
    let (name, properties) = properties()?;
    let band = properties.iter().find(|p| preferred(p));
    let roaming = properties.iter().find(|p| !preferred(p));
    Ok(RoamingSettings {
        supported: properties.iter().any(|p| !p.valid.is_empty()),
        adapter_name: name,
        preferred_band: band.map(|p| p.value.clone()).unwrap_or_default(),
        valid_preferred_bands: band.map(|p| p.valid.clone()).unwrap_or_default(),
        roaming_aggressiveness: roaming.map(|p| p.value.clone()).unwrap_or_default(),
        valid_roaming_aggressiveness: roaming.map(|p| p.valid.clone()).unwrap_or_default(),
    })
}

pub fn set_roaming_settings(band: Option<&str>, roaming: Option<&str>) -> Result<bool, String> {
    if !cfg!(windows) {
        return Err("Driver roaming controls are available only on Windows".into());
    }
    settings::storage().with_lock("driver-mutations", || {
        let (adapter, properties) = properties()?;
        let mut script = String::new();
        for (is_band, value) in [(true, band), (false, roaming)] {
            let Some(value) = value else { continue; };
            let property = properties.iter().find(|p| preferred(p) == is_band).ok_or("This driver does not expose the requested control")?;
            if !property.valid.iter().any(|valid| valid == value) { return Err("The requested value is not supported by this Wi-Fi driver".into()); }
            script.push_str(&format!("Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction Stop | Where-Object {{ $_.Name -eq {} -and $_.RegistryKeyword -eq {} }} | Set-NetAdapterAdvancedProperty -DisplayValue {} -NoRestart -ErrorAction Stop; ",
                system::powershell_literal(&adapter), system::powershell_literal(&property.keyword), system::powershell_literal(value)));
        }
        if script.is_empty() { return Err("Choose a driver setting to change".into()); }
        script.push_str(&format!("Get-NetAdapter | Where-Object {{ $_.Name -eq {} }} | Restart-NetAdapter -Confirm:$false -ErrorAction Stop", system::powershell_literal(&adapter)));
        system::powershell(&script, !platform::is_admin())?;
        // The adapter may reconnect before the WLAN API reports a connection.
        let verify_script = format!("@(Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction Stop | Where-Object {{ $_.Name -eq {} }} | Select-Object RegistryKeyword, DisplayValue)", system::powershell_literal(&adapter));
        let verified = system::powershell_json(&verify_script)?;
        let rows = verified.as_array().ok_or("The driver did not confirm the changed settings")?;
        for (is_band, value) in [(true, band), (false, roaming)] {
            if let Some(value) = value {
                let keyword = &properties.iter().find(|p| preferred(p) == is_band).ok_or("Driver setting unavailable")?.keyword;
                if !rows.iter().any(|row| row["RegistryKeyword"].as_str() == Some(keyword) && row["DisplayValue"].as_str() == Some(value)) {
                    return Err("The Wi-Fi driver did not confirm the requested setting".into());
                }
            }
        }
        Ok(true)
    })
}
