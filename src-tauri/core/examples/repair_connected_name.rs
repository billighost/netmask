//! Explicitly run the same safe nickname reconciliation as the native worker.
//! Reports contain no names, addresses, Wi-Fi passwords, or profile XML.
fn main() -> Result<(), String> {
    use netmask_core::{operations, platform, settings};
    let changed = operations::reconcile_connected_name()?;
    let snapshot = platform::get_network_snapshot(&settings::read_backup()?)?;
    let live = snapshot.networks.iter().find(|network| network.live);
    #[cfg(windows)]
    let target_wlan_profiles = platform::windows::profiles().ok().and_then(|profiles| {
        let live_profile = live?.profile.as_deref()?;
        let profile = profiles
            .iter()
            .find(|profile| profile.name == live_profile)?;
        Some(
            profiles
                .iter()
                .filter(|candidate| candidate.id == profile.id)
                .count(),
        )
    });
    #[cfg(not(windows))]
    let target_wlan_profiles: Option<usize> = None;
    let report = serde_json::json!({
        "changed": changed,
        "connected": snapshot.connection.is_some(),
        "live_rows": snapshot.networks.iter().filter(|network| network.live).count(),
        "original_label_rows": live.map(|live| snapshot.networks.iter().filter(|network| network.name == live.original_name).count()),
        "nickname_label_rows": live.map(|live| snapshot.networks.iter().filter(|network| network.name == live.name).count()),
        "target_profile_rows": live.map(|live| snapshot.networks.iter().filter(|network| network.profile == live.profile).count()),
        "target_wlan_profiles": target_wlan_profiles,
        "live_renamed": live.is_some_and(|network| network.renamed),
        "live_name_sync_pending": live.is_some_and(|network| network.name_sync_pending),
        "live_profile_matches_label": live.is_some_and(|network| network.profile.as_deref() == Some(network.name.as_str())),
        "connection_matches_live_label": snapshot.connection.as_ref().zip(live)
            .is_some_and(|(connection, network)| connection.name == network.name),
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
    );
    Ok(())
}
