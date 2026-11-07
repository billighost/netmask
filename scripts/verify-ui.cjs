// Browser checks use fictional Tauri IPC responses and never mutate a real network.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const root = path.resolve(__dirname, '..')
const appVersion = require('../package.json').version
const output = path.join(root, '.tmp/ui-checks')
fs.mkdirSync(output, { recursive: true })
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const server = http.createServer((request, response) => {
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (name.startsWith('/branding/') || name.startsWith('/assets/')) name = '/dist' + name
    if (!['/dist/', '/docs/ui-preview/', '/docs/branding/', '/resources/'].some(prefix => name.startsWith(prefix))) { response.writeHead(404).end(); return }
    const file = path.resolve(root, '.' + name)
    if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return }
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
    response.end(fs.readFileSync(file))
  } catch { response.writeHead(404).end() }
})
function nativeFixture({ theme = 'light', platform = 'windows', version = '0.0.0', onboardingCompleted = true, monitoringEnabled = true, usageTrackingEnabled = monitoringEnabled } = {}) {
  let sequence = 0, priorName = ''
  const callbacks = new Map(), listeners = new Map(), failures = new Map(), ignored = new Set(), calls = []
  const networks = [
    { guid: 'wifi-id', name: 'Studio', originalName: 'HomeFiber_5G', renamed: true, live: true, type: 'wifi', profile: 'Saved Studio profile', canRename: true },
    { guid: 'ethernet-id', name: 'Workshop', originalName: 'Workshop', renamed: false, live: false, type: 'ethernet', canRename: true }
  ]
  const connection = { ssid: 'HomeFiber_5G', profile: 'Saved Studio profile', name: 'Studio', signal: 94, signalDbm: -47, snr: 40, channel: 44, frequency: '5.220 GHz', band: '5 GHz', generation: 'Wi-Fi 5', radioType: '802.11ac', bssid: 'AA:BB:CC:DD:EE:FF', rxRateMbps: 866, txRateMbps: 866, networkGuid: 'wifi-id', interfaceName: 'Wi-Fi', interfaceGuid: 'adapter-id', auth: 'WPA2-Personal' }
  const settings = { onboardingCompleted, minimizeToTray: true, launchOnStartup: false, autoRefreshInterval: 0, theme, showEthernet: true, ultraLowMemory: false, autoCloakStreamer: false, streamerMaskName: 'Private network', customBroadcastApps: [], sharingTimerMinutes: 30, bssidCloaking: true, bssidMaskMode: 'partial', silentElevation: false, monitoringEnabled, monitoringPaused: false, historyRetentionDays: 30, usageTrackingEnabled, contextPromptsEnabled: false, networkChangeAlerts: false, behaviorChangeAlerts: false, usageLimitAlerts: false, shortcuts: {} }
  const streamer = { detectedApp: null, isCloaked: false, cooldownSeconds: 0, manualSecondsRemaining: 0, manualTimed: false }
  const identity = { hostname: 'Studio laptop', macAddress: '11:22:33:44:55:66', interfaceName: 'Wi-Fi', interfaceGuid: 'adapter-id', netbiosSilenced: false, macRandomization: 'disabled', activeProfile: 'Saved Studio profile' }
  const roaming = { supported: true, adapterName: 'Sample Wi-Fi adapter', preferredBand: '5 GHz', validPreferredBands: ['5 GHz', '2.4 GHz'], roamingAggressiveness: 'Medium', validRoamingAggressiveness: ['Low', 'Medium', 'High'] }
  const capabilities = { platform, networkRename: platform !== 'macos', wifiSharing: true, dnsConfiguration: true, macRandomization: platform !== 'macos', netbiosControl: platform === 'windows', roamingTuning: platform === 'windows', elevationTask: platform === 'windows', gpuControl: false }
  const details = { guid: 'wifi-id', bssid: connection.bssid, channel: 44, auth: 'WPA2-Personal', band: '5 GHz', frequency: '5.220 GHz', generation: 'Wi-Fi 5', signalDbm: -47, snr: 40, radioType: '802.11ac', rxRateMbps: 866, txRateMbps: 866, lastConnected: 'Active now' }
  const resolvers = [
    { id: 'cloudflare', name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', description: 'Public DNS', latencyMs: 8, isCurrent: true, isFastest: true },
    { id: 'quad9', name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', description: 'Public DNS', latencyMs: 12, isCurrent: false, isFastest: false }
  ]
  const uiSession = { activeView: 'overview', journalTab: 'history', historyRange: '24h', selectedGuid: 'wifi-id', mainScrollTop: 0 }
  const now = Date.now()
  const history = { fromMs: now - 86_400_000, toMs: now, networkGuid: 'wifi-id', coveragePercent: 83.3, sampleCount: 10,
    buckets: Array.from({ length: 12 }, (_, index) => ({ startMs: now - (12 - index) * 7_200_000, endMs: now - (11 - index) * 7_200_000,
      sampleCount: index === 4 || index === 8 ? 0 : 1, expectedSampleCount: 1, missingReason: index === 4 ? 'paused' : index === 8 ? 'not-running' : undefined,
      gatewayMedianMs: index === 4 || index === 8 ? undefined : 8 + index, internetMedianMs: index === 4 || index === 8 ? undefined : 22 + index * 2,
      internetP95Ms: index === 4 || index === 8 ? undefined : 31 + index * 3, jitterMedianMs: index === 4 || index === 8 ? undefined : 3 + index / 2,
      jitterMaxMs: index === 4 || index === 8 ? undefined : 7 + index, dropCount: index === 7 ? 1 : 0 })),
    events: [{ id: 'event-1', atMs: now - 14_400_000, kind: 'drop', title: 'Internet response was lost', detail: 'Three consecutive measured probes timed out on Studio.', redactedDetail: 'Three consecutive measured internet probes timed out.', networkGuid: 'wifi-id' }] }
  const usage = { fromMs: now - 2_592_000_000, toMs: now, networks: [{ networkGuid: 'wifi-id', displayName: 'Studio', fromMs: now - 2_592_000_000, toMs: now,
    downloadedBytes: 53 * 1024 ** 3, uploadedBytes: 7 * 1024 ** 3, totalBytes: 60 * 1024 ** 3, limitBytes: 100 * 1024 ** 3, limitPercent: 60, counterResets: 1, adapterChanges: 2 }] }
  const digest = { fromMs: now - 604_800_000, toMs: now, enoughData: true, coveragePercent: 81, summary: 'The connection was mostly steady, with one recorded interruption.',
    findings: [{ id: 'digest-1', title: 'One interruption', detail: 'Internet response was unavailable for three measured probes.', evidence: '1 drop across 420 measured samples', suggestion: 'If calls still lag, compare the same time tomorrow.' }] }
  const presets = new Map([['wifi-id', { networkGuid: 'wifi-id', enabled: true, applyMode: 'ask', label: 'Studio', theme: 'inherit', bssidVisibility: 'partial' }]])
  let contextPrompt = null, networkAlert = null
  const emit = (event, payload) => listeners.forEach((listener, id) => {
    if (listener.event === event) callbacks.get(listener.handler)?.({ event, id, payload })
  })
  window.__NM_FIXTURE__ = {
    calls, settings, capabilities, networks, connection, resolvers, history, usage, digest, uiSession,
    fail: (command, message = 'Permission denied by the test fixture') => failures.set(command, message),
    ignoreNext: command => ignored.add(command),
    emit,
    longName: () => { networks[0].name = 'A'.repeat(128); connection.name = networks[0].name },
    setContextPrompt: value => { contextPrompt = value }, setNetworkAlert: value => { networkAlert = value }
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: (_, id) => listeners.delete(id) }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback: callback => { const id = ++sequence; callbacks.set(id, callback); return id },
    unregisterCallback: id => callbacks.delete(id),
    invoke: async (command, args = {}) => {
      if (command === 'plugin:event|listen') { const id = ++sequence; listeners.set(id, args); return id }
      if (command === 'plugin:event|unlisten') { listeners.delete(args.eventId); return null }
      calls.push({ command, args })
      if (failures.has(command)) { const error = failures.get(command); failures.delete(command); throw Error(error) }
      if (ignored.delete(command)) return null
      const values = {
        nm_is_admin: true, nm_get_version: version, nm_is_maximized: false, nm_get_settings: settings,
        nm_get_network_snapshot: { networks, connection, connectionError: null }, nm_get_streamer_status: streamer,
        nm_get_elevation_status: { isElevated: true, silentElevationEnabled: false, taskConfigured: false, tier: 'admin' },
        nm_get_capabilities: capabilities, nm_check_captive_portal: { isCaptive: false, portalUrl: null, checkedAt: Date.now() },
        nm_get_update_status: { isDownloading: false, progress: null, downloadedVersion: null, downloadedFilePath: null, availableUpdate: null },
        nm_get_recovery_audit: null, nm_get_name_conflict: null, nm_get_ui_session: uiSession, nm_maximize: true,
        nm_get_connection_history: history, nm_get_network_usage: usage, nm_get_weekly_digest: digest,
        nm_get_context_prompt: contextPrompt, nm_get_network_alert: networkAlert, nm_renderer_ready: null,
        nm_check_update: null, nm_get_current_dns: { primary: '1.1.1.1', secondary: '1.0.0.1', isDhcp: false },
        nm_benchmark_dns: resolvers, nm_get_device_identity: identity, nm_get_roaming_settings: roaming,
        nm_run_speed_test: { mbps: 100, mbPerSec: 12.5 },
        nm_get_wifi_qr: { ssid: 'Studio-Guest', auth: 'WPA2', password: 'fictional-password', qrString: 'WIFI:T:WPA;S:Studio-Guest;P:fictional-password;;', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#000" d="M0 0h32v32H0Z"/></svg>', isWep: false, isOpen: false },
        nm_get_evidence_report: { fromMs: history.fromMs, toMs: history.toMs, generatedAtMs: now, timezone: 'Africa/Lagos', coveragePercent: history.coveragePercent,
          sampleCount: history.sampleCount, missingSampleCount: 2, dropCount: 1, latencySpikeCount: 2, jitterSpikeCount: 1, networkCount: 1, networkLabel: 'Studio', events: history.events,
          notes: ['Samples were scheduled every 15 seconds while monitoring was enabled.', 'Two intervals have no measured sample.'] },
        nm_run_going_live: { status: 'caution', summary: 'You can go live, but one reading deserves attention.', checkedAtMs: now,
          sharingStatus: { detectedApp: 'Zoom', isCloaked: true, cooldownSeconds: 0, manualSecondsRemaining: 0, manualTimed: false }, checks: [
            { id: 'router', label: 'Router response', status: 'ready', value: '8 ms', detail: 'The local response was quick.' },
            { id: 'internet', label: 'Internet response', status: 'caution', value: '142 ms', detail: 'The response was slower than usual.' },
            { id: 'portal', label: 'Network sign-in', status: 'ready', value: 'Clear', detail: 'No sign-in page was detected.' }] }
      }
      if (command === 'nm_set_setting') { settings[args.key] = args.value; return null }
      if (command === 'nm_run_going_live') {
        priorName = connection.name
        Object.assign(streamer, values.nm_run_going_live.sharingStatus)
        connection.name = networks[0].name = settings.streamerMaskName
        return structuredClone(values.nm_run_going_live)
      }
      if (command === 'nm_save_ui_session') { Object.assign(uiSession, args.session); return null }
      if (command === 'nm_set_network_usage_limit') { const item = usage.networks.find(value => value.networkGuid === args.networkGuid); item.limitBytes = args.limitBytes; item.limitPercent = args.limitBytes ? item.totalBytes / args.limitBytes * 100 : null; return null }
      if (command === 'nm_delete_monitoring_data') { history.buckets.length = 0; history.events.length = 0; usage.networks.length = 0; return null }
      if (command === 'nm_respond_context_prompt') { contextPrompt = null; return null }
      if (command === 'nm_dismiss_network_alert') { networkAlert = null; return null }
      if (command === 'nm_get_network_preset') return structuredClone(presets.get(args.networkGuid) || { networkGuid: args.networkGuid, enabled: false, applyMode: 'ask', label: null, theme: 'inherit', bssidVisibility: 'inherit' })
      if (command === 'nm_preview_network_preset') return { networkGuid: args.preset.networkGuid, canApplyAutomatically: args.preset.label == null, automaticLimitReason: args.preset.label ? 'A local-label change may require permission.' : undefined,
        changes: [{ label: 'Fieldnotes theme', before: 'Paper', after: args.preset.theme === 'dark' ? 'Dark' : 'Paper', requiresPermission: false }, ...(args.preset.label ? [{ label: 'Local label', before: 'Studio', after: args.preset.label, requiresPermission: true }] : [])] }
      if (command === 'nm_save_network_preset') { presets.set(args.preset.networkGuid, structuredClone(args.preset)); return null }
      if (command === 'nm_apply_network_preset') return { applied: true, summary: 'Studio preset applied', undoToken: 'undo-fixture' }
      if (command === 'nm_undo_network_preset') return null
      if (command === 'nm_get_details') return structuredClone(args.guid === 'wifi-id' ? details : { guid: args.guid, band: 'Unavailable', channel: 0, lastConnected: 'Saved profile' })
      if (command === 'nm_rename' || command === 'nm_restore') {
        const network = networks.find(item => item.guid === args.guid)
        network.name = command === 'nm_restore' ? network.originalName : args.newName
        network.renamed = network.name !== network.originalName
        if (network.live) connection.name = network.name
        return null
      }
      if (command === 'nm_toggle_streamer_cloak') {
        if (!streamer.isCloaked) priorName = connection.name
        streamer.isCloaked = !streamer.isCloaked
        connection.name = networks[0].name = streamer.isCloaked ? settings.streamerMaskName : priorName
        return structuredClone(streamer)
      }
      if (command === 'nm_set_roaming_settings') { Object.assign(roaming, args.params); return true }
      if (command === 'nm_set_mac_randomization') { identity.macRandomization = ({ no: 'disabled', yes: 'enabled', daily: 'daily' })[args.mode]; return true }
      if (command === 'nm_set_netbios_silencer') { identity.netbiosSilenced = args.enableSilence; return true }
      if (command === 'nm_apply_dns') { resolvers.forEach(item => item.isCurrent = item.id === args.resolverId); return true }
      if (command === 'nm_reconnect') return true
      if (command === 'nm_export_backup') return JSON.stringify({ 'wifi-id': 'HomeFiber_5G' })
      if (['nm_open_external', 'nm_trim_memory', 'nm_close', 'nm_minimize', 'nm_dismiss_recovery_audit'].includes(command)) return null
      if (command in values) return structuredClone(values[command])
      throw Error('Unmocked native command: ' + command)
    }
  }
}
async function geometry(page, label, modal = false) {
  const metrics = await page.evaluate(() => {
    const main = document.getElementById('main-content') || document.getElementById('main-scroll')
    const dialog = [...document.querySelectorAll('.nm-dialog, dialog[open]')].filter(element => !element.inert).at(-1)
    const box = element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight, top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom })
    return { width: innerWidth, height: innerHeight, bodyWidth: document.documentElement.scrollWidth, main: box(main), dialog: dialog && box(dialog) }
  })
  assert.ok(metrics.bodyWidth <= metrics.width + 1, label + ': body overflow')
  assert.ok(metrics.main.height > 60, label + ': main collapsed')
  assert.ok(metrics.main.scrollWidth <= metrics.main.width + 1, label + ': main overflow')
  if (modal) {
    assert.ok(metrics.dialog, label + ': missing dialog')
    assert.ok(metrics.dialog.top >= -1 && metrics.dialog.bottom <= metrics.height + 1, label + ': dialog exceeds height')
    assert.ok(metrics.dialog.scrollWidth <= metrics.dialog.width + 1, label + ': dialog overflow')
    const container = page.locator('.nm-dialog:not([inert]), dialog[open]').last()
    await container.evaluate(element => element.scrollTop = element.scrollHeight)
    if (metrics.dialog.scrollHeight > metrics.dialog.height + 2) assert.ok(await container.evaluate(element => element.scrollTop > 0), label + ': dialog cannot scroll')
  }
}
async function popupGeometry(page) {
  for (const box of await page.locator('[data-nm-popover]:visible, .preview-select-menu:visible, .preview-help:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  }))) assert.ok(box.left >= -1 && box.top >= -1 && box.right <= box.width + 1 && box.bottom <= box.height + 1, 'Popover exceeds viewport: ' + JSON.stringify(box))
}
async function appChecks(browser, base, errors, results) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(nativeFixture, { theme, version: appVersion })
    for (const size of [{ width: 320, height: 200 }, { width: 440, height: 700 }, { width: 900, height: 360 }, { width: 1200, height: 760 }]) {
      await page.setViewportSize(size); await page.goto(base + '/dist/index.html')
      await page.locator('[data-network-guid]').first().waitFor()
      await page.evaluate(() => {
        window.__NM_FIXTURE__.emit('nm:speed', { downMBps: 12.4, upMBps: 1.8, downKbps: 99200, upKbps: 14400 })
        window.__NM_FIXTURE__.emit('nm:ping-telemetry', { gatewayMs: 8, internetMs: 21, jitterMs: 2 })
      })
      const label = 'Fieldnotes ' + theme + ' ' + size.width + 'x' + size.height
      await geometry(page, label)
      assert.equal(await page.locator('select, input[type=checkbox], [title]').count(), 0, 'Visible controls must use the design system')
      await page.screenshot({ path: path.join(output, 'actual-' + theme + '-' + size.width + 'x' + size.height + '.png') })
      await page.locator('#main-content').evaluate(element => element.scrollTop = element.scrollHeight)
      if (size.height === 200) assert.ok(await page.locator('#main-content').evaluate(element => element.scrollTop > 0))
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
      assert.equal(await page.locator('#root').evaluate(element => element.inert), true, 'Background must be inert while a dialog is open')
      assert.equal(await page.locator('#root').getAttribute('aria-hidden'), 'true')
      await geometry(page, label + ' settings', true)
      const refresh = page.getByRole('combobox', { name: 'Refresh saved networks', exact: true })
      await refresh.click(); await popupGeometry(page)
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
      assert.match(await refresh.textContent(), /Every 10 seconds/)
      await refresh.focus(); await page.keyboard.press('o'); await page.keyboard.press('Enter')
      assert.match(await refresh.textContent(), /Only when I refresh/)
      await refresh.click(); await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('listbox').count(), 0)
      assert.equal(await page.getByRole('dialog', { name: 'Settings', exact: true }).count(), 1)
      const help = page.getByRole('button', { name: 'Explain Network refresh', exact: true })
      await help.click(); await popupGeometry(page); await page.keyboard.press('Escape')
      assert.equal(await help.getAttribute('aria-expanded'), 'false')
      await page.getByRole('tab', { name: 'Privacy', exact: true }).click()
      const bssid = page.getByRole('combobox', { name: 'How much of the access point address to hide', exact: true })
      await bssid.click(); await popupGeometry(page)
      await page.getByRole('option', { name: /The whole address/ }).click()
      assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.settings.bssidMaskMode), 'full')
      await page.getByRole('tab', { name: 'About', exact: true }).click()
      assert.ok(await page.getByRole('heading', { name: 'Bello Bilal', exact: true }).isVisible())
      await geometry(page, label + ' about', true)
      if (size.height === 700) {
        await page.locator('.nm-dialog').evaluate(element => element.scrollTop = 0)
        await page.screenshot({ path: path.join(output, 'about-' + theme + '.png') })
      }
      await page.getByRole('tab', { name: 'Tools', exact: true }).click()
      for (const [tool, title] of [['Keyboard controls', 'Keyboard controls'], ['This device and adapter', 'This device and adapter'], ['Compare DNS resolvers', 'Compare DNS'], ['Wi-Fi adapter settings', 'Wi-Fi adapter settings']]) {
        await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: tool, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: title, exact: true })
        await dialog.waitFor(); await geometry(page, label + ' ' + title, true)
        assert.ok(await dialog.evaluate(element => element.contains(document.activeElement)), 'Dialog focus escaped')
        if (tool === 'This device and adapter') await dialog.getByText('They do not describe the selected network or router.', { exact: false }).waitFor()
        if (title === 'Wi-Fi adapter settings') {
          const band = page.getByRole('combobox', { name: 'Preferred band', exact: true })
          await band.waitFor(); await band.click(); await popupGeometry(page)
          await page.keyboard.press('End'); await page.keyboard.press('Enter')
          await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
          assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.calls.filter(call => call.command === 'nm_set_roaming_settings').at(-1).args.params.preferredBand), '2.4 GHz')
        }
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('dialog', { name: 'Settings', exact: true }).count(), 1)
      }
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.nm-dialog').count(), 0)
      assert.equal(await page.locator('#root').getAttribute('aria-hidden'), null)
      await page.getByRole('button', { name: 'Connection details', exact: true }).click()
      await page.getByRole('button', { name: 'Explain Signal strength', exact: true }).click()
      await popupGeometry(page); await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Share Wi-Fi', exact: true }).click()
      await page.getByRole('img', { name: 'Wi-Fi connection QR code', exact: true }).waitFor()
      await geometry(page, label + ' sharing', true)
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Save QR image', exact: true }).click()
      assert.equal((await download).suggestedFilename(), 'netmask-wifi.svg')
      await page.keyboard.press('Escape')
      await page.evaluate(() => window.__NM_FIXTURE__.longName())
      await page.getByRole('button', { name: 'Refresh saved networks', exact: true }).click()
      await geometry(page, label + ' long names')
      results.push(label)
    }
    await page.close()
  }
  const page = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(nativeFixture, { version: appVersion })
  await page.goto(base + '/dist/index.html'); await page.locator('[data-network-guid]').first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Device identity', exact: true }).count(), 0, 'Device identity belongs only in Settings')
  await page.locator('#rename-network-input').fill('Reading room')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'Reading room')
  await page.getByText("The router's Wi-Fi name remains HomeFiber_5G.", { exact: false }).waitFor()
  await page.getByRole('switch', { name: 'Hide network names while sharing', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'Private network')
  assert.equal(await page.getByText('Wi-Fi name: HomeFiber_5G', { exact: true }).count(), 0)
  await page.getByRole('switch', { name: 'Hide network names while sharing', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'Reading room')
  await page.evaluate(() => window.__NM_FIXTURE__.ignoreNext('nm_rename'))
  await page.locator('#rename-network-input').fill('Unconfirmed name')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'refreshed local label did not change' }).waitFor()
  assert.equal(await page.locator('#connection-name').textContent(), 'Reading room')
  await page.evaluate(() => window.__NM_FIXTURE__.fail('nm_rename'))
  await page.locator('#rename-network-input').fill('Rejected name')
  await page.getByRole('button', { name: 'Save name', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Permission denied' }).waitFor()
  assert.equal(await page.locator('#connection-name').textContent(), 'Reading room')
  await page.evaluate(() => window.__NM_FIXTURE__.ignoreNext('nm_restore'))
  await page.getByRole('button', { name: 'Restore original', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'refreshed local label did not change' }).last().waitFor()
  assert.equal(await page.locator('#connection-name').textContent(), 'Reading room')
  await page.getByRole('button', { name: 'Restore original', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'HomeFiber_5G')
  await page.getByRole('button', { name: 'Test download speed', exact: true }).click()
  await page.getByRole('button', { name: 'Start download test', exact: true }).click()
  await page.getByText('100.0', { exact: false }).first().waitFor()
  await page.getByRole('button', { name: 'Close download speed test', exact: true }).click()
  await page.getByRole('button', { name: 'Actions for HomeFiber_5G', exact: true }).click()
  await page.getByRole('menu').waitFor(); await page.keyboard.press('End')
  assert.equal(await page.getByRole('menuitem', { name: 'Device identity', exact: true }).count(), 0, 'Per-network menus must not show device-specific identity')
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'menuitem')
  await page.keyboard.press('Control+,')
  assert.equal(await page.getByRole('menu').count(), 0)
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
  await page.getByRole('tab', { name: 'General', exact: true }).click()
  await page.evaluate(() => window.__NM_FIXTURE__.fail('nm_set_setting'))
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Permission denied' }).first().waitFor()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await page.keyboard.press('Escape')
  await page.locator('#filter-networks-input').fill('Workshop')
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.locator('[data-network-guid][aria-pressed=true]').getAttribute('data-network-guid'), 'ethernet-id')
  await page.getByRole('button', { name: 'Actions for Workshop', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Network details', exact: true }).click()
  await page.getByText('Saved profile', { exact: true }).waitFor()
  assert.equal(await page.getByText('-47 dBm', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  results.push('Rename, restore, masking, errors, settings rollback, menu, filtered keyboard navigation, and speed test')
  await page.close()
  for (const platform of ['macos', 'linux']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 200 }, reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(nativeFixture, { platform, version: appVersion })
    await page.goto(base + '/dist/index.html'); await page.locator('[data-network-guid]').first().waitFor()
    await page.keyboard.press(platform === 'macos' ? 'Meta+,' : 'Control+,')
    await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor()
    await geometry(page, platform + ' preferences', true)
    await page.keyboard.press('Escape')
    if (platform === 'macos') assert.ok(await page.getByRole('button', { name: 'Save name', exact: true }).isDisabled())
    results.push(platform + ' capability handling and shortcuts')
    await page.close()
  }
}
async function navigationAndTooltipChecks(browser, base, errors, results) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(nativeFixture, { theme, version: appVersion })
    await page.goto(base + '/dist/index.html')
    await page.locator('[data-network-guid]').first().waitFor()
    const active = page.getByRole('button', { name: 'Overview', exact: true })
    await active.hover()
    const contrast = await active.evaluate(element => {
      const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
      const luminance = value => parse(value).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
      const style = getComputedStyle(element), foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
    assert.ok(contrast >= 4.5, `${theme} active navigation hover contrast is ${contrast.toFixed(2)}:1`)
    await active.focus()
    assert.notEqual(await active.evaluate(element => getComputedStyle(element).outlineStyle), 'none', `${theme} active navigation keeps a visible keyboard focus ring`)
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(nativeFixture, { version: appVersion })
  await page.goto(base + '/dist/index.html')
  await page.locator('[data-network-guid]').first().waitFor()
  for (const name of ['Minimize window', 'Maximize window']) {
    const button = page.getByRole('button', { name, exact: true })
    await button.hover(); await page.getByRole('tooltip').waitFor(); await button.click()
    assert.equal(await page.getByRole('tooltip').count(), 0, `${name} tooltip dismisses on activation`)
  }
  const settings = page.getByRole('button', { name: 'Open settings', exact: true })
  await settings.hover(); await page.getByRole('tooltip').waitFor(); await settings.click()
  assert.equal(await page.getByRole('tooltip').count(), 0, 'Settings tooltip dismisses before its dialog opens')
  await page.keyboard.press('Escape')
  const close = page.getByRole('button', { name: 'Close to tray', exact: true })
  await close.hover(); await page.getByRole('tooltip').waitFor(); await close.click()
  assert.equal(await page.getByRole('tooltip').count(), 0, 'Close tooltip dismisses on activation')
  results.push('Active companion navigation keeps readable hover/focus contrast and title-bar tooltips dismiss on activation')
  await page.close()
}
async function previewChecks(browser, base, errors, results) {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  for (const mode of ['fieldnotes', 'switchboard', 'tide', 'mono']) {
    for (const size of [{ width: 440, height: 660 }, { width: 320, height: 200 }, { width: 740, height: 360 }]) {
      await page.setViewportSize(size); await page.goto(base + '/docs/ui-preview/app.html?mode=' + mode)
      await page.locator('[data-profile]').first().waitFor()
      const label = 'Study ' + mode + ' ' + size.width + 'x' + size.height
      await geometry(page, label)
      assert.equal(await page.locator('select, input[type=checkbox]').count(), 0)
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await geometry(page, label + ' settings', true)
      const select = page.getByRole('combobox', { name: 'Connection-history retention', exact: true })
      await select.click(); await popupGeometry(page)
      await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
      assert.match(await select.textContent(), /90 days/)
      await select.click(); await page.keyboard.press('Escape')
      assert.ok(await page.locator('#screen-dialog').evaluate(element => element.open))
      await page.keyboard.press('Escape')
      for (const tool of ['details', 'share', 'dns', 'journal', 'goinglive', 'evidence', 'preset']) {
        await page.locator('[data-dialog=' + tool + ']:visible').first().click()
        await geometry(page, label + ' ' + tool, true)
        await page.keyboard.press('Escape')
      }
      await page.getByRole('button', { name: 'Open settings', exact: true }).click()
      await page.locator('#dialog-content [data-dialog=shortcuts]').click()
      await geometry(page, label + ' shortcuts', true)
      await page.keyboard.press('Escape')
      results.push(label)
    }
  }
  await page.close()
}

async function regressionChecks(browser, base, errors, results) {
  const page = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(nativeFixture, { version: appVersion })
  await page.goto(base + '/dist/index.html')
  await page.locator('[data-network-guid]').first().waitFor()
  await page.getByRole('button', { name: 'Keyboard controls', exact: true }).first().click()
  await page.getByRole('button', { name: 'Edit shortcut for Save name', exact: true }).click()
  await page.keyboard.press('Control+Shift+E')
  await page.getByText('Shortcut saved: Ctrl+Shift+E', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit shortcut for Network details', exact: true }).click()
  await page.keyboard.press('Control+Enter')
  await page.getByText('Shortcut saved: Ctrl+Enter', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.locator('#rename-network-input').fill('A deliberate new name')
  await page.keyboard.press('Control+Enter')
  await page.getByRole('dialog', { name: 'Network details', exact: true }).waitFor()
  assert.equal(await page.locator('#connection-name').textContent(), 'Studio', 'Reassigned Enter must not submit the name editor')
  assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.calls.filter(call => call.command === 'nm_rename').length), 0)
  await page.keyboard.press('Escape')
  await page.locator('#rename-network-input').focus()
  await page.locator('#rename-network-input').evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })))
  assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.calls.filter(call => call.command === 'nm_rename').length), 0, 'IME composition must not save a name')
  await page.keyboard.press('Control+Shift+E')
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'A deliberate new name')
  results.push('Custom Enter shortcuts and IME composition preserve the intended name action')

  await page.getByRole('button', { name: 'Test download speed', exact: true }).click()
  await page.getByRole('button', { name: 'Start download test', exact: true }).click()
  await page.getByText('100.0', { exact: false }).first().waitFor()
  await page.evaluate(() => {
    const fixture = window.__NM_FIXTURE__
    fixture.emit('nm:ping-telemetry', { gatewayMs: 7, internetMs: 21, jitterMs: 2 })
    fixture.emit('nm:captive-portal-status', { isCaptive: true, portalUrl: 'https://example.test/login', checkedAt: Date.now() })
    fixture.connection.ssid = 'Different access point'
    fixture.connection.bssid = '11:22:33:44:55:66'
    fixture.connection.name = fixture.networks[0].name = 'New connection'
  })
  await page.getByRole('button', { name: 'Refresh saved networks', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('connection-name').textContent === 'New connection')
  assert.equal(await page.getByText('21 ms', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('region', { name: 'Download speed test', exact: true }).getByText('100.0', { exact: false }).count(), 0)
  assert.equal(await page.getByRole('region', { name: 'Wi-Fi sign-in', exact: true }).count(), 0)
  results.push('Changing Wi-Fi on the same service clears prior latency, download results, and sign-in banners')

  await page.evaluate(() => window.__NM_FIXTURE__.emit('nm:speed', { available: false, downMBps: 0, upMBps: 0, downKbps: 0, upKbps: 0 }))
  assert.equal(await page.locator('section[aria-labelledby="connection-name"]').getByText('\u2014', { exact: true }).count(), 5, 'Unavailable transfer readings use a dash alongside unavailable latency')
  results.push('Unavailable transfer counters display missing readings')

  await page.evaluate(() => {
    const original = window.__TAURI_INTERNALS__.invoke
    let holdNextDns = true
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      const result = await original(command, args)
      if (command === 'nm_benchmark_dns' && holdNextDns) {
        holdNextDns = false
        return new Promise(resolve => { window.__NM_FIXTURE__.releaseDns = () => resolve(result) })
      }
      return result
    }
  })
  await page.getByRole('button', { name: 'Compare DNS', exact: true }).click()
  await page.waitForFunction(() => Boolean(window.__NM_FIXTURE__.releaseDns))
  await page.evaluate(() => {
    const fixture = window.__NM_FIXTURE__
    fixture.connection.ssid = 'Latest connection'
    fixture.resolvers[0].latencyMs = 44
    fixture.emit('nm:visibility', false)
    fixture.emit('nm:visibility', true)
  })
  await page.getByRole('dialog', { name: 'Compare DNS', exact: true }).getByText('44 ms', { exact: true }).waitFor()
  await page.evaluate(() => window.__NM_FIXTURE__.releaseDns())
  // Allow the old promise and React's subsequent commit to finish.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.equal(await page.getByRole('dialog', { name: 'Compare DNS', exact: true }).getByText('8 ms', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  results.push('Open DNS comparisons refresh on a connection change and discard late responses')

  await page.evaluate(() => {
    const fixture = window.__NM_FIXTURE__
    for (let index = 2; index < 1000; index++) fixture.networks.push({ guid: 'stress-' + index, name: 'Saved network ' + index, originalName: 'Original ' + index, renamed: true, live: false, type: 'wifi', profile: 'Profile ' + index, canRename: true })
  })
  await page.getByRole('button', { name: 'Refresh saved networks', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-network-guid]').length === 1000)
  const listGeometry = await page.locator('[role="list"][aria-label="Saved networks"]').evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }))
  assert.ok(listGeometry.clientHeight >= 76 && listGeometry.clientHeight <= 360 && listGeometry.scrollHeight > listGeometry.clientHeight, 'Large saved-network collections stay inside the responsive scroll region')
  await page.locator('[data-network-guid="stress-999"]').evaluate(element => element.scrollIntoView({ block: 'center' }))
  await page.locator('[data-network-guid="stress-999"]').click()
  assert.equal(await page.locator('[data-network-guid="stress-999"]').getAttribute('aria-pressed'), 'true')
  await geometry(page, '1000 saved networks')
  await page.keyboard.press('Control+F')
  assert.equal(await page.locator('#filter-networks-input').evaluate(element => getComputedStyle(element).outlineStyle), 'none')
  await page.locator('#filter-networks-input').fill('Saved network 999')
  await page.keyboard.press('ArrowDown')
  assert.equal(await page.locator('[data-network-guid][aria-pressed=true]').getAttribute('data-network-guid'), 'stress-999')
  results.push('1000 saved networks remain scrollable, selectable, searchable, and keyboard accessible')
  await page.close()
}
async function productFeatureChecks(browser, base, errors, results) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce', acceptDownloads: true })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(nativeFixture, { version: appVersion })
  await page.goto(base + '/dist/index.html')
  await page.locator('[data-network-guid]').first().waitFor()

  await page.getByRole('button', { name: 'Connection report', exact: true }).click()
  const report = page.getByRole('dialog', { name: 'Connection report', exact: true })
  await report.waitFor(); await geometry(page, 'Connection report HTML', true)
  const htmlSource = await page.locator('iframe[title="HTML report preview"]').getAttribute('srcdoc')
  assert.match(htmlSource, /Redacted/)
  assert.doesNotMatch(htmlSource, /HomeFiber_5G|Studio|AA:BB:CC|Saved Studio profile/)
  assert.match(htmlSource, /<h2>Suggested next steps<\/h2>/, 'HTML report preview includes its final section')
  const htmlFrame = page.frames().find(frame => frame !== page.mainFrame())
  assert.ok(htmlFrame, 'HTML report preview frame is available')
  const previewSize = await htmlFrame.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight }))
  if (previewSize.scrollHeight > previewSize.height) await htmlFrame.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  const scrolled = await htmlFrame.evaluate(() => scrollY)
  await page.evaluate(() => window.__NM_FIXTURE__.emit('nm:speed', { downMBps: 20, upMBps: 2, downKbps: 20000, upKbps: 2000 }))
  await page.waitForTimeout(150)
  assert.equal(await htmlFrame.evaluate(() => scrollY), scrolled, 'Live readings do not move the HTML report preview')
  await report.getByRole('button', { name: 'Markdown', exact: true }).click()
  const markdown = await report.locator('pre').innerText()
  assert.match(markdown, /\| Connection \| Redacted \|/)
  assert.doesNotMatch(markdown, /HomeFiber_5G|Studio|AA:BB:CC|Saved Studio profile/)
  await report.getByRole('switch', { name: 'Include network identifiers', exact: true }).click()
  await report.getByText(/HomeFiber_5G/).waitFor()
  const download = page.waitForEvent('download')
  await report.getByRole('button', { name: 'Save Markdown', exact: true }).click()
  assert.match((await download).suggestedFilename(), /^netmask-connection-report-\d{4}-\d{2}-\d{2}\.md$/)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Share Wi-Fi', exact: true }).click()
  await page.getByRole('img', { name: 'Wi-Fi connection QR code', exact: true }).waitFor()
  await page.evaluate(() => {
    const fixture = window.__NM_FIXTURE__
    fixture.emit('nm:streamer-status', { detectedApp: null, isCloaked: true, cooldownSeconds: 0, error: 'HomeFiber_5G private failure' })
  })
  await page.getByText('Credentials stay hidden while sharing', { exact: true }).waitFor()
  assert.equal(await page.getByRole('img', { name: 'Wi-Fi connection QR code', exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Connection report', exact: true }).click()
  const sharingReport = page.getByRole('dialog', { name: 'Connection report', exact: true })
  assert.ok(await sharingReport.getByRole('switch', { name: 'Include network identifiers', exact: true }).isDisabled())
  assert.doesNotMatch(await sharingReport.locator('pre').innerText(), /HomeFiber_5G|Studio|AA:BB:CC|Private network/)
  results.push('Reports preview and download exact HTML or Markdown with identifier redaction and sharing-mode lockout')
  results.push('Wi-Fi credentials unload immediately when sharing mode becomes active')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('tab', { name: 'Privacy', exact: true }).click()
  assert.ok(await settings.locator('#streamer-mask-name').isDisabled())
  assert.equal(await settings.getByText('HomeFiber_5G private failure', { exact: true }).count(), 0)
  await settings.getByRole('tab', { name: 'Tools', exact: true }).click()
  assert.ok(await settings.getByRole('button', { name: 'Export backup', exact: true }).isDisabled())
  assert.ok(await settings.getByRole('button', { name: 'Restore all original names', exact: true }).isDisabled())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Compare DNS', exact: true }).click()
  const dns = page.getByRole('dialog', { name: 'Compare DNS', exact: true })
  await dns.getByText('Hidden while sharing', { exact: true }).first().waitFor()
  assert.equal(await dns.getByText('1.1.1.1', { exact: false }).count(), 0)
  results.push('Sharing mode blocks original-name operations and hides detailed Settings and DNS identifiers')
  await page.close()

  const fresh = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  fresh.on('pageerror', error => errors.push(error.message))
  await fresh.addInitScript(nativeFixture, { version: appVersion, onboardingCompleted: false, monitoringEnabled: false })
  await fresh.goto(base + '/dist/index.html')
  const guide = fresh.getByRole('dialog', { name: 'Welcome to NetMask', exact: true })
  await guide.waitFor(); await geometry(fresh, 'First-run guide', true)
  for (const action of ['Start my local journal', 'Going live', 'Name a network', 'Explore on my own']) {
    assert.ok(await guide.getByRole('button', { name: new RegExp(action) }).isVisible())
  }
  assert.equal(await fresh.evaluate(() => window.__NM_FIXTURE__.calls.some(call => ['nm_rename', 'nm_toggle_streamer_cloak', 'nm_run_speed_test'].includes(call.command))), false)
  await guide.getByRole('button', { name: /Name a network/ }).click()
  await fresh.locator('#rename-network-input').waitFor()
  await fresh.waitForFunction(() => document.activeElement?.id === 'rename-network-input')
  assert.equal(await fresh.evaluate(() => window.__NM_FIXTURE__.settings.onboardingCompleted), true)
  results.push('Fresh profiles receive one action-focused guide without permission-triggering work on open')
  await fresh.close()

  const returning = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  returning.on('pageerror', error => errors.push(error.message))
  await returning.addInitScript(nativeFixture, { version: appVersion, onboardingCompleted: true })
  await returning.goto(base + '/dist/index.html')
  await returning.locator('[data-network-guid]').first().waitFor()
  await returning.getByRole('button', { name: 'Open settings', exact: true }).click()
  const returningSettings = returning.getByRole('dialog', { name: 'Settings', exact: true })
  await returningSettings.getByRole('button', { name: 'Start quick tour', exact: true }).click()
  assert.equal(await returningSettings.count(), 0, 'Settings closes before the tutorial opens')
  const replayedGuide = returning.getByRole('dialog', { name: 'Welcome to NetMask', exact: true })
  await replayedGuide.waitFor()
  await geometry(returning, 'Replayed quick tour', true)
  assert.ok(await replayedGuide.evaluate(element => element.contains(document.activeElement)), 'Replayed tutorial owns focus')
  assert.equal(await returning.evaluate(() => window.__NM_FIXTURE__.settings.onboardingCompleted), true)
  await replayedGuide.getByRole('button', { name: 'Explore on my own', exact: true }).click()
  await replayedGuide.waitFor({ state: 'detached' })
  results.push('Settings closes before replaying the focused, non-destructive quick tour')
  await returning.close()

  const trayFresh = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  trayFresh.on('pageerror', error => errors.push(error.message))
  await trayFresh.addInitScript(nativeFixture, { version: appVersion, onboardingCompleted: false })
  await trayFresh.goto(base + '/dist/index.html')
  await trayFresh.locator('[data-network-guid]').first().waitFor()
  await trayFresh.evaluate(() => window.__NM_FIXTURE__.emit('nm:tray-connection-check'))
  await trayFresh.getByRole('dialog', { name: 'Connection report', exact: true }).waitFor()
  assert.equal(await trayFresh.getByRole('dialog', { name: 'Welcome to NetMask', exact: true }).count(), 0)
  assert.equal(await trayFresh.evaluate(() => window.__NM_FIXTURE__.settings.onboardingCompleted), true)
  results.push('Tray connection checks complete onboarding before opening one report')
  await trayFresh.close()
}
async function companionFeatureChecks(browser, base, errors, results) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 }, reducedMotion: 'reduce', acceptDownloads: true })
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(nativeFixture, { version: appVersion })
  await page.goto(base + '/dist/index.html')
  await page.locator('[data-network-guid]').first().waitFor()
  assert.ok(await page.evaluate(() => window.__NM_FIXTURE__.calls.some(call => call.command === 'nm_renderer_ready')), 'Renderer readiness is reported after listeners install')

  await page.getByRole('button', { name: 'Journal', exact: true }).click()
  await page.getByRole('heading', { name: 'What happened, and when.', exact: true }).waitFor()
  await geometry(page, 'Connection journal 320x200')
  await page.getByRole('img', { name: 'Internet latency and jitter history', exact: true }).waitFor()
  const tableDetails = page.getByText('Accessible measurement table', { exact: true })
  await tableDetails.click()
  await page.getByRole('cell', { name: 'Monitoring paused', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'NetMask was not running', exact: true }).waitFor()
  assert.match(await page.getByRole('img', { name: 'Internet latency and jitter history', exact: true }).locator('desc').textContent(), /Gaps are shown/)

  await page.getByRole('button', { name: 'Provider evidence report', exact: true }).click()
  const evidence = page.getByRole('dialog', { name: 'Provider evidence report', exact: true })
  await evidence.waitFor(); await geometry(page, 'Provider evidence report 320x200', true)
  const evidenceSource = await evidence.locator('iframe[title="Provider evidence HTML preview"]').getAttribute('srcdoc')
  assert.match(evidenceSource, /Redacted/); assert.doesNotMatch(evidenceSource, /Studio/)
  const evidenceFrame = page.frames().find(frame => frame !== page.mainFrame())
  assert.ok(evidenceFrame, 'Provider report preview frame is available')
  const evidenceSize = await evidenceFrame.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight }))
  assert.ok(evidenceSize.scrollHeight > evidenceSize.height, 'Provider report preview scrolls independently')
  await evidence.getByRole('button', { name: 'Markdown', exact: true }).click()
  assert.doesNotMatch(await evidence.locator('pre').innerText(), /Studio/)
  await evidence.getByRole('switch', { name: 'Include network identifiers', exact: true }).click()
  await evidence.getByText(/Studio/).waitFor()
  const evidenceDownload = page.waitForEvent('download')
  await evidence.getByRole('button', { name: 'Save Markdown', exact: true }).click()
  assert.match((await evidenceDownload).suggestedFilename(), /^netmask-provider-evidence-/)
  await page.keyboard.press('Escape')
  results.push('Connection history exposes real gaps, accessible chart data, and exact redacted provider evidence at 320x200')

  const historyTab = page.getByRole('tab', { name: 'History', exact: true })
  await historyTab.focus(); await page.keyboard.press('ArrowRight')
  await page.getByRole('heading', { name: 'Counted per saved network.', exact: true }).waitFor()
  const usageCard = page.getByText('60 GB', { exact: true }).locator('..')
  await page.getByLabel('Limit in GB', { exact: true }).fill('80')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.calls.filter(call => call.command === 'nm_set_network_usage_limit').at(-1).args.limitBytes), 80 * 1024 ** 3)
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  await page.getByText('The connection was mostly steady, with one recorded interruption.', { exact: true }).waitFor()
  results.push('Usage limits and the evidence-backed weekly digest are keyboard reachable')

  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.getByRole('button', { name: 'Going live', exact: true }).click()
  const goingLive = page.getByRole('dialog', { name: 'Going live', exact: true })
  await goingLive.waitFor(); await geometry(page, 'Going live 320x200', true)
  await goingLive.getByRole('button', { name: 'Check and turn on sharing mode', exact: true }).click()
  await goingLive.getByText('READY WITH CAUTIONS', { exact: true }).waitFor()
  await goingLive.getByText('142 ms', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  const sharingSwitch = page.getByRole('switch', { name: 'Hide network names while sharing', exact: true })
  await sharingSwitch.click()
  await page.waitForFunction(() => {
    const control = document.getElementById('privacy-switch')
    return control?.getAttribute('aria-checked') === 'false' && !control.hasAttribute('disabled')
  })

  const networkActions = page.getByRole('button', { name: 'Actions for Studio', exact: true })
  const presetAction = page.getByRole('menuitem', { name: 'Network preset', exact: true })
  let presetOpened = false
  for (let attempt = 0; attempt < 3 && !presetOpened; attempt++) {
    await networkActions.click()
    try { await presetAction.waitFor({ timeout: 3000 }); await presetAction.click(); presetOpened = true }
    catch { await page.keyboard.press('Escape'); await page.waitForTimeout(50) }
  }
  assert.equal(presetOpened, true, 'Network preset remains reachable after sharing mode restores at the minimum window')
  const preset = page.getByRole('dialog', { name: 'Network preset', exact: true })
  await preset.waitFor(); await geometry(page, 'Network preset 320x200', true)
  await preset.getByRole('combobox', { name: 'Theme for this network', exact: true }).click()
  await page.getByRole('option', { name: 'Dark', exact: true }).click()
  await preset.getByRole('button', { name: 'Preview changes', exact: true }).click()
  await preset.getByRole('heading', { name: 'Preview', exact: true }).waitFor()
  await preset.getByRole('button', { name: 'Save and apply', exact: true }).click()
  await page.getByText('Network preset applied', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  assert.ok(await page.evaluate(() => window.__NM_FIXTURE__.calls.some(call => call.command === 'nm_undo_network_preset')))
  results.push('Going live and network preset preview/apply/undo remain usable at the minimum window')

  await page.evaluate(() => {
    const prompt = { id: 'prompt-1', kind: 'broadcast-app', title: 'Zoom is running', detail: 'Turn on sharing mode before the call?', appName: 'Zoom' }
    window.__NM_FIXTURE__.setContextPrompt(prompt); window.__NM_FIXTURE__.emit('nm:context-prompt', prompt)
  })
  await page.getByText('Zoom is running', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Not now', exact: true }).click()
  await page.evaluate(() => {
    const alert = { id: 'alert-1', kind: 'behavior-change', title: 'Connection behavior changed', detail: 'Internet response was sharply slower than the established local baseline.', detectedAtMs: Date.now(), networkGuid: 'wifi-id' }
    window.__NM_FIXTURE__.setNetworkAlert(alert); window.__NM_FIXTURE__.emit('nm:network-alert', alert)
  })
  await page.getByText('Connection behavior changed', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()

  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('tab', { name: 'Monitoring', exact: true }).click()
  await geometry(page, 'Monitoring settings 320x200', true)
  const historyMonitoring = settings.getByRole('switch', { name: 'Keep local connection history', exact: true })
  await historyMonitoring.click()
  const usageTracking = settings.getByRole('switch', { name: 'Count data per saved network', exact: true })
  assert.equal(await usageTracking.isEnabled(), true, 'Usage tracking stays independently available when history is off')
  assert.equal(await usageTracking.isChecked(), true, 'Turning history off does not turn usage tracking off')
  assert.equal(await settings.getByRole('switch', { name: 'Warn near a data limit', exact: true }).isEnabled(), true, 'Usage-limit alerts depend on usage tracking, not history')
  const pause = settings.getByRole('switch', { name: 'Pause monitoring', exact: true })
  assert.equal(await pause.isEnabled(), true, 'Pause remains available while either local recorder is active')
  await pause.click(); assert.equal(await page.evaluate(() => window.__NM_FIXTURE__.settings.monitoringPaused), true)
  page.once('dialog', dialog => dialog.accept())
  await settings.getByRole('button', { name: 'Delete all monitoring data', exact: true }).click()
  assert.ok(await page.evaluate(() => window.__NM_FIXTURE__.calls.some(call => call.command === 'nm_delete_monitoring_data')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(() => window.__NM_FIXTURE__.calls.some(call => call.command === 'nm_save_ui_session')), 'Journal state is persisted for renderer recreation')
  results.push('Opt-in prompts, rare alerts, monitoring pause/delete, and UI-session persistence are exercised without live OS access')
  await page.close()
}
async function main() {
  if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw Error('Run npm run build before npm run test:ui')
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  const executablePath = process.env.NETMASK_BROWSER || (fs.existsSync(edge) ? edge : undefined)
  let browser
  const errors = [], results = []
  try {
    browser = await chromium.launch({ executablePath, headless: true })
    await appChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    await navigationAndTooltipChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    await regressionChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    await productFeatureChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    await companionFeatureChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    await previewChecks(browser, 'http://127.0.0.1:' + server.address().port, errors, results)
    assert.deepEqual(errors, [], 'Browser JavaScript errors')
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ results, errors, boundary: 'Fictional native IPC. No live OS mutations.' }, null, 2))
    console.log(JSON.stringify({ checked: results.length, errors, output }, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ errors, completed: results }, null, 2))
    if (browser) for (const [index, page] of browser.contexts().flatMap(context => context.pages()).entries()) {
      await page.screenshot({ path: path.join(output, 'failure-' + index + '.png') }).catch(() => {})
    }
    throw error
  } finally { if (browser) await browser.close(); server.close() }
}
module.exports = { nativeFixture }
if (require.main === module) main().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1 })
