//! Runs the shipped read paths, emitting no names, credentials, or addresses.
fn main() {
    use netmask_core::{dns, platform, privacy, roaming};
    let snapshot = platform::get_network_snapshot(&std::collections::HashMap::new());
    let report = serde_json::json!({
        "version": netmask_core::VERSION,
        "elevated": platform::is_admin(),
        "snapshot": snapshot.as_ref().map(|s| serde_json::json!({"saved_networks":s.networks.len(),"connected":s.connection.is_some(),"connection_error":s.connection_error})).map_err(String::clone),
        "identity": privacy::get_device_identity().map(|_| "success"),
        "dns_settings": dns::get_current_dns(None).map(|_| "success"),
        "dns_comparison": dns::benchmark_dns().map(|rows| serde_json::json!({"resolvers":rows.len(),"measured":rows.iter().filter(|row| row.latency_ms.is_some()).count()})),
        "adapter_settings": roaming::get_roaming_settings().map(|s| serde_json::json!({"supported":s.supported,"band_choices":s.valid_preferred_bands.len(),"roaming_choices":s.valid_roaming_aggressiveness.len()}))
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}
