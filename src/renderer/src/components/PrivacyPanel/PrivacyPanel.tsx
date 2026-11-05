import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { ShieldIcon, CopyIcon, EyeIcon, EyeOffIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { copyText, toggleStreamer } from '../../network-actions'
import { maskBssid, sharingModeActive } from '../../network-state'
import styles from './PrivacyPanel.module.css'

export const PrivacyPanel: React.FC = () => {
  const { connection, status, busy, capabilities, settings, peek } = useStore(state => ({ connection: state.connection, status: state.streamerStatus,
    busy: state.streamerBusy, capabilities: state.capabilities, settings: state.settings, peek: state.bssidPeek }), shallow)
  const sharing = sharingModeActive(status, busy)
  const bssid = connection?.bssid ? sharing ? maskBssid(connection.bssid, 'full') : settings.bssidCloaking && !peek ? maskBssid(connection.bssid, settings.bssidMaskMode) : connection.bssid.toUpperCase() : null
  return <section className={styles.root} aria-labelledby="privacy-title">
    <div className={styles.main}><ShieldIcon size={18} /><div className={styles.copy}><h2 id="privacy-title">Sharing mode <HelpTip label="Sharing mode">Immediately hides names, identifiers, credentials, editor values, dialogs, and notifications inside NetMask. It also changes the supported active network label in your operating system and keeps the original for restoration. It cannot hide information displayed by other apps.</HelpTip></h2>
      <p>{busy ? 'Protecting names before the system change finishes…' : status.manualSecondsRemaining > 0 ? 'Private for ' + Math.ceil(status.manualSecondsRemaining / 60) + ' more minutes.' : status.cooldownSeconds > 0 ? 'Restoring in ' + status.cooldownSeconds + ' seconds.' : status.isCloaked ? 'Private inside NetMask and on the supported OS label.' : 'Prepare NetMask for screenshots, calls, and recordings.'}</p></div>
      <button id="privacy-switch" type="button" className={'nm-toggle' + (status.isCloaked ? ' is-on' : '')} role="switch" aria-label="Hide network names while sharing" aria-checked={status.isCloaked}
        disabled={busy || capabilities?.networkRename === false || (!connection && !status.isCloaked)} onClick={() => void toggleStreamer()}><span /></button>
    </div>
    {status.error && <p className="nm-error" role="status">{sharing ? 'Sharing mode needs attention. Exit it to view the detailed error.' : status.error}</p>}
    {bssid && <div className={styles.address}><span>Access point <HelpTip label="Access point address">The BSSID identifies the Wi-Fi radio you are connected to. It is a hardware address, not your Wi-Fi password. You can hide some or all of it in Settings.</HelpTip></span><code>{bssid}</code><div className={styles.actions}>
      {!sharing && settings.bssidCloaking && <button type="button" aria-label="Reveal access point address for three seconds" onClick={useStore.getState().peekBssid}>{peek ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}</button>}
      <button type="button" aria-label="Copy displayed access point address" onClick={() => void copyText(bssid, 'Displayed address copied')}><CopyIcon size={13} /></button>
    </div></div>}
  </section>
}
