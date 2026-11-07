import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { NetworkPreset, PresetPreview } from '../../types'
import { Dialog } from '../Dialog/Dialog'
import { CloseIcon, SparkleIcon } from '../../icons'
import { Select } from '../Controls/Select'
import { Toggle } from '../Controls/Toggle'
import { errorMessage, sharingModeActive } from '../../network-state'
import panel from '../Dialog/Panel.module.css'
import styles from './NetworkPresetModal.module.css'

const blank = (networkGuid: string): NetworkPreset => ({ networkGuid, enabled: false, applyMode: 'ask', label: null, theme: 'inherit', bssidVisibility: 'inherit' })

export const NetworkPresetModal: React.FC = () => {
  const guid = useStore(state => state.presetModalGuid)
  const sharing = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const network = useStore(state => state.networks.find(item => item.guid === guid))
  const [preset, setPreset] = useState<NetworkPreset | null>(null), [preview, setPreview] = useState<PresetPreview | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    if (!guid) return
    let active = true; setPreset(null); setPreview(null); setError('')
    window.nm.getNetworkPreset(guid).then(value => { if (active) setPreset(value) }).catch(() => { if (active) setPreset(blank(guid)) })
    return () => { active = false }
  }, [guid])
  if (!guid) return null
  const state = useStore.getState(), close = () => state.setPresetModalGuid(null)
  const getPreview = async () => {
    if (!preset) return; setBusy(true); setError('')
    try { setPreview(await window.nm.previewNetworkPreset(preset)) } catch (reason) { setError(errorMessage(reason, 'The preset preview is unavailable')) } finally { setBusy(false) }
  }
  const save = async (apply: boolean) => {
    if (!preset) return; setBusy(true); setError('')
    try {
      await window.nm.saveNetworkPreset(preset)
      if (apply) {
        const result = await window.nm.applyNetworkPreset(guid)
        if (result.undoToken) state.setPresetUndo({ token: result.undoToken, summary: result.summary })
        state.addToast(result.summary, result.applied ? 'success' : 'info')
      } else state.addToast('Network preset saved', 'success')
      close()
    } catch (reason) { setError(errorMessage(reason, 'The preset could not be saved')) } finally { setBusy(false) }
  }
  return <Dialog label="Network preset" onClose={close} scrimClass={panel.scrim} modalClass={panel.modal}>
    <header className={panel.header}><div className={panel.headerTitleGroup}><SparkleIcon size={18}/><div><h2 className={panel.title}>Network preset</h2><p className={panel.subtitle}>{sharing ? 'Saved network' : network?.name || 'Saved network'} · preview every change before it applies.</p></div></div><button type="button" className={panel.closeBtn} aria-label="Close network preset" onClick={close}><CloseIcon size={14}/></button></header>
    <div className={panel.body}>{sharing ? <p className={styles.private}>Exit sharing mode before viewing or changing a network preset.</p> : !preset ? <p className={styles.private}>Loading the local preset…</p> : <>
      <Toggle label="Use a preset on this network" sub="Keep these choices ready when this saved network connects." on={preset.enabled} onChange={enabled => { setPreset({ ...preset, enabled }); setPreview(null) }}/>
      <div className={styles.field}><label htmlFor="preset-label">Preferred local label</label><input id="preset-label" value={preset.label || ''} placeholder="Keep the current label" maxLength={128} onChange={event => { setPreset({ ...preset, label: event.target.value || null }); setPreview(null) }}/></div>
      <div className={styles.grid}><div><label>When it connects</label><Select id="preset-mode" label="When the network connects" value={preset.applyMode} options={[{ value: 'ask', label: 'Ask first' }, { value: 'automatic', label: 'Apply safe choices automatically' }]} onChange={applyMode => { setPreset({ ...preset, applyMode }); setPreview(null) }}/></div>
        <div><label>Fieldnotes theme</label><Select id="preset-theme" label="Theme for this network" value={preset.theme} options={[{ value: 'inherit', label: 'Keep my usual theme' }, { value: 'light', label: 'Paper' }, { value: 'dark', label: 'Dark' }]} onChange={theme => { setPreset({ ...preset, theme }); setPreview(null) }}/></div>
        <div><label>Access-point address</label><Select id="preset-bssid" label="Access point display for this network" value={preset.bssidVisibility} options={[{ value: 'inherit', label: 'Keep my usual choice' }, { value: 'partial', label: 'Hide the last half' }, { value: 'full', label: 'Hide the whole address' }]} onChange={bssidVisibility => { setPreset({ ...preset, bssidVisibility }); setPreview(null) }}/></div></div>
      <button type="button" className={styles.previewButton} disabled={busy} onClick={() => void getPreview()}>{busy ? 'Checking…' : 'Preview changes'}</button>
      {error && <p className="nm-error" role="status">{error}</p>}
      {preview && <section className={styles.preview} aria-live="polite"><h3>Preview</h3>{preview.changes.length ? <ul>{preview.changes.map(change => <li key={change.label}><strong>{change.label}</strong><span>{change.before} → {change.after}</span>{change.requiresPermission && <small>System permission may be requested.</small>}</li>)}</ul> : <p>No visible change is needed.</p>}{preset.applyMode === 'automatic' && !preview.canApplyAutomatically && <p className={styles.limit}>{preview.automaticLimitReason || 'This change needs confirmation on this operating system.'}</p>}</section>}
      <div className={panel.actions}><button type="button" className={panel.btn} disabled={busy} onClick={() => void save(false)}>Save preset</button><button type="button" className={`${panel.btn} ${panel.btnPrimary}`} disabled={busy || !preview} onClick={() => void save(true)}>Save and apply</button></div>
    </>}</div>
  </Dialog>
}
