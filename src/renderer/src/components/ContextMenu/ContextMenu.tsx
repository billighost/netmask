import React, { useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { CopyIcon, RestoreIcon } from '../../icons'
import styles from './ContextMenu.module.css'

export const ContextMenu: React.FC = () => {
  const { contextMenu, setContextMenu, networks, selectedGuid, selectNetwork, addToast, setNetworks, setConnection } = useStore()
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
      label: 'Copy name',
      icon: <CopyIcon size={13} />,
      action: () => { navigator.clipboard.writeText(net.name); addToast('Copied to clipboard', 'info') },
    },
    {
      label: 'Copy GUID',
      icon: <CopyIcon size={13} />,
      action: () => { navigator.clipboard.writeText(net.guid); addToast('GUID copied', 'info') },
    },
    ...(net.renamed ? [{
      label: 'Restore original',
      icon: <RestoreIcon size={13} />,
      action: async () => {
        try { await window.nm.restore(net.guid, net.name); await refresh(); addToast('Restored', 'success') }
        catch { addToast('Restore failed', 'error') }
      },
    }] : []),
  ]

  // Clamp position to viewport
  const x = Math.min(contextMenu.x, window.innerWidth - 180)
  const y = Math.min(contextMenu.y, window.innerHeight - (items.length * 34 + 16))

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

