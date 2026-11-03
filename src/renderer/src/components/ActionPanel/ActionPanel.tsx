import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { WifiIcon, CheckIcon, RestoreIcon, RefreshIcon, LockIcon } from '../../icons'
import styles from './ActionPanel.module.css'

export const ActionPanel: React.FC = () => {
  const { networks, selectedGuid, adminOk, addToast, setNetworks, setConnection, setAdminOk } = useStore()
  const net = networks.find(n => n.guid === selectedGuid) || null
  const [inputVal, setInputVal] = useState(net?.name ?? '')
  const [applying, setApplying] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputVal(net?.name ?? '')
    if (net && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [selectedGuid, net?.guid])

  const preview = inputVal.trim() || net?.name || 'Wi-Fi Network'
  const unchanged = inputVal.trim() === net?.name
  const disabled = !net || !inputVal.trim() || unchanged

  const refresh = async () => {
    try {
      const [nets, conn, admin] = await Promise.all([
        window.nm.getNetworks(),
        window.nm.getConnection(),
        window.nm.isAdmin()
      ])
      setNetworks(nets)
      setConnection(conn)
      setAdminOk(admin)
    } catch {}
  }

  const handleApply = async () => {
    if (!net) {
      addToast('Please select a network first', 'info')
      return
    }
    if (unchanged) {
      addToast('Name is unchanged. Enter a new name to apply.', 'info')
      return
    }
    if (disabled || applying) return

    setApplying(true)
    const newName = inputVal.trim()
    try {
      await window.nm.rename(net.guid, newName, net.name)
      await refresh()

      if (net.live) {
        addToast(`Renamed to "${newName}"! Windows taskbar and Wi-Fi list updated.`, 'success')
      } else {
        addToast(`Renamed "${net.originalName}" to "${newName}" in Windows`, 'success')
      }
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('cancel') || msg.includes('cancelled') || msg.includes('canceled')) {
        addToast('Rename canceled. Administrator privileges were not granted.', 'info')
      } else if (msg.includes('Access is denied') || msg.includes('denied')) {
        addToast('Administrator permission required to rename networks in Windows', 'error')
      } else {
        addToast(msg || 'Failed to rename network', 'error')
      }
    } finally {
      setApplying(false)
    }
  }

  const handleRestore = async () => {
    if (!net || restoring) return
    setRestoring(true)
    const tid = addToast('Restoring original name...', 'loading')
    try {
      await window.nm.restore(net.guid, net.name)
      await refresh()
      useStore.getState().removeToast(tid)
      addToast(`Restored original name "${net.originalName}" everywhere`, 'success')
    } catch {
      useStore.getState().removeToast(tid)
      addToast('Failed to restore original name', 'error')
    } finally {
      setRestoring(false)
    }
  }

  const handleReconnect = async () => {
    if (!net?.live) {
      addToast('Only the currently connected Wi-Fi can be reconnected', 'info')
      return
    }
    if (reconnecting) return
    setReconnecting(true)
    const tid = addToast('Reconnecting Wi-Fi...', 'loading')
    try {
      const ok = await window.nm.reconnect(net.name)
      useStore.getState().removeToast(tid)
      if (ok) {
        addToast('Reconnected successfully', 'success')
      } else {
        addToast('Failed to reconnect. Check Wi-Fi is within range.', 'error')
      }
      await refresh()
    } catch {
      useStore.getState().removeToast(tid)
      addToast('Failed to reconnect Wi-Fi', 'error')
    } finally {
      setReconnecting(false)
    }
  }

  const handleElevate = async () => {
    try {
      await window.nm.elevate()
    } catch {}
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.label}>
          <span>Rename Network</span>
        </div>
        {net ? (
          <div className={styles.targetBadge} title={`Original SSID: ${net.originalName}`}>
            <WifiIcon size={12} color="var(--accent)" />
            <span className={styles.targetName}>{net.name}</span>
            {net.live && <span className={styles.liveBadge}>Active</span>}
          </div>
        ) : (
          <span className={styles.noSelectionText}>No network selected</span>
        )}
      </div>

      <div className={styles.inputWrap}>
        <input
          id="rename-network-input"
          ref={inputRef}
          className={styles.input}
          type="text"
          maxLength={60}
          spellCheck={false}
          placeholder={net ? `Type new name for "${net.name}"…` : 'Click a network above first'}
          value={inputVal}
          disabled={!net}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              handleApply()
            }
          }}
        />
      </div>

      {/* Windows Preview Card */}
      <div className={styles.previewBox}>
        <div className={styles.previewLeft}>
          <WifiIcon size={13} color="var(--accent)" />
          <span className={styles.previewLabel}>Windows Wi-Fi will show:</span>
          <strong className={styles.previewName}>{preview}</strong>
        </div>
        <span className={styles.previewStatus}>
          {net?.live ? 'Connected' : 'Available'}
        </span>
      </div>

      {/* Admin Notice if un-elevated */}
      {!adminOk && (
        <div className={styles.adminNotice}>
          <LockIcon size={13} />
          <span className={styles.adminText}>
            Windows requires administrator access to save network names. You will be prompted on apply.
          </span>
          <button type="button" className={styles.adminBtn} onClick={handleElevate}>
            Elevate now
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className={styles.btns}>
        <button
          id="apply-rename-btn"
          className={`${styles.btn} ${styles.btnPrimary}`}
          disabled={disabled || applying}
          onClick={handleApply}
          title={
            unchanged
              ? 'Type a new name above to apply'
              : !adminOk
              ? 'Apply name (will prompt for administrator access)'
              : 'Apply new display name to Windows registry'
          }
        >
          {applying ? <span className={styles.spinner} /> : <CheckIcon size={14} />}
          <span>{applying ? 'Applying…' : 'Apply name'}</span>
          {!applying && !disabled && <span className={styles.kbd}>↵</span>}
        </button>

        <button
          className={styles.btn}
          disabled={!net?.renamed || restoring}
          onClick={handleRestore}
          title={
            net?.renamed
              ? `Restore original SSID: "${net?.originalName}"`
              : 'Network is already using its original name'
          }
        >
          {restoring ? <span className={styles.spinner} /> : <RestoreIcon size={14} />}
          <span>{restoring ? 'Restoring…' : 'Restore original'}</span>
        </button>

        <button
          className={styles.btn}
          disabled={!net?.live || reconnecting}
          onClick={handleReconnect}
          title="Reconnect to force Windows taskbar to refresh Wi-Fi names"
        >
          {reconnecting ? <span className={styles.spinner} /> : <RefreshIcon size={14} />}
          <span>{reconnecting ? 'Reconnecting…' : 'Reconnect'}</span>
        </button>
      </div>
    </div>
  )
}
