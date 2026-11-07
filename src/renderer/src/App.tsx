import React, { lazy, Suspense, useEffect, useRef } from 'react'
import { useStore, DEFAULT_SHORTCUTS } from './store'
import { TitleBar } from './components/TitleBar/TitleBar'
import { HeroCard } from './components/HeroCard/HeroCard'
import { PrivacyPanel } from './components/PrivacyPanel/PrivacyPanel'
import { ToolsPanel } from './components/ToolsPanel/ToolsPanel'
import { NetworkList } from './components/NetworkList/NetworkList'
import { ActionPanel } from './components/ActionPanel/ActionPanel'
import { ToastContainer } from './components/Toast/Toast'
import { SettingsModal } from './components/SettingsModal/SettingsModal'
import { KeyboardControlsModal } from './components/KeyboardControlsModal/KeyboardControlsModal'
import { normalizeKeyCombination, shortcutEquals } from './keyboard-shortcuts'
import { ContextMenu } from './components/ContextMenu/ContextMenu'
import { UpdateBanner } from './components/UpdateBanner/UpdateBanner'
import { RecoveryBanner } from './components/RecoveryBanner/RecoveryBanner'
import { NetworkDetailsModal } from './components/NetworkDetailsModal/NetworkDetailsModal'
import { CaptivePortalBanner } from './components/CaptivePortalBanner/CaptivePortalBanner'
import { WifiShareModal } from './components/WifiShareModal/WifiShareModal'
import { DnsBenchmarkModal } from './components/DnsBenchmarkModal/DnsBenchmarkModal'
import { DeviceIdentityModal } from './components/DeviceIdentityModal/DeviceIdentityModal'
import { RoamingTunerModal } from './components/RoamingTunerModal/RoamingTunerModal'
import { FirstRunGuide } from './components/FirstRunGuide/FirstRunGuide'
import { ConnectionReportModal } from './components/ConnectionReportModal/ConnectionReportModal'
import styles from './App.module.css'
import { refreshNetworks, reconnectSelected, restoreNetworkDisplayName, toggleStreamer, startStreamerTimer, selectNetworkAndFocus, runSpeedTest } from './network-actions'
import { errorMessage, sharingModeActive, visibleNetworks } from './network-state'
import { requestAutomaticUpdateCheck, subscribeToUpdates } from './update-actions'
import { CompanionNav } from './components/CompanionNav/CompanionNav'
import { CompanionBanners } from './components/CompanionBanners/CompanionBanners'

const JournalView = lazy(() => import('./components/Journal/JournalView').then(module => ({ default: module.JournalView })))
const GoingLiveModal = lazy(() => import('./components/GoingLiveModal/GoingLiveModal').then(module => ({ default: module.GoingLiveModal })))
const NetworkPresetModal = lazy(() => import('./components/NetworkPresetModal/NetworkPresetModal').then(module => ({ default: module.NetworkPresetModal })))
const EvidenceReportModal = lazy(() => import('./components/EvidenceReportModal/EvidenceReportModal').then(module => ({ default: module.EvidenceReportModal })))

export const App: React.FC = () => {
  const autoRefreshInterval = useStore(s => s.settings.autoRefreshInterval)
  const visible = useStore(s => s.visible)
  const activeView = useStore(s => s.activeView)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const scrollSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = () => refreshNetworks().catch(error => useStore.setState({ connectionError: errorMessage(error) }))

  useEffect(() => {
    let active = true
    const unsubUpdates = subscribeToUpdates()
    // Initial load
    const bootstrap = (async () => {
        const results = await Promise.allSettled([
          window.nm.isAdmin(),
          window.nm.getSettings(),
          window.nm.getStreamerStatus(),
          window.nm.getElevationStatus(),
          window.nm.getCapabilities(),
          window.nm.getRecoveryAudit(),
          window.nm.getUiSession(),
          window.nm.getContextPrompt(),
          window.nm.getNetworkAlert(),
          window.nm.getPendingPresetUndo()
        ])
        if (!active) return
        const state = useStore.getState()
        const [admin, preferences, streamer, elevation, capabilities, recoveryAudit, uiSession, contextPrompt, networkAlert, presetUndo] = results
        if (admin.status === 'fulfilled') state.setAdminOk(admin.value)
        if (preferences.status === 'fulfilled') {
          state.setSettings(preferences.value)
          state.setOnboardingOpen(!preferences.value.onboardingCompleted)
          document.documentElement.setAttribute('data-theme', useStore.getState().settings.theme)
        } else state.addToast(errorMessage(preferences.reason, 'Settings could not be loaded'), 'error')
        if (streamer.status === 'fulfilled') state.setStreamerStatus(streamer.value)
        if (elevation.status === 'fulfilled') state.setElevationStatus(elevation.value)
        if (capabilities.status === 'fulfilled') useStore.setState({ capabilities: capabilities.value })
        if (recoveryAudit.status === 'fulfilled') useStore.setState({ recoveryAudit: recoveryAudit.value })
        if (uiSession.status === 'fulfilled') state.initializeUiSession(uiSession.value)
        if (contextPrompt.status === 'fulfilled') state.setContextPrompt(contextPrompt.value)
        if (networkAlert.status === 'fulfilled') state.setNetworkAlert(networkAlert.value)
        if (presetUndo.status === 'fulfilled' && presetUndo.value?.undoToken) {
          state.setPresetUndo({ token: presetUndo.value.undoToken, summary: presetUndo.value.summary })
        }

        await refresh()
        if (!active) return
        if (uiSession.status === 'fulfilled') requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = uiSession.value.mainScrollTop || 0 })
        // Probe the established snapshot so its initial epoch cannot invalidate
        // a fast successful response while the first network read is pending.
        const probeEpoch = useStore.getState().connectionEpoch
        window.nm.checkCaptivePortal().then(status => {
          if (active && probeEpoch === useStore.getState().connectionEpoch) useStore.getState().setCaptivePortal(status)
        }).catch(() => {})
    })().catch(() => {})

    // Speed subscription
    const unsubSpeed = window.nm.onSpeed(sample => {
      useStore.getState().setSpeed(sample)
    })

    // Ping / Jitter telemetry subscription
    const unsubPing = window.nm.onPingTelemetry(telemetry => {
      useStore.getState().setPingTelemetry(telemetry)
    })

    // Captive portal subscription
    const unsubCaptive = window.nm.onCaptivePortalStatus(status => {
      useStore.getState().setCaptivePortal(status)
    })

    const unsubNetworkChanged = window.nm.onNetworkChanged(() => {
      void refreshNetworks(true).catch(error => useStore.setState({ connectionError: errorMessage(error) }))
    })

    const unsubContextPrompt = window.nm.onContextPrompt(prompt => useStore.getState().setContextPrompt(prompt))
    const unsubNetworkAlert = window.nm.onNetworkAlert(alert => useStore.getState().setNetworkAlert(alert))
    const unsubPresetApplied = window.nm.onPresetApplied(result => {
      if (result.undoToken) useStore.getState().setPresetUndo({ token: result.undoToken, summary: result.summary })
      useStore.getState().addToast(result.summary, result.applied ? 'success' : 'info')
    })

    // Streamer status subscription
    const unsubStreamer = window.nm.onStreamerStatus(status => {
      const changed = useStore.getState().streamerStatus.isCloaked !== status.isCloaked
      useStore.getState().setStreamerStatus(status)
      if (changed) refresh()
    })

    const handleUiIntent = async (intent: 'connection-check' | 'going-live') => {
      await bootstrap
      if (!active) return
      const state = useStore.getState()
      if (state.onboardingOpen) {
        if (!await state.updateSetting('onboardingCompleted', true)) return
        state.setOnboardingOpen(false)
      }
      if (intent === 'going-live') state.setGoingLiveOpen(true)
      else { state.setReportModalOpen(true); void runSpeedTest() }
    }
    const unsubTrayCheck = window.nm.onTrayConnectionCheck(() => { void handleUiIntent('connection-check') })
    const unsubUiIntent = window.nm.onUiIntent(intent => { void handleUiIntent(intent) })

    const onVisibility = (visible: boolean) => {
      const changed = useStore.getState().visible !== visible
      useStore.setState({ visible })
      if (visible && changed) {
        refresh()
        void requestAutomaticUpdateCheck().catch(() => {})
      }
    }
    const unsubVisibility = window.nm.onVisibility(onVisibility)
    const documentVisibility = () => onVisibility(!document.hidden)
    document.addEventListener('visibilitychange', documentVisibility)
    documentVisibility()
    void window.nm.rendererReady().then(intent => { if (intent) void handleUiIntent(intent) }).catch(() => {})

    return () => {
      active = false
      unsubUpdates()
      unsubSpeed()
      unsubPing()
      unsubCaptive()
      unsubNetworkChanged()
      unsubContextPrompt()
      unsubNetworkAlert()
      unsubPresetApplied()
      unsubStreamer()
      unsubTrayCheck()
      unsubUiIntent()
      unsubVisibility()
      document.removeEventListener('visibilitychange', documentVisibility)
    }
  }, [])

  // Auto-refresh when interval setting changes
  useEffect(() => {
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    if (autoRefreshInterval > 0 && visible) {
      autoRefreshRef.current = setInterval(refresh, autoRefreshInterval * 1000)
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [autoRefreshInterval, visible])

  // Global customizable keyboard shortcuts dispatcher
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return
      const state = useStore.getState()
      const shortcuts = state.settings.shortcuts || DEFAULT_SHORTCUTS

      const combo = normalizeKeyCombination(e)
      if (!combo) return

      // Find action that matches combo
      let matchedAction: string | null = null
      for (const [actionId, keyBinding] of Object.entries(shortcuts)) {
        if (shortcutEquals(keyBinding, combo, state.capabilities?.platform)) {
          matchedAction = actionId
          break
        }
      }

      if (!matchedAction) return

      // If any modal is open, only allow closeModals or toggling the modal itself
      const isAnyModalOpen =
        state.shortcutsModalOpen ||
        state.settingsOpen ||
        Boolean(state.detailsModalGuid) ||
        Boolean(state.wifiShareModalProfile) ||
        state.dnsModalOpen ||
        state.privacyCloakModalOpen ||
        state.roamingModalOpen
        || state.onboardingOpen
        || state.reportModalOpen
        || state.goingLiveOpen
        || Boolean(state.presetModalGuid)
        || state.evidenceReportOpen
      if (isAnyModalOpen) {
        if (matchedAction !== 'closeModals' && matchedAction !== 'openSettings' && matchedAction !== 'openShortcuts') {
          return
        }
      }

      // Check active element tag
      const activeEl = document.activeElement
      const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLSelectElement || (activeEl instanceof HTMLElement && activeEl.isContentEditable)

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
          refreshNetworks().then(() => state.addToast('Networks refreshed', 'success')).catch(error => state.addToast(errorMessage(error), 'error'))
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
          if (sharingModeActive(state.streamerStatus, state.streamerBusy)) {
            state.addToast('Exit sharing mode before restoring a saved name', 'info')
            break
          }
          const net = state.networks.find(n => n.guid === state.selectedGuid)
          if (net && net.renamed) {
            restoreNetworkDisplayName(net.guid, net.originalName, net.name).then(() => {
              state.addToast('Original local label restored', 'success')
            }).catch(error => state.addToast(errorMessage(error, 'Failed to restore original name'), 'error'))
          }
          break
        }
        case 'reconnectWifi': {
          e.preventDefault()
          void reconnectSelected()
          break
        }
        case 'selectNext': {
          e.preventDefault()
          const sharing = sharingModeActive(state.streamerStatus, state.streamerBusy)
          const nets = visibleNetworks(state.networks, state.settings, sharing ? '' : state.networkSearch, sharing)
          if (nets.length > 0) {
            const currentIndex = nets.findIndex(n => n.guid === state.selectedGuid)
            const nextIndex = (currentIndex + 1) % nets.length
            selectNetworkAndFocus(nets[nextIndex].guid)
          }
          break
        }
        case 'selectPrev': {
          e.preventDefault()
          const sharing = sharingModeActive(state.streamerStatus, state.streamerBusy)
          const nets = visibleNetworks(state.networks, state.settings, sharing ? '' : state.networkSearch, sharing)
          if (nets.length > 0) {
            const currentIndex = nets.findIndex(n => n.guid === state.selectedGuid)
            const prevIndex = currentIndex <= 0 ? nets.length - 1 : currentIndex - 1
            selectNetworkAndFocus(nets[prevIndex].guid)
          }
          break
        }
        case 'filterSearch': {
          e.preventDefault()
          if (sharingModeActive(state.streamerStatus, state.streamerBusy)) break
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
          void toggleStreamer()
          break
        }
        case 'startSharingTimer': {
          e.preventDefault()
          void startStreamerTimer()
          break
        }
        case 'peekBssid': {
          e.preventDefault()
          state.peekBssid()
          break
        }
        case 'trimMemory': {
          e.preventDefault()
          if (state.capabilities?.platform !== 'windows') { state.addToast('This platform manages process memory automatically', 'info'); break }
          window.nm.trimMemory().then(() => {
            state.addToast('Working set memory trimmed', 'success')
          }).catch(error => state.addToast(errorMessage(error), 'error'))
          break
        }
        case 'runSpeedTest': {
          e.preventDefault()
          void runSpeedTest()
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
          else if (state.wifiShareModalProfile) state.setWifiShareModalProfile(null)
          else if (state.dnsModalOpen) state.setDnsModalOpen(false)
          else if (state.privacyCloakModalOpen) state.setPrivacyCloakModalOpen(false)
          else if (state.roamingModalOpen) state.setRoamingModalOpen(false)
          else if (state.reportModalOpen) state.setReportModalOpen(false)
          else if (state.goingLiveOpen) state.setGoingLiveOpen(false)
          else if (state.presetModalGuid) state.setPresetModalGuid(null)
          else if (state.evidenceReportOpen) state.setEvidenceReportOpen(false)
          else if (state.onboardingOpen) void state.updateSetting('onboardingCompleted', true).then(saved => { if (saved) state.setOnboardingOpen(false) })
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
      <main ref={mainRef} className={styles.main} id="main-content" onScroll={event => {
        if (scrollSaveRef.current) clearTimeout(scrollSaveRef.current)
        const top = event.currentTarget.scrollTop
        scrollSaveRef.current = setTimeout(() => useStore.getState().saveUiSession(top), 250)
      }}>
        <div className={styles.workspace}>
        <CaptivePortalBanner />
        <UpdateBanner />
        <RecoveryBanner />
        <CompanionBanners />
        <CompanionNav />
        {activeView === 'overview' ? <div className={styles.layout}>
          <div className={styles.connection}><HeroCard /></div>
          <div className={styles.profiles}><NetworkList /></div>
          <div className={styles.editor}><ActionPanel /></div>
          <div className={styles.privacy}><PrivacyPanel /></div>
          <div className={styles.tools}><ToolsPanel /></div>
        </div> : <Suspense fallback={<p className={styles.loading}>Opening your local journal…</p>}><JournalView /></Suspense>}
        <footer className={styles.footnote}><span>Local names. Your router stays the same.</span><button type="button" onClick={() => useStore.getState().setShortcutsModalOpen(true)}>Keyboard controls</button></footer>
        </div>
      </main>
      <ToastContainer />
      <SettingsModal />
      <KeyboardControlsModal />
      <ContextMenu />
      <NetworkDetailsModal />
      <WifiShareModal />
      <DnsBenchmarkModal />
      <DeviceIdentityModal />
      <RoamingTunerModal />
      <ConnectionReportModal />
      <FirstRunGuide />
      <Suspense fallback={null}><GoingLiveModal /><NetworkPresetModal /><EvidenceReportModal /></Suspense>
    </div>
  )
}


