import React, { useEffect, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CloseIcon, ShieldIcon, CopyIcon, BoltIcon, RefreshIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { HelpTip } from '../Controls/HelpTip'
import { copyText, refreshNetworks } from '../../network-actions'
import { errorMessage, sharingModeActive } from '../../network-state'
import { enablePrivacyControls } from '../../privacy-actions'
import styles from '../Dialog/Panel.module.css'

export const DeviceIdentityModal: React.FC = () => {
  const { open, identity, capabilities, epoch, sharing } = useStore(state => ({
    open: state.privacyCloakModalOpen, identity: state.deviceIdentity, capabilities: state.capabilities, epoch: state.connectionEpoch,
    sharing: sharingModeActive(state.streamerStatus, state.streamerBusy)
  }), shallow)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const state = useStore.getState()
  const fetchIdentity = async () => {
    const id = ++request.current
    const startedOn = useStore.getState().connectionEpoch
    setLoading(true); setError(null)
    try {
      const identity = await window.nm.getDeviceIdentity()
      if (id === request.current && startedOn === useStore.getState().connectionEpoch) state.setDeviceIdentity(identity)
    } catch (error) { if (id === request.current) setError(errorMessage(error)) }
    finally { if (id === request.current) setLoading(false) }
  }
  useEffect(() => {
    state.setDeviceIdentity(null)
    if (open) void fetchIdentity()
    return () => { request.current++ }
  }, [open, epoch])
  if (!open) return null
  const macSupported = capabilities?.macRandomization === true && Boolean(identity?.activeProfile)
  const netbiosSupported = capabilities?.netbiosControl === true
  const mode = identity?.macRandomization ?? 'unknown'
  const run = async (operation: () => Promise<unknown>, message: string) => {
    if (busy) return
    setBusy(true)
    try {
      if (await operation() === false) throw new Error('The operating system did not confirm this change')
      state.addToast(message, 'success')
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { await fetchIdentity(); setBusy(false) }
  }
  const enableAvailable = async () => {
    if (busy || !identity || !capabilities) return
    setBusy(true)
    try {
      const outcomes = await enablePrivacyControls(window.nm, identity, capabilities)
      if (!outcomes.length) state.addToast('No configurable privacy controls are available on this connection', 'info')
      for (const outcome of outcomes) state.addToast(outcome.error ? outcome.label + ': ' + outcome.error : outcome.label + ' confirmed', outcome.error ? 'error' : 'success')
      state.setStreamerStatus(await window.nm.getStreamerStatus())
      await refreshNetworks(true)
    } catch (error) { state.addToast(errorMessage(error), 'error') }
    finally { await fetchIdentity(); setBusy(false) }
  }
  return <Dialog label="This device and adapter" onClose={() => state.setPrivacyCloakModalOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}>
      <div className={styles.titleGroup}><ShieldIcon size={16} /><span className={styles.title}>This device and adapter</span></div>
      <button className={styles.closeBtn} aria-label="Close device and adapter" onClick={() => state.setPrivacyCloakModalOpen(false)}><CloseIcon size={14} /></button>
    </div>
    <div className={styles.body}>
      <p className={styles.sectionSub}>These values belong to this computer and its active network adapter. They do not describe the selected network or router.</p>
      {loading && <p role="status">Reading device identity…</p>}
      {error && <p className="nm-error" role="alert">{sharing ? 'Device details are hidden while sharing.' : error}</p>}
      <div className={styles.identityCard}>
        <div className={styles.cardHeader}><span className={styles.cardTitle}>This device</span>
          <button className={styles.refreshBtn} aria-label="Refresh device identity" disabled={loading || busy} onClick={() => void fetchIdentity()}><RefreshIcon size={12} /></button>
        </div>
        {([['Computer name', identity?.hostname, 'The name your operating system gives this computer. Some network discovery features can share this name with nearby devices.'], ['Adapter address', identity?.macAddress, 'The MAC address identifies your computer’s network adapter. It is different from the router’s access point address.']] as const).map(([label, value, help]) => <div className={styles.row} key={label}>
          <div className={styles.rowLeft}><span className={styles.rowLabel}>{label}<HelpTip label={label}>{help}</HelpTip></span><span className={styles.rowValue}>{sharing ? 'Hidden while sharing' : value || 'Unavailable'}</span></div>
          <button className={styles.copyBtn} aria-label={'Copy ' + label} disabled={sharing || !value} onClick={() => value && void copyText(value)}><CopyIcon size={13} /></button>
        </div>)}
        <p className={styles.sectionSub}>Adapter: {sharing ? 'Hidden while sharing' : identity?.interfaceName || 'Unavailable'}</p>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}><span className={styles.sectionTitle}>Use a changing adapter address<HelpTip label="MAC randomization">Uses a randomized address for this saved Wi-Fi profile when supported. Daily asks the driver to change it each day. A reconnect may be needed, and this does not make all network activity anonymous.</HelpTip></span><span className={styles.statusBadge}>{mode === 'unknown' ? 'Unknown' : mode === 'daily' ? 'Daily' : mode === 'enabled' ? 'On' : 'Off'}</span></div>
        <p className={styles.sectionSub}>{macSupported ? 'Changes the saved Wi-Fi profile. A reconnect may be needed before a new address appears.' : 'Not available for this platform or connection.'}</p>
        <div className={styles.btnGroup}>
          {(['no', 'yes', 'daily'] as const).map((value, index) => <button key={value} className={styles.pillBtn} aria-pressed={['disabled', 'enabled', 'daily'][index] === mode} disabled={!macSupported || loading || busy || (value === 'daily' && capabilities?.platform !== 'windows')}
            onClick={() => void run(() => window.nm.setMacRandomization(identity!.activeProfile!, value), 'MAC randomization setting confirmed')}>
            {['Off', 'On', 'Daily'][index]}
          </button>)}
        </div>
      </div>
      <div className={styles.section}>
        <div className={styles.sectionTitleRow}><span className={styles.sectionTitle}>Turn off legacy name discovery<HelpTip label="NetBIOS name discovery">An older Windows networking feature that can share your computer name. Turning it off disables NetBIOS on this adapter. Other discovery methods can still share the name.</HelpTip></span>
          <button className={styles.switch + (identity?.netbiosSilenced ? ' ' + styles.switchOn : '')} role="switch" aria-label="Disable NetBIOS" aria-checked={identity?.netbiosSilenced === true}
            disabled={!netbiosSupported || !identity || identity.netbiosSilenced === null || loading || busy}
            onClick={() => void run(() => window.nm.setNetbiosSilencer(!identity!.netbiosSilenced), 'NetBIOS setting confirmed')}><span className={styles.switchThumb} /></button>
        </div>
        <p className={styles.sectionSub}>{!netbiosSupported ? 'This setting is available on Windows.' : identity?.netbiosSilenced == null ? 'Current setting unavailable.' : identity.netbiosSilenced ? 'NetBIOS disabled on this adapter.' : 'NetBIOS is enabled or managed by DHCP.'}</p>
        <p className={styles.sectionSub}>Other discovery protocols can still expose your hostname.</p>
      </div>
      <div className={styles.actionCard}>
        <div className={styles.actionText}><div className={styles.actionTitle}>Enable available privacy controls</div>
          <p className={styles.actionSub}>Applies supported settings and preserves an existing display-name mask.</p></div>
        <button className={styles.stealthBtn} disabled={loading || busy || !identity || !capabilities} onClick={() => void enableAvailable()}><BoltIcon size={14} />{busy ? 'Applying…' : 'Enable controls'}</button>
      </div>
    </div>
  </Dialog>
}
