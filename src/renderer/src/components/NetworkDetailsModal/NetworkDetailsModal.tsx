import React, { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import type { NetworkDetails } from '../../types'
import { CloseIcon, WifiIcon, CopyIcon, EyeIcon, EyeOffIcon, QrCodeIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { HelpTip } from '../Controls/HelpTip'
import { copyText } from '../../network-actions'
import { displayNetworkName, errorMessage, maskBssid, sharingModeActive } from '../../network-state'
import styles from '../Dialog/Panel.module.css'

const rate = (value?: number) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(0) + ' Mbps' : 'Unavailable'

export const NetworkDetailsModal: React.FC = () => {
  const { guid, networks, settings, bssidPeek, capabilities, epoch, privateNames } = useStore(state => ({
    guid: state.detailsModalGuid, networks: state.networks, settings: state.settings,
    bssidPeek: state.bssidPeek, capabilities: state.capabilities, epoch: state.connectionEpoch,
    privateNames: sharingModeActive(state.streamerStatus, state.streamerBusy)
  }), shallow)
  const [details, setDetails] = useState<NetworkDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setDetails(null); setError(null)
    if (!guid) return
    let active = true
    setLoading(true)
    window.nm.getDetails(guid).then(value => { if (active) setDetails(value) })
      .catch(error => { if (active) setError(errorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [guid, attempt, epoch])
  if (!guid) return null
  const state = useStore.getState()
  const target = networks.find(network => network.guid === guid)
  const targetIndex = Math.max(0, networks.findIndex(network => network.guid === guid))
  const rawBssid = details?.bssid
  const bssid = rawBssid ? (privateNames ? maskBssid(rawBssid, 'full') : settings.bssidCloaking && !bssidPeek ? maskBssid(rawBssid, settings.bssidMaskMode) : rawBssid.toUpperCase()) : null
  const metrics = [
    { label: 'Signal strength', value: details?.signalDbm != null ? details.signalDbm + ' dBm' : 'Unavailable', help: 'How strongly your computer hears the router. A value closer to zero is stronger: −50 dBm is stronger than −80 dBm.' },
    { label: 'Signal above noise', value: details?.snr != null ? details.snr + ' dB' : 'Unavailable', help: 'How much stronger the useful signal is than the background noise. A larger number generally makes the connection easier to hear.' },
    { label: 'Channel and band', value: details ? (details.channel > 0 ? 'Channel ' + details.channel + ' · ' : '') + details.band : 'Unavailable', help: 'The radio band and channel your router is using. These come from the connection; changing them usually happens in your router settings.' },
    { label: 'Download link rate', value: rate(details?.rxRateMbps), help: 'The Wi-Fi rate negotiated for data coming from your router. It is not a measured internet download speed.' },
    { label: 'Upload link rate', value: rate(details?.txRateMbps), help: 'The Wi-Fi rate negotiated for data going to your router. Mbps means megabits per second; eight megabits make one megabyte.' },
    { label: 'Wi-Fi security', value: details?.auth || 'Unavailable', help: 'The security method reported for this saved connection, such as WPA2 or WPA3. NetMask does not change the router’s security.' },
    { label: 'Wi-Fi version', value: details?.generation || details?.radioType || 'Unavailable', help: 'The Wi-Fi standard used by this connection. Your adapter and router decide which version they can use together.' },
    { label: 'Connection state', value: details?.lastConnected || 'Unavailable', help: 'Whether this is a current connection or a saved profile. A saved profile can have no live radio measurements.' }
  ]
  return <Dialog label="Network details" onClose={() => state.setDetailsModalGuid(null)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}>
      <div className={styles.titleGroup}><WifiIcon size={16} /><span className={styles.title}>Network details</span></div>
      <button className={styles.closeBtn} aria-label="Close network details" onClick={() => state.setDetailsModalGuid(null)}><CloseIcon size={14} /></button>
    </div>
    <div className={styles.body}>
      <div className={styles.netHeader}>
        <div className={styles.netName}>{target ? displayNetworkName(target, targetIndex, privateNames, settings.streamerMaskName) : 'Network'}</div>
        {!privateNames && target?.type === 'wifi' && target.profile && capabilities?.wifiSharing !== false && <button className={styles.shareBtn}
          onClick={() => state.setWifiShareModalProfile(target.profile!)}><QrCodeIcon size={12} />Share Wi-Fi</button>}
      </div>
      {loading ? <p role="status">Loading network details…</p> : error ? <div className="nm-error" role="alert">{privateNames ? 'Details are unavailable while sharing.' : error}
        <button className={styles.shareBtn} onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <>
        <div className={styles.grid}>
          {metrics.map(metric => <div key={metric.label} className={styles.metricCard}>
            <div className={styles.metricLabel}>{metric.label}<HelpTip label={metric.label}>{metric.help}</HelpTip></div><div className={styles.metricValue}>{metric.value}</div>
          </div>)}
          {bssid && <div className={styles.bssidCard}>
            <div className={styles.bssidLeft}><div className={styles.metricLabel}>Access point address<HelpTip label="Access point address">The BSSID identifies the Wi-Fi radio you are connected to. It is a hardware address, not a password.</HelpTip></div><div className={styles.bssidValue}>{bssid}</div></div>
            <div className={styles.bssidActions}>
              {!privateNames && settings.bssidCloaking && <button className={styles.actionBtn} aria-label="Reveal BSSID for three seconds" onClick={state.peekBssid}>
                {bssidPeek ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}</button>}
              <button className={styles.actionBtn} aria-label="Copy displayed BSSID" onClick={() => void copyText(bssid)}><CopyIcon size={14} /></button>
            </div>
          </div>}
        </div>
        <div className={styles.notice}>Only values reported for this network appear here. Saved or disconnected profiles may have no radio measurements. BSSID masking changes what NetMask displays.</div>
      </>}
    </div>
  </Dialog>
}
