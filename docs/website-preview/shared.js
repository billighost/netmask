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

  const setupPlatforms = () => {
    const tabs = [...document.querySelectorAll('[data-platform-tab]')]
    const panels = [...document.querySelectorAll('[data-platform-panel]')]
    if (!tabs.length) return
    const ua = navigator.userAgent.toLowerCase()
    const detected = /android/.test(ua) ? null : /mac|iphone|ipad/.test(ua) ? 'macos' : /linux|x11/.test(ua) ? 'linux' : 'windows'
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
      ['A sample enters.', 'NetMask records a measured moment on the active saved network, or marks the moment missing when it cannot measure.'],
      ['The pattern gains context.', 'Drops, latency, jitter, switches and observed data use stay tied to a network and time.'],
      ['The right action appears.', 'Going live, presets, digests and calm alerts remain opt-in, explained and reversible.'],
      ['Evidence leaves carefully.', 'Provider reports include measurements only, redact identifiers by default and never contain Wi-Fi passwords.']
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
})()
