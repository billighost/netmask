pub mod types;
pub mod platform;
pub mod speed;
pub mod ping;
pub mod dns;
pub mod privacy;
pub mod roaming;
pub mod portal;
pub mod qr;
pub mod settings;
pub mod streamer;
pub mod updater;
pub mod commands;

use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            // Setup System Tray
            let show_i = MenuItem::with_id(app, "show", "Show NetMask", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let version_label = format!("NetMask v{}", updater::CURRENT_VERSION);
            let ver_i = MenuItem::with_id(app, "version", &version_label, false, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&ver_i, &show_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("NetMask")
                .menu(&tray_menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            let is_minimized = window.is_minimized().unwrap_or(false);
                            if is_visible && !is_minimized {
                                let _ = window.hide();
                                platform::trim_working_set();
                            } else {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Background speed telemetry loop (1s)
            let speed_handle = handle.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_millis(1000));
                    let sample = speed::get_speed_sample();
                    let _ = speed_handle.emit("nm:speed", sample);
                }
            });

            // Background ping telemetry loop (2s)
            let ping_handle = handle.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_millis(2000));
                    let telemetry = ping::get_ping_telemetry();
                    let _ = ping_handle.emit("nm:ping-telemetry", telemetry);
                }
            });

            // Background streamer monitor loop (15s)
            let streamer_handle = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(2000));
                loop {
                    let status = streamer::check_streamer_now();
                    let _ = streamer_handle.emit("nm:streamer-status", status);
                    std::thread::sleep(Duration::from_millis(15000));
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let settings = settings::get_settings();
                    if settings.minimize_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                        platform::trim_working_set();
                    }
                }
                tauri::WindowEvent::Resized(_) => {
                    if let Ok(is_max) = window.is_maximized() {
                        let _ = window.emit("nm:maximize-change", is_max);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::nm_is_admin,
            commands::nm_elevate,
            commands::nm_get_elevation_status,
            commands::nm_setup_silent_elevation,
            commands::nm_remove_silent_elevation,
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
