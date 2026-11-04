use crate::system;
use crate::types::{Connection, Network};
use std::collections::HashMap;
use std::time::Duration;

/// NetworkManager escapes colons and backslashes; plain split(':') corrupts names.
pub fn split_fields(line: &str) -> Vec<String> {
    let mut fields = vec![String::new()];
    let mut escaped = false;
    for c in line.chars() {
        if escaped {
            if c != ':' && c != '\\' {
                fields.last_mut().unwrap().push('\\');
            }
            fields.last_mut().unwrap().push(c);
            escaped = false;
        } else if c == '\\' {
            escaped = true;
        } else if c == ':' {
            fields.push(String::new());
        } else {
            fields.last_mut().unwrap().push(c);
        }
    }
    if escaped {
        fields.last_mut().unwrap().push('\\');
    }
    fields
}

pub fn parse_networks(
    output: &str,
    backup: &HashMap<String, String>,
    active: Option<&str>,
) -> Vec<Network> {
    output
        .lines()
        .filter_map(|line| {
            let fields = split_fields(line);
            if fields.len() < 4 || !super::is_guid(&fields[0]) {
                return None;
            }
            let kind = match fields[2].as_str() {
                "802-11-wireless" | "wifi" => "wifi",
                "802-3-ethernet" | "ethernet" => "ethernet",
                _ => return None,
            };
            let original = backup
                .get(&fields[0])
                .cloned()
                .unwrap_or_else(|| fields[1].clone());
            Some(Network {
                guid: fields[0].clone(),
                name: fields[1].clone(),
                renamed: fields[1] != original,
                original_name: original,
                live: active == Some(fields[0].as_str()),
                network_type: kind.into(),
                profile: Some(fields[0].clone()),
                can_rename: true,
            })
        })
        .collect()
}

pub fn get_networks(
    backup: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Vec<Network>, String> {
    let output = system::run(
        "nmcli",
        &["-t", "-f", "UUID,NAME,TYPE,DEVICE", "connection", "show"],
    )?;
    let active = system::run(
        "nmcli",
        &["-t", "-f", "UUID", "connection", "show", "--active"],
    )?;
    let mut networks = parse_networks(&output, backup, connection.map(|c| c.profile.as_str()));
    for network in &mut networks {
        network.live = active.lines().any(|id| id == network.guid);
    }
    Ok(networks)
}

pub fn get_connection() -> Result<Option<Connection>, String> {
    let output = system::run(
        "nmcli",
        &[
            "-t",
            "-f",
            "UUID,NAME,TYPE,DEVICE",
            "connection",
            "show",
            "--active",
        ],
    )?;
    for line in output.lines() {
        let fields = split_fields(line);
        if fields.len() < 4
            || !matches!(fields[2].as_str(), "802-11-wireless" | "wifi")
            || fields[3] == "--"
        {
            continue;
        }
        let id = &fields[0];
        let interface = &fields[3];
        let ssid = system::run(
            "nmcli",
            &[
                "-g",
                "802-11-wireless.ssid",
                "connection",
                "show",
                "uuid",
                id,
            ],
        )?;
        let scan = system::run(
            "nmcli",
            &[
                "-t",
                "-f",
                "IN-USE,SSID,BSSID,SIGNAL,CHAN,FREQ,SECURITY",
                "device",
                "wifi",
                "list",
                "ifname",
                interface,
                "--rescan",
                "no",
            ],
        )
        .unwrap_or_default();
        let row = scan
            .lines()
            .map(split_fields)
            .find(|r| r.len() >= 7 && r[0] == "*");
        let value = |index: usize| {
            row.as_ref()
                .and_then(|r| r.get(index))
                .filter(|s| !s.is_empty())
                .cloned()
        };
        let signal = value(3)
            .and_then(|v| v.parse::<i32>().ok())
            .unwrap_or(0)
            .clamp(0, 100);
        let channel = value(4).and_then(|v| v.parse::<i32>().ok());
        let frequency = value(5).and_then(|v| v.split_whitespace().next()?.parse::<u32>().ok());
        let link = system::run("iw", &["dev", interface, "link"]).unwrap_or_default();
        let signal_dbm = regex::Regex::new(r"signal:\s*(-?\d+)")
            .unwrap()
            .captures(&link)
            .and_then(|m| m[1].parse().ok());
        let rate = |name: &str| {
            regex::Regex::new(&format!(r"{name} bitrate:\s*([\d.]+)\s*MBit"))
                .ok()
                .and_then(|re| re.captures(&link).and_then(|m| m[1].parse().ok()))
        };
        let radio = if link.contains("EHT-MCS") {
            Some("802.11be")
        } else if link.contains("HE-MCS") {
            Some("802.11ax")
        } else if link.contains("VHT-MCS") {
            Some("802.11ac")
        } else if link.contains("MCS") {
            Some("802.11n")
        } else {
            None
        };
        let band = frequency
            .map(super::band_from_mhz)
            .unwrap_or("Wi-Fi")
            .to_owned();
        return Ok(Some(Connection {
            ssid: split_fields(&ssid).join(":"),
            profile: id.clone(),
            name: fields[1].clone(),
            signal,
            signal_dbm,
            snr: None,
            channel,
            frequency: frequency.map(|f| format!("{:.3} GHz", f as f64 / 1000.0)),
            generation: radio.map(|r| super::map_radio_to_generation(r, &band)),
            radio_type: radio.map(str::to_owned),
            band,
            bssid: value(2),
            rx_rate_mbps: rate("rx"),
            tx_rate_mbps: rate("tx"),
            network_guid: Some(id.clone()),
            interface_name: Some(interface.clone()),
            interface_guid: None,
            auth: value(6),
        }));
    }
    Ok(None)
}

pub fn rename(
    id: &str,
    name: &str,
    current: Option<&str>,
    allow_prompt: bool,
) -> Result<(), String> {
    if !super::is_guid(id) {
        return Err("Invalid NetworkManager connection identifier".into());
    }
    if let Some(current) = current {
        let existing = system::run(
            "nmcli",
            &["-g", "connection.id", "connection", "show", "uuid", id],
        )?;
        if split_fields(&existing).join(":") != current {
            return Err("The connection changed. Refresh the network list.".into());
        }
    }
    let args = ["connection", "modify", "uuid", id, "connection.id", name];
    match system::run("nmcli", &args) {
        Ok(_) => Ok(()),
        Err(error) if !allow_prompt => Err(error),
        Err(_) => {
            let mut elevated = vec!["nmcli"];
            elevated.extend(args);
            system::run_checked("pkexec", &elevated, Duration::from_secs(120))?;
            Ok(())
        }
    }
}

pub fn wifi_credentials(id: &str) -> Result<(String, String, String), String> {
    if !super::is_guid(id) {
        return Err("Invalid Wi-Fi connection identifier".into());
    }
    let read = |field| {
        system::run(
            "nmcli",
            &[
                "--show-secrets",
                "-g",
                field,
                "connection",
                "show",
                "uuid",
                id,
            ],
        )
        .map(|s| split_fields(&s).join(":"))
    };
    let ssid = read("802-11-wireless.ssid")?;
    let key = read("802-11-wireless-security.key-mgmt")?;
    let password = if key == "none" {
        let index: u8 = read("802-11-wireless-security.wep-tx-keyidx")?
            .parse()
            .map_err(|_| "The active WEP key index is unavailable")?;
        if index > 3 {
            return Err("Invalid WEP key index".into());
        }
        read(&format!("802-11-wireless-security.wep-key{index}"))?
    } else if matches!(key.as_str(), "wpa-psk" | "sae") {
        read("802-11-wireless-security.psk")?
    } else {
        String::new()
    };
    let auth = qr_authentication(&key, &password)?;
    Ok((ssid, auth, password))
}

pub fn qr_authentication(key: &str, password: &str) -> Result<String, String> {
    match key {
        "" | "--" => Ok("Open".into()),
        "none" if !password.is_empty() && password != "--" => Ok("WEP".into()),
        "wpa-psk" | "sae" if !password.is_empty() && password != "--" => Ok("WPA".into()),
        "none" | "wpa-psk" | "sae" => {
            Err("Permission to read the saved Wi-Fi password was not granted".into())
        }
        _ => Err("This Wi-Fi security type cannot be shared with a standard Wi-Fi QR code".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn escaped_names_and_stable_uuids_survive_renames() {
        let id = "00112233-4455-6677-8899-aabbccddeeff";
        let output = format!("{id}:Café\\: Studio\\\\Wi-Fi:802-11-wireless:wlan0");
        let backup = HashMap::from([(id.into(), "Original Wi-Fi".into())]);
        let networks = parse_networks(&output, &backup, Some(id));
        assert_eq!(networks[0].name, "Café: Studio\\Wi-Fi");
        assert_eq!(networks[0].original_name, "Original Wi-Fi");
        assert_eq!(networks[0].profile.as_deref(), Some(id));
        assert!(networks[0].renamed && networks[0].live);
    }
    #[test]
    fn wep_missing_keys_and_unknown_security_never_become_open_networks() {
        assert_eq!(qr_authentication("", "").unwrap(), "Open");
        assert_eq!(qr_authentication("none", "space key ").unwrap(), "WEP");
        assert!(qr_authentication("none", "").is_err());
        assert!(qr_authentication("wpa-eap", "").is_err());
        assert!(qr_authentication("owe", "").is_err());
        assert!(qr_authentication("wpa-psk", "--").is_err());
    }
}
