import React, { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { CopyIcon, RestoreIcon, InfoIcon, ShieldIcon } from '../../icons'
import styles from './ContextMenu.module.css'

export const ContextMenu: React.FC = () => {
  const { contextMenu, setContextMenu, networks, selectedGuid, selectNetwork, addToast, setNetworks, setConnection, setDetailsModalGuid, connection, settings, bssidPeek, streamerStatus } = useStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!contextMenu) return
    const hide = () => setContextMenu(null)
    document.addEventListener('mousedown', hide)
    return () => document.removeEventListener('mousedown', hide)
  }, [contextMenu])

  if (!contextMenu) return null

  const net = networks.find(n => n.guid === contextMenu.guid)
  if (!net) return null

  const refresh = async () => {
    const [nets, conn] = await Promise.all([window.nm.getNetworks(), window.nm.getConnection()])
    setNetworks(nets)
    setConnection(conn)
  }

  const items = [
    {
      label: 'Select',
      icon: null,
      action: () => selectNetwork(net.guid),
    },
    {
      label: 'RF Diagnostics',
      icon: <InfoIcon size={13} />,
      action: () => setDetailsModalGuid(net.guid),
    },
    ...(net.live ? [{
      label: streamerStatus.isCloaked ? 'Deactivate Stream Safe' : 'Cloak with Stream Safe',
      icon: <ShieldIcon size={13} color="#c084fc" />,
      action: async () => {
        try {
          const s = await window.nm.toggleStreamerCloak()
          useStore.getState().setStreamerStatus(s)
          await refresh()
          addToast(s.isCloaked ? 'Stream Safe Cloak Activated' : 'Stream Safe Cloak Deactivated', 'info')
        } catch {}
      }
    }] : []),
    {
      label: 'Copy name',
      icon: <CopyIcon size={13} />,
      action: () => { navigator.clipboard.writeText(net.name); addToast('Copied to clipboard', 'info') },
    },
    {
      label: 'Copy GUID',
      icon: <CopyIcon size={13} />,
      action: () => { navigator.clipboard.writeText(net.guid); addToast('GUID copied', 'info') },
    },
    ...(net.live && connection?.bssid ? [{
      label: settings.bssidCloaking && !bssidPeek ? 'Copy BSSID (Masked)' : 'Copy BSSID',
      icon: <CopyIcon size={13} />,
      action: () => {
        const masked = settings.bssidCloaking && !bssidPeek
        const parts = connection.bssid!.trim().split(/[:-]/)
        const val = masked
          ? (settings.bssidMaskMode === 'full'
              ? 'XX:XX:XX:XX:XX:XX'
              : `${parts[0].toUpperCase()}:${parts[1].toUpperCase()}:${parts[2].toUpperCase()}:••:••:••`)
          : connection.bssid!.toUpperCase()
        navigator.clipboard.writeText(val)
        addToast(masked ? 'Copied cloaked BSSID (Stream Safe)' : 'Copied real BSSID', 'info')
      }
    }] : []),
    ...(net.renamed ? [{
      label: 'Restore original',
      icon: <RestoreIcon size={13} />,
      action: async () => {
        try { await window.nm.restore(net.guid, net.name); await refresh(); addToast('Restored', 'success') }
        catch { addToast('Restore failed', 'error') }
      },
    }] : []),
  ]

  // Clamp position to viewport to avoid offscreen positioning
  const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 190))
  const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - (items.length * 34 + 24)))

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ top: y, left: x }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className={styles.netName}>{net.name}</div>
      <div className={styles.divider} />
      {items.map((item, i) => (
        <button key={i} className={styles.item} onClick={() => { item.action(); setContextMenu(null) }}>
          {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}

