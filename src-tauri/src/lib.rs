pub use netmask_core::*;
pub mod commands;

use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItem, Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

struct Workers {
    running: Arc<AtomicBool>,
    shutting_down: AtomicBool,
}

fn window_visible(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true)
    })
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("nm:visibility", true);
    }
}

fn persist_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
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
}

fn update_tray_sharing(
    app: &AppHandle,
    item: &CheckMenuItem<tauri::Wry>,
    status: &types::StreamerStatus,
) {
    let _ = item.set_checked(status.is_cloaked);
    let _ = item.set_text(if status.is_cloaked {
        "Sharing mode is on"
    } else {
        "Sharing mode is off"
    });
    if let Some(tray) = app.tray_by_id("netmask") {
        let _ = tray.set_tooltip(Some(if status.is_cloaked {
            "NetMask — sharing mode on"
        } else {
            "NetMask"
        }));
    }
}

fn start_workers(
    app: &AppHandle,
    running: Arc<AtomicBool>,
    sharing_item: CheckMenuItem<tauri::Wry>,
) {
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

    let ping_app = app.clone();
    let ping_running = running.clone();
    std::thread::spawn(move || {
        while ping_running.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_secs(2));
            if !ping_running.load(Ordering::Relaxed) {
                break;
            }
            if window_visible(&ping_app) {
                let generation = platform::connection_generation();
                let telemetry = ping::get_ping_telemetry();
                if generation == platform::connection_generation() && window_visible(&ping_app) {
                    let _ = ping_app.emit("nm:ping-telemetry", telemetry);
                }
            }
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
                status.error.clone(),
            );
            if previous.as_ref() != Some(&signature) {
                update_tray_sharing(&streamer_app, &sharing_item, &status);
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
            let preferences = settings::get_settings();
            if let Some(window) = app.get_webview_window("main") {
                if let Some(bounds) = preferences.window_bounds {
                    let _ = window.set_size(tauri::LogicalSize::new(
                        bounds.width.clamp(320, 16384),
                        bounds.height.clamp(200, 16384),
                    ));
                    if bounds.is_maximized == Some(true) {
                        let _ = window.maximize();
                    }
                }
                if std::env::args().any(|argument| argument == "--minimized") {
                    let _ = window.hide();
                }
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
                "show" => show_window(app),
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
                    show_window(app);
                    let _ = app.emit("nm:tray-connection-check", ());
                }
                "quit" => app.exit(0),
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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                            let _ = window.emit("nm:visibility", false);
                        }
                    } else {
                        show_window(app);
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
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if settings::get_settings().minimize_to_tray {
                    let _ = window.hide();
                    let _ = window.emit("nm:visibility", false);
                } else {
                    window.app_handle().exit(0);
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
            commands::nm_restore,
            commands::nm_restore_all,
            commands::nm_reconnect,
            commands::nm_run_speed_test,
            commands::nm_export_backup,
            commands::nm_import_backup,
            commands::nm_get_settings,
            commands::nm_set_setting,
            commands::nm_minimize,
            commands::nm_maximize,
            commands::nm_is_maximized,
            commands::nm_close,
            commands::nm_trim_memory,
            commands::nm_get_streamer_status,
            commands::nm_toggle_streamer_cloak,
            commands::nm_get_version,
            commands::nm_get_update_status,
            commands::nm_check_update,
            commands::nm_download_update,
            commands::nm_install_update,
            commands::nm_open_release_url
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
