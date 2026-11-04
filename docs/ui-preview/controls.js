(() => {
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
  const explanations = {
    Band: 'The radio range used by this Wi-Fi connection. 5 GHz is often faster nearby; 2.4 GHz usually reaches farther.',
    Signal: 'How strongly your device hears the access point. A higher percentage usually means a stronger signal.',
    Security: 'The Wi-Fi security method reported for this connection.',
    Channel: 'The radio channel used by the access point. Nearby networks can share a channel.',
    BSSID: 'The address of the Wi-Fi radio you are connected to. Hiding it only changes what NetMask displays.',
    'Gateway latency': 'The time it takes to hear back from your router. Lower values mean a quicker response.',
    'Link rate': 'The speed negotiated between your device and the access point. Your actual download speed can be lower.',
    'Preferred band': 'The band your adapter should try first. The driver and access point decide the final connection.',
    'Roaming aggressiveness': 'How readily the adapter looks for a better access point with the same Wi-Fi name.',
    'MAC randomization': 'Uses a different device address for Wi-Fi where your operating system and adapter support it.'
  }
  let openSelect = null, help = null, helpAnchor = null, sequence = 0
  const helpButton = label => explanations[label] ? `<button class="preview-help-button" type="button" data-preview-help="${escape(label)}" aria-label="Explain ${escape(label)}">i</button>` : ''
  function close() {
    if (openSelect) {
      openSelect.querySelector('[role=listbox]').hidden = true
      openSelect.querySelector('[role=combobox]').setAttribute('aria-expanded', 'false')
      openSelect.querySelector('[role=combobox]').removeAttribute('aria-activedescendant')
      openSelect = null
    }
    help?.remove(); help = null
    helpAnchor?.removeAttribute('aria-describedby'); helpAnchor = null
  }
  function place(element, anchor, width) {
    const bounds = anchor.getBoundingClientRect()
    const fitted = Math.min(width, innerWidth - 16)
    element.style.width = fitted + 'px'; element.style.maxHeight = innerHeight - 16 + 'px'
    const height = Math.min(element.scrollHeight + 2, innerHeight - 16)
    const below = bounds.bottom + 6, above = bounds.top - height - 6
    element.style.top = (below + height <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, innerHeight - height - 8)) + 'px'
    element.style.left = Math.max(8, Math.min(bounds.left, innerWidth - fitted - 8)) + 'px'
  }
  function activate(index) {
    const options = [...openSelect.querySelectorAll('[role=option]')]
    openSelect.dataset.active = String(index)
    options.forEach((option, i) => option.classList.toggle('active', index === i))
    openSelect.querySelector('[role=combobox]').setAttribute('aria-activedescendant', options[index].id)
    options[index].scrollIntoView({ block: 'nearest' })
  }
  function show(wrapper) {
    close(); openSelect = wrapper
    const trigger = wrapper.querySelector('[role=combobox]'), menu = wrapper.querySelector('[role=listbox]')
    menu.hidden = false; trigger.setAttribute('aria-expanded', 'true')
    place(menu, trigger, Math.max(190, trigger.getBoundingClientRect().width))
    activate(Math.max(0, [...menu.children].findIndex(option => option.getAttribute('aria-selected') === 'true')))
  }
  function choose(option) {
    const wrapper = option.closest('.preview-select'), trigger = wrapper.querySelector('[role=combobox]')
    trigger.querySelector('span').textContent = option.textContent
    wrapper.querySelectorAll('[role=option]').forEach(item => item.setAttribute('aria-selected', String(item === option)))
    close(); trigger.focus({ preventScroll: true })
  }
  window.NetMaskPreviewControls = {
    close, help: helpButton,
    toggle: (label, note, checked, id) => `<div class="setting-row"><div><strong id="${id}-label">${escape(label)}</strong><small>${escape(note)}</small></div><button id="${id}" class="switch" type="button" role="switch" aria-labelledby="${id}-label" aria-checked="${checked}" data-preview-toggle><span></span></button></div>`,
    select: (id, label, options, value) => `<div class="preview-field"><label for="${id}">${escape(label)} ${helpButton(label)}</label><div class="preview-select"><button id="${id}" type="button" role="combobox" aria-label="${escape(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-options" data-preview-select><span>${escape(value)}</span><span aria-hidden="true">⌄</span></button><div id="${id}-options" role="listbox" aria-label="${escape(label)}" class="preview-select-menu" hidden>${options.map((option, index) => `<button id="${id}-option-${index}" type="button" role="option" tabindex="-1" aria-selected="${option === value}" data-preview-option>${escape(option)}</button>`).join('')}</div></div></div>`
  }
  document.addEventListener('pointerdown', event => {
    if (openSelect && !openSelect.contains(event.target)) close()
    if (help && !help.contains(event.target) && event.target !== helpAnchor) close()
  }, true)
  document.addEventListener('mousedown', event => { if (event.target.closest('[data-preview-option]')) event.preventDefault() })
  document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return
    if (button.hasAttribute('data-preview-select')) { openSelect?.contains(button) ? close() : show(button.closest('.preview-select')) }
    else if (button.hasAttribute('data-preview-option')) choose(button)
    else if (button.hasAttribute('data-preview-toggle')) button.setAttribute('aria-checked', String(button.getAttribute('aria-checked') !== 'true'))
    else if (button.dataset.previewHelp) {
      if (helpAnchor === button) { close(); return }
      close(); helpAnchor = button; help = document.createElement('div')
      help.className = 'preview-help'; help.id = 'preview-help-' + ++sequence; help.setAttribute('role', 'tooltip')
      const title = document.createElement('strong'), text = document.createElement('p')
      title.textContent = button.dataset.previewHelp; text.textContent = explanations[title.textContent]
      help.append(title, text); button.parentElement.append(help); button.setAttribute('aria-describedby', help.id)
      place(help, button, 280)
    }
  })
  document.addEventListener('focusout', event => { if (openSelect && event.target === openSelect.querySelector('[role=combobox]')) close() })
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (openSelect || help)) { event.preventDefault(); event.stopPropagation(); close(); return }
    const trigger = event.target.closest?.('[data-preview-select]')
    if (!trigger) return
    const wrapper = trigger.closest('.preview-select')
    if (event.key === 'Tab') { close(); return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      if (openSelect !== wrapper) { show(wrapper); return }
      const options = [...wrapper.querySelectorAll('[role=option]')], active = Number(wrapper.dataset.active)
      if (event.key === 'Enter' || event.key === ' ') choose(options[active])
      else activate(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopPropagation()
      if (openSelect !== wrapper) show(wrapper)
      const text = (Date.now() - Number(wrapper.dataset.typedAt || 0) > 700 ? '' : wrapper.dataset.typed || '') + event.key.toLowerCase()
      wrapper.dataset.typed = text; wrapper.dataset.typedAt = String(Date.now())
      const index = [...wrapper.querySelectorAll('[role=option]')].findIndex(option => option.textContent.toLowerCase().startsWith(text))
      if (index >= 0) activate(index)
    }
  }, true)
  const reposition = () => {
    if (openSelect) place(openSelect.querySelector('[role=listbox]'), openSelect.querySelector('[role=combobox]'), 240)
    if (help) place(help, helpAnchor, 280)
  }
  document.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
  document.addEventListener('close', close, true)
})()
