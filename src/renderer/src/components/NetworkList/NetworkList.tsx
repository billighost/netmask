import React, { useMemo } from 'react'
import { useStore } from '../../store'
import { SearchIcon, RefreshIcon } from '../../icons'
import { Tooltip } from '../Controls/Tooltip'
import { NetworkRow } from '../NetworkRow/NetworkRow'
import styles from './NetworkList.module.css'
import { refreshNetworks } from '../../network-actions'
import { visibleNetworks, errorMessage } from '../../network-state'
import { shallow } from 'zustand/shallow'

export const NetworkList: React.FC = () => {
  const { networks, settings, refreshing, addToast, search, setSearch, privateNames, platform } = useStore(state => ({ networks: state.networks, settings: state.settings, refreshing: state.refreshing, addToast: state.addToast, search: state.networkSearch, setSearch: state.setNetworkSearch, privateNames: state.streamerStatus.isCloaked, platform: state.capabilities?.platform }), shallow)
  const visible = useMemo(() => visibleNetworks(networks, settings, search, privateNames), [networks, settings.showEthernet, search, privateNames])

  const handleRefresh = async () => {
    if (refreshing) return
    try {
      await refreshNetworks()
      addToast('Refreshed', 'success')
    } catch (error) { addToast(errorMessage(error, 'Refresh failed'), 'error') }
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>
          {platform === 'macos' ? 'Network services' : 'Saved networks'} <span className={styles.count}>{visible.length}</span>
        </span>
        <Tooltip label="Refresh saved networks"><button
          className={`${styles.iconBtn} ${refreshing ? styles.spinning : ''}`}
          aria-label="Refresh saved networks"
          disabled={refreshing}
          onClick={handleRefresh}
        >
          <RefreshIcon size={14} />
        </button></Tooltip>
      </div>

      <div className={styles.searchWrap}>
        <SearchIcon size={14} color="var(--text-muted)" className={styles.searchIcon} />
        <input
          id="filter-networks-input"
          className={styles.search}
          type="text"
          placeholder="Find a saved network…"
          aria-label="Filter saved networks"
          value={search}
          onChange={e => setSearch(e.target.value)}
          spellCheck={false}
        />
        {search && (
          <button className={styles.clearBtn} aria-label="Clear network filter" onClick={() => setSearch('')}>×</button>
        )}
      </div>

      <div className={styles.list} role="list" aria-label="Saved networks">
        {visible.length === 0 ? (
          <div className={styles.empty}>
            {search
              ? 'No networks match your search.'
              : platform === 'macos' ? 'No Wi-Fi or Ethernet services found in macOS network settings.' : 'No saved Wi-Fi networks found. Connect to a network once and it will appear here.'}
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

