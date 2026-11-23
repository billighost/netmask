//! Compare full and mini read paths without exposing identifiers or mutating
//! network labels. Counts and timing are the only private-device output.
fn main() -> Result<(), String> {
    use netmask_core::{platform, settings};
    use std::time::Instant;
    let files = [
        "names.json",
        "name-links.json",
        "name-labels.json",
        "streamer.json",
    ];
    let directory = settings::get_data_dir();
    let before: Vec<_> = files
        .iter()
        .map(|name| std::fs::read(directory.join(name)).ok())
        .collect();
    let backup = settings::read_backup()?;
    let full_started = Instant::now();
    let full = platform::get_network_snapshot(&backup)?;
    let full_ms = full_started.elapsed().as_millis();
    let active_started = Instant::now();
    let active = platform::get_active_network_snapshot(&backup)?;
    let active_ms = active_started.elapsed().as_millis();
    let files_unchanged = files
        .iter()
        .zip(before)
        .all(|(name, before)| std::fs::read(directory.join(name)).ok() == before);
    let live = full
        .networks
        .iter()
        .find(|network| network.live && network.network_type == "wifi");
    let active_live = active
        .networks
        .iter()
        .find(|network| network.live && network.network_type == "wifi");
    let current_identity_and_labels_same = full.connection.as_ref().map(|connection| {
        (
            &connection.network_guid,
            &connection.name,
            &connection.profile,
            &connection.ssid,
            &connection.interface_guid,
        )
    }) == active.connection.as_ref().map(|connection| {
        (
            &connection.network_guid,
            &connection.name,
            &connection.profile,
            &connection.ssid,
            &connection.interface_guid,
        )
    });
    let report = serde_json::json!({
        "full_ms":full_ms,
        "active_ms":active_ms,
        "full_rows":full.networks.len(),
        "active_rows":active.networks.len(),
        "current_identity_and_labels_same":current_identity_and_labels_same,
        "live_network_recovery_state_same":serde_json::to_value(live).map_err(|error| error.to_string())?
            == serde_json::to_value(active_live).map_err(|error| error.to_string())?,
        "connection_error_same":full.connection_error == active.connection_error,
        "network_recovery_and_sharing_files_unchanged":files_unchanged,
        "original_label_rows":live.map(|live| full.networks.iter().filter(|network| network.name == live.original_name).count()),
        "nickname_label_rows":live.map(|live| full.networks.iter().filter(|network| network.name == live.name).count()),
        "target_profile_rows":live.map(|live| full.networks.iter().filter(|network| network.profile == live.profile).count()),
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
    );
    Ok(())
}
