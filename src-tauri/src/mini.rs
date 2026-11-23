//! Native mini window geometry and lifecycle. Readings use the existing workers.
use crate::{settings, types::MiniWidgetPreferences};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, Window,
};

#[derive(Default)]
pub(crate) struct MiniRuntime {
    opening: AtomicBool,
    renderer_ready: AtomicBool,
    menu_open: AtomicBool,
    repositioning: AtomicBool,
    saving_position: AtomicBool,
    movement: AtomicU64,
    menu_anchor: Mutex<Option<Anchor>>,
    geometry: Mutex<()>,
    observed_anchor: Mutex<Option<Anchor>>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Anchor {
    right: i32,
    top: i32,
}

struct ResetFlag<'a>(&'a AtomicBool);
impl Drop for ResetFlag<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Clone, Copy, Debug)]
struct WorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Placement {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn logical_size(preferences: &MiniWidgetPreferences) -> (u32, u32) {
    let (width, height) = match (preferences.design.as_str(), preferences.minimal) {
        ("ribbon", false) => (394, 88),
        ("glass", false) => (286, 222),
        ("dial", false) => (208, 258),
        ("signal", false) => (332, 210),
        ("ribbon", true) => (174, 36),
        ("glass", true) => (166, 44),
        ("dial", true) => (136, 54),
        ("signal", true) => (176, 44),
        (_, true) => (162, 44),
        _ => (286, 198),
    };
    let scale = preferences.size.clamp(75, 140) as f64 / 100.0;
    (
        (width as f64 * scale).ceil() as u32,
        (height as f64 * scale).ceil() as u32,
    )
}

fn placement(
    area: WorkArea,
    dimensions: (u32, u32),
    anchor: Option<Anchor>,
    menu: bool,
) -> Placement {
    let logical_width = if menu {
        dimensions.0.saturating_add(352).max(340)
    } else {
        dimensions.0
    };
    let logical_height = if menu {
        if logical_width as f64 <= area.width as f64 / area.scale {
            dimensions.1.max(600)
        } else {
            dimensions.1.saturating_add(612).max(600)
        }
    } else {
        dimensions.1
    };
    let width = (logical_width as f64 * area.scale).ceil().max(1.0) as u32;
    let height = (logical_height as f64 * area.scale).ceil().max(1.0) as u32;
    let width = width.min(area.width.max(1));
    let height = height.min(area.height.max(1));
    let gap = (16.0 * area.scale).ceil() as i32;
    let anchor = anchor.unwrap_or(Anchor {
        right: area.x.saturating_add(area.width as i32).saturating_sub(gap),
        top: area.y.saturating_add(gap),
    });
    let x = anchor.right.saturating_sub(width as i32).clamp(
        area.x,
        area.x
            .saturating_add(area.width.saturating_sub(width) as i32),
    );
    let y = anchor.top.clamp(
        area.y,
        area.y
            .saturating_add(area.height.saturating_sub(height) as i32),
    );
    Placement {
        x,
        y,
        width,
        height,
    }
}

fn window_layout(
    area: WorkArea,
    dimensions: (u32, u32),
    anchor: Option<Anchor>,
    menu: bool,
) -> (Placement, f64, f64) {
    // Fit the widget first. Enlarging a compact widget while its menu is open
    // must not preserve an anchor that places the new content off the screen.
    let normal = placement(area, dimensions, anchor, false);
    if !menu {
        return (normal, 0.0, 0.0);
    }
    let expanded = placement(
        area,
        dimensions,
        Some(Anchor {
            right: normal.x + normal.width as i32,
            top: normal.y,
        }),
        true,
    );
    let top = (normal.y - expanded.y) as f64 / area.scale;
    let right =
        (expanded.x + expanded.width as i32 - normal.x - normal.width as i32) as f64 / area.scale;
    (expanded, top.max(0.0), right.max(0.0))
}

fn fitted_dimensions(area: WorkArea, preferences: &MiniWidgetPreferences) -> ((u32, u32), f64) {
    let requested = logical_size(preferences);
    let logical_width = (area.width as f64 / area.scale).floor().max(1.0);
    let logical_height = (area.height as f64 / area.scale).floor().max(1.0);
    let fit = (logical_width / requested.0 as f64)
        .min(logical_height / requested.1 as f64)
        .min(1.0);
    let dimensions = (
        (requested.0 as f64 * fit)
            .ceil()
            .max(1.0)
            .min(logical_width) as u32,
        (requested.1 as f64 * fit)
            .ceil()
            .max(1.0)
            .min(logical_height) as u32,
    );
    (dimensions, preferences.size as f64 / 100.0 * fit)
}

fn monitor_area(monitor: &tauri::Monitor) -> WorkArea {
    let area = monitor.work_area();
    WorkArea {
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
        scale: monitor.scale_factor(),
    }
}

fn choose_area(app: &AppHandle, anchor: Option<Anchor>) -> Result<WorkArea, String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?;
    if let Some(anchor) = anchor {
        if let Some(monitor) = monitors.iter().find(|monitor| {
            let area = monitor_area(monitor);
            anchor.right > area.x
                && anchor.right <= area.x.saturating_add(area.width as i32)
                && anchor.top >= area.y
                && anchor.top < area.y.saturating_add(area.height as i32)
        }) {
            return Ok(monitor_area(monitor));
        }
    }
    let monitor = app
        .get_webview_window("main")
        .and_then(|window| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next())
        .ok_or("A display is required to open mini mode")?;
    Ok(monitor_area(&monitor))
}

fn observed_anchor(window: &WebviewWindow) -> Result<Anchor, String> {
    let position = window.outer_position().map_err(|error| error.to_string())?;
    let size = window.inner_size().map_err(|error| error.to_string())?;
    Ok(Anchor {
        right: position.x.saturating_add(size.width as i32),
        top: position.y,
    })
}

fn save_position(app: &AppHandle) -> Result<(), String> {
    let runtime = app.state::<MiniRuntime>();
    let _geometry = runtime
        .geometry
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if runtime.menu_open.load(Ordering::SeqCst) || runtime.repositioning.load(Ordering::SeqCst) {
        return Ok(());
    }
    if let Some(window) = app.get_webview_window("mini") {
        runtime.repositioning.store(true, Ordering::SeqCst);
        let _repositioning = ResetFlag(&runtime.repositioning);
        resize_locked(app)?;
        let anchor = observed_anchor(&window)?;
        if settings::storage().read::<Anchor>("mini-position.json")? != Some(anchor) {
            settings::storage().write("mini-position.json", &anchor)?;
        }
    }
    Ok(())
}

pub(crate) fn visible(app: &AppHandle) -> bool {
    app.get_webview_window("mini").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(true)
    })
}

pub(crate) fn show(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("mini") {
        if !app
            .state::<MiniRuntime>()
            .renderer_ready
            .load(Ordering::SeqCst)
        {
            return Ok(());
        }
        resize(app)?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        crate::destroy_main_window(app);
        return Ok(());
    }
    let runtime = app.state::<MiniRuntime>();
    if runtime.opening.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let _opening = ResetFlag(&runtime.opening);
    let anchor = settings::storage().read::<Anchor>("mini-position.json")?;
    let area = choose_area(app, anchor)?;
    let preferences = settings::get_settings_checked()?.mini_widget;
    let (dimensions, _) = fitted_dimensions(area, &preferences);
    let geometry = placement(area, dimensions, anchor, false);
    runtime.renderer_ready.store(false, Ordering::SeqCst);
    runtime.repositioning.store(true, Ordering::SeqCst);
    let window =
        WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html?view=mini".into()))
            .title("NetMask Mini")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .inner_size(
                geometry.width as f64 / area.scale,
                geometry.height as f64 / area.scale,
            )
            .position(
                geometry.x as f64 / area.scale,
                geometry.y as f64 / area.scale,
            )
            .build()
            .map_err(|error| {
                runtime.repositioning.store(false, Ordering::SeqCst);
                format!("Mini mode could not open: {error}")
            })?;
    // Physical coordinates also work across monitors with different scale factors.
    let configured = window
        .set_position(PhysicalPosition::new(geometry.x, geometry.y))
        .and_then(|()| window.set_size(PhysicalSize::new(geometry.width, geometry.height)));
    runtime.repositioning.store(false, Ordering::SeqCst);
    if let Err(error) = configured {
        let _ = window.destroy();
        return Err(format!("Mini mode could not be positioned: {error}"));
    }
    app.state::<MiniRuntime>()
        .menu_open
        .store(false, Ordering::SeqCst);
    Ok(())
}

pub(crate) fn ready(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("mini")
        .ok_or("The mini window is unavailable")?;
    resize(app)?;
    window.show().map_err(|error| error.to_string())?;
    app.state::<MiniRuntime>()
        .renderer_ready
        .store(true, Ordering::SeqCst);
    let _ = window.set_focus();
    let _ = window.emit_to("mini", "nm:visibility", true);
    crate::destroy_main_window(app);
    Ok(())
}

pub(crate) fn resize(app: &AppHandle) -> Result<(), String> {
    let runtime = app.state::<MiniRuntime>();
    if runtime.opening.load(Ordering::SeqCst) {
        return Ok(());
    }
    let _geometry = runtime
        .geometry
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    runtime.repositioning.store(true, Ordering::SeqCst);
    let _repositioning = ResetFlag(&runtime.repositioning);
    resize_locked(app)
}

fn resize_locked(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("mini") else {
        return Ok(());
    };
    let runtime = app.state::<MiniRuntime>();
    let anchor = (*runtime
        .menu_anchor
        .lock()
        .unwrap_or_else(|error| error.into_inner()))
    .unwrap_or(observed_anchor(&window)?);
    let area = choose_area(app, Some(anchor))?;
    let (dimensions, effective_scale) =
        fitted_dimensions(area, &settings::get_settings().mini_widget);
    let (geometry, top, right) = window_layout(
        area,
        dimensions,
        Some(anchor),
        runtime.menu_open.load(Ordering::SeqCst),
    );
    let result = (|| {
        let target_size = PhysicalSize::new(geometry.width, geometry.height);
        let target_position = PhysicalPosition::new(geometry.x, geometry.y);
        if window.inner_size().map_err(|error| error.to_string())? != target_size {
            window
                .set_size(target_size)
                .map_err(|error| error.to_string())?;
        }
        if window.outer_position().map_err(|error| error.to_string())? != target_position {
            window
                .set_position(target_position)
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    })();
    if result.is_ok() {
        let normal = placement(area, dimensions, Some(anchor), false);
        *runtime
            .observed_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = Some(Anchor {
            right: normal.x + normal.width as i32,
            top: normal.y,
        });
        let _ = window.emit(
            "nm:mini-layout",
            serde_json::json!({
                "top": top,
                "right": right,
                "effectiveScale": effective_scale
            }),
        );
    }
    result
}

pub(crate) fn set_menu_open(app: &AppHandle, open: bool) -> Result<(), String> {
    let runtime = app.state::<MiniRuntime>();
    let _geometry = runtime
        .geometry
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    runtime.repositioning.store(true, Ordering::SeqCst);
    let _repositioning = ResetFlag(&runtime.repositioning);
    let previous_open = runtime.menu_open.load(Ordering::SeqCst);
    let previous_anchor = *runtime
        .menu_anchor
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if open && !runtime.menu_open.load(Ordering::SeqCst) {
        let anchor = app
            .get_webview_window("mini")
            .map(|window| observed_anchor(&window))
            .transpose()?;
        *runtime
            .menu_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = anchor;
    }
    runtime.menu_open.store(open, Ordering::SeqCst);
    let result = resize_locked(app);
    if result.is_err() {
        runtime.menu_open.store(previous_open, Ordering::SeqCst);
        *runtime
            .menu_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = previous_anchor;
        // A partially accepted resize should also return to the prior layout.
        let _ = resize_locked(app);
        return result;
    }
    if !open {
        *runtime
            .menu_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
    }
    drop(_repositioning);
    drop(_geometry);
    if !open {
        let _ = save_position(app);
    }
    result
}

pub(crate) fn dismiss(app: &AppHandle) {
    let runtime = app.state::<MiniRuntime>();
    // Tray callbacks run on the UI thread. Do not wait for the geometry lock
    // there while a worker is waiting for a window operation on that thread.
    let anchor = if runtime.menu_open.load(Ordering::SeqCst) {
        *runtime
            .menu_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    } else if runtime.repositioning.load(Ordering::SeqCst) {
        *runtime
            .observed_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    } else {
        app.get_webview_window("mini")
            .and_then(|window| observed_anchor(&window).ok())
    };
    if let Some(anchor) = anchor {
        let _ = settings::storage().write("mini-position.json", &anchor);
    }
    runtime.menu_open.store(false, Ordering::SeqCst);
    *runtime
        .menu_anchor
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = None;
    runtime.renderer_ready.store(false, Ordering::SeqCst);
    if let Some(window) = app.get_webview_window("mini") {
        let _ = window.hide();
        if let Err(error) = window.destroy() {
            runtime.renderer_ready.store(true, Ordering::SeqCst);
            log::warn!("The hidden mini window could not be closed: {error}");
        }
    }
}

pub(crate) fn restore_main(app: &AppHandle, customize: bool) {
    crate::request_main_window(app, customize.then_some("mini-settings"));
}

pub(crate) fn persist_on_exit(app: &AppHandle) {
    let runtime = app.state::<MiniRuntime>();
    let result = if runtime.menu_open.load(Ordering::SeqCst) {
        let anchor = *runtime
            .menu_anchor
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        anchor
            .map(|anchor| settings::storage().write("mini-position.json", &anchor))
            .unwrap_or(Ok(()))
    } else {
        save_position(app)
    };
    if let Err(error) = result {
        log::warn!("The mini window position could not be saved on exit: {error}");
    }
}

fn schedule_position_save(app: AppHandle) {
    let runtime = app.state::<MiniRuntime>();
    runtime.movement.fetch_add(1, Ordering::SeqCst);
    if runtime.saving_position.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        loop {
            let generation = app.state::<MiniRuntime>().movement.load(Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(200));
            if generation != app.state::<MiniRuntime>().movement.load(Ordering::SeqCst) {
                continue;
            }
            if let Err(error) = save_position(&app) {
                log::warn!("The mini window position could not be saved: {error}");
            }
            let runtime = app.state::<MiniRuntime>();
            runtime.saving_position.store(false, Ordering::SeqCst);
            if generation != runtime.movement.load(Ordering::SeqCst)
                && !runtime.saving_position.swap(true, Ordering::SeqCst)
            {
                continue;
            }
            break;
        }
    });
}

pub(crate) fn on_window_event(window: &Window, event: &tauri::WindowEvent) -> bool {
    if window.label() != "mini" {
        return false;
    }
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let app = window.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || restore_main(&app, false));
        }
        tauri::WindowEvent::Moved(_) => {
            let runtime = window.app_handle().state::<MiniRuntime>();
            if !runtime.menu_open.load(Ordering::SeqCst)
                && !runtime.repositioning.load(Ordering::SeqCst)
            {
                schedule_position_save(window.app_handle().clone());
            }
        }
        tauri::WindowEvent::ScaleFactorChanged { .. } => {
            let runtime = window.app_handle().state::<MiniRuntime>();
            if !runtime.repositioning.load(Ordering::SeqCst)
                && runtime.renderer_ready.load(Ordering::SeqCst)
            {
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let _ = resize(&app);
                });
            }
        }
        _ => {}
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn portrait_high_dpi_fits_ribbon_without_changing_saved_size() {
        let area = WorkArea {
            x: 0,
            y: 0,
            width: 768,
            height: 1024,
            scale: 1.5,
        };
        let prefs = MiniWidgetPreferences {
            design: "ribbon".into(),
            size: 140,
            ..Default::default()
        };
        let (dimensions, scale) = fitted_dimensions(area, &prefs);
        assert_eq!(dimensions.0, 512);
        assert!(scale < 1.4);
        assert!(394.0 * scale <= dimensions.0 as f64);
        assert!(88.0 * scale <= dimensions.1 as f64);
        assert_eq!(prefs.size, 140);
        let (geometry, _, _) = window_layout(area, dimensions, None, false);
        assert!(geometry.width <= 768 && geometry.height <= 1024);
    }
    fn screen() -> WorkArea {
        WorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
            scale: 1.0,
        }
    }
    #[test]
    fn every_design_has_a_small_speed_only_size() {
        for design in ["fieldnote", "ribbon", "glass", "dial", "signal"] {
            let mut prefs = MiniWidgetPreferences::default();
            prefs.design = design.into();
            let full = logical_size(&prefs);
            prefs.minimal = true;
            let minimal = logical_size(&prefs);
            assert!(minimal.0 < full.0 && minimal.1 < full.1);
            assert!(minimal.0 <= 176 && minimal.1 <= 54);
        }
    }
    #[test]
    fn default_position_uses_display_work_area_top_right() {
        let positioned = placement(screen(), (286, 198), None, false);
        assert_eq!(
            positioned,
            Placement {
                x: 1618,
                y: 16,
                width: 286,
                height: 198
            }
        );
        assert!(positioned.y + (positioned.height as i32) < 1040);
    }
    #[test]
    fn menu_expansion_and_closure_preserve_right_anchor() {
        let anchor = Anchor {
            right: 1904,
            top: 16,
        };
        let normal = placement(screen(), (162, 44), Some(anchor), false);
        let menu = placement(screen(), (162, 44), Some(anchor), true);
        assert_eq!(normal.x + normal.width as i32, menu.x + menu.width as i32);
        assert_eq!(normal.y, menu.y);
        assert_eq!(menu.height, 600);
        assert_eq!(normal, placement(screen(), (162, 44), Some(anchor), false));
    }
    #[test]
    fn removed_monitor_and_high_dpi_keep_window_reachable() {
        let area = WorkArea {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1040,
            scale: 2.0,
        };
        let positioned = placement(
            area,
            (552, 600),
            Some(Anchor {
                right: 8000,
                top: 3000,
            }),
            true,
        );
        assert!(positioned.x >= area.x && positioned.x + positioned.width as i32 <= 0);
        assert!(positioned.y >= area.y && positioned.y + positioned.height as i32 <= 1040);
        assert_eq!(positioned.height, 1040);
    }

    #[test]
    fn resizing_open_menu_at_any_edge_keeps_widget_inside_native_viewport() {
        for anchor in [
            Anchor {
                right: 162,
                top: 996,
            },
            Anchor {
                right: 1904,
                top: 996,
            },
            Anchor {
                right: 162,
                top: 16,
            },
            Anchor {
                right: 1904,
                top: 16,
            },
        ] {
            for dimensions in [(162, 44), (286, 198), (552, 124), (292, 362)] {
                let normal = placement(screen(), dimensions, Some(anchor), false);
                let (expanded, top, right) =
                    window_layout(screen(), dimensions, Some(anchor), true);
                let left = expanded.width as f64 - right - normal.width as f64;
                assert!(left >= 0.0 && top >= 0.0);
                assert!(left + normal.width as f64 <= expanded.width as f64);
                assert!(top + normal.height as f64 <= expanded.height as f64);
                let (closed, top, right) = window_layout(screen(), dimensions, Some(anchor), false);
                assert_eq!(closed, normal);
                assert_eq!((top, right), (0.0, 0.0));
            }
        }
    }
}
