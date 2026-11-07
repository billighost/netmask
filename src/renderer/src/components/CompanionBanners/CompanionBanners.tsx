import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { acceptContextPrompt, dismissContextPrompt, dismissNetworkAlert, undoPreset } from '../../companion-actions'
import { sharingModeActive } from '../../network-state'
import styles from './CompanionBanners.module.css'

export const CompanionBanners: React.FC = () => {
  const { prompt, alert, undo, sharing } = useStore(state => ({ prompt: state.contextPrompt, alert: state.networkAlert,
    undo: state.presetUndo, sharing: sharingModeActive(state.streamerStatus, state.streamerBusy) }), shallow)
  return <div className={styles.stack}>
    {prompt && <section className={styles.banner} aria-live="polite"><div><strong>{prompt.title}</strong><p>{sharing ? 'A helpful action is available. Details are hidden while sharing.' : prompt.detail}</p></div><div className={styles.actions}><button type="button" className={styles.primary} onClick={() => void acceptContextPrompt()}>{prompt.kind === 'broadcast-app' ? 'Check and turn on' : 'Preview'}</button><button type="button" onClick={() => void dismissContextPrompt()}>Not now</button>{prompt.kind === 'broadcast-app' && <button type="button" onClick={() => void dismissContextPrompt(true)}>Stop asking</button>}</div></section>}
    {alert && <section className={`${styles.banner} ${styles.notice}`} aria-live="polite"><div><strong>{alert.title}</strong><p>{sharing ? 'A saved network changed. Details are hidden while sharing.' : alert.detail}</p></div><div className={styles.actions}><button type="button" onClick={() => { useStore.getState().setActiveView('journal'); useStore.getState().setJournalTab('history') }}>See history</button><button type="button" onClick={() => void dismissNetworkAlert()}>Dismiss</button></div></section>}
    {undo && <section className={`${styles.banner} ${styles.undo}`} role="status"><div><strong>Network preset applied</strong><p>{sharing ? 'Display preferences were updated.' : undo.summary}</p></div><button type="button" onClick={() => void undoPreset()}>Undo</button></section>}
  </div>
}
