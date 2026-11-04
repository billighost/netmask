use std::net::{TcpStream, ToSocketAddrs};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use regex::Regex;
use crate::types::PingTelemetry;
use crate::platform::run_cmd_output;

static RECENT_LATENCIES: Mutex<Vec<i64>> = Mutex::new(Vec::new());

pub fn get_gateway_ip() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let out = run_cmd_output("route.exe", &["print", "0.0.0.0"]);
        let re = Regex::new(r"(?m)0\.0\.0\.0\s+0\.0\.0\.0\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})").ok()?;
        let cap = re.captures(&out)?;
        let ip = cap.get(1)?.as_str().trim().to_string();
        if ip != "0.0.0.0" {
            Some(ip)
        } else {
            None
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

pub fn probe_tcp_latency(host: &str, port: u16, timeout_ms: u64) -> Option<i64> {
    let addr = format!("{}:{}", host, port);
    let socket_addr = addr.to_socket_addrs().ok()?.next()?;
    let start = Instant::now();
    match TcpStream::connect_timeout(&socket_addr, Duration::from_millis(timeout_ms)) {
        Ok(_) => Some(start.elapsed().as_millis() as i64),
        Err(e) => {
            // Connection refused still indicates reachability & round-trip!
            if e.kind() == std::io::ErrorKind::ConnectionRefused {
                Some(start.elapsed().as_millis() as i64)
            } else {
                None
            }
        }
    }
}

pub fn probe_icmp_ping(host: &str, timeout_ms: u64) -> Option<i64> {
    let timeout_str = timeout_ms.to_string();
    let out = run_cmd_output("ping.exe", &["-n", "1", "-w", &timeout_str, host]);
    let re = Regex::new(r"(?i)(?:time[=<]|Average = )([0-9]+)\s*ms").ok()?;
    let cap = re.captures(&out)?;
    cap.get(1)?.as_str().parse().ok()
}

pub fn probe_target(host: &str) -> Option<i64> {
    if let Some(ms) = probe_tcp_latency(host, 53, 1000) {
        return Some(ms);
    }
    probe_icmp_ping(host, 1200)
}

pub fn compute_jitter(samples: &[i64]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let mut diff_sum: f64 = 0.0;
    for i in 1..samples.len() {
        diff_sum += (samples[i] - samples[i - 1]).abs() as f64;
    }
    let jitter = diff_sum / (samples.len() - 1) as f64;
    Some((jitter * 10.0).round() / 10.0)
}

pub fn get_ping_telemetry() -> PingTelemetry {
    let gateway_ip = get_gateway_ip();
    let gateway_ms = gateway_ip.as_ref().and_then(|gw| probe_target(gw));
    let internet_ms = probe_target("1.1.1.1");

    let mut lat_guard = RECENT_LATENCIES.lock().unwrap();
    if let Some(ms) = internet_ms {
        if ms > 0 {
            lat_guard.push(ms);
            if lat_guard.len() > 10 {
                lat_guard.remove(0);
            }
        }
    }
    let jitter_ms = if internet_ms.is_some() {
        compute_jitter(&lat_guard)
    } else {
        None
    };

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    PingTelemetry {
        gateway_ip,
        gateway_ms,
        internet_ms,
        jitter_ms,
        timestamp: now_ts,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_jitter_algorithm() {
        assert_eq!(compute_jitter(&[]), None);
        assert_eq!(compute_jitter(&[20]), None);
        assert_eq!(compute_jitter(&[20, 20, 20]), Some(0.0));
        assert_eq!(compute_jitter(&[20, 22, 20, 22]), Some(2.0));
        assert_eq!(compute_jitter(&[10, 110, 10]), Some(100.0));
    }
}

