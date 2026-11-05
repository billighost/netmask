import React, { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CheckIcon, RestoreIcon, RefreshIcon, LockIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { reconnectSelected, repairNetworkNameConflict, restoreNetworkDisplayName, saveNetworkDisplayName } from '../../network-actions'
import type { NameConflict } from '../../types'
import { errorMessage, sharingModeActive } from '../../network-state'
import styles from './ActionPanel.module.css'

export const ActionPanel: React.FC = () => {
  const { networks, selectedGuid, connection, addToast, reconnecting, capabilities, privateNames, maskName } = useStore(state => ({
    networks: state.networks, selectedGuid: state.selectedGuid, addToast: state.addToast, reconnecting: state.reconnecting,
    connection: state.connection, capabilities: state.capabilities,
    privateNames: sharingModeActive(state.streamerStatus, state.streamerBusy), maskName: state.settings.streamerMaskName
  }), shallow)
  const net = networks.find(network => network.guid === selectedGuid) || null
  const [inputVal, setInputVal] = useState(net?.name ?? '')
  const [applying, setApplying] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [conflict, setConflict] = useState<NameConflict | null>(null)
  const previous = useRef({ guid: net?.guid, name: net?.name ?? '' })
  useEffect(() => {
    const old = previous.current
    setInputVal(value => old.guid !== net?.guid || value === old.name ? net?.name ?? '' : value)
    setConflict(null)
    previous.current = { guid: net?.guid, name: net?.name ?? '' }
  }, [net?.guid, net?.name])

  const name = inputVal.trim()
  const invalid = !name || Array.from(name).length > 128 || /[\x00-\x1f\x7f]/.test(name)
  const unchanged = name === net?.name
  const busy = applying || restoring || reconnecting
  const supported = net?.canRename !== false && capabilities?.networkRename !== false
  const disabled = !net || !supported || privateNames || invalid || unchanged || busy
  const apply = async () => {
    if (!net || disabled) return
    setApplying(true)
    try {
      const detected = await window.nm.getNameConflict(net.guid, name, net.name)
      if (detected) { setConflict(detected); return }
      await saveNetworkDisplayName(net.guid, name, net.name)
      const ssid = !privateNames && connection?.networkGuid === net.guid && connection.ssid !== name ? ` The router's Wi-Fi name remains ${connection.ssid}.` : ''
      addToast('Local label confirmed: ' + name + '.' + ssid, 'success')
    }
    catch (error) { addToast(errorMessage(error, 'The name could not be saved'), 'error') }
    finally { setApplying(false) }
  }
  const repairConflict = async () => {
    if (!net || !conflict || busy) return
    if (!window.confirm(`Free “${name}” by renaming the other saved profile to “${conflict.suggestedName}”? NetMask will roll it back if your label cannot be applied.`)) return
    setApplying(true)
    try {
      await repairNetworkNameConflict(net.guid, name, net.name)
      setConflict(null)
      addToast('Saved-profile conflict repaired and local label confirmed', 'success')
    } catch (error) { addToast(errorMessage(error, 'The saved-profile conflict could not be repaired'), 'error') }
    finally { setApplying(false) }
  }
  const restore = async () => {
    if (!net || busy || !supported || privateNames) return
    setRestoring(true)
    try { await restoreNetworkDisplayName(net.guid, net.originalName, net.name); addToast('Original local label restored', 'success') }
    catch (error) { addToast(errorMessage(error, 'The original name could not be restored'), 'error') }
    finally { setRestoring(false) }
  }

  return <section className={styles.panel} aria-labelledby="editor-title">
    <div className={styles.header}><h2 className={styles.title} id="editor-title">{privateNames ? 'Names are hidden.' : 'Make it yours.'}<HelpTip label="Local network label">This changes only the local label used by this computer and NetMask. It cannot rename the Wi-Fi signal broadcast by your router.</HelpTip></h2>
      <p className={styles.subtitle}>{privateNames ? 'Exit sharing mode before viewing or editing saved names.' : net?.nameSyncPending ? 'Windows has a saved Wi-Fi profile and local label that no longer match. Save a name or restore the original to repair both.' : net ? 'Choose a local label you recognize. The router name and Wi-Fi SSID do not change.' : 'Choose a saved network above to give it a local label.'}</p>
    </div>
    <label className={styles.fieldLabel} htmlFor="rename-network-input">LOCAL LABEL ON THIS COMPUTER</label>
    <form className={styles.editLine} onSubmit={event => { event.preventDefault(); void apply() }}>
      <input id="rename-network-input" className={styles.input} type="text" maxLength={256} spellCheck={false} value={privateNames ? maskName : inputVal}
        disabled={!net || !supported || privateNames || busy} placeholder={net ? 'A name you recognize' : 'Choose a network first'}
        onChange={event => { setInputVal(event.target.value); setConflict(null) }} onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); void apply() } }} />
      <button id="apply-rename-btn" type="submit" className={styles.btn + ' ' + styles.btnPrimary} disabled={disabled}>
        {applying ? <span className={styles.spinner} /> : <CheckIcon size={13} />}{applying ? 'Saving…' : 'Save name'}
      </button>
    </form>
    {!privateNames && !invalid && !unchanged && net && <p className={styles.previewBox}>NetMask will display <strong>{name}</strong>. Your Wi-Fi signal keeps its existing name.</p>}
    {!privateNames && net?.nameSyncPending && <p className={styles.syncNotice}>A previous install or removal changed only part of this name. Saving or restoring will bring the Windows label and saved Wi-Fi profile back together.</p>}
    {!privateNames && conflict && <div className={styles.conflictNotice}><p><strong>{name}</strong> is already used by another saved profile. NetMask can move that profile to <strong>{conflict.suggestedName}</strong>, then retry this name.</p><button type="button" disabled={busy} onClick={() => void repairConflict()}>Free this label</button></div>}
    {!privateNames && name && invalid && <p className={styles.error}>Use up to 128 characters without control characters.</p>}
    <div className={styles.restoreLine}>
      <p className={styles.original}>{!net ? 'No network selected' : privateNames ? 'Your original name stays saved.' : 'Original: ' + net.originalName}</p>
      <button type="button" className={styles.textButton} disabled={privateNames || (!net?.renamed && !net?.nameSyncPending) || !supported || busy} onClick={() => void restore()}>{restoring ? 'Restoring…' : 'Restore original'}</button>
    </div>
    <div className={styles.bottomRow}>
      <p className={styles.permission}>{capabilities?.platform === 'windows' && <LockIcon size={11} />}<span>{!supported ? 'Local-label changes are unavailable here.' : 'This does not rename the router or Wi-Fi SSID.'}</span>
        {capabilities?.platform === 'windows' && <HelpTip label="Windows permission">Windows may ask for administrator permission to update its local network label. NetMask verifies the refreshed label before showing success.</HelpTip>}</p>
      <button type="button" className={styles.textButton} disabled={!net || net.type !== 'wifi' || !net.profile || busy} onClick={() => void reconnectSelected()}><RefreshIcon size={11} />{reconnecting ? ' Reconnecting…' : ' Reconnect Wi-Fi'}</button>
    </div>
  </section>
}
