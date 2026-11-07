(() => {
  const studies = {
    fieldnotes: { name: 'Fieldnotes', number: '01', description: 'The selected local connection companion: warm paper, green ink, measured findings, honest gaps, and calm deliberate actions.', layout: 'Connection → journal → context actions → saved networks', signature: 'Serif findings. Quiet green actions. Honest missing states.', width: 440 },
    switchboard: { name: 'Switchboard', number: '02', description: 'A reference instrument panel for history, usage, Going live and evidence, with a dark shell and orderly numbered controls.', layout: 'Live state → journal tools → saved networks', signature: 'Mint readouts. Square controls. Reference only.', width: 440 },
    tide: { name: 'Tide', number: '03', description: 'A reference bright utility with a clear blue connection surface and friendly paths into history, readiness and saved-network context.', layout: 'Connection summary → journal → network context', signature: 'Cobalt accents. Soft edges. Reference only.', width: 440 },
    mono: { name: 'Mono', number: '04', description: 'A reference typographic direction where measured history, deliberate actions, and saved networks share an uncluttered index.', layout: 'Connection → deliberate actions → network index', signature: 'Strong type. Fine black rules. Reference only.', width: 520 }
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
