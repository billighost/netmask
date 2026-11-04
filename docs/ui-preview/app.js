(() => {
  const modes = ['fieldnotes', 'switchboard', 'tide', 'mono']
  const requested = new URLSearchParams(location.search).get('mode')
  const mode = modes.includes(requested) ? requested : 'fieldnotes'
  document.body.dataset.mode = mode; document.body.className = mode
  document.title = 'NetMask — ' + mode[0].toUpperCase() + mode.slice(1) + ' preview'
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
  const controls = window.NetMaskPreviewControls
  const icons = {
    wifi: '<path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="20" r=".9"/>',
    wire: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M9 20h6m-3-4v4M8 8v3m4-3v3m4-3v3"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
    gear: '<path d="m10 3-.6 3-2 .9-2.7-1.1-2 3.5L5 11v2l-2.3 1.7 2 3.5 2.7-1.1 2 .9.6 3h4l.6-3 2-.9 2.7 1.1 2-3.5L19 13v-2l2.3-1.7-2-3.5-2.7 1.1-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    details: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    share: '<rect x="3" y="3" width="6" height="6"/><rect x="15" y="3" width="6" height="6"/><rect x="3" y="15" width="6" height="6"/><path d="M15 15h6v6h-3m-3-3v3"/>',
    dns: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18m-16-5h14m-14 10h14"/>',
    refresh: '<path d="M20 8a9 9 0 1 0 1 7M20 3v5h-5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    restore: '<path d="M4 8a8 8 0 1 1-1 7M4 3v5h5"/>',
    key: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m4 0h1m4 0h1M6 13h1m4 0h1m4 0h1M7 16h10"/>',
    chart: '<path d="M3 3v18h18M6 16l4-6 4 3 6-9"/>'
  }
  const icon = (name, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.wifi}</svg>`
  const networks = [
    { id: 'studio', name: 'Studio', original: 'HomeFiber_5G', type: 'wifi', live: true, subtitle: 'Wi-Fi · 5 GHz' },
    { id: 'workshop', name: 'Workshop', original: 'Workshop', type: 'wire', live: false, subtitle: 'Ethernet · saved profile' },
    { id: 'guest', name: 'Guest network', original: 'Guest network', type: 'wifi', live: false, subtitle: 'Wi-Fi · saved profile' }
  ]
  let selected = 'studio', privacy = false, filter = '', noticeTimer
  const app = document.getElementById('app'), dialog = document.getElementById('screen-dialog')
  const current = () => networks.find(network => network.id === selected)
  const displayName = network => privacy && network.live ? 'Private network' : network.name
  const spark = '<svg class="spark" viewBox="0 0 120 42" preserveAspectRatio="none" aria-label="Sample transfer history"><path d="M0 37h120" stroke="currentColor" opacity=".2" fill="none"/><path d="m1 30 7-1 5 5 6-18 5 8 8-6 6 11 7-5 5-16 6 8 5-3 7 15 6-11 6 2 5-10 5 12 6-7 6 5 6-13 5 1" stroke="currentColor" stroke-width="1.7" fill="none"/></svg>'
  function hero() {
    return `<section class="hero"><div class="connection-label"><p class="eyebrow connected-label"><span class="dot"></span>CONNECTED / WI-FI</p><span class="live-label">LIVE ↗</span></div><div class="hero-top"><div><h1 class="hero-name" data-live-name>Studio</h1><p class="hero-sub">5 GHz · strong signal · WPA2</p></div><div class="hero-icon">${icon('wifi', 27)}</div></div><div class="transfer"><div><p class="rate-caption">↓ DOWNLOAD</p><p class="rate-value">12.4<span>MB/s</span></p></div><div><p class="rate-caption">↑ UPLOAD</p><p class="rate-value">1.8<span>MB/s</span></p></div>${spark}</div><div class="hero-foot"><span><strong>8 ms</strong> gateway latency</span><span>Signal <strong>94%</strong></span></div></section>`
  }
  function profileSection() {
    return `<section class="profiles"><div class="section-head"><h2>${mode === 'mono' ? '02 / Network index' : mode === 'switchboard' ? 'SAVED PROFILES' : 'Your networks'}</h2><span class="count">03 profiles</span></div><label class="search">${icon('search', 13)}<input id="network-search" type="search" placeholder="Find a network" aria-label="Find a network"></label><div id="profile-list"></div></section>`
  }
  function editor() {
    return `<section class="editor"><h2>${mode === 'switchboard' ? 'EDIT DISPLAY NAME' : mode === 'mono' ? 'A name that makes sense.' : 'Make it yours.'}</h2><p class="editor-sub">A local label for the selected network.<br>Your router’s Wi-Fi name stays the same.</p><form id="rename-form"><label class="input-label" for="network-name">DISPLAY NAME</label><div class="edit-line"><input class="text-input" id="network-name" value="Studio" maxlength="128" autocomplete="off" spellcheck="false" required><button class="primary" type="submit">Save name<span>↗</span></button></div></form><div class="restore-line"><span class="original-label" id="original-name">Original: HomeFiber_5G</span><button class="text-button" type="button" data-action="restore">Restore original</button></div><div class="tools"><button class="tool-button" data-dialog="details">${icon('details', 14)}Details</button><button class="tool-button" data-dialog="share">${icon('share', 14)}Share Wi-Fi</button><button class="tool-button" data-action="reconnect">${icon('refresh', 13)}Reconnect</button></div></section>`
  }
  function privacySection() {
    return `<section class="privacy">${icon('shield', 19)}<div><strong>Display privacy</strong><p id="privacy-caption">Use a private name while sharing your screen.</p></div><button id="privacy-switch" class="switch" role="switch" aria-label="Display privacy" aria-checked="false"><span></span></button></section>`
  }
  const tools = `<section class="tools"><button class="tool-button" data-dialog="dns">${icon('dns', 14)}DNS test</button><button class="tool-button" data-dialog="identity">${icon('shield', 14)}Identity</button><button class="tool-button" data-dialog="settings">${icon('gear', 14)}Settings</button></section>`
  app.innerHTML = `<header class="titlebar"><div class="brand"><img src="../branding/logos/orbit/${mode === 'switchboard' ? 'mark-light.svg' : 'mark.svg'}" alt="">NetMask</div><span class="title-hint">${mode === 'switchboard' ? 'NETWORK UTILITY' : 'local, by design'}</span><div class="title-actions"><button class="icon-button" data-dialog="settings" aria-label="Open settings">${icon('gear', 13)}</button><button class="icon-button window-symbol" data-action="minimize" aria-label="Preview minimize">−</button><button class="icon-button window-symbol" data-action="maximize" aria-label="Preview maximize">□</button><button class="icon-button window-symbol" data-action="close" aria-label="Preview close to tray">×</button></div></header><nav class="rail" aria-label="Tools"><button data-action="overview" aria-label="Overview">${icon('wifi')}</button><button data-dialog="dns" aria-label="DNS tools">${icon('dns')}</button><button data-dialog="identity" aria-label="Device identity">${icon('shield')}</button><button data-dialog="settings" aria-label="Settings">${icon('gear')}</button></nav><main class="content" id="main-scroll" tabindex="-1">${mode === 'switchboard' ? '<nav class="console-tabs" aria-label="Views"><button data-action="overview">OVERVIEW</button><button data-dialog="details">LINK DETAILS</button><button data-dialog="dns">TOOLS</button></nav>' : ''}${hero()}${['mono', 'switchboard'].includes(mode) ? editor() + profileSection() : profileSection() + editor()}${privacySection()}${tools}<p class="footnote"><span>Only local display names are changed.</span><span>Updated just now</span></p></main>`
  function renderRows() {
    const visible = networks.filter(network => displayName(network).toLowerCase().includes(filter.toLowerCase()))
    document.getElementById('profile-list').innerHTML = visible.length ? visible.map(network => `<div class="profile-row"><button class="profile-button" data-profile="${network.id}" aria-pressed="${network.id === selected}" aria-label="Select ${escape(displayName(network))}"><span class="profile-index">${String(networks.indexOf(network) + 1).padStart(2, '0')}</span><span class="profile-icon">${icon(network.type, 16)}</span><span class="profile-text"><strong>${escape(displayName(network))}</strong><small>${network.subtitle}</small></span><span class="profile-state">${network.live ? '<span class="dot"></span>Connected' : 'Saved'}</span></button><button class="row-menu" data-menu="${network.id}" aria-label="Actions for ${escape(displayName(network))}">⋯</button></div>`).join('') : '<p class="dialog-sub" style="padding:18px 0">No matching networks.</p>'
  }
  function sync() {
    renderRows()
    document.querySelector('[data-live-name]').textContent = displayName(networks[0])
    document.getElementById('network-name').value = displayName(current())
    document.getElementById('original-name').textContent = privacy ? 'Original name saved on this device' : 'Original: ' + current().original
    document.getElementById('privacy-switch').setAttribute('aria-checked', String(privacy))
    document.getElementById('privacy-caption').textContent = privacy ? 'Private display name is active.' : 'Use a private name while sharing your screen.'
    app.querySelector('[data-dialog=share]').disabled = current().type !== 'wifi'
    app.querySelector('[data-action=reconnect]').disabled = current().type !== 'wifi'
  }
  function notify(message) { const notice = document.getElementById('notice'); notice.textContent = message; notice.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.hidden = true, 2800) }
  function detailsList(entries) { return '<dl class="details-list">' + entries.map(([name, value]) => `<div><dt>${escape(name)} ${controls.help(name)}</dt><dd>${escape(value)}</dd></div>`).join('') + '</dl>' }
  const toggleRow = controls.toggle
  function showDialog(kind) {
    controls.close()
    const network = current(), live = network.live
    const contents = {
      details: { title: 'Network details', html: `<p class="dialog-sub">${escape(displayName(network))} · ${live ? 'Connected Wi-Fi' : 'Saved profile'}</p>${detailsList([['Display name', displayName(network)], ['Original name', privacy ? 'Hidden for display privacy' : network.original], ['Status', live ? 'Connected' : 'Saved'], ['Band', live ? '5 GHz' : 'Unavailable while disconnected'], ['Signal', live ? '94% · −47 dBm' : 'Unavailable'], ['Security', live ? 'WPA2-Personal' : 'Unavailable'], ['Channel', live ? '44' : 'Unavailable'], ['BSSID', live ? 'A4:7B:2C:••:••:••' : 'Unavailable'], ['Gateway latency', live ? '8 ms' : 'Unavailable'], ['Link rate', live ? '866 Mbps' : 'Unavailable']])}<div class="dialog-actions"><button class="secondary" data-dialog="dns">Compare DNS</button><button class="secondary" data-dialog="share" ${network.type !== 'wifi' ? 'disabled' : ''}>Share Wi-Fi</button></div>` },
      share: { title: 'Share Wi-Fi', html: '<p class="dialog-sub">Scan to join Studio-Guest. These are fictional credentials for the design preview.</p><img class="qr" src="demo-wifi.svg" alt="QR code containing fictional Studio-Guest Wi-Fi credentials"><label class="input-label" style="text-align:center">WI-FI PASSWORD</label><p class="share-password">guest-preview-2026</p><p class="dialog-sub" style="margin-top:16px">A Wi-Fi QR code contains readable credentials. Share it only with someone you want to grant access.</p><div class="dialog-actions"><button class="primary" data-action="copy-password">Copy password</button></div>' },
      dns: { title: 'A quicker DNS response', html: '<p class="dialog-sub">Sample resolver results. Compare response times before choosing a resolver for the active connection.</p>' + [['Cloudflare', '1.1.1.1', '8'], ['Quad9', '9.9.9.9', '12'], ['Google', '8.8.8.8', '16']].map(([name, address, ms]) => `<div class="resolver"><div><strong>${name}</strong><small>${address}${name === 'Cloudflare' ? ' · current' : ''}</small></div><span>${ms}<small>ms</small></span><button class="secondary" data-resolver="${name}">Use</button></div>`).join('') + '<p class="dialog-sub" style="margin-top:18px">Preview only. Resolver choices here do not change your device’s DNS.</p>' },
      identity: { title: 'Device identity', html: '<p class="dialog-sub">Keep sensitive identifiers out of the app while sharing your screen. Driver controls depend on your operating system.</p>' + detailsList([['Device', 'Studio laptop'], ['Active profile', privacy ? 'Private network' : 'Studio'], ['Access point', 'A4:7B:2C:••:••:••'], ['MAC randomization', 'Available on supported Windows adapters'], ['Network discovery', 'Managed by your operating system']]) + '<div class="dialog-actions"><button class="primary" data-action="toggle-privacy">Toggle display privacy</button><button class="secondary" data-dialog="roaming">Adapter controls</button></div>' },
      roaming: { title: 'Wi-Fi adapter controls', html: '<p class="dialog-sub">Windows adapter options, shown here as a design study. Available choices depend on the installed driver.</p>' + controls.select('preferred-band', 'Preferred band', ['5 GHz', 'No preference', '2.4 GHz'], '5 GHz') + controls.select('roaming-level', 'Roaming aggressiveness', ['Medium', 'Low', 'High'], 'Medium') + '<div class="dialog-actions"><button class="primary" data-action="save-adapter">Apply choices</button></div>' },
      shortcuts: { title: 'Keyboard controls', html: '<p class="dialog-sub">A few useful shortcuts. Escape closes a dialog and returns focus.</p><dl class="details-list">' + [['Refresh', 'Ctrl + R'], ['Edit display name', 'Ctrl + N'], ['Find a network', 'Ctrl + F'], ['Save a name', 'Ctrl + Enter'], ['Previous / next profile', '↑ / ↓'], ['Open Settings', 'Ctrl + ,'], ['Close dialog', 'Esc']].map(([label, key]) => `<div><dt>${label}</dt><dd><kbd>${key}</kbd></dd></div>`).join('') + '</dl>' },
      actions: { title: displayName(network), html: '<p class="dialog-sub">Actions for the selected network.</p>' + [['edit', 'Edit display name', 'key'], ['restore', 'Restore original', 'restore'], ['details', 'View network details', 'details'], ['reconnect', 'Reconnect Wi-Fi', 'refresh'], ['share', 'Share Wi-Fi', 'share']].map(([action, label, glyph]) => `<button class="menu-action" ${['details', 'share'].includes(action) ? `data-dialog="${action}"` : `data-action="${action}"`} ${network.type !== 'wifi' && ['share', 'reconnect'].includes(action) ? 'disabled' : ''}>${icon(glyph)}${label}</button>`).join('') },
      settings: { title: 'Settings', html: `<div class="dialog-section"><h3>General</h3>${toggleRow('Close to tray', 'Keep NetMask available in the background.', true, 'close-to-tray')}${toggleRow('Launch on sign-in', 'Open quietly in the tray.', false, 'launch-on-signin')}${controls.select('refresh-interval', 'Refresh networks', ['Every 30 seconds', 'Every minute', 'Only when I refresh'], 'Every 30 seconds')}</div><div class="dialog-section"><h3>Display privacy</h3>${toggleRow('Mask when a broadcast app runs', 'Recognizes supported running broadcast apps.', true, 'auto-mask')}${toggleRow('Hide the access point’s BSSID', 'Show a partial hardware address.', true, 'hide-bssid')}<label class="input-label" for="mask-name" style="margin-top:16px">PRIVATE DISPLAY NAME</label><input class="text-input" id="mask-name" value="Private network" maxlength="128"></div><div class="dialog-section"><h3>Tools</h3><button class="menu-action" data-dialog="dns">${icon('dns')}Compare DNS resolvers</button><button class="menu-action" data-dialog="identity">${icon('shield')}Device identity</button><button class="menu-action" data-dialog="roaming">${icon('wifi')}Wi-Fi adapter controls</button><button class="menu-action" data-dialog="shortcuts">${icon('key')}Keyboard controls</button></div><div class="dialog-section"><h3>Recovery</h3><p class="dialog-sub">Original display names stay on your device. Failed restores keep their recovery records.</p><div class="dialog-actions"><button class="secondary" data-action="backup">Export backup</button><button class="secondary" data-action="restore-all">Restore all names</button></div></div><div class="dialog-section preview-about"><div class="preview-brand"><img src="../branding/logos/orbit/mark.svg" width="44" height="44" alt=""><div><h3>NetMask</h3><p>A little room for your network.</p><small>Fieldnotes + Orbit · selected direction</small></div></div><div class="preview-author"><span class="preview-monogram" aria-hidden="true">BB</span><div><p class="eyebrow">CREATOR & MAINTAINER</p><h4>Bello Bilal</h4></div><p>Made and maintained by Bello Bilal. Open source, under the MIT license.</p><a href="https://github.com/billighost/netmask" target="_blank" rel="noopener">billighost/netmask ↗</a><span>bb2010ng@gmail.com</span></div><p class="dialog-sub">Interactive design study · fictional data</p></div><button class="primary" data-action="save-settings">Done</button>` }
    }
    const content = contents[kind] || contents.details
    document.getElementById('dialog-title').textContent = content.title
    document.getElementById('dialog-content').innerHTML = content.html
    if (!dialog.open) dialog.showModal()
    dialog.scrollTop = 0
    document.getElementById('close-dialog').focus({ preventScroll: true })
  }
  function restore() { current().name = current().original; privacy = false; sync(); notify('Original display name restored in this preview.') }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return
    if (button.dataset.profile) { selected = button.dataset.profile; sync(); return }
    if (button.dataset.menu) { selected = button.dataset.menu; sync(); showDialog('actions'); return }
    if (button.dataset.dialog) { showDialog(button.dataset.dialog); return }
    if (button.dataset.resolver) { notify(button.dataset.resolver + ' selected in this preview.'); dialog.close(); return }
    const action = button.dataset.action
    if (action === 'restore') { restore(); if (dialog.open) dialog.close() }
    if (action === 'restore-all') { networks.forEach(network => network.name = network.original); privacy = false; sync(); notify('All sample original names restored.'); dialog.close() }
    if (action === 'edit') { dialog.close(); document.getElementById('network-name').focus(); document.getElementById('network-name').select() }
    if (action === 'reconnect') notify('Sample Wi-Fi connection confirmed.')
    if (action === 'toggle-privacy' || button.id === 'privacy-switch') { privacy = !privacy; sync(); if (dialog.open) dialog.close(); notify(privacy ? 'Private display name is active.' : 'Previous display name restored.') }
    if (action === 'save-settings') { dialog.close(); notify('Preview preferences saved for this view.') }
    if (action === 'save-adapter') { dialog.close(); notify('Sample adapter choices applied.') }
    if (action === 'backup') notify('Sample recovery records are ready. No device data is used.')
    if (action === 'copy-password') { try { await navigator.clipboard.writeText('guest-preview-2026'); notify('Demo Wi-Fi password copied.') } catch { notify('Clipboard access is unavailable. The demo password is shown above.') } }
    if (['minimize', 'maximize', 'close'].includes(action)) notify('Use the gallery’s size controls to test the window. Native window controls are shown for preview.')
    if (action === 'overview') { if (dialog.open) dialog.close(); document.getElementById('main-scroll').scrollTop = 0 }
  })
  document.getElementById('network-search').addEventListener('input', event => { filter = event.target.value; renderRows() })
  document.getElementById('rename-form').addEventListener('submit', event => {
    event.preventDefault(); const value = document.getElementById('network-name').value.trim()
    if (!value || [...value].length > 128 || /[\x00-\x1f\x7f]/.test(value)) { notify('Use a name of up to 128 characters without control characters.'); return }
    privacy = false; current().name = value; sync(); notify('Display name saved in this preview.')
  })
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', event => { const bounds = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close() })
  app.addEventListener('contextmenu', event => { const row = event.target.closest('[data-profile]'); if (row) { event.preventDefault(); selected = row.dataset.profile; sync(); showDialog('actions') } })
  document.addEventListener('keydown', event => {
    if (dialog.open) return
    const modifier = event.ctrlKey || event.metaKey
    if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); document.getElementById('network-name').focus(); document.getElementById('network-name').select() }
    if (modifier && event.key.toLowerCase() === 'f') { event.preventDefault(); document.getElementById('network-search').focus() }
    if (modifier && event.key === ',') { event.preventDefault(); showDialog('settings') }
    if (modifier && event.key === 'Enter') { event.preventDefault(); document.getElementById('rename-form').requestSubmit() }
    if (!modifier && ['ArrowDown', 'ArrowUp'].includes(event.key) && event.target.tagName !== 'INPUT') {
      const visible = networks.filter(network => displayName(network).toLowerCase().includes(filter.toLowerCase()))
      if (!visible.length) return; event.preventDefault(); const index = visible.findIndex(network => network.id === selected)
      selected = visible[(index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length].id; sync()
      const row = app.querySelector(`[data-profile="${selected}"]`); row?.focus(); row?.scrollIntoView({ block: 'nearest' })
    }
  })
  sync()
})()
