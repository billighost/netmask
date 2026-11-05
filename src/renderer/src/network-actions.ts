import { useStore } from './store'
import { visibleNetworks, nextSelection, errorMessage, connectionKey, reconcileNetworks, sameFields, sharingModeActive } from './network-state'
import type { Network } from './types'

let refreshPromise: Promise<void> | null = null

export async function refreshNetworks(afterMutation = false): Promise<void> {
  if (refreshPromise) {
    try { await refreshPromise } catch (error) { if (!afterMutation) throw error }
    if (!afterMutation) return
  }
  if (refreshPromise) return refreshPromise
  useStore.getState().setRefreshing(true)
  refreshPromise = (async () => {
    const snapshot = await window.nm.getNetworkSnapshot()
    const state = useStore.getState()
    const visible = visibleNetworks(snapshot.networks, state.settings, state.networkSearch, state.streamerStatus.isCloaked)
    const changed = connectionKey(state.connection) !== connectionKey(snapshot.connection)
    if (changed) state.resetTelemetry()
    useStore.setState({ networks: reconcileNetworks(state.networks, snapshot.networks),
      connection: state.connection && snapshot.connection && sameFields(state.connection, snapshot.connection) ? state.connection : snapshot.connection,
      connectionError: snapshot.connectionError ?? null, selectedGuid: nextSelection(visible, state.selectedGuid) })
  })()
  try { await refreshPromise }
  catch (error) {
    useStore.getState().resetTelemetry()
    useStore.setState(state => ({ connection: null, connectionError: errorMessage(error), networks: state.networks.map(network => ({ ...network, live: false })) }))
    throw error
  } finally { refreshPromise = null; useStore.getState().setRefreshing(false) }
}

function confirmedNetwork(guid: string, expectedName: string): Network {
  const state = useStore.getState()
  const network = state.networks.find(item => item.guid === guid)
  const connectionMatches = state.connection?.networkGuid !== guid || state.connection.name === expectedName
  if (!network || network.name !== expectedName || !connectionMatches) {
    throw new Error('The operating system reported success, but the refreshed local label did not change. Nothing was reported as saved.')
  }
  return network
}

export async function saveNetworkDisplayName(guid: string, newName: string, currentName: string): Promise<Network> {
  const privacy = useStore.getState()
  if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) throw new Error('Exit sharing mode before changing a saved name')
  await window.nm.rename(guid, newName, currentName)
  await refreshNetworks(true)
  return confirmedNetwork(guid, newName)
}

export async function repairNetworkNameConflict(guid: string, newName: string, currentName: string): Promise<Network> {
  const privacy = useStore.getState()
  if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) throw new Error('Exit sharing mode before repairing a saved name')
  await window.nm.repairNameConflict(guid, newName, currentName)
  await refreshNetworks(true)
  return confirmedNetwork(guid, newName)
}

export async function restoreNetworkDisplayName(guid: string, originalName: string, currentName: string): Promise<Network> {
  const privacy = useStore.getState()
  if (sharingModeActive(privacy.streamerStatus, privacy.streamerBusy)) throw new Error('Exit sharing mode before restoring a saved name')
  await window.nm.restore(guid, currentName)
  await refreshNetworks(true)
  return confirmedNetwork(guid, originalName)
}

export async function reconnectSelected(): Promise<void> {
  const state = useStore.getState()
  const network = state.networks.find(network => network.guid === state.selectedGuid)
  const profile = network?.profile ?? (network?.live ? state.connection?.profile : undefined)
  if (!network || network.type !== 'wifi' || !profile) { state.addToast('Choose a saved Wi-Fi profile to reconnect', 'info'); return }
  if (state.reconnecting) return
  useStore.setState({ reconnecting: true })
  const toast = state.addToast('Reconnecting Wi-Fi…', 'loading')
  try {
    if (!await window.nm.reconnect(profile)) throw new Error('The operating system did not confirm the connection')
    await refreshNetworks(true)
    state.addToast('Wi-Fi connection confirmed', 'success')
  } catch (error) { state.addToast(errorMessage(error), 'error') }
  finally { state.removeToast(toast); useStore.setState({ reconnecting: false }) }
}

export function selectNetworkAndFocus(guid: string): void {
  useStore.getState().selectNetwork(guid)
  requestAnimationFrame(() => {
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-network-guid]'))
      .find(element => element.dataset.networkGuid === guid)
    row?.focus({ preventScroll: true })
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}

export async function toggleStreamer(): Promise<void> {
  const state = useStore.getState()
  if (state.streamerBusy) return
  useStore.setState({ streamerBusy: true, networkSearch: '', bssidPeek: false, contextMenu: null })
  try {
    const status = await window.nm.toggleStreamerCloak()
    state.setStreamerStatus(status)
    await refreshNetworks(true)
    state.addToast(status.error ?? (status.isCloaked ? 'Display-name mask applied' : 'Previous display name restored'), status.error ? 'error' : 'success')
  } catch (error) { state.addToast(errorMessage(error), 'error') }
  finally { useStore.setState({ streamerBusy: false }) }
}

export async function startStreamerTimer(minutes = useStore.getState().settings.sharingTimerMinutes): Promise<void> {
  const state = useStore.getState()
  if (state.streamerBusy) return
  useStore.setState({ streamerBusy: true, networkSearch: '', bssidPeek: false, contextMenu: null })
  try {
    const status = await window.nm.startStreamerTimer(minutes)
    state.setStreamerStatus(status)
    await refreshNetworks(true)
    state.addToast(status.error ?? `Private name active for ${minutes} minutes`, status.error ? 'error' : 'success')
  } catch (error) { state.addToast(errorMessage(error), 'error') }
  finally { useStore.setState({ streamerBusy: false }) }
}

export async function runSpeedTest(): Promise<void> {
  const state = useStore.getState()
  if (state.speedTesting) return
  const profile = connectionKey(state.connection)
  const epoch = state.connectionEpoch
  useStore.setState({ speedTesting: true })
  const toast = state.addToast('Measuring a download sample…', 'loading')
  try {
    const result = await window.nm.runSpeedTest()
    const current = useStore.getState().connection
    if (connectionKey(current) !== profile || useStore.getState().connectionEpoch !== epoch) throw new Error('The connection changed during the test. Run it again.')
    state.setTestedSpeed(result)
    state.addToast('Measured ' + result.mbps.toFixed(1) + ' Mbps download', 'success')
  } catch (error) { state.addToast(errorMessage(error), 'error') }
  finally { state.removeToast(toast); useStore.setState({ speedTesting: false }) }
}

export async function copyText(value: string, message = 'Copied to clipboard'): Promise<boolean> {
  try { await navigator.clipboard.writeText(value); useStore.getState().addToast(message, 'success'); return true }
  catch { useStore.getState().addToast('Clipboard access was not granted', 'error'); return false }
}
