import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store'
import { WifiIcon, BoltIcon, InfoIcon, ArrowDownIcon, ArrowUpIcon } from '../../icons'
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

function Sparkline({ history, maxVal }: { history: number[]; maxVal: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const peak = Math.max(maxVal, 0.1)
    const pts = history.map((v, i) => ({
      x: (i / (history.length - 1)) * w,
      y: h - (v / peak) * (h - 4) - 2
    }))

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

    // Line
    ctx.beginPath()
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.strokeStyle = 'rgba(79,142,247,0.8)'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }, [history, maxVal])

  return <canvas ref={canvasRef} className={styles.sparkline} width={200} height={40} />
}

export const HeroCard: React.FC = () => {
  const { connection, speed, speedHistory } = useStore()
  const [infoOpen, setInfoOpen] = useState(false)

  const maxVal = Math.max(...speedHistory, 0.5)
  const down = formatSpeed(speed.downMBps, speed.downKbps)
  const up = formatSpeed(speed.upMBps, speed.upKbps)

  return (
    <div className={`${styles.card} surface-noise`}>
      {/* Connection status */}
      <div className={styles.statusRow}>
        <span className={`${styles.dot} ${connection ? styles.dotLive : styles.dotOff}`} />
        <span className={styles.statusText}>
          {connection ? 'Connected' : 'Not connected'}
        </span>
        {connection && (
          <div className={styles.metaBadges}>
            <span className={styles.band}>{connection.band}</span>
            {connection.rxRateMbps && (
              <span className={styles.linkRate}>{connection.rxRateMbps.toFixed(0)} Mbps</span>
            )}
          </div>
        )}
      </div>

      {/* Network name */}
      <div className={styles.netName}>
        {connection ? connection.name : 'No Wi-Fi'}
      </div>

      {connection && connection.name !== connection.ssid && (
        <div className={styles.realName}>
          Real: <strong>{connection.ssid}</strong>
          &nbsp;&nbsp;
          <span className={styles.shieldBadge}>Masked</span>
        </div>
      )}
      {connection && connection.name === connection.ssid && (
        <div className={styles.realName}>Showing real network name</div>
      )}

      {/* Speed panel */}
      <div className={styles.speedPanel}>
        <div className={styles.speedHeader}>
          <span className={styles.speedSectionTitle}>Live transfer</span>
          {connection?.rxRateMbps && (
            <span className={styles.linkSub}>Wi-Fi Link: {connection.rxRateMbps.toFixed(0)} Mbps</span>
          )}
        </div>

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
            onClick={() => setInfoOpen(v => !v)}
          >
            <InfoIcon size={15} color={infoOpen ? 'var(--accent)' : 'var(--text-muted)'} />
          </button>
        </div>

        <Sparkline history={speedHistory} maxVal={maxVal} />
      </div>

      {infoOpen && (
        <SpeedInfoPanel downMBps={speed.downMBps} onClose={() => setInfoOpen(false)} />
      )}
    </div>
  )
}
