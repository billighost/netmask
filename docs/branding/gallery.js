(() => {
  const logos = window.NETMASK_LOGOS
  const byId = new Map(logos.map((logo, index) => [logo.id, { ...logo, number: String(index + 1).padStart(2, '0') }]))
  const shortlist = new Set()
  const downloadLoads = new Map()
  const grid = document.getElementById('logo-grid')
  const comparePanel = document.getElementById('compare-panel')
  const compareGrid = document.getElementById('compare-grid')
  const compareButton = document.getElementById('compare-button')
  const selection = document.getElementById('selection')
  const clearButton = document.getElementById('clear-shortlist')
  const filterLabels = { all: 'THE COMPLETE COLLECTION', original: 'THE FOUR STARTING POINTS', hybrid: 'NEW DIRECTIONS & COMBINATIONS', favorites: 'YOUR FAVORITES' }
  let filter = 'all'
  let isDark = false
  let comparing = false

  // A file opened directly in a browser can deny storage. The gallery still works.
  try {
    const saved = JSON.parse(localStorage.getItem('netmask-logo-shortlist') || '[]')
    if (Array.isArray(saved)) saved.filter(id => byId.has(id)).slice(0, 4).forEach(id => shortlist.add(id))
    isDark = localStorage.getItem('netmask-logo-theme') === 'dark'
  } catch {}

  function artwork(logo, light = isDark) {
    return `logos/${logo.id}/${light ? 'mark-light.svg' : 'mark.svg'}`
  }

  function downloads(logo) {
    return `<div class="downloads" aria-label="Download ${logo.name}" data-download-logo="${logo.id}"><a href="logos/${logo.id}/mark.svg" data-download-format="svg" download="netmask-${logo.id}.svg" aria-label="Download ${logo.name} SVG">SVG</a><a href="logos/${logo.id}/icon.png" data-download-format="png" download="netmask-${logo.id}.png" aria-label="Download ${logo.name} PNG">PNG</a><a href="logos/${logo.id}/icon.ico" data-download-format="ico" download="netmask-${logo.id}.ico" aria-label="Download ${logo.name} Windows icon">ICO</a><a href="logos/${logo.id}/icon.icns" data-download-format="icns" download="netmask-${logo.id}.icns" aria-label="Download ${logo.name} macOS icon">ICNS</a></div>`
  }

  function card(logo) {
    return `<article class="card" data-logo="${logo.id}" aria-labelledby="name-${logo.id}">
      <div class="art"><span class="card-number">${logo.number}</span><span class="selection-tick" aria-hidden="true" hidden>✓</span><img data-art="${logo.id}" src="${artwork(logo)}" width="126" height="126" alt="${logo.name} mark"></div>
      <div class="card-body"><div class="card-head"><h2 id="name-${logo.id}">${logo.name}</h2>${logo.id === 'orbit' ? '<span class="current-mark">Chosen</span>' : ''}</div><span class="family">${logo.family}</span><p class="card-description">${logo.description}</p>
        <div class="sizes" aria-label="${logo.name} at desktop sizes"><span>SMALL<br>SIZES</span>${[16, 32, 48].map(size => `<div class="size-sample"><img data-art="${logo.id}" src="${artwork(logo)}" width="${size}" height="${size}" alt="${logo.name} at ${size} pixels"><span>${size}</span></div>`).join('')}</div>
        ${downloads(logo)}<button class="choice" type="button" data-shortlist="${logo.id}" aria-pressed="false" aria-label="Shortlist ${logo.number}, ${logo.name}">Add to shortlist <span aria-hidden="true">+</span></button>
      </div></article>`
  }

  grid.innerHTML = [...byId.values()].map(card).join('')

  function saveChoices() {
    try { localStorage.setItem('netmask-logo-shortlist', JSON.stringify([...shortlist])) } catch {}
  }

  function showFilter() {
    let visible = 0
    grid.querySelectorAll('.card').forEach(item => {
      const logo = byId.get(item.dataset.logo)
      item.hidden = filter === 'original' ? logo.family !== 'Original' : filter === 'hybrid' ? logo.family === 'Original' : filter === 'favorites' ? !shortlist.has(logo.id) : false
      if (!item.hidden) visible++
    })
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)))
    document.getElementById('collection-label').textContent = filterLabels[filter]
    document.getElementById('visible-count').textContent = `${visible} ${visible === 1 ? 'mark' : 'marks'}`
    document.getElementById('empty-state').hidden = visible !== 0
    grid.setAttribute('aria-label', `${visible} logo ${visible === 1 ? 'direction' : 'directions'}`)
  }

  function renderComparison() {
    comparePanel.hidden = !comparing
    compareButton.setAttribute('aria-expanded', String(comparing))
    compareButton.innerHTML = `${comparing ? 'Close comparison' : 'Compare favorites'} <span aria-hidden="true">${comparing ? '×' : '↗'}</span>`
    if (!comparing) { compareGrid.innerHTML = ''; return }
    compareGrid.style.setProperty('--compare-columns', shortlist.size)
    compareGrid.innerHTML = [...shortlist].map(id => {
      const logo = byId.get(id)
      return `<article class="compare-card" data-compare="${id}"><div class="art"><span class="card-number">${logo.number}</span><img data-art="${id}" src="${artwork(logo)}" width="126" height="126" alt="${logo.name} mark"></div><div class="compare-body"><h3>${logo.name}</h3><span class="family">${logo.family}</span>
        <div class="app-sample" aria-label="${logo.name} in a Fieldnotes title bar"><div class="sample-titlebar"><img data-art="${id}" src="${artwork(logo)}" alt="" width="16" height="16"><span>NetMask</span><span class="sample-window-controls" aria-hidden="true"><span>−</span><span>□</span><span>×</span></span></div><div class="sample-content"><p class="sample-label">YOUR CONNECTION</p><p class="sample-network">Studio Wi-Fi</p><p class="sample-connection"><span aria-hidden="true"></span>Connected on this computer</p></div></div>
        <div class="desktop-sample"><div class="shortcut"><img data-art="${id}" src="${artwork(logo)}" alt="${logo.name} desktop icon" width="48" height="48"><span>NetMask</span></div><p>On your desktop<span>48 PX / CLEAR BACKGROUND</span></p></div>${downloads(logo)}<button class="choice remove-choice" type="button" data-remove="${id}" aria-label="Remove ${logo.number}, ${logo.name} from shortlist">Remove from shortlist <span aria-hidden="true">−</span></button>
      </div></article>`
    }).join('')
  }

  function updateChoices(message) {
    grid.querySelectorAll('.card').forEach(item => {
      const selected = shortlist.has(item.dataset.logo)
      item.classList.toggle('selected', selected)
      item.querySelector('.selection-tick').hidden = !selected
      const button = item.querySelector('.choice')
      const logo = byId.get(item.dataset.logo)
      button.setAttribute('aria-pressed', String(selected))
      button.setAttribute('aria-label', `${selected ? 'Remove from shortlist' : 'Shortlist'} ${logo.number}, ${logo.name}`)
      button.innerHTML = `${selected ? 'Shortlisted' : 'Add to shortlist'} <span aria-hidden="true">${selected ? '✓' : '+'}</span>`
    })
    document.getElementById('shortlist-count').textContent = shortlist.size
    clearButton.hidden = shortlist.size === 0
    compareButton.disabled = shortlist.size < 2
    if (shortlist.size < 2) comparing = false
    const names = [...shortlist].map(id => { const logo = byId.get(id); return `${logo.number} ${logo.name}` }).join(' · ')
    selection.textContent = message || (names ? `Shortlisted: ${names}. Orbit is the current identity.` : 'Orbit is the current identity. Shortlist alternatives to compare them.')
    showFilter()
    renderComparison()
  }

  function choose(id) {
    if (!byId.has(id)) return
    if (shortlist.has(id)) shortlist.delete(id)
    else if (shortlist.size < 4) shortlist.add(id)
    else { selection.textContent = 'Four favorites are ready to compare. Remove one to try another mark.'; return }
    saveChoices()
    updateChoices()
  }

  function theme(dark) {
    isDark = dark
    document.body.classList.toggle('dark', isDark)
    document.getElementById('light').setAttribute('aria-pressed', String(!isDark))
    document.getElementById('dark').setAttribute('aria-pressed', String(isDark))
    document.querySelectorAll('[data-art]').forEach(img => img.src = artwork(byId.get(img.dataset.art)))
    try { localStorage.setItem('netmask-logo-theme', isDark ? 'dark' : 'paper') } catch {}
  }

  grid.addEventListener('click', event => {
    const button = event.target.closest('[data-shortlist]')
    if (button) choose(button.dataset.shortlist)
  })
  compareGrid.addEventListener('click', event => {
    const button = event.target.closest('[data-remove]')
    if (!button) return
    const focusedIndex = [...shortlist].indexOf(button.dataset.remove)
    choose(button.dataset.remove)
    const remaining = compareGrid.querySelectorAll('[data-remove]')
    if (remaining.length) remaining[Math.min(focusedIndex, remaining.length - 1)].focus()
    else {
      const original = grid.querySelector(`[data-shortlist="${button.dataset.remove}"]`)
      if (!original.closest('.card').hidden) original.focus()
      else document.querySelector(`[data-filter="${filter}"]`).focus()
    }
  })
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => { filter = button.dataset.filter; showFilter() }))
  document.getElementById('light').addEventListener('click', () => theme(false))
  document.getElementById('dark').addEventListener('click', () => theme(true))
  clearButton.addEventListener('click', () => {
    shortlist.clear()
    saveChoices()
    updateChoices('Shortlist cleared. Add a few favorites from the collection.')
    document.querySelector('[data-filter="all"]').focus()
  })
  compareButton.addEventListener('click', () => {
    comparing = !comparing
    renderComparison()
    if (comparing) document.getElementById('compare-heading').focus({ preventScroll: true })
  })

  // Browsers ignore relative-file downloads. Load only the requested icon pack,
  // then download its bytes as a Blob; HTTP previews keep the ordinary links.
  document.addEventListener('click', async event => {
    const link = event.target.closest('[data-download-format]')
    if (!link || location.protocol !== 'file:') return
    event.preventDefault()
    const id = link.closest('[data-download-logo]').dataset.downloadLogo
    if (!byId.has(id)) return
    try {
      if (!downloadLoads.has(id)) {
        downloadLoads.set(id, new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = `logos/${id}/downloads.js`
          script.onload = () => {
            const pack = window.NETMASK_LOGO_DOWNLOADS?.[id]
            if (pack) resolve(pack)
            else { downloadLoads.delete(id); reject(new Error('Missing logo export pack')) }
          }
          script.onerror = () => { downloadLoads.delete(id); script.remove(); reject(new Error('Could not load logo exports')) }
          document.head.append(script)
        }))
      }
      const pack = await downloadLoads.get(id)
      const file = pack[link.dataset.downloadFormat]
      const bytes = Uint8Array.from(atob(file.data), character => character.charCodeAt(0))
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: file.type }))
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = link.download
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      selection.textContent = 'This download could not be opened. The original file is also in the logos folder.'
    }
  })

  updateChoices()
  theme(isDark)
})()
