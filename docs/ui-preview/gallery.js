(() => {
  const studies = {
    fieldnotes: { name: 'Fieldnotes', number: '01', description: 'A utility with the warmth of a well-made notebook. Green ink, paper surfaces, generous typography, and fine rules instead of a wall of cards.', layout: 'Connection → profiles → name editor', signature: 'Serif network names. Quiet green actions.', width: 440 },
    switchboard: { name: 'Switchboard', number: '02', description: 'A compact instrument panel that earns its detail. A dark blue shell, a readable live meter, a direct name editor, and orderly numbered profiles.', layout: 'Live meter → name editor → profile table', signature: 'A working instrument. Mint readouts. Square controls.', width: 440 },
    tide: { name: 'Tide', number: '03', description: 'A bright everyday utility with a clear blue connection surface. Friendly spacing and a simple path from picking a network to naming it.', layout: 'Blue connection summary → profiles → editor', signature: 'Cobalt accents. Soft edges. Familiar controls.', width: 440 },
    mono: { name: 'Mono', number: '04', description: 'A sharper, more typographic direction. Big network names, orange annotations, and a compact editor paired with an uncluttered profile index.', layout: 'Connection → editor → profile index', signature: 'Strong type. Fine black rules. A rail in wider windows.', width: 520 }
  }
  const device = document.getElementById('device')
  const frame = document.getElementById('app-preview')
  const height = document.getElementById('preview-height')
  const width = document.getElementById('preview-width')
  const presets = [...document.querySelectorAll('[data-height]')]
  function resize() { device.style.height = height.value + 'px'; device.style.width = width.value + 'px' }
  function choose(mode) {
    const study = studies[mode] || studies.fieldnotes
    mode = studies[mode] ? mode : 'fieldnotes'
    document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)))
    document.getElementById('study-number').textContent = (mode === 'fieldnotes' ? 'SELECTED / DIRECTION ' : 'REFERENCE / DIRECTION ') + study.number
    document.getElementById('study-name').textContent = study.name
    document.getElementById('study-description').textContent = study.description
    document.getElementById('study-layout').textContent = study.layout
    document.getElementById('study-signature').textContent = study.signature
    frame.src = 'app.html?mode=' + mode
    frame.title = study.name + ' interactive NetMask preview'
    document.getElementById('open-direction').href = frame.src
    width.value = study.width
    resize()
    try { history.replaceState(null, '', '?mode=' + mode) } catch {}
  }
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => choose(button.dataset.mode)))
  height.addEventListener('input', resize); width.addEventListener('input', resize)
  presets.forEach(button => button.addEventListener('click', () => { height.value = button.dataset.height; resize() }))
  new ResizeObserver(() => {
    const currentHeight = Math.round(device.clientHeight + 2), currentWidth = Math.round(device.clientWidth + 2)
    document.getElementById('height-output').textContent = currentHeight + ' px'
    document.getElementById('width-output').textContent = currentWidth + ' px'
    presets.forEach(button => button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.height) - currentHeight) < 3)))
  }).observe(device)
  choose(new URLSearchParams(location.search).get('mode') || 'fieldnotes')
})()
