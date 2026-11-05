//! Elevation runs the branded native executable with a bounded, typed request.
//! The elevated helper has no webview and accepts no arbitrary scripts or paths.
use crate::{platform, settings, system};
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "operation", deny_unknown_fields)]
pub enum Request {
    Rename {
        id: String,
        name: String,
    },
    Dns {
        index: u32,
        servers: Option<Vec<String>>,
    },
    Randomization {
        guid: String,
        profile: String,
        mode: String,
    },
    Netbios {
        guid: String,
        enabled: bool,
    },
    Driver {
        adapter: String,
        changes: Vec<(String, String)>,
    },
    RegisterTask {
        user_sid: String,
    },
    RemoveTask,
}

impl Request {
    fn validate(&self) -> Result<(), String> {
        match self {
            Self::Rename { id, name } => {
                if !platform::is_guid(id) && !id.starts_with("wlan:") {
                    return Err("Invalid network identifier".into());
                }
                settings::validate_display_name(name)?;
            }
            Self::Dns { index, servers } => {
                if *index == 0
                    || servers.as_ref().is_some_and(|values| {
                        values.is_empty()
                            || values.len() > 4
                            || values
                                .iter()
                                .any(|value| value.parse::<std::net::IpAddr>().is_err())
                    })
                {
                    return Err("Invalid DNS configuration".into());
                }
            }
            Self::Randomization {
                guid,
                profile,
                mode,
            } => {
                if !platform::is_guid(guid) || !matches!(mode.as_str(), "yes" | "no" | "daily") {
                    return Err("Invalid randomization request".into());
                }
                settings::validate_display_name(profile)?;
            }
            Self::Netbios { guid, .. } => {
                if !platform::is_guid(guid) {
                    return Err("Invalid adapter identifier".into());
                }
            }
            Self::Driver { adapter, changes } => {
                settings::validate_display_name(adapter)?;
                if changes.is_empty()
                    || changes.len() > 2
                    || changes.iter().any(|(keyword, value)| {
                        let keyword = keyword.to_ascii_lowercase();
                        !(keyword.contains("preferredband")
                            || (keyword.contains("roam") && keyword.contains("aggress")))
                            || value.is_empty()
                            || value.len() > 200
                            || value.chars().any(char::is_control)
                    })
                {
                    return Err("Invalid driver settings".into());
                }
            }
            Self::RegisterTask { user_sid } => {
                if !user_sid.starts_with("S-1-")
                    || user_sid.len() > 184
                    || !user_sid[4..]
                        .chars()
                        .all(|c| c.is_ascii_digit() || c == '-')
                {
                    return Err("Invalid Windows user".into());
                }
            }
            Self::RemoveTask => {}
        }
        Ok(())
    }

    fn script(&self) -> Result<Option<String>, String> {
        self.validate()?;
        let quote = system::powershell_literal;
        Ok(Some(match self {
            Self::Rename { .. } => return Ok(None),
            Self::Dns { index, servers: None } => format!("Set-DnsClientServerAddress -InterfaceIndex {index} -ResetServerAddresses -ErrorAction Stop"),
            Self::Dns { index, servers: Some(servers) } => format!("Set-DnsClientServerAddress -InterfaceIndex {index} -ServerAddresses @({}) -ErrorAction Stop", servers.iter().map(|s| quote(s)).collect::<Vec<_>>().join(",")),
            Self::Randomization { guid, profile, mode } => format!("$adapter = Get-NetAdapter | Where-Object {{ ([Guid]$_.InterfaceGuid).ToString('B') -eq {} }} | Select-Object -First 1; if (-not $adapter) {{ throw 'Adapter unavailable' }}; & netsh.exe wlan set profileparameter {} ('interface=' + $adapter.Name) {}; if ($LASTEXITCODE -ne 0) {{ throw 'Driver rejected randomization' }}", quote(guid), quote(&format!("name={profile}")), quote(&format!("Randomization={mode}"))),
            Self::Netbios { guid, enabled } => format!("Set-ItemProperty -LiteralPath {} -Name NetbiosOptions -Type DWord -Value {} -ErrorAction Stop", quote(&format!("HKLM:\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{guid}")), if *enabled {2} else {0}),
            Self::Driver { adapter, changes } => {
                let mut script = String::new();
                // Check every value against the driver's current allowed values before any mutation.
                for (keyword, value) in changes {
                    script.push_str(&format!("$p = @(Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction Stop | Where-Object {{ $_.Name -eq {} -and $_.RegistryKeyword -eq {} }}); if ($p.Count -ne 1 -or @($p[0].ValidDisplayValues) -notcontains {}) {{ throw 'Unsupported driver setting' }}; ", quote(adapter), quote(keyword), quote(value)));
                }
                for (keyword, value) in changes {
                    script.push_str(&format!("Get-NetAdapterAdvancedProperty -Name '*' -ErrorAction Stop | Where-Object {{ $_.Name -eq {} -and $_.RegistryKeyword -eq {} }} | Set-NetAdapterAdvancedProperty -DisplayValue {} -NoRestart -ErrorAction Stop; ", quote(adapter), quote(keyword), quote(value)));
                }
                script.push_str(&format!("Get-NetAdapter | Where-Object {{ $_.Name -eq {} }} | Restart-NetAdapter -Confirm:$false -ErrorAction Stop", quote(adapter)));
                script
            }
            Self::RegisterTask { user_sid } => {
                let exe = std::env::current_exe().map_err(|_| "NetMask executable is unavailable")?;
                format!("$action = New-ScheduledTaskAction -Execute {} -Argument '--handoff'; $principal = New-ScheduledTaskPrincipal -UserId {} -LogonType Interactive -RunLevel Highest; $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; Register-ScheduledTask -TaskName 'NetMask_Elevated' -Action $action -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null", quote(&exe.to_string_lossy()), quote(user_sid))
            }
            Self::RemoveTask => "Unregister-ScheduledTask -TaskName 'NetMask_Elevated' -Confirm:$false -ErrorAction Stop".into(),
        }))
    }

    fn execute(&self) -> Result<(), String> {
        self.validate()?;
        #[cfg(windows)]
        if let Self::Rename { id, name } = self {
            return platform::windows::rename(id, name, false);
        }
        #[cfg(not(windows))]
        if matches!(self, Self::Rename { .. }) {
            return Err("Windows operation unavailable".into());
        }
        system::powershell(&self.script()?.ok_or("Missing operation")?).map(|_| ())
    }
}

fn decode(value: &str) -> Result<Request, String> {
    if value.len() > 24000 {
        return Err("Elevation request is too large".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| "Invalid elevation request")?;
    let shape: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid elevation request")?;
    let object = shape.as_object().ok_or("Invalid elevation request")?;
    let operation = object
        .get("operation")
        .and_then(serde_json::Value::as_str)
        .ok_or("Invalid elevation request")?;
    let allowed: &[&str] = match operation {
        "Rename" => &["operation", "id", "name"],
        "Dns" => &["operation", "index", "servers"],
        "Randomization" => &["operation", "guid", "profile", "mode"],
        "Netbios" => &["operation", "guid", "enabled"],
        "Driver" => &["operation", "adapter", "changes"],
        "RegisterTask" => &["operation", "user_sid"],
        "RemoveTask" => &["operation"],
        _ => return Err("Invalid elevation request".into()),
    };
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err("Invalid elevation request".into());
    }
    let request: Request =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid elevation request")?;
    request.validate()?;
    Ok(request)
}

pub fn handle_cli() -> Option<i32> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    if arguments.first().map(String::as_str) != Some("--nm-privileged") {
        return None;
    }
    let result = (|| {
        if arguments.len() != 2 || !platform::is_admin() {
            return Err("An elevated helper is required".into());
        }
        let request = decode(&arguments[1])?;
        return request.execute();
    })();
    // The parent verifies the OS result. No private details enter stdout or a shared file.
    Some(if result.is_ok() { 0 } else { 1 })
}

pub fn run(request: Request) -> Result<(), String> {
    request.validate()?;
    #[cfg(windows)]
    {
        if platform::is_admin() {
            return request.execute();
        }
        let bytes = serde_json::to_vec(&request).map_err(|_| "Cannot prepare elevation")?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        if encoded.len() > 24000 {
            return Err("Elevation request is too large".into());
        }
        launch_elevated(&format!("--nm-privileged {encoded}"), true)
    }
    #[cfg(not(windows))]
    Err("This operation is available only on Windows".into())
}

#[cfg(windows)]
pub fn launch_elevated(arguments: &str, wait: bool) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{Foundation::*, System::Threading::*, UI::Shell::*};
    let exe = std::env::current_exe().map_err(|_| "NetMask executable is unavailable")?;
    let file: Vec<u16> = exe.as_os_str().encode_wide().chain(Some(0)).collect();
    let parameters: Vec<u16> = arguments.encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of_val(&info) as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    info.lpVerb = verb.as_ptr();
    info.lpFile = file.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = 0;
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        return Err(if unsafe { GetLastError() } == 1223 {
            "Administrator approval was cancelled. Nothing was changed."
        } else {
            "Windows could not start NetMask with administrator permission."
        }
        .into());
    }
    struct Process(HANDLE);
    impl Drop for Process {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    if info.hProcess.is_null() {
        return Err("Windows did not return the elevated NetMask process".into());
    }
    let process = Process(info.hProcess);
    if !wait {
        return Ok(());
    }
    if unsafe { WaitForSingleObject(process.0, 120_000) } != WAIT_OBJECT_0 {
        // Never kill a helper during a protected OS write; the caller retains recovery.
        return Err("The administrator operation has not finished. Refresh to check its result before retrying.".into());
    }
    let mut code = 1;
    if unsafe { GetExitCodeProcess(process.0, &mut code) } == 0 || code != 0 {
        return Err("Windows rejected the administrator operation. Refresh and check this device's supported settings.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn helper_rejects_arbitrary_operations_paths_and_invalid_values() {
        let encode = |value: &str| base64::engine::general_purpose::STANDARD.encode(value);
        assert!(decode(&encode(r#"{"operation":"Script","script":"whoami"}"#)).is_err());
        assert!(
            decode(&encode(
                r#"{"operation":"RemoveTask","output":"C:\\Windows\\file"}"#
            ))
            .is_err()
        );
        assert!(
            decode(&encode(
                r#"{"operation":"Dns","index":0,"servers":["1.1.1.1"]}"#
            ))
            .is_err()
        );
        assert!(
            decode(&encode(
                r#"{"operation":"Dns","index":1,"servers":["1.1.1.1; whoami"]}"#
            ))
            .is_err()
        );
        let request = Request::Driver {
            adapter: "Wi-Fi' $(whoami)".into(),
            changes: vec![("*PreferredBand".into(), "5 GHz' ; whoami".into())],
        };
        let script = request.script().unwrap().unwrap();
        assert!(script.contains("'Wi-Fi'' $(whoami)'"));
        assert!(script.contains("'5 GHz'' ; whoami'"));
        assert!(
            script.find("-notcontains").unwrap()
                < script.find("Set-NetAdapterAdvancedProperty").unwrap()
        );
    }
    #[test]
    fn every_request_has_a_bounded_script_or_native_rename() {
        let requests = [
            Request::Rename {
                id: "{00112233-4455-6677-8899-aabbccddeeff}".into(),
                name: "Private".into(),
            },
            Request::Dns {
                index: 12,
                servers: Some(vec!["1.1.1.1".into(), "1.0.0.1".into()]),
            },
            Request::Dns {
                index: 12,
                servers: None,
            },
            Request::Randomization {
                guid: "{00112233-4455-6677-8899-aabbccddeeff}".into(),
                profile: "Studio".into(),
                mode: "daily".into(),
            },
            Request::Netbios {
                guid: "{00112233-4455-6677-8899-aabbccddeeff}".into(),
                enabled: true,
            },
            Request::Driver {
                adapter: "Wi-Fi".into(),
                changes: vec![("*PreferredBand".into(), "5 GHz".into())],
            },
            Request::RegisterTask {
                user_sid: "S-1-5-21-1000".into(),
            },
            Request::RemoveTask,
        ];
        for request in requests {
            request.validate().unwrap();
            let script = request.script().unwrap();
            if matches!(request, Request::Rename { .. }) {
                assert!(script.is_none());
            } else {
                assert!(script.is_some_and(|value| !value.is_empty() && value.len() < 8000));
            }
        }
    }
}
