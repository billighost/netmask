use crate::{platform, types::WifiQrData};
use qrcodegen::{QrCode, QrCodeEcc};

pub fn escape_wifi_string(value: &str) -> String {
    let mut escaped = String::new();
    for character in value.chars() {
        if matches!(character, '\\' | ';' | ',' | '"' | ':') {
            escaped.push('\\');
        }
        escaped.push(character);
    }
    escaped
}

pub fn build_wifi_qr_string(ssid: &str, password: &str, auth: &str) -> Result<String, String> {
    if ssid.is_empty() || ssid.len() > 32 || ssid.chars().any(char::is_control) {
        return Err("The SSID cannot be represented in a standard Wi-Fi QR code".into());
    }
    if password.len() > 512 || password.chars().any(char::is_control) {
        return Err("The saved Wi-Fi password is invalid".into());
    }
    let auth = auth.to_ascii_lowercase();
    if auth.contains("enterprise") || auth.contains("eap") || auth.contains("802.1x") {
        return Err("Enterprise Wi-Fi cannot be shared with a standard QR code".into());
    }
    let ssid = escape_wifi_string(ssid);
    if matches!(auth.as_str(), "open" | "none") {
        if !password.is_empty() {
            return Err("Wi-Fi security data is inconsistent".into());
        }
        return Ok(format!("WIFI:T:nopass;S:{ssid};;"));
    }
    if password.is_empty() {
        return Err("The saved Wi-Fi password is unavailable".into());
    }
    let kind = if auth.contains("wep") {
        "WEP"
    } else if auth.contains("wpa") || auth.contains("sae") {
        "WPA"
    } else {
        return Err(
            "This network's security type cannot be shared with a standard Wi-Fi QR code".into(),
        );
    };
    Ok(format!(
        "WIFI:T:{kind};S:{ssid};P:{};;",
        escape_wifi_string(password)
    ))
}

pub fn create_qr_matrix(text: &str) -> Result<Vec<Vec<bool>>, String> {
    let code = QrCode::encode_text(text, QrCodeEcc::Medium)
        .map_err(|_| "Wi-Fi data exceeds QR code capacity")?;
    Ok((0..code.size())
        .map(|y| (0..code.size()).map(|x| code.get_module(x, y)).collect())
        .collect())
}

pub fn render_qr_svg(text: &str, size: usize, margin: usize) -> Result<String, String> {
    if !(64..=2048).contains(&size) || !(4..=32).contains(&margin) {
        return Err("Invalid QR display size".into());
    }
    let matrix = create_qr_matrix(text)?;
    let total = matrix.len() + margin * 2;
    let mut path = String::new();
    for (y, row) in matrix.iter().enumerate() {
        for (x, dark) in row.iter().enumerate() {
            if *dark {
                path.push_str(&format!("M{},{}h1v1h-1z", x + margin, y + margin));
            }
        }
    }
    Ok(format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} {total}" width="{size}" height="{size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="{path}" fill="#000"/></svg>"##
    ))
}

pub fn get_wifi_qr(profile: &str) -> Result<WifiQrData, String> {
    #[cfg(windows)]
    let (ssid, auth, password) = platform::windows::wifi_credentials(profile)?;
    #[cfg(target_os = "linux")]
    let (ssid, auth, password) = platform::linux::wifi_credentials(profile)?;
    #[cfg(target_os = "macos")]
    let (ssid, auth, password) = platform::macos::wifi_credentials(profile)?;
    let qr_string = build_wifi_qr_string(&ssid, &password, &auth)?;
    let svg = render_qr_svg(&qr_string, 240, 4)?;
    let is_wep = auth.to_ascii_lowercase().contains("wep");
    let is_open = matches!(auth.to_ascii_lowercase().as_str(), "open" | "none");
    Ok(WifiQrData {
        ssid,
        auth,
        password,
        qr_string,
        svg,
        is_wep,
        is_open,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protected_networks_without_passwords_never_become_open_qr_codes() {
        assert!(build_wifi_qr_string("Studio", "", "WPA2-Personal").is_err());
        assert!(build_wifi_qr_string("Studio", "secret", "WPA2-Enterprise").is_err());
        assert_eq!(
            build_wifi_qr_string("Cafe;Special", r#"p:a;s\s"123"#, "WPA2").unwrap(),
            r#"WIFI:T:WPA;S:Cafe\;Special;P:p\:a\;s\\s\"123;;"#
        );
        assert_eq!(
            build_wifi_qr_string("Guest", "", "Open").unwrap(),
            "WIFI:T:nopass;S:Guest;;"
        );
        assert!(render_qr_svg(&"a".repeat(10000), 240, 4).is_err());
    }
}
