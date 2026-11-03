import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { RoamingSettings } from '../../types'
import { CloseIcon, RadioIcon, CheckIcon, BoltIcon } from '../../icons'
import styles from './RoamingTunerModal.module.css'

export const RoamingTunerModal: React.FC = () => {
  const { roamingModalOpen, setRoamingModalOpen, roamingSettings, setRoamingSettings, addToast } = useStore()
  const [selectedBand, setSelectedBand] = useState<string>('')
  const [selectedRoaming, setSelectedRoaming] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const s = await window.nm.getRoamingSettings()
      setRoamingSettings(s)
      setSelectedBand(s.preferredBand)
      setSelectedRoaming(s.roamingAggressiveness)
    } catch {
      addToast('Failed to load NIC roaming parameters', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (roamingModalOpen) {
      fetchSettings()
    }
  }, [roamingModalOpen])

  if (!roamingModalOpen) return null

  const handleApply = async () => {
    setApplying(true)
    try {
      const ok = await window.nm.setRoamingSettings({
        preferredBand: selectedBand,
        roamingAggressiveness: selectedRoaming
      })
      if (ok) {
        addToast('Wi-Fi roaming and band steering parameters updated!', 'success')
        await fetchSettings()
      } else {
        addToast('Failed to apply settings. Elevation required.', 'error')
      }
    } catch {
      addToast('Error saving roaming settings', 'error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className={styles.scrim} onClick={() => setRoamingModalOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <RadioIcon size={16} color="var(--accent)" />
            <span className={styles.title}>Wi-Fi Roaming & Band Steering Tuner</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setRoamingModalOpen(false)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.tipBox}>
            <BoltIcon size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div className={styles.tipText}>
              Fine-tune your wireless NIC adapter to eliminate Wi-Fi micro-stutters, ping spikes, and premature AP roaming while gaming or streaming.
            </div>
          </div>

          {/* Preferred Band */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Preferred Band (Band Steering)</span>
              <span className={styles.cardSub}>
                Force adapter to favor 5GHz/6GHz for lowest latency and highest speed, or 2.4GHz for distance
              </span>
            </div>

            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={selectedBand}
                onChange={e => setSelectedBand(e.target.value)}
                disabled={loading || applying}
              >
                {roamingSettings?.validPreferredBands.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Roaming Aggressiveness */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Roaming Aggressiveness</span>
              <span className={styles.cardSub}>
                Lower settings stop Windows from aggressively scanning for alternative APs, eliminating in-game latency spikes
              </span>
            </div>

            <div className={styles.selectWrap}>
              <select
                className={styles.select}
                value={selectedRoaming}
                onChange={e => setSelectedRoaming(e.target.value)}
                disabled={loading || applying}
              >
                {roamingSettings?.validRoamingAggressiveness.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.applyBtn}
              disabled={applying || loading}
              onClick={handleApply}
            >
              {applying ? <span className={styles.spinner} /> : <CheckIcon size={13} />}
              <span>{applying ? 'Applying…' : 'Apply NIC Settings'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

