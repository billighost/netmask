import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { DnsIcon, RadioIcon, QrCodeIcon, InfoIcon, DownloadIcon, PulseIcon } from '../../icons'
import styles from './ToolsPanel.module.css'
import { sharingModeActive } from '../../network-state'

export const ToolsPanel: React.FC = () => {
  const { connection, networks, capabilities, sharing } = useStore(state => ({ connection: state.connection, networks: state.networks, capabilities: state.capabilities,
    sharing: sharingModeActive(state.streamerStatus, state.streamerBusy) }), shallow)
  const state = useStore.getState()
  const activeGuid = connection?.networkGuid || networks.find(network => network.live)?.guid
  const tools = [
    { label: 'Going live', icon: <PulseIcon size={14} />, action: () => state.setGoingLiveOpen(true), disabled: !connection },
    { label: 'Connection journal', icon: <DownloadIcon size={14} />, action: () => state.setActiveView('journal'), disabled: false },
    { label: 'Connection details', icon: <InfoIcon size={14} />, action: () => state.setDetailsModalGuid(activeGuid!), disabled: !activeGuid },
    { label: 'Connection report', icon: <DownloadIcon size={14} />, action: () => state.setReportModalOpen(true), disabled: false },
    { label: 'Share Wi-Fi', icon: <QrCodeIcon size={14} />, action: () => state.setWifiShareModalProfile(connection!.profile || connection!.ssid), disabled: sharing || !connection || capabilities?.wifiSharing === false },
    { label: 'Compare DNS', icon: <DnsIcon size={14} />, action: () => state.setDnsModalOpen(true), disabled: false },
    { label: 'Adapter controls', icon: <RadioIcon size={14} />, action: () => state.setRoamingModalOpen(true), disabled: capabilities?.roamingTuning === false }
  ]
  return <section className={styles.root} aria-label="Network tools">{tools.map(tool => <button key={tool.label} type="button" className={styles.tool} disabled={tool.disabled} onClick={tool.action}>{tool.icon}<span>{tool.label}</span><span className={styles.arrow} aria-hidden="true">↗</span></button>)}</section>
}
