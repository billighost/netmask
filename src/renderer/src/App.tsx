import React, { useEffect, useRef } from 'react'
import { useStore, DEFAULT_SHORTCUTS } from './store'
import { TitleBar } from './components/TitleBar/TitleBar'
import { HeroCard } from './components/HeroCard/HeroCard'
import { AdminBanner } from './components/AdminBanner/AdminBanner'
import { NetworkList } from './components/NetworkList/NetworkList'
import { ActionPanel } from './components/ActionPanel/ActionPanel'
import { ToastContainer } from './components/Toast/Toast'
import { SettingsModal } from './components/SettingsModal/SettingsModal'
import { KeyboardControlsModal, normalizeKeyCombination } from './components/KeyboardControlsModal/KeyboardControlsModal'
import { ContextMenu } from './components/ContextMenu/ContextMenu'
import { UpdateBanner } from './components/UpdateBanner/UpdateBanner'
import { NetworkDetailsModal } from './components/NetworkDetailsModal/NetworkDetailsModal'
import styles from './App.module.css'

export const App: React.FC = () => {
  const autoRefreshInterval = useStore(s => s.settings.autoRefreshInterval)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = async () => {
    try {
      const [nets, conn] = await Promise.all([
        window.nm.getNetworks(),
        window.nm.getConnection()
      ])
      useStore.getState().setNetworks(nets)
      useStore.getState().setConnection(conn)
      // Auto-select active network (or first available)
      const store = useStore.getState()
      const guidExists = store.selectedGuid && nets.some(n => n.guid === store.selectedGuid)
      if (!guidExists) {
        const live = nets.find(n => n.live)
        const first = nets[0]
        useStore.getState().selectNetwork(live?.guid ?? first?.guid ?? null)
      }
    } catch {}
  }

  useEffect(() => {
    // Initial load
    ;(async () => {
      try {
        const [admin, s, streamer, elev] = await Promise.all([
          window.nm.isAdmin(),
          window.nm.getSettings(),
          window.nm.getStreamerStatus(),
          window.nm.getElevationStatus()
        ])
        const state = useStore.getState()
        state.setAdminOk(admin)
        state.setSettings(s)
        state.setStreamerStatus(streamer)
        state.setElevationStatus(elev)
        document.documentElement.setAttribute('data-theme', s.theme)
      } catch {}
      await refresh()
    })()

    // Speed subscription: updates store directly without re-rendering App component tree
    const unsubSpeed = window.nm.onSpeed(sample => {
      useStore.getState().setSpeed(sample)
    })

    // Streamer status subscription
    const unsubStreamer = window.nm.onStreamerStatus(status => {
      useStore.getState().setStreamerStatus(status)
      refresh()
    })

    return () => {
      unsubSpeed()
      unsubStreamer()
    }
  }, [])

  // Auto-refresh when interval setting changes
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    if (autoRefreshInterval > 0) {
      autoRefreshRef.current = setInterval(refresh, autoRefreshInterval * 1000)
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [autoRefreshInterval])

  // Global customizable keyboard shortcuts dispatcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useStore.getState()
      const shortcuts = state.settings.shortcuts || DEFAULT_SHORTCUTS

      const combo = normalizeKeyCombination(e)
      if (!combo) return

      // Find action that matches combo
      let matchedAction: string | null = null
      for (const [actionId, keyBinding] of Object.entries(shortcuts)) {
        if (keyBinding && keyBinding.toLowerCase() === combo.toLowerCase()) {
          matchedAction = actionId
          break
        }
      }

      if (!matchedAction) return

      // If any modal is open, only allow closeModals or toggling the modal itself
      const isAnyModalOpen = state.shortcutsModalOpen || state.settingsOpen || Boolean(state.detailsModalGuid)
      if (isAnyModalOpen) {
        if (matchedAction !== 'closeModals' && matchedAction !== 'openSettings' && matchedAction !== 'openShortcuts') {
          return
        }
      }

      // Check active element tag
      const activeEl = document.activeElement
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement

      // If user is editing text inside an input, only allow modifier combinations (e.g. Ctrl+...) or Escape
      if (isInput) {
        const hasModifier = e.ctrlKey || e.altKey || e.metaKey
        if (!hasModifier && e.key !== 'Escape') {
          return
        }
      }

      // Execute matched action
      switch (matchedAction) {
        case 'refresh': {
          e.preventDefault()
          refresh()
          state.addToast('Refreshed networks', 'info')
          break
        }
        case 'focusRename': {
          e.preventDefault()
          const renameInput = document.getElementById('rename-network-input') as HTMLInputElement | null
          if (renameInput) {
            renameInput.focus()
            renameInput.select()
          }
          break
        }
        case 'applyRename': {
          e.preventDefault()
          const applyBtn = document.getElementById('apply-rename-btn') as HTMLButtonElement | null
          if (applyBtn && !applyBtn.disabled) {
            applyBtn.click()
          }
          break
        }
        case 'restoreOriginal': {
          e.preventDefault()
          const net = state.networks.find(n => n.guid === state.selectedGuid)
          if (net && net.renamed) {
            window.nm.restore(net.guid, net.name).then(async () => {
              await refresh()
              state.addToast(`Restored original name "${net.originalName}"`, 'success')
            }).catch(() => {
              state.addToast('Failed to restore original name', 'error')
            })
          }
          break
        }
        case 'reconnectWifi': {
          e.preventDefault()
          const net = state.networks.find(n => n.guid === state.selectedGuid)
          if (net && net.live) {
            state.addToast('Reconnecting Wi-Fi...', 'loading')
            window.nm.reconnect(net.name).then(async (ok) => {
              if (ok) state.addToast('Reconnected successfully', 'success')
              else state.addToast('Failed to reconnect', 'error')
              await refresh()
            }).catch(() => {
              state.addToast('Reconnect error', 'error')
            })
          }
          break
        }
        case 'selectNext': {
          e.preventDefault()
          const nets = state.networks
          if (nets.length > 0) {
            const currentIndex = nets.findIndex(n => n.guid === state.selectedGuid)
            const nextIndex = (currentIndex + 1) % nets.length
            state.selectNetwork(nets[nextIndex].guid)
          }
          break
        }
        case 'selectPrev': {
          e.preventDefault()
          const nets = state.networks
          if (nets.length > 0) {
            const currentIndex = nets.findIndex(n => n.guid === state.selectedGuid)
            const prevIndex = currentIndex <= 0 ? nets.length - 1 : currentIndex - 1
            state.selectNetwork(nets[prevIndex].guid)
          }
          break
        }
        case 'filterSearch': {
          e.preventDefault()
          const searchInput = document.getElementById('filter-networks-input') as HTMLInputElement | null
          if (searchInput) {
            searchInput.focus()
            searchInput.select()
          }
          break
        }
        case 'viewDetails': {
          e.preventDefault()
          if (state.selectedGuid) {
            state.setDetailsModalGuid(state.selectedGuid)
          }
          break
        }
        case 'toggleStreamer': {
          e.preventDefault()
          window.nm.toggleStreamerCloak().then(s => {
            state.setStreamerStatus(s)
            refresh()
            state.addToast(s.isCloaked ? 'Stream Safe Cloak Activated' : 'Stream Safe Cloak Deactivated', 'info')
          }).catch(() => {})
          break
        }
        case 'peekBssid': {
          e.preventDefault()
          state.peekBssid()
          break
        }
        case 'trimMemory': {
          e.preventDefault()
          window.nm.trimMemory().then(() => {
            state.addToast('Working set memory trimmed', 'success')
          }).catch(() => {})
          break
        }
        case 'runSpeedTest': {
          e.preventDefault()
          state.addToast('Running speed test...', 'info')
          window.nm.runSpeedTest().then(res => {
            state.setTestedSpeed(res)
            state.addToast(`Speed test complete: ${res.mbps.toFixed(1)} Mbps`, 'success')
          }).catch(() => {
            state.addToast('Speed test failed', 'error')
          })
          break
        }
        case 'openSettings': {
          e.preventDefault()
          state.setSettingsOpen(!state.settingsOpen)
          break
        }
        case 'openShortcuts': {
          e.preventDefault()
          state.setShortcutsModalOpen(!state.shortcutsModalOpen)
          break
        }
        case 'closeModals': {
          e.preventDefault()
          if (state.contextMenu) state.setContextMenu(null)
          else if (state.shortcutsModalOpen) state.setShortcutsModalOpen(false)
          else if (state.settingsOpen) state.setSettingsOpen(false)
          else if (state.detailsModalGuid) state.setDetailsModalGuid(null)
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={styles.app}>
      <TitleBar />
      <div className={styles.main}>
        <UpdateBanner />
        <HeroCard />
        <AdminBanner />
        <NetworkList />
        <ActionPanel />
      </div>
      <ToastContainer />
      <SettingsModal />
      <KeyboardControlsModal />
      <ContextMenu />
      <NetworkDetailsModal />
    </div>
  )
}


