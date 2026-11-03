import React from 'react'
import { useStore } from '../../store'
import { SunIcon, MoonIcon, CloseIcon, RestoreIcon } from '../../icons'
import styles from './SettingsModal.module.css'

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }> = ({ on, onChange, label, sub }) => (
  <div className={styles.toggleRow} onClick={() => onChange(!on)}>
    <div>
      <div className={styles.toggleLabel}>{label}</div>
      {sub && <div className={styles.toggleSub}>{sub}</div>}
    </div>
    <button
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={e => { e.stopPropagation(); onChange(!on) }}
      role="switch"
      aria-checked={on}
    >
      <span className={styles.toggleThumb} />
    </button>
  </div>
)

export const SettingsModal: React.FC = () => {
  const { settingsOpen, setSettingsOpen, settings, updateSetting, networks, addToast } = useStore()
  if (!settingsOpen) return null

  const handleExport = async () => {
    try {
      const json = await window.nm.exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'netmask-backup.json'; a.click()
      URL.revokeObjectURL(url)
      addToast('Backup exported', 'success')
    } catch { addToast('Export failed', 'error') }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      try {
        const text = await file.text()
        await window.nm.importBackup(text)
        addToast('Backup imported', 'success')
      } catch { addToast('Import failed — invalid file', 'error') }
    }
    input.click()
  }

  const handleRestoreAll = async () => {
    const renamedCount = networks.filter(n => n.renamed).length
    if (!renamedCount) { addToast('No renamed networks to restore', 'info'); return }
    try {
      await window.nm.restoreAll()
      const [nets, conn] = await Promise.all([window.nm.getNetworks(), window.nm.getConnection()])
      useStore.getState().setNetworks(nets)
      useStore.getState().setConnection(conn)
      addToast(`Restored ${renamedCount} network${renamedCount > 1 ? 's' : ''}`, 'success')
    } catch { addToast('Restore all failed', 'error') }
  }

  const intervalOptions = [
    { label: '10 seconds', value: 10 },
    { label: '30 seconds', value: 30 },
    { label: '1 minute', value: 60 },
    { label: 'Off', value: 0 },
  ]

  return (
    <div className={styles.scrim} onClick={() => setSettingsOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Settings</div>
          <button className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          {/* General */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>General</div>
            <Toggle
              label="Launch on startup"
              sub="Start NetMask when Windows starts"
              on={settings.launchOnStartup}
              onChange={v => updateSetting('launchOnStartup', v)}
            />
            <Toggle
              label="Minimize to tray on close"
              sub="Keep running in the system tray"
              on={settings.minimizeToTray}
              onChange={v => updateSetting('minimizeToTray', v)}
            />
            <div className={styles.selectRow}>
              <div className={styles.toggleLabel}>Auto-refresh interval</div>
              <select
                className={styles.select}
                value={settings.autoRefreshInterval}
                onChange={e => updateSetting('autoRefreshInterval', Number(e.target.value))}
              >
                {intervalOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Appearance */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Appearance</div>
            <div className={styles.themeRow}>
              <div className={styles.toggleLabel}>Theme</div>
              <div className={styles.themePill}>
                <button
                  className={`${styles.themeOpt} ${settings.theme === 'dark' ? styles.themeActive : ''}`}
                  onClick={() => updateSetting('theme', 'dark')}
                >
                  <MoonIcon size={13} />
                  <span>Dark</span>
                </button>
                <button
                  className={`${styles.themeOpt} ${settings.theme === 'light' ? styles.themeActive : ''}`}
                  onClick={() => updateSetting('theme', 'light')}
                >
                  <SunIcon size={13} />
                  <span>Light</span>
                </button>
              </div>
            </div>
            <Toggle
              label="Show Ethernet profiles"
              sub="Display Ethernet entries in the network list"
              on={settings.showEthernet}
              onChange={v => updateSetting('showEthernet', v)}
            />
          </div>

          {/* Data */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Data</div>
            <div className={styles.dataRow}>
              <button className={styles.dataBtn} onClick={handleExport}>Export backup</button>
              <button className={styles.dataBtn} onClick={handleImport}>Import backup</button>
            </div>
            <button className={`${styles.dataBtn} ${styles.dataBtnDanger}`} onClick={handleRestoreAll}>
              <RestoreIcon size={13} />
              Restore all networks to original names
            </button>
          </div>

          {/* About */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>About</div>
            <div className={styles.about}>
              <div className={styles.aboutName}>NetMask <span>v2.0</span></div>
              <div className={styles.aboutSub}>Network display name manager for Windows</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

