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
  const escapeHtml = value => String(value).replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]))

  function inline(value) {
    const tags = []
    value = value.replace(/<(?:br\s*\/?|sub|\/sub|sup|\/sup)>/gi, tag => `@@TAG${tags.push(tag) - 1}@@`)
    value = escapeHtml(value)
      .replace(/!\[([^\]]*)\]\(([^ )]+)(?:\s+"([^"]*)")?\)/g, '<img src="$2" alt="$1" title="$3">')
      .replace(/\[([^\]]+)\]\(([^ )]+)(?:\s+"([^"]*)")?\)/g, '<a href="$2" title="$3">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    return value.replace(/@@TAG(\d+)@@/g, (_, index) => tags[Number(index)])
  }

  function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r/g, '').split('\n')
    const html = []
    const isBlock = (line, next = '') => !line.trim() || /^#{1,6}\s/.test(line) || /^\s*(?:[-*+] |\d+\. )/.test(line) ||
      /^\s*```/.test(line) || /^\s*</.test(line) || (/\|/.test(line) && /^\s*\|?\s*:?-+/.test(next))

    for (let index = 0; index < lines.length;) {
      const line = lines[index]
      if (!line.trim()) { index++; continue }
      const fence = line.match(/^\s*```([^\s]*)/)
      if (fence) {
        const code = []
        index++
        while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++])
        index++
        html.push(`<pre><code class="language-${escapeHtml(fence[1])}">${escapeHtml(code.join('\n'))}</code></pre>`)
        continue
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/)
      if (heading) { html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); index++; continue }
      if (/^\s*<details[ >]/i.test(line)) {
        const detail = [line]
        index++
        while (index < lines.length && !/^\s*<\/details>/.test(lines[index])) detail.push(lines[index++])
        if (index < lines.length) detail.push(lines[index++])
        const open = detail.shift()
        const close = detail.pop()
        const summary = detail[0] && /^\s*<summary>/.test(detail[0]) ? detail.shift() : ''
        html.push(open + summary + renderMarkdown(detail.join('\n')) + close)
        continue
      }
      if (/^\s*</.test(line)) {
        const raw = [line]
        index++
        while (index < lines.length && lines[index].trim() && /^\s*</.test(lines[index])) raw.push(lines[index++])
        html.push(raw.join('\n'))
        continue
      }
      if (/\|/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[index + 1])) {
        const rows = []
        const split = value => value.trim().replace(/^\||\|$/g, '').split('|').map(cell => inline(cell.trim()))
        const headings = split(line)
        index += 2
        while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) rows.push(split(lines[index++]))
        html.push('<table><thead><tr>' + headings.map(cell => `<th>${cell}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map(row => '<tr>' + headings.map((_, cell) => `<td>${row[cell] || ''}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
        continue
      }
      const list = line.match(/^\s*([-*+]|\d+\.)\s+(.+)$/)
      if (list) {
        const ordered = /\d/.test(list[1])
        const items = []
        while (index < lines.length) {
          const item = lines[index].match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/)
          if (!item) break
          items.push(`<li>${inline(item[1])}</li>`)
          index++
        }
        html.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
        continue
      }
      const paragraph = [line.trim()]
      index++
      while (index < lines.length && !isBlock(lines[index], lines[index + 1] || '')) paragraph.push(lines[index++].trim())
      html.push(`<p>${inline(paragraph.join(' '))}</p>`)
    }
    return html.join('\n')
  }

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
    const article = document.createElement('article')
    article.innerHTML = renderMarkdown(byId[id].previewMarkdown)
    article.querySelectorAll('a').forEach(link => { link.target = '_blank'; link.rel = 'noopener noreferrer' })
    return article
  }

  const comparisons = document.getElementById('comparison')
  options.forEach(option => {
    const card = document.createElement('section')
    card.className = 'compare-card'
    const header = document.createElement('div')
    header.className = 'compare-label'
    header.innerHTML = `<h3>${option.number} · ${option.name}</h3>`
    const button = document.createElement('button')
    button.type = 'button'; button.dataset.option = option.id
    button.textContent = 'View this'; button.setAttribute('aria-label', 'View ' + option.name)
    header.append(button)
    const scroll = document.createElement('div')
    scroll.className = 'compare-content'; scroll.tabIndex = 0; scroll.setAttribute('aria-label', option.name + ' README preview')
    const article = readmeFor(option.id)
    article.className = 'readme'; scroll.append(article)
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
    document.getElementById('option-description').textContent = view === 'compare' ? 'Showcase is selected. The other layouts are visual references.' : current.description
    document.getElementById('download').textContent = 'Download ' + current.name
    document.querySelectorAll('.option[data-option]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === selected)))
    for (const key of ['theme', 'view', 'width']) {
      const value = { theme, view, width }[key]
      document.querySelectorAll('[data-' + key + ']').forEach(button => {
        if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset[key] === value))
      })
    }
    const article = readmeFor(selected)
    content.replaceChildren(...article.childNodes)
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
    status.textContent = 'Downloaded the ' + byId[selected].name + ' README with repository-root paths.'
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
