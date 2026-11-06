(() => {
  const root = document.documentElement
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  const reveal = () => {
    const items = document.querySelectorAll('[data-reveal]')
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(item => item.classList.add('is-visible'))
      return
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        entry.target.querySelectorAll('.privacy-window').forEach(item => item.classList.add('is-visible'))
        observer.unobserve(entry.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' })
    items.forEach(item => observer.observe(item))
  }

  const updateProgress = () => {
    const max = document.documentElement.scrollHeight - innerHeight
    root.style.setProperty('--progress', max > 0 ? Math.min(1, scrollY / max) : 0)
  }

  const formatCount = value => {
    if (!Number.isFinite(value)) return '—'
    if (value < 10000) return new Intl.NumberFormat().format(value)
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }

  const loadGithubStats = async () => {
    const status = document.querySelectorAll('[data-stats-status]')
    try {
      const headers = { Accept: 'application/vnd.github+json' }
      const [repoResponse, releaseResponse] = await Promise.all([
        fetch('https://api.github.com/repos/billighost/netmask', { headers }),
        fetch('https://api.github.com/repos/billighost/netmask/releases?per_page=100', { headers })
      ])
      if (!repoResponse.ok || !releaseResponse.ok) throw new Error('GitHub response unavailable')
      const [repo, releases] = await Promise.all([repoResponse.json(), releaseResponse.json()])
      const stats = {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        releases: releases.length,
        downloads: releases.reduce((total, release) => total + release.assets.reduce((sum, asset) => sum + asset.download_count, 0), 0)
      }
      Object.entries(stats).forEach(([name, value]) => {
        document.querySelectorAll(`[data-stat="${name}"]`).forEach(node => {
          node.textContent = formatCount(value)
          node.title = new Intl.NumberFormat().format(value)
        })
      })
      status.forEach(node => { node.textContent = 'Live public counts from GitHub' })
    } catch {
      status.forEach(node => { node.innerHTML = '<a href="https://github.com/billighost/netmask">Live counts unavailable · view GitHub ↗</a>' })
    }
  }

  const setupPlatforms = () => {
    const tabs = [...document.querySelectorAll('[data-platform-tab]')]
    const panels = [...document.querySelectorAll('[data-platform-panel]')]
    if (!tabs.length) return
    const ua = navigator.userAgent.toLowerCase()
    const detected = /mac|iphone|ipad/.test(ua) ? 'macos' : /linux|x11/.test(ua) && !/android/.test(ua) ? 'linux' : 'windows'
    const select = platform => {
      tabs.forEach(tab => {
        const active = tab.dataset.platformTab === platform
        tab.classList.toggle('is-active', active)
        tab.setAttribute('aria-selected', String(active))
        tab.tabIndex = active ? 0 : -1
      })
      panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.platformPanel === platform))
    }
    tabs.forEach(tab => tab.addEventListener('click', () => select(tab.dataset.platformTab)))
    select(tabs.some(tab => tab.dataset.platformTab === detected) ? detected : tabs[0].dataset.platformTab)
  }

  const setupTrainJourney = () => {
    const section = document.querySelector('.train-journey')
    const train = document.querySelector('.train-model')
    if (!section || !train || reduceMotion) return
    const title = document.querySelector('[data-journey-title]')
    const copy = document.querySelector('[data-journey-copy]')
    const count = document.querySelector('[data-journey-count]')
    const chapters = [
      ['A flat label enters.', 'At first, it is only a name on a screen—technical, distant, easy to ignore.'],
      ['The object gains depth.', 'NetMask reveals what the label means, where it lives, and which actions are actually local.'],
      ['It finds the rails.', 'A familiar name, readable measurements and careful privacy controls form one connected route.'],
      ['The original stays home.', 'The journey ends with a label you recognise and a restoration path that never disappeared.']
    ]
    let lastChapter = -1
    const update = () => {
      const rect = section.getBoundingClientRect()
      const distance = section.offsetHeight - innerHeight
      const progress = Math.max(0, Math.min(1, -rect.top / distance))
      const x = 8 + progress * 66
      const y = progress < .65 ? Math.sin(progress * Math.PI) * -45 : (progress - .65) * 80
      const rotation = progress < .28 ? 0 : Math.min(28, (progress - .28) * 75)
      train.style.setProperty('--tx', `${x}vw`)
      train.style.setProperty('--ty', `${y}px`)
      train.style.setProperty('--rot', `${rotation}deg`)
      const chapter = Math.min(3, Math.floor(progress * 4.01))
      if (chapter !== lastChapter) {
        title.textContent = chapters[chapter][0]
        copy.textContent = chapters[chapter][1]
        count.textContent = String(chapter + 1).padStart(2, '0')
        lastChapter = chapter
      }
    }
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update)
    update()
  }

  let ticking = false
  addEventListener('scroll', () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => { updateProgress(); ticking = false })
  }, { passive: true })
  addEventListener('resize', updateProgress)

  reveal()
  updateProgress()
  setupPlatforms()
  setupTrainJourney()
  loadGithubStats()
})()
