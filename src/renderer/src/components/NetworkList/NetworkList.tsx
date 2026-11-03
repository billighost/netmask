import React, { useState } from 'react'
import { useStore } from '../../store'
import { WifiIcon, EthernetIcon, SearchIcon, RefreshIcon } from '../../icons'
import { NetworkRow } from '../NetworkRow/NetworkRow'
import styles from './NetworkList.module.css'

export const NetworkList: React.FC = () => {
  const { networks, settings, refreshing, setRefreshing, setNetworks, setConnection, addToast } = useStore()
  const [search, setSearch] = useState('')

  const visible = networks.filter(n => {
    if (!settings.showEthernet && n.type === 'ethernet') return false
    if (search) return n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.originalName.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const [nets, conn] = await Promise.all([
        window.nm.getNetworks(),
        window.nm.getConnection()
      ])
      setNetworks(nets)
      setConnection(conn)
      addToast('Refreshed', 'success')
    } catch {
      addToast('Refresh failed', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>
          Saved networks {networks.length > 0 && `(${networks.length})`}
        </span>
        <button
          className={`${styles.iconBtn} ${refreshing ? styles.spinning : ''}`}
          title="Refresh"
          onClick={handleRefresh}
        >
          <RefreshIcon size={14} />
        </button>
      </div>

      <div className={styles.searchWrap}>
        <SearchIcon size={14} color="var(--text-muted)" className={styles.searchIcon} />
        <input
          id="filter-networks-input"
          className={styles.search}
          type="text"
          placeholder="Filter networks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          spellCheck={false}
        />
        {search && (
          <button className={styles.clearBtn} onClick={() => setSearch('')}>×</button>
        )}
      </div>

      <div className={styles.list}>
        {visible.length === 0 ? (
          <div className={styles.empty}>
            {search
              ? 'No networks match your search.'
              : 'No saved Wi-Fi networks found. Connect to a network once and it will appear here.'}
          </div>
        ) : (
          visible.map((net, i) => (
            <NetworkRow key={net.guid} net={net} index={i} />
          ))
        )}
      </div>
    </div>
  )
}

