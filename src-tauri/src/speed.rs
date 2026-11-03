use std::sync::Mutex;
use std::time::Instant;
use regex::Regex;
use crate::types::{SpeedSample, SpeedTestResult};
use crate::platform::run_cmd_output;

struct RawSample {
    received: u64,
    sent: u64,
    instant: Instant,
}

static SPEED_STATE: Mutex<Option<(RawSample, f64, f64, SpeedSample)>> = Mutex::new(None);

fn parse_netstat_bytes() -> Option<(u64, u64)> {
    let out = run_cmd_output("netstat", &["-e"]);
    let re = Regex::new(r"(?i)Bytes\s+(\d+)\s+(\d+)").ok()?;
    let caps = re.captures(&out)?;
    let rec: u64 = caps.get(1)?.as_str().parse().ok()?;
    let sent: u64 = caps.get(2)?.as_str().parse().ok()?;
    Some((rec, sent))
}

pub fn get_speed_sample() -> SpeedSample {
    let mut state = SPEED_STATE.lock().unwrap();
    let current_bytes = parse_netstat_bytes().unwrap_or((0, 0));
    let now = Instant::now();

    if state.is_none() {
        let initial_sample = SpeedSample {
            down_m_bps: 0.0,
            up_m_bps: 0.0,
            down_kbps: 0,
            up_kbps: 0,
            instant_down_m_bps: Some(0.0),
            instant_up_m_bps: Some(0.0),
        };
        *state = Some((
            RawSample { received: current_bytes.0, sent: current_bytes.1, instant: now },
            0.0,
            0.0,
            initial_sample.clone(),
        ));
        return initial_sample;
    }

    let (last_raw, smoothed_down, smoothed_up, last_sample) = state.as_mut().unwrap();
    let dt = (now - last_raw.instant).as_secs_f64().max(0.3);

    let mut down_diff = current_bytes.0 as i64 - last_raw.received as i64;
    if down_diff < 0 {
        down_diff += 4_294_967_296;
    }
    let mut up_diff = current_bytes.1 as i64 - last_raw.sent as i64;
    if up_diff < 0 {
        up_diff += 4_294_967_296;
    }

    // Ignore abnormal interface reset spikes (> 5 GB/s)
    if down_diff > 5 * 1024 * 1024 * 1024 { down_diff = 0; }
    if up_diff > 5 * 1024 * 1024 * 1024 { up_diff = 0; }

    last_raw.received = current_bytes.0;
    last_raw.sent = current_bytes.1;
    last_raw.instant = now;

    let instant_down = (down_diff as f64 / dt) / (1024.0 * 1024.0);
    let instant_up = (up_diff as f64 / dt) / (1024.0 * 1024.0);

    // Responsive EMA
    if instant_down >= *smoothed_down {
        *smoothed_down = 0.8 * instant_down + 0.2 * *smoothed_down;
    } else {
        *smoothed_down = 0.45 * instant_down + 0.55 * *smoothed_down;
    }

    if instant_up >= *smoothed_up {
        *smoothed_up = 0.8 * instant_up + 0.2 * *smoothed_up;
    } else {
        *smoothed_up = 0.45 * instant_up + 0.55 * *smoothed_up;
    }

    if *smoothed_down < 0.0002 { *smoothed_down = 0.0; }
    if *smoothed_up < 0.0002 { *smoothed_up = 0.0; }

    let sample = SpeedSample {
        down_m_bps: (*smoothed_down * 1000.0).round() / 1000.0,
        up_m_bps: (*smoothed_up * 1000.0).round() / 1000.0,
        down_kbps: (*smoothed_down * 1024.0).round() as i64,
        up_kbps: (*smoothed_up * 1024.0).round() as i64,
        instant_down_m_bps: Some((instant_down * 1000.0).round() / 1000.0),
        instant_up_m_bps: Some((instant_up * 1000.0).round() / 1000.0),
    };
    *last_sample = sample.clone();
    sample
}

pub fn run_speed_test() -> Result<SpeedTestResult, String> {
    let start = Instant::now();
    // Using standard curl or powershell download for reliable 0-dependency speed test
    let out = run_cmd_output("curl.exe", &["-s", "-w", "%{time_total}:%{size_download}", "-o", "NUL", "https://speed.cloudflare.com/__down?bytes=3000000"]);
    let elapsed = start.elapsed().as_secs_f64().max(0.1);

    if out.contains(':') {
        let parts: Vec<&str> = out.split(':').collect();
        if parts.len() >= 2 {
            let total_time: f64 = parts[0].trim().parse().unwrap_or(elapsed);
            let bytes: f64 = parts[1].trim().parse().unwrap_or(3_000_000.0);
            let mb_per_sec = (bytes / total_time) / (1024.0 * 1024.0);
            let mbps = (bytes * 8.0) / total_time / 1_000_000.0;
            return Ok(SpeedTestResult {
                mb_per_sec: (mb_per_sec * 100.0).round() / 100.0,
                mbps: (mbps * 10.0).round() / 10.0,
            });
        }
    }

    // Default fallback if curl didn't output formatting
    let mb_per_sec = 3_000_000.0 / elapsed / (1024.0 * 1024.0);
    let mbps = (3_000_000.0 * 8.0) / elapsed / 1_000_000.0;
    Ok(SpeedTestResult {
        mb_per_sec: (mb_per_sec * 100.0).round() / 100.0,
        mbps: (mbps * 10.0).round() / 10.0,
    })
}
