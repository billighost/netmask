import React, { useEffect, useRef } from 'react'
import { useStore } from './store'
import { TitleBar } from './components/TitleBar/TitleBar'
import { HeroCard } from './components/HeroCard/HeroCard'
import { AdminBanner } from './components/AdminBanner/AdminBanner'
import { NetworkList } from './components/NetworkList/NetworkList'
import { ActionPanel } from './components/ActionPanel/ActionPanel'
import { ToastContainer } from './components/Toast/Toast'
import { SettingsModal } from './components/SettingsModal/SettingsModal'
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

  // Keyboard shortcut Ctrl+R = refresh, Esc = close context menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') { e.preventDefault(); refresh() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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
      <ContextMenu />
      <NetworkDetailsModal />
    </div>
  )
}

