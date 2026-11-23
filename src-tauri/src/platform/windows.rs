//! Native WLAN reads avoid localized netsh text and preserve Unicode profile names.
use crate::types::{Connection, Network};
use base64::Engine;
use std::collections::{HashMap, HashSet};
use std::ffi::c_void;
use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::NetworkManagement::WiFi::*;
use windows_sys::core::GUID;

struct Client(HANDLE);
impl Drop for Client {
    fn drop(&mut self) {
        unsafe {
            WlanCloseHandle(self.0, null());
        }
    }
}
struct Allocation<T>(*mut T);
impl<T> Drop for Allocation<T> {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                WlanFreeMemory(self.0.cast());
            }
        }
    }
}

fn client() -> Result<Client, String> {
    let mut version = 0;
    let mut handle = null_mut();
    let code = unsafe { WlanOpenHandle(2, null(), &mut version, &mut handle) };
    if code != 0 || handle.is_null() {
        return Err(format!("Windows WLAN service is unavailable ({code})"));
    }
    Ok(Client(handle))
}

fn interfaces(client: &Client) -> Result<Vec<WLAN_INTERFACE_INFO>, String> {
    let mut pointer = null_mut();
    let code = unsafe { WlanEnumInterfaces(client.0, null(), &mut pointer) };
    let memory = Allocation(pointer);
    if code != 0 || memory.0.is_null() {
        return Err(format!("Cannot enumerate Wi-Fi interfaces ({code})"));
    }
    // WLAN owns this allocation and supplies the count of its flexible array.
    let list = unsafe { &*memory.0 };
    if list.dwNumberOfItems > 10000 {
        return Err("Windows returned too many Wi-Fi interfaces".into());
    }
    Ok(unsafe {
        std::slice::from_raw_parts(list.InterfaceInfo.as_ptr(), list.dwNumberOfItems as usize)
    }
    .to_vec())
}

pub fn active_interface_guid() -> Result<Option<String>, String> {
    let client = client()?;
    Ok(interfaces(&client)?
        .iter()
        .find(|interface| interface.isState == wlan_interface_state_connected)
        .map(|interface| guid_string(&interface.InterfaceGuid)))
}

fn wide(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|v| *v == 0).unwrap_or(value.len())])
}
fn wide_argument(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn guid_string(guid: &GUID) -> String {
    format!(
        "{{{:08x}-{:04x}-{:04x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}}}",
        guid.data1,
        guid.data2,
        guid.data3,
        guid.data4[0],
        guid.data4[1],
        guid.data4[2],
        guid.data4[3],
        guid.data4[4],
        guid.data4[5],
        guid.data4[6],
        guid.data4[7]
    )
}

fn query<T: Copy>(client: &Client, guid: &GUID, opcode: WLAN_INTF_OPCODE) -> Result<T, String> {
    let mut size = 0;
    let mut pointer: *mut c_void = null_mut();
    let code = unsafe {
        WlanQueryInterface(
            client.0,
            guid,
            opcode,
            null(),
            &mut size,
            &mut pointer,
            null_mut(),
        )
    };
    let memory = Allocation(pointer);
    if code != 0 || memory.0.is_null() || size < std::mem::size_of::<T>() as u32 {
        return Err(if code == 5 {
            "Wi-Fi details are unavailable. Check Windows location and Wi-Fi permissions.".into()
        } else {
            format!("Cannot read Wi-Fi details ({code})")
        });
    }
    Ok(unsafe { *memory.0.cast::<T>() })
}

pub fn get_connection() -> Result<Option<Connection>, String> {
    let client = match client() {
        Ok(client) => client,
        Err(_) => return Ok(None),
    };
    for interface in interfaces(&client)? {
        if interface.isState != wlan_interface_state_connected {
            continue;
        }
        let attributes: WLAN_CONNECTION_ATTRIBUTES = query(
            &client,
            &interface.InterfaceGuid,
            wlan_intf_opcode_current_connection,
        )?;
        let association = attributes.wlanAssociationAttributes;
        let ssid = String::from_utf8_lossy(
            &association.dot11Ssid.ucSSID[..(association.dot11Ssid.uSSIDLength as usize).min(32)],
        )
        .into_owned();
        let profile = wide(&attributes.strProfileName);
        let bssid = association
            .dot11Bssid
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect::<Vec<_>>()
            .join(":");
        let mut frequency_mhz = None;
        let mut signal_dbm = None;
        let mut pointer = null_mut();
        let code = unsafe {
            WlanGetNetworkBssList(
                client.0,
                &interface.InterfaceGuid,
                &association.dot11Ssid,
                association.dot11BssType,
                attributes.wlanSecurityAttributes.bSecurityEnabled,
                null(),
                &mut pointer,
            )
        };
        let memory = Allocation(pointer);
        if code == 0 && !memory.0.is_null() {
            let list = unsafe { &*memory.0 };
            let available = (list.dwTotalSize as usize)
                .saturating_sub(std::mem::offset_of!(WLAN_BSS_LIST, wlanBssEntries))
                / std::mem::size_of::<WLAN_BSS_ENTRY>();
            let entries = unsafe {
                std::slice::from_raw_parts(
                    list.wlanBssEntries.as_ptr(),
                    (list.dwNumberOfItems as usize).min(available),
                )
            };
            if let Some(entry) = entries
                .iter()
                .find(|entry| entry.dot11Bssid == association.dot11Bssid)
            {
                frequency_mhz = Some(entry.ulChCenterFrequency / 1000);
                signal_dbm = Some(entry.lRssi);
            }
        }
        let band = frequency_mhz
            .map(super::band_from_mhz)
            .unwrap_or("Wi-Fi")
            .to_owned();
        let channel = query::<u32>(
            &client,
            &interface.InterfaceGuid,
            wlan_intf_opcode_channel_number,
        )
        .ok()
        .map(|v| v as i32);
        let radio = match association.dot11PhyType {
            11 => "802.11be",
            10 => "802.11ax",
            8 => "802.11ac",
            7 => "802.11n",
            6 => "802.11g",
            4 => "802.11a",
            5 => "802.11b",
            _ => "",
        };
        let auth = match attributes.wlanSecurityAttributes.dot11AuthAlgorithm {
            1 => "Open",
            2 => "WEP",
            3 => "WPA-Enterprise",
            4 => "WPA-Personal",
            6 => "WPA2-Enterprise",
            7 => "WPA2-Personal",
            9 => "WPA3-Personal",
            10 => "Enhanced Open",
            8 | 11 | 12 => "WPA3-Enterprise",
            _ => "Unknown",
        };
        return Ok(Some(Connection {
            ssid,
            name: profile.clone(),
            profile,
            signal: association.wlanSignalQuality.min(100) as i32,
            signal_dbm,
            snr: None,
            channel,
            frequency: frequency_mhz.map(|mhz| format!("{:.3} GHz", mhz as f64 / 1000.0)),
            generation: (!radio.is_empty()).then(|| super::map_radio_to_generation(radio, &band)),
            band,
            radio_type: (!radio.is_empty()).then(|| radio.into()),
            bssid: Some(bssid),
            rx_rate_mbps: (association.ulRxRate > 0).then(|| association.ulRxRate as f64 / 1000.0),
            tx_rate_mbps: (association.ulTxRate > 0).then(|| association.ulTxRate as f64 / 1000.0),
            network_guid: None,
            interface_name: Some(wide(&interface.strInterfaceDescription)),
            interface_guid: Some(guid_string(&interface.InterfaceGuid)),
            auth: Some(auth.into()),
        }));
    }
    Ok(None)
}

#[derive(Clone)]
pub struct Profile {
    pub interface: GUID,
    pub name: String,
    pub id: String,
    pub ssid: String,
    pub can_rename: bool,
    flags: u32,
}

fn profile_xml(
    client: &Client,
    interface: &GUID,
    name: &str,
    plaintext: bool,
) -> Result<String, String> {
    let name = wide_argument(name);
    let mut flags = if plaintext { 4 } else { 0 };
    let mut access = 0;
    let mut pointer = null_mut();
    let code = unsafe {
        WlanGetProfile(
            client.0,
            interface,
            name.as_ptr(),
            null(),
            &mut pointer,
            &mut flags,
            &mut access,
        )
    };
    let memory = Allocation(pointer);
    if code != 0 || memory.0.is_null() {
        return Err(format!("Cannot read the saved Wi-Fi profile ({code})"));
    }
    // WlanGetProfile guarantees a terminated UTF-16 string owned by WLAN.
    let mut length = 0;
    while unsafe { *memory.0.add(length) } != 0 {
        if length >= 1024 * 1024 {
            return Err("The saved Wi-Fi profile exceeds the size limit".into());
        }
        length += 1;
    }
    Ok(String::from_utf16_lossy(unsafe {
        std::slice::from_raw_parts(memory.0, length)
    }))
}

pub fn xml_value(xml: &str, tag: &str) -> Option<String> {
    let start = xml.find(&format!("<{tag}>"))? + tag.len() + 2;
    let end = xml[start..].find(&format!("</{tag}>"))? + start;
    let mut value = String::new();
    let mut remaining = &xml[start..end];
    while let Some(offset) = remaining.find('&') {
        value.push_str(&remaining[..offset]);
        remaining = &remaining[offset + 1..];
        let end = remaining.find(';')?;
        let entity = &remaining[..end];
        value.push(match entity {
            "lt" => '<',
            "gt" => '>',
            "quot" => '"',
            "apos" => '\'',
            "amp" => '&',
            _ => {
                let number = if let Some(hex) = entity.strip_prefix("#x") {
                    u32::from_str_radix(hex, 16).ok()?
                } else {
                    entity.strip_prefix('#')?.parse().ok()?
                };
                char::from_u32(number)?
            }
        });
        remaining = &remaining[end + 1..];
    }
    value.push_str(remaining);
    Some(value)
}

pub fn profiles() -> Result<Vec<Profile>, String> {
    let client = match client() {
        Ok(client) => client,
        Err(_) => return Ok(Vec::new()),
    };
    let mut profiles = Vec::new();
    for interface in interfaces(&client)? {
        let mut pointer = null_mut();
        let code =
            unsafe { WlanGetProfileList(client.0, &interface.InterfaceGuid, null(), &mut pointer) };
        let memory = Allocation(pointer);
        if code != 0 || memory.0.is_null() {
            continue;
        }
        let list = unsafe { &*memory.0 };
        if list.dwNumberOfItems > 10000 {
            return Err("Windows returned too many saved profiles".into());
        }
        for info in unsafe {
            std::slice::from_raw_parts(list.ProfileInfo.as_ptr(), list.dwNumberOfItems as usize)
        } {
            let name = wide(&info.strProfileName);
            let xml = profile_xml(&client, &interface.InterfaceGuid, &name, false)?;
            let hex = xml_value(&xml, "hex").ok_or("Saved Wi-Fi profile has no SSID")?;
            let bytes = super::decode_hex(&hex)?;
            profiles.push(Profile {
                interface: interface.InterfaceGuid,
                name,
                id: format!(
                    "wlan:{}:{}",
                    guid_string(&interface.InterfaceGuid),
                    hex.to_uppercase()
                ),
                ssid: String::from_utf8_lossy(&bytes).into_owned(),
                can_rename: info.dwFlags & WLAN_PROFILE_GROUP_POLICY == 0,
                flags: info.dwFlags,
            });
        }
    }
    Ok(profiles)
}

pub fn get_networks(
    backup: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Vec<Network>, String> {
    let profiles = profiles()?;
    let rows = super::nlm::profiles()?;
    let links = crate::settings::read_name_links()?;
    observed_networks(profiles, rows, backup, &links, connection)
}

/// Mini telemetry needs the active identity, not hundreds of old NLM rows.
/// Keep the full WLAN inventory for SSID ambiguity and legacy identity checks.
pub fn get_active_networks(
    backup: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Vec<Network>, String> {
    let profiles = profiles()?;
    let rows = super::nlm::connected_profiles()?;
    let links = crate::settings::read_name_links()?;
    let mut networks = observed_networks(profiles, rows, backup, &links, connection)?;
    networks.retain(|network| network.live);
    Ok(networks)
}

fn observed_networks(
    profiles: Vec<Profile>,
    rows: Vec<super::nlm::Profile>,
    backup: &HashMap<String, String>,
    links: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Vec<Network>, String> {
    // Display and mutation verification use observed OS state. Desired labels
    // are repair intent only; overlaying them here would hide a new rename or
    // a temporary sharing mask before the OS write can be verified.
    let mut networks = merge_profiles(profiles, rows, backup, links, connection);
    let sharing = crate::settings::storage().read::<serde_json::Value>("streamer.json")?;
    show_verified_profile_labels(
        &mut networks,
        &crate::settings::read_name_labels()?,
        sharing.as_ref().is_some_and(|record| !record.is_null()),
    );
    Ok(networks)
}

fn show_verified_profile_labels(
    networks: &mut [Network],
    labels: &HashMap<String, String>,
    sharing_active: bool,
) {
    if sharing_active {
        return;
    }
    for network in networks {
        // A successful WLAN repair can precede a protected NLM label write.
        // Show only an actually observed saved-profile label. Stale intent
        // must never override a new rename, restore, or sharing mask.
        if network.name_sync_pending
            && network.profile.as_ref().is_some_and(|profile| {
                labels.get(&network.guid) == Some(profile) && profile != &network.name
            })
        {
            network.name = network.profile.clone().unwrap();
            network.renamed = network.name != network.original_name;
        }
    }
}

fn merge_profiles(
    profiles: Vec<Profile>,
    mut rows: Vec<super::nlm::Profile>,
    backup: &HashMap<String, String>,
    links: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Vec<Network> {
    let nlm_guids: HashSet<_> = rows
        .iter()
        .filter(|row| super::is_guid(&row.guid))
        .map(|row| row.guid.clone())
        .collect();
    let counts = profiles.iter().fold(HashMap::new(), |mut counts, profile| {
        *counts.entry(profile.id.clone()).or_insert(0usize) += 1;
        counts
    });
    let mut networks = Vec::new();
    let mut used_profiles = std::collections::HashSet::new();
    // The live row gets first choice; historical NLM rows can share an SSID.
    rows.sort_by_key(|row| !row.live);
    for row in rows {
        let guid = row.guid.as_str();
        let name = row.name.as_str();
        if !super::is_guid(guid) || name.is_empty() {
            continue;
        }
        let original = backup.get(guid).cloned().unwrap_or_else(|| name.into());
        let linked_id = links.get(guid).map(String::as_str);
        // NLM drops adapter associations from historical rows. A persisted
        // WLAN link is stronger evidence than that missing association.
        let candidates: Vec<_> = profiles
            .iter()
            .filter(|profile| {
                row.adapters.contains(&guid_string(&profile.interface))
                    || linked_id == Some(profile.id.as_str())
            })
            .collect();
        let matched_profile = select_profile(
            &candidates,
            linked_id,
            connection.filter(|_| row.live),
            &[name, original.as_str()],
        );
        // NLM retains old metadata long after a saved connection is gone.
        // Without an adapter, saved WLAN profile, or NetMask recovery record,
        // a disconnected row is not a connectable saved network. Showing it
        // creates original-name ghosts alongside the real nicknamed profile.
        if !row.live
            && row.adapters.is_empty()
            && matched_profile.is_none()
            && !backup.contains_key(guid)
            && !links.contains_key(guid)
        {
            continue;
        }
        // A historical Windows row is another representation of the same
        // saved profile, not another connectable network. Keep the live row
        // and any distinct saved profile (including different credentials).
        if !row.live
            && matched_profile.is_some_and(|profile| {
                used_profiles.contains(&(profile.id.clone(), profile.name.clone()))
                    && (linked_id == Some(profile.id.as_str())
                        || (row.adapters.contains(&guid_string(&profile.interface))
                            && (name == profile.name
                                || name == profile.ssid
                                || original == profile.ssid)
                            && backup.get(guid).is_none_or(|original| {
                                original == &profile.ssid || original == &profile.name
                            })))
            })
        {
            continue;
        }
        let profile = matched_profile
            .filter(|profile| !used_profiles.contains(&(profile.id.clone(), profile.name.clone())));
        let chosen_guid = profile
            .filter(|profile| {
                counts.get(&profile.id) == Some(&1) && backup.contains_key(&profile.id)
            })
            .map(|profile| profile.id.as_str())
            .unwrap_or(guid);
        if let Some(profile) = profile {
            used_profiles.insert((profile.id.clone(), profile.name.clone()));
        }
        let is_wifi = profile.is_some()
            || profiles
                .iter()
                .any(|p| row.adapters.contains(&guid_string(&p.interface)));
        let live = row.live;
        let display = if chosen_guid.starts_with("wlan:") {
            profile.map(|profile| profile.name.as_str()).unwrap_or(name)
        } else {
            name
        };
        let name_sync_pending = profile.is_some_and(|profile| {
            profile.name != name
                && (backup.contains_key(guid)
                    || (counts.get(&profile.id) == Some(&1) && backup.contains_key(&profile.id)))
        });
        let original = backup
            .get(guid)
            .cloned()
            .or_else(|| {
                profile
                    .filter(|profile| counts.get(&profile.id) == Some(&1))
                    .and_then(|profile| backup.get(&profile.id))
                    .cloned()
            })
            .unwrap_or(original);
        networks.push(Network {
            guid: chosen_guid.into(),
            name: display.into(),
            renamed: display != original,
            name_sync_pending,
            original_name: original,
            live,
            network_type: if is_wifi { "wifi" } else { "ethernet" }.into(),
            profile: profile.map(|p| p.name.clone()),
            // A stable NLM GUID plus an exact profile match is editable even
            // when another saved profile uses the same SSID on this adapter.
            can_rename: profile.is_some_and(|profile| profile.can_rename) || !is_wifi,
        });
    }
    let remaining_profiles: Vec<_> = profiles
        .into_iter()
        .filter(|p| !used_profiles.contains(&(p.id.clone(), p.name.clone())))
        .collect();
    let remaining_ssids = remaining_profiles
        .iter()
        .fold(HashMap::new(), |mut counts, profile| {
            *counts.entry(profile.ssid.clone()).or_insert(0usize) += 1;
            counts
        });
    for mut profile in remaining_profiles {
        if counts.get(&profile.id).is_some_and(|count| *count > 1) {
            // Standalone rows have no stable NLM identity across renames.
            profile.id = format!(
                "{}:{}",
                profile.id,
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&profile.name)
            );
            profile.can_rename = false;
        }
        let stale_recovery = linked_recovery_for_profile(&profile, backup, links, &nlm_guids)
            .or_else(|| {
                (remaining_ssids.get(&profile.ssid) == Some(&1))
                    .then(|| stale_recovery_for_profile(&profile, backup, &nlm_guids))
                    .flatten()
            });
        let chosen_guid = stale_recovery
            .map(|(guid, _)| guid.to_owned())
            .unwrap_or_else(|| profile.id.clone());
        let original = stale_recovery
            .map(|(_, original)| original.to_owned())
            .or_else(|| backup.get(&profile.id).cloned())
            .unwrap_or_else(|| profile.name.clone());
        let live = connection.is_some_and(|connection| {
            connection.profile == profile.name
                && connection.interface_guid.as_deref()
                    == Some(guid_string(&profile.interface).as_str())
        });
        networks.push(Network {
            guid: chosen_guid,
            name: profile.name.clone(),
            renamed: profile.name != original,
            // A missing historical NLM row is recovery data, not a second
            // current label that can be synchronized with the saved profile.
            name_sync_pending: false,
            original_name: original,
            live,
            network_type: "wifi".into(),
            profile: Some(profile.name),
            can_rename: profile.can_rename,
        });
    }
    networks
}

fn linked_recovery_for_profile<'a>(
    profile: &Profile,
    backup: &'a HashMap<String, String>,
    links: &HashMap<String, String>,
    nlm_guids: &HashSet<String>,
) -> Option<(&'a str, &'a str)> {
    let mut candidates = backup
        .iter()
        .filter(|(guid, _)| !nlm_guids.contains(*guid) && links.get(*guid) == Some(&profile.id));
    let candidate = candidates.next()?;
    candidates
        .next()
        .is_none()
        .then_some((candidate.0.as_str(), candidate.1.as_str()))
}

fn stale_recovery_for_profile<'a>(
    profile: &Profile,
    backup: &'a HashMap<String, String>,
    nlm_guids: &HashSet<String>,
) -> Option<(&'a str, &'a str)> {
    let mut candidates = backup.iter().filter(|(guid, original)| {
        super::is_guid(guid) && !nlm_guids.contains(*guid) && original.as_str() == profile.ssid
    });
    let candidate = candidates.next()?;
    candidates
        .next()
        .is_none()
        .then_some((candidate.0.as_str(), candidate.1.as_str()))
}

fn rename_profile(profile: &Profile, new_name: &str) -> Result<(), String> {
    if profile.name == new_name {
        return Ok(());
    }
    if profiles()?.iter().any(|candidate| {
        guid_string(&candidate.interface) == guid_string(&profile.interface)
            && candidate.name.to_lowercase() == new_name.to_lowercase()
            && candidate.name != profile.name
    }) {
        return Err("Another saved Wi-Fi profile already uses this label on this adapter. Choose a different label or restore that saved network first.".into());
    }
    let client = client()?;
    let old = wide_argument(&profile.name);
    let new = wide_argument(new_name);
    let code = unsafe {
        WlanRenameProfile(
            client.0,
            &profile.interface,
            old.as_ptr(),
            new.as_ptr(),
            null(),
        )
    };
    match code {
        0 => Ok(()),
        5 => Err("Windows denied permission to rename the saved Wi-Fi profile.".into()),
        87 | 123 => Err("Windows rejected this label for the saved Wi-Fi profile. Choose a shorter label without reserved filename characters.".into()),
        183 => Err("Another saved Wi-Fi profile already uses this label on this adapter. Choose a different label or restore that saved network first.".into()),
        1168 => Err("The saved Wi-Fi profile changed before Windows could rename it. Refresh and try again.".into()),
        _ => Err(format!("Windows could not rename the saved Wi-Fi profile ({code}).")),
    }
}

struct ConnectedNamePlan {
    guid: String,
    nlm_guid: String,
    label: String,
    original: String,
    profile: Profile,
}

fn connected_name_plan(
    profiles: &[Profile],
    rows: &[super::nlm::Profile],
    backup: &HashMap<String, String>,
    links: &HashMap<String, String>,
    labels: &HashMap<String, String>,
    connection: &Connection,
) -> Option<ConnectedNamePlan> {
    let adapter = connection.interface_guid.as_deref()?;
    let mut plans = rows.iter().filter_map(|row| {
        if !row.live || !row.adapters.iter().any(|id| id == adapter) {
            return None;
        }
        let matching: Vec<_> = profiles
            .iter()
            .filter(|profile| {
                guid_string(&profile.interface) == adapter
                    && profile.ssid == connection.ssid
                    && links.get(&row.guid).is_none_or(|id| id == &profile.id)
            })
            .collect();
        // Legacy releases persisted SSID-based recovery keys. Only a unique
        // saved profile can safely inherit that record.
        let (recovery_guid, original, label) = if let Some(original) = backup.get(&row.guid) {
            (
                row.guid.clone(),
                original.clone(),
                labels.get(&row.guid).unwrap_or(&row.name).clone(),
            )
        } else if matching.first().is_some_and(|first| {
            backup.contains_key(&first.id)
                && matching.iter().all(|profile| profile.id == first.id)
                && (matching.len() == 1 || labels.contains_key(&first.id))
        }) {
            let key = &matching[0].id;
            (
                key.clone(),
                backup.get(key)?.clone(),
                labels.get(key).unwrap_or(&row.name).clone(),
            )
        } else {
            // Windows can recreate its NLM GUID too. Inherit only one
            // unambiguous saved label for the exact adapter/SSID association.
            let mut inherited = links.iter().filter_map(|(guid, id)| {
                if !matching.iter().any(|profile| &profile.id == id) {
                    return None;
                }
                let original = backup.get(guid)?;
                let label = labels.get(guid)?;
                (label != original).then_some((original, label))
            });
            let (original, label) = inherited.next()?;
            if inherited.any(|(other_original, other_label)| {
                other_original != original || other_label != label
            }) {
                return None;
            }
            (row.guid.clone(), original.clone(), label.clone())
        };
        if label == original {
            return None;
        }
        let source = matching
            .iter()
            .copied()
            .find(|profile| profile.name == connection.profile)
            .or_else(|| {
                matching
                    .iter()
                    .copied()
                    .find(|profile| profile.name == label)
            })
            .or_else(|| (matching.len() == 1).then(|| matching[0]))?;
        if !source.can_rename {
            return None;
        }
        Some(ConnectedNamePlan {
            guid: recovery_guid,
            nlm_guid: row.guid.clone(),
            label,
            original,
            profile: source.clone(),
        })
    });
    let plan = plans.next()?;
    plans.next().is_none().then_some(plan)
}

// Compare complete WLAN configuration and plaintext credentials only in
// memory. Do not discard a profile merely because its SSID matches. Enterprise
// credentials and any inaccessible key remain ambiguous and are preserved.
fn comparable_profile_xml(xml: &str) -> Option<String> {
    let authentication = xml_value(xml, "authentication")?;
    let encryption = xml_value(xml, "encryption")?;
    let wep = encryption.to_ascii_lowercase().starts_with("wep");
    // WEP can use "open" authentication while still requiring a key.
    if authentication != "open" || wep {
        if !(matches!(authentication.as_str(), "WPAPSK" | "WPA2PSK" | "WPA3SAE")
            || (wep && matches!(authentication.as_str(), "open" | "shared")))
            || xml_value(xml, "protected").as_deref() != Some("false")
            || xml_value(xml, "keyMaterial").is_none_or(|key| key.is_empty())
        {
            return None;
        }
    }
    let start = xml.find("<name>")?;
    let end = xml[start..].find("</name>")? + start + "</name>".len();
    if xml[..start].contains("<SSIDConfig>") {
        return None;
    }
    let mut comparable = xml.to_owned();
    comparable.replace_range(start..end, "<name />");
    Some(
        regex::Regex::new(r">\s+<")
            .ok()?
            .replace_all(&comparable, "><")
            .into_owned(),
    )
}

fn profiles_equivalent(
    client: &Client,
    source: &Profile,
    duplicate: &Profile,
) -> Result<bool, String> {
    if source.id != duplicate.id
        || source.flags != duplicate.flags
        || !source.can_rename
        || !duplicate.can_rename
    {
        return Ok(false);
    }
    let source_xml = profile_xml(client, &source.interface, &source.name, true)?;
    let duplicate_xml = profile_xml(client, &duplicate.interface, &duplicate.name, true)?;
    Ok(comparable_profile_xml(&source_xml)
        .zip(comparable_profile_xml(&duplicate_xml))
        .is_some_and(|(source, duplicate)| source == duplicate))
}

fn delete_profile(client: &Client, profile: &Profile) -> Result<(), String> {
    let name = wide_argument(&profile.name);
    let code = unsafe { WlanDeleteProfile(client.0, &profile.interface, name.as_ptr(), null()) };
    if code == 0 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not remove the verified duplicate Wi-Fi profile ({code})"
        ))
    }
}

fn restore_profile_xml(client: &Client, profile: &Profile, xml: &str) -> Result<(), String> {
    let xml = wide_argument(xml);
    let mut reason = 0;
    let code = unsafe {
        WlanSetProfile(
            client.0,
            &profile.interface,
            profile.flags & WLAN_PROFILE_USER,
            xml.as_ptr(),
            null(),
            0,
            null(),
            &mut reason,
        )
    };
    if code == 0 {
        Ok(())
    } else {
        Err(format!(
            "Windows could not restore the duplicate profile after a failed rename ({code})"
        ))
    }
}

fn rename_with_duplicate_rollback<T>(
    duplicate: Option<T>,
    mut delete: impl FnMut(&T) -> Result<(), String>,
    mut rename: impl FnMut() -> Result<(), String>,
    mut rollback: impl FnMut(&T) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(duplicate) = &duplicate {
        delete(duplicate)?;
    }
    if let Err(error) = rename() {
        if let Some(duplicate) = &duplicate {
            rollback(duplicate).map_err(|rollback| format!("{error} {rollback}"))?;
        }
        return Err(error);
    }
    Ok(())
}

fn target_profile_conflict<'a>(
    all: &'a [Profile],
    source: &Profile,
    label: &str,
) -> Option<&'a Profile> {
    all.iter().find(|profile| {
        guid_string(&profile.interface) == guid_string(&source.interface)
            && profile.name.eq_ignore_ascii_case(label)
            && profile.name != source.name
    })
}

fn transfer_label_intent(
    labels: &mut HashMap<String, String>,
    links: &HashMap<String, String>,
    plan: &ConnectedNamePlan,
) -> bool {
    let before = labels.clone();
    // One owner for this resolved label prevents a restored migrated GUID
    // inheriting its old nickname again. Original recovery values remain.
    labels.retain(|guid, label| {
        guid == &plan.guid || label != &plan.label || links.get(guid) != Some(&plan.profile.id)
    });
    labels.insert(plan.guid.clone(), plan.label.clone());
    *labels != before
}

/// Called explicitly by the native worker under the network mutation lock;
/// snapshots and diagnostics remain read-only and this never invokes UAC.
pub fn reconcile_connected_name(
    backup: &mut HashMap<String, String>,
    links: &mut HashMap<String, String>,
    labels: &mut HashMap<String, String>,
) -> Result<bool, String> {
    let Some(connection) = get_connection()? else {
        return Ok(false);
    };
    let all = profiles()?;
    let rows = super::nlm::connected_profiles()?;
    let Some(plan) = connected_name_plan(&all, &rows, backup, links, labels, &connection) else {
        return Ok(false);
    };
    crate::settings::validate_display_name(&plan.label)?;
    if !backup.contains_key(&plan.guid) {
        backup.insert(plan.guid.clone(), plan.original.clone());
        crate::settings::write_backup(backup)?;
    }
    // Persist the existing user label and exact SSID association before any
    // Windows write, so a recreated original can be repaired after restart.
    if links.get(&plan.nlm_guid) != Some(&plan.profile.id) {
        links.insert(plan.nlm_guid.clone(), plan.profile.id.clone());
        crate::settings::write_name_links(links)?;
    }
    if transfer_label_intent(labels, links, &plan) {
        crate::settings::write_name_labels(labels)?;
    }
    let current = get_connection()?.ok_or("The Wi-Fi connection changed during label repair")?;
    if current.profile != connection.profile
        || current.ssid != connection.ssid
        || current.interface_guid != connection.interface_guid
    {
        return Err("The Wi-Fi connection changed during label repair".into());
    }
    let client = client()?;
    let mut changed = false;
    if plan.profile.name != plan.label {
        let conflict = target_profile_conflict(&all, &plan.profile, &plan.label);
        let rollback = if let Some(conflict) = conflict {
            if !profiles_equivalent(&client, &plan.profile, conflict)? {
                return Err("The original and nicknamed Wi-Fi profiles have different settings or credentials. Both have been preserved.".into());
            }
            let xml = profile_xml(&client, &conflict.interface, &conflict.name, false)?;
            Some((conflict, xml))
        } else {
            None
        };
        rename_with_duplicate_rollback(
            rollback,
            |(conflict, _)| delete_profile(&client, conflict),
            || rename_profile(&plan.profile, &plan.label),
            |(conflict, xml)| restore_profile_xml(&client, conflict, xml),
        )?;
        changed = true;
    }
    // If Windows recreated an original after a rename, remove only that
    // original when the complete configuration is a proven duplicate.
    let refreshed = profiles()?;
    let canonical = refreshed
        .iter()
        .find(|profile| profile.id == plan.profile.id && profile.name == plan.label)
        .ok_or("Windows did not confirm the repaired Wi-Fi nickname")?;
    for duplicate in refreshed.iter().filter(|profile| {
        profile.id == canonical.id
            && profile.name != canonical.name
            && (profile.name == plan.original || profile.name == profile.ssid)
    }) {
        if profiles_equivalent(&client, canonical, duplicate)? {
            delete_profile(&client, duplicate)?;
            changed = true;
        }
    }
    if rows
        .iter()
        .any(|row| row.guid == plan.nlm_guid && row.name != plan.label)
    {
        super::nlm::rename(&plan.nlm_guid, &plan.label)?;
        changed = true;
    }
    Ok(changed)
}

struct ProfileMatch {
    profile: Option<Profile>,
    nlm_available: bool,
}

fn unique_profile_matching(profiles: &[Profile], names: &[&str]) -> Option<Profile> {
    select_profile(&profiles.iter().collect::<Vec<_>>(), None, None, names).cloned()
}

fn select_profile<'a>(
    profiles: &[&'a Profile],
    linked_id: Option<&str>,
    connection: Option<&Connection>,
    names: &[&str],
) -> Option<&'a Profile> {
    let candidates: Vec<_> = profiles
        .iter()
        .copied()
        .filter(|profile| linked_id.is_none_or(|id| profile.id == id))
        .collect();
    if linked_id.is_some() && candidates.len() == 1 {
        return Some(candidates[0]);
    }
    if let Some(connection) = connection {
        // After a rename Windows can keep reporting the original profile
        // name, even if a second saved profile has since claimed that name.
        // The saved original plus an exact current label identifies the
        // renamed profile without letting that stale name select its copy.
        if names
            .get(1)
            .is_some_and(|original| *original == connection.profile)
            && names
                .first()
                .is_some_and(|name| *name != connection.profile)
        {
            let current_label: Vec<_> = candidates
                .iter()
                .copied()
                .filter(|profile| {
                    profile.name == names[0]
                        && profile.ssid == connection.ssid
                        && connection.interface_guid.as_deref()
                            == Some(guid_string(&profile.interface).as_str())
                })
                .collect();
            if current_label.len() == 1 {
                return Some(current_label[0]);
            }
        }
        let live: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|profile| {
                profile.name == connection.profile
                    && profile.ssid == connection.ssid
                    && connection.interface_guid.as_deref()
                        == Some(guid_string(&profile.interface).as_str())
            })
            .collect();
        if live.len() == 1 {
            return Some(live[0]);
        }
    }
    // Profile names are unique on an adapter; SSIDs are not. Prefer exact
    // names so a stale live connection can still resolve after a rename.
    for name in names {
        let exact: Vec<_> = candidates
            .iter()
            .copied()
            .filter(|profile| profile.name == *name)
            .collect();
        if exact.len() == 1 {
            return Some(exact[0]);
        }
        if exact.len() > 1 {
            return None;
        }
    }
    let ssids: Vec<_> = candidates
        .into_iter()
        .filter(|profile| names.contains(&profile.ssid.as_str()))
        .collect();
    (ssids.len() == 1).then(|| ssids[0])
}

fn profile_for_network(guid: &str, current_name: Option<&str>) -> Result<ProfileMatch, String> {
    let row = super::nlm::profiles()?
        .into_iter()
        .find(|row| row.guid == guid);
    let profiles = profiles()?;
    let linked_id = crate::settings::read_name_links()?.get(guid).cloned();
    let Some(row) = row else {
        if let Some(linked_id) = linked_id {
            let matches: Vec<_> = profiles
                .iter()
                .filter(|profile| profile.id == linked_id)
                .cloned()
                .collect();
            if matches.len() == 1 {
                return Ok(ProfileMatch {
                    profile: matches.into_iter().next(),
                    nlm_available: false,
                });
            }
        }
        let name = current_name.ok_or(
            "This Windows network is no longer available and its saved Wi-Fi profile could not be identified. Refresh and repair it from the network list.",
        )?;
        let profile = unique_profile_matching(&profiles, &[name]).ok_or(
            "This Windows network is no longer available and its saved Wi-Fi profile is ambiguous. Refresh and choose the matching saved network.",
        )?;
        return Ok(ProfileMatch {
            profile: Some(profile),
            nlm_available: false,
        });
    };
    let connection = get_connection().ok().flatten();
    let candidates: Vec<_> = profiles
        .iter()
        .filter(|profile| {
            row.adapters.contains(&guid_string(&profile.interface))
                || linked_id.as_deref() == Some(profile.id.as_str())
        })
        .collect();
    let backup = crate::settings::read_backup()?;
    let names: Vec<_> = [
        Some(row.name.as_str()),
        backup
            .get(guid)
            .map(String::as_str)
            .or(Some(row.name.as_str())),
        current_name,
    ]
    .into_iter()
    .flatten()
    .collect();
    let profile = select_profile(
        &candidates,
        linked_id.as_deref(),
        connection.as_ref().filter(|_| row.live),
        &names,
    );
    if profile.is_none() && (!candidates.is_empty() || linked_id.is_some()) {
        return Err("Windows cannot identify a single saved Wi-Fi profile for this network. Connect to it and refresh before changing its label.".into());
    }
    Ok(ProfileMatch {
        profile: profile.cloned(),
        nlm_available: true,
    })
}

pub fn stable_profile_id(guid: &str, current_name: Option<&str>) -> Result<Option<String>, String> {
    if guid.starts_with("wlan:") {
        return Ok(None);
    }
    if !super::is_guid(guid) {
        return Err("Invalid Windows network identifier".into());
    }
    Ok(profile_for_network(guid, current_name)?
        .profile
        .map(|profile| profile.id))
}

fn conflict_details(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<Option<(Profile, Profile, String, String)>, String> {
    let source = if guid.starts_with("wlan:") {
        profiles()?.into_iter().find(|profile| profile.id == guid)
    } else {
        profile_for_network(guid, current_name)?.profile
    };
    let Some(source) = source else {
        return Ok(None);
    };
    let all = profiles()?;
    if all
        .iter()
        .filter(|profile| profile.id == source.id && profile.name == source.name)
        .count()
        != 1
    {
        return Err(
            "This Wi-Fi profile identity is ambiguous and cannot be repaired automatically.".into(),
        );
    }
    let interface = guid_string(&source.interface);
    let Some(conflict) = all.iter().find(|candidate| {
        guid_string(&candidate.interface) == interface
            && candidate.name.eq_ignore_ascii_case(new_name)
            && candidate.name != source.name
    }) else {
        return Ok(None);
    };
    if all
        .iter()
        .filter(|profile| profile.id == conflict.id && profile.name == conflict.name)
        .count()
        != 1
    {
        return Err(
            "The conflicting Wi-Fi profile is ambiguous and cannot be repaired automatically."
                .into(),
        );
    }
    let conflicting_guid = conflict_recovery_id(
        guid,
        conflict,
        &all,
        &super::nlm::profiles()?,
        &crate::settings::read_name_links()?,
        get_connection().ok().flatten().as_ref(),
    )?;
    let base: String = conflict
        .ssid
        .trim()
        .chars()
        .filter(|value| !value.is_control())
        .take(96)
        .collect();
    let base = if base.is_empty() {
        "Saved Wi-Fi"
    } else {
        base.as_str()
    };
    let suggested = (1..=50)
        .map(|index| {
            if index == 1 {
                format!("{base} (saved)")
            } else {
                format!("{base} (saved {index})")
            }
        })
        .find(|candidate| {
            candidate.chars().count() <= 128
                && !candidate.eq_ignore_ascii_case(new_name)
                && all.iter().all(|profile| {
                    guid_string(&profile.interface) != interface
                        || !profile.name.eq_ignore_ascii_case(candidate)
                })
        })
        .ok_or("Windows has no safe free label for the conflicting saved profile")?;
    Ok(Some((
        source,
        conflict.clone(),
        suggested,
        conflicting_guid,
    )))
}

fn conflict_recovery_id(
    source_guid: &str,
    conflict: &Profile,
    profiles: &[Profile],
    rows: &[super::nlm::Profile],
    links: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<String, String> {
    let rows: Vec<_> = rows
        .iter()
        .filter(|row| {
            row.guid != source_guid
                && row.name == conflict.name
                && row.adapters.contains(&guid_string(&conflict.interface))
                && {
                    let candidates: Vec<_> = profiles
                        .iter()
                        .filter(|profile| row.adapters.contains(&guid_string(&profile.interface)))
                        .collect();
                    select_profile(
                        &candidates,
                        links.get(&row.guid).map(String::as_str),
                        connection.filter(|_| row.live),
                        &[&row.name],
                    )
                    .is_some_and(|profile| {
                        profile.id == conflict.id && profile.name == conflict.name
                    })
                }
        })
        .collect();
    if rows.len() == 1 {
        return Ok(rows[0].guid.clone());
    }
    if profiles
        .iter()
        .filter(|profile| profile.id == conflict.id)
        .count()
        == 1
    {
        return Ok(conflict.id.clone());
    }
    Err("The other profile uses the same Wi-Fi SSID and has no unique Windows recovery identity. Choose a different label, or manage that duplicate in Windows Wi-Fi settings before restoring this name.".into())
}

pub fn name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<Option<crate::types::NameConflict>, String> {
    Ok(conflict_details(guid, new_name, current_name)?.map(
        |(_, conflict, suggested, conflicting_guid)| crate::types::NameConflict {
            conflicting_guid,
            current_name: conflict.name,
            suggested_name: suggested,
        },
    ))
}

pub fn repair_name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<(), String> {
    let Some((_, conflict, suggested, conflicting_guid)) =
        conflict_details(guid, new_name, current_name)?
    else {
        return Err("The saved-profile conflict changed. Refresh and try the name again.".into());
    };
    let previous = conflict.name.clone();
    rename_direct(&conflicting_guid, &suggested, Some(&previous))?;
    if let Err(error) = rename_direct(guid, new_name, current_name) {
        let refreshed = profiles()?
            .into_iter()
            .find(|profile| {
                guid_string(&profile.interface) == guid_string(&conflict.interface)
                    && profile.name == suggested
            })
            .ok_or_else(|| {
                format!("{error} The conflicting saved profile could not be found for rollback.")
            })?;
        return match rename_direct(&conflicting_guid, &previous, Some(&refreshed.name)) {
            Ok(()) => Err(format!(
                "{error} The conflicting saved profile was rolled back."
            )),
            Err(rollback) => Err(format!(
                "{error} The conflicting saved profile could not be rolled back: {rollback}"
            )),
        };
    }
    Ok(())
}

fn nlm_guid_for_profile(profile: &Profile) -> Result<Option<String>, String> {
    let all = profiles()?;
    let rows = super::nlm::profiles()?;
    let links = crate::settings::read_name_links()?;
    let backup = crate::settings::read_backup()?;
    let connection = get_connection().ok().flatten();
    matching_nlm_guid(profile, &all, &rows, &backup, &links, connection.as_ref())
}

fn matching_nlm_guid(
    profile: &Profile,
    all: &[Profile],
    rows: &[super::nlm::Profile],
    backup: &HashMap<String, String>,
    links: &HashMap<String, String>,
    connection: Option<&Connection>,
) -> Result<Option<String>, String> {
    let matching: Vec<_> = rows
        .iter()
        .filter(|row| {
            let candidates: Vec<_> = all
                .iter()
                .filter(|candidate| {
                    row.adapters.contains(&guid_string(&candidate.interface))
                        || links.get(&row.guid) == Some(&candidate.id)
                })
                .collect();
            let original = backup
                .get(&row.guid)
                .map(String::as_str)
                .unwrap_or(&row.name);
            select_profile(
                &candidates,
                links.get(&row.guid).map(String::as_str),
                connection.filter(|_| row.live),
                &[&row.name, original],
            )
            .is_some_and(|candidate| candidate.id == profile.id && candidate.name == profile.name)
        })
        .collect();
    let live: Vec<_> = matching.iter().copied().filter(|row| row.live).collect();
    if live.len() == 1 {
        return Ok(Some(live[0].guid.clone()));
    }
    let exact: Vec<_> = matching
        .iter()
        .copied()
        .filter(|row| row.name == profile.name)
        .collect();
    if exact.len() == 1 {
        return Ok(Some(exact[0].guid.clone()));
    }
    match matching.len() {
        0 => Ok(None),
        1 => Ok(Some(matching[0].guid.clone())),
        _ => Err("More than one Windows network matches this saved profile. Connect to it and refresh before changing its label.".into()),
    }
}

fn rename_direct(guid: &str, new_name: &str, current_name: Option<&str>) -> Result<(), String> {
    let mapped_guid = if guid.starts_with("wlan:") {
        let matches: Vec<_> = profiles()?.into_iter().filter(|p| p.id == guid).collect();
        if matches.len() > 1 {
            return Err("This saved SSID has multiple profiles. Its recovery record has been kept; choose an unambiguous network profile.".into());
        }
        let profile = matches
            .into_iter()
            .next()
            .ok_or("This Wi-Fi profile is no longer available")?;
        match nlm_guid_for_profile(&profile)? {
            Some(guid) => Some(guid),
            None => return rename_profile(&profile, new_name),
        }
    } else {
        None
    };
    let guid = mapped_guid.as_deref().unwrap_or(guid);
    if !super::is_guid(guid) {
        return Err("Invalid Windows network identifier".into());
    }
    let matched = profile_for_network(guid, current_name.or(Some(new_name)))?;
    if !matched.nlm_available {
        return rename_profile(
            matched
                .profile
                .as_ref()
                .ok_or("The saved Wi-Fi profile is no longer available")?,
            new_name,
        );
    }
    let profile = matched.profile;
    let previous_display = super::nlm::name(guid)?;
    super::nlm::rename(guid, new_name)?;
    if let Some(profile) = profile {
        if let Err(error) = rename_profile(&profile, new_name) {
            return match super::nlm::rename(guid, &previous_display) {
                Ok(()) => Err(format!("{error} The local network label was rolled back.")),
                Err(rollback) => Err(format!(
                    "{error} The local network label could not be rolled back: {rollback}"
                )),
            };
        }
    }
    Ok(())
}

pub fn rename(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
    allow_prompt: bool,
) -> Result<(), String> {
    // User-requested Windows changes run once in the elevated native helper.
    // This keeps the NLM label and saved WLAN profile in sync without leaving a
    // half-applied rename if the second protected write is rejected.
    if allow_prompt && !super::is_admin() {
        let source = if guid.starts_with("wlan:") {
            profiles()?.into_iter().find(|profile| profile.id == guid)
        } else {
            profile_for_network(guid, current_name.or(Some(new_name)))?.profile
        };
        if let Some(profile) = source {
            if profile.name != new_name
                && profiles()?.iter().any(|candidate| {
                    guid_string(&candidate.interface) == guid_string(&profile.interface)
                        && candidate.name.to_lowercase() == new_name.to_lowercase()
                        && candidate.name != profile.name
                })
            {
                return Err("Another saved Wi-Fi profile already uses this label on this adapter. Choose a different label or restore that saved network first.".into());
            }
        }
        return crate::privileged::run(crate::privileged::Request::Rename {
            id: guid.into(),
            name: new_name.into(),
            current_name: current_name.map(str::to_owned),
        });
    }
    rename_direct(guid, new_name, current_name)
}

pub fn wifi_credentials(name: &str) -> Result<(String, String, String), String> {
    let matches: Vec<_> = profiles()?.into_iter().filter(|p| p.name == name).collect();
    if matches.len() > 1 {
        return Err(
            "More than one adapter has this profile name. Wi-Fi sharing cannot safely choose one."
                .into(),
        );
    }
    let profile = matches
        .into_iter()
        .next()
        .ok_or("Saved Wi-Fi profile not found")?;
    let xml = profile_xml(&client()?, &profile.interface, &profile.name, true)?;
    let mut auth =
        xml_value(&xml, "authentication").ok_or("Wi-Fi authentication is unavailable")?;
    if xml_value(&xml, "encryption")
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("wep"))
    {
        auth = "WEP".into();
    }
    let password = xml_value(&xml, "keyMaterial").unwrap_or_default();
    if password.is_empty() && !auth.eq_ignore_ascii_case("open") {
        return Err("The saved Wi-Fi password is unavailable. Enterprise networks cannot be shared with a standard Wi-Fi QR code.".into());
    }
    if !password.is_empty() && xml_value(&xml, "protected").is_some_and(|value| value == "true") {
        return Err("Windows did not grant access to the Wi-Fi password".into());
    }
    Ok((profile.ssid, auth, password))
}

pub fn profile_randomization(name: &str) -> Result<String, String> {
    let matches: Vec<_> = profiles()?
        .into_iter()
        .filter(|profile| profile.name.eq_ignore_ascii_case(name))
        .collect();
    if matches.len() != 1 {
        return Err("A unique saved Wi-Fi profile is required to inspect randomization".into());
    }
    let profile = &matches[0];
    let xml = profile_xml(&client()?, &profile.interface, &profile.name, false)?;
    Ok(
        if xml_value(&xml, "randomizeEveryDay").as_deref() == Some("true") {
            "daily"
        } else if xml_value(&xml, "enableRandomization").as_deref() == Some("true") {
            "enabled"
        } else {
            "disabled"
        }
        .into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn profile(name: &str) -> Profile {
        let interface = GUID {
            data1: 1,
            data2: 2,
            data3: 3,
            data4: [4; 8],
        };
        Profile {
            interface,
            name: name.into(),
            id: format!("wlan:{}:53534944", guid_string(&interface)),
            ssid: "SSID".into(),
            can_rename: true,
            flags: 0,
        }
    }

    #[test]
    fn historical_link_with_no_adapters_resolves_and_does_not_duplicate_live_profile() {
        let saved = profile("Studio");
        let live_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let old_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![
            super::super::nlm::Profile {
                guid: old_guid.into(),
                name: "SSID".into(),
                live: false,
                adapters: vec![],
            },
            super::super::nlm::Profile {
                guid: live_guid.into(),
                name: "Studio".into(),
                live: true,
                adapters: vec![guid_string(&saved.interface)],
            },
        ];
        let links = HashMap::from([
            (old_guid.into(), saved.id.clone()),
            (live_guid.into(), saved.id.clone()),
        ]);
        let networks = merge_profiles(
            vec![saved.clone()],
            rows,
            &HashMap::from([(live_guid.into(), "SSID".into())]),
            &links,
            None,
        );
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].name, "Studio");
        let rows = vec![super::super::nlm::Profile {
            guid: old_guid.into(),
            name: "Studio".into(),
            live: false,
            adapters: vec![],
        }];
        let networks = merge_profiles(vec![saved.clone()], rows, &HashMap::new(), &links, None);
        assert_eq!(networks.len(), 1);
        assert!(networks[0].can_rename);
        assert_eq!(networks[0].profile.as_deref(), Some("Studio"));
        assert_eq!(
            matching_nlm_guid(
                &saved,
                std::slice::from_ref(&saved),
                &[super::super::nlm::Profile {
                    guid: old_guid.into(),
                    name: "Studio".into(),
                    live: false,
                    adapters: vec![],
                }],
                &HashMap::new(),
                &links,
                None
            )
            .unwrap()
            .as_deref(),
            Some(old_guid)
        );
    }

    #[test]
    fn distinct_saved_profiles_keep_their_nlm_recovery_identities() {
        let first = profile("Studio");
        let second = profile("Other credentials");
        let live_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let old_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![
            super::super::nlm::Profile {
                guid: old_guid.into(),
                name: second.name.clone(),
                live: false,
                adapters: vec![],
            },
            super::super::nlm::Profile {
                guid: live_guid.into(),
                name: first.name.clone(),
                live: true,
                adapters: vec![guid_string(&first.interface)],
            },
        ];
        let links = HashMap::from([
            (old_guid.into(), second.id.clone()),
            (live_guid.into(), first.id.clone()),
        ]);
        let networks = merge_profiles(vec![first, second], rows, &HashMap::new(), &links, None);
        assert_eq!(networks.len(), 2);
        assert!(networks.iter().all(|network| network.can_rename));
        assert!(
            networks
                .iter()
                .any(|network| network.guid == old_guid && network.name == "Other credentials")
        );
    }

    #[test]
    fn unbacked_adapterless_metadata_is_hidden_but_real_networks_and_recovery_remain() {
        let live_saved = profile("Studio");
        let mut other_saved = profile("Other saved network");
        other_saved.ssid = "OTHER".into();
        other_saved.id = format!("wlan:{}:4F54484552", guid_string(&other_saved.interface));
        let live_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let ghost_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let backed_guid = "{22222233-4455-6677-8899-aabbccddeeff}";
        let wired_guid = "{33332233-4455-6677-8899-aabbccddeeff}";
        let adapter = guid_string(&live_saved.interface);
        let rows = vec![
            super::super::nlm::Profile {
                guid: ghost_guid.into(),
                name: "SSID".into(),
                live: false,
                adapters: vec![],
            },
            super::super::nlm::Profile {
                guid: backed_guid.into(),
                name: "Kept recovery".into(),
                live: false,
                adapters: vec![],
            },
            super::super::nlm::Profile {
                guid: wired_guid.into(),
                name: "Office Ethernet".into(),
                live: false,
                adapters: vec!["other-adapter".into()],
            },
            super::super::nlm::Profile {
                guid: live_guid.into(),
                name: "Studio".into(),
                live: true,
                adapters: vec![adapter],
            },
        ];
        let networks = merge_profiles(
            vec![live_saved, other_saved],
            rows,
            &HashMap::from([(backed_guid.into(), "Recovered original".into())]),
            &HashMap::new(),
            None,
        );
        assert!(!networks.iter().any(|network| network.guid == ghost_guid));
        assert!(networks.iter().any(|network| network.guid == backed_guid));
        assert!(
            networks
                .iter()
                .any(|network| network.guid == wired_guid && network.network_type == "ethernet")
        );
        assert!(
            networks
                .iter()
                .any(|network| network.name == "Other saved network" && network.profile.is_some())
        );
        assert_eq!(
            networks
                .iter()
                .filter(|network| network.name == "Studio")
                .count(),
            1
        );
    }

    #[test]
    fn unlinked_historical_original_and_nickname_rows_use_one_exact_saved_profile() {
        let saved = profile("Studio");
        let live_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let adapter = guid_string(&saved.interface);
        let mut rows = vec![super::super::nlm::Profile {
            guid: live_guid.into(),
            name: "Studio".into(),
            live: true,
            adapters: vec![adapter.clone()],
        }];
        for (guid, name) in [
            ("{11112233-4455-6677-8899-aabbccddeeff}", "SSID"),
            ("{22222233-4455-6677-8899-aabbccddeeff}", "Studio"),
        ] {
            rows.push(super::super::nlm::Profile {
                guid: guid.into(),
                name: name.into(),
                live: false,
                adapters: vec![adapter.clone()],
            });
        }
        let networks = merge_profiles(vec![saved], rows, &HashMap::new(), &HashMap::new(), None);
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].name, "Studio");
        assert_eq!(networks[0].guid, live_guid);
    }

    #[test]
    fn recreated_original_is_repaired_to_the_saved_user_label_after_reconnect() {
        let original = profile("SSID");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "Studio".into(),
            live: true,
            adapters: vec![guid_string(&original.interface)],
        }];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = "SSID".into();
        connection.interface_guid = Some(guid_string(&original.interface));
        let backup = HashMap::from([(guid.into(), "SSID".into())]);
        let links = HashMap::from([(guid.into(), original.id.clone())]);
        let plan = connected_name_plan(
            std::slice::from_ref(&original),
            &rows,
            &backup,
            &links,
            &HashMap::new(),
            &connection,
        )
        .unwrap();
        assert_eq!(plan.label, "Studio");
        assert_eq!(plan.profile.name, "SSID");
        let reset_rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "SSID".into(),
            live: true,
            adapters: vec![guid_string(&original.interface)],
        }];
        let labels = HashMap::from([(guid.into(), "Studio".into())]);
        assert_eq!(
            connected_name_plan(
                std::slice::from_ref(&original),
                &reset_rows,
                &backup,
                &links,
                &labels,
                &connection
            )
            .unwrap()
            .label,
            "Studio"
        );
        assert!(
            connected_name_plan(
                std::slice::from_ref(&original),
                &reset_rows,
                &backup,
                &links,
                &HashMap::new(),
                &connection
            )
            .is_none()
        );
        connection.ssid = "Other SSID".into();
        assert!(
            connected_name_plan(&[original], &rows, &backup, &links, &labels, &connection)
                .is_none()
        );
    }

    #[test]
    fn legacy_profile_recovery_can_repair_a_connected_original() {
        let original = profile("SSID");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "Studio".into(),
            live: true,
            adapters: vec![guid_string(&original.interface)],
        }];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = original.name.clone();
        connection.interface_guid = Some(guid_string(&original.interface));
        let backup = HashMap::from([(original.id.clone(), "SSID".into())]);
        let plan = connected_name_plan(
            std::slice::from_ref(&original),
            &rows,
            &backup,
            &HashMap::new(),
            &HashMap::new(),
            &connection,
        )
        .unwrap();
        assert_eq!(plan.guid, original.id);
        assert_eq!(plan.nlm_guid, guid);
        assert_eq!(plan.label, "Studio");
        assert!(
            connected_name_plan(
                &[original, profile("Other credentials")],
                &rows,
                &backup,
                &HashMap::new(),
                &HashMap::new(),
                &connection
            )
            .is_none()
        );
    }

    #[test]
    fn duplicate_equivalence_preserves_security_settings_keys_and_ssid_case() {
        let xml = "<WLANProfile><name>Original</name><SSIDConfig><SSID><hex>53534944</hex><name>SSID</name></SSID><nonBroadcast>false</nonBroadcast></SSIDConfig><connectionMode>auto</connectionMode><MSM><security><authentication>WPA2PSK</authentication><encryption>AES</encryption><sharedKey><protected>false</protected><keyMaterial> test &amp; key </keyMaterial></sharedKey></security></MSM></WLANProfile>";
        let alias = xml.replacen("<name>Original</name>", "<name>Studio</name>", 1);
        assert_eq!(comparable_profile_xml(xml), comparable_profile_xml(&alias));
        for different in [
            alias.replace("false</nonBroadcast>", "true</nonBroadcast>"),
            alias.replace("test &amp; key", "different key"),
            alias.replace("<encryption>AES", "<encryption>TKIP"),
            alias.replace("<connectionMode>auto", "<connectionMode>manual"),
            alias.replace("<name>SSID", "<name>ssid"),
        ] {
            assert_ne!(
                comparable_profile_xml(xml),
                comparable_profile_xml(&different)
            );
        }
        assert!(
            comparable_profile_xml(&xml.replace("<protected>false", "<protected>true")).is_none()
        );
        assert!(comparable_profile_xml(&xml.replace("WPA2PSK", "WPA2")).is_none());
        let wep = xml
            .replace("WPA2PSK", "open")
            .replace("<encryption>AES", "<encryption>WEP");
        assert!(comparable_profile_xml(&wep).is_some());
        assert!(
            comparable_profile_xml(&wep.replace("<protected>false", "<protected>true")).is_none()
        );
    }

    #[test]
    fn duplicate_deletion_and_failed_rename_restore_the_original_profile() {
        use std::cell::RefCell;
        let events = RefCell::new(Vec::new());
        let result = rename_with_duplicate_rollback(
            Some("encrypted original profile"),
            |xml| {
                assert_eq!(*xml, "encrypted original profile");
                events.borrow_mut().push("delete");
                Ok(())
            },
            || {
                events.borrow_mut().push("rename");
                Err("rename denied".into())
            },
            |xml| {
                assert_eq!(*xml, "encrypted original profile");
                events.borrow_mut().push("restore");
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err(), "rename denied");
        assert_eq!(*events.borrow(), ["delete", "rename", "restore"]);
        events.borrow_mut().clear();
        let result = rename_with_duplicate_rollback(
            Some("encrypted original profile"),
            |_| {
                events.borrow_mut().push("delete");
                Err("delete denied".into())
            },
            || {
                events.borrow_mut().push("rename");
                Ok(())
            },
            |_| {
                events.borrow_mut().push("restore");
                Ok(())
            },
        );
        assert_eq!(result.unwrap_err(), "delete denied");
        assert_eq!(*events.borrow(), ["delete"]);
        events.borrow_mut().clear();
        let result = rename_with_duplicate_rollback::<()>(
            None,
            |_| panic!("no duplicate must be deleted"),
            || {
                events.borrow_mut().push("rename");
                Ok(())
            },
            |_| panic!("no duplicate must be restored"),
        );
        assert!(result.is_ok());
        assert_eq!(*events.borrow(), ["rename"]);
    }

    #[test]
    fn recreated_windows_guid_inherits_only_a_unique_exact_saved_label() {
        let saved = profile("SSID");
        let old_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let new_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let other_guid = "{22222233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: new_guid.into(),
            name: "SSID".into(),
            live: true,
            adapters: vec![guid_string(&saved.interface)],
        }];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let mut backup = HashMap::from([(old_guid.into(), "SSID".into())]);
        let mut links = HashMap::from([(old_guid.into(), saved.id.clone())]);
        let mut labels = HashMap::from([(old_guid.into(), "Studio".into())]);
        let plan = connected_name_plan(
            std::slice::from_ref(&saved),
            &rows,
            &backup,
            &links,
            &labels,
            &connection,
        )
        .unwrap();
        assert_eq!(plan.guid, new_guid);
        assert_eq!(plan.label, "Studio");
        assert!(transfer_label_intent(&mut labels, &links, &plan));
        assert!(!labels.contains_key(old_guid));
        assert!(!transfer_label_intent(&mut labels, &links, &plan));
        // Simulate restoring the migrated live row. Historical originals
        // survive, but their retired intent cannot nickname it again.
        let mut restored_backup = backup.clone();
        restored_backup.remove(new_guid);
        let mut restored_labels = labels.clone();
        restored_labels.remove(new_guid);
        assert!(
            connected_name_plan(
                std::slice::from_ref(&saved),
                &rows,
                &restored_backup,
                &links,
                &restored_labels,
                &connection
            )
            .is_none()
        );
        labels.insert(old_guid.into(), "Studio".into());
        labels.remove(new_guid);
        backup.insert(other_guid.into(), "SSID".into());
        links.insert(other_guid.into(), saved.id.clone());
        labels.insert(other_guid.into(), "Different intent".into());
        assert!(
            connected_name_plan(&[saved], &rows, &backup, &links, &labels, &connection).is_none()
        );
    }

    #[test]
    fn case_only_repair_never_deletes_its_source_profile() {
        let saved = profile("studio");
        assert!(target_profile_conflict(std::slice::from_ref(&saved), &saved, "Studio").is_none());
        let original = profile("SSID");
        assert_eq!(
            target_profile_conflict(&[saved.clone(), original.clone()], &original, "Studio")
                .unwrap()
                .name,
            "studio"
        );
    }

    #[test]
    fn a_failed_first_rename_cannot_turn_its_partial_nlm_label_into_a_new_nickname() {
        let saved = profile("SSID");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "Failed new label".into(),
            live: true,
            adapters: vec![guid_string(&saved.interface)],
        }];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let backup = HashMap::from([(guid.into(), "SSID".into())]);
        let seeded_labels = HashMap::from([(guid.into(), "SSID".into())]);
        assert!(
            connected_name_plan(
                &[saved],
                &rows,
                &backup,
                &HashMap::new(),
                &seeded_labels,
                &connection
            )
            .is_none()
        );
    }

    #[test]
    fn concurrent_wired_network_cannot_supply_the_active_wifi_nickname() {
        let saved = profile("SSID");
        let wifi_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let wired_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![
            super::super::nlm::Profile {
                guid: wired_guid.into(),
                name: "Wired label".into(),
                live: true,
                adapters: vec!["wired-only-current-adapter".into()],
            },
            super::super::nlm::Profile {
                guid: wifi_guid.into(),
                name: "Studio".into(),
                live: true,
                adapters: vec![guid_string(&saved.interface)],
            },
        ];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let backup = HashMap::from([
            (wifi_guid.into(), "SSID".into()),
            (wired_guid.into(), "SSID".into()),
        ]);
        let plan = connected_name_plan(
            &[saved],
            &rows,
            &backup,
            &HashMap::new(),
            &HashMap::new(),
            &connection,
        )
        .unwrap();
        assert_eq!(plan.nlm_guid, wifi_guid);
        assert_eq!(plan.label, "Studio");
    }

    #[test]
    fn a_live_wired_snapshot_cannot_consume_the_actual_wifi_saved_profile() {
        let saved = profile("Cafe");
        let wifi_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let wired_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![
            // NLM supplies only connected adapters for live rows, excluding
            // any historical inactive Wi-Fi association on the wired row.
            super::super::nlm::Profile {
                guid: wired_guid.into(),
                name: "Office".into(),
                live: true,
                adapters: vec!["wired-only-current-adapter".into()],
            },
            super::super::nlm::Profile {
                guid: wifi_guid.into(),
                name: "Cafe".into(),
                live: true,
                adapters: vec![guid_string(&saved.interface)],
            },
        ];
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let networks = merge_profiles(
            vec![saved],
            rows,
            &HashMap::new(),
            &HashMap::new(),
            Some(&connection),
        );
        let wired = networks
            .iter()
            .find(|network| network.guid == wired_guid)
            .unwrap();
        assert_eq!(wired.network_type, "ethernet");
        assert!(wired.profile.is_none());
        let wifi = networks
            .iter()
            .find(|network| network.guid == wifi_guid)
            .unwrap();
        assert_eq!(wifi.network_type, "wifi");
        assert_eq!(wifi.profile.as_deref(), Some("Cafe"));
        assert!(wifi.live);
    }

    #[test]
    fn active_and_full_snapshots_keep_the_same_nickname_legacy_identity_and_sharing_mask() {
        let wifi_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let old_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        for legacy in [false, true] {
            for (label, sharing) in [("Studio", false), ("Connected", true)] {
                let saved = profile(label);
                let mut other = profile("Other saved profile");
                other.ssid = "OTHER".into();
                other.id = format!("wlan:{}:4F54484552", guid_string(&other.interface));
                let inventory = vec![saved.clone(), other];
                let make_rows = || {
                    vec![
                        super::super::nlm::Profile {
                            guid: old_guid.into(),
                            name: "Unrelated historical metadata".into(),
                            live: false,
                            adapters: vec![],
                        },
                        super::super::nlm::Profile {
                            guid: wifi_guid.into(),
                            name: label.into(),
                            live: true,
                            adapters: vec![guid_string(&saved.interface)],
                        },
                    ]
                };
                let recovery_guid = if legacy {
                    saved.id.clone()
                } else {
                    wifi_guid.into()
                };
                let backup = HashMap::from([(recovery_guid.clone(), "SSID".into())]);
                let links = HashMap::from([(wifi_guid.into(), saved.id.clone())]);
                let labels = HashMap::from([(recovery_guid.clone(), "Studio".into())]);
                let mut connection = super::super::macos::parse_connection(
                    &serde_json::Value::Null,
                    "adapter",
                    "SSID",
                );
                // Windows may still report the old profile after renaming.
                connection.profile = "SSID".into();
                connection.interface_guid = Some(guid_string(&saved.interface));
                let mut full = merge_profiles(
                    inventory.clone(),
                    make_rows(),
                    &backup,
                    &links,
                    Some(&connection),
                );
                show_verified_profile_labels(&mut full, &labels, sharing);
                let mut active = merge_profiles(
                    inventory,
                    make_rows().into_iter().filter(|row| row.live).collect(),
                    &backup,
                    &links,
                    Some(&connection),
                );
                show_verified_profile_labels(&mut active, &labels, sharing);
                active.retain(|network| network.live);
                let full =
                    super::super::finish_network_snapshot(full, Some(connection.clone()), None);
                let active = super::super::finish_network_snapshot(active, Some(connection), None);
                assert_eq!(
                    serde_json::to_value(&active.connection).unwrap(),
                    serde_json::to_value(&full.connection).unwrap()
                );
                let current = active.connection.unwrap();
                assert_eq!(
                    current.network_guid.as_deref(),
                    Some(recovery_guid.as_str())
                );
                assert_eq!(current.name, label);
                assert_eq!(
                    current.profile, label,
                    "the mini path cannot leak a stale original profile name or override a sharing mask"
                );
                assert_eq!(active.networks.len(), 1);
            }
        }
    }

    #[test]
    fn active_offline_snapshot_keeps_missing_readings_and_does_not_invent_a_connection() {
        let mut networks = merge_profiles(
            vec![profile("Saved offline")],
            vec![],
            &HashMap::new(),
            &HashMap::new(),
            None,
        );
        networks.retain(|network| network.live);
        let snapshot = super::super::finish_network_snapshot(
            networks,
            None,
            Some("Wi-Fi details unavailable".into()),
        );
        assert!(snapshot.networks.is_empty());
        assert!(snapshot.connection.is_none());
        assert_eq!(
            snapshot.connection_error.as_deref(),
            Some("Wi-Fi details unavailable")
        );
    }

    #[test]
    fn actual_profile_label_can_show_pending_repair_without_hiding_new_os_names() {
        let saved = profile("Studio");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let make_networks = |name: &str, profile_name: &str| {
            let mut saved = saved.clone();
            saved.name = profile_name.into();
            let adapter = guid_string(&saved.interface);
            merge_profiles(
                vec![saved],
                vec![super::super::nlm::Profile {
                    guid: guid.into(),
                    name: name.into(),
                    live: true,
                    adapters: vec![adapter],
                }],
                &HashMap::from([(guid.into(), "SSID".into())]),
                &HashMap::new(),
                None,
            )
        };
        let labels = HashMap::from([(guid.into(), "Studio".into())]);
        let mut pending = make_networks("SSID", "Studio");
        show_verified_profile_labels(&mut pending, &labels, false);
        assert_eq!(pending[0].name, "Studio");
        assert!(pending[0].name_sync_pending);
        // Mutation verification sees B before saved intent A is replaced.
        let mut renamed = make_networks("Reading room", "Reading room");
        show_verified_profile_labels(&mut renamed, &labels, false);
        assert_eq!(renamed[0].name, "Reading room");
        assert!(!renamed[0].name_sync_pending);
        let mut restored = make_networks("SSID", "SSID");
        show_verified_profile_labels(&mut restored, &labels, false);
        assert_eq!(restored[0].name, "SSID");
        assert!(!restored[0].renamed);
        let mut shared = make_networks("Connected", "Connected");
        show_verified_profile_labels(&mut shared, &labels, true);
        assert_eq!(shared[0].name, "Connected");
        assert!(!shared[0].name_sync_pending);
        let mut unshared = make_networks("Studio", "Studio");
        show_verified_profile_labels(&mut unshared, &labels, true);
        assert_eq!(unshared[0].name, "Studio");
        // A failed sharing write must remain visible to recovery logic.
        let mut partial_mask = make_networks("Connected", "Studio");
        show_verified_profile_labels(&mut partial_mask, &labels, true);
        assert_eq!(partial_mask[0].name, "Connected");
        assert!(partial_mask[0].name_sync_pending);
        let mut before_sharing_write = make_networks("SSID", "Studio");
        show_verified_profile_labels(&mut before_sharing_write, &labels, true);
        assert_eq!(before_sharing_write[0].name, "SSID");
    }
    #[test]
    fn live_profile_mapping_uses_the_adapter_even_after_display_names_change() {
        let profile = profile("Renamed Wi-Fi profile");
        let interface = guid_string(&profile.interface);
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = profile.name.clone();
        connection.interface_guid = Some(interface.clone());
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "Masked display name".into(),
            live: true,
            adapters: vec![interface],
        }];
        let backup = HashMap::from([(guid.into(), "Original display name".into())]);
        let networks = merge_profiles(
            vec![profile],
            rows,
            &backup,
            &HashMap::new(),
            Some(&connection),
        );
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].guid, guid);
        assert_eq!(
            networks[0].profile.as_deref(),
            Some("Renamed Wi-Fi profile")
        );
        assert!(networks[0].live && networks[0].renamed);
        assert!(networks[0].name_sync_pending);
    }

    #[test]
    fn partially_restored_windows_names_are_reported_for_repair() {
        let mut saved = profile("Old alias");
        saved.ssid = "Router SSID".into();
        let interface = guid_string(&saved.interface);
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: "Router SSID".into(),
            live: false,
            adapters: vec![interface],
        }];
        let backup = HashMap::from([(guid.into(), "Router SSID".into())]);
        let networks = merge_profiles(vec![saved], rows, &backup, &HashMap::new(), None);
        assert_eq!(networks.len(), 1);
        assert!(!networks[0].renamed);
        assert!(networks[0].name_sync_pending);
    }

    #[test]
    fn orphaned_saved_profile_uses_its_unique_stale_recovery_record() {
        let mut saved = profile("Old alias");
        saved.ssid = "Router SSID".into();
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let backup = HashMap::from([(guid.into(), "Router SSID".into())]);
        let networks = merge_profiles(vec![saved], vec![], &backup, &HashMap::new(), None);

        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].guid, guid);
        assert_eq!(networks[0].name, "Old alias");
        assert_eq!(networks[0].original_name, "Router SSID");
        assert!(networks[0].renamed);
        assert!(!networks[0].name_sync_pending);
    }

    #[test]
    fn persisted_profile_link_survives_a_missing_nlm_row_and_non_ssid_original() {
        let mut saved = profile("Reading room");
        saved.ssid = "Router SSID".into();
        let stable_id = saved.id.clone();
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let backup = HashMap::from([(guid.into(), "Old Windows label".into())]);
        let links = HashMap::from([(guid.into(), stable_id)]);
        let networks = merge_profiles(vec![saved], vec![], &backup, &links, None);

        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].guid, guid);
        assert_eq!(networks[0].name, "Reading room");
        assert_eq!(networks[0].original_name, "Old Windows label");
        assert!(!networks[0].name_sync_pending);
    }

    #[test]
    fn ambiguous_stale_recovery_records_are_not_assigned_to_a_profile() {
        let mut saved = profile("Old alias");
        saved.ssid = "Router SSID".into();
        let profile_id = saved.id.clone();
        let backup = HashMap::from([
            (
                "{00112233-4455-6677-8899-aabbccddeeff}".into(),
                "Router SSID".into(),
            ),
            (
                "{11112233-4455-6677-8899-aabbccddeeff}".into(),
                "Router SSID".into(),
            ),
        ]);
        let networks = merge_profiles(vec![saved], vec![], &backup, &HashMap::new(), None);

        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].guid, profile_id);
        assert!(!networks[0].name_sync_pending);
    }

    #[test]
    fn profile_name_matching_requires_one_unambiguous_saved_profile() {
        let first = profile("Old alias");
        assert_eq!(
            unique_profile_matching(std::slice::from_ref(&first), &["Old alias"])
                .map(|profile| profile.name),
            Some("Old alias".into())
        );
        assert!(unique_profile_matching(&[first.clone(), first], &["Old alias"]).is_none());
    }

    #[test]
    fn duplicate_ssid_profiles_get_unique_ids_and_cannot_be_renamed_ambiguously() {
        let networks = merge_profiles(
            vec![profile("First"), profile("Second")],
            vec![],
            &HashMap::new(),
            &HashMap::new(),
            None,
        );
        assert_ne!(networks[0].guid, networks[1].guid);
        assert!(networks.iter().all(|network| !network.can_rename));
    }
    #[test]
    fn duplicate_ssid_live_profile_can_repair_restore_and_rename_again() {
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let saved = profile("Old alias");
        let interface = guid_string(&saved.interface);
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(interface.clone());
        let link = HashMap::from([(guid.into(), saved.id.clone())]);
        for (display, saved_name, original, pending) in [
            ("SSID", "Old alias", "SSID", true),
            ("Reading room", "Reading room", "SSID", false),
            ("SSID", "SSID", "SSID", false),
            ("New label", "New label", "SSID", false),
        ] {
            let rows = vec![super::super::nlm::Profile {
                guid: guid.into(),
                name: display.into(),
                live: true,
                adapters: vec![interface.clone()],
            }];
            let backup = if display == original && !pending {
                HashMap::new()
            } else {
                HashMap::from([(guid.into(), original.into())])
            };
            let networks = merge_profiles(
                vec![profile(saved_name), profile("Other saved profile")],
                rows,
                &backup,
                &link,
                Some(&connection),
            );
            let live = networks
                .iter()
                .find(|network| network.guid == guid)
                .unwrap();
            assert!(live.can_rename, "{display} must remain editable");
            assert_eq!(live.profile.as_deref(), Some(saved_name));
            assert_eq!(live.name_sync_pending, pending);
            assert_eq!(live.renamed, display != original);
            assert_eq!(
                networks.len(),
                2,
                "the duplicate must remain separately visible"
            );
        }
    }

    #[test]
    fn live_profile_wins_over_a_duplicate_named_like_the_windows_label() {
        let saved = profile("Old alias");
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = saved.name.clone();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let duplicate = profile("SSID");
        assert_eq!(
            select_profile(
                &[&saved, &duplicate],
                Some(&saved.id),
                Some(&connection),
                &["SSID"]
            )
            .unwrap()
            .name,
            "Old alias"
        );
    }
    #[test]
    fn a_cached_original_name_cannot_shadow_the_current_renamed_profile() {
        let saved = profile("Current local label");
        let duplicate = profile("SSID");
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = "SSID".into();
        connection.interface_guid = Some(guid_string(&saved.interface));
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let backup = HashMap::from([(guid.into(), "SSID".into())]);
        let links = HashMap::from([(guid.into(), saved.id.clone())]);
        let rows = vec![super::super::nlm::Profile {
            guid: guid.into(),
            name: saved.name.clone(),
            live: true,
            adapters: vec![guid_string(&saved.interface)],
        }];
        let networks = merge_profiles(
            vec![saved.clone(), duplicate.clone()],
            rows,
            &backup,
            &links,
            Some(&connection),
        );
        let live = networks.iter().find(|network| network.live).unwrap();
        assert_eq!(live.profile.as_deref(), Some(saved.name.as_str()));
        assert!(live.can_rename);
        assert!(!live.name_sync_pending);
        assert_eq!(
            select_profile(
                &[&saved, &duplicate],
                Some(&saved.id),
                Some(&connection),
                &[&saved.name, "SSID", &saved.name]
            )
            .unwrap()
            .name,
            saved.name
        );
    }

    #[test]
    fn exact_profile_name_disambiguates_duplicate_ssids_after_reconnect_or_restore() {
        let first = profile("SSID");
        let second = profile("Other alias");
        assert_eq!(
            select_profile(&[&first, &second], Some(&first.id), None, &["SSID"])
                .unwrap()
                .name,
            "SSID"
        );
        assert_eq!(
            unique_profile_matching(&[first, second], &["Other alias"])
                .unwrap()
                .name,
            "Other alias"
        );
    }

    #[test]
    fn ambiguous_ssid_and_missing_recovery_link_do_not_select_a_profile() {
        let first = profile("First");
        let second = profile("Second");
        assert!(select_profile(&[&first, &second], None, None, &["SSID"]).is_none());
        assert!(select_profile(&[&first], Some("wlan:missing"), None, &["First"]).is_none());
        let rows = vec![super::super::nlm::Profile {
            guid: "{00112233-4455-6677-8899-aabbccddeeff}".into(),
            name: "SSID".into(),
            live: true,
            adapters: vec![guid_string(&first.interface)],
        }];
        let networks = merge_profiles(
            vec![first, second],
            rows,
            &HashMap::new(),
            &HashMap::new(),
            None,
        );
        assert!(
            !networks
                .iter()
                .find(|network| network.live)
                .unwrap()
                .can_rename
        );
    }

    #[test]
    fn duplicate_conflict_uses_its_own_windows_recovery_guid() {
        let first = profile("SSID");
        let second = profile("Alias");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let other_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: other_guid.into(),
            name: "SSID".into(),
            live: false,
            adapters: vec![guid_string(&first.interface)],
        }];
        assert_eq!(
            conflict_recovery_id(
                guid,
                &first,
                &[first.clone(), second.clone()],
                &rows,
                &HashMap::new(),
                None
            )
            .unwrap(),
            other_guid
        );
        assert!(
            conflict_recovery_id(
                guid,
                &first,
                &[first.clone(), second],
                &[],
                &HashMap::new(),
                None
            )
            .is_err()
        );
    }
    #[test]
    fn a_similar_label_cannot_redirect_conflict_repair_to_another_linked_profile() {
        let conflict = profile("Alias");
        let mut linked = profile("Linked profile");
        linked.ssid = "OTHER".into();
        linked.id = format!("wlan:{}:4F54484552", guid_string(&linked.interface));
        let source_guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let other_guid = "{11112233-4455-6677-8899-aabbccddeeff}";
        let rows = vec![super::super::nlm::Profile {
            guid: other_guid.into(),
            name: "Alias".into(),
            live: false,
            adapters: vec![guid_string(&linked.interface)],
        }];
        let links = HashMap::from([(other_guid.into(), linked.id.clone())]);
        let id = conflict_recovery_id(
            source_guid,
            &conflict,
            &[conflict.clone(), linked],
            &rows,
            &links,
            None,
        )
        .unwrap();
        assert_eq!(
            id, conflict.id,
            "the unrelated NLM identity must remain untouched"
        );
    }
    #[test]
    fn legacy_wlan_mutations_only_map_a_matching_windows_network() {
        let saved = profile("Alias");
        let guid = "{00112233-4455-6677-8899-aabbccddeeff}";
        let row = |name: &str| super::super::nlm::Profile {
            guid: guid.into(),
            name: name.into(),
            live: false,
            adapters: vec![guid_string(&saved.interface)],
        };
        assert!(
            matching_nlm_guid(
                &saved,
                std::slice::from_ref(&saved),
                &[row("Unrelated network")],
                &HashMap::new(),
                &HashMap::new(),
                None
            )
            .unwrap()
            .is_none()
        );
        assert_eq!(
            matching_nlm_guid(
                &saved,
                std::slice::from_ref(&saved),
                &[row("SSID")],
                &HashMap::new(),
                &HashMap::new(),
                None
            )
            .unwrap()
            .as_deref(),
            Some(guid)
        );
        assert!(
            matching_nlm_guid(
                &saved,
                std::slice::from_ref(&saved),
                &[row("SSID"), row("SSID")],
                &HashMap::new(),
                &HashMap::new(),
                None
            )
            .is_err()
        );
    }
    #[test]
    fn xml_credentials_decode_unicode_entities_once_and_preserve_spaces() {
        assert_eq!(
            xml_value(
                "<keyMaterial> Café&#32;&amp;lt;&#x1f6dc; </keyMaterial>",
                "keyMaterial"
            )
            .unwrap(),
            " Café &lt;🛜 "
        );
        assert!(xml_value("<keyMaterial>&unknown;</keyMaterial>", "keyMaterial").is_none());
    }

    #[test]
    fn legacy_profile_recovery_keeps_its_identity_before_and_after_restore() {
        let profile = profile("Saved profile");
        let interface = guid_string(&profile.interface);
        let mut connection =
            super::super::macos::parse_connection(&serde_json::Value::Null, "adapter", "SSID");
        connection.profile = profile.name.clone();
        connection.interface_guid = Some(interface.clone());
        let rows = vec![
            super::super::nlm::Profile {
                guid: "{00112233-4455-6677-8899-aabbccddeeff}".into(),
                name: "SSID".into(),
                live: false,
                adapters: vec![interface.clone()],
            },
            super::super::nlm::Profile {
                guid: "{11112233-4455-6677-8899-aabbccddeeff}".into(),
                name: "SSID".into(),
                live: true,
                adapters: vec![interface],
            },
        ];
        let backup = HashMap::from([(profile.id.clone(), "Original profile".into())]);
        let networks = merge_profiles(
            vec![profile.clone()],
            rows,
            &backup,
            &HashMap::new(),
            Some(&connection),
        );
        let live = networks.iter().find(|network| network.live).unwrap();
        assert_eq!(live.guid, profile.id);
        assert_eq!(live.original_name, "Original profile");
        assert_eq!(
            networks.len(),
            1,
            "the historic representation must not duplicate the saved profile"
        );
        let restored_rows = vec![super::super::nlm::Profile {
            guid: "{11112233-4455-6677-8899-aabbccddeeff}".into(),
            name: "Original profile".into(),
            live: true,
            adapters: vec![guid_string(&profile.interface)],
        }];
        let mut restored_profile = profile.clone();
        restored_profile.name = "Original profile".into();
        let restored = merge_profiles(
            vec![restored_profile],
            restored_rows,
            &backup,
            &HashMap::new(),
            Some(&connection),
        );
        assert_eq!(restored[0].guid, live.guid);
        assert!(restored[0].can_rename);
        assert_eq!(networks.len(), 1);
    }
}
