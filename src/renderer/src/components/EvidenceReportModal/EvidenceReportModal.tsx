import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store'
import type { EvidenceReportData } from '../../types'
import { createEvidenceReport, type EvidenceFormat } from '../../evidence-report'
import { Dialog } from '../Dialog/Dialog'
import { Toggle } from '../Controls/Toggle'
import { CloseIcon, DownloadIcon, ShieldIcon } from '../../icons'
import { errorMessage, sharingModeActive } from '../../network-state'
import styles from './EvidenceReportModal.module.css'

export const EvidenceReportModal: React.FC = () => {
  const open = useStore(state => state.evidenceReportOpen), range = useStore(state => state.historyRange), guid = useStore(state => state.selectedGuid)
  const sharing = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const [data, setData] = useState<EvidenceReportData | null>(null), [error, setError] = useState(''), [format, setFormat] = useState<EvidenceFormat>('html'), [identifiers, setIdentifiers] = useState(false)
  useEffect(() => {
    if (!open) return; let active = true; setData(null); setError(''); setIdentifiers(false)
    window.nm.getEvidenceReport(range, guid || undefined).then(value => { if (active) setData(value) }).catch(reason => { if (active) setError(errorMessage(reason, 'The evidence report is unavailable')) })
    return () => { active = false }
  }, [open, range, guid])
  useEffect(() => { if (sharing) setIdentifiers(false) }, [sharing])
  const report = useMemo(() => data ? createEvidenceReport(data, identifiers && !sharing) : null, [data, identifiers, sharing])
  if (!open) return null
  const state = useStore.getState(), close = () => state.setEvidenceReportOpen(false)
  const download = () => {
    if (!report) return; const contents = format === 'html' ? report.html : report.markdown
    const url = URL.createObjectURL(new Blob([contents], { type: format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `${report.filenameBase}.${format === 'html' ? 'html' : 'md'}`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    state.addToast('Provider evidence report saved', 'success')
  }
  return <Dialog label="Provider evidence report" onClose={close} scrimClass={styles.scrim} modalClass={styles.modal}><header className={styles.header}><div><p>MEASURED EVIDENCE</p><h2>Provider report</h2><span>Preview exactly what will leave NetMask.</span></div><button type="button" aria-label="Close provider report" onClick={close}><CloseIcon size={14}/></button></header>
    <div className={styles.body}><div className={styles.controls}><div className={styles.segment}>{(['html','markdown'] as const).map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)}>{value === 'html' ? 'Readable HTML' : 'Markdown'}</button>)}</div><Toggle label="Include network identifiers" sub={sharing ? 'Unavailable while sharing mode is active.' : 'Names are redacted by default.'} on={identifiers} disabled={sharing} onChange={setIdentifiers}/></div>
      <p className={styles.privacy}><ShieldIcon size={13}/>{identifiers && !sharing ? 'Identifiers are included by your explicit choice.' : 'Identifiers are redacted. Wi-Fi passwords are never included.'}</p>
      {error ? <p className="nm-error">{error}</p> : !report ? <p className={styles.loading}>Building the report from local history…</p> : <div className={styles.preview}>{format === 'html' ? <iframe title="Provider evidence HTML preview" sandbox="" srcDoc={report.html}/> : <pre>{report.markdown}</pre>}</div>}
    </div><footer className={styles.footer}><span>Missing samples remain visibly missing; no values are estimated.</span><button type="button" disabled={!report} onClick={download}><DownloadIcon size={13}/>Save {format === 'html' ? 'HTML' : 'Markdown'}</button></footer>
  </Dialog>
}
