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
import styles from './App.module.css'

export const App: React.FC = () => {
  const {
    setNetworks, setConnection, setAdminOk, setSpeed, setSettings,
    settings, addToast
  } = useStore()

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = async () => {
    try {
      const [nets, conn] = await Promise.all([
        window.nm.getNetworks(),
        window.nm.getConnection()
      ])
      setNetworks(nets)
      setConnection(conn)
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
        const [admin, s] = await Promise.all([
          window.nm.isAdmin(),
          window.nm.getSettings()
        ])
        setAdminOk(admin)
        setSettings(s)
        document.documentElement.setAttribute('data-theme', s.theme)
      } catch {}
      await refresh()
    })()

    // Speed subscription
    const unsub = window.nm.onSpeed(sample => setSpeed(sample))

    return () => {
      unsub()
    }
  }, [])

  // Auto-refresh when interval setting changes
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    if (settings.autoRefreshInterval > 0) {
      autoRefreshRef.current = setInterval(refresh, settings.autoRefreshInterval * 1000)
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [settings.autoRefreshInterval])

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
        <HeroCard />
        <AdminBanner />
        <NetworkList />
        <ActionPanel />
      </div>
      <ToastContainer />
      <SettingsModal />
      <ContextMenu />
    </div>
  )
}

