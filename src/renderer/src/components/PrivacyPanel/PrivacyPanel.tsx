import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { ShieldIcon, CopyIcon, EyeIcon, EyeOffIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { copyText, toggleStreamer } from '../../network-actions'
import { maskBssid } from '../../network-state'
import styles from './PrivacyPanel.module.css'

export const PrivacyPanel: React.FC = () => {
  const { connection, status, busy, capabilities, settings, peek } = useStore(state => ({ connection: state.connection, status: state.streamerStatus,
    busy: state.streamerBusy, capabilities: state.capabilities, settings: state.settings, peek: state.bssidPeek }), shallow)
  const bssid = connection?.bssid ? settings.bssidCloaking && !peek ? maskBssid(connection.bssid, settings.bssidMaskMode) : connection.bssid.toUpperCase() : null
  return <section className={styles.root} aria-labelledby="privacy-title">
    <div className={styles.main}><ShieldIcon size={18} /><div className={styles.copy}><h2 id="privacy-title">Hide names while sharing <HelpTip label="Display privacy">Uses your private display name for local network labels. BSSID masking hides the router's address in NetMask. This changes what is displayed; it does not make the connection anonymous.</HelpTip></h2>
      <p>{busy ? 'Updating the display name…' : status.cooldownSeconds > 0 ? 'Restoring in ' + status.cooldownSeconds + ' seconds.' : status.isCloaked ? 'Your private display name is active.' : 'Use a private name for screenshots and calls.'}</p></div>
      <button id="privacy-switch" type="button" className={'nm-toggle' + (status.isCloaked ? ' is-on' : '')} role="switch" aria-label="Hide network names while sharing" aria-checked={status.isCloaked}
        disabled={busy || capabilities?.networkRename === false || (!connection && !status.isCloaked)} onClick={() => void toggleStreamer()}><span /></button>
    </div>
    {status.error && <p className="nm-error" role="status">{status.error}</p>}
    {bssid && <div className={styles.address}><span>Access point <HelpTip label="Access point address">The BSSID identifies the Wi-Fi radio you are connected to. It is a hardware address, not your Wi-Fi password. You can hide some or all of it in Settings.</HelpTip></span><code>{bssid}</code><div className={styles.actions}>
      {settings.bssidCloaking && <button type="button" aria-label="Reveal access point address for three seconds" onClick={useStore.getState().peekBssid}>{peek ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}</button>}
      <button type="button" aria-label="Copy displayed access point address" onClick={() => void copyText(bssid, 'Displayed address copied')}><CopyIcon size={13} /></button>
    </div></div>}
  </section>
}
