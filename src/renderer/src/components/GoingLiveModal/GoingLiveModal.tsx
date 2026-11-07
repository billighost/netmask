import React, { useState } from 'react'
import { useStore } from '../../store'
import type { GoingLiveResult } from '../../types'
import { Dialog } from '../Dialog/Dialog'
import { CloseIcon, PulseIcon, ShieldIcon } from '../../icons'
import { errorMessage } from '../../network-state'
import panel from '../Dialog/Panel.module.css'
import styles from './GoingLiveModal.module.css'

export const GoingLiveModal: React.FC = () => {
  const open = useStore(state => state.goingLiveOpen)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<GoingLiveResult | null>(null)
  const [error, setError] = useState('')
  if (!open) return null
  const state = useStore.getState()
  const run = async () => {
    setRunning(true); setResult(null); setError('')
    try { const value = await window.nm.runGoingLive(); setResult(value); state.setStreamerStatus(value.sharingStatus) }
    catch (reason) { setError(errorMessage(reason, 'The Going live check could not finish')) } finally { setRunning(false) }
  }
  const close = () => { state.setGoingLiveOpen(false); setResult(null); setError('') }
  return <Dialog label="Going live" onClose={close} scrimClass={panel.scrim} modalClass={panel.modal}>
    <header className={panel.header}><div className={panel.headerTitleGroup}><PulseIcon size={18}/><div><h2 className={panel.title}>Going live</h2><p className={panel.subtitle}>A fresh connection check and sharing mode in one deliberate action.</p></div></div><button type="button" className={panel.closeBtn} aria-label="Close Going live" onClick={close}><CloseIcon size={14}/></button></header>
    <div className={panel.body}><p className={styles.explain}>NetMask checks the router, one internet target, and network sign-in state. It then turns on sharing mode. Missing readings stay unavailable.</p>
      {!result && !running && <button type="button" className={styles.start} onClick={() => void run()}><ShieldIcon size={14}/>Check and turn on sharing mode</button>}
      {running && <div className={styles.running} role="status"><span className={panel.spinner}/>Checking the connection and preparing the display…</div>}
      {error && <p className="nm-error" role="status">{error}</p>}
      {result && <div aria-live="polite"><div className={`${styles.result} ${styles[result.status]}`}><span>{result.status === 'ready' ? 'READY' : result.status === 'caution' ? 'READY WITH CAUTIONS' : result.status === 'not-ready' ? 'NOT READY' : 'NOT ENOUGH DATA'}</span><strong>{result.summary}</strong><small>Checked {new Date(result.checkedAtMs).toLocaleTimeString()} · Sharing mode {result.sharingStatus.isCloaked ? 'is on' : 'is not on'}</small></div>
        <div className={styles.checks}>{result.checks.map(check => <article key={check.id}><i data-status={check.status}/><div><strong>{check.label}</strong><p>{check.detail}</p></div><b>{check.value}</b></article>)}</div>
        <div className={panel.actions}><button type="button" className={`${panel.btn} ${panel.btnPrimary}`} onClick={() => void run()}>Check again</button><button type="button" className={panel.btn} onClick={close}>Done</button></div></div>}
    </div>
  </Dialog>
}
