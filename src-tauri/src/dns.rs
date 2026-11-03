use regex::Regex;
use crate::types::DnsResolverResult;
use crate::platform::run_cmd_output;
use crate::ping::probe_tcp_latency;

struct DnsPreset {
    id: &'static str,
    name: &'static str,
    provider: &'static str,
    primary: &'static str,
    secondary: Option<&'static str>,
    description: &'static str,
    is_dhcp: bool,
}

const PRESETS: &[DnsPreset] = &[
    DnsPreset {
        id: "cloudflare",
        name: "Cloudflare DNS",
        provider: "Cloudflare 1.1.1.1",
        primary: "1.1.1.1",
        secondary: Some("1.0.0.1"),
        description: "Fastest global resolution with privacy-first zero-logging",
        is_dhcp: false,
    },
    DnsPreset {
        id: "google",
        name: "Google Public DNS",
        provider: "Google 8.8.8.8",
        primary: "8.8.8.8",
        secondary: Some("8.8.4.4"),
        description: "Global infrastructure with high reliability and low latency",
        is_dhcp: false,
    },
    DnsPreset {
        id: "quad9",
        name: "Quad9 Security DNS",
        provider: "Quad9 9.9.9.9",
        primary: "9.9.9.9",
        secondary: Some("149.112.112.112"),
        description: "Automated threat blocking against malware and phishing",
        is_dhcp: false,
    },
    DnsPreset {
        id: "adguard",
        name: "AdGuard Default DNS",
        provider: "AdGuard 94.140.14.14",
        primary: "94.140.14.14",
        secondary: Some("94.140.14.15"),
        description: "Blocks intrusive banner ads, trackers, and malicious domains",
        is_dhcp: false,
    },
    DnsPreset {
        id: "dhcp",
        name: "Automatic (DHCP)",
        provider: "Router / ISP Default",
        primary: "Automatic",
        secondary: None,
        description: "Default DNS assigned by local router DHCP server",
        is_dhcp: true,
    },
];

pub fn get_current_dns(interface_name: Option<&str>) -> (String, Option<String>, bool) {
    let iface = interface_name.unwrap_or("Wi-Fi");
    let out = run_cmd_output("netsh", &["interface", "ip", "show", "dns", &format!("name={}", iface)]);
    let is_dhcp = out.contains("DHCP");

    let re_ip = Regex::new(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b").unwrap();
    let ips: Vec<String> = re_ip.find_iter(&out).map(|m| m.as_str().to_string()).collect();

    let primary = if is_dhcp && ips.is_empty() {
        "Automatic".to_string()
    } else {
        ips.first().cloned().unwrap_or_else(|| "Automatic".to_string())
    };
    let secondary = ips.get(1).cloned();

    (primary, secondary, is_dhcp)
}

pub fn benchmark_dns() -> Vec<DnsResolverResult> {
    let (current_primary, _, is_dhcp) = get_current_dns(Some("Wi-Fi"));
    let mut results = Vec::new();

    for p in PRESETS {
        let is_curr = if p.is_dhcp {
            is_dhcp
        } else {
            !is_dhcp && current_primary == p.primary
        };

        let latency = if p.is_dhcp {
            if is_dhcp && current_primary != "Automatic" {
                probe_tcp_latency(&current_primary, 53, 1500)
            } else {
                None
            }
        } else {
            probe_tcp_latency(p.primary, 53, 1500)
        };

        results.push(DnsResolverResult {
            id: p.id.into(),
            name: p.name.into(),
            provider: p.provider.into(),
            primary: p.primary.into(),
            secondary: p.secondary.map(|s| s.into()),
            description: p.description.into(),
            is_dhcp: Some(p.is_dhcp),
            latency_ms: latency,
            is_current: is_curr,
            is_fastest: Some(false),
        });
    }

    // Determine fastest
    let mut min_ms = i64::MAX;
    let mut fastest_idx = None;
    for (i, r) in results.iter().enumerate() {
        if let Some(ms) = r.latency_ms {
            if ms < min_ms {
                min_ms = ms;
                fastest_idx = Some(i);
            }
        }
    }
    if let Some(idx) = fastest_idx {
        results[idx].is_fastest = Some(true);
    }

    results
}

pub fn apply_dns(resolver_id: &str) -> bool {
    let preset = PRESETS.iter().find(|p| p.id == resolver_id);
    let p = match preset {
        Some(p) => p,
        None => return false,
    };

    let iface = "Wi-Fi";
    let script = if p.is_dhcp {
        format!("netsh interface ip set dns name=\"{}\" dhcp", iface)
    } else {
        let mut s = format!("netsh interface ip set dns name=\"{}\" static {} validate=no", iface, p.primary);
        if let Some(sec) = p.secondary {
            s.push_str(&format!(" ; netsh interface ip add dns name=\"{}\" {} index=2 validate=no", iface, sec));
        }
        s
    };

    let mut cmd = std::process::Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &format!("Start-Process cmd -ArgumentList '/c {}' -Verb RunAs -Wait -WindowStyle Hidden", script.replace('\'', "''"))]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.status().map(|s| s.success()).unwrap_or(false)
}

