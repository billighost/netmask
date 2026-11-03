import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { NetworkDetails } from '../../types'
import { CloseIcon, WifiIcon, CopyIcon, EyeIcon, EyeOffIcon, ShieldIcon, QrCodeIcon } from '../../icons'
import styles from './NetworkDetailsModal.module.css'

function formatBssid(bssid?: any, cloaked = true, mode: 'full' | 'partial' = 'partial', peek = false): string {
  if (!bssid || typeof bssid !== 'string' || bssid === 'Saved Profile' || bssid === 'Active Interface' || bssid === 'Saved Network') {
    return typeof bssid === 'string' ? bssid : 'Unknown'
  }
  if (!cloaked || peek) {
    return bssid.toUpperCase()
  }
  if (mode === 'full') {
    return 'XX:XX:XX:XX:XX:XX'
  }
  const parts = bssid.trim().split(/[:-]/)
  if (parts.length === 6) {
    return `${parts[0].toUpperCase()}:${parts[1].toUpperCase()}:${parts[2].toUpperCase()}:••:••:••`
  }
  return 'XX:XX:XX:XX:XX:XX'
}

function safeRate(rate?: any): number {
  if (typeof rate === 'number') return isNaN(rate) ? 0 : rate
  if (typeof rate === 'string') {
    const parsed = parseFloat(rate)
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export const NetworkDetailsModal: React.FC = () => {
  // Unconditionally call all hooks at the very top of the component (Rules of Hooks)
  const detailsModalGuid = useStore(s => s.detailsModalGuid)
  const setDetailsModalGuid = useStore(s => s.setDetailsModalGuid)
  const settings = useStore(s => s.settings)
  const bssidPeek = useStore(s => s.bssidPeek)
  const peekBssid = useStore(s => s.peekBssid)
  const addToast = useStore(s => s.addToast)
  const connection = useStore(s => s.connection)
  const setWifiShareModalProfile = useStore(s => s.setWifiShareModalProfile)
  const networks = useStore(s => s.networks)

  const [details, setDetails] = useState<NetworkDetails | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!detailsModalGuid) {
      setDetails(null)
      return
    }

    let active = true
    setLoading(true)
    window.nm.getDetails(detailsModalGuid)
      .then(d => {
        if (active) {
          setDetails(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [detailsModalGuid])

  // Early return only after all hooks are declared
  if (!detailsModalGuid) return null

  const handleCopyBssid = () => {
    const rawBssid = details?.bssid || connection?.bssid
    if (!rawBssid) return

    const isProtected = settings?.bssidCloaking && !bssidPeek
    const textToCopy = formatBssid(rawBssid, isProtected, settings?.bssidMaskMode, bssidPeek)
    navigator.clipboard.writeText(textToCopy)
    if (isProtected) {
      addToast(`Copied cloaked BSSID "${textToCopy}" (Streamer Safe)`, 'info')
    } else {
      addToast('Copied real BSSID to clipboard', 'success')
    }
  }

  const targetNetwork = networks.find(n => n.guid === detailsModalGuid || n.name === detailsModalGuid)
  const isTargetLive = Boolean(
    targetNetwork ? targetNetwork.live : (
      connection && (
        connection.profile === detailsModalGuid ||
        connection.name === detailsModalGuid ||
        connection.ssid === detailsModalGuid
      )
    )
  )

  const displayName = targetNetwork ? targetNetwork.name : (details?.guid || detailsModalGuid)
  const rawBssid = isTargetLive ? (details?.bssid || connection?.bssid) : details?.bssid
  const displayBssid = formatBssid(rawBssid, settings?.bssidCloaking, settings?.bssidMaskMode, bssidPeek)
  const generation = isTargetLive ? (details?.generation || connection?.generation || 'Wi-Fi') : (details?.generation || 'Wi-Fi')
  const signalDbm = isTargetLive ? (details?.signalDbm ?? connection?.signalDbm) : undefined
  const snr = isTargetLive ? (details?.snr ?? connection?.snr) : undefined
  const channel = isTargetLive ? (details?.channel || connection?.channel || 0) : (details?.channel || 0)
  const band = isTargetLive ? (details?.band || connection?.band || 'Wi-Fi') : (details?.band || 'Saved Profile')
  const rxRate = isTargetLive ? (details?.rxRateMbps || connection?.rxRateMbps) : undefined
  const txRate = isTargetLive ? (details?.txRateMbps || connection?.txRateMbps) : undefined

  const rxNum = safeRate(rxRate)
  const txNum = safeRate(txRate || rxRate)
  const linkRateDisplay = isTargetLive && rxNum > 0
    ? `↓${rxNum.toFixed(0)} / ↑${txNum.toFixed(0)}M`
    : isTargetLive
    ? 'Negotiating'
    : 'Offline'

  const signalClass = signalDbm !== undefined
    ? signalDbm >= -65
      ? styles.metricGreen
      : signalDbm >= -78
      ? styles.metricAmber
      : styles.metricRed
    : ''

  return (
    <div className={styles.scrim} onClick={() => setDetailsModalGuid(null)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <WifiIcon size={16} color="var(--accent)" />
            <span className={styles.title}>Physical Layer RF Diagnostics</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setDetailsModalGuid(null)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.netHeader}>
            <div className={styles.netName}>{displayName}</div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span className={styles.genBadge}>{generation}</span>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => setWifiShareModalProfile(displayName)}
                title="Share Wi-Fi via Encrypted QR Code"
              >
                <QrCodeIcon size={12} color="#34d399" />
                <span>Share</span>
              </button>
            </div>
          </div>

          <div className={styles.grid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Signal Strength</div>
              <div className={`${styles.metricValue} ${signalClass}`}>
                {isTargetLive ? (signalDbm !== undefined ? `${signalDbm} dBm` : `${connection?.signal ?? 0}%`) : 'Inactive'}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Signal-to-Noise (SNR)</div>
              <div className={styles.metricValue}>
                {isTargetLive ? (snr !== undefined ? `${snr} dB` : 'Optimal') : '—'}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Channel & Band</div>
              <div className={styles.metricValue}>
                {channel > 0 ? `Ch ${channel}` : 'Auto'} · {band}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Link Rates</div>
              <div className={styles.metricValue}>
                {linkRateDisplay}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Authentication</div>
              <div className={styles.metricValue} style={{ fontSize: '12px' }}>
                {details?.auth || 'WPA2/WPA3 Personal'}
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>State</div>
              <div className={styles.metricValue} style={{ fontSize: '12px', color: isTargetLive ? 'var(--green)' : 'var(--text-muted)' }}>
                {isTargetLive ? 'Active now' : (details?.lastConnected || 'Saved Profile')}
              </div>
            </div>

            {rawBssid && (
              <div className={styles.bssidCard}>
                <div className={styles.bssidLeft}>
                  <div className={styles.metricLabel}>BSSID (Access Point MAC)</div>
                  <div className={styles.bssidValue}>{displayBssid}</div>
                </div>
                <div className={styles.bssidActions}>
                  {settings?.bssidCloaking && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={peekBssid}
                      title={bssidPeek ? 'Real BSSID visible' : 'Peek real BSSID (3s)'}
                    >
                      {bssidPeek ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={handleCopyBssid}
                    title="Copy BSSID"
                  >
                    <CopyIcon size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.notice}>
            <ShieldIcon size={13} color="#c084fc" style={{ marginRight: '5px', verticalAlign: 'text-bottom' }} />
            <strong>Streamer Safe Advice:</strong> BSSID addresses uniquely identify your physical router hardware on global geolocation databases (e.g. WiGLE.net). Keep BSSID cloaking enabled while screen-sharing or broadcasting.
          </div>
        </div>
      </div>
    </div>
  )
}
