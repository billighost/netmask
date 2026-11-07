use crate::types::{Connection, Network};
use crate::{settings, system};
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

pub fn wifi_interface() -> Result<String, String> {
    let ports = system::run("networksetup", &["-listallhardwareports"])?;
    let mut wifi = false;
    for line in ports.lines() {
        if let Some(port) = line.trim().strip_prefix("Hardware Port:") {
            wifi = matches!(port.trim(), "Wi-Fi" | "AirPort");
        }
        if wifi {
            if let Some(device) = line.trim().strip_prefix("Device:") {
                return Ok(device.trim().into());
            }
        }
    }
    Err("No Wi-Fi interface is available".into())
}

fn airport_interface<'a>(value: &'a Value, interface: &str) -> Option<&'a Value> {
    match value {
        Value::Object(object) => {
            if object.get("_name").and_then(Value::as_str) == Some(interface)
                && object.contains_key("spairport_current_network_information")
            {
                return Some(value);
            }
            object
                .values()
                .find_map(|v| airport_interface(v, interface))
        }
        Value::Array(values) => values.iter().find_map(|v| airport_interface(v, interface)),
        _ => None,
    }
}

pub fn parse_connection(value: &Value, interface: &str, ssid: &str) -> Connection {
    let network = airport_interface(value, interface)
        .and_then(|v| v.get("spairport_current_network_information"));
    let field = |name| network.and_then(|v| v.get(name)).and_then(Value::as_str);
    let numbers: Vec<i32> = field("spairport_signal_noise")
        .map(|text| {
            regex::Regex::new(r"-?\d+")
                .unwrap()
                .find_iter(text)
                .filter_map(|m| m.as_str().parse().ok())
                .collect()
        })
        .unwrap_or_default();
    let signal_dbm = numbers.first().copied();
    let snr = signal_dbm
        .zip(numbers.get(1).copied())
        .map(|(signal, noise)| (signal - noise).max(0));
    let channel_text = field("spairport_network_channel").unwrap_or("");
    let channel = regex::Regex::new(r"^\d+")
        .unwrap()
        .find(channel_text)
        .and_then(|m| m.as_str().parse().ok());
    let band = if channel_text.contains("6GHz") {
        "6 GHz"
    } else if channel_text.contains("5GHz") {
        "5 GHz"
    } else if channel_text.contains("2GHz") || channel_text.contains("2.4GHz") {
        "2.4 GHz"
    } else {
        "Wi-Fi"
    };
    let radio = field("spairport_phy_mode");
    let rate = network
        .and_then(|v| v.get("spairport_transmit_rate"))
        .and_then(|v| v.as_f64().or_else(|| v.as_str()?.parse().ok()));
    Connection {
        ssid: ssid.into(),
        profile: ssid.into(),
        name: ssid.into(),
        signal: signal_dbm
            .map(|r| ((r + 100) * 2).clamp(0, 100))
            .unwrap_or(0),
        signal_dbm,
        snr,
        channel,
        frequency: channel.map(|ch| super::get_channel_frequency(ch, band)),
        band: band.into(),
        generation: radio.map(|r| super::map_radio_to_generation(r, band)),
        radio_type: radio.map(str::to_owned),
        bssid: field("spairport_bssid").map(str::to_owned),
        rx_rate_mbps: None,
        tx_rate_mbps: rate,
        network_guid: None,
        interface_name: Some(interface.into()),
        interface_guid: None,
        auth: field("spairport_security_mode").map(str::to_owned),
    }
}

pub fn get_connection() -> Result<Option<Connection>, String> {
    let interface = match wifi_interface() {
        Ok(interface) => interface,
        Err(_) => return Ok(None),
    };
    let output = system::run("networksetup", &["-getairportnetwork", &interface])?;
    let Some(ssid) = output
        .strip_prefix("Current Wi-Fi Network: ")
        .filter(|s| !s.is_empty())
    else {
        let active = system::run("ifconfig", &[&interface])
            .is_ok_and(|text| text.lines().any(|line| line.trim() == "status: active"));
        return if active {
            Err("macOS has not exposed the Wi-Fi name. Check Location Services and Wi-Fi permissions.".into())
        } else {
            Ok(None)
        };
    };
    let airport = system::run("system_profiler", &["SPAirPortDataType", "-json"])
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    Ok(Some(parse_connection(&airport, &interface, ssid)))
}

pub fn active_network_context() -> Result<Option<super::ActiveNetworkContext>, String> {
    let route = system::run("route", &["-n", "get", "default"])?;
    let Some(interface) = route.lines().find_map(|line| {
        line.trim()
            .strip_prefix("interface:")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    }) else {
        return Ok(None);
    };
    let data = services()?;
    let service_id = service_id_for_device(&data, &interface)?.to_owned();
    let display_label = editable_service_name(&data, &service_id)
        .unwrap_or("Active network")
        .to_owned();
    let is_wifi = wifi_interface().is_ok_and(|wifi| wifi == interface);
    Ok(Some(super::ActiveNetworkContext {
        network_id: settings::fingerprint_local("network", &service_id)?,
        display_label,
        network_type: if is_wifi { "wifi" } else { "ethernet" }.into(),
        interface_id: settings::fingerprint_local("interface", &interface)?,
        interface_name: Some(interface),
        counter_interface_id: None,
        // macOS can withhold BSSID and signal without Location permission. The
        // lightweight tray sampler leaves them unavailable instead of running
        // system_profiler or prompting in the background.
        access_point_fingerprint: None,
        signal_dbm: None,
    }))
}

fn services() -> Result<Value, String> {
    let output = system::run(
        "plutil",
        &[
            "-convert",
            "json",
            "-o",
            "-",
            "/Library/Preferences/SystemConfiguration/preferences.plist",
        ],
    )?;
    serde_json::from_str::<Value>(&output)
        .map_err(|_| "macOS returned invalid network service data".into())
}

pub fn service_for_device(device: &str) -> Result<String, String> {
    let data = services()?;
    let id = service_id_for_device(&data, device)?;
    editable_service_name(&data, id)
        .map(str::to_owned)
        .ok_or_else(|| "The active macOS network service is unavailable".into())
}

fn service_id_for_device<'a>(data: &'a Value, device: &str) -> Result<&'a str, String> {
    let services = data["NetworkServices"]
        .as_object()
        .ok_or("No network services are available")?;
    let current = data["CurrentSet"]
        .as_str()
        .and_then(|path| data.pointer(path))
        .and_then(|set| set.pointer("/Network/Service"))
        .and_then(Value::as_object);
    if data.get("CurrentSet").is_some() && current.is_none() {
        return Err("The current macOS network location is unavailable".into());
    }
    let mut candidates = services.iter().filter(|(id, service)| {
        current.is_none_or(|set| set.contains_key(*id))
            && service["Interface"]["DeviceName"].as_str() == Some(device)
    });
    let (id, _) = candidates
        .next()
        .ok_or("The active macOS network service is unavailable")?;
    if candidates.next().is_some() {
        return Err("Multiple services use this adapter. macOS has not exposed an unambiguous active service.".into());
    }
    Ok(id)
}

fn editable_service_name<'a>(data: &'a Value, id: &str) -> Option<&'a str> {
    let services = data["NetworkServices"].as_object()?;
    let name = services.get(id)?["UserDefinedName"].as_str()?;
    let current = data["CurrentSet"]
        .as_str()
        .and_then(|path| data.pointer(path))
        .and_then(|set| set.pointer("/Network/Service"))
        .and_then(Value::as_object);
    if data.get("CurrentSet").is_some() && current.is_none()
        || current.is_some_and(|set| !set.contains_key(id))
    {
        return None;
    }
    // networksetup selects by label in the current location, rather than UUID.
    (services
        .iter()
        .filter(|(key, value)| {
            current.is_none_or(|set| set.contains_key(*key))
                && value["UserDefinedName"].as_str() == Some(name)
        })
        .take(2)
        .count()
        == 1)
        .then_some(name)
}

pub fn privileged_networksetup(arguments: &[&str], allow_prompt: bool) -> Result<(), String> {
    if super::is_admin() || !allow_prompt {
        system::run("networksetup", arguments)?;
    } else {
        let command = format!(
            "/usr/sbin/networksetup {}",
            arguments
                .iter()
                .map(|arg| shell_literal(arg))
                .collect::<Vec<_>>()
                .join(" ")
        );
        let script = format!(
            "do shell script {} with administrator privileges",
            applescript_literal(&command)
        );
        system::run_checked("osascript", &["-e", &script], Duration::from_secs(120))?;
    }
    Ok(())
}

pub fn wifi_credentials(ssid: &str) -> Result<(String, String, String), String> {
    let connection = get_connection()?
        .filter(|connection| connection.ssid == ssid)
        .ok_or("Wi-Fi sharing on macOS is available for the connected network")?;
    let auth = connection
        .auth
        .ok_or("Wi-Fi security information is unavailable")?;
    let normalized = auth.to_ascii_lowercase();
    if normalized.contains("enterprise") || normalized.contains("802.1x") {
        return Err("Enterprise Wi-Fi cannot be shared with a standard QR code".into());
    }
    if normalized == "none" || normalized == "open" || normalized.ends_with("_none") {
        return Ok((ssid.into(), "Open".into(), String::new()));
    }
    let password = system::run(
        "security",
        &[
            "find-generic-password",
            "-D",
            "AirPort network password",
            "-a",
            ssid,
            "-w",
        ],
    )?;
    if password.is_empty() {
        return Err("Keychain did not grant access to the saved Wi-Fi password".into());
    }
    Ok((
        ssid.into(),
        if normalized.contains("wep") {
            "WEP"
        } else {
            "WPA"
        }
        .into(),
        password,
    ))
}

pub fn parse_services(
    value: &Value,
    backup: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Vec<Network> {
    let Some(services) = value.get("NetworkServices").and_then(Value::as_object) else {
        return Vec::new();
    };
    services
        .iter()
        .filter_map(|(id, service)| {
            if !super::is_guid(id) {
                return None;
            }
            let name = service.get("UserDefinedName")?.as_str()?;
            let interface = service.get("Interface")?;
            let device = interface
                .get("DeviceName")
                .and_then(Value::as_str)
                .unwrap_or("");
            let hardware = interface
                .get("Hardware")
                .and_then(Value::as_str)
                .unwrap_or("");
            let kind = match hardware {
                "AirPort" | "IEEE80211" => "wifi",
                "Ethernet" => "ethernet",
                _ => return None,
            };
            let live = connection.is_some_and(|c| c.interface_name.as_deref() == Some(device))
                && service_id_for_device(value, device).is_ok_and(|selected| selected == id);
            let original = backup.get(id).cloned().unwrap_or_else(|| name.into());
            Some(Network {
                guid: id.clone(),
                name: name.into(),
                renamed: name != original,
                name_sync_pending: false,
                original_name: original,
                live,
                network_type: kind.into(),
                profile: connection.filter(|_| live).map(|c| c.ssid.clone()),
                can_rename: editable_service_name(value, id).is_some(),
            })
        })
        .collect()
}

pub fn get_networks(
    backup: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Vec<Network>, String> {
    let services = services()?;
    let mut networks = parse_services(&services, backup, connection);
    let route = system::run("route", &["-n", "get", "default"]).unwrap_or_default();
    let device = route
        .lines()
        .find_map(|line| line.trim().strip_prefix("interface:"))
        .map(str::trim);
    for network in &mut networks {
        if network.network_type == "ethernet"
            && services["NetworkServices"][&network.guid]["Interface"]["DeviceName"].as_str()
                == device
            && device.is_some()
            && service_id_for_device(&services, device.unwrap_or(""))
                .is_ok_and(|id| id == network.guid)
        {
            network.live = true;
        }
    }
    Ok(networks)
}

fn service_name(id: &str) -> Result<String, String> {
    if !super::is_guid(id) {
        return Err("Invalid macOS network service identifier".into());
    }
    let data = services()?;
    editable_service_name(&data, id)
        .map(str::to_owned)
        .ok_or_else(|| {
            "Choose a uniquely named service in the current macOS network location".into()
        })
}

pub fn shell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
pub fn applescript_literal(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

pub fn rename(
    id: &str,
    name: &str,
    current: Option<&str>,
    allow_prompt: bool,
) -> Result<(), String> {
    let old = service_name(id)?;
    if current.is_some_and(|current| current != old) {
        return Err("The network service changed. Refresh before renaming it.".into());
    }
    if super::is_admin() || !allow_prompt {
        system::run("networksetup", &["-renamenetworkservice", &old, name])?;
    } else {
        let command = format!(
            "/usr/sbin/networksetup -renamenetworkservice {} {}",
            shell_literal(&old),
            shell_literal(name)
        );
        let script = format!(
            "do shell script {} with administrator privileges",
            applescript_literal(&command)
        );
        system::run_checked("osascript", &["-e", &script], Duration::from_secs(120))?;
    }
    // Rename the service label only. Never remove/re-add a Wi-Fi SSID as OPEN.
    Ok(())
}

pub fn active_service() -> Result<String, String> {
    let route = system::run("route", &["-n", "get", "default"])?;
    let device = route
        .lines()
        .find_map(|line| line.trim().strip_prefix("interface:"))
        .map(str::trim)
        .ok_or("No active network interface")?;
    service_for_device(device)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inactive_locations_and_ambiguous_services_do_not_get_live_wifi_details() {
        let first = "00112233-4455-6677-8899-aabbccddeeff";
        let second = "11112233-4455-6677-8899-aabbccddeeff";
        let mut data = serde_json::json!({"CurrentSet":"/Sets/location", "Sets":{"location":{"Network":{"Service":{first:{}}}}}, "NetworkServices":{
            first:{"UserDefinedName":"Current Wi-Fi", "Interface":{"Hardware":"IEEE80211", "DeviceName":"en0"}},
            second:{"UserDefinedName":"Old location", "Interface":{"Hardware":"IEEE80211", "DeviceName":"en0"}}
        }});
        let connection = parse_connection(&Value::Null, "en0", "Home");
        let networks = parse_services(&data, &HashMap::new(), Some(&connection));
        assert!(editable_service_name(&data, first).is_some());
        assert!(editable_service_name(&data, second).is_none());
        assert_eq!(networks.iter().filter(|network| network.live).count(), 1);
        assert!(
            networks
                .iter()
                .find(|network| network.guid == first)
                .unwrap()
                .live
        );
        data["Sets"]["location"]["Network"]["Service"][second] = serde_json::json!({});
        assert!(service_id_for_device(&data, "en0").is_err());
        assert!(
            parse_services(&data, &HashMap::new(), Some(&connection))
                .iter()
                .all(|network| !network.live)
        );
        data["NetworkServices"][second]["UserDefinedName"] = serde_json::json!("Current Wi-Fi");
        assert!(editable_service_name(&data, first).is_none());
        assert!(
            parse_services(&data, &HashMap::new(), None)
                .iter()
                .all(|network| !network.can_rename)
        );
        data["CurrentSet"] = serde_json::json!("/Sets/missing");
        assert!(service_id_for_device(&data, "en0").is_err());
    }
    #[test]
    fn service_renames_preserve_stable_identity_and_unknown_rf_values() {
        let id = "00112233-4455-6677-8899-aabbccddeeff";
        let data = serde_json::json!({"NetworkServices": {id: {"UserDefinedName": "Studio", "Interface": {"Hardware": "IEEE80211", "DeviceName": "en0"}}}});
        let backup = HashMap::from([(id.into(), "Wi-Fi".into())]);
        let services = parse_services(&data, &backup, None);
        assert_eq!(services[0].original_name, "Wi-Fi");
        assert!(services[0].renamed);
        let connection = parse_connection(&Value::Null, "en0", "Home");
        assert_eq!(connection.signal_dbm, None);
        assert_eq!(connection.channel, None);
        assert_eq!(connection.tx_rate_mbps, None);
        assert_eq!(connection.auth, None);
        assert_eq!(shell_literal("Owner's Wi-Fi"), "'Owner'\\''s Wi-Fi'");
    }
}
