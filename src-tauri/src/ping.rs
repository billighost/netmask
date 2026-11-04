use crate::{system, types::PingTelemetry};
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static GATEWAY: Mutex<Option<(Instant, Option<String>, u64)>> = Mutex::new(None);
static RECENT: Mutex<(Option<String>, Vec<i64>, u64)> = Mutex::new((None, Vec::new(), 0));

pub fn get_gateway_ip() -> Option<String> {
    let generation = crate::platform::connection_generation();
    let mut cache = GATEWAY.lock().unwrap_or_else(|e| e.into_inner());
    if let Some((checked, gateway, cached_generation)) = &*cache {
        if *cached_generation == generation && checked.elapsed() < Duration::from_secs(30) {
            return gateway.clone();
        }
    }
    #[cfg(windows)]
    let gateway = system::powershell_json("Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | Sort-Object @{ Expression = { $_.RouteMetric + (Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $_.InterfaceIndex).InterfaceMetric } } | Select-Object -First 1 -ExpandProperty NextHop")
        .ok().and_then(|v| v.as_str().map(str::to_owned));
    #[cfg(target_os = "linux")]
    let gateway = system::run("ip", &["-json", "route", "show", "default"])
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| {
            v.as_array()?
                .iter()
                .min_by_key(|r| r["metric"].as_u64().unwrap_or(0))?["gateway"]
                .as_str()
                .map(str::to_owned)
        });
    #[cfg(target_os = "macos")]
    let gateway = system::run("route", &["-n", "get", "default"])
        .ok()
        .and_then(|output| {
            output.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("gateway:")
                    .map(|s| s.trim().to_owned())
            })
        });
    let gateway = gateway.filter(|gateway| {
        gateway
            .parse::<IpAddr>()
            .is_ok_and(|ip| !ip.is_unspecified())
    });
    *cache = Some((Instant::now(), gateway.clone(), generation));
    gateway
}

pub fn invalidate_gateway() {
    *GATEWAY.lock().unwrap_or_else(|e| e.into_inner()) = None;
}

#[cfg(windows)]
pub fn probe_icmp_ping(host: &str, timeout_ms: u64) -> Option<i64> {
    use windows_sys::Win32::Foundation::{HANDLE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        ICMP_ECHO_REPLY, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho,
    };
    let ip = host.parse::<std::net::Ipv4Addr>().ok()?;
    let handle = unsafe { IcmpCreateFile() };
    if handle == INVALID_HANDLE_VALUE || handle.is_null() {
        return None;
    }
    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                IcmpCloseHandle(self.0);
            }
        }
    }
    let handle = Handle(handle);
    let payload = b"NetMask";
    let bytes = std::mem::size_of::<ICMP_ECHO_REPLY>() + payload.len() + 8;
    let mut reply = vec![0u64; bytes.div_ceil(8)];
    let count = unsafe {
        IcmpSendEcho(
            handle.0,
            u32::from_ne_bytes(ip.octets()),
            payload.as_ptr().cast(),
            payload.len() as u16,
            std::ptr::null(),
            reply.as_mut_ptr().cast(),
            (reply.len() * 8) as u32,
            timeout_ms.min(u32::MAX as u64) as u32,
        )
    };
    if count == 0 {
        return None;
    }
    let result = unsafe { &*reply.as_ptr().cast::<ICMP_ECHO_REPLY>() };
    (result.Status == 0).then_some(result.RoundTripTime as i64)
}

#[cfg(unix)]
pub fn probe_icmp_ping(host: &str, timeout_ms: u64) -> Option<i64> {
    host.parse::<IpAddr>().ok()?;
    #[cfg(target_os = "linux")]
    let timeout = timeout_ms.div_ceil(1000).to_string();
    #[cfg(target_os = "macos")]
    let timeout = timeout_ms.to_string();
    let output = system::run_checked(
        "ping",
        &["-n", "-c", "1", "-W", &timeout, host],
        Duration::from_millis(timeout_ms + 1000),
    )
    .ok()?;
    let expression = regex::Regex::new(r"time[=<]\s*(\d+(?:\.\d+)?)\s*ms").ok()?;
    expression.captures(&output)?[1]
        .parse::<f64>()
        .ok()
        .map(|ms| ms.round() as i64)
}

pub fn compute_jitter(samples: &[i64]) -> Option<f64> {
    if samples.len() < 2 {
        return None;
    }
    let sum: f64 = samples
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs() as f64)
        .sum();
    Some((sum / (samples.len() - 1) as f64 * 10.0).round() / 10.0)
}

pub fn get_ping_telemetry() -> PingTelemetry {
    let generation = crate::platform::connection_generation();
    let gateway_ip = get_gateway_ip();
    let (gateway_ms, internet_ms) = std::thread::scope(|scope| {
        let gateway = scope.spawn(|| {
            gateway_ip
                .as_deref()
                .and_then(|ip| probe_icmp_ping(ip, 1000))
        });
        let internet = scope.spawn(|| probe_icmp_ping("1.1.1.1", 1000));
        (
            gateway.join().ok().flatten(),
            internet.join().ok().flatten(),
        )
    });
    let mut recent = RECENT.lock().unwrap_or_else(|e| e.into_inner());
    if recent.0 != gateway_ip || internet_ms.is_none() || recent.2 != generation {
        recent.1.clear();
    }
    recent.0 = gateway_ip.clone();
    recent.2 = generation;
    if let Some(ms) = internet_ms {
        recent.1.push(ms);
        if recent.1.len() > 10 {
            recent.1.remove(0);
        }
    }
    let jitter_ms = compute_jitter(&recent.1);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|time| time.as_millis() as i64)
        .unwrap_or(0);
    PingTelemetry {
        gateway_ip,
        gateway_ms,
        internet_ms,
        jitter_ms,
        timestamp,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn jitter_is_mean_successive_difference_and_unavailable_for_one_sample() {
        assert_eq!(compute_jitter(&[]), None);
        assert_eq!(compute_jitter(&[20]), None);
        assert_eq!(compute_jitter(&[20, 20, 20]), Some(0.0));
        assert_eq!(compute_jitter(&[20, 22, 20, 22]), Some(2.0));
        assert_eq!(compute_jitter(&[10, 110, 10]), Some(100.0));
    }
}
