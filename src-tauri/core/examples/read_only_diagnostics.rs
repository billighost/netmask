//! Runs the shipped read paths, emitting no names, credentials, or addresses.
fn main() {
    use netmask_core::{dns, platform, privacy, roaming, settings};
    let backup = settings::read_backup().unwrap_or_default();
    let snapshot = platform::get_network_snapshot(&backup);
    let rename_state = snapshot.as_ref().map(|snapshot| {
        let live = snapshot.networks.iter().find(|network| network.live);
        serde_json::json!({
            "backup_records": backup.len(),
            "renamed_networks": snapshot.networks.iter().filter(|network| network.renamed).count(),
            "live_network_found": live.is_some(),
            "live_network_renamed": live.is_some_and(|network| network.renamed),
            "live_id_kind": live.map(|network| if network.guid.starts_with("wlan:") { "wlan-profile" } else if platform::is_guid(&network.guid) { "system-network" } else { "other" }),
            "live_id_has_recovery": live.is_some_and(|network| backup.contains_key(&network.guid)),
            "connection_name_differs_from_ssid": snapshot.connection.as_ref().is_some_and(|connection| connection.name != connection.ssid),
            "connection_matches_live_row": snapshot.connection.as_ref().zip(live).is_some_and(|(connection, network)| connection.network_guid.as_deref() == Some(network.guid.as_str()) && connection.name == network.name)
        })
    });
    let report = serde_json::json!({
        "version": netmask_core::VERSION,
        "elevated": platform::is_admin(),
        "snapshot": snapshot.as_ref().map(|s| serde_json::json!({"saved_networks":s.networks.len(),"connected":s.connection.is_some(),"connection_error":s.connection_error})).map_err(String::clone),
        "rename_state": rename_state,
        "identity": privacy::get_device_identity().map(|_| "success"),
        "dns_settings": dns::get_current_dns(None).map(|_| "success"),
        "dns_comparison": dns::benchmark_dns().map(|rows| serde_json::json!({"resolvers":rows.len(),"measured":rows.iter().filter(|row| row.latency_ms.is_some()).count()})),
        "adapter_settings": roaming::get_roaming_settings().map(|s| serde_json::json!({"supported":s.supported,"band_choices":s.valid_preferred_bands.len(),"roaming_choices":s.valid_roaming_aggressiveness.len()}))
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}
