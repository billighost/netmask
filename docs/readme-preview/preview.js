(() => {
  const options = JSON.parse(document.getElementById('readme-data').textContent)
  const byId = Object.fromEntries(options.map(option => [option.id, option]))
  const saved = (() => { try { return JSON.parse(localStorage.getItem('netmask-readme-preview') || '{}') } catch { return {} } })()
  let selected = byId[location.hash.slice(1)] ? location.hash.slice(1) : byId[saved.selected] ? saved.selected : 'showcase'
  let theme = saved.theme === 'dark' ? 'dark' : 'light'
  let view = 'preview'
  let width = 'wide'
  const status = document.getElementById('status')
  const content = document.getElementById('readme-content')
  const source = document.getElementById('markdown-source')
  const save = () => { try { localStorage.setItem('netmask-readme-preview', JSON.stringify({ selected, theme })) } catch {} }

  function themeImages(scope) {
    scope.querySelectorAll('picture').forEach(picture => {
      const img = picture.querySelector('img')
      const dark = picture.querySelector('source[media*="prefers-color-scheme"], source[data-dark]')
      if (!img || !dark) return
      img.dataset.paper = img.dataset.paper || img.getAttribute('src')
      dark.dataset.dark = dark.dataset.dark || dark.getAttribute('srcset')
      dark.media = '(min-width: 100000px)'
      img.src = theme === 'dark' ? dark.dataset.dark : img.dataset.paper
    })
  }

  function readmeFor(id) {
    const clone = document.getElementById('template-' + id).content.cloneNode(true)
    clone.querySelectorAll('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer' })
    return clone
  }

  const comparisons = document.getElementById('comparison')
  options.forEach(option => {
    const card = document.createElement('section')
    card.className = 'compare-card'
    const header = document.createElement('div')
    header.className = 'compare-label'
    const name = document.createElement('h3')
    name.textContent = option.number + ' · ' + option.name
    const button = document.createElement('button')
    button.type = 'button'; button.dataset.option = option.id
    button.textContent = 'View this'; button.setAttribute('aria-label', 'View ' + option.name)
    header.append(name, button)
    const scroll = document.createElement('div')
    scroll.className = 'compare-content'; scroll.tabIndex = 0; scroll.setAttribute('aria-label', option.name + ' README preview')
    const article = document.createElement('article')
    article.className = 'readme'; article.append(readmeFor(option.id)); scroll.append(article)
    card.append(header, scroll); comparisons.append(card)
  })

  function render() {
    const current = byId[selected]
    document.documentElement.dataset.theme = theme
    document.body.dataset.width = width
    document.getElementById('preview-panel').hidden = view !== 'preview'
    document.getElementById('comparison').hidden = view !== 'compare'
    document.getElementById('source-panel').hidden = view !== 'source'
    document.getElementById('width-buttons').hidden = view !== 'preview'
    document.getElementById('option-title').textContent = view === 'compare' ? 'Four ways to introduce NetMask' : current.number + ' · ' + current.name
    document.getElementById('option-description').textContent = view === 'compare' ? 'Scroll each README independently. Open a direction to see its full layout.' : current.description
    document.getElementById('download').textContent = 'Download ' + current.name
    document.querySelectorAll('.option[data-option]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === selected)))
    for (const key of ['theme', 'view', 'width']) {
      const value = { theme, view, width }[key]
      document.querySelectorAll('[data-' + key + ']').forEach(button => {
        if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset[key] === value))
      })
    }
    content.replaceChildren(readmeFor(selected))
    source.textContent = current.markdown
    themeImages(document)
    status.textContent = ''
    save()
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.dataset.option) {
      selected = button.dataset.option; view = 'preview'; render()
      try { history.replaceState(null, '', '#' + selected) } catch {}
    } else if (button.dataset.theme) { theme = button.dataset.theme; render() }
    else if (button.dataset.view) { view = button.dataset.view; render() }
    else if (button.dataset.width) { width = button.dataset.width; render() }
  })

  document.getElementById('download').addEventListener('click', () => {
    const blob = new Blob([byId[selected].markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'README-' + selected + '.md'
    document.body.append(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status.textContent = 'Downloaded the ' + byId[selected].name + ' README with paths ready for the repository root.'
  })
  document.getElementById('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(byId[selected].markdown)
      status.textContent = 'Markdown copied.'
    } catch { status.textContent = 'Clipboard access is unavailable here. Use Download instead.' }
  })
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1)
    if (byId[next]) { selected = next; view = 'preview'; render() }
  })
  render()
})()
