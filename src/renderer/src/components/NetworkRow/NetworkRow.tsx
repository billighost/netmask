import React from 'react'
import { useStore } from '../../store'
import { WifiIcon, EthernetIcon } from '../../icons'
import type { Network } from '../../types'
import { displayNetworkName, sharingModeActive } from '../../network-state'
import styles from './NetworkRow.module.css'

export const NetworkRow = React.memo(function NetworkRow({ net, index }: { net: Network; index: number }) {
  const selected = useStore(state => state.selectedGuid === net.guid || (!state.selectedGuid && index === 0))
  const select = useStore(state => state.selectNetwork)
  const menu = useStore(state => state.setContextMenu)
  const privateNames = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const maskName = useStore(state => state.settings.streamerMaskName)
  const displayName = displayNetworkName(net, index, privateNames, maskName)
  return <div className={styles.row + (selected ? ' ' + styles.selected : '')} role="listitem" onContextMenu={event => { event.preventDefault(); select(net.guid); menu({ x: event.clientX, y: event.clientY, guid: net.guid }) }}>
    <button type="button" className={styles.selectButton} aria-pressed={selected} tabIndex={selected ? 0 : -1}
      data-network-guid={net.guid} onClick={() => select(net.guid)} onKeyDown={event => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); menu({ x: bounds.left, y: bounds.bottom, guid: net.guid })
        }
      }}>
      <span className={styles.icon + (net.live ? ' ' + styles.iconLive : '')}>{net.type === 'wifi' ? <WifiIcon size={16} /> : <EthernetIcon size={16} />}</span>
      <span className={styles.meta}><span className={styles.name}>{displayName}</span><span className={styles.sub}>{privateNames ? 'Hidden while sharing' : net.renamed ? 'Originally ' + net.originalName : net.type === 'ethernet' ? 'Wired connection' : 'Saved Wi-Fi network'}</span></span>
      {net.live && <span className={styles.tags}><span className={styles.liveTag}>Connected</span></span>}
    </button>
    <button type="button" className={styles.menuButton} aria-label={'Actions for ' + displayName} tabIndex={selected ? 0 : -1}
      onClick={event => { select(net.guid); const bounds = event.currentTarget.getBoundingClientRect(); menu({ x: bounds.right, y: bounds.bottom, guid: net.guid }) }}>⋯</button>
  </div>
})

