import React, { useEffect, useMemo, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import type { HistoryBucket, HistorySeries, NetworkUsageSummary, UsageReport, WeeklyDigest } from '../../types'
import { Select } from '../Controls/Select'
import { errorMessage, sharingModeActive } from '../../network-state'
import styles from './JournalView.module.css'

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 2 ? 2 : index > 1 ? 1 : 0)} ${units[index]}`
}

const missingLabel = (bucket: HistoryBucket) => bucket.missingReason === 'paused' ? 'Monitoring paused'
  : bucket.missingReason === 'not-running' ? 'NetMask was not running'
    : bucket.missingReason === 'permission' ? 'System permission unavailable' : 'No sample'

function HistoryChart({ data }: { data: HistorySeries }) {
  const width = 720, height = 210, pad = 24
  const measured = data.buckets.filter(bucket => bucket.internetMedianMs != null)
  const max = Math.max(50, ...measured.map(bucket => Math.max(bucket.internetP95Ms ?? 0, bucket.internetMedianMs ?? 0, bucket.jitterMaxMs ?? 0)))
  const x = (index: number) => pad + index / Math.max(1, data.buckets.length - 1) * (width - pad * 2)
  const y = (value: number) => height - pad - Math.min(max, value) / max * (height - pad * 2)
  const segments = (field: 'internetMedianMs' | 'jitterMedianMs') => {
    const result: string[][] = []; let current: string[] = []
    data.buckets.forEach((bucket, index) => {
      const value = bucket[field]
      if (value == null || bucket.sampleCount === 0) { if (current.length) result.push(current); current = []; return }
      current.push(`${x(index)},${y(value)}`)
    })
    if (current.length) result.push(current)
    return result
  }
  const latency = segments('internetMedianMs'), jitter = segments('jitterMedianMs')
  const description = `${data.coveragePercent.toFixed(0)} percent coverage. ${data.events.filter(event => event.kind === 'drop').length} recorded drops. Gaps are shown rather than joined.`
  return <div className={styles.chartWrap}>
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Internet latency and jitter history" aria-describedby="history-chart-description">
      <title id="history-chart-title">Internet latency and jitter history</title><desc id="history-chart-description">{description}</desc>
      {[0, .25, .5, .75, 1].map(value => <g key={value}><line x1={pad} y1={y(max * value)} x2={width - pad} y2={y(max * value)} className={styles.grid}/><text x={pad} y={y(max * value) - 4}>{Math.round(max * value)} ms</text></g>)}
      {data.buckets.map((bucket, index) => bucket.sampleCount === 0 && <rect key={bucket.startMs} x={x(index) - 2} y={pad} width={Math.max(4, (width - pad * 2) / Math.max(1, data.buckets.length))} height={height - pad * 2} className={styles.gap}><title>{missingLabel(bucket)}</title></rect>)}
      {latency.map((points, index) => <polyline key={`l${index}`} points={points.join(' ')} className={styles.latency}/>) }
      {jitter.map((points, index) => <polyline key={`j${index}`} points={points.join(' ')} className={styles.jitter}/>) }
    </svg>
    <div className={styles.legend}><span><i className={styles.latencyKey}/>Internet response</span><span><i className={styles.jitterKey}/>Jitter</span><span><i className={styles.gapKey}/>Missing</span></div>
  </div>
}

function HistoryTab() {
  const { range, selectedGuid, networks, sharing } = useStore(state => ({ range: state.historyRange, selectedGuid: state.selectedGuid,
    networks: state.networks, sharing: sharingModeActive(state.streamerStatus, state.streamerBusy) }), shallow)
  const [data, setData] = useState<HistorySeries | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    window.nm.getConnectionHistory(range, selectedGuid || undefined).then(value => { if (active) setData(value) })
      .catch(reason => { if (active) setError(errorMessage(reason, 'Connection history is unavailable')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [range, selectedGuid])
  const options = [{ value: '', label: 'All recorded networks' }, ...networks.map((network, index) => ({ value: network.guid,
    label: sharing ? `Saved network ${index + 1}` : network.name }))]
  return <section aria-labelledby="history-heading">
    <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CONNECTION HISTORY</p><h2 id="history-heading">What happened, and when.</h2></div><button type="button" className={styles.reportButton} onClick={() => useStore.getState().setEvidenceReportOpen(true)}>Provider evidence report</button></div>
    <div className={styles.filters}><Select id="history-network" label="Network shown in history" value={selectedGuid || ''} options={options} onChange={value => useStore.getState().selectNetwork(value || null)} />
      <div className={styles.range} role="group" aria-label="History period">{(['24h', '7d', '30d'] as const).map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => useStore.getState().setHistoryRange(value)}>{value === '24h' ? '24 hours' : value}</button>)}</div></div>
    {loading ? <p className={styles.state} role="status">Reading local history…</p> : error ? <p className={styles.error} role="status">{error}</p> : data && <>
      <div className={styles.coverage}><strong>{data.coveragePercent.toFixed(0)}%</strong><span>measured coverage · {data.sampleCount} samples</span></div>
      {data.buckets.length ? <><HistoryChart data={data}/><details className={styles.tableDetails}><summary>Accessible measurement table</summary><div className={styles.tableScroll}><table><thead><tr><th>Period</th><th>Internet</th><th>Jitter</th><th>Drops</th><th>Coverage</th></tr></thead><tbody>{data.buckets.map(bucket => <tr key={bucket.startMs}><td>{new Date(bucket.startMs).toLocaleString()}</td><td>{bucket.internetMedianMs == null ? missingLabel(bucket) : `${bucket.internetMedianMs.toFixed(0)} ms median`}</td><td>{bucket.jitterMedianMs == null ? 'Unavailable' : `${bucket.jitterMedianMs.toFixed(0)} ms`}</td><td>{bucket.dropCount}</td><td>{bucket.sampleCount}/{bucket.expectedSampleCount}</td></tr>)}</tbody></table></div></details></> : <p className={styles.empty}>No samples were recorded in this period. NetMask will not fill the gap with estimates.</p>}
      <div className={styles.events}><h3>Recorded moments</h3>{data.events.length ? data.events.map(event => <article key={event.id}><time>{new Date(event.atMs).toLocaleString()}</time><strong>{event.title}</strong><p>{sharing ? 'Details hidden while sharing.' : event.detail}</p></article>) : <p className={styles.empty}>No drops or unusual changes were recorded in this period.</p>}</div>
    </>}
  </section>
}

function UsageCard({ item, index, sharing, reload }: { item: NetworkUsageSummary; index: number; sharing: boolean; reload: () => void }) {
  const [limit, setLimit] = useState(item.limitBytes ? String(Math.round(item.limitBytes / 1024 ** 3)) : '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    const value = limit.trim() ? Number(limit) : null
    if (value != null && (!Number.isFinite(value) || value <= 0 || value > 1_000_000)) { useStore.getState().addToast('Enter a positive limit in GB', 'error'); return }
    setSaving(true)
    try { await window.nm.setNetworkUsageLimit(item.networkGuid, value == null ? null : Math.round(value * 1024 ** 3)); reload(); useStore.getState().addToast('Data limit saved', 'success') }
    catch (error) { useStore.getState().addToast(errorMessage(error), 'error') } finally { setSaving(false) }
  }
  return <article className={styles.usageCard}><div className={styles.usageHead}><div><strong>{sharing ? `Saved network ${index + 1}` : item.displayName}</strong><span>{new Date(item.fromMs).toLocaleDateString()} – {new Date(item.toMs).toLocaleDateString()}</span></div><b>{formatBytes(item.totalBytes)}</b></div>
    <div className={styles.usageSplit}><span>↓ {formatBytes(item.downloadedBytes)}</span><span>↑ {formatBytes(item.uploadedBytes)}</span></div>
    {item.limitBytes && <><div className={styles.meter}><i style={{ width: `${Math.min(100, item.limitPercent ?? 0)}%` }}/></div><p className={styles.note}>{(item.limitPercent ?? 0).toFixed(0)}% of {formatBytes(item.limitBytes)} used</p></>}
    <div className={styles.limit}><label htmlFor={`usage-limit-${item.networkGuid}`}>Limit in GB</label><input id={`usage-limit-${item.networkGuid}`} inputMode="decimal" value={limit} placeholder="No limit" onChange={event => setLimit(event.target.value)} /><button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></div>
    {(item.counterResets > 0 || item.adapterChanges > 0) && <p className={styles.note}>Accounted across {item.counterResets} counter reset{item.counterResets === 1 ? '' : 's'} and {item.adapterChanges} adapter change{item.adapterChanges === 1 ? '' : 's'}.</p>}
  </article>
}

function UsageTab() {
  const sharing = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const [data, setData] = useState<UsageReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); setError(''); window.nm.getNetworkUsage().then(setData).catch(reason => setError(errorMessage(reason, 'Data usage is unavailable'))).finally(() => setLoading(false)) }
  useEffect(load, [])
  return <section aria-labelledby="usage-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>DATA USE</p><h2 id="usage-heading">Counted per saved network.</h2></div></div>
    <p className={styles.intro}>Totals come from adapter counters and keep their baseline across restarts, network switches, and resets. Missing counters stay unavailable.</p>
    {loading ? <p className={styles.state}>Reading local totals…</p> : error ? <p className={styles.error}>{error}</p> : data?.unavailableReason ? <p className={styles.empty}>{data.unavailableReason}</p> : data?.networks.length ? <div className={styles.usageGrid}>{data.networks.map((item, index) => <UsageCard key={item.networkGuid} item={item} index={index} sharing={sharing} reload={load}/>)}</div> : <p className={styles.empty}>No network usage has been recorded yet.</p>}
  </section>
}

function WeekTab() {
  const [data, setData] = useState<WeeklyDigest | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => { window.nm.getWeeklyDigest().then(setData).catch(reason => setError(errorMessage(reason, 'The weekly digest is unavailable'))).finally(() => setLoading(false)) }, [])
  return <section aria-labelledby="week-heading"><div className={styles.sectionHead}><div><p className={styles.eyebrow}>SEVEN-DAY NOTE</p><h2 id="week-heading">This week, in plain language.</h2></div></div>
    {loading ? <p className={styles.state}>Preparing the local digest…</p> : error ? <p className={styles.error}>{error}</p> : data && <><div className={styles.digestSummary}><strong>{data.summary}</strong><span>{data.coveragePercent.toFixed(0)}% measured coverage</span></div>
      {!data.enoughData ? <p className={styles.empty}>{data.insufficientReason || 'There is not enough measured history to draw a useful conclusion yet.'}</p> : <div className={styles.findings}>{data.findings.map(finding => <article key={finding.id}><h3>{finding.title}</h3><p>{finding.detail}</p><small>Evidence: {finding.evidence}</small>{finding.suggestion && <blockquote>{finding.suggestion}</blockquote>}</article>)}</div>}
    </>}
  </section>
}

export const JournalView: React.FC = () => {
  const tab = useStore(state => state.journalTab)
  const tabs = useMemo(() => [{ id: 'history' as const, label: 'History' }, { id: 'usage' as const, label: 'Usage' }, { id: 'week' as const, label: 'This week' }], [])
  return <div className={styles.root}><nav className={styles.tabs} role="tablist" aria-label="Connection journal">{tabs.map((item, index) => <button key={item.id} id={`journal-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="journal-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => useStore.getState().setJournalTab(item.id)} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    useStore.getState().setJournalTab(tabs[target].id); document.getElementById(`journal-tab-${tabs[target].id}`)?.focus()
  }}>{item.label}</button>)}</nav><div id="journal-panel" role="tabpanel" aria-labelledby={`journal-tab-${tab}`} className={styles.panel}>{tab === 'history' ? <HistoryTab/> : tab === 'usage' ? <UsageTab/> : <WeekTab/>}</div></div>
}
