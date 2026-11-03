import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore, getSpeedRingBuffer } from '../../store'
import { WifiIcon, InfoIcon, ArrowDownIcon, ArrowUpIcon, CopyIcon, EyeIcon, EyeOffIcon, ShieldIcon } from '../../icons'
import { SpeedInfoPanel } from '../SpeedInfoPanel/SpeedInfoPanel'
import styles from './HeroCard.module.css'

function formatSpeed(mbps: number, kbps?: number): { value: string; unit: string } {
  if (mbps < 0.0005 && (!kbps || kbps < 1)) return { value: '0', unit: 'KB/s' }
  if (mbps < 1) {
    const kb = kbps !== undefined ? kbps : Math.round(mbps * 1024)
    return { value: String(Math.max(1, kb)), unit: 'KB/s' }
  }
  if (mbps >= 1000) return { value: (mbps / 1024).toFixed(2), unit: 'GB/s' }
  return { value: mbps >= 10 ? mbps.toFixed(1) : mbps.toFixed(2), unit: 'MB/s' }
}

function formatBssid(bssid?: string, cloaked = true, mode: 'full' | 'partial' = 'partial', peek = false): string {
  if (!bssid || bssid === 'Saved Profile' || bssid === 'Active Interface' || bssid === 'Saved Network') {
    return bssid || 'Connected'
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

const Sparkline: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const speedTick = useStore(s => s.speedTick)

  const draw = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const buffer = getSpeedRingBuffer()
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    let maxVal = 0.5
    for (let i = 0; i < 60; i++) {
      if (buffer[i] > maxVal) maxVal = buffer[i]
    }

    const peak = Math.max(maxVal, 0.1)
    const pts = []
    for (let i = 0; i < 60; i++) {
      pts.push({
        x: (i / 59) * w,
        y: h - (buffer[i] / peak) * (h - 4) - 2
      })
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(79,142,247,0.35)')
    grad.addColorStop(1, 'rgba(79,142,247,0)')

    ctx.beginPath()
    ctx.moveTo(pts[0].x, h)
    pts.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(pts[pts.length - 1].x, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Smooth sparkline path
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.strokeStyle = 'rgba(79,142,247,0.85)'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [])

  useEffect(() => {
    draw()
  }, [speedTick, draw])

  useEffect(() => {
    const handleVis = () => {
      if (!document.hidden) draw()
    }
    document.addEventListener('visibilitychange', handleVis)
    return () => document.removeEventListener('visibilitychange', handleVis)
  }, [draw])

  return <canvas ref={canvasRef} className={styles.sparkline} width={200} height={40} />
}

const SpeedDisplay: React.FC<{ onToggleInfo: () => void; infoOpen: boolean }> = ({ onToggleInfo, infoOpen }) => {
  // Selective Zustand subscriptions: re-render ONLY this lightweight element every second
  const downMBps = useStore(s => s.speed.downMBps)
  const upMBps = useStore(s => s.speed.upMBps)
  const downKbps = useStore(s => s.speed.downKbps)
  const upKbps = useStore(s => s.speed.upKbps)

  const down = formatSpeed(downMBps, downKbps)
  const up = formatSpeed(upMBps, upKbps)

  return (
    <div className={styles.speedRow}>
      <div className={styles.speedItem}>
        <div className={styles.speedLabel}>
          <ArrowDownIcon size={13} color="var(--green)" />
          <span>Download</span>
        </div>
        <div className={styles.speedValue}>
          <span className={styles.speedNum}>{down.value}</span>
          <span className={styles.speedUnit}>{down.unit}</span>
        </div>
      </div>

      <div className={styles.speedDivider} />

      <div className={styles.speedItem}>
        <div className={styles.speedLabel}>
          <ArrowUpIcon size={13} color="var(--accent)" />
          <span>Upload</span>
        </div>
        <div className={styles.speedValue}>
          <span className={styles.speedNum}>{up.value}</span>
          <span className={styles.speedUnit}>{up.unit}</span>
        </div>
      </div>

      <button
        className={styles.infoBtn}
        title="Connection capabilities & speed test"
        onClick={onToggleInfo}
      >
        <InfoIcon size={15} color={infoOpen ? 'var(--accent)' : 'var(--text-muted)'} />
      </button>
    </div>
  )
}

export const HeroCard: React.FC = () => {
  const connection = useStore(s => s.connection)
  const streamerStatus = useStore(s => s.streamerStatus)
  const settings = useStore(s => s.settings)
  const bssidPeek = useStore(s => s.bssidPeek)
  const peekBssid = useStore(s => s.peekBssid)
  const setDetailsModalGuid = useStore(s => s.setDetailsModalGuid)
  const addToast = useStore(s => s.addToast)

  const [infoOpen, setInfoOpen] = useState(false)

  const handleToggleStreamerCloak = async () => {
    try {
      const s = await window.nm.toggleStreamerCloak()
      useStore.getState().setStreamerStatus(s)
      const [nets, conn] = await Promise.all([window.nm.getNetworks(), window.nm.getConnection()])
      useStore.getState().setNetworks(nets)
      useStore.getState().setConnection(conn)
      addToast(s.isCloaked ? 'Stream Safe Cloak Activated' : 'Stream Safe Cloak Deactivated', 'info')
    } catch {
      addToast('Failed to toggle Stream Safe cloak', 'error')
    }
  }

  const handleCopyBssid = useCallback(() => {
    if (!connection?.bssid) {
      addToast('No BSSID available', 'info')
      return
    }
    const isProtected = settings.bssidCloaking && !bssidPeek
    const textToCopy = formatBssid(connection.bssid, isProtected, settings.bssidMaskMode, bssidPeek)
    navigator.clipboard.writeText(textToCopy)
    if (isProtected) {
      addToast(`Copied cloaked BSSID "${textToCopy}" (Streamer Safe)`, 'info')
    } else {
      addToast('Copied real BSSID to clipboard', 'success')
    }
  }, [connection?.bssid, settings.bssidCloaking, settings.bssidMaskMode, bssidPeek, addToast])

  const signalDbmClass = connection?.signalDbm !== undefined
    ? connection.signalDbm >= -65
      ? styles.rfBadgeSignalGreen
      : connection.signalDbm >= -78
      ? styles.rfBadgeSignalAmber
      : styles.rfBadgeSignalRed
    : ''

  const isRenamed = Boolean(connection && connection.name !== connection.ssid)

  return (
    <div className={`${styles.card} surface-noise`}>
      {/* Connection status row */}
      <div className={styles.statusRow}>
        <span className={`${styles.dot} ${connection ? styles.dotLive : styles.dotOff}`} />
        <span className={styles.statusText}>
          {connection ? 'Connected' : 'Not connected'}
        </span>
        {connection && (
          <div className={styles.metaBadges}>
            {connection.generation && (
              <span className={`${styles.rfBadge} ${styles.rfBadgeGen}`}>{connection.generation}</span>
            )}
            <span className={styles.band}>{connection.band}</span>
            {connection.rxRateMbps && (
              <span className={styles.linkRate}>{connection.rxRateMbps.toFixed(0)} Mbps</span>
            )}
          </div>
        )}
      </div>

      {/* Network display name */}
      <div className={styles.netName}>
        {connection ? connection.name : 'No Wi-Fi'}
      </div>

      {/* Streamer Safe Active Badge */}
      {streamerStatus.isCloaked && (
        <button
          type="button"
          className={styles.streamerBadge}
          onClick={handleToggleStreamerCloak}
          title="Stream Safe Active. Click to uncloak immediately."
        >
          <span className={styles.streamerDot} />
          <span>
            Stream Safe: {streamerStatus.detectedApp ? `${streamerStatus.detectedApp} Detected` : 'Active'}
          </span>
        </button>
      )}

      {/* Streamer Cooldown Badge */}
      {streamerStatus.cooldownSeconds > 0 && !streamerStatus.detectedApp && (
        <button
          type="button"
          className={`${styles.streamerBadge} ${styles.cooldownBadge}`}
          onClick={handleToggleStreamerCloak}
          title="Stream closed. Cooldown active. Click to restore original name immediately."
        >
          <span className={styles.streamerDot} />
          <span>Stream Safe: Restoring in {streamerStatus.cooldownSeconds}s</span>
        </button>
      )}

      {/* Real SSID indicator */}
      {connection && isRenamed && (
        <div className={styles.realName}>
          Real SSID: <strong>{connection.ssid}</strong>
          &nbsp;&nbsp;
          <span className={styles.shieldBadge}>Masked</span>
        </div>
      )}
      {connection && !isRenamed && (
        <div className={styles.realName}>Showing real network name</div>
      )}

      {/* RF Physical Layer Diagnostics Badges */}
      {connection && (
        <div className={styles.rfGrid}>
          {connection.signalDbm !== undefined && (
            <span className={`${styles.rfBadge} ${signalDbmClass}`} title="Wi-Fi Signal Strength in dBm">
              {connection.signalDbm} dBm
            </span>
          )}
          {connection.snr !== undefined && (
            <span className={styles.rfBadge} title="Signal-to-Noise Ratio (SNR)">
              {connection.snr} dB SNR
            </span>
          )}
          {connection.channel !== undefined && connection.channel > 0 && (
            <span className={styles.rfBadge} title={`Operating Wi-Fi Channel: ${connection.channel}`}>
              Ch {connection.channel}
            </span>
          )}
          {connection.radioType && (
            <span className={styles.rfBadge} title={`Radio protocol: ${connection.radioType}`}>
              {connection.radioType}
            </span>
          )}
          <button
            type="button"
            className={styles.detailsBtn}
            onClick={() => setDetailsModalGuid(connection.profile || connection.ssid || connection.name)}
            title="Inspect RF physical layer diagnostics and security parameters"
          >
            Diagnostics ↗
          </button>
        </div>
      )}

      {/* BSSID Cloaking & Privacy Bar */}
      {connection?.bssid && (
        <div className={styles.bssidRow}>
          <ShieldIcon size={13} color="var(--accent)" />
          <span className={styles.bssidLabel}>BSSID:</span>
          <span className={`${styles.bssidText} ${bssidPeek ? styles.bssidPeekActive : ''}`}>
            {formatBssid(connection.bssid, settings.bssidCloaking, settings.bssidMaskMode, bssidPeek)}
          </span>
          {settings.bssidCloaking && (
            <button
              type="button"
              className={`${styles.peekBtn} ${bssidPeek ? styles.peekBtnActive : ''}`}
              onClick={peekBssid}
              title={bssidPeek ? 'Real BSSID visible (3s peek)' : 'Peek real BSSID for 3 seconds'}
            >
              {bssidPeek ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
            </button>
          )}
          <button
            type="button"
            className={styles.bssidCopyBtn}
            onClick={handleCopyBssid}
            title={settings.bssidCloaking && !bssidPeek ? 'Copy cloaked BSSID (Protected)' : 'Copy BSSID'}
          >
            <CopyIcon size={13} />
          </button>
        </div>
      )}

      {/* Speed panel */}
      <div className={styles.speedPanel}>
        <div className={styles.speedHeader}>
          <span className={styles.speedSectionTitle}>Live transfer</span>
          {connection?.rxRateMbps && (
            <span className={styles.linkSub}>Wi-Fi Link: {connection.rxRateMbps.toFixed(0)} Mbps</span>
          )}
        </div>

        <SpeedDisplay onToggleInfo={() => setInfoOpen(v => !v)} infoOpen={infoOpen} />
        <Sparkline />
      </div>

      {infoOpen && (
        <SpeedInfoPanel onClose={() => setInfoOpen(false)} />
      )}
    </div>
  )
}
