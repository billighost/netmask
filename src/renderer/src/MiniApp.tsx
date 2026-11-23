import React, { useEffect, useState } from 'react'
import { useStore } from './store'
import { refreshNetworks } from './network-actions'
import { errorMessage, sharingModeActive, wiredNetworkState } from './network-state'
import { updateMiniPreferences, setMiniMenuVisibility } from './mini-actions'
import { MiniWidget } from './components/MiniWidget/MiniWidget'
import type { AppSettings } from './types'
import './styles/mini.css'

export const MiniApp: React.FC = () => {
  const preferences = useStore(state => state.settings.miniWidget)
  const theme = useStore(state => state.settings.theme)
  const maskName = useStore(state => state.settings.streamerMaskName)
  const connection = useStore(state => state.connection)
  const networks = useStore(state => state.networks)
  const connectionError = useStore(state => state.connectionError)
  const speed = useStore(state => state.speed)
  const pingTelemetry = useStore(state => state.pingTelemetry)
  const sharing = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const wired = connection ? null : wiredNetworkState(networks)
  const connected = Boolean(connection || wired)
  const [paused, setPaused] = useState(false)
  const [privacyKnown, setPrivacyKnown] = useState(false)
  const [offset, setOffset] = useState<{ top: number; right: number; effectiveScale?: number }>({ top: 0, right: 0 })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])
  useEffect(() => {
    let active = true
    let settingsEvents = 0
    let streamerEvents = 0
    useStore.getState().resetTelemetry()
    const settingsChanged = (settings: AppSettings) => { settingsEvents++; useStore.getState().setSettings(settings) }
    const refresh = () => void refreshNetworks(true, true).catch(() => {})
    const subscriptions = [
      window.nm.onSettingsChanged(settingsChanged),
      window.nm.onMiniLayout(setOffset),
      window.nm.onNetworkChanged(refresh),
      window.nm.onSpeed(sample => useStore.getState().setSpeed(sample)),
      window.nm.onPingTelemetry(sample => useStore.getState().setPingTelemetry(sample)),
      window.nm.onStreamerStatus(status => { streamerEvents++; setPrivacyKnown(true); useStore.getState().setStreamerStatus(status); refresh() })
    ]
    void (async () => {
      const results = await Promise.allSettled([window.nm.getSettings(), window.nm.getStreamerStatus()])
      if (!active) return
      if (results[0].status === 'fulfilled' && settingsEvents === 0) useStore.getState().setSettings(results[0].value)
      else if (results[0].status === 'rejected' && settingsEvents === 0) setError('Your mini mode preferences could not be loaded.')
      if (results[1].status === 'fulfilled' && streamerEvents === 0) { useStore.getState().setStreamerStatus(results[1].value); setPrivacyKnown(true) }
      else if (results[1].status === 'rejected' && streamerEvents === 0) setError('Sharing status is unavailable. Your connection name is hidden until it can be checked.')
      // The window can show unavailable readings while Windows enumerates a
      // large history of saved networks. Privacy is settled before it appears.
      if (active) await window.nm.rendererReady()
      await refreshNetworks(true, true)
    })().catch(error => { if (active) setError(errorMessage(error, 'Connection readings are unavailable')) })
    const timer = setInterval(() => { void refreshNetworks(false, true).catch(() => {}) }, 5000)
    return () => { active = false; subscriptions.forEach(unsubscribe => unsubscribe()); clearInterval(timer) }
  }, [])
  const action = async (run: () => Promise<unknown>) => {
    try { await run(); setError(null) } catch (error) { setError(errorMessage(error)); throw error }
  }
  return <>
    <MiniWidget preferences={preferences} offset={offset} effectiveScale={offset.effectiveScale} connection={connection} connected={connected}
      connectionStatus={wired ? 'Wired' : undefined} fallbackConnectionKey={wired?.key} speed={connected ? speed : { ...speed, available: false }}
      pingTelemetry={pingTelemetry} displayName={sharing || !privacyKnown ? maskName : connection?.name ?? wired?.name}
      connectionError={Boolean(connectionError)} readingsPaused={paused} onToggleReadingsPaused={() => setPaused(value => !value)}
      onPreferencesChange={async patch => { if (!await updateMiniPreferences(patch)) setError('The change could not be saved. Your previous choice was restored.') }}
      onStartDrag={() => action(() => window.nm.startMiniDrag())}
      onRestoreFull={() => action(() => window.nm.restoreMain())}
      onCustomize={() => action(() => window.nm.restoreMain(true))}
      onMenuOpenChange={open => action(() => setMiniMenuVisibility(open))} />
    {error && <button type="button" className="mini-error" role="status" onClick={() => setError(null)}>{error}</button>}
  </>
}
