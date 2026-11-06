import React, { useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { NetMaskLogoIcon, CheckmarkCircleIcon, PulseIcon, ShieldIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { runSpeedTest, toggleStreamer } from '../../network-actions'
import styles from './FirstRunGuide.module.css'

export const FirstRunGuide: React.FC = () => {
  const { open, networks, connection, capabilities } = useStore(state => ({
    open: state.onboardingOpen, networks: state.networks, connection: state.connection, capabilities: state.capabilities
  }), shallow)
  const [finishing, setFinishing] = useState(false)
  if (!open) return null
  const state = useStore.getState()
  const complete = async () => {
    if (finishing) return false
    setFinishing(true)
    const saved = await state.updateSetting('onboardingCompleted', true)
    setFinishing(false)
    if (saved) state.setOnboardingOpen(false)
    return saved
  }
  const startNaming = async () => {
    if (!await complete()) return
    const target = networks.find(network => network.live) || networks[0]
    if (target) {
      state.selectNetwork(target.guid)
      requestAnimationFrame(() => {
        const input = document.getElementById('rename-network-input') as HTMLInputElement | null
        input?.focus(); input?.select()
      })
    }
  }
  const checkConnection = async () => {
    if (!await complete()) return
    state.setReportModalOpen(true)
    if (connection) void runSpeedTest()
  }
  const prepareSharing = async () => {
    if (!await complete()) return
    void toggleStreamer()
  }
  const platformNote = capabilities?.platform === 'macos'
    ? 'On macOS, local names refer to network services. NetMask asks for permission only when an action needs it.'
    : capabilities?.platform === 'windows'
      ? 'Windows may request administrator permission when you change a protected local network label.'
      : 'Available controls depend on NetworkManager and the permissions configured on this computer.'
  const actions = [
    { title: 'Name a network', description: 'Choose a familiar local name. Your router keeps broadcasting its existing Wi-Fi name.', icon: <CheckmarkCircleIcon size={18} />, action: startNaming, disabled: !networks.length },
    { title: 'Check my connection', description: 'Review router response, internet response, jitter, signal, and an optional download sample.', icon: <PulseIcon size={18} />, action: checkConnection, disabled: !connection },
    { title: 'Prepare for sharing', description: 'Hide identifiers inside NetMask and use your private name for the supported operating-system label.', icon: <ShieldIcon size={18} />, action: prepareSharing, disabled: capabilities?.networkRename === false || !connection }
  ]
  return <Dialog label="Welcome to NetMask" onClose={() => void complete()} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.hero}><span className={styles.mark}><NetMaskLogoIcon size={42} /></span><div><span className={styles.eyebrow}>A SMALL DESKTOP COMPANION</span><h1>Your networks. Your names.</h1><p>Start with one useful action. Nothing here changes your router’s broadcast Wi-Fi name.</p></div></div>
    <div className={styles.actions}>{actions.map(action => <button key={action.title} type="button" disabled={finishing || action.disabled} onClick={() => void action.action()}>
      <span className={styles.icon}>{action.icon}</span><span className={styles.actionCopy}><strong>{action.title}</strong><small>{action.description}</small></span><span className={styles.arrow} aria-hidden="true">→</span>
    </button>)}</div>
    <div className={styles.note}>{platformNote}</div>
    <div className={styles.footer}><button type="button" disabled={finishing} onClick={() => void complete()}>{finishing ? 'Saving…' : 'Explore on my own'}</button><span>You can replay this quick tour anytime from Settings.</span></div>
  </Dialog>
}
