import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { SunIcon, MoonIcon, CloseIcon, RestoreIcon, LockIcon, ShieldIcon, BoltIcon } from '../../icons'
import type { ElevationStatus } from '../../types'
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
  const {
    settingsOpen, setSettingsOpen, settings, updateSetting,
    networks, addToast, streamerStatus, elevationStatus, setElevationStatus
  } = useStore()

  const [elevating, setElevating] = useState(false)
  const [trimming, setTrimming] = useState(false)

  useEffect(() => {
    if (settingsOpen) {
      window.nm.getElevationStatus().then(status => {
        setElevationStatus(status)
      }).catch(() => {})
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  const handleSetupTaskElevation = async () => {
    if (elevating) return
    setElevating(true)
    try {
      const res = await window.nm.setupSilentElevation()
      const updated = await window.nm.getElevationStatus()
      setElevationStatus(updated)
      if (res.success) {
        addToast(res.message || 'Zero-prompt elevation task configured!', 'success')
      } else {
        addToast(res.message || 'Failed to configure elevation task', 'error')
      }
    } catch {
      addToast('Error configuring silent elevation', 'error')
    } finally {
      setElevating(false)
    }
  }

  const handleRemoveTaskElevation = async () => {
    if (elevating) return
    setElevating(true)
    try {
      const res = await window.nm.removeSilentElevation()
      const updated = await window.nm.getElevationStatus()
      setElevationStatus(updated)
      if (res.success) {
        addToast(res.message || 'Elevation task removed. Falling back to On-Demand JIT.', 'info')
      } else {
        addToast(res.message || 'Failed to remove elevation task', 'error')
      }
    } catch {
      addToast('Error removing elevation task', 'error')
    } finally {
      setElevating(false)
    }
  }

  const handleTrimMemory = async () => {
    if (trimming) return
    setTrimming(true)
    try {
      await window.nm.trimMemory()
      addToast('Working set memory trimmed to minimum', 'success')
    } catch {
      addToast('Failed to trim memory', 'error')
    } finally {
      setTrimming(false)
    }
  }

  const handleExport = async () => {
    try {
      const json = await window.nm.exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'netmask-backup.json'
      a.click()
      URL.revokeObjectURL(url)
      addToast('Backup exported', 'success')
    } catch { addToast('Export failed', 'error') }
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
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

  const maskStyleOptions = [
    { label: 'Partial (9A:B3:E0:••:••:••)', value: 'partial' as const },
    { label: 'Full (XX:XX:XX:XX:XX:XX)', value: 'full' as const },
  ]

  const tier = elevationStatus?.tier || (elevationStatus?.isElevated ? 'broker' : 'jit')

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
          {/* Privilege & Cascading Elevation */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Privilege & Elevation</div>
            <div className={styles.badgeRow}>
              <div className={styles.toggleLabel}>Cascading Architecture</div>
              <span className={`${styles.badge} ${
                tier === 'task' ? styles.badgeSuccess : tier === 'broker' ? styles.badgeSuccess : styles.badgeWarning
              }`}>
                {tier === 'task'
                  ? 'Zero-Prompt Task Configured'
                  : tier === 'broker'
                  ? 'Elevated Broker Active'
                  : 'On-Demand JIT Elevation'}
              </span>
            </div>

            <Toggle
              label="Silent Admin Elevation"
              sub="Automatically elevate via Windows Task Scheduler without UAC prompts"
              on={settings.silentElevation}
              onChange={v => updateSetting('silentElevation', v)}
            />

            <div className={styles.btnRow}>
              <button
                type="button"
                className={`${styles.elevBtn} ${!elevationStatus?.taskConfigured ? styles.elevBtnPrimary : ''}`}
                disabled={elevating}
                onClick={handleSetupTaskElevation}
              >
                <LockIcon size={13} />
                <span>{elevationStatus?.taskConfigured ? 'Re-register Task' : 'Register Task (1-Click)'}</span>
              </button>
              {elevationStatus?.taskConfigured && !elevationStatus?.isElevated && (
                <button
                  type="button"
                  className={`${styles.elevBtn} ${styles.elevBtnPrimary}`}
                  onClick={() => window.nm.elevate()}
                  title="Switch immediately to the elevated instance with zero prompts"
                >
                  <BoltIcon size={13} />
                  <span>Elevate Silently</span>
                </button>
              )}
              {elevationStatus?.taskConfigured && (
                <button
                  type="button"
                  className={styles.elevBtn}
                  disabled={elevating}
                  onClick={handleRemoveTaskElevation}
                >
                  <span>Remove Task</span>
                </button>
              )}
            </div>
          </div>

          {/* Streamer Safe Mode */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Streamer Safe & Privacy Mode</div>

            <div className={styles.badgeRow}>
              <div className={styles.toggleLabel}>Broadcast Software</div>
              <span className={`${styles.badge} ${streamerStatus.detectedApp ? styles.badgePurple : styles.badgeMuted}`}>
                {streamerStatus.detectedApp ? `● ${streamerStatus.detectedApp} Detected` : 'No broadcast app active'}
              </span>
            </div>

            <div className={styles.badgeRow}>
              <div className={styles.toggleLabel}>Manual Network Cloak</div>
              <button
                type="button"
                className={`${styles.elevBtn} ${streamerStatus.isCloaked ? styles.elevBtnPrimary : ''}`}
                onClick={async () => {
                  try {
                    const s = await window.nm.toggleStreamerCloak()
                    useStore.getState().setStreamerStatus(s)
                    const [nets, conn] = await Promise.all([window.nm.getNetworks(), window.nm.getConnection()])
                    useStore.getState().setNetworks(nets)
                    useStore.getState().setConnection(conn)
                    addToast(s.isCloaked ? 'Stream Safe Cloak Activated' : 'Stream Safe Cloak Deactivated', 'info')
                  } catch {}
                }}
              >
                <ShieldIcon size={13} />
                <span>{streamerStatus.isCloaked ? 'Cloaked (Click to Uncloak)' : 'Cloak Network Now'}</span>
              </button>
            </div>

            <Toggle
              label="Auto-Cloak on Stream"
              sub="Automatically mask network name when OBS, Discord, Zoom, Teams or Twitch Studio is running"
              on={settings.autoCloakStreamer}
              onChange={v => updateSetting('autoCloakStreamer', v)}
            />

            <div className={styles.inputRow}>
              <div className={styles.toggleLabel}>Streamer Cloak Name</div>
              <input
                type="text"
                className={styles.textInput}
                maxLength={40}
                value={settings.streamerMaskName}
                placeholder="StreamSafe-Fiber-Pro"
                onChange={e => updateSetting('streamerMaskName', e.target.value)}
              />
            </div>

            <Toggle
              label="BSSID Cloaking"
              sub="Mask router hardware MAC address to protect against WiGLE geolocation doxing"
              on={settings.bssidCloaking}
              onChange={v => updateSetting('bssidCloaking', v)}
            />

            <div className={styles.selectRow}>
              <div className={styles.toggleLabel}>BSSID Mask Style</div>
              <select
                className={styles.select}
                value={settings.bssidMaskMode}
                onChange={e => updateSetting('bssidMaskMode', e.target.value as 'full' | 'partial')}
              >
                {maskStyleOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Performance & Memory */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Performance & Memory</div>
            <Toggle
              label="Ultra-Low Memory Mode"
              sub="Disable GPU hardware acceleration completely. Reduces active RAM to <30-40MB. (Requires restart)"
              on={settings.ultraLowMemory}
              onChange={v => {
                updateSetting('ultraLowMemory', v)
                addToast(v ? 'Ultra-Low Memory Mode enabled (takes effect on restart)' : 'Standard GPU mode enabled (takes effect on restart)', 'info')
              }}
            />
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.elevBtn}
                disabled={trimming}
                onClick={handleTrimMemory}
                title="Trims process working set and runs immediate garbage collection"
              >
                <BoltIcon size={13} color="var(--accent)" />
                <span>Trim Memory Now</span>
              </button>
            </div>
          </div>

          {/* General */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>General</div>
            <Toggle
              label="Launch on startup"
              sub="Start NetMask when your computer starts"
              on={settings.launchOnStartup}
              onChange={v => updateSetting('launchOnStartup', v)}
            />
            <Toggle
              label="Minimize to tray on close"
              sub="Keep running lightweight in the system tray"
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
            <div className={styles.sectionLabel}>Data & Backups</div>
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
              <div className={styles.aboutSub}>Cross-platform network identity & RF diagnostics utility</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
