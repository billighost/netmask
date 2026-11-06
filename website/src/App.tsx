import { useEffect, useMemo, useState, type ReactNode } from 'react'
import logo from '../../docs/branding/logos/orbit/mark.svg'
import fieldnotesPaper from '../../docs/assets/fieldnotes-paper.png'

type Page = 'home' | 'story' | 'downloads' | 'project' | 'motion'
type Stats = { downloads: number | null; stars: number | null; forks: number | null; releases: number | null }

const release = '2.4.1'
const releaseBase = `https://github.com/billighost/netmask/releases/download/v${release}`
const links = {
  windows: `${releaseBase}/NetMask_${release}_x64-setup.exe`,
  msi: `${releaseBase}/NetMask_${release}_x64_en-US.msi`,
  macArm: `${releaseBase}/NetMask_${release}_aarch64.dmg`,
  macIntel: `${releaseBase}/NetMask_${release}_x64.dmg`,
  deb: `${releaseBase}/NetMask_${release}_amd64.deb`,
  appImage: `${releaseBase}/NetMask_${release}_amd64.AppImage`,
  checksums: `${releaseBase}/checksums.txt`,
  release: `https://github.com/billighost/netmask/releases/tag/v${release}`
}

function usePageEffects(page: Page) {
  useEffect(() => {
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible')
    }), { threshold: .12 })
    document.querySelectorAll('[data-reveal]').forEach(node => reveal.observe(node))
    return () => reveal.disconnect()
  }, [page])
}

function useGithubStats(): Stats {
  const [stats, setStats] = useState<Stats>({ downloads: null, stars: null, forks: null, releases: null })
  useEffect(() => {
    const headers = { Accept: 'application/vnd.github+json' }
    Promise.all([
      fetch('https://api.github.com/repos/billighost/netmask', { headers }).then(response => response.ok ? response.json() : Promise.reject()),
      fetch('https://api.github.com/repos/billighost/netmask/releases?per_page=100', { headers }).then(response => response.ok ? response.json() : Promise.reject())
    ]).then(([repo, releases]) => setStats({
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      releases: releases.length,
      downloads: releases.reduce((total: number, item: { assets: { download_count: number }[] }) => total + item.assets.reduce((sum, asset) => sum + asset.download_count, 0), 0)
    })).catch(() => undefined)
  }, [])
  return stats
}

function Header({ page }: { page: Page }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(scrollY > 24)
    addEventListener('scroll', update, { passive: true }); update()
    return () => removeEventListener('scroll', update)
  }, [])
  const nav: [Exclude<Page, 'motion'>, string, string][] = [['home', '/', 'Home'], ['story', '/story/', 'The story'], ['downloads', '/downloads/', 'Downloads'], ['project', '/project/', 'Project']]
  return <header className={`site-header${scrolled ? ' scrolled' : ''}${open ? ' menu-open' : ''}`}>
    <a className="brand" href="/"><img src={logo} alt=""/><span>NetMask<small>DESKTOP COMPANION</small></span></a>
    <button className="menu-button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Toggle navigation"><i/><i/></button>
    <nav className={open ? 'open' : ''} aria-label="Main navigation">{nav.map(([id, href, label]) => <a key={id} className={page === id ? 'active' : ''} href={href}>{label}</a>)}</nav>
    <a className="edition-stamp" href="/downloads/">EDITION<br/>2.4.1</a>
  </header>
}

function Contours({ className = '' }: { className?: string }) {
  return <svg className={`contours ${className}`} viewBox="0 0 1000 700" aria-hidden="true">
    <path d="M-80 537C75 281 188 668 354 403S611 178 838 380s239-15 312-134"/><path d="M-90 590C82 330 202 714 385 449s322-190 505 4 233-40 309-155"/><path d="M-130 645C62 379 237 765 418 496s334-141 502 32 228-49 315-166"/><path d="M-30 476C97 229 204 602 345 340s290-206 490 6 221-4 296-114"/>
  </svg>
}

function MapArt({ compact = false, motion = false }: { compact?: boolean; motion?: boolean }) {
  return <div className={`map-art ${compact ? 'compact' : ''}${motion ? ' motion-map' : ''}`}>
    <svg viewBox="0 0 700 620" role="img" aria-label="A route from HomeFiber_5G to Studio">
      <path className="map-land" d="M54 124c75-82 182-62 234 4 45 56 112 21 184 66 82 52 152 185 91 271-58 81-191 18-284 71-96 54-224-6-242-104-17-90-59-224 17-308Z"/>
      <path className="map-river" d="M50 423c89-82 94-210 196-192 96 16 93 156 193 133 86-20 93-122 167-143"/>
      <path className="map-route" pathLength={motion ? 1 : undefined} d="M117 430C193 355 172 246 275 260s118 133 226 66"/>
      <circle className="map-start" cx="117" cy="430" r="13"/><circle className="map-end" cx="501" cy="326" r="18"/>
      <text x="61" y="475">HOMEFIBER_5G</text><text x="470" y="290">STUDIO</text>
      <g className="trees"><path d="m123 170 18 34h-36Z"/><path d="m158 151 22 42h-44Z"/><path d="m524 442 21 42h-42Z"/><path d="m557 423 19 39h-38Z"/></g>
    </svg>
    <div className="compass"><span>N</span><i/></div>
  </div>
}

const format = (value: number | null) => value === null ? '—' : new Intl.NumberFormat(undefined, value > 9999 ? { notation: 'compact', maximumFractionDigits: 1 } : {}).format(value)

function StatsStrip({ stats }: { stats: Stats }) {
  return <section className="stats-strip" aria-label="Live GitHub project counts">
    <p>PUBLIC PROJECT LEDGER</p><div><span><strong>{format(stats.downloads)}</strong> downloads</span><span><strong>{format(stats.stars)}</strong> stars</span><span><strong>{format(stats.forks)}</strong> forks</span><span><strong>{format(stats.releases)}</strong> releases</span></div><small>{stats.downloads === null ? 'Reading the public GitHub ledger…' : 'Live public counts from GitHub'}</small>
  </section>
}

function FieldFooter() {
  return <footer className="field-footer">
    <Contours/><div className="footer-copy"><p className="pencil">Colophon / the hand behind the map</p><h2>Drawn, built and maintained<br/>by <a href="https://github.com/billighost">Bello Bilal.</a></h2><p>NetMask is open source under the MIT license. Questions, field reports and careful contributions are welcome.</p><div className="signature">Bello Bilal</div></div>
    <nav><a href="https://github.com/billighost/netmask">Source code ↗</a><a href="https://github.com/billighost/netmask/issues">Report an issue ↗</a><a href="https://github.com/billighost/netmask/blob/main/CONTRIBUTING.md">Contribute ↗</a><a href="mailto:bb2010ng@gmail.com">Write a note ↗</a></nav>
    <div className="footer-seal"><img src={logo} alt=""/><span>NETMASK<br/>OPEN SOURCE<br/>2026</span></div>
  </footer>
}

function PageShell({ page, children }: { page: Page; children: ReactNode }) {
  return <><div className="page-meter"/><Header page={page}/><div className="motion-ambient" aria-hidden="true"/><main>{children}</main><FieldFooter/></>
}

function HomePage({ stats, motionEnabled = false, previewControls = false }: { stats: Stats; motionEnabled?: boolean; previewControls?: boolean }) {
  return <PageShell page="home">
    {previewControls && <MotionOverlay previewControls/>}
    <section className={`home-hero${motionEnabled ? ' motion-hero' : ''}`} data-motion-chapter="Orientation">
      <Contours className="hero-contours"/><div className="atlas-cover" data-reveal><div className="cover-spine">VOL. 02 · DESKTOP NETWORK COMPANION</div><img src={logo} alt="NetMask Orbit logo"/><p className="overline">PERSONAL FIELD REFERENCE</p><h1>Your networks.<br/><em>Your names.</em></h1><p>Give a network a familiar local name, read the connection, and prepare the screen before you share it.</p><div className="cover-owner">PROPERTY OF <span>YOU</span></div></div>
      <div className="hero-map-wrap" data-reveal><MapArt motion={motionEnabled}/><aside><strong>FIELD NOTE 01</strong><p>The router keeps its broadcast name. NetMask changes the supported local label on your computer.</p></aside></div>
      <a className="unfold" href="#legend">UNFOLD THE STORY <span>↓</span></a>
    </section>

    <section className="legend" id="legend" data-motion-chapter="The legend"><header data-reveal><span>MAP LEGEND</span><h2>Four marks worth knowing.</h2></header><div className="legend-grid">
      <Legend icon="signal" title="Name">Give a saved network a familiar local label and preserve the original.</Legend><Legend icon="pulse" title="Read">See available activity, response times, Wi-Fi detail and plain explanations.</Legend><Legend icon="eye" title="Mask">Hide supported details inside NetMask before a call, recording or screenshot.</Legend><Legend icon="return" title="Restore">Return to the recorded original. Recovery is part of the path.</Legend>
    </div></section>

    <section className="home-story" data-motion-chapter="Familiar ground"><article data-reveal><div><p className="pencil">Entry 01 / familiar ground</p><h2>Call the place<br/>what you call it.</h2><p><code>HomeFiber_5G</code> can become <strong>Studio</strong> on your computer. The original is recorded before the change, then kept close for restoration.</p><a className="text-link" href="/story/">Follow the complete field story →</a></div><div className="specimen-label"><span>SPECIMEN A</span><s>HomeFiber_5G</s><strong>Studio</strong><small>LOCAL LABEL / ORIGINAL FILED</small></div></article></section>

    <section className="app-plate" data-reveal data-motion-chapter="The instrument"><figure><img src={fieldnotesPaper} alt="NetMask Fieldnotes interface showing the Studio network and connection readings"/><figcaption>PLATE 04 — ACTUAL FIELDNOTES INTERFACE · FICTIONAL NETWORKS / SAMPLE MEASUREMENTS</figcaption></figure><div><p className="pencil">The object itself</p><h2>A useful little window,<br/>not another control center.</h2><p>Paper and Dark themes. Custom controls. Honest unavailable states. Dialogs and panels that still work at 320 × 200.</p><ul><li><strong>Windows, macOS, Linux</strong><span>Native system integrations</span></li><li><strong>Tauri 2 + Rust</strong><span>Small desktop architecture</span></li><li><strong>React + TypeScript</strong><span>Readable, responsive interface</span></li></ul></div></section>

    <section className="component-preview" data-motion-chapter="Field controls"><header data-reveal><p className="pencil">The interface between the chapters</p><h2>Every small mark<br/>belongs to the atlas.</h2></header><div className="component-grid"><div className="sample-editor"><span>FAMILIAR LOCAL NAME</span><strong>Studio</strong><small>Original: HomeFiber_5G · recovery ready</small><button>Save name</button></div><div className="sample-notes"><blockquote><strong>Useful to know</strong>This changes a supported label on this computer.</blockquote><blockquote className="warning"><strong>Before sharing a QR</strong>The image contains readable Wi-Fi credentials.</blockquote></div><div className="sample-list"><p><i/>Studio <b>18 ms</b></p><p><i/>Workshop <b>—</b></p><p><i/>Guest Room <b>•••</b></p></div></div></section>
    <StatsStrip stats={stats}/><DownloadInvitation/>
  </PageShell>
}

function MotionOverlay({ previewControls = false }: { previewControls?: boolean }) {
  const [paused, setPaused] = useState(false)
  const [chapter, setChapter] = useState('Orientation')
  useEffect(() => {
    document.body.classList.toggle('motion-paused', paused)
    return () => document.body.classList.remove('motion-paused')
  }, [paused])
  useEffect(() => {
    const update = () => {
      const marker = [...document.querySelectorAll<HTMLElement>('[data-motion-chapter]')].find(section => {
        const rect = section.getBoundingClientRect(); return rect.top <= innerHeight * .48 && rect.bottom >= innerHeight * .48
      })
      if (marker?.dataset.motionChapter) setChapter(marker.dataset.motionChapter)
    }
    addEventListener('scroll', update, { passive: true }); update()
    return () => removeEventListener('scroll', update)
  }, [])
  return <>{previewControls && <aside className="motion-study-panel"><span>MOTION STUDY / 01</span><strong><i/> LIVE PREVIEW</strong><p>Move the pointer. Scroll slowly. Hover the field cards.</p><button onClick={() => setPaused(value => !value)}>{paused ? 'Resume motion' : 'Pause motion'}</button><a href="/">Exit preview ↗</a></aside>}<button className="journey-compass" onClick={() => setPaused(value => !value)} aria-pressed={paused} aria-label={`${paused ? 'Resume' : 'Pause'} motion. Current chapter: ${chapter}`} title={paused ? 'Resume motion' : 'Pause motion'}><div><span>N</span><i/></div><p><small>NOW READING</small>{chapter}</p></button></>
}

function Legend({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  const paths: Record<string, ReactNode> = {
    signal: <><path d="M18 56c17-25 47-25 64 0M29 67c12-16 30-16 42 0M43 78c4-6 10-6 14 0"/></>,
    pulse: <path d="M15 64h13l8-24 13 43 12-57 10 38h14"/>,
    eye: <><path d="M14 51s14-22 36-22 36 22 36 22-14 22-36 22-36-22-36-22Z"/><path d="m21 82 58-62"/></>,
    return: <><path d="M76 31a33 33 0 1 0 5 35"/><path d="M79 14v20H59"/></>
  }
  return <article data-reveal><svg viewBox="0 0 100 100">{paths[icon]}</svg><h3>{title}</h3><p>{children}</p></article>
}

function DownloadInvitation() {
  return <section className="download-invitation" data-reveal><p>SUPPLY DESK · OFFICIAL RELEASE</p><h2>Pack the right edition.</h2><span>v2.4.1</span><a href="/downloads/">Choose your platform →</a></section>
}

function StoryPage() {
  const chapters = [
    { n: '01', note: 'Observation: technical names create tiny daily friction.', title: <>Call the place<br/>what you call it.</>, body: <>Choose a saved network and give its supported local label a name that belongs in your world. Before any system change, NetMask records the original. A familiar name never erases the way back.</>, art: <div className="rename-art"><s>HomeFiber_5G</s><i>becomes</i><strong>Studio</strong><small>ORIGINAL / RECORDED</small></div> },
    { n: '02', note: 'Observation: readings help only when their meaning travels with them.', title: <>Read the weather<br/>of the connection.</>, body: <>Live transfer activity, router response and internet response sit beside explanations. Run a connection check and export a readable report when you need to show what happened.</>, art: <MetricArt/> },
    { n: '03', note: 'Observation: preparing the screen should take one deliberate action.', title: <>Close the notebook<br/>on private details.</>, body: <>Sharing mode masks supported names, identifiers, notifications, reports and Wi-Fi sharing controls inside NetMask. It changes what this app displays; it does not make the connection anonymous.</>, art: <RedactionArt/> },
    { n: '04', note: 'Observation: a trustworthy change includes the route back.', title: <>Keep the original<br/>in the legend.</>, body: <>Restore the recorded original whenever you choose. NetMask checks for stale states, keeps recovery records through partial failures, and refuses ambiguous guesses.</>, art: <RestoreArt/> }
  ]
  return <PageShell page="story"><PageHero number="FIELD STORY / 01—04" title={<>A small journey from<br/><em>noise to a name.</em></>} copy="Four careful chapters explain what NetMask changes, what it only displays, and how the original stays recoverable." art={<MapArt compact/>}/><section className="chapter-list">{chapters.map(chapter => <article className="chapter" key={chapter.n} data-reveal><div className="chapter-number">ENTRY<br/>{chapter.n}</div><div><p className="pencil">{chapter.note}</p><h2>{chapter.title}</h2><p>{chapter.body}</p></div>{chapter.art}</article>)}</section><section className="scope-note" data-reveal><div><p>THE EDGE OF THE MAP</p><h2>Clear limits are<br/>part of the feature.</h2></div><ul><li>Your router keeps broadcasting its Wi-Fi name.</li><li>Available controls depend on the operating system, adapter and permissions.</li><li>Display masking does not protect other apps or make a connection anonymous.</li><li>Wi-Fi QR codes contain readable credentials.</li></ul></section><DownloadInvitation/></PageShell>
}

function MetricArt() { return <div className="metric-art"><p>ROUTER RESPONSE<strong>18 <small>ms</small></strong><i style={{ '--score': '72%' } as React.CSSProperties}/></p><p>INTERNET RESPONSE<strong>42 <small>ms</small></strong><i style={{ '--score': '54%' } as React.CSSProperties}/></p><p>PACKET LOSS<strong>0 <small>%</small></strong><i style={{ '--score': '100%' } as React.CSSProperties}/></p><small>SAMPLE MEASUREMENTS</small></div> }
function RedactionArt() { return <div className="redaction-art"><span>BEFORE SHARING</span><p>Studio · Workshop · Guest Room</p><span>SHARING MODE</span><p><i/><i/><i/></p><b>DISPLAY<br/>ONLY</b></div> }
function RestoreArt() { return <div className="restore-art"><div><strong>Studio</strong><i>↺</i><span>HomeFiber_5G</span></div><small>RESTORATION PATH · AVAILABLE</small></div> }

function PageHero({ number, title, copy, art }: { number: string; title: ReactNode; copy: string; art: ReactNode }) {
  return <section className="page-hero"><Contours/><div data-reveal><p>{number}</p><h1>{title}</h1><span>{copy}</span></div><div className="page-hero-art" data-reveal>{art}</div></section>
}

type Platform = 'windows' | 'macos' | 'linux'
function DownloadsPage() {
  const detected = useMemo<Platform>(() => /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'macos' : /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? 'linux' : 'windows', [])
  const [platform, setPlatform] = useState<Platform>(detected)
  return <PageShell page="downloads"><PageHero number="SUPPLY DESK / RELEASE 2.4.1" title={<>Take NetMask<br/><em>with you.</em></>} copy="Official desktop packages for Windows, macOS, and Linux—delivered directly from the GitHub release." art={<SupplyCrate/>}/><section className="download-desk"><div className="platform-tabs" role="tablist">{(['windows','macos','linux'] as Platform[]).map(item => <button key={item} className={platform === item ? 'active' : ''} onClick={() => setPlatform(item)}>{item}</button>)}</div><div className="package-sheet">{platform === 'windows' && <Package title="Windows 10 / 11 · x64" code="PACK 01 / WIN.X64" description="The setup file is recommended for most people. The MSI installs the same app and is useful for managed deployment." primary={[links.windows, 'Download setup .exe']} secondary={[links.msi, 'MSI package']}/>} {platform === 'macos' && <Package title="macOS 12+" code="PACK 02 / MAC.UNIVERSAL" description="Choose the build matching your Mac. Open the DMG, then drag NetMask into Applications." primary={[links.macArm, 'Apple silicon DMG']} secondary={[links.macIntel, 'Intel DMG']}/>} {platform === 'linux' && <Package title="Linux · x64 · NetworkManager" code="PACK 03 / LINUX.X64" description="Choose a Debian package for Debian, Ubuntu, Mint and related systems, or a portable AppImage." primary={[links.deb, 'Debian / Ubuntu .deb']} secondary={[links.appImage, 'Portable AppImage']}/>}</div>
      <div className="verification-row"><span>VERIFY THE PACKAGE</span><a href={links.checksums}>SHA-256 checksums ↗</a><a href={links.release}>Release notes ↗</a><a href="https://github.com/billighost/netmask/blob/main/SECURITY.md">Installation & privacy ↗</a></div></section>
      <section className="install-map"><header data-reveal><p className="pencil">A short route from package to first value</p><h2>Arrive in four steps.</h2></header><ol><li data-reveal><span>01</span><div><h3>Choose the native package.</h3><p>Match your operating system and processor. Downloads come from the official GitHub release.</p></div></li><li data-reveal><span>02</span><div><h3>Inspect the source and checksum.</h3><p>Checksums detect changed or incomplete files. The project does not currently claim Windows publisher signing or macOS notarization.</p></div></li><li data-reveal><span>03</span><div><h3>Name, check, or prepare.</h3><p>The first-run guide offers three routes: name a network, check the connection, or prepare for sharing.</p></div></li><li data-reveal><span>04</span><div><h3>Keep restoration nearby.</h3><p>Original labels are recorded before changes. Uninstall recovery and manual restore paths are documented.</p></div></li></ol></section>
      <section className="system-notes"><h2>Platform field notes.</h2><details open><summary>Windows</summary><p>Edits supported Network List labels and saved Wi-Fi profile labels. Some changes require administrator approval.</p></details><details><summary>macOS</summary><p>Edits the network service label through system tools. It does not remove and recreate the Wi-Fi network.</p></details><details><summary>Linux</summary><p>Edits NetworkManager connection names and uses stable UUIDs for reconnects. NetworkManager is required.</p></details></section>
    </PageShell>
}

function SupplyCrate() { return <div className="supply-crate"><img src={logo} alt=""/><strong>NETMASK</strong><span>DESKTOP FIELD KIT</span><b>v2.4.1</b></div> }
function Package({ title, code, description, primary, secondary }: { title: string; code: string; description: string; primary: [string,string]; secondary: [string,string] }) { return <article className="package" data-reveal><div className="pack-icon">NM</div><div><span>{code}</span><h2>{title}</h2><p>{description}</p><a className="primary-download" href={primary[0]}>{primary[1]} ↓</a><a className="secondary-download" href={secondary[0]}>{secondary[1]}</a></div></article> }

function ProjectPage({ stats }: { stats: Stats }) {
  return <PageShell page="project"><PageHero number="PROJECT LEDGER / OPEN SOURCE" title={<>Built in the open.<br/><em>Kept human.</em></>} copy="The people, architecture, measurements, and design principles behind the field guide." art={<CreatorSeal/>}/><StatsStrip stats={stats}/>
    <section className="creator-section" data-reveal><div><p className="pencil">The hand behind the map</p><h2>Bello Bilal builds and maintains NetMask.</h2><p>The project began with a simple annoyance: network labels are often made for equipment, not people. NetMask turns that friction into a focused, reversible desktop workflow.</p><div className="project-links"><a href="https://github.com/billighost">GitHub profile ↗</a><a href="mailto:bb2010ng@gmail.com">Email Bello ↗</a></div></div><div className="creator-card"><img src={logo} alt=""/><span>CREATOR / MAINTAINER</span><strong>Bello Bilal</strong><small>@billighost · Lagos, Nigeria</small></div></section>
    <section className="principles"><header data-reveal><p>DESIGN VALUES / THE COMPASS</p><h2>What points the work north.</h2></header><div><article data-reveal><span>01</span><h3>Specific over magical.</h3><p>Explain exactly what changes, where it changes, and which system limit still applies.</p></article><article data-reveal><span>02</span><h3>Reversible by design.</h3><p>Record originals, verify results, preserve partial failures, and keep repair actions visible.</p></article><article data-reveal><span>03</span><h3>Useful before expansive.</h3><p>Keep a small set of connected tools close instead of growing a permanent dashboard.</p></article><article data-reveal><span>04</span><h3>Private without theatre.</h3><p>Mask supported details honestly without claiming anonymity or protection outside the app.</p></article></div></section>
    <section className="architecture-plate" data-reveal><div><p className="pencil">Under the paper</p><h2>One desktop runtime,<br/>two careful layers.</h2><p>React and TypeScript render Fieldnotes inside a Tauri webview. Typed commands cross into Rust engines for network, storage, diagnostics, updates and operating-system integration.</p><a href="https://github.com/billighost/netmask/blob/main/docs/ARCHITECTURE.md">Read the architecture notes →</a></div><svg viewBox="0 0 700 400" aria-label="Simplified NetMask architecture"><g><rect x="45" y="70" width="175" height="90"/><text x="132" y="108">FIELDNOTES</text><text x="132" y="132">React + TypeScript</text></g><path d="M220 115h85"/><g><rect x="305" y="70" width="175" height="90"/><text x="392" y="108">TAURI BRIDGE</text><text x="392" y="132">typed commands</text></g><path d="M480 115h85"/><g><rect x="565" y="70" width="100" height="90"/><text x="615" y="108">RUST</text><text x="615" y="132">engines</text></g><path d="M615 160v100M615 260H135M135 260v65"/><g><rect x="45" y="325" width="180" height="55"/><text x="135" y="358">WINDOWS · MAC · LINUX</text></g></svg></section>
    <section className="project-actions"><a href="https://github.com/billighost/netmask"><span>SOURCE</span><strong>Read the code ↗</strong></a><a href="https://github.com/billighost/netmask/issues"><span>FIELD REPORTS</span><strong>Open an issue ↗</strong></a><a href="https://github.com/billighost/netmask/blob/main/CONTRIBUTING.md"><span>CONTRIBUTIONS</span><strong>Help improve it ↗</strong></a></section>
  </PageShell>
}

function CreatorSeal() { return <div className="creator-seal"><img src={logo} alt=""/><div><span>CREATED & MAINTAINED BY</span><strong>BELLO BILAL</strong><small>OPEN SOURCE · MIT</small></div></div> }

function useMotionLife(enabled: boolean, route: Page) {
  useEffect(() => {
    if (!enabled) return
    const body = document.body
    const style = document.documentElement.style
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    body.classList.add('motion-preview-page')
    if (reduced) body.classList.add('motion-reduced')
    let targetX = .5, targetY = .5, cursorX = .5, cursorY = .5
    let lastScroll = scrollY, velocity = 0, frame = 0
    const motionReveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible')
    }), { threshold: .06, rootMargin: '0px 0px -3% 0px' })
    const motionRevealItems = [...document.querySelectorAll<HTMLElement>('[data-reveal]')]
    motionRevealItems.forEach(node => motionReveal.observe(node))
    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
    const pointer = (event: PointerEvent) => { targetX = event.clientX / innerWidth; targetY = event.clientY / innerHeight }
    const tick = () => {
      cursorX += (targetX - cursorX) * .075; cursorY += (targetY - cursorY) * .075
      const nextVelocity = scrollY - lastScroll; velocity += (nextVelocity - velocity) * .12; lastScroll = scrollY
      const hero = document.querySelector<HTMLElement>('.motion-hero, .page-hero')
      const app = document.querySelector<HTMLElement>('.app-plate')
      const heroProgress = hero ? clamp(-hero.getBoundingClientRect().top / Math.max(1, hero.offsetHeight * .78)) : 0
      const appRect = app?.getBoundingClientRect()
      const appProgress = appRect ? clamp((innerHeight - appRect.top) / (innerHeight + appRect.height)) : 0
      const pageProgress = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight))
      motionRevealItems.forEach(node => {
        if (node.classList.contains('visible')) return
        const rect = node.getBoundingClientRect()
        if (rect.top < innerHeight * .95 && rect.bottom > 0) node.classList.add('visible')
      })
      style.setProperty('--cursor-px', `${cursorX * 100}%`); style.setProperty('--cursor-py', `${cursorY * 100}%`)
      style.setProperty('--cover-tilt-x', `${(cursorY - .5) * -2.4}deg`); style.setProperty('--cover-tilt-y', `${(cursorX - .5) * 3.2}deg`)
      style.setProperty('--map-x', `${(cursorX - .5) * 18}px`); style.setProperty('--map-y', `${(cursorY - .5) * 14}px`)
      style.setProperty('--map-river-x', `${(cursorX - .5) * -4}px`); style.setProperty('--map-land-y', `${(cursorY - .5) * -2.5}px`)
      style.setProperty('--hero-shift', `${heroProgress * 44}px`); style.setProperty('--map-scroll-shift', `${heroProgress * -38}px`)
      style.setProperty('--route-offset', String(1 - Math.min(1, heroProgress * 1.85 + .08)))
      style.setProperty('--app-shift', `${(appProgress - .5) * -44}px`)
      style.setProperty('--motion-velocity', `${clamp(velocity, -24, 24)}deg`)
      style.setProperty('--label-rotation', `${1.5 + clamp(velocity, -24, 24) * .025}deg`)
      style.setProperty('--tape-left-rotation', `${-13 + clamp(velocity, -24, 24) * .035}deg`); style.setProperty('--tape-right-rotation', `${9 - clamp(velocity, -24, 24) * .03}deg`)
      style.setProperty('--compass-angle', `${pageProgress * 540 + clamp(velocity, -20, 20) * .7}deg`)
      frame = requestAnimationFrame(tick)
    }
    addEventListener('pointermove', pointer, { passive: true }); frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame); removeEventListener('pointermove', pointer); motionReveal.disconnect()
      body.classList.remove('motion-preview-page', 'motion-paused', 'motion-reduced')
      for (const property of ['--cursor-px','--cursor-py','--cover-tilt-x','--cover-tilt-y','--map-x','--map-y','--map-river-x','--map-land-y','--hero-shift','--map-scroll-shift','--route-offset','--app-shift','--motion-velocity','--label-rotation','--tape-left-rotation','--tape-right-rotation','--compass-angle']) style.removeProperty(property)
    }
  }, [enabled, route])
}

export default function App() {
  const routePage = () => {
    const segment = location.pathname.split('/').filter(Boolean)[0]
    return (segment === 'motion-preview' ? 'motion' : segment === 'story' || segment === 'downloads' || segment === 'project' ? segment : 'home') as Page
  }
  const [page, setPage] = useState<Page>(routePage)
  const stats = useGithubStats()
  usePageEffects(page)
  useEffect(() => {
    const titles: Record<Page, string> = { home: 'NetMask — Your networks. Your names.', story: 'The field story — NetMask', downloads: 'Download NetMask v2.4.1', project: 'The project — NetMask', motion: 'Motion study — NetMask' }
    document.title = titles[page]
    const onPopState = () => setPage(routePage())
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element).closest('a')
      if (!anchor || anchor.target || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, location.href)
      if (url.origin !== location.origin || !['/', '/story/', '/downloads/', '/project/', '/motion-preview/'].includes(url.pathname)) return
      event.preventDefault()
      if (url.pathname !== location.pathname) history.pushState({}, '', url.pathname)
      setPage(routePage())
      scrollTo({ top: 0, behavior: 'auto' })
    }
    addEventListener('popstate', onPopState)
    document.addEventListener('click', onClick)
    return () => { removeEventListener('popstate', onPopState); document.removeEventListener('click', onClick) }
  }, [page])
  useMotionLife(true, page)
  if (page === 'motion') return <HomePage stats={stats} motionEnabled previewControls/>
  if (page === 'story') return <StoryPage/>
  if (page === 'downloads') return <DownloadsPage/>
  if (page === 'project') return <ProjectPage stats={stats}/>
  return <HomePage stats={stats} motionEnabled/>
}
