import React, { useState } from 'react'
import { useStore } from '../../store'
import { CheckIcon, CloseIcon, BoltIcon } from '../../icons'
import styles from './SpeedInfoPanel.module.css'

interface Props {
  downMBps?: number
  onClose: () => void
}

interface Capability {
  ok: boolean
  text: string
}

function getCapabilities(mbps: number): Capability[] {
  return [
    { ok: mbps >= 0.1,  text: 'Basic web browsing & email' },
    { ok: mbps >= 0.6,  text: 'Standard definition (SD) video' },
    { ok: mbps >= 2.5,  text: 'HD video streaming (1080p)' },
    { ok: mbps >= 5,    text: 'HD video calls (Zoom, Teams, Meet)' },
    { ok: mbps >= 7.5,  text: '3–4 people streaming HD at once' },
    { ok: mbps >= 12.5, text: '4K streaming (Netflix, YouTube)' },
    { ok: mbps >= 20,   text: '6+ people streaming HD simultaneously' },
    { ok: mbps >= 25,   text: 'Multiple 4K streams at once' },
    { ok: mbps >= 50,   text: '8K video streaming' },
    { ok: mbps >= 62.5, text: 'Download a 1 GB file in under 20 seconds' },
  ]
}

function getDownloadTime(mbps: number): string {
  if (mbps < 0.01) return '—'
  const secs = 1024 / Math.max(mbps, 0.001)
  if (secs < 60) return `${Math.round(secs)}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m ${Math.round(secs % 60)}s`
  return `${(secs / 3600).toFixed(1)}h`
}

function getTier(mbps: number): string {
  if (mbps < 0.2) return 'Very slow'
  if (mbps < 2.5) return 'Basic'
  if (mbps < 12.5) return 'Standard'
  if (mbps < 50) return 'Fast'
  return 'Ultra Fast'
}

export const SpeedInfoPanel: React.FC<Props> = ({ downMBps: propDownMBps, onClose }) => {
  const storeDownMBps = useStore(s => s.speed.downMBps)
  const downMBps = propDownMBps ?? storeDownMBps
  const { connection, testedSpeed, setTestedSpeed, peakDownMBps, addToast } = useStore()
  const [testing, setTesting] = useState(false)

  // Use the tested speed first, or session peak, or estimated from link speed, or live
  let effectiveMBps = downMBps
  if (testedSpeed) {
    effectiveMBps = testedSpeed.mbPerSec
  } else if (peakDownMBps > 0.5) {
    effectiveMBps = peakDownMBps
  } else if (connection?.rxRateMbps) {
    effectiveMBps = (connection.rxRateMbps * 0.7) / 8 // ~70% practical throughput of link speed
  } else if (effectiveMBps < 0.1) {
    effectiveMBps = 2.5 // Baseline
  }

  const capabilities = getCapabilities(effectiveMBps)
  const mbpsFmt = effectiveMBps >= 10 ? effectiveMBps.toFixed(1) : effectiveMBps.toFixed(2)
  const mbpsBit = (effectiveMBps * 8).toFixed(0)
  const dlTime = getDownloadTime(effectiveMBps)
  const tier = getTier(effectiveMBps)

  const handleRunSpeedTest = async () => {
    if (testing) return
    setTesting(true)
    try {
      const res = await window.nm.runSpeedTest()
      setTestedSpeed(res)
      addToast(`Speed test result: ${res.mbps} Mbps (${res.mbPerSec} MB/s)`, 'success')
    } catch {
      addToast('Speed test failed. Check internet connectivity.', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>What can your connection handle?</div>
          <div className={styles.subtitle}>
            {testedSpeed ? (
              <>Tested: <strong>{testedSpeed.mbps} Mbps</strong> ({testedSpeed.mbPerSec} MB/s) · <span className={styles.tier}>{tier}</span></>
            ) : connection?.rxRateMbps ? (
              <>Capacity: <strong>~{mbpsBit} Mbps</strong> ({mbpsFmt} MB/s) · <span className={styles.tier}>{tier}</span></>
            ) : (
              <>{mbpsFmt} MB/s download · ~{mbpsBit} Mbps · <span className={styles.tier}>{tier}</span></>
            )}
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose} title="Close info">
          <CloseIcon size={13} />
        </button>
      </div>

      {/* Speed test benchmark bar */}
      <div className={styles.testBar}>
        <div className={styles.testInfo}>
          <BoltIcon size={13} color="var(--accent)" />
          <span>{testedSpeed ? 'Verified via Cloudflare CDN' : 'Benchmark internet bandwidth'}</span>
        </div>
        <button
          className={styles.testBtn}
          disabled={testing}
          onClick={handleRunSpeedTest}
          title="Measures active download speed against global CDN"
        >
          {testing ? <span className={styles.spinner} /> : <BoltIcon size={12} />}
          <span>{testing ? 'Testing…' : testedSpeed ? 'Re-test speed' : 'Test speed'}</span>
        </button>
      </div>

      <div className={styles.list}>
        {capabilities.map((cap, i) => (
          <div key={i} className={`${styles.item} ${cap.ok ? styles.ok : styles.no}`}>
            <span className={styles.icon}>
              {cap.ok
                ? <CheckIcon size={12} color="var(--green)" />
                : <CloseIcon size={12} color="var(--text-muted)" />
              }
            </span>
            <span className={styles.text}>{cap.text}</span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        1 GB file download time: <strong>{dlTime}</strong>
      </div>
    </div>
  )
}
