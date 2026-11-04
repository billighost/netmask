import React from 'react'
import { useStore } from '../../store'
import { WifiIcon, EthernetIcon } from '../../icons'
import type { Network } from '../../types'
import styles from './NetworkRow.module.css'

export const NetworkRow: React.FC<{ net: Network; index: number }> = ({ net, index }) => {
  const selectedGuid = useStore(state => state.selectedGuid)
  const select = useStore(state => state.selectNetwork)
  const menu = useStore(state => state.setContextMenu)
  const privateNames = useStore(state => state.streamerStatus.isCloaked)
  const selected = selectedGuid === net.guid
  return <div className={styles.row + (selected ? ' ' + styles.selected : '')} role="listitem" onContextMenu={event => { event.preventDefault(); select(net.guid); menu({ x: event.clientX, y: event.clientY, guid: net.guid }) }}>
    <button type="button" className={styles.selectButton} aria-pressed={selected} tabIndex={selected || (!selectedGuid && index === 0) ? 0 : -1}
      data-network-guid={net.guid} onClick={() => select(net.guid)} onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); menu({ x: bounds.left, y: bounds.bottom, guid: net.guid })
        }
      }}>
      <span className={styles.icon + (net.live ? ' ' + styles.iconLive : '')}>{net.type === 'wifi' ? <WifiIcon size={16} /> : <EthernetIcon size={16} />}</span>
      <span className={styles.meta}><span className={styles.name}>{net.name}</span><span className={styles.sub}>{net.renamed && !privateNames ? 'Originally ' + net.originalName : net.renamed ? 'Local display name' : net.type === 'ethernet' ? 'Wired connection' : 'Saved Wi-Fi network'}</span></span>
      {net.live && <span className={styles.tags}><span className={styles.liveTag}>Connected</span></span>}
    </button>
    <button type="button" className={styles.menuButton} aria-label={'Actions for ' + net.name} tabIndex={selected ? 0 : -1}
      onClick={event => { select(net.guid); const bounds = event.currentTarget.getBoundingClientRect(); menu({ x: bounds.right, y: bounds.bottom, guid: net.guid }) }}>⋯</button>
  </div>
}

