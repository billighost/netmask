use crate::{platform, settings};
use std::collections::HashMap;

fn recovery_audit_ready(installed: &str, pending: &str) -> Result<bool, String> {
    Ok(!crate::updater::compare_semver(installed, pending)?.is_lt())
}

pub fn run_pending_recovery_audit() -> Result<(), String> {
    let Some(version) = settings::storage()
        .read::<Option<String>>("update-pending.json")?
        .flatten()
    else {
        return Ok(());
    };
    if !recovery_audit_ready(crate::VERSION, &version)? {
        return Ok(());
    }
    let backup = settings::read_backup()?;
    let mut snapshot = platform::get_network_snapshot(&backup)?;
    #[cfg(windows)]
    {
        let mut links = settings::read_name_links()?;
        let mut changed = false;
        for guid in backup.keys().filter(|guid| platform::is_guid(guid)) {
            if links.contains_key(guid) {
                continue;
            }
            let current_name = snapshot
                .networks
                .iter()
                .find(|network| &network.guid == guid)
                .map(|network| network.name.as_str());
            if let Ok(Some(stable_id)) = platform::stable_recovery_id(guid, current_name) {
                links.insert(guid.clone(), stable_id);
                changed = true;
            }
        }
        if changed {
            settings::write_name_links(&links)?;
            snapshot = platform::get_network_snapshot(&backup)?;
        }
    }
    let attention_count = backup
        .keys()
        .filter(|guid| {
            !snapshot
                .networks
                .iter()
                .any(|network| &network.guid == *guid)
        })
        .count();
    let audit = crate::types::RecoveryAudit {
        checked_version: crate::VERSION.into(),
        recovery_record_count: backup.len(),
        attention_count,
        sync_pending_count: snapshot
            .networks
            .iter()
            .filter(|network| network.name_sync_pending)
            .count(),
    };
    settings::storage().write("recovery-audit.json", &audit)?;
    settings::storage().write("update-pending.json", &Option::<String>::None)
}

pub fn get_recovery_audit() -> Result<Option<crate::types::RecoveryAudit>, String> {
    settings::storage().read("recovery-audit.json")
}

pub fn dismiss_recovery_audit() -> Result<(), String> {
    settings::storage().write(
        "recovery-audit.json",
        &Option::<crate::types::RecoveryAudit>::None,
    )
}

pub fn rename(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
    allow_prompt: bool,
) -> Result<(), String> {
    settings::validate_display_name(new_name)?;
    settings::storage().with_lock("network-mutations", || {
        let mut backup = settings::read_backup()?;
        let networks = platform::get_networks(&backup)?;
        let network = networks.iter().find(|network| network.guid == guid)
            .ok_or("This network is no longer available. Refresh the network list.")?;
        if current_name.is_some_and(|name| name != network.name) {
            return Err("The network name changed. Refresh before applying a new name.".into());
        }
        settings::validate_display_name(&network.original_name)
            .map_err(|_| "The original display name cannot be restored safely; this network has not been changed")?;
        let mut links = settings::read_name_links()?;
        if let Some(stable_id) = platform::stable_recovery_id(guid, Some(&network.name))? {
            if links.get(guid).is_some_and(|existing| existing != &stable_id) {
                return Err("This Windows network has a conflicting recovery identity. Refresh before changing it.".into());
            }
            links.insert(guid.into(), stable_id);
            settings::write_name_links(&links)?;
        }
        backup.entry(guid.into()).or_insert_with(|| network.original_name.clone());
        // Recovery data must reach disk before the first OS change.
        settings::write_backup(&backup)?;
        platform::rename_with_mode(guid, new_name, Some(&network.name), allow_prompt)?;
        if backup.get(guid).is_some_and(|name| name == new_name) {
            backup.remove(guid);
            settings::write_backup(&backup)?;
            links.remove(guid);
            settings::write_name_links(&links)?;
        }
        Ok(())
    })
}

pub fn get_name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<Option<crate::types::NameConflict>, String> {
    settings::validate_display_name(new_name)?;
    platform::name_conflict(guid, new_name, current_name)
}

pub fn repair_name_conflict(
    guid: &str,
    new_name: &str,
    current_name: Option<&str>,
) -> Result<(), String> {
    settings::validate_display_name(new_name)?;
    settings::storage().with_lock("network-mutations", || {
        let conflict = platform::name_conflict(guid, new_name, current_name)?
            .ok_or("The saved-profile conflict changed. Refresh and try the name again.")?;
        let mut backup = settings::read_backup()?;
        let networks = platform::get_networks(&backup)?;
        let network = networks
            .iter()
            .find(|network| network.guid == guid)
            .ok_or("This network is no longer available. Refresh the network list.")?;
        if current_name.is_some_and(|name| name != network.name) {
            return Err("The network name changed. Refresh before repairing the conflict.".into());
        }
        let mut links = settings::read_name_links()?;
        if let Some(stable_id) = platform::stable_recovery_id(guid, Some(&network.name))? {
            if links.get(guid).is_some_and(|existing| existing != &stable_id) {
                return Err("This Windows network has a conflicting recovery identity. Refresh before repairing it.".into());
            }
            links.insert(guid.into(), stable_id);
            settings::write_name_links(&links)?;
        }
        backup
            .entry(guid.into())
            .or_insert_with(|| network.original_name.clone());
        backup
            .entry(conflict.conflicting_guid.clone())
            .or_insert(conflict.current_name);
        settings::write_backup(&backup)?;
        #[cfg(windows)]
        if !platform::is_admin() {
            crate::privileged::run(crate::privileged::Request::RepairConflict {
                id: guid.into(),
                name: new_name.into(),
                current_name: current_name.map(str::to_owned),
            })?;
        } else {
            platform::repair_name_conflict(guid, new_name, current_name)?;
        }
        #[cfg(not(windows))]
        platform::repair_name_conflict(guid, new_name, current_name)?;
        if backup
            .get(guid)
            .is_some_and(|original| original == new_name)
        {
            backup.remove(guid);
            links.remove(guid);
            settings::write_backup(&backup)?;
            settings::write_name_links(&links)?;
        }
        Ok(())
    })
}

pub fn restore(guid: &str, current_name: Option<&str>) -> Result<(), String> {
    settings::storage().with_lock("network-mutations", || {
        let mut backup = settings::read_backup()?;
        let original = backup
            .get(guid)
            .ok_or("No original name is saved for this network")?
            .clone();
        platform::rename_with_mode(guid, &original, current_name, true)?;
        backup.remove(guid);
        settings::write_backup(&backup)?;
        let mut links = settings::read_name_links()?;
        links.remove(guid);
        settings::write_name_links(&links)
    })
}

pub fn restore_records(
    backup: &mut HashMap<String, String>,
    mut restore: impl FnMut(&str, &str) -> Result<(), String>,
) -> Vec<String> {
    let mut errors = Vec::new();
    backup.retain(|guid, original| match restore(guid, original) {
        Ok(()) => false,
        Err(error) => {
            errors.push(format!("{guid}: {error}"));
            true
        }
    });
    errors
}

pub fn restore_all() -> Result<(), String> {
    settings::storage().with_lock("network-mutations", || {
        let mut backup = settings::read_backup()?;
        let errors = restore_records(&mut backup, |guid, name| {
            platform::rename_with_mode(guid, name, None, true)
        });
        settings::write_backup(&backup)?;
        let mut links = settings::read_name_links()?;
        links.retain(|guid, _| backup.contains_key(guid));
        settings::write_name_links(&links)?;
        if errors.is_empty() {
            Ok(())
        } else {
            Err(format!(
                "{} network(s) could not be restored. Their original names are still saved. {}",
                errors.len(),
                errors.join("; ")
            ))
        }
    })
}

pub fn import_backup(json: &str) -> Result<(), String> {
    let imported = settings::validate_backup_json(json)?;
    settings::storage().with_lock("network-mutations", || {
        let mut backup = settings::read_backup()?;
        for (guid, original) in imported {
            // An imported file must never silently discard an existing recovery name.
            backup.entry(guid).or_insert(original);
        }
        settings::write_backup(&backup)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partial_restore_keeps_failed_recovery_records() {
        let mut backup = HashMap::from([
            ("good".into(), "Original A".into()),
            ("failed".into(), "Original B".into()),
        ]);
        let errors = restore_records(&mut backup, |guid, _| {
            if guid == "failed" {
                Err("Permission denied".into())
            } else {
                Ok(())
            }
        });
        assert_eq!(backup.len(), 1);
        assert_eq!(backup["failed"], "Original B");
        assert_eq!(errors, ["failed: Permission denied"]);
        assert!(restore_records(&mut backup, |_, _| Ok(())).is_empty());
        assert!(backup.is_empty());
    }

    #[test]
    fn recovery_audits_run_for_the_expected_or_a_newer_installed_version() {
        assert!(!recovery_audit_ready("2.4.1", "2.5.0").unwrap());
        assert!(recovery_audit_ready("2.5.0", "2.5.0").unwrap());
        assert!(recovery_audit_ready("2.6.0", "2.5.0").unwrap());
        assert!(recovery_audit_ready("invalid", "2.5.0").is_err());
    }
}
