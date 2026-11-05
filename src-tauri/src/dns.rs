#[cfg(any(target_os = "linux", target_os = "macos"))]
use crate::platform;
use crate::types::DnsResolverResult;
use crate::{settings, system};
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::{Duration, Instant};

struct Preset {
    id: &'static str,
    name: &'static str,
    provider: &'static str,
    primary: &'static str,
    secondary: Option<&'static str>,
    description: &'static str,
}
const PRESETS: &[Preset] = &[
    Preset {
        id: "cloudflare",
        name: "Cloudflare DNS",
        provider: "Cloudflare",
        primary: "1.1.1.1",
        secondary: Some("1.0.0.1"),
        description: "Public DNS operated by Cloudflare",
    },
    Preset {
        id: "google",
        name: "Google Public DNS",
        provider: "Google",
        primary: "8.8.8.8",
        secondary: Some("8.8.4.4"),
        description: "Public DNS operated by Google",
    },
    Preset {
        id: "quad9",
        name: "Quad9 Security DNS",
        provider: "Quad9",
        primary: "9.9.9.9",
        secondary: Some("149.112.112.112"),
        description: "Blocks known malicious domains",
    },
    Preset {
        id: "adguard",
        name: "AdGuard Default DNS",
        provider: "AdGuard",
        primary: "94.140.14.14",
        secondary: Some("94.140.14.15"),
        description: "Filters advertising and tracking domains",
    },
    Preset {
        id: "dhcp",
        name: "Automatic (DHCP)",
        provider: "Router / ISP",
        primary: "Automatic",
        secondary: None,
        description: "Use DNS assigned by your network",
    },
];
static QUERY_ID: AtomicU16 = AtomicU16::new(0x4e4d);

fn query_packet(id: u16) -> Vec<u8> {
    let mut packet = vec![(id >> 8) as u8, id as u8, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    packet.extend_from_slice(b"\x07example\x03com\0\0\x01\0\x01");
    packet
}

fn dns_name(packet: &[u8], start: usize) -> Option<(Vec<u8>, usize)> {
    let mut name = Vec::new();
    let mut offset = start;
    let mut end = None;
    for _ in 0..128 {
        let length = *packet.get(offset)? as usize;
        if length & 0xc0 == 0xc0 {
            let target = ((length & 0x3f) << 8) | *packet.get(offset + 1)? as usize;
            // DNS compression points to a preceding name, never into itself.
            if target < 12 || target >= offset {
                return None;
            }
            end.get_or_insert(offset + 2);
            offset = target;
        } else if length == 0 {
            return Some((name, end.unwrap_or(offset + 1)));
        } else {
            if length > 63 || name.len() + length + 1 > 255 {
                return None;
            }
            name.push(length as u8);
            name.extend(
                packet
                    .get(offset + 1..offset + length + 1)?
                    .iter()
                    .map(u8::to_ascii_lowercase),
            );
            offset += length + 1;
        }
    }
    None
}

pub fn valid_dns_response(query: &[u8], response: &[u8]) -> bool {
    if query.len() < 12
        || response.len() < query.len()
        || response[..2] != query[..2]
        || response[2] & 0x80 == 0
        || response[2] & 0x7a != 0
        || response[3] & 0x4f != 0
        || response[4..6] != [0, 1]
        || response[12..query.len()] != query[12..]
    {
        return false;
    }
    let answers = u16::from_be_bytes([response[6], response[7]]) as usize;
    if answers == 0 || answers > 64 {
        return false;
    }
    let Some((question, _)) = dns_name(query, 12) else {
        return false;
    };
    let mut names = vec![question];
    let mut offset = query.len();
    let mut answered = false;
    for _ in 0..answers {
        let Some((owner, header)) = dns_name(response, offset) else {
            return false;
        };
        let Some(record) = response.get(header..header + 10) else {
            return false;
        };
        let record_type = u16::from_be_bytes([record[0], record[1]]);
        let class = u16::from_be_bytes([record[2], record[3]]);
        let length = u16::from_be_bytes([record[8], record[9]]) as usize;
        let data = header + 10;
        let end = data + length;
        if response.get(data..end).is_none() {
            return false;
        }
        if class == 1 && names.contains(&owner) {
            if record_type == 1 && length == 4 {
                answered = true;
            }
            if record_type == 5 {
                let Some((alias, consumed)) = dns_name(response, data) else {
                    return false;
                };
                if consumed != end {
                    return false;
                }
                names.push(alias);
            }
        }
        offset = end;
    }
    answered
}

pub fn probe_dns(address: SocketAddr, timeout: Duration) -> Option<i64> {
    let socket = UdpSocket::bind(if address.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    })
    .ok()?;
    socket.connect(address).ok()?;
    let query = query_packet(QUERY_ID.fetch_add(1, Ordering::Relaxed));
    let start = Instant::now();
    socket.send(&query).ok()?;
    let mut buffer = [0u8; 4096];
    loop {
        let remaining = timeout.checked_sub(start.elapsed())?;
        if remaining.is_zero() {
            return None;
        }
        socket.set_read_timeout(Some(remaining)).ok()?;
        let size = socket.recv(&mut buffer).ok()?;
        if valid_dns_response(&query, &buffer[..size]) {
            return Some(start.elapsed().as_millis() as i64);
        }
    }
}

fn median_latency(ip: &str) -> Option<i64> {
    let address = SocketAddr::new(ip.parse::<IpAddr>().ok()?, 53);
    let mut samples: Vec<_> = (0..3)
        .filter_map(|_| probe_dns(address, Duration::from_millis(800)))
        .collect();
    if samples.len() < 2 {
        return None;
    }
    samples.sort();
    Some(samples[samples.len() / 2])
}

#[derive(Clone)]
struct Configuration {
    target: String,
    interface: String,
    servers: Vec<String>,
    effective: Vec<String>,
    automatic: bool,
    ignore_auto: bool,
}

fn addresses(value: &str) -> Vec<String> {
    value
        .split([',', ' ', '\n', ';'])
        .filter_map(|ip| ip.trim().parse::<IpAddr>().ok())
        .map(|ip| ip.to_string())
        .collect()
}

#[cfg(windows)]
fn configuration(interface: Option<&str>) -> Result<Configuration, String> {
    let select = if let Some(name) = interface {
        format!(
            "$adapter = Get-NetAdapter | Where-Object {{ $_.Name -eq {} }} | Select-Object -First 1;",
            system::powershell_literal(name)
        )
    } else {
        "$route = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | Sort-Object @{ Expression = { $_.RouteMetric + (Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $_.InterfaceIndex).InterfaceMetric } } | Select-Object -First 1; $adapter = Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction Stop;".into()
    };
    let data = system::powershell_json(&format!(
        "{select} if (-not $adapter) {{ throw 'No active network adapter' }}; $key = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + ([Guid]$adapter.InterfaceGuid).ToString('B'); $manual = (Get-ItemProperty -LiteralPath $key -ErrorAction Stop).NameServer; [pscustomobject]@{{ target = [string]$adapter.InterfaceIndex; interface = $adapter.Name; manual = [string]$manual; servers = @((Get-DnsClientServerAddress -InterfaceIndex $adapter.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop).ServerAddresses) }}"
    )).map_err(|error| format!("DNS settings could not be read. {error}"))?;
    let manual = addresses(data["manual"].as_str().unwrap_or(""));
    let effective = data["servers"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    Ok(Configuration {
        target: data["target"]
            .as_str()
            .ok_or("Adapter index unavailable")?
            .into(),
        interface: data["interface"]
            .as_str()
            .ok_or("Adapter name unavailable")?
            .into(),
        automatic: manual.is_empty(),
        servers: manual,
        effective,
        ignore_auto: false,
    })
}

#[cfg(target_os = "linux")]
fn configuration(interface: Option<&str>) -> Result<Configuration, String> {
    let route = system::run("ip", &["-json", "route", "show", "default"])
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
    let default_device = route
        .as_ref()
        .and_then(|v| v.as_array())
        .and_then(|a| a.iter().min_by_key(|r| r["metric"].as_u64().unwrap_or(0)))
        .and_then(|r| r["dev"].as_str());
    let chosen = interface.or(default_device);
    let output = system::run(
        "nmcli",
        &[
            "-t",
            "-f",
            "UUID,TYPE,DEVICE",
            "connection",
            "show",
            "--active",
        ],
    )?;
    let fields = output
        .lines()
        .map(platform::linux::split_fields)
        .find(|f| {
            f.len() >= 3
                && matches!(
                    f[1].as_str(),
                    "802-11-wireless" | "wifi" | "802-3-ethernet" | "ethernet"
                )
                && chosen.is_none_or(|name| name == f[2])
        })
        .ok_or("No active NetworkManager connection is available")?;
    let target = fields[0].clone();
    let interface = fields[2].clone();
    let manual = system::run(
        "nmcli",
        &["-g", "ipv4.dns", "connection", "show", "uuid", &target],
    )?;
    let servers = addresses(&manual);
    let ignore_auto = system::run(
        "nmcli",
        &[
            "-g",
            "ipv4.ignore-auto-dns",
            "connection",
            "show",
            "uuid",
            &target,
        ],
    )? == "yes";
    let effective = addresses(&system::run(
        "nmcli",
        &["-g", "IP4.DNS", "device", "show", &interface],
    )?);
    Ok(Configuration {
        target,
        interface,
        automatic: !ignore_auto && servers.is_empty(),
        servers,
        effective,
        ignore_auto,
    })
}

#[cfg(target_os = "macos")]
fn configuration(interface: Option<&str>) -> Result<Configuration, String> {
    let output = system::run("route", &["-n", "get", "default"])?;
    let device = interface
        .map(str::to_owned)
        .or_else(|| {
            output.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("interface:")
                    .map(|s| s.trim().to_owned())
            })
        })
        .ok_or("The active macOS interface is unavailable")?;
    let service = platform::macos::service_for_device(&device)?;
    let servers = addresses(&system::run("networksetup", &["-getdnsservers", &service])?);
    let automatic = servers.is_empty();
    let effective = if automatic {
        system::run("ipconfig", &["getoption", &device, "domain_name_server"])
            .map(|s| addresses(&s))
            .unwrap_or_default()
    } else {
        servers.clone()
    };
    Ok(Configuration {
        target: service,
        interface: device,
        servers,
        effective,
        automatic,
        ignore_auto: false,
    })
}

pub fn get_current_dns(interface: Option<&str>) -> Result<(String, Option<String>, bool), String> {
    let config = configuration(interface)?;
    let primary = config.effective.first().cloned().unwrap_or_else(|| {
        if config.automatic {
            "Automatic"
        } else {
            "Unavailable"
        }
        .into()
    });
    Ok((primary, config.effective.get(1).cloned(), config.automatic))
}

pub fn benchmark_dns() -> Result<Vec<DnsResolverResult>, String> {
    let config = configuration(None)?;
    let specifications = benchmark_resolvers(&config);
    let mut results = std::thread::scope(|scope| {
        let handles: Vec<_> = specifications
            .into_iter()
            .map(|mut result| {
                scope.spawn(move || {
                    if result.primary != "Automatic" {
                        result.latency_ms = median_latency(&result.primary);
                    }
                    result
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| "DNS benchmark worker failed".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()
    })?;
    if let Some(index) = results
        .iter()
        .enumerate()
        .filter_map(|(i, r)| r.latency_ms.map(|ms| (i, ms)))
        .min_by_key(|(_, ms)| *ms)
        .map(|(i, _)| i)
    {
        results[index].is_fastest = Some(true);
    }
    Ok(results)
}

fn benchmark_resolvers(config: &Configuration) -> Vec<DnsResolverResult> {
    let mut results: Vec<_> = PRESETS
        .iter()
        .map(|preset| {
            let automatic = preset.id == "dhcp";
            let servers: Vec<_> = std::iter::once(preset.primary)
                .chain(preset.secondary)
                .map(str::to_owned)
                .collect();
            DnsResolverResult {
                id: preset.id.into(),
                name: preset.name.into(),
                provider: preset.provider.into(),
                // DHCP addresses cannot be inferred from a manual configuration.
                primary: if automatic && config.automatic {
                    config
                        .effective
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "Automatic".into())
                } else {
                    preset.primary.into()
                },
                secondary: if automatic && config.automatic {
                    config.effective.get(1).cloned()
                } else {
                    preset.secondary.map(str::to_owned)
                },
                description: preset.description.into(),
                is_dhcp: Some(automatic),
                latency_ms: None,
                is_current: if automatic {
                    config.automatic
                } else {
                    !config.automatic && config.servers == servers
                },
                is_fastest: Some(false),
                configuration_id: Some(config.target.clone()),
            }
        })
        .collect();
    if !results.iter().any(|result| result.is_current) {
        results.push(DnsResolverResult {
            id: "current".into(),
            name: "Current DNS".into(),
            provider: "Custom configuration".into(),
            primary: config
                .effective
                .first()
                .cloned()
                .unwrap_or_else(|| "Unavailable".into()),
            secondary: config.effective.get(1).cloned(),
            description: "Your current resolver settings".into(),
            is_dhcp: Some(false),
            latency_ms: None,
            is_current: true,
            is_fastest: Some(false),
            configuration_id: Some(config.target.clone()),
        });
    }
    results
}

#[cfg(windows)]
fn apply_configuration(config: &Configuration) -> Result<(), String> {
    let index: u32 = config.target.parse().map_err(|_| "Invalid adapter index")?;
    crate::privileged::run(crate::privileged::Request::Dns {
        index,
        servers: (!config.automatic).then(|| config.servers.clone()),
    })?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn apply_configuration(config: &Configuration) -> Result<(), String> {
    let joined = config.servers.join(",");
    let args = [
        "connection",
        "modify",
        "uuid",
        config.target.as_str(),
        "ipv4.ignore-auto-dns",
        if config.ignore_auto { "yes" } else { "no" },
        "ipv4.dns",
        joined.as_str(),
    ];
    if system::run("nmcli", &args).is_err() {
        let mut elevated = vec!["nmcli"];
        elevated.extend(args);
        system::run_checked("pkexec", &elevated, Duration::from_secs(120))?;
    }
    let reapply = ["device", "reapply", config.interface.as_str()];
    if system::run("nmcli", &reapply).is_err() {
        let mut elevated = vec!["nmcli"];
        elevated.extend(reapply);
        system::run_checked("pkexec", &elevated, Duration::from_secs(120))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_configuration(config: &Configuration) -> Result<(), String> {
    let mut args = vec!["-setdnsservers", config.target.as_str()];
    if config.automatic {
        args.push("Empty");
    } else {
        args.extend(config.servers.iter().map(String::as_str));
    }
    platform::macos::privileged_networksetup(&args, true)
}

pub fn apply_dns(resolver_id: &str, expected_target: Option<&str>) -> Result<bool, String> {
    let preset = PRESETS
        .iter()
        .find(|p| p.id == resolver_id)
        .ok_or("Unknown DNS resolver")?;
    settings::storage().with_lock("dns-mutations", || {
        let previous = configuration(None)?;
        if expected_target.is_some_and(|target| target != previous.target) {
            return Err("The active connection changed. Test DNS again before applying a resolver.".into());
        }
        let mut updated = previous.clone();
        updated.automatic = preset.id == "dhcp";
        updated.ignore_auto = !updated.automatic;
        updated.servers = if updated.automatic { Vec::new() } else { std::iter::once(preset.primary).chain(preset.secondary).map(str::to_owned).collect() };
        let result = apply_configuration(&updated).and_then(|_| {
            let verified = configuration(Some(&updated.interface))?;
            if verified.target != updated.target || verified.automatic != updated.automatic || (!updated.automatic && verified.servers != updated.servers) {
                Err("The operating system did not confirm the DNS change".into())
            } else { Ok(true) }
        });
        match result {
            Ok(success) => Ok(success),
            Err(error) => {
                let rollback = apply_configuration(&previous);
                Err(match rollback { Ok(_) => format!("{error}. Previous DNS settings restored."), Err(_) => format!("{error}. Previous DNS settings could not be restored; check your network settings.") })
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manual_dns_is_not_measured_as_dhcp_and_custom_resolvers_remain_visible() {
        let config = Configuration {
            target: "profile-id".into(),
            interface: "Wi-Fi".into(),
            servers: vec!["192.0.2.1".into()],
            effective: vec!["192.0.2.1".into()],
            automatic: false,
            ignore_auto: true,
        };
        let results = benchmark_resolvers(&config);
        let automatic = results.iter().find(|result| result.id == "dhcp").unwrap();
        assert_eq!(automatic.primary, "Automatic");
        assert_eq!(automatic.latency_ms, None);
        assert!(!automatic.is_current);
        let current = results.iter().find(|result| result.is_current).unwrap();
        assert_eq!(current.id, "current");
        assert_eq!(current.primary, "192.0.2.1");
        assert_eq!(current.configuration_id.as_deref(), Some("profile-id"));
        let automatic = Configuration {
            automatic: true,
            servers: vec![],
            ..config
        };
        let results = benchmark_resolvers(&automatic);
        assert_eq!(
            results
                .iter()
                .find(|result| result.id == "dhcp")
                .unwrap()
                .primary,
            "192.0.2.1"
        );
        assert!(!results.iter().any(|result| result.id == "current"));
    }
    #[test]
    fn dns_measurement_requires_a_matching_successful_answer() {
        let query = query_packet(1234);
        let mut response = query.clone();
        response[2] = 0x81;
        response[3] = 0x80;
        response[7] = 1;
        assert!(!valid_dns_response(&query, &response));
        response.extend_from_slice(b"\xc0\x0c\0\x01\0\x01\0\0\0\x3c\0\x04\x5d\xb8\xd8\x22");
        assert!(valid_dns_response(&query, &response));
        for length in 0..response.len() {
            assert!(!valid_dns_response(&query, &response[..length]));
        }
        response[1] ^= 1;
        assert!(!valid_dns_response(&query, &response));
        response[1] ^= 1;
        response[2] |= 2;
        assert!(!valid_dns_response(&query, &response));
        response[2] &= !2;
        response[3] |= 3;
        assert!(!valid_dns_response(&query, &response));
        assert!(!valid_dns_response(&query, &response[..8]));
    }
    #[test]
    fn benchmark_uses_udp_queries_instead_of_tcp_connection_time() {
        let server = UdpSocket::bind("127.0.0.1:0").unwrap();
        server
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let address = server.local_addr().unwrap();
        let worker = std::thread::spawn(move || {
            let mut buffer = [0u8; 1024];
            let (length, peer) = server.recv_from(&mut buffer).unwrap();
            assert_eq!(&buffer[12..length], b"\x07example\x03com\0\0\x01\0\x01");
            let mut response = buffer[..length].to_vec();
            response[2] = 0x81;
            response[3] = 0x80;
            response[7] = 1;
            response.extend_from_slice(b"\xc0\x0c\0\x01\0\x01\0\0\0\x3c\0\x04\x5d\xb8\xd8\x22");
            server.send_to(&response, peer).unwrap();
        });
        assert!(probe_dns(address, Duration::from_secs(2)).is_some());
        worker.join().unwrap();
    }
    #[test]
    fn malformed_or_unrelated_answer_records_are_rejected() {
        let query = query_packet(7);
        let mut response = query.clone();
        response[2] = 0x85;
        response[3] = 0x80;
        response[7] = 1;
        response.extend_from_slice(b"\xc0\x0c\0\x01\0\x01\0\0\0\x3c\0\x04\x5d\xb8\xd8\x22");
        assert!(valid_dns_response(&query, &response)); // Authoritative answers are valid too.
        response[query.len() + 11] = 255;
        assert!(!valid_dns_response(&query, &response));
        response[query.len() + 11] = 4;
        response[query.len() + 1] = query.len() as u8; // Self-referencing compression.
        assert!(!valid_dns_response(&query, &response));
        assert!(!valid_dns_response(&[], &response));
    }
}
