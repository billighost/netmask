import React, { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CloseIcon, RadioIcon, CheckIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { Select } from '../Controls/Select'
import { HelpTip } from '../Controls/HelpTip'
import { errorMessage } from '../../network-state'
import styles from '../Dialog/Panel.module.css'

export const RoamingTunerModal: React.FC = () => {
  const { open, settings, capabilities } = useStore(state => ({ open: state.roamingModalOpen, settings: state.roamingSettings, capabilities: state.capabilities }), shallow)
  const [band, setBand] = useState('')
  const [roaming, setRoaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const state = useStore.getState()
  const fetchSettings = async () => {
    const id = ++request.current
    setLoading(true); setError(null)
    try {
      const value = await window.nm.getRoamingSettings()
      if (id !== request.current) return
      state.setRoamingSettings(value); setBand(value.preferredBand); setRoaming(value.roamingAggressiveness)
    } catch (error) { if (id === request.current) setError(errorMessage(error)) }
    finally { if (id === request.current) setLoading(false) }
  }
  useEffect(() => {
    state.setRoamingSettings(null)
    if (open) void fetchSettings()
    return () => { request.current++ }
  }, [open])
  if (!open) return null
  const supported = settings?.supported && capabilities?.roamingTuning !== false
  const params = {
    ...(settings && band !== settings.preferredBand && settings.validPreferredBands.includes(band) ? { preferredBand: band } : {}),
    ...(settings && roaming !== settings.roamingAggressiveness && settings.validRoamingAggressiveness.includes(roaming) ? { roamingAggressiveness: roaming } : {})
  }
  const handleApply = async () => {
    if (applying || !Object.keys(params).length) return
    setApplying(true)
    try {
      if (!await window.nm.setRoamingSettings(params)) throw new Error('The adapter did not confirm this change')
      state.addToast('Adapter settings confirmed', 'success')
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { await fetchSettings(); setApplying(false) }
  }
  return <Dialog label="Wi-Fi adapter settings" onClose={() => state.setRoamingModalOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}><div className={styles.titleGroup}><RadioIcon size={16} /><span className={styles.title}>Wi-Fi adapter settings</span></div>
      <button className={styles.closeBtn} aria-label="Close adapter settings" onClick={() => state.setRoamingModalOpen(false)}><CloseIcon size={14} /></button></div>
    <div className={styles.body}>
      {loading ? <p role="status">Reading adapter settings…</p> : error ? <p className="nm-error" role="alert">{error}</p>
        : !supported ? <p>This adapter does not expose configurable roaming or band preferences.</p> : <>
          <p className={styles.tipText}>Options come from {settings?.adapterName || 'your Wi-Fi driver'}. Preferences can affect roaming and connectivity; results depend on your network.</p>
          <div className={styles.card}><label className={styles.cardTitle} htmlFor="preferred-band">Preferred band<HelpTip label="Preferred band">Tells your Wi-Fi adapter which band to try first. A 5 GHz connection can be quicker nearby; 2.4 GHz often reaches farther. The router and driver still decide what is available.</HelpTip></label>
            <p className={styles.cardSub}>Prefer a band when the access point offers more than one.</p>
            <Select id="preferred-band" label="Preferred band" value={band} onChange={setBand} disabled={applying || !settings?.validPreferredBands.length}
              options={[...(!settings?.validPreferredBands.includes(band) ? [{ value: band, label: band || 'Unavailable', disabled: true }] : []), ...(settings?.validPreferredBands.map(value => ({ value, label: value })) || [])]} /></div>
          <div className={styles.card}><label className={styles.cardTitle} htmlFor="roaming-aggressiveness">Look for a better access point<HelpTip label="Roaming">How readily your adapter looks for another Wi-Fi access point on the same network. Higher settings search more eagerly; lower settings stay with the current access point longer.</HelpTip></label>
            <p className={styles.cardSub}>Controls how readily the adapter looks for another access point.</p>
            <Select id="roaming-aggressiveness" label="Look for a better access point" value={roaming} onChange={setRoaming} disabled={applying || !settings?.validRoamingAggressiveness.length}
              options={[...(!settings?.validRoamingAggressiveness.includes(roaming) ? [{ value: roaming, label: roaming || 'Unavailable', disabled: true }] : []), ...(settings?.validRoamingAggressiveness.map(value => ({ value, label: value })) || [])]} /></div>
          <div className={styles.actions}><button className={styles.applyBtn} disabled={applying || !Object.keys(params).length} onClick={() => void handleApply()}>
            <CheckIcon size={13} />{applying ? 'Applying…' : 'Apply changes'}</button></div>
        </>}
      {error && <button className={styles.applyBtn} onClick={() => void fetchSettings()}>Try again</button>}
    </div>
  </Dialog>
}
