import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { DeviceIdentity } from '../../types'
import { CloseIcon, ShieldIcon, CopyIcon, BoltIcon, CheckIcon, EyeIcon, EyeOffIcon, RefreshIcon } from '../../icons'
import styles from './DeviceIdentityModal.module.css'

export const DeviceIdentityModal: React.FC = () => {
  const {
    privacyCloakModalOpen, setPrivacyCloakModalOpen,
    deviceIdentity, setDeviceIdentity,
    connection, addToast
  } = useStore()

  const [loading, setLoading] = useState(false)
  const [updatingMac, setUpdatingMac] = useState(false)
  const [updatingNetbios, setUpdatingNetbios] = useState(false)
  const [copiedMac, setCopiedMac] = useState(false)
  const [copiedHost, setCopiedHost] = useState(false)

  const fetchIdentity = async () => {
    setLoading(true)
    try {
      const id = await window.nm.getDeviceIdentity()
      setDeviceIdentity(id)
    } catch {
      addToast('Failed to load device identity', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (privacyCloakModalOpen) {
      fetchIdentity()
    }
  }, [privacyCloakModalOpen])

  if (!privacyCloakModalOpen) return null

  const handleCopy = (text: string, type: 'mac' | 'host') => {
    navigator.clipboard.writeText(text)
    if (type === 'mac') {
      setCopiedMac(true)
      setTimeout(() => setCopiedMac(false), 2000)
      addToast(`Copied MAC address "${text}"`, 'info')
    } else {
      setCopiedHost(true)
      setTimeout(() => setCopiedHost(false), 2000)
      addToast(`Copied device hostname "${text}"`, 'info')
    }
  }

  const handleToggleRandomization = async (mode: 'yes' | 'no' | 'daily') => {
    const profile = deviceIdentity?.activeProfile || connection?.profile || connection?.ssid
    if (!profile) {
      addToast('No active Wi-Fi profile connected to configure MAC randomization', 'info')
      return
    }

    setUpdatingMac(true)
    try {
      const ok = await window.nm.setMacRandomization(profile, mode)
      if (ok) {
        addToast(
          mode === 'daily'
            ? 'MAC Address set to Randomize Daily!'
            : mode === 'yes'
            ? 'MAC Address Randomization Enabled!'
            : 'MAC Address Randomization Disabled',
          'success'
        )
        await fetchIdentity()
      } else {
        addToast('Failed to update MAC randomization setting', 'error')
      }
    } catch {
      addToast('Error updating MAC randomization', 'error')
    } finally {
      setUpdatingMac(false)
    }
  }

  const handleToggleNetbios = async () => {
    const nextState = !deviceIdentity?.netbiosSilenced
    setUpdatingNetbios(true)
    try {
      const ok = await window.nm.setNetbiosSilencer(nextState)
      if (ok) {
        addToast(
          nextState
            ? 'NetBIOS Broadcast Silencer Enabled! Hostname is hidden from UDP 137 LAN scans.'
            : 'NetBIOS Broadcast Silencer Disabled',
          'success'
        )
        await fetchIdentity()
      } else {
        addToast('Failed to toggle NetBIOS silencer. Elevation may be required.', 'error')
      }
    } catch {
      addToast('Error setting NetBIOS options', 'error')
    } finally {
      setUpdatingNetbios(false)
    }
  }

  const handleFullCloak = async () => {
    const profile = deviceIdentity?.activeProfile || connection?.profile || connection?.ssid
    addToast('Activating Full Hotspot Identity Cloak...', 'info')
    try {
      if (profile) {
        await window.nm.setMacRandomization(profile, 'yes')
      }
      await window.nm.setNetbiosSilencer(true)
      const streamer = await window.nm.toggleStreamerCloak()
      useStore.getState().setStreamerStatus(streamer)
      await fetchIdentity()
      addToast('Full Hotspot Stealth Cloak is active! MAC randomized & NetBIOS silenced.', 'success')
    } catch {
      addToast('Error activating stealth cloak', 'error')
    }
  }

  const isSilenced = deviceIdentity?.netbiosSilenced ?? false
  const macMode = deviceIdentity?.macRandomization ?? 'unknown'

  return (
    <div className={styles.scrim} onClick={() => setPrivacyCloakModalOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <ShieldIcon size={16} color="#c084fc" />
            <span className={styles.title}>Hotspot Device Identity & Privacy Cloak</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setPrivacyCloakModalOpen(false)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Identity Card */}
          <div className={styles.identityCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Local Network Hardware Footprint</span>
              <button
                type="button"
                className={styles.refreshBtn}
                onClick={fetchIdentity}
                disabled={loading}
                title="Refresh hardware parameters"
              >
                <RefreshIcon size={12} />
              </button>
            </div>

            <div className={styles.row}>
              <div className={styles.rowLeft}>
                <span className={styles.rowLabel}>Device Hostname</span>
                <span className={styles.rowValue}>{deviceIdentity?.hostname || 'Unknown'}</span>
              </div>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => handleCopy(deviceIdentity?.hostname || '', 'host')}
                title="Copy hostname"
              >
                {copiedHost ? <CheckIcon size={13} color="var(--green)" /> : <CopyIcon size={13} />}
              </button>
            </div>

            <div className={styles.row}>
              <div className={styles.rowLeft}>
                <span className={styles.rowLabel}>Physical MAC Address ({deviceIdentity?.interfaceName || 'Wi-Fi'})</span>
                <span className={styles.rowValue}>{deviceIdentity?.macAddress || '00:00:00:00:00:00'}</span>
              </div>
              <button
                type="button"
                className={styles.copyBtn}
                onClick={() => handleCopy(deviceIdentity?.macAddress || '', 'mac')}
                title="Copy physical MAC"
              >
                {copiedMac ? <CheckIcon size={13} color="var(--green)" /> : <CopyIcon size={13} />}
              </button>
            </div>
          </div>

          {/* MAC Address Randomization Control */}
          <div className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <span className={styles.sectionTitle}>MAC Address Randomization Control</span>
              <span className={`${styles.statusBadge} ${
                macMode === 'enabled' || macMode === 'daily' ? styles.badgeSuccess : styles.badgeMuted
              }`}>
                {macMode === 'daily' ? 'Randomize Daily' : macMode === 'enabled' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className={styles.sectionSub}>
              Configures hardware MAC address randomization for profile "{deviceIdentity?.activeProfile || connection?.name || 'Active'}" to prevent tracking across public hotspots.
            </div>

            <div className={styles.btnGroup}>
              <button
                type="button"
                className={`${styles.pillBtn} ${macMode === 'disabled' ? styles.pillBtnActive : ''}`}
                disabled={updatingMac}
                onClick={() => handleToggleRandomization('no')}
              >
                Disabled
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${macMode === 'enabled' ? styles.pillBtnActive : ''}`}
                disabled={updatingMac}
                onClick={() => handleToggleRandomization('yes')}
              >
                Enabled
              </button>
              <button
                type="button"
                className={`${styles.pillBtn} ${macMode === 'daily' ? styles.pillBtnActive : ''}`}
                disabled={updatingMac}
                onClick={() => handleToggleRandomization('daily')}
              >
                Daily
              </button>
            </div>
          </div>

          {/* NetBIOS LAN Broadcast Silencer */}
          <div className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <div>
                <span className={styles.sectionTitle}>NetBIOS LAN Broadcast Silencer</span>
                <div className={styles.sectionSub}>
                  Suppresses NetBIOS-over-TCP/IP (UDP port 137). Stops your PC's hostname from broadcasting to everyone on the router or subnet.
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSilenced}
                className={`${styles.switch} ${isSilenced ? styles.switchOn : ''}`}
                disabled={updatingNetbios}
                onClick={handleToggleNetbios}
              >
                <span className={styles.switchThumb} />
              </button>
            </div>
          </div>

          {/* Quick Stealth Action */}
          <div className={styles.actionCard}>
            <div className={styles.actionText}>
              <div className={styles.actionTitle}>1-Click Hotspot Stealth Disguise</div>
              <div className={styles.actionSub}>
                Enables MAC randomization, silences NetBIOS hostname broadcasts, and masks network display name.
              </div>
            </div>
            <button
              type="button"
              className={styles.stealthBtn}
              onClick={handleFullCloak}
              title="Activate full privacy cloaking"
            >
              <BoltIcon size={14} />
              <span>Activate Stealth</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

