const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-renderer.cjs')
const { visibleNetworks, nextSelection, maskBssid, connectionKey, reconcileNetworks } = load('network-state.ts')
const { createSettingsQueue } = load('settings-queue.ts')
const { enablePrivacyControls } = load('privacy-actions.ts')
const { useStore, getSpeedRingBuffer } = load('store.ts')
const actions = load('network-actions.ts')
const updates = load('update-actions.ts')
const { normalizeKeyCombination, parseKeyCombination, shortcutEquals } = load('keyboard-shortcuts.ts')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const wifi = { guid: 'wifi-id', name: 'Studio', originalName: 'Private SSID', live: true, renamed: true, type: 'wifi', profile: 'Saved profile' }
const ethernet = { guid: 'ethernet-id', name: 'Wired', originalName: 'Wired', live: true, renamed: false, type: 'ethernet' }
const connection = { ssid: 'Private SSID', profile: 'Saved profile', name: 'Studio', signal: 87, band: '5 GHz', networkGuid: 'wifi-id' }
const baseSettings = { ...useStore.getState().settings, shortcuts: { ...useStore.getState().settings.shortcuts } }
const capabilities = { platform: 'windows', networkRename: true, macRandomization: true, netbiosControl: true }
const identity = { activeProfile: 'Saved profile', macRandomization: 'disabled', netbiosSilenced: false }
const update = { version: '2.3.0', url: 'https://github.com/billighost/netmask/releases/tag/v2.3.0', downloadUrl: 'https://github.com/billighost/netmask/releases/download/v2.3.0/NetMask_2.3.0_x64-setup.exe' }

global.window = { nm: {} }
global.document = { documentElement: { setAttribute: () => {} } }
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => {} } } })
const reset = () => {
  window.nm = { setSetting: async () => {} }
  useStore.getState().setSettings(baseSettings)
  useStore.setState({ networks: [], connection: null, connectionError: null, selectedGuid: null, toasts: [], networkSearch: '',
    refreshing: false, reconnecting: false, streamerBusy: false, speedTesting: false, updateInfo: null, updateDownloading: false,
    downloadProgress: null, downloadedVersion: null, capabilities, contextMenu: null, settingsOpen: false, shortcutsModalOpen: false,
    streamerStatus: { detectedApp: null, isCloaked: false, cooldownSeconds: 0 } })
}

test('filters and keyboard selection use only visible networks and hide original names when masked', () => {
  assert.deepEqual(visibleNetworks([wifi, ethernet], { showEthernet: false }, ''), [wifi])
  assert.deepEqual(visibleNetworks([wifi], { showEthernet: true }, 'PRIVATE', true), [])
  assert.deepEqual(visibleNetworks([wifi], { showEthernet: true }, 'studio', true), [wifi])
  assert.equal(nextSelection([wifi], 'ethernet-id'), 'wifi-id')
  assert.equal(nextSelection([], 'wifi-id'), null)
})
test('BSSID masking rejects malformed addresses and preserves the selected mask style', () => {
  assert.equal(maskBssid('9a-b3-e0-f6-36-c3'), '9A:B3:E0:••:••:••')
  assert.equal(maskBssid('9a:b3:e0:f6:36:c3', 'full'), 'XX:XX:XX:XX:XX:XX')
  assert.equal(maskBssid('bad'), 'XX:XX:XX:XX:XX:XX')
})
test('serialized settings writes roll back to confirmed data after successive failures', async () => {
  const rollbacks = []
  const writes = []
  const queue = createSettingsQueue({ enabled: false }, async (key, value) => { writes.push(value); throw Error('rejected') }, (key, value) => rollbacks.push(value), () => {})
  const first = queue.write('enabled', true)
  const second = queue.write('enabled', false)
  assert.deepEqual(await Promise.all([first, second]), [false, false])
  assert.deepEqual(writes, [true, false])
  assert.deepEqual(rollbacks, [false])
})
test('a failed intermediate write cannot overwrite a newer successful choice', async () => {
  const rollbacks = []
  const firstWrite = deferred()
  let calls = 0
  const queue = createSettingsQueue({ theme: 'dark' }, () => ++calls === 1 ? firstWrite.promise : Promise.resolve(), (key, value) => rollbacks.push(value), () => {})
  const first = queue.write('theme', 'light')
  const second = queue.write('theme', 'dark')
  await Promise.resolve()
  assert.equal(calls, 1)
  firstWrite.reject(Error('failed'))
  await Promise.all([first, second])
  assert.deepEqual(rollbacks, [])
  assert.equal(calls, 2)
})
test('initial native settings keep pending optimistic values and failed writes restore confirmed values', async () => {
  const request = deferred()
  const rollbacks = []
  const queue = createSettingsQueue({ theme: 'dark' }, () => request.promise, (key, value) => rollbacks.push(value), () => {})
  const writing = queue.write('theme', 'light')
  assert.equal(queue.initialize({ theme: 'dark' }).theme, 'light')
  request.reject(Error('failed'))
  await writing
  assert.deepEqual(rollbacks, ['dark'])
})
test('store settings failures restore theme and keep hidden Ethernet out of selection', async () => {
  reset()
  window.nm.setSetting = async () => { throw Error('permission denied') }
  useStore.setState({ networks: [wifi, ethernet], selectedGuid: 'ethernet-id' })
  assert.equal(await useStore.getState().updateSetting('showEthernet', false), false)
  assert.equal(useStore.getState().settings.showEthernet, true)
  assert.equal(await useStore.getState().updateSetting('theme', 'dark'), false)
  assert.equal(useStore.getState().settings.theme, 'light')
  assert.ok(useStore.getState().toasts.some(toast => toast.type === 'error'))
})
test('shortcut conflicts are unassigned and explicit empty bindings survive settings reload', async () => {
  reset()
  await useStore.getState().updateShortcut('refresh', 'Ctrl+N')
  assert.equal(useStore.getState().settings.shortcuts.focusRename, '')
  useStore.getState().setSettings(useStore.getState().settings)
  assert.equal(useStore.getState().settings.shortcuts.focusRename, '')
})

test('macOS Command uses existing Ctrl bindings and conflict resolution prevents ambiguous shortcuts', async () => {
  reset()
  assert.equal(normalizeKeyCombination({ key: 'Meta', metaKey: true }), null)
  assert.equal(normalizeKeyCombination({ key: 'r', metaKey: true }), 'Meta+R')
  assert.equal(shortcutEquals('Ctrl+R', 'Meta+R', 'macos'), true)
  assert.equal(shortcutEquals('Ctrl+R', 'Meta+R', 'windows'), false)
  assert.equal(shortcutEquals('', '', 'macos'), false)
  assert.deepEqual(parseKeyCombination('Ctrl++'), ['Ctrl', '+'])
  useStore.setState({ capabilities: { ...capabilities, platform: 'macos' } })
  await useStore.getState().updateShortcut('refresh', 'Meta+N')
  assert.equal(useStore.getState().settings.shortcuts.focusRename, '')
})

test('opening a dialog dismisses the network menu before focus moves', () => {
  reset()
  useStore.getState().setContextMenu({ x: 20, y: 20, guid: 'wifi-id' })
  useStore.getState().setSettingsOpen(true)
  assert.equal(useStore.getState().contextMenu, null)
})
test('concurrent refreshes share one snapshot and choose a visible selection', async () => {
  reset()
  const request = deferred()
  let calls = 0
  window.nm.getNetworkSnapshot = () => { calls++; return request.promise }
  useStore.getState().setSettings({ ...baseSettings, showEthernet: false })
  useStore.setState({ selectedGuid: 'ethernet-id' })
  const reads = [actions.refreshNetworks(), actions.refreshNetworks(), actions.refreshNetworks()]
  request.resolve({ networks: [wifi, ethernet], connection, connectionError: null })
  await Promise.all(reads)
  assert.equal(calls, 1)
  assert.equal(useStore.getState().selectedGuid, 'wifi-id')
  assert.equal(useStore.getState().refreshing, false)
})
test('a mutation triggers a new snapshot after an earlier read finishes', async () => {
  reset()
  const first = deferred()
  let calls = 0
  window.nm.getNetworkSnapshot = () => ++calls === 1 ? first.promise : Promise.resolve({ networks: [{ ...wifi, name: 'New name' }], connection: null })
  const read = actions.refreshNetworks()
  const mutation = actions.refreshNetworks(true)
  first.resolve({ networks: [wifi], connection })
  await Promise.all([read, mutation])
  assert.equal(calls, 2)
  assert.equal(useStore.getState().networks[0].name, 'New name')
})
test('refresh failure clears stale connection state and always ends loading', async () => {
  reset()
  useStore.setState({ networks: [wifi], connection })
  window.nm.getNetworkSnapshot = async () => { throw Error('permission denied') }
  await assert.rejects(actions.refreshNetworks(), /permission denied/)
  assert.equal(useStore.getState().connection, null)
  assert.equal(useStore.getState().networks[0].live, false)
  assert.equal(useStore.getState().refreshing, false)
})
test('reconnect uses the saved profile and cleans up loading state after a rejected result', async () => {
  reset()
  let requested
  useStore.setState({ networks: [wifi], connection, selectedGuid: 'wifi-id' })
  window.nm.reconnect = async profile => { requested = profile; return false }
  await actions.reconnectSelected()
  assert.equal(requested, 'Saved profile')
  assert.equal(useStore.getState().reconnecting, false)
  assert.ok(!useStore.getState().toasts.some(toast => toast.type === 'loading' || toast.type === 'success'))
})
test('clipboard failures never produce a success message', async () => {
  reset()
  navigator.clipboard.writeText = async () => { throw Error('not allowed') }
  assert.equal(await actions.copyText('Studio'), false)
  assert.deepEqual(useStore.getState().toasts.map(toast => toast.type), ['error'])
})
test('rapid mask clicks coalesce and a failed native status is shown as an error', async () => {
  reset()
  const request = deferred()
  let calls = 0
  window.nm.toggleStreamerCloak = () => { calls++; return request.promise }
  window.nm.getNetworkSnapshot = async () => ({ networks: [], connection: null })
  const clicks = [actions.toggleStreamer(), actions.toggleStreamer()]
  request.resolve({ detectedApp: null, isCloaked: false, cooldownSeconds: 0, error: 'permission required' })
  await Promise.all(clicks)
  assert.equal(calls, 1)
  assert.equal(useStore.getState().streamerBusy, false)
  assert.ok(!useStore.getState().toasts.some(toast => toast.type === 'success'))
})
test('enabling privacy preserves an existing mask and reports individual failures', async () => {
  let toggles = 0
  const outcomes = await enablePrivacyControls({
    setMacRandomization: async () => false, setNetbiosSilencer: async () => true,
    getStreamerStatus: async () => ({ isCloaked: true }), toggleStreamerCloak: async () => { toggles++; return { isCloaked: false } }
  }, identity, capabilities)
  assert.equal(toggles, 0)
  assert.ok(outcomes[0].error)
  assert.ok(!outcomes[1].error && !outcomes[2].error)
})
test('unsupported privacy controls are skipped and unsuccessful masking is not reported as active', async () => {
  let macCalls = 0
  const outcomes = await enablePrivacyControls({
    setMacRandomization: async () => { macCalls++; return true }, setNetbiosSilencer: async () => true,
    getStreamerStatus: async () => ({ isCloaked: false }), toggleStreamerCloak: async () => ({ isCloaked: false, error: 'unsupported profile' })
  }, identity, { ...capabilities, macRandomization: false, netbiosControl: false })
  assert.equal(macCalls, 0)
  assert.equal(outcomes.length, 1)
  assert.equal(outcomes[0].error, 'unsupported profile')
})
test('failed update downloads clear stale progress and permit retry', async () => {
  reset()
  window.nm.downloadUpdate = async () => {
    useStore.setState({ downloadProgress: { percent: 12 } })
    throw Error('download interrupted')
  }
  await updates.downloadAppUpdate(update)
  assert.equal(useStore.getState().updateDownloading, false)
  assert.equal(useStore.getState().downloadProgress, null)
  assert.equal(useStore.getState().downloadedVersion, null)
})
test('successful update downloads require a verified path and duplicate clicks coalesce', async () => {
  reset()
  const request = deferred()
  let calls = 0
  window.nm.downloadUpdate = () => { calls++; return request.promise }
  const clicks = [updates.downloadAppUpdate(update), updates.downloadAppUpdate(update)]
  request.resolve({ success: true, filePath: 'verified-installer.exe' })
  await Promise.all(clicks)
  assert.equal(calls, 1)
  assert.equal(useStore.getState().downloadedVersion, '2.3.0')
  assert.equal(useStore.getState().updateDownloading, false)
})
test('repository links use the checked external opener', async () => {
  reset()
  let opened
  window.nm.openExternal = async url => { opened = url }
  await updates.openWebPage('https://github.com/billighost/netmask')
  assert.equal(opened, 'https://github.com/billighost/netmask')
})

test('unchanged snapshots preserve object identity and changed rows replace only themselves', async () => {
  reset()
  const previous = [wifi, ethernet]
  assert.equal(reconcileNetworks(previous, structuredClone(previous)), previous)
  const changed = reconcileNetworks(previous, [{ ...wifi, name: 'New label' }, { ...ethernet }])
  assert.equal(changed[1], ethernet)
  assert.notEqual(changed[0], wifi)
  useStore.setState({ networks: previous, connection })
  useStore.getState().setTestedSpeed({ mbps: 80, mbPerSec: 10 })
  window.nm.getNetworkSnapshot = async () => ({ networks: structuredClone(previous), connection: { ...connection } })
  await actions.refreshNetworks()
  assert.equal(useStore.getState().networks, previous)
  assert.equal(useStore.getState().connection, connection)
  assert.equal(useStore.getState().testedSpeed.mbps, 80)
})

test('SSID and access point changes invalidate readings even with the same network service', async () => {
  reset()
  assert.equal(connectionKey(connection), connectionKey({ ...connection, name: 'Masked' }))
  useStore.setState({ networks: [wifi], connection, pingTelemetry: { internetMs: 15 }, captivePortal: { isCaptive: true }, dnsResults: [{ id: 'old' }] })
  useStore.getState().setSpeed({ downMBps: 20, upMBps: 1, downKbps: 20000, upKbps: 1000 })
  useStore.getState().setTestedSpeed({ mbps: 160, mbPerSec: 20 })
  window.nm.getNetworkSnapshot = async () => ({ networks: [wifi], connection: { ...connection, ssid: 'New Wi-Fi' } })
  await actions.refreshNetworks()
  const state = useStore.getState()
  assert.equal(state.speed.downMBps, 0)
  assert.equal(state.testedSpeed, null)
  assert.equal(state.pingTelemetry, null)
  assert.equal(state.captivePortal, null)
  assert.equal(state.dnsResults, null)
  assert.ok(getSpeedRingBuffer().every(value => value === 0))
  assert.notEqual(connectionKey(connection), connectionKey({ ...connection, bssid: '11:22:33:44:55:66' }))
})

test('a speed test cannot attach its result after a connection switches away and back', async () => {
  reset()
  useStore.setState({ networks: [wifi], connection })
  const pending = deferred()
  window.nm.runSpeedTest = () => pending.promise
  const running = actions.runSpeedTest()
  window.nm.getNetworkSnapshot = async () => ({ networks: [wifi], connection: { ...connection, ssid: 'Other' } })
  await actions.refreshNetworks()
  window.nm.getNetworkSnapshot = async () => ({ networks: [wifi], connection })
  await actions.refreshNetworks()
  pending.resolve({ mbps: 80, mbPerSec: 10 })
  await running
  assert.equal(useStore.getState().testedSpeed, null)
  assert.equal(useStore.getState().speedTesting, false)
  assert.ok(useStore.getState().toasts.some(toast => /connection changed/i.test(toast.message)))
})

test('a late initial update status cannot undo a newer downloaded event', async () => {
  reset()
  const pending = deferred()
  const handlers = {}
  window.nm.onUpdateAvailable = callback => { handlers.available = callback; return () => {} }
  window.nm.onUpdateProgress = callback => { handlers.progress = callback; return () => {} }
  window.nm.onUpdateDownloaded = callback => { handlers.downloaded = callback; return () => {} }
  window.nm.getUpdateStatus = () => pending.promise
  const unsubscribe = updates.subscribeToUpdates()
  handlers.downloaded({ version: '2.4.0' })
  pending.resolve({ availableUpdate: null, downloadedVersion: null, progress: null, isDownloading: false })
  await Promise.resolve()
  assert.equal(useStore.getState().downloadedVersion, '2.4.0')
  unsubscribe()
})

test('installer launch failure removes stale readiness so the download can be retried', async () => {
  reset()
  useStore.setState({ downloadedVersion: '2.4.0' })
  window.nm.installUpdate = async () => { throw Error('Installer changed; download again') }
  await updates.installAppUpdate()
  assert.equal(useStore.getState().downloadedVersion, null)
  assert.ok(useStore.getState().toasts.some(toast => toast.type === 'error'))
})
