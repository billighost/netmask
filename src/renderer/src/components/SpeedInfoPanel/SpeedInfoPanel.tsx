import React from 'react'
import { useStore } from '../../store'
import { CloseIcon, ArrowDownIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { runSpeedTest } from '../../network-actions'
import styles from './SpeedInfoPanel.module.css'

export const SpeedInfoPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const result = useStore(state => state.testedSpeed)
  const testing = useStore(state => state.speedTesting)
  const seconds = result && result.mbPerSec > 0 ? Math.round(1000 / result.mbPerSec) : null
  const duration = seconds == null ? '—' : seconds < 60 ? seconds + ' seconds' : seconds < 3600 ? Math.floor(seconds / 60) + ' min ' + seconds % 60 + ' sec' : (seconds / 3600).toFixed(1) + ' hours'
  return <section className={styles.panel} aria-label="Download speed test"><header className={styles.header}><div><h3>Try a download.</h3><p>A 3 MB sample from Cloudflare, on this connection.</p></div>
    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close download speed test"><CloseIcon size={13} /></button></header>
    {result && <dl className={styles.results}><div><dt>Measured sample <HelpTip label="Measured download">The rate reached by this small download, including the request time. It is one sample and can change with server load, signal, and other traffic.</HelpTip></dt><dd>{result.mbps.toFixed(1)} <span>Mbps</span><small>{result.mbPerSec.toFixed(2)} MB/s</small></dd></div>
      <div><dt>Estimated time for 1 GB <HelpTip label="Download time estimate">Divides a 1000 MB file by the measured rate. It assumes the same speed continues for the whole file.</HelpTip></dt><dd className={styles.duration}>{duration}</dd></div></dl>}
    <button type="button" className={styles.testButton} disabled={testing} onClick={() => void runSpeedTest()}>{testing ? <span className={styles.spinner} /> : <ArrowDownIcon size={12} />}{testing ? 'Testing the download…' : result ? 'Test again' : 'Start download test'}</button>
  </section>
}
