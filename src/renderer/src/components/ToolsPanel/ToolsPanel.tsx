import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { DnsIcon, ShieldIcon, RadioIcon, QrCodeIcon, InfoIcon, KeyboardIcon } from '../../icons'
import styles from './ToolsPanel.module.css'

export const ToolsPanel: React.FC = () => {
  const { connection, networks, capabilities } = useStore(state => ({ connection: state.connection, networks: state.networks, capabilities: state.capabilities }), shallow)
  const state = useStore.getState()
  const activeGuid = connection?.networkGuid || networks.find(network => network.live)?.guid
  const tools = [
    { label: 'Connection details', icon: <InfoIcon size={14} />, action: () => state.setDetailsModalGuid(activeGuid!), disabled: !activeGuid },
    { label: 'Share Wi-Fi', icon: <QrCodeIcon size={14} />, action: () => state.setWifiShareModalProfile(connection!.profile || connection!.ssid), disabled: !connection || capabilities?.wifiSharing === false },
    { label: 'Compare DNS', icon: <DnsIcon size={14} />, action: () => state.setDnsModalOpen(true), disabled: false },
    { label: 'Device identity', icon: <ShieldIcon size={14} />, action: () => state.setPrivacyCloakModalOpen(true), disabled: false },
    { label: 'Adapter controls', icon: <RadioIcon size={14} />, action: () => state.setRoamingModalOpen(true), disabled: capabilities?.roamingTuning === false },
    { label: 'Keyboard controls', icon: <KeyboardIcon size={14} />, action: () => state.setShortcutsModalOpen(true), disabled: false }
  ]
  return <section className={styles.root} aria-label="Network tools">{tools.map(tool => <button key={tool.label} type="button" className={styles.tool} disabled={tool.disabled} onClick={tool.action}>{tool.icon}<span>{tool.label}</span><span className={styles.arrow} aria-hidden="true">↗</span></button>)}</section>
}
