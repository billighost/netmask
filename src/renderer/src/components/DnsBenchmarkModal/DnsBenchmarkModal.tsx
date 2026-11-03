import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { DnsResolverResult } from '../../types'
import { CloseIcon, DnsIcon, BoltIcon, CheckIcon, RefreshIcon, ShieldIcon } from '../../icons'
import styles from './DnsBenchmarkModal.module.css'

export const DnsBenchmarkModal: React.FC = () => {
  const { dnsModalOpen, setDnsModalOpen, dnsResults, setDnsResults, addToast } = useStore()
  const [benchmarking, setBenchmarking] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  const runBenchmark = async () => {
    if (benchmarking) return
    setBenchmarking(true)
    try {
      const results = await window.nm.benchmarkDns()
      setDnsResults(results)
      const fastest = results.find(r => r.isFastest)
      if (fastest) {
        addToast(`Fastest DNS: ${fastest.name} (${fastest.latencyMs} ms)`, 'success')
      }
    } catch {
      addToast('Failed to benchmark DNS resolvers', 'error')
    } finally {
      setBenchmarking(false)
    }
  }

  useEffect(() => {
    if (dnsModalOpen && !dnsResults) {
      runBenchmark()
    }
  }, [dnsModalOpen])

  if (!dnsModalOpen) return null

  const handleApply = async (preset: DnsResolverResult) => {
    if (applyingId) return
    setApplyingId(preset.id)
    try {
      const ok = await window.nm.applyDns(preset.id)
      if (ok) {
        addToast(`Applied ${preset.name} (${preset.primary}) successfully!`, 'success')
        // Refresh benchmark list
        const updated = await window.nm.benchmarkDns()
        setDnsResults(updated)
      } else {
        addToast(`Failed to apply ${preset.name}. Elevation required.`, 'error')
      }
    } catch {
      addToast('Error applying DNS settings', 'error')
    } finally {
      setApplyingId(null)
    }
  }

  const fastest = dnsResults?.find(r => r.isFastest)

  return (
    <div className={styles.scrim} onClick={() => setDnsModalOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <DnsIcon size={16} color="var(--accent)" />
            <span className={styles.title}>Fastest DNS Benchmarker & Switcher</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setDnsModalOpen(false)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.topBar}>
            <div className={styles.topInfo}>
              <div className={styles.topTitle}>1-Click Low-Latency Resolver</div>
              <div className={styles.topSub}>
                Test live resolution response times and switch active adapter DNS in 1 click
              </div>
            </div>

            <div className={styles.topActions}>
              <button
                type="button"
                className={styles.benchBtn}
                disabled={benchmarking}
                onClick={runBenchmark}
                title="Test real-time resolution speed to all DNS resolvers"
              >
                {benchmarking ? <span className={styles.spinner} /> : <RefreshIcon size={13} />}
                <span>{benchmarking ? 'Testing…' : 'Benchmark'}</span>
              </button>

              {fastest && !fastest.isCurrent && (
                <button
                  type="button"
                  className={styles.fastestBtn}
                  disabled={Boolean(applyingId)}
                  onClick={() => handleApply(fastest)}
                  title={`Apply fastest DNS: ${fastest.name} (${fastest.latencyMs}ms)`}
                >
                  <BoltIcon size={13} />
                  <span>Apply Fastest ({fastest.latencyMs}ms)</span>
                </button>
              )}
            </div>
          </div>

          <div className={styles.list}>
            {dnsResults ? (
              dnsResults.map((r) => {
                const isApplying = applyingId === r.id
                return (
                  <div key={r.id} className={`${styles.item} ${r.isCurrent ? styles.itemCurrent : ''}`}>
                    <div className={styles.itemLeft}>
                      <div className={styles.itemNameRow}>
                        <span className={styles.itemName}>{r.name}</span>
                        {r.isCurrent && (
                          <span className={styles.currentBadge}>
                            <CheckIcon size={11} color="var(--green)" /> Active
                          </span>
                        )}
                        {r.isFastest && (
                          <span className={styles.fastestBadge}>
                            <BoltIcon size={11} /> Fastest
                          </span>
                        )}
                      </div>
                      <div className={styles.itemSub}>{r.description}</div>
                      <div className={styles.itemIps}>
                        <span>Primary: <strong>{r.primary}</strong></span>
                        {r.secondary && <span>Secondary: <strong>{r.secondary}</strong></span>}
                      </div>
                    </div>

                    <div className={styles.itemRight}>
                      <div className={styles.latencyWrap}>
                        <span className={`${styles.latencyNum} ${
                          r.latencyMs === null
                            ? styles.latencyMuted
                            : r.latencyMs <= 40
                            ? styles.latencyGreen
                            : r.latencyMs <= 100
                            ? styles.latencyAmber
                            : styles.latencyRed
                        }`}>
                          {r.latencyMs !== null ? `${r.latencyMs} ms` : '—'}
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`${styles.applyBtn} ${r.isCurrent ? styles.applyBtnCurrent : ''}`}
                        disabled={r.isCurrent || Boolean(applyingId)}
                        onClick={() => handleApply(r)}
                      >
                        {isApplying ? (
                          <span className={styles.spinner} />
                        ) : r.isCurrent ? (
                          <>
                            <CheckIcon size={12} />
                            <span>In Use</span>
                          </>
                        ) : (
                          <span>Apply</span>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className={styles.loadingWrap}>
                <div className={styles.spinner} />
                <span>Benchmarking DNS resolvers (Cloudflare, Google, Quad9, AdGuard)...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

