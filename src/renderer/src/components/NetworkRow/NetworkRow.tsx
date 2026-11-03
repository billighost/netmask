import React from 'react'
import { useStore } from '../../store'
import { WifiIcon, EthernetIcon } from '../../icons'
import type { Network } from '../../types'
import styles from './NetworkRow.module.css'

interface Props {
  net: Network
  index: number
}

export const NetworkRow: React.FC<Props> = ({ net, index }) => {
  const { selectedGuid, selectNetwork, setContextMenu } = useStore()
  const isSelected = selectedGuid === net.guid

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, guid: net.guid })
  }

  return (
    <div
      className={`${styles.row} ${isSelected ? styles.selected : ''}`}
      style={{ animationDelay: `${index * 35}ms` }}
      onClick={() => selectNetwork(net.guid)}
      onContextMenu={handleContextMenu}
    >
      <div
        className={`${styles.icon} ${isSelected ? styles.iconSelected : ''} ${net.live ? styles.iconLive : ''}`}
        title={net.type === 'wifi' ? (net.live ? 'Active Wi-Fi connection' : 'Saved Wi-Fi network') : 'Ethernet'}
      >
        {net.type === 'wifi'
          ? <WifiIcon size={16} />
          : <EthernetIcon size={16} />
        }
      </div>

      <div className={styles.meta}>
        <div className={styles.name}>{net.name}</div>
        <div className={styles.sub}>
          {net.renamed
            ? <>Originally <span>{net.originalName}</span></>
            : 'Original name'
          }
        </div>
      </div>

      <div className={styles.tags}>
        {net.live && <span className={`${styles.tag} ${styles.liveTag}`}>Connected</span>}
        {net.renamed && <span className={`${styles.tag} ${styles.renamedTag}`}>Renamed</span>}
        {net.type === 'ethernet' && <span className={`${styles.tag} ${styles.ethTag}`}>Ethernet</span>}
      </div>
    </div>
  )
}

