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
                can_rename: true,
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
    Ok(merge_profiles(profiles, rows, backup, &links, connection))
}

fn merge_profiles(
    mut profiles: Vec<Profile>,
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
    for profile in &mut profiles {
        if counts.get(&profile.id).is_some_and(|count| *count > 1) {
            profile.id = format!(
                "{}:{}",
                profile.id,
                base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&profile.name)
            );
            profile.can_rename = false;
        }
    }
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
        let candidates: Vec<_> = profiles
            .iter()
            .filter(|profile| {
                if used_profiles.contains(&profile.id) {
                    return false;
                }
                let interface = guid_string(&profile.interface);
                row.adapters.contains(&interface)
                    && ([name, original.as_str()]
                        .iter()
                        .any(|name| profile.name == *name || profile.ssid == *name)
                        || (row.live
                            && connection.is_some_and(|c| {
                                c.profile == profile.name
                                    && c.interface_guid.as_deref() == Some(interface.as_str())
                            })))
            })
            .collect();
        let linked_profile = links.get(guid).and_then(|stable_id| {
            let matches: Vec<_> = profiles
                .iter()
                .filter(|profile| {
                    profile.id == *stable_id
                        && row.adapters.contains(&guid_string(&profile.interface))
                        && !used_profiles.contains(&profile.id)
                })
                .collect();
            (matches.len() == 1).then(|| matches[0])
        });
        let profile = linked_profile
            .or_else(|| {
                if row.live {
                    candidates.iter().copied().find(|profile| {
                        connection.is_some_and(|c| {
                            c.profile == profile.name
                                && c.interface_guid.as_deref()
                                    == Some(guid_string(&profile.interface).as_str())
                        })
                    })
                } else {
                    None
                }
            })
            .or_else(|| (candidates.len() == 1).then(|| candidates[0]));
        let chosen_guid = profile
            .filter(|profile| backup.contains_key(&profile.id))
            .map(|p| p.id.as_str())
            .unwrap_or(guid);
        if let Some(profile) = profile {
            used_profiles.insert(profile.id.clone());
        }
        let is_wifi = profile.is_some()
            || profiles
                .iter()
                .any(|p| row.adapters.contains(&guid_string(&p.interface)));
        let live = row.live;
        let display = if chosen_guid.starts_with("wlan:") {
            profile.map(|p| p.name.as_str()).unwrap_or(name)
        } else {
            name
        };
        let name_sync_pending = profile.is_some_and(|profile| {
            profile.name != name && (backup.contains_key(guid) || backup.contains_key(&profile.id))
        });
        let original = backup.get(chosen_guid).cloned().unwrap_or(original);
        networks.push(Network {
            guid: chosen_guid.into(),
            name: display.into(),
            renamed: display != original,
            name_sync_pending,
            original_name: original,
            live,
            network_type: if is_wifi { "wifi" } else { "ethernet" }.into(),
            profile: profile.map(|p| p.name.clone()),
            can_rename: profile.is_none_or(|profile| profile.can_rename),
        });
    }
    let remaining_profiles: Vec<_> = profiles
        .into_iter()
        .filter(|p| !used_profiles.contains(&p.id))
        .collect();
    let remaining_ssids = remaining_profiles
        .iter()
        .fold(HashMap::new(), |mut counts, profile| {
            *counts.entry(profile.ssid.clone()).or_insert(0usize) += 1;
            counts
        });
    for profile in remaining_profiles {
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
            name_sync_pending: stale_recovery.is_some(),
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

struct ProfileMatch {
    profile: Option<Profile>,
    nlm_available: bool,
}

fn unique_profile_matching(profiles: &[Profile], names: &[&str]) -> Option<Profile> {
    let candidates: Vec<_> = profiles
        .iter()
        .filter(|profile| {
            names
                .iter()
                .any(|name| profile.name == *name || profile.ssid == *name)
        })
        .collect();
    (candidates.len() == 1).then(|| candidates[0].clone())
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
    if let Some(linked_id) = linked_id {
        let matches: Vec<_> = profiles
            .iter()
            .filter(|profile| {
                profile.id == linked_id && row.adapters.contains(&guid_string(&profile.interface))
            })
            .collect();
        if matches.len() == 1 {
            return Ok(ProfileMatch {
                profile: Some(matches[0].clone()),
                nlm_available: true,
            });
        }
    }
    let connection = get_connection().ok().flatten();

    if row.live {
        if let Some(profile) = profiles
            .iter()
            .filter(|profile| row.adapters.contains(&guid_string(&profile.interface)))
            .find(|profile| {
                connection.as_ref().is_some_and(|connection| {
                    connection.profile == profile.name
                        && connection.interface_guid.as_deref()
                            == Some(guid_string(&profile.interface).as_str())
                })
            })
        {
            return Ok(ProfileMatch {
                profile: Some(profile.clone()),
                nlm_available: true,
            });
        }
    }

    let candidates: Vec<_> = profiles
        .iter()
        .filter(|profile| row.adapters.contains(&guid_string(&profile.interface)))
        .filter(|profile| {
            [Some(row.name.as_str()), current_name]
                .into_iter()
                .flatten()
                .any(|name| profile.name == name || profile.ssid == name)
        })
        .collect();
    Ok(ProfileMatch {
        profile: (candidates.len() == 1).then(|| candidates[0].clone()),
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
) -> Result<Option<(Profile, Profile, String)>, String> {
    let source = if guid.starts_with("wlan:") {
        profiles()?.into_iter().find(|profile| profile.id == guid)
    } else {
        profile_for_network(guid, current_name)?.profile
    };
    let Some(source) = source else {
        return Ok(None);
    };
    let all = profiles()?;
    if all.iter().filter(|profile| profile.id == source.id).count() != 1 {
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
        .filter(|profile| profile.id == conflict.id)
        .count()
        != 1
    {
        return Err(
            "The conflicting Wi-Fi profile is ambiguous and cannot be repaired automatically."
                .into(),
        );
    }
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
    Ok(Some((source, conflict.clone(), suggested)))
}

pub fn name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<Option<crate::types::NameConflict>, String> {
    Ok(
        conflict_details(guid, new_name, current_name)?.map(|(_, conflict, suggested)| {
            crate::types::NameConflict {
                conflicting_guid: conflict.id,
                current_name: conflict.name,
                suggested_name: suggested,
            }
        }),
    )
}

pub fn repair_name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<(), String> {
    let Some((_, conflict, suggested)) = conflict_details(guid, new_name, current_name)? else {
        return Err("The saved-profile conflict changed. Refresh and try the name again.".into());
    };
    let previous = conflict.name.clone();
    rename_profile(&conflict, &suggested)?;
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
        return match rename_profile(&refreshed, &previous) {
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

fn rename_direct(guid: &str, new_name: &str, current_name: Option<&str>) -> Result<(), String> {
    if guid.starts_with("wlan:") {
        let matches: Vec<_> = profiles()?.into_iter().filter(|p| p.id == guid).collect();
        if matches.len() > 1 {
            return Err("This saved SSID has multiple profiles. Its recovery record has been kept; choose an unambiguous network profile.".into());
        }
        let profile = matches
            .into_iter()
            .next()
            .ok_or("This Wi-Fi profile is no longer available")?;
        return rename_profile(&profile, new_name);
    }
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
        }
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
        assert!(networks[0].name_sync_pending);
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
        assert!(networks[0].name_sync_pending);
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
    fn historical_rows_cannot_claim_the_live_profiles_recovery_identifier() {
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
        assert_eq!(
            networks
                .iter()
                .filter(|network| network.guid == profile.id)
                .count(),
            1
        );
        assert!(
            networks
                .iter()
                .find(|network| network.guid == profile.id)
                .unwrap()
                .live
        );
        assert_ne!(networks[0].guid, networks[1].guid);
    }
}
