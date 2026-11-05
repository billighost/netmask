//! The Network List Manager supplies real profile IDs and live state without
//! parsing shell output or guessing identity from a displayed network name.
use windows::Win32::Networking::NetworkListManager::{
    INetworkListManager, NLM_ENUM_NETWORK_ALL, NetworkListManager,
};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::core::{BSTR, GUID};

pub struct Profile {
    pub guid: String,
    pub name: String,
    pub live: bool,
    pub adapters: Vec<String>,
}

fn identifier(guid: GUID) -> String {
    super::windows::guid_string(&windows_sys::core::GUID {
        data1: guid.data1,
        data2: guid.data2,
        data3: guid.data3,
        data4: guid.data4,
    })
}

fn with_manager<T>(
    operation: impl FnOnce(&INetworkListManager) -> Result<T, String>,
) -> Result<T, String> {
    let result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    // RPC_E_CHANGED_MODE means this thread already owns another valid apartment.
    if result.is_err() && result.0 != 0x80010106u32 as i32 {
        return Err("Windows COM initialization failed".into());
    }
    struct Apartment(bool);
    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() }
            }
        }
    }
    let _apartment = Apartment(result.is_ok());
    let manager: INetworkListManager =
        unsafe { CoCreateInstance(&NetworkListManager, None, CLSCTX_ALL) }
            .map_err(|_| "Windows Network List Manager is unavailable")?;
    operation(&manager)
}

pub fn profiles() -> Result<Vec<Profile>, String> {
    with_manager(|manager| {
        let enumeration = unsafe { manager.GetNetworks(NLM_ENUM_NETWORK_ALL) }
            .map_err(|_| "Cannot enumerate Windows network profiles")?;
        let mut profiles = Vec::new();
        loop {
            let mut fetched = 0u32;
            let mut next = [None];
            unsafe { enumeration.Next(&mut next, Some(&mut fetched)) }
                .map_err(|_| "Cannot read a Windows network profile")?;
            if fetched == 0 {
                break;
            }
            if profiles.len() >= 10000 {
                return Err("Windows returned too many network profiles".into());
            }
            let network = next[0]
                .take()
                .ok_or("Windows returned an empty network profile")?;
            let guid = identifier(
                unsafe { network.GetNetworkId() }.map_err(|_| "Network identifier unavailable")?,
            );
            let name = unsafe { network.GetName() }
                .map_err(|_| "Network display name unavailable")?
                .to_string();
            let live = unsafe { network.IsConnected() }
                .map_err(|_| "Network connection state unavailable")?
                == true;
            let mut adapters = Vec::new();
            let connections = unsafe { network.GetNetworkConnections() }
                .map_err(|_| "Network interfaces unavailable")?;
            loop {
                let mut fetched = 0u32;
                let mut next = [None];
                unsafe { connections.Next(&mut next, Some(&mut fetched)) }
                    .map_err(|_| "Cannot enumerate network interfaces")?;
                if fetched == 0 {
                    break;
                }
                if adapters.len() >= 1000 {
                    return Err("Windows returned too many network interfaces".into());
                }
                if let Some(connection) = next[0].take() {
                    adapters.push(identifier(
                        unsafe { connection.GetAdapterId() }
                            .map_err(|_| "Adapter identifier unavailable")?,
                    ));
                }
            }
            profiles.push(Profile {
                guid,
                name,
                live,
                adapters,
            });
        }
        Ok(profiles)
    })
}

fn parse_identifier(id: &str) -> Result<GUID, String> {
    if !super::is_guid(id) {
        return Err("Invalid Windows network identifier".into());
    }
    let hex = id.trim_matches(['{', '}']).replace('-', "");
    Ok(GUID::from_u128(
        u128::from_str_radix(&hex, 16).map_err(|_| "Invalid Windows network identifier")?,
    ))
}

pub fn name(id: &str) -> Result<String, String> {
    let guid = parse_identifier(id)?;
    with_manager(|manager| {
        let network = unsafe { manager.GetNetwork(guid) }
            .map_err(|_| "This Windows network is no longer available")?;
        unsafe { network.GetName() }
            .map(|value| value.to_string())
            .map_err(|_| "Network display name unavailable".into())
    })
}

pub fn rename(id: &str, name: &str) -> Result<(), String> {
    let guid = parse_identifier(id)?;
    with_manager(|manager| {
        let network = unsafe { manager.GetNetwork(guid) }
            .map_err(|_| "This Windows network is no longer available")?;
        unsafe { network.SetName(&BSTR::from(name)) }.map_err(|error| {
            if error.code().0 == 0x80070005u32 as i32 {
                "Administrator permission is required to change this network display name"
            } else {
                "Windows could not update the network display name"
            }
        })?;
        if unsafe { network.GetName() }
            .map_err(|_| "Cannot verify the updated network name")?
            .to_string()
            != name
        {
            return Err("Windows did not confirm the new network display name".into());
        }
        Ok(())
    })
}
