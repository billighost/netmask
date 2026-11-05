import React, { useEffect, useMemo, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CloseIcon, DownloadIcon, ShieldIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { Toggle } from '../Controls/Toggle'
import { createConnectionReport, type ReportFormat } from '../../connection-report'
import { sharingModeActive } from '../../network-state'
import styles from './ConnectionReportModal.module.css'

export const ConnectionReportModal: React.FC = () => {
  const snapshot = useStore(state => ({
    open: state.reportModalOpen,
    connection: state.connection,
    telemetry: state.pingTelemetry,
    speed: state.speed,
    testedSpeed: state.testedSpeed,
    captivePortal: state.captivePortal,
    platform: state.capabilities?.platform || 'desktop',
    sharing: sharingModeActive(state.streamerStatus, state.streamerBusy)
  }), shallow)
  const [format, setFormat] = useState<ReportFormat>('html')
  const [includeIdentifiers, setIncludeIdentifiers] = useState(false)
  const [createdAt, setCreatedAt] = useState(() => new Date())
  const [version, setVersion] = useState('')
  useEffect(() => {
    if (!snapshot.open) return
    setCreatedAt(new Date())
    setIncludeIdentifiers(false)
    window.nm.getVersion().then(setVersion).catch(() => setVersion('unknown'))
  }, [snapshot.open])
  useEffect(() => { if (snapshot.sharing) setIncludeIdentifiers(false) }, [snapshot.sharing])
  const report = useMemo(() => createConnectionReport({
    generatedAt: createdAt,
    appVersion: version || 'unknown',
    platform: snapshot.platform,
    connection: snapshot.connection,
    telemetry: snapshot.telemetry,
    speed: snapshot.speed,
    testedSpeed: snapshot.testedSpeed,
    captivePortal: snapshot.captivePortal,
    includeIdentifiers,
    sharingMode: snapshot.sharing
  }), [createdAt, version, snapshot, includeIdentifiers])
  if (!snapshot.open) return null
  const state = useStore.getState()
  const download = () => {
    const contents = format === 'html' ? report.html : report.markdown
    const blob = new Blob([contents], { type: format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.filenameBase}.${format === 'html' ? 'html' : 'md'}`
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    state.addToast(`${format === 'html' ? 'HTML' : 'Markdown'} report saved`, 'success')
  }
  return <Dialog label="Connection report" onClose={() => state.setReportModalOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}><div><div className={styles.eyebrow}>FIELDNOTES</div><h2>Connection report</h2><p>Preview exactly what will leave NetMask.</p></div>
      <button className={styles.close} aria-label="Close connection report" onClick={() => state.setReportModalOpen(false)}><CloseIcon size={14} /></button></div>
    <div className={styles.controls}>
      <div className={styles.segment} aria-label="Report format">{(['html', 'markdown'] as const).map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)}>{value === 'html' ? 'Readable HTML' : 'Markdown'}</button>)}</div>
      <div className={styles.identifierChoice}><Toggle label="Include network identifiers"
        sub={snapshot.sharing ? 'Unavailable while sharing mode is active.' : 'Adds network, adapter, and access-point names.'}
        on={includeIdentifiers} disabled={snapshot.sharing} onChange={setIncludeIdentifiers} /></div>
      <div className={styles.privacyNote}><ShieldIcon size={14} /><span>{includeIdentifiers && !snapshot.sharing ? 'Identifiers will be included by your explicit choice.' : 'Names and hardware identifiers are redacted by default.'}</span></div>
    </div>
    <div className={styles.preview} aria-label="Exact report preview">
      {format === 'html' ? <iframe title="HTML report preview" sandbox="" srcDoc={report.html} /> : <pre>{report.markdown}</pre>}
    </div>
    <div className={styles.footer}><p>The report contains point-in-time measurements and plain next steps. It never includes Wi-Fi passwords.</p>
      <button type="button" className={styles.download} onClick={download}><DownloadIcon size={14} />Save {format === 'html' ? 'HTML' : 'Markdown'}</button></div>
  </Dialog>
}
