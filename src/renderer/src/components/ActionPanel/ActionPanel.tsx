import React, { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CheckIcon, RestoreIcon, RefreshIcon, LockIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { refreshNetworks, reconnectSelected } from '../../network-actions'
import { errorMessage } from '../../network-state'
import styles from './ActionPanel.module.css'

export const ActionPanel: React.FC = () => {
  const { networks, selectedGuid, addToast, reconnecting, capabilities, privateNames } = useStore(state => ({
    networks: state.networks, selectedGuid: state.selectedGuid, addToast: state.addToast, reconnecting: state.reconnecting,
    capabilities: state.capabilities, privateNames: state.streamerStatus.isCloaked
  }), shallow)
  const net = networks.find(network => network.guid === selectedGuid) || null
  const [inputVal, setInputVal] = useState(net?.name ?? '')
  const [applying, setApplying] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const previous = useRef({ guid: net?.guid, name: net?.name ?? '' })
  useEffect(() => {
    const old = previous.current
    setInputVal(value => old.guid !== net?.guid || value === old.name ? net?.name ?? '' : value)
    previous.current = { guid: net?.guid, name: net?.name ?? '' }
  }, [net?.guid, net?.name])

  const name = inputVal.trim()
  const invalid = !name || Array.from(name).length > 128 || /[\x00-\x1f\x7f]/.test(name)
  const unchanged = name === net?.name
  const busy = applying || restoring || reconnecting
  const supported = net?.canRename !== false && capabilities?.networkRename !== false
  const disabled = !net || !supported || invalid || unchanged || busy
  const apply = async () => {
    if (!net || disabled) return
    setApplying(true)
    try { await window.nm.rename(net.guid, name, net.name); await refreshNetworks(true); addToast('Display name saved: ' + name, 'success') }
    catch (error) { addToast(errorMessage(error, 'The name could not be saved'), 'error') }
    finally { setApplying(false) }
  }
  const restore = async () => {
    if (!net || busy || !supported) return
    setRestoring(true)
    try { await window.nm.restore(net.guid, net.name); await refreshNetworks(true); addToast('Original display name restored', 'success') }
    catch (error) { addToast(errorMessage(error, 'The original name could not be restored'), 'error') }
    finally { setRestoring(false) }
  }

  return <section className={styles.panel} aria-labelledby="editor-title">
    <div className={styles.header}><h2 className={styles.title} id="editor-title">Make it yours.<HelpTip label="Local display name">This changes the saved name on this computer. Your router keeps broadcasting the same Wi-Fi name, and other devices keep their own names.</HelpTip></h2>
      <p className={styles.subtitle}>{net ? 'Give this saved network a name you recognize.' : 'Choose a saved network above to name it.'}</p>
    </div>
    <label className={styles.fieldLabel} htmlFor="rename-network-input">DISPLAY NAME ON THIS COMPUTER</label>
    <form className={styles.editLine} onSubmit={event => { event.preventDefault(); void apply() }}>
      <input id="rename-network-input" className={styles.input} type="text" maxLength={256} spellCheck={false} value={inputVal}
        disabled={!net || !supported || busy} placeholder={net ? 'A name you recognize' : 'Choose a network first'}
        onChange={event => setInputVal(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void apply() } }} />
      <button id="apply-rename-btn" type="submit" className={styles.btn + ' ' + styles.btnPrimary} disabled={disabled}>
        {applying ? <span className={styles.spinner} /> : <CheckIcon size={13} />}{applying ? 'Saving…' : 'Save name'}
      </button>
    </form>
    {!invalid && !unchanged && net && <p className={styles.previewBox}>Will display as <strong>{name}</strong></p>}
    {name && invalid && <p className={styles.error}>Use up to 128 characters without control characters.</p>}
    <div className={styles.restoreLine}>
      <p className={styles.original}>{!net ? 'No network selected' : privateNames ? 'Your original name stays saved.' : 'Original: ' + net.originalName}</p>
      <button type="button" className={styles.textButton} disabled={!net?.renamed || !supported || busy} onClick={() => void restore()}>{restoring ? 'Restoring…' : 'Restore original'}</button>
    </div>
    <div className={styles.bottomRow}>
      <p className={styles.permission}>{capabilities?.platform === 'windows' && <LockIcon size={11} />}<span>{!supported ? 'Display-name changes are unavailable here.' : 'Only the local name changes.'}</span>
        {capabilities?.platform === 'windows' && <HelpTip label="Windows permission">Windows may ask for administrator permission when you save a name. Your original name is kept before the change.</HelpTip>}</p>
      <button type="button" className={styles.textButton} disabled={!net || net.type !== 'wifi' || !net.profile || busy} onClick={() => void reconnectSelected()}><RefreshIcon size={11} />{reconnecting ? ' Reconnecting…' : ' Reconnect Wi-Fi'}</button>
    </div>
  </section>
}
