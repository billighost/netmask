use crate::types::{SpeedSample, SpeedTestResult};
use std::collections::HashSet;
use std::io::Read;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct Counters {
    pub identity: String,
    pub received: u64,
    pub sent: u64,
}

#[derive(Default)]
pub struct SpeedTracker {
    previous: Option<(Counters, Instant)>,
    down: f64,
    up: f64,
}

static SPEED: Mutex<SpeedTracker> = Mutex::new(SpeedTracker {
    previous: None,
    down: 0.0,
    up: 0.0,
});

impl SpeedTracker {
    pub fn sample(&mut self, counters: Counters, now: Instant) -> SpeedSample {
        let mut instant_down = 0.0;
        let mut instant_up = 0.0;
        if let Some((last, time)) = &self.previous {
            let seconds = now.saturating_duration_since(*time).as_secs_f64();
            if counters.identity == last.identity
                && counters.received >= last.received
                && counters.sent >= last.sent
                && seconds > 0.0
                && seconds <= 10.0
            {
                instant_down = (counters.received - last.received) as f64 / seconds / 1_000_000.0;
                instant_up = (counters.sent - last.sent) as f64 / seconds / 1_000_000.0;
            } else {
                self.down = 0.0;
                self.up = 0.0;
            }
        }
        self.previous = Some((counters, now));
        let smooth = |last: f64, current: f64| {
            let alpha = if current >= last { 0.8 } else { 0.45 };
            let value = alpha * current + (1.0 - alpha) * last;
            if value < 0.0002 { 0.0 } else { value }
        };
        self.down = smooth(self.down, instant_down);
        self.up = smooth(self.up, instant_up);
        SpeedSample {
            down_m_bps: self.down,
            up_m_bps: self.up,
            down_kbps: (self.down * 1000.0).round() as i64,
            up_kbps: (self.up * 1000.0).round() as i64,
            instant_down_m_bps: Some(instant_down),
            instant_up_m_bps: Some(instant_up),
        }
    }
}

pub fn reset_speed_baseline() {
    *SPEED.lock().unwrap_or_else(|e| e.into_inner()) = SpeedTracker::default();
}

#[cfg(windows)]
fn read_counters() -> Result<Counters, String> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        FreeMibTable, GetIfTable2, MIB_IF_TABLE2,
    };
    let mut pointer: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    let code = unsafe { GetIfTable2(&mut pointer) };
    if code != 0 || pointer.is_null() {
        return Err(format!("Windows network counters are unavailable ({code})"));
    }
    struct Table(*mut MIB_IF_TABLE2);
    impl Drop for Table {
        fn drop(&mut self) {
            unsafe { FreeMibTable(self.0.cast()) }
        }
    }
    let table = Table(pointer);
    let count = unsafe { (*table.0).NumEntries as usize };
    if count > 10000 {
        return Err("Windows returned too many interfaces".into());
    }
    let rows = unsafe { std::slice::from_raw_parts((*table.0).Table.as_ptr(), count) };
    let mut ids = Vec::new();
    let mut received = 0u64;
    let mut sent = 0u64;
    for row in rows
        .iter()
        .filter(|row| row.OperStatus == 1 && matches!(row.Type, 6 | 71))
    {
        ids.push(row.InterfaceIndex.to_string());
        received = received.saturating_add(row.InOctets);
        sent = sent.saturating_add(row.OutOctets);
    }
    ids.sort();
    Ok(Counters {
        identity: ids.join(","),
        received,
        sent,
    })
}

pub fn parse_linux_counters(
    output: &str,
    include: impl Fn(&str) -> bool,
) -> Result<Counters, String> {
    let mut ids = Vec::new();
    let mut received = 0u64;
    let mut sent = 0u64;
    for line in output.lines().skip(2) {
        let Some((name, values)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim();
        if !include(name) {
            continue;
        }
        let fields: Vec<&str> = values.split_whitespace().collect();
        if fields.len() < 16 {
            return Err("Linux returned incomplete network counters".into());
        }
        received = received.saturating_add(
            fields[0]
                .parse::<u64>()
                .map_err(|_| "Invalid receive counter")?,
        );
        sent = sent.saturating_add(
            fields[8]
                .parse::<u64>()
                .map_err(|_| "Invalid send counter")?,
        );
        ids.push(name.to_owned());
    }
    ids.sort();
    Ok(Counters {
        identity: ids.join(","),
        received,
        sent,
    })
}

#[cfg(target_os = "linux")]
fn read_counters() -> Result<Counters, String> {
    let output = std::fs::read_to_string("/proc/net/dev")
        .map_err(|e| format!("Network counters are unavailable: {e}"))?;
    parse_linux_counters(&output, |name| {
        std::path::Path::new("/sys/class/net")
            .join(name)
            .join("device")
            .exists()
    })
}

pub fn parse_macos_counters(output: &str) -> Result<Counters, String> {
    let mut lines = output.lines();
    let header: Vec<&str> = lines
        .next()
        .ok_or("Network counters are unavailable")?
        .split_whitespace()
        .collect();
    let receive = header
        .iter()
        .position(|v| *v == "Ibytes")
        .ok_or("Receive counters are unavailable")?;
    let transmit = header
        .iter()
        .position(|v| *v == "Obytes")
        .ok_or("Send counters are unavailable")?;
    let mut seen = HashSet::new();
    let mut received = 0u64;
    let mut sent = 0u64;
    for line in lines {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() <= receive.max(transmit) {
            continue;
        }
        let name = fields[0].trim_end_matches('*');
        if !name.starts_with("en")
            || !fields.get(2).is_some_and(|v| v.starts_with("<Link#"))
            || !seen.insert(name.to_owned())
        {
            continue;
        }
        received = received.saturating_add(
            fields[receive]
                .parse::<u64>()
                .map_err(|_| "Invalid receive counter")?,
        );
        sent = sent.saturating_add(
            fields[transmit]
                .parse::<u64>()
                .map_err(|_| "Invalid send counter")?,
        );
    }
    let mut ids: Vec<_> = seen.into_iter().collect();
    ids.sort();
    Ok(Counters {
        identity: ids.join(","),
        received,
        sent,
    })
}

#[cfg(target_os = "macos")]
fn read_counters() -> Result<Counters, String> {
    parse_macos_counters(&crate::system::run("netstat", &["-ibn"])?)
}

pub fn get_speed_sample() -> Result<SpeedSample, String> {
    match read_counters() {
        Ok(counters) => Ok(SPEED
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .sample(counters, Instant::now())),
        Err(error) => {
            reset_speed_baseline();
            Err(error)
        }
    }
}

pub fn run_speed_test() -> Result<SpeedTestResult, String> {
    const EXPECTED: u64 = 3_000_000;
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Cannot start the speed test: {e}"))?;
    let start = Instant::now();
    let mut response = client
        .get("https://speed.cloudflare.com/__down?bytes=3000000")
        .header("Cache-Control", "no-cache")
        .send()
        .map_err(|_| "Speed test download failed")?
        .error_for_status()
        .map_err(|_| "Speed test server rejected the download")?;
    let mut buffer = [0u8; 64 * 1024];
    let mut total = 0u64;
    loop {
        let count = response
            .read(&mut buffer)
            .map_err(|_| "Speed test download was interrupted")?;
        if count == 0 {
            break;
        }
        total += count as u64;
        if total > EXPECTED {
            return Err("Speed test server returned an unexpected download".into());
        }
    }
    let elapsed = start.elapsed().as_secs_f64();
    if total != EXPECTED || !elapsed.is_finite() || elapsed <= 0.0 {
        return Err("Speed test did not receive the complete measurement file".into());
    }
    Ok(SpeedTestResult {
        mbps: total as f64 * 8.0 / elapsed / 1_000_000.0,
        mb_per_sec: total as f64 / elapsed / 1_000_000.0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resets_missing_samples_and_interface_changes_do_not_create_speed_spikes() {
        let mut tracker = SpeedTracker::default();
        let time = Instant::now();
        let counters = |id: &str, bytes| Counters {
            identity: id.into(),
            received: bytes,
            sent: bytes,
        };
        assert_eq!(tracker.sample(counters("wifi", 100), time).down_m_bps, 0.0);
        assert_eq!(
            tracker
                .sample(counters("wifi", 1_000_100), time + Duration::from_secs(1))
                .instant_down_m_bps,
            Some(1.0)
        );
        assert_eq!(
            tracker
                .sample(counters("wifi", 10), time + Duration::from_secs(2))
                .down_m_bps,
            0.0
        );
        assert_eq!(
            tracker
                .sample(
                    counters("ethernet", 5_000_000),
                    time + Duration::from_secs(3)
                )
                .down_m_bps,
            0.0
        );
        assert_eq!(
            tracker
                .sample(
                    counters("ethernet", 10_000_000),
                    time + Duration::from_secs(30)
                )
                .down_m_bps,
            0.0
        );
    }
    #[test]
    fn counters_parse_bytes_and_do_not_double_count_macos_address_rows() {
        let linux = "header\nheader\n eth0: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0\n lo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0";
        assert_eq!(
            parse_linux_counters(linux, |n| n == "eth0").unwrap().sent,
            200
        );
        let macos = "Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\nen0 1500 <Link#4> ab:cd 1 0 100 1 0 200 0\nen0 1500 192.168.1 192.168.1.2 1 0 100 1 0 200 0";
        let counters = parse_macos_counters(macos).unwrap();
        assert_eq!((counters.received, counters.sent), (100, 200));
    }
}
