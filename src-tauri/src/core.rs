//! Native business logic has no dependency on Tauri or a running webview.
//! This lets the same code shipped in the app be tested without a desktop session.
pub mod dns;
pub mod operations;
pub mod ping;
pub mod platform;
pub mod portal;
pub mod privacy;
pub mod privileged;
pub mod qr;
pub mod roaming;
pub mod settings;
pub mod speed;
pub mod streamer;
pub mod system;
pub mod types;
pub mod updater;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
