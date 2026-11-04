import React, { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import type { DnsResolverResult } from '../../types'
import { CloseIcon, DnsIcon, BoltIcon, CheckIcon, RefreshIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { HelpTip } from '../Controls/HelpTip'
import { errorMessage } from '../../network-state'
import styles from '../Dialog/Panel.module.css'

export const DnsBenchmarkModal: React.FC = () => {
  const { open, results, capabilities, epoch } = useStore(state => ({
    open: state.dnsModalOpen, results: state.dnsResults, capabilities: state.capabilities, epoch: state.connectionEpoch
  }), shallow)
  const [benchmarking, setBenchmarking] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const state = useStore.getState()
  const runBenchmark = async () => {
    const id = ++request.current
    const startedOn = useStore.getState().connectionEpoch
    setBenchmarking(true); setError(null); state.setDnsResults(null)
    try {
      const values = await window.nm.benchmarkDns()
      if (id === request.current && startedOn === useStore.getState().connectionEpoch) state.setDnsResults(values)
    } catch (error) { if (id === request.current) setError(errorMessage(error)) }
    finally { if (id === request.current) setBenchmarking(false) }
  }
  useEffect(() => {
    if (open) void runBenchmark()
    return () => { request.current++ }
  }, [open, epoch])
  if (!open) return null
  const handleApply = async (preset: DnsResolverResult) => {
    if (applyingId || benchmarking) return
    setApplyingId(preset.id)
    try {
      if (!await window.nm.applyDns(preset.id, preset.configurationId)) throw new Error('The operating system did not confirm the DNS setting')
      state.addToast(preset.isDhcp ? 'Automatic DNS confirmed' : preset.name + ' DNS confirmed', 'success')
      await runBenchmark()
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { setApplyingId(null) }
  }
  const fastest = results?.find(result => result.isFastest && !result.isDhcp)
  const canApply = capabilities?.dnsConfiguration !== false
  return <Dialog label="Compare DNS" onClose={() => state.setDnsModalOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}><div className={styles.titleGroup}><DnsIcon size={16} /><span className={styles.title}>Compare DNS</span></div>
      <button className={styles.closeBtn} aria-label="Close DNS resolvers" onClick={() => state.setDnsModalOpen(false)}><CloseIcon size={14} /></button></div>
    <div className={styles.body}>
      <div className={styles.topBar}><div className={styles.topInfo}><div className={styles.topTitle}>A quicker lookup.<HelpTip label="DNS">DNS turns a website name into the address your computer connects to. This test compares how quickly each service answers. It does not change your connection until you choose Use DNS.</HelpTip></div>
        <p className={styles.topSub}>Compare lookup times on this connection. A quicker answer can help sites begin loading sooner.</p></div>
        <div className={styles.topActions}>
          <button className={styles.benchBtn} disabled={benchmarking || Boolean(applyingId)} onClick={() => void runBenchmark()}><RefreshIcon size={13} />{benchmarking ? 'Testing…' : 'Test again'}</button>
          {fastest && !fastest.isCurrent && canApply && <button className={styles.fastestBtn} disabled={Boolean(applyingId) || benchmarking} onClick={() => void handleApply(fastest)}><BoltIcon size={13} />Use fastest</button>}
        </div>
      </div>
      {!canApply && <p className={styles.topSub}>DNS configuration is unavailable on this platform.</p>}
      <div className={styles.list}>
        {benchmarking ? <div className={styles.loadingWrap} role="status"><div className={styles.spinner} />Querying DNS resolvers…</div>
          : error ? <div className="nm-error" role="alert">{error}</div>
          : results?.map(result => <div key={result.id} className={styles.item + (result.isCurrent ? ' ' + styles.itemCurrent : '')}>
            <div className={styles.itemLeft}><div className={styles.itemNameRow}><span className={styles.itemName}>{result.name}</span>
              {result.isCurrent && <span className={styles.currentBadge}><CheckIcon size={11} />Current</span>}
              {result.isFastest && <span className={styles.fastestBadge}>Fastest</span>}</div>
              <p className={styles.itemSub}>{result.description}</p>
              <div className={styles.itemIps}>{result.isDhcp ? 'Assigned by the network' : result.primary + (result.secondary ? ' · ' + result.secondary : '')}</div></div>
            <div className={styles.itemRight}><div className={styles.latencyWrap}><span className={styles.latencyNum}>{result.latencyMs !== null ? result.latencyMs + ' ms' : result.isDhcp ? '—' : 'No response'}</span></div>
              <button className={styles.applyBtn} disabled={!canApply || result.isCurrent || Boolean(applyingId)} onClick={() => void handleApply(result)}>
                {applyingId === result.id ? 'Applying…' : result.isCurrent ? 'In use' : 'Use DNS'}</button></div>
          </div>)}
      </div>
    </div>
  </Dialog>
}
