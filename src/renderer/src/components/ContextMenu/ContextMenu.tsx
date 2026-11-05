import React, { useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { CopyIcon, RestoreIcon, InfoIcon, ShieldIcon, QrCodeIcon } from '../../icons'
import { copyText, restoreNetworkDisplayName, toggleStreamer } from '../../network-actions'
import { displayNetworkName, errorMessage, maskBssid, sharingModeActive } from '../../network-state'
import styles from './ContextMenu.module.css'

export const ContextMenu: React.FC = () => {
  const { contextMenu, networks, connection, settings, bssidPeek, streamerStatus, capabilities } = useStore(state => ({
    contextMenu: state.contextMenu, networks: state.networks, connection: state.connection, settings: state.settings,
    bssidPeek: state.bssidPeek, streamerStatus: state.streamerStatus, capabilities: state.capabilities
  }), shallow)
  const ref = useRef<HTMLDivElement>(null)
  const hide = () => useStore.getState().setContextMenu(null)
  useEffect(() => {
    if (!contextMenu) return
    const previous = document.activeElement as HTMLElement | null
    let restoreFocus = true
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) { restoreFocus = false; hide() } }
    const scroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) { restoreFocus = false; hide() } }
    document.addEventListener('mousedown', outside)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', hide)
      if (restoreFocus && previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true })
    }
  }, [contextMenu])
  if (!contextMenu) return null
  const net = networks.find(network => network.guid === contextMenu.guid)
  if (!net) return null
  const netIndex = Math.max(0, networks.findIndex(network => network.guid === net.guid))
  const privateNames = sharingModeActive(streamerStatus, useStore.getState().streamerBusy)
  const displayName = displayNetworkName(net, netIndex, privateNames, settings.streamerMaskName)
  const state = useStore.getState()
  const current = connection?.networkGuid === net.guid ? connection : null
  const profile = net.profile ?? current?.profile
  const items = [
    { label: 'Select network', icon: null, action: () => state.selectNetwork(net.guid) },
    ...(!privateNames && net.type === 'wifi' && profile && capabilities?.wifiSharing !== false ? [{
      label: 'Share Wi-Fi', icon: <QrCodeIcon size={13} />, action: () => state.setWifiShareModalProfile(profile)
    }] : []),
    { label: 'Network details', icon: <InfoIcon size={13} />, action: () => state.setDetailsModalGuid(net.guid) },
    ...(current && capabilities?.networkRename !== false && net.canRename !== false ? [{
      label: streamerStatus.isCloaked ? 'Restore display name' : 'Mask display name',
      icon: <ShieldIcon size={13} />, action: toggleStreamer
    }] : []),
    ...(!privateNames ? [{ label: 'Copy name', icon: <CopyIcon size={13} />, action: () => copyText(net.name) },
      { label: 'Copy network ID', icon: <CopyIcon size={13} />, action: () => copyText(net.guid, 'Network ID copied') }] : []),
    ...(!privateNames && current?.bssid ? [{
      label: settings.bssidCloaking && !bssidPeek ? 'Copy masked BSSID' : 'Copy BSSID',
      icon: <CopyIcon size={13} />, action: () => copyText(settings.bssidCloaking && !bssidPeek
        ? maskBssid(current.bssid, settings.bssidMaskMode) : current.bssid!)
    }] : []),
    ...(!privateNames && (net.renamed || net.nameSyncPending) && net.canRename !== false ? [{
      label: 'Restore original name', icon: <RestoreIcon size={13} />, action: async () => {
        try {
          await restoreNetworkDisplayName(net.guid, net.originalName, net.name)
          state.addToast('Original local label restored', 'success')
        } catch (error) { state.addToast(errorMessage(error), 'error') }
      }
    }] : [])
  ]
  const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 230))
  const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - Math.min(items.length * 34 + 42, window.innerHeight - 16) - 8))
  return (
    <div ref={ref} className={styles.menu} role="menu" aria-label={`Actions for ${displayName}`}
      style={{ top: y, left: x }} onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); hide() }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
            (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
          buttons[next]?.focus()
        }
      }}>
      <div className={styles.netName}>{displayName}</div>
      <div className={styles.divider} />
      {items.map(item => <button key={item.label} role="menuitem" className={styles.item} onClick={() => {
        hide()
        void item.action()
      }}>
        {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}{item.label}
      </button>)}
    </div>
  )
}
