use crate::{platform, settings};
use std::collections::HashMap;

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
        backup.entry(guid.into()).or_insert_with(|| network.original_name.clone());
        // Recovery data must reach disk before the first OS change.
        settings::write_backup(&backup)?;
        platform::rename_with_mode(guid, new_name, Some(&network.name), allow_prompt)?;
        if backup.get(guid).is_some_and(|name| name == new_name) {
            backup.remove(guid);
            settings::write_backup(&backup)?;
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
        settings::write_backup(&backup)
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
}
