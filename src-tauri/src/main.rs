// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Some(code) = app_lib::privileged::handle_cli() {
        std::process::exit(code);
    }
    app_lib::run();
}
