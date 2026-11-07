pub use netmask_core::*;
pub mod commands;
pub mod companion_commands;

use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};
use tauri::WebviewWindowBuilder;
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window};

struct Workers {
    running: Arc<AtomicBool>,
    shutting_down: AtomicBool,
}

pub(crate) struct UiLifecycle {
    opening: AtomicBool,
    renderer_ready: AtomicBool,
    hidden_to_tray: AtomicBool,
    pending_intent: Mutex<Option<String>>,
    transition: Mutex<()>,
}

pub struct CompanionRuntime {
    database: Option<observations::ObservationDb>,
    operation: Arc<Mutex<()>>,
    monitor_error: Mutex<Option<String>>,
    pending_prompt: Mutex<Option<companion::ContextPrompt>>,
    dismissed_prompt: Mutex<Option<String>>,
}

impl CompanionRuntime {
    fn new() -> Self {
        match observations::ObservationDb::open(settings::get_data_dir()) {
            Ok(database) => Self {
                database: Some(database),
                operation: Arc::new(Mutex::new(())),
                monitor_error: Mutex::new(None),
                pending_prompt: Mutex::new(None),
                dismissed_prompt: Mutex::new(None),
            },
            Err(error) => Self {
                database: None,
                operation: Arc::new(Mutex::new(())),
                monitor_error: Mutex::new(Some(error)),
                pending_prompt: Mutex::new(None),
                dismissed_prompt: Mutex::new(None),
            },
        }
    }

    pub(crate) fn database(&self) -> Result<observations::ObservationDb, String> {
        self.database.clone().ok_or_else(|| {
            self.monitor_error
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .clone()
                .unwrap_or_else(|| "Local connection history is unavailable".into())
        })
    }

    pub(crate) fn operation_lock(&self) -> Arc<Mutex<()>> {
        self.operation.clone()
    }

    pub(crate) fn set_monitor_error(&self, error: Option<String>) {
        *self
            .monitor_error
            .lock()
            .unwrap_or_else(|state| state.into_inner()) = error;
    }

    pub(crate) fn pending_prompt(&self) -> Option<companion::ContextPrompt> {
        self.pending_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub(crate) fn set_pending_prompt(&self, prompt: companion::ContextPrompt) {
        *self
            .pending_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(prompt);
    }

    pub(crate) fn clear_pending_prompt(&self) {
        *self
            .pending_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
    }

    pub(crate) fn dismiss_prompt(&self, id: String) {
        self.clear_pending_prompt();
        *self
            .dismissed_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(id);
    }

    pub(crate) fn prompt_was_dismissed(&self, id: &str) -> bool {
        self.dismissed_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_deref()
            == Some(id)
    }

    pub(crate) fn clear_broadcast_dismissal(&self) {
        let mut dismissed = self
            .dismissed_prompt
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if dismissed
            .as_deref()
            .is_some_and(|id| id.starts_with("broadcast:"))
        {
            *dismissed = None;
        }
    }
}

fn unix_now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn usage_cycle_start(timestamp_ms: i64) -> i64 {
    const DAY_MS: i64 = 24 * 60 * 60 * 1000;
    let days = timestamp_ms.div_euclid(DAY_MS);
    let (year, month, _) = civil_from_days(days);
    days_from_civil(year, month, 1) * DAY_MS
}

// Gregorian civil-date conversion by Howard Hinnant, adapted to signed Unix days.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 }.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month as u32, day as u32)
}

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = year - i64::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 }.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_prime = month as i64 + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day as i64 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true)
    })
}

fn show_existing_window(app: &AppHandle) -> bool {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("nm:visibility", true);
        true
    } else {
        false
    }
}

fn apply_saved_bounds(window: &tauri::WebviewWindow<tauri::Wry>) {
    if let Some(bounds) = settings::get_settings().window_bounds {
        let _ = window.set_size(tauri::LogicalSize::new(
            bounds.width.clamp(320, 16384),
            bounds.height.clamp(200, 16384),
        ));
        if bounds.is_maximized == Some(true) {
            let _ = window.maximize();
        }
    }
}

fn create_main_window(app: &AppHandle) -> Result<(), String> {
    let lifecycle = app.state::<UiLifecycle>();
    if app.get_webview_window("main").is_some() {
        lifecycle.opening.store(false, Ordering::SeqCst);
        return Ok(());
    }
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .ok_or("The main window configuration is unavailable")?;
    let result = (|| {
        WebviewWindowBuilder::from_config(app, config)
            .map_err(|error| error.to_string())?
            .visible(false)
            .build()
            .map_err(|error| error.to_string())
    })();
    lifecycle.opening.store(false, Ordering::SeqCst);
    let window = result?;
    lifecycle.renderer_ready.store(false, Ordering::SeqCst);
    apply_saved_bounds(&window);
    Ok(())
}

fn request_main_window(app: &AppHandle, intent: Option<&str>) {
    let lifecycle = app.state::<UiLifecycle>();
    let _transition = lifecycle
        .transition
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    lifecycle.hidden_to_tray.store(false, Ordering::SeqCst);
    if let Some(intent) = intent {
        *lifecycle
            .pending_intent
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(intent.into());
    }
    if lifecycle.renderer_ready.load(Ordering::SeqCst) && show_existing_window(app) {
        if let Some(intent) = lifecycle
            .pending_intent
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .take()
        {
            let _ = app.emit("nm:ui-intent", intent);
        }
        return;
    }
    if app.get_webview_window("main").is_some() {
        let _ = show_existing_window(app);
        return;
    }
    if lifecycle.opening.swap(true, Ordering::SeqCst) {
        return;
    }
    let app_for_main = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = create_main_window(&app_for_main) {
            log::warn!("The NetMask window could not be recreated: {error}");
        }
    }) {
        lifecycle.opening.store(false, Ordering::SeqCst);
        log::warn!("The NetMask window could not be scheduled: {error}");
    }
}

pub(crate) fn renderer_ready(app: &AppHandle) -> Option<String> {
    let lifecycle = app.state::<UiLifecycle>();
    lifecycle.renderer_ready.store(true, Ordering::SeqCst);
    let _ = show_existing_window(app);
    lifecycle
        .pending_intent
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .take()
}

fn destroy_main_window(app: &AppHandle) {
    let lifecycle = app.state::<UiLifecycle>();
    let _transition = lifecycle
        .transition
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    persist_window(app);
    if let Some(window) = app.get_webview_window("main") {
        lifecycle.hidden_to_tray.store(true, Ordering::SeqCst);
        let _ = window.hide();
        let _ = window.emit("nm:visibility", false);
        #[cfg(windows)]
        schedule_windows_webview_trim(app.clone());
    }
}

fn hide_window_to_tray(window: &Window) {
    let app = window.app_handle();
    let lifecycle = app.state::<UiLifecycle>();
    let _transition = lifecycle
        .transition
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    persist_window_handle(window);
    lifecycle.hidden_to_tray.store(true, Ordering::SeqCst);
    let _ = window.hide();
    let _ = window.emit("nm:visibility", false);
    #[cfg(windows)]
    schedule_windows_webview_trim(app.clone());
}

#[cfg(windows)]
fn trim_windows_webview_working_sets() -> usize {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };
    #[link(name = "psapi")]
    unsafe extern "system" {
        fn EmptyWorkingSet(process: windows_sys::Win32::Foundation::HANDLE) -> i32;
    }
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return 0;
    }
    struct Snapshot(windows_sys::Win32::Foundation::HANDLE);
    impl Drop for Snapshot {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    let snapshot = Snapshot(snapshot);
    let mut entry = PROCESSENTRY32W::default();
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    if unsafe { Process32FirstW(snapshot.0, &mut entry) } == 0 {
        return 0;
    }
    let mut processes = Vec::new();
    loop {
        let end = entry
            .szExeFile
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(entry.szExeFile.len());
        processes.push((
            entry.th32ProcessID,
            entry.th32ParentProcessID,
            String::from_utf16_lossy(&entry.szExeFile[..end]),
        ));
        if unsafe { Process32NextW(snapshot.0, &mut entry) } == 0 {
            break;
        }
    }
    let mut descendants = std::collections::HashSet::new();
    descendants.insert(std::process::id());
    let mut changed = true;
    while changed {
        changed = false;
        for (pid, parent, _) in &processes {
            if descendants.contains(parent) && descendants.insert(*pid) {
                changed = true;
            }
        }
    }
    let mut trimmed = 0;
    for (pid, _, executable) in processes {
        if !descendants.contains(&pid) || !executable.eq_ignore_ascii_case("msedgewebview2.exe") {
            continue;
        }
        let handle = unsafe { OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA, 0, pid) };
        if handle.is_null() {
            continue;
        }
        if unsafe { EmptyWorkingSet(handle) } != 0 {
            trimmed += 1;
        }
        unsafe {
            CloseHandle(handle);
        }
    }
    trimmed
}

#[cfg(windows)]
fn schedule_windows_webview_trim(app: AppHandle) {
    std::thread::spawn(move || {
        let started = Instant::now();
        for deadline_ms in WINDOWS_TRAY_TRIM_DEADLINES_MS {
            std::thread::sleep(
                Duration::from_millis(deadline_ms).saturating_sub(started.elapsed()),
            );
            let lifecycle = app.state::<UiLifecycle>();
            let _transition = lifecycle
                .transition
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if tray_trim_cancelled(lifecycle.hidden_to_tray.load(Ordering::SeqCst)) {
                return;
            }
            let webviews_trimmed = trim_windows_webview_working_sets();
            // The host is independent from WebView2 sandbox permissions. Trim
            // it even when no child handle could be opened.
            let host_trimmed = platform::trim_working_set().is_ok();
            if webviews_trimmed > 0 || host_trimmed {
                log::info!(
                    "Trimmed {webviews_trimmed} dormant NetMask WebView2 working set(s); host trimmed: {host_trimmed}"
                );
            }
        }
    });
}

#[cfg(windows)]
const WINDOWS_TRAY_TRIM_DEADLINES_MS: [u64; 3] = [750, 3_000, 12_000];

#[cfg(any(windows, test))]
fn tray_trim_cancelled(hidden_to_tray: bool) -> bool {
    !hidden_to_tray
}

pub(crate) fn exit_app(app: &AppHandle) {
    app.exit(0);
}

fn persist_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main")
        && let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor())
    {
        let size = size.to_logical::<i32>(scale);
        let bounds = types::WindowBounds {
            width: size.width.max(320),
            height: size.height.max(200),
            x: None,
            y: None,
            is_maximized: window.is_maximized().ok(),
        };
        if let Err(error) = settings::set_setting("windowBounds", serde_json::json!(bounds)) {
            log::warn!("Window size could not be saved: {error}");
        }
    }
}

fn persist_window_handle(window: &Window) {
    if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
        let size = size.to_logical::<i32>(scale);
        let bounds = types::WindowBounds {
            width: size.width.max(320),
            height: size.height.max(200),
            x: None,
            y: None,
            is_maximized: window.is_maximized().ok(),
        };
        if let Err(error) = settings::set_setting("windowBounds", serde_json::json!(bounds)) {
            log::warn!("Window size could not be saved: {error}");
        }
    }
}

fn update_tray_sharing(
    app: &AppHandle,
    item: &CheckMenuItem<tauri::Wry>,
    status: &types::StreamerStatus,
) {
    let _ = item.set_checked(status.is_cloaked);
    let _ = item.set_text(if status.manual_seconds_remaining > 0 {
        format!(
            "Sharing mode · {} min left",
            (status.manual_seconds_remaining + 59) / 60
        )
    } else if status.is_cloaked {
        "Sharing mode is on".into()
    } else {
        "Sharing mode is off".into()
    });
    if let Some(tray) = app.tray_by_id("netmask") {
        let _ = tray.set_tooltip(Some(if status.is_cloaked {
            "NetMask — sharing mode on"
        } else {
            "NetMask"
        }));
    }
}

fn handle_network_join(app: &AppHandle) {
    let Ok(backup) = settings::read_backup() else {
        return;
    };
    let Ok(snapshot) = platform::get_network_snapshot(&backup) else {
        return;
    };
    let Some(network) = snapshot.networks.iter().find(|network| network.live) else {
        return;
    };
    let Ok(preset) = companion::get_network_preset(&network.guid) else {
        return;
    };
    if !preset.enabled {
        return;
    }
    let runtime = app.state::<CompanionRuntime>();
    let preview = companion::preview_network_preset(&preset);
    if preset.apply_mode == "automatic"
        && preview
            .as_ref()
            .is_ok_and(|preview| preview.can_apply_automatically)
    {
        if let Ok(application) = companion::apply_network_preset(&network.guid, false) {
            if application.applied {
                let _ = app.emit("nm:preset-applied", application);
            }
        }
        return;
    }
    let prompt = companion::ContextPrompt {
        id: format!("preset:{}", network.guid),
        kind: "preset-ready".into(),
        title: "Network preset is ready".into(),
        detail: format!(
            "Review the saved display preferences for {} before applying them.",
            network.name
        ),
        app_name: None,
        network_guid: Some(network.guid.clone()),
    };
    runtime.set_pending_prompt(prompt.clone());
    let _ = app.emit("nm:context-prompt", prompt);
}

fn broadcast_context_prompt(
    app: &AppHandle,
    status: &types::StreamerStatus,
) -> Option<companion::ContextPrompt> {
    let detected = status.detected_app.as_ref()?;
    if status.is_cloaked {
        return None;
    }
    let preferences = settings::get_settings();
    if preferences.streamer_detection_mode != "suggest" || !preferences.context_prompts_enabled {
        return None;
    }
    let id = format!("broadcast:{}", detected.to_ascii_lowercase());
    let runtime = app.state::<CompanionRuntime>();
    if runtime.prompt_was_dismissed(&id) {
        return None;
    }
    Some(companion::ContextPrompt {
        id,
        kind: "broadcast-app".into(),
        title: format!("Prepare for {detected}?"),
        detail: "NetMask can check the connection and turn on sharing mode before you begin."
            .into(),
        app_name: Some(detected.clone()),
        network_guid: None,
    })
}

fn start_workers(
    app: &AppHandle,
    running: Arc<AtomicBool>,
    sharing_item: CheckMenuItem<tauri::Wry>,
) {
    let activation_app = app.clone();
    let activation_running = running.clone();
    std::thread::spawn(move || {
        while activation_running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(500));
            if !activation_running.load(Ordering::Relaxed) {
                break;
            }
            match settings::take_instance_activation() {
                Ok(true) => request_main_window(&activation_app, None),
                Ok(false) => {}
                Err(error) => log::warn!("An activation request could not be read: {error}"),
            }
        }
    });

    let monitor_app = app.clone();
    let monitor_running = running.clone();
    std::thread::spawn(move || {
        let mut last_context = Instant::now()
            .checked_sub(Duration::from_secs(60))
            .unwrap_or_else(Instant::now);
        let mut last_ping = last_context;
        let mut last_history = last_context;
        let mut last_counter = last_context;
        let mut last_retention = last_context;
        let mut context: Option<platform::ActiveNetworkContext> = None;
        let mut context_signature: Option<String> = None;
        let mut continuity_generation = 0u64;
        let mut latest_ping: Option<types::PingTelemetry> = None;
        let boot_id = platform::boot_identity();
        while monitor_running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(1));
            if !monitor_running.load(Ordering::Relaxed) {
                break;
            }
            let preferences = settings::get_settings();
            let visible = window_visible(&monitor_app);
            let history_enabled = preferences.monitoring_enabled && !preferences.monitoring_paused;
            let usage_enabled =
                preferences.usage_tracking_enabled && !preferences.monitoring_paused;
            let alerts_enabled = (preferences.network_change_alerts
                || preferences.behavior_change_alerts)
                && history_enabled;
            let context_enabled = history_enabled
                || usage_enabled
                || alerts_enabled
                || matches!(
                    preferences.streamer_detection_mode.as_str(),
                    "suggest" | "automatic"
                );
            let plan = monitor::monitoring_plan(
                visible,
                history_enabled,
                usage_enabled,
                context_enabled,
                context_enabled,
            );
            if last_context.elapsed() >= Duration::from_secs(plan.connection_probe_seconds) {
                last_context = Instant::now();
                match platform::active_network_context() {
                    Ok(next) => {
                        let display_changed =
                            context.as_ref().map(|value| value.display_label.as_str())
                                != next.as_ref().map(|value| value.display_label.as_str());
                        let signature = next.as_ref().map(|value| {
                            format!(
                                "{}:{}:{}:{}",
                                value.network_id,
                                value.interface_id,
                                value.access_point_fingerprint.as_deref().unwrap_or(""),
                                value.network_type
                            )
                        });
                        if signature != context_signature {
                            context_signature = signature;
                            continuity_generation = continuity_generation.wrapping_add(1);
                            speed::reset_speed_baseline();
                            let _ = monitor_app.emit("nm:network-changed", ());
                            if next.is_some() {
                                handle_network_join(&monitor_app);
                            }
                        } else if display_changed {
                            // A local label rename is not a physical network
                            // switch, so preserve measurement continuity while
                            // asking any open renderer to refresh immediately.
                            let _ = monitor_app.emit("nm:network-changed", ());
                        }
                        context = next;
                    }
                    Err(error) => {
                        log::warn!("The active network context is unavailable: {error}");
                    }
                }
            }
            let ping_due = plan
                .latency_seconds
                .is_some_and(|seconds| last_ping.elapsed() >= Duration::from_secs(seconds));
            if ping_due {
                last_ping = Instant::now();
                let generation = continuity_generation;
                let telemetry = ping::get_ping_telemetry();
                if generation == continuity_generation {
                    if visible {
                        let _ = monitor_app.emit("nm:ping-telemetry", telemetry.clone());
                    }
                    latest_ping = Some(telemetry);
                }
            }
            let history_due = history_enabled && last_history.elapsed() >= Duration::from_secs(15);
            let counter_due = plan
                .counter_seconds
                .is_some_and(|seconds| last_counter.elapsed() >= Duration::from_secs(seconds));
            if !history_due && !counter_due {
                continue;
            }
            if history_due {
                last_history = Instant::now();
            }
            if counter_due {
                last_counter = Instant::now();
            }
            let counters = if counter_due {
                context.as_ref().and_then(|active| {
                    speed::read_interface_counters(
                        active.counter_interface_id.as_deref(),
                        active.interface_name.as_deref(),
                    )
                    .map_err(|error| log::warn!("Usage counters are unavailable: {error}"))
                    .ok()
                    .flatten()
                })
            } else {
                None
            };
            let timestamp_ms = unix_now_millis();
            let observation = monitor::ActiveObservation {
                timestamp_ms,
                boot_id: boot_id.clone(),
                continuity_generation,
                network_id: context.as_ref().map(|value| value.network_id.clone()),
                display_label: context.as_ref().map(|value| value.display_label.clone()),
                network_type: context.as_ref().map(|value| value.network_type.clone()),
                interface_id: context.as_ref().map(|value| value.interface_id.clone()),
                interface_name: context
                    .as_ref()
                    .and_then(|value| value.interface_name.clone()),
                access_point_fingerprint: context
                    .as_ref()
                    .and_then(|value| value.access_point_fingerprint.clone()),
                signal_dbm: context.as_ref().and_then(|value| value.signal_dbm),
                gateway_ms: history_due
                    .then(|| latest_ping.as_ref().and_then(|value| value.gateway_ms))
                    .flatten(),
                internet_ms: history_due
                    .then(|| latest_ping.as_ref().and_then(|value| value.internet_ms))
                    .flatten(),
                jitter_ms: history_due
                    .then(|| latest_ping.as_ref().and_then(|value| value.jitter_ms))
                    .flatten(),
                received_bytes: counters.as_ref().map(|value| value.received),
                sent_bytes: counters.as_ref().map(|value| value.sent),
                missing_reason: (history_due && latest_ping.is_none())
                    .then(|| "latency check unavailable".into()),
                usage_cycle_start_ms: usage_cycle_start(timestamp_ms),
            };
            let runtime = monitor_app.state::<CompanionRuntime>();
            let Ok(database) = runtime.database() else {
                continue;
            };
            let _guard = runtime
                .operation
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            match monitor::record_active_observation(
                &database,
                &observation,
                monitor::MonitorConfig {
                    history_enabled: history_due,
                    usage_enabled: counter_due && usage_enabled,
                    access_point_alerts_enabled: history_due && preferences.network_change_alerts,
                    behavior_alerts_enabled: history_due && preferences.behavior_change_alerts,
                    maximum_counter_gap_ms: 20_000,
                    alert_baseline_window_ms: 14 * 24 * 60 * 60 * 1000,
                },
            ) {
                Ok(outcome) => {
                    *runtime
                        .monitor_error
                        .lock()
                        .unwrap_or_else(|error| error.into_inner()) = None;
                    let mut new_alert = !outcome.alerts.is_empty();
                    if preferences.usage_limit_alerts
                        && let Some(usage) = outcome.usage
                        && let Some(level) = usage.warning_triggered
                    {
                        let category = if level >= 2 {
                            "usage_over_limit"
                        } else {
                            "usage_near_limit"
                        };
                        let message = if level >= 2 {
                            format!(
                                "{} reached its local data limit. This total is measured on this computer, not provider billing.",
                                usage.total.network_label
                            )
                        } else {
                            format!(
                                "{} used at least 80% of its local data limit.",
                                usage.total.network_label
                            )
                        };
                        if database
                            .record_alert(
                                timestamp_ms,
                                &usage.total.network_key,
                                category,
                                &message,
                            )
                            .is_ok()
                        {
                            new_alert = true;
                        }
                    }
                    if new_alert
                        && let Ok(mut alerts) = database.alert_inbox(false, 1)
                        && let Some(alert) = alerts.pop()
                    {
                        let _ = monitor_app
                            .emit("nm:network-alert", companion_commands::alert_view(alert));
                    }
                }
                Err(error) => {
                    *runtime
                        .monitor_error
                        .lock()
                        .unwrap_or_else(|state| state.into_inner()) = Some(error.clone());
                    log::warn!("Connection monitoring paused after an error: {error}");
                }
            }
            if last_retention.elapsed() >= Duration::from_secs(60 * 60) {
                last_retention = Instant::now();
                if let Err(error) = database.apply_retention(
                    timestamp_ms,
                    observations::RetentionPolicy {
                        days: preferences.history_retention_days as u32,
                        sample_row_cap: 500_000,
                        usage_cycle_cap: 5_000,
                    },
                ) {
                    log::warn!("Connection history retention was deferred: {error}");
                }
            }
        }
    });

    let speed_app = app.clone();
    let speed_running = running.clone();
    std::thread::spawn(move || {
        let mut was_visible = false;
        while speed_running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(1));
            if !speed_running.load(Ordering::Relaxed) {
                break;
            }
            let visible = window_visible(&speed_app);
            if visible {
                let generation = platform::connection_generation();
                let sample =
                    speed::get_speed_sample().unwrap_or_else(|_| types::SpeedSample::unavailable());
                if generation == platform::connection_generation() && window_visible(&speed_app) {
                    let _ = speed_app.emit("nm:speed", sample);
                }
            } else if was_visible {
                speed::reset_speed_baseline();
            }
            was_visible = visible;
        }
    });

    let portal_app = app.clone();
    let portal_running = running.clone();
    std::thread::spawn(move || {
        let mut last_check = Instant::now()
            .checked_sub(Duration::from_secs(30))
            .unwrap_or_else(Instant::now);
        let mut previous = None;
        let mut previous_generation = platform::connection_generation();
        while portal_running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(1));
            if !portal_running.load(Ordering::Relaxed) {
                break;
            }
            let generation = platform::connection_generation();
            if generation != previous_generation {
                previous_generation = generation;
                previous = None;
                last_check = Instant::now()
                    .checked_sub(Duration::from_secs(30))
                    .unwrap_or_else(Instant::now);
            }
            if window_visible(&portal_app) && last_check.elapsed() >= Duration::from_secs(30) {
                last_check = Instant::now();
                if let Ok(status) = portal::check_captive_portal() {
                    if generation != platform::connection_generation()
                        || !window_visible(&portal_app)
                    {
                        continue;
                    }
                    let signature = (status.is_captive, status.portal_url.clone());
                    if previous.as_ref() != Some(&signature) {
                        let _ = portal_app.emit("nm:captive-portal-status", status);
                        previous = Some(signature);
                    }
                }
            }
        }
    });

    let streamer_app = app.clone();
    std::thread::spawn(move || {
        let mut previous = None;
        while running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(1));
            if !running.load(Ordering::Relaxed) {
                break;
            }
            let status = streamer::check_streamer_now();
            let signature = (
                status.detected_app.clone(),
                status.is_cloaked,
                status.cooldown_seconds,
                (status.manual_seconds_remaining + 59) / 60,
                status.manual_timed,
                status.error.clone(),
            );
            if previous.as_ref() != Some(&signature) {
                update_tray_sharing(&streamer_app, &sharing_item, &status);
                if status.detected_app.is_none() {
                    streamer_app
                        .state::<CompanionRuntime>()
                        .clear_broadcast_dismissal();
                } else if let Some(prompt) = broadcast_context_prompt(&streamer_app, &status) {
                    let _ = streamer_app.emit("nm:context-prompt", prompt);
                }
                let _ = streamer_app.emit("nm:streamer-status", status);
                previous = Some(signature);
            }
        }
    });
}

pub fn run() {
    let _instance_lock =
        match settings::instance_lock(std::env::args().any(|argument| argument == "--handoff")) {
            Ok(Some(lock)) => lock,
            Ok(None) => {
                let _ = settings::request_instance_activation();
                platform::show_existing_instance();
                return;
            }
            Err(error) => {
                eprintln!("{error}");
                return;
            }
        };
    let app = tauri::Builder::default()
        .manage(Workers {
            running: Arc::new(AtomicBool::new(true)),
            shutting_down: AtomicBool::new(false),
        })
        .manage(UiLifecycle {
            opening: AtomicBool::new(false),
            renderer_ready: AtomicBool::new(false),
            hidden_to_tray: AtomicBool::new(false),
            pending_intent: Mutex::new(None),
            transition: Mutex::new(()),
        })
        .manage(CompanionRuntime::new())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Warn)
                .build(),
        )
        .setup(|app| {
            settings::ensure_data_dir()?;
            if let Err(error) = settings::migrate_legacy_data() {
                log::warn!("Legacy settings migration was not completed: {error}");
            }
            if let Err(error) = operations::run_pending_recovery_audit() {
                log::warn!("Post-update recovery audit was deferred: {error}");
            }
            if let Some(window) = app.get_webview_window("main") {
                apply_saved_bounds(&window);
            }
            let show = MenuItem::with_id(app, "show", "Show NetMask", true, None::<&str>)?;
            let initial_sharing = streamer::get_streamer_status();
            let sharing = CheckMenuItem::with_id(
                app,
                "sharing",
                if initial_sharing.is_cloaked {
                    "Sharing mode is on"
                } else {
                    "Sharing mode is off"
                },
                true,
                initial_sharing.is_cloaked,
                None::<&str>,
            )?;
            let check = MenuItem::with_id(
                app,
                "connection-check",
                "Run connection check",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit NetMask", true, None::<&str>)?;
            let version = MenuItem::with_id(
                app,
                "version",
                format!("NetMask v{}", updater::CURRENT_VERSION),
                false,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&version, &show, &sharing, &check, &quit])?;
            let mut tray = TrayIconBuilder::with_id("netmask")
                .tooltip("NetMask")
                .icon_as_template(cfg!(target_os = "macos"))
                .menu(&menu)
                .show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            let sharing_event = sharing.clone();
            tray.on_menu_event(move |app, event| match event.id.as_ref() {
                "show" => request_main_window(app, None),
                "sharing" => {
                    let app = app.clone();
                    let sharing = sharing_event.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        let status = streamer::toggle_streamer_cloak();
                        update_tray_sharing(&app, &sharing, &status);
                        let _ = app.emit("nm:streamer-status", status);
                    });
                }
                "connection-check" => {
                    request_main_window(app, Some("connection-check"));
                }
                "quit" => exit_app(app),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if window_visible(app) {
                        destroy_main_window(app);
                    } else {
                        request_main_window(app, None);
                    }
                }
            })
            .build(app)?;
            update_tray_sharing(app.handle(), &sharing, &initial_sharing);
            start_workers(
                app.handle(),
                app.state::<Workers>().running.clone(),
                sharing,
            );
            if std::env::args().any(|argument| argument == "--minimized") {
                destroy_main_window(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if settings::get_settings().minimize_to_tray {
                    hide_window_to_tray(window);
                } else {
                    exit_app(window.app_handle());
                }
            }
            tauri::WindowEvent::Resized(_) => {
                let _ = window.emit("nm:maximize-change", window.is_maximized().unwrap_or(false));
                let _ = window.emit(
                    "nm:visibility",
                    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true),
                );
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::nm_is_admin,
            commands::nm_elevate,
            commands::nm_get_elevation_status,
            commands::nm_setup_silent_elevation,
            commands::nm_remove_silent_elevation,
            commands::nm_get_capabilities,
            commands::nm_get_device_identity,
            commands::nm_set_mac_randomization,
            commands::nm_set_netbios_silencer,
            commands::nm_benchmark_dns,
            commands::nm_get_current_dns,
            commands::nm_apply_dns,
            commands::nm_get_roaming_settings,
            commands::nm_set_roaming_settings,
            commands::nm_get_ping_telemetry,
            commands::nm_get_wifi_qr,
            commands::nm_check_captive_portal,
            commands::nm_open_external,
            commands::nm_get_network_snapshot,
            commands::nm_get_networks,
            commands::nm_get_connection,
            commands::nm_get_details,
            commands::nm_rename,
            commands::nm_get_name_conflict,
            commands::nm_repair_name_conflict,
            commands::nm_restore,
            commands::nm_restore_all,
            commands::nm_reconnect,
            commands::nm_run_speed_test,
            commands::nm_export_backup,
            commands::nm_import_backup,
            commands::nm_get_settings,
            commands::nm_set_setting,
            commands::nm_renderer_ready,
            commands::nm_minimize,
            commands::nm_maximize,
            commands::nm_is_maximized,
            commands::nm_close,
            commands::nm_trim_memory,
            commands::nm_get_streamer_status,
            commands::nm_get_diagnostic_report,
            commands::nm_get_recovery_audit,
            commands::nm_dismiss_recovery_audit,
            commands::nm_toggle_streamer_cloak,
            commands::nm_start_streamer_timer,
            commands::nm_get_version,
            commands::nm_get_update_status,
            commands::nm_check_update,
            commands::nm_download_update,
            commands::nm_install_update,
            commands::nm_open_release_url,
            companion_commands::nm_get_ui_session,
            companion_commands::nm_save_ui_session,
            companion_commands::nm_get_connection_history,
            companion_commands::nm_get_network_usage,
            companion_commands::nm_set_network_usage_limit,
            companion_commands::nm_get_weekly_digest,
            companion_commands::nm_delete_monitoring_data,
            companion_commands::nm_get_context_prompt,
            companion_commands::nm_respond_context_prompt,
            companion_commands::nm_get_network_alert,
            companion_commands::nm_dismiss_network_alert,
            companion_commands::nm_get_network_preset,
            companion_commands::nm_get_pending_preset_undo,
            companion_commands::nm_preview_network_preset,
            companion_commands::nm_save_network_preset,
            companion_commands::nm_apply_network_preset,
            companion_commands::nm_undo_network_preset,
            companion_commands::nm_run_going_live,
            companion_commands::nm_get_evidence_report
        ])
        .build(tauri::generate_context!())
        .expect("NetMask could not start");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let workers = app.state::<Workers>();
            if !workers.shutting_down.swap(true, Ordering::SeqCst) {
                api.prevent_exit();
                workers.running.store(false, Ordering::SeqCst);
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    persist_window(&app);
                    streamer::shutdown();
                    app.exit(0);
                });
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_trim_runs_only_while_native_state_is_hidden_to_tray() {
        assert!(!tray_trim_cancelled(true));
        assert!(tray_trim_cancelled(false));
    }

    #[cfg(windows)]
    #[test]
    fn tray_trim_deadlines_are_bounded_and_increasing() {
        assert_eq!(WINDOWS_TRAY_TRIM_DEADLINES_MS, [750, 3_000, 12_000]);
        assert!(
            WINDOWS_TRAY_TRIM_DEADLINES_MS
                .windows(2)
                .all(|pair| pair[0] < pair[1])
        );
    }
}
