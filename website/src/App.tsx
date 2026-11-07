import { useEffect, useMemo, useState, type ReactNode } from 'react'
import logo from '../../docs/branding/logos/orbit/mark.svg'
import fieldnotesPaper from '../../docs/assets/fieldnotes-paper.png'

type Page = 'home' | 'story' | 'downloads' | 'project' | 'motion'

const release = '2.7.0'
const siteUrl = 'https://getnetmask.vercel.app'
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
    <a className="brand" href="/"><img src={logo} alt=""/><span>NetMask<small>LOCAL CONNECTION COMPANION</small></span></a>
    <button className="menu-button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Toggle navigation"><i/><i/></button>
    <nav className={open ? 'open' : ''} aria-label="Main navigation">{nav.map(([id, href, label]) => <a key={id} className={page === id ? 'active' : ''} href={href}>{label}</a>)}</nav>
    <a className="edition-stamp" href="/downloads/">EDITION<br/>{release}</a>
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

function StatsStrip() {
  return <section className="stats-strip" aria-label="NetMask project principles">
    <p>LOCAL-FIRST PROJECT LEDGER</p><div><span><strong>Local</strong> history</span><span><strong>Bounded</strong> storage</span><span><strong>Measured</strong> evidence</span><span><strong>Open</strong> source</span></div><small>No visitor analytics or live third-party counters.</small>
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

function HomePage({ motionEnabled = false, previewControls = false }: { motionEnabled?: boolean; previewControls?: boolean }) {
  return <PageShell page="home">
    {previewControls && <MotionOverlay previewControls/>}
    <section className={`home-hero${motionEnabled ? ' motion-hero' : ''}`} data-motion-chapter="Orientation">
      <Contours className="hero-contours"/><div className="atlas-cover" data-reveal><div className="cover-spine">VOL. 03 · LOCAL CONNECTION COMPANION</div><img src={logo} alt="NetMask Orbit logo"/><p className="overline">PRIVATE FIELD REFERENCE</p><h1>Know your connection.<br/><em>Control what you show.</em></h1><p>Keep a local record of reliability and data use, prepare for calls, and keep network labels and reports under your control.</p><div className="cover-owner">PROPERTY OF <span>YOU</span></div></div>
      <div className="hero-map-wrap" data-reveal><MapArt motion={motionEnabled}/><aside><strong>FIELD NOTE 01</strong><p>The router keeps its broadcast name. NetMask changes the supported local label on your computer.</p></aside></div>
      <a className="unfold" href="#legend">UNFOLD THE STORY <span>↓</span></a>
    </section>

    <section className="legend" id="legend" data-motion-chapter="The legend"><header data-reveal><span>MAP LEGEND</span><h2>Four ways NetMask stays useful.</h2></header><div className="legend-grid">
      <Legend icon="pulse" title="Observe">See drops, latency spikes, jitter, missing samples, and observed data use by network.</Legend><Legend icon="eye" title="Prepare">Going live checks the connection and turns on sharing mode in one reversible action.</Legend><Legend icon="signal" title="Personalize">Apply opt-in network presets and familiar local labels, with preview and undo.</Legend><Legend icon="return" title="Prove">Create a measured, redacted provider report for a period you choose.</Legend>
    </div></section>

    <section className="home-story" data-motion-chapter="Familiar ground"><article data-reveal><div><p className="pencil">Entry 01 / yesterday afternoon</p><h2>See where the call<br/>started to struggle.</h2><p>Local history keeps measured latency, jitter, drops, gaps, and network changes together. Missing samples remain blank instead of being guessed.</p><a className="text-link" href="/story/">Follow the complete field story →</a></div><div className="specimen-label"><span>WEEKLY FIELD NOTE</span><strong>2 unstable periods</strong><small>74% SAMPLE COVERAGE · GAPS SHOWN</small></div></article></section>

    <section className="app-plate" data-reveal data-motion-chapter="The instrument"><figure><img src={fieldnotesPaper} alt="NetMask Fieldnotes interface with a fictional Studio connection and sample local measurements"/><figcaption>PLATE 04 — FIELDNOTES · FICTIONAL NETWORKS / SAMPLE MEASUREMENTS</figcaption></figure><div><p className="pencil">The object itself</p><h2>Always available.<br/>Still deliberately light.</h2><p>Monitoring is local, bounded, pausable, and deletable. The tray keeps native background work small and restores the window when you need it.</p><ul><li><strong>Windows, macOS, Linux</strong><span>Limits explained per platform</span></li><li><strong>Tauri 2 + Rust</strong><span>Native storage and background work</span></li><li><strong>320 × 200</strong><span>Readable, keyboard-friendly Fieldnotes</span></li></ul></div></section>

    <section className="component-preview" data-motion-chapter="Field controls"><header data-reveal><p className="pencil">The interface between the chapters</p><h2>Plain findings,<br/>with clear limits.</h2></header><div className="component-grid"><div className="sample-editor"><span>GOING LIVE</span><strong>Ready, with a note</strong><small>Connection steady · sharing mode on</small><button>Review check</button></div><div className="sample-notes"><blockquote><strong>Data use</strong>Observed on this computer, not provider billing.</blockquote><blockquote className="warning"><strong>Change alert</strong>A new access point can be normal on mesh Wi-Fi.</blockquote></div><div className="sample-list"><p><i/>Studio <b>18 ms</b></p><p><i/>Workshop <b>— missing</b></p><p><i/>Guest Room <b>82% limit</b></p></div></div></section>
    <StatsStrip/><DownloadInvitation/>
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
  return <section className="download-invitation" data-reveal><p>SUPPLY DESK · OFFICIAL RELEASE</p><h2>Pack the right edition.</h2><span>v{release}</span><a href="/downloads/">Choose your platform →</a></section>
}

function StoryPage() {
  const chapters = [
    { n: '01', note: 'Observation: a bad call is easier to explain when the gaps stay visible.', title: <>Keep the weather<br/>of the connection.</>, body: <>When local monitoring is on, NetMask records measured latency, jitter, drops, missing intervals, and the network and time involved. History is bounded, pausable, and deletable.</>, art: <MetricArt/> },
    { n: '02', note: 'Observation: a local counter is useful only when its scope is clear.', title: <>Understand data use<br/>network by network.</>, body: <>Observed traffic follows stable network and adapter changes across restarts and counter resets. User-set limits create reminders; they are not provider billing or enforcement.</>, art: <div className="rename-art"><span>STUDIO</span><strong>82%</strong><small>LOCAL LIMIT · THIS COMPUTER</small></div> },
    { n: '03', note: 'Observation: preparation should take one deliberate action.', title: <>Know whether you are<br/>ready to go live.</>, body: <>Going live checks the measured connection, turns on sharing mode, and gives a plain result. Opt-in call-app detection can offer the same help without changing anything silently.</>, art: <RedactionArt/> },
    { n: '04', note: 'Observation: patterns need enough evidence before they become advice.', title: <>Read a weekly digest<br/>that knows its limits.</>, body: <>The digest summarizes measured reliability, sample coverage, unusual periods, and repeated findings. When the record is too small, it says so instead of filling the week with guesses.</>, art: <RestoreArt/> },
    { n: '05', note: 'Observation: a provider needs dates, coverage, and measured evidence.', title: <>Build a report<br/>people can take seriously.</>, body: <>Choose a period and export a readable evidence report. Identifiers are redacted by default, Wi-Fi passwords are never included, and missing samples remain missing.</>, art: <MetricArt/> },
    { n: '06', note: 'Observation: personal settings should follow the place, not surprise you.', title: <>Keep each network<br/>familiar and reversible.</>, body: <>Preview an opt-in preset for a saved network, apply its label and display choices, and undo safely. Meaningful change alerts stay rare and explain that a new access point may be normal roaming.</>, art: <div className="rename-art"><s>HomeFiber_5G</s><i>preset preview</i><strong>Studio</strong><small>ORIGINAL / RECOVERABLE</small></div> }
  ]
  return <PageShell page="story"><PageHero number="FIELD STORY / 01—06" title={<>A local record for<br/><em>the connection you use.</em></>} copy="Six careful chapters explain what NetMask measures, what it changes, what stays local, and where the limits remain." art={<MapArt compact/>}/><section className="chapter-list">{chapters.map(chapter => <article className="chapter" key={chapter.n} data-reveal><div className="chapter-number">ENTRY<br/>{chapter.n}</div><div><p className="pencil">{chapter.note}</p><h2>{chapter.title}</h2><p>{chapter.body}</p></div>{chapter.art}</article>)}</section><section className="scope-note" data-reveal><div><p>THE EDGE OF THE MAP</p><h2>Clear limits are<br/>part of the feature.</h2></div><ul><li>History and data use cover this computer, not every device on the router.</li><li>Observed data use is not a provider bill or a hard cap.</li><li>Your router keeps broadcasting its Wi-Fi name.</li><li>Display masking does not protect other apps or make a connection anonymous.</li><li>Available measurements depend on the operating system, adapter and permissions.</li><li>A new access point can be normal on mesh or managed Wi-Fi.</li></ul></section><DownloadInvitation/></PageShell>
}

function MetricArt() { return <div className="metric-art"><p>ROUTER RESPONSE<strong>18 <small>ms</small></strong><i style={{ '--score': '72%' } as React.CSSProperties}/></p><p>INTERNET RESPONSE<strong>42 <small>ms</small></strong><i style={{ '--score': '54%' } as React.CSSProperties}/></p><p>PACKET LOSS<strong>0 <small>%</small></strong><i style={{ '--score': '100%' } as React.CSSProperties}/></p><small>SAMPLE MEASUREMENTS</small></div> }
function RedactionArt() { return <div className="redaction-art"><span>BEFORE SHARING</span><p>Studio · Workshop · Guest Room</p><span>SHARING MODE</span><p><i/><i/><i/></p><b>DISPLAY<br/>ONLY</b></div> }
function RestoreArt() { return <div className="restore-art"><div><strong>Studio</strong><i>↺</i><span>HomeFiber_5G</span></div><small>RESTORATION PATH · AVAILABLE</small></div> }

function PageHero({ number, title, copy, art }: { number: string; title: ReactNode; copy: string; art: ReactNode }) {
  return <section className="page-hero"><Contours/><div data-reveal><p>{number}</p><h1>{title}</h1><span>{copy}</span></div><div className="page-hero-art" data-reveal>{art}</div></section>
}

type Platform = 'windows' | 'macos' | 'linux' | 'android'
function DownloadsPage() {
  const detected = useMemo<Platform>(() => /Android/.test(navigator.userAgent) ? 'android' : /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'macos' : /Linux/.test(navigator.userAgent) ? 'linux' : 'windows', [])
  const [platform, setPlatform] = useState<Platform>(detected)
  return <PageShell page="downloads"><PageHero number={`SUPPLY DESK / RELEASE ${release}`} title={<>Take NetMask<br/><em>with you.</em></>} copy="Official desktop packages for Windows, macOS, and Linux—delivered directly from the GitHub release." art={<SupplyCrate/>}/><section className="download-desk"><div className="platform-tabs" role="tablist">{(['windows','macos','linux','android'] as Platform[]).map(item => <button key={item} className={platform === item ? 'active' : ''} onClick={() => setPlatform(item)}>{item}</button>)}</div><div className="package-sheet">{platform === 'windows' && <Package title="Windows 10 / 11 · x64" code="PACK 01 / WIN.X64" description="The setup file is recommended for most people. The MSI installs the same app and is useful for managed deployment." primary={[links.windows, 'Download setup .exe']} secondary={[links.msi, 'MSI package']}/>} {platform === 'macos' && <Package title="macOS 12+" code="PACK 02 / MAC.UNIVERSAL" description="Choose the build matching your Mac. Open the DMG, then drag NetMask into Applications." primary={[links.macArm, 'Apple silicon DMG']} secondary={[links.macIntel, 'Intel DMG']}/>} {platform === 'linux' && <Package title="Linux · x64 · NetworkManager" code="PACK 03 / LINUX.X64" description="Choose a Debian package for Debian, Ubuntu, Mint and related systems, or a portable AppImage." primary={[links.deb, 'Debian / Ubuntu .deb']} secondary={[links.appImage, 'Portable AppImage']}/>} {platform === 'android' && <article className="package" data-reveal><div className="pack-icon">AND</div><div><span>PLANNED PLATFORM</span><h2>Android is coming soon.</h2><p>There is no release date or promised desktop feature parity yet. Use a supported desktop package today.</p></div></article>}</div>
      <div className="verification-row"><span>VERIFY THE PACKAGE</span><a href={links.checksums}>SHA-256 checksums ↗</a><a href={links.release}>Release notes ↗</a><a href="https://github.com/billighost/netmask/blob/main/SECURITY.md">Installation & privacy ↗</a></div></section>
      <section className="install-map"><header data-reveal><p className="pencil">A short route from package to first value</p><h2>Arrive in four steps.</h2></header><ol><li data-reveal><span>01</span><div><h3>Choose the native package.</h3><p>Match your operating system and processor. Downloads come from the official GitHub release.</p></div></li><li data-reveal><span>02</span><div><h3>Inspect the source and checksum.</h3><p>Checksums detect changed or incomplete files. The project does not currently claim Windows publisher signing or macOS notarization.</p></div></li><li data-reveal><span>03</span><div><h3>Choose what NetMask records.</h3><p>Local monitoring explains retention, pause, deletion, and platform limits before you rely on the history.</p></div></li><li data-reveal><span>04</span><div><h3>Prepare, personalize, or prove.</h3><p>Use Going live, preview a network preset, or build a measured report. Original labels remain recoverable.</p></div></li></ol></section>
      <section className="system-notes"><h2>Platform field notes.</h2><details open><summary>Windows</summary><p>Edits supported Network List labels and saved Wi-Fi profile labels. Some changes require administrator approval.</p></details><details><summary>macOS</summary><p>Edits the network service label through system tools. It does not remove and recreate the Wi-Fi network.</p></details><details><summary>Linux</summary><p>Edits NetworkManager connection names and uses stable UUIDs for reconnects. NetworkManager is required.</p></details></section>
    </PageShell>
}

function SupplyCrate() { return <div className="supply-crate"><img src={logo} alt=""/><strong>NETMASK</strong><span>DESKTOP FIELD KIT</span><b>v{release}</b></div> }
function Package({ title, code, description, primary, secondary }: { title: string; code: string; description: string; primary: [string,string]; secondary: [string,string] }) { return <article className="package" data-reveal><div className="pack-icon">NM</div><div><span>{code}</span><h2>{title}</h2><p>{description}</p><a className="primary-download" href={primary[0]}>{primary[1]} ↓</a><a className="secondary-download" href={secondary[0]}>{secondary[1]}</a></div></article> }

function ProjectPage() {
  return <PageShell page="project"><PageHero number="PROJECT LEDGER / OPEN SOURCE" title={<>Built in the open.<br/><em>Kept human.</em></>} copy="The people, architecture, measurements, and design principles behind the local connection companion." art={<CreatorSeal/>}/><StatsStrip/>
    <section className="creator-section" data-reveal><div><p className="pencil">The hand behind the map</p><h2>Bello Bilal builds and maintains NetMask.</h2><p>The project began with local network labels and grew into a focused companion for understanding connection behavior, preparing what appears on screen, and keeping measured evidence close.</p><div className="project-links"><a href="https://github.com/billighost">GitHub profile ↗</a><a href="mailto:bb2010ng@gmail.com">Email Bello ↗</a></div></div><div className="creator-card"><img src={logo} alt=""/><span>CREATOR / MAINTAINER</span><strong>Bello Bilal</strong><small>@billighost · Lagos, Nigeria</small></div></section>
    <section className="principles"><header data-reveal><p>DESIGN VALUES / THE COMPASS</p><h2>What points the work north.</h2></header><div><article data-reveal><span>01</span><h3>Measured over imagined.</h3><p>Show missing samples, coverage, and unavailable fields instead of smoothing gaps into certainty.</p></article><article data-reveal><span>02</span><h3>Reversible by design.</h3><p>Preview presets, record originals, verify results, preserve partial failures, and keep undo visible.</p></article><article data-reveal><span>03</span><h3>Local and bounded.</h3><p>Keep monitoring data on this device, cap retention, and give people pause and deletion controls.</p></article><article data-reveal><span>04</span><h3>Private without theatre.</h3><p>Control supported details honestly without claiming anonymity, billing accuracy, or protection outside the app.</p></article></div></section>
    <section className="architecture-plate" data-reveal><div><p className="pencil">Under the paper</p><h2>One desktop runtime,<br/>two careful layers.</h2><p>React and TypeScript render Fieldnotes when the window is open. Rust engines own bounded local history, usage accounting, background checks, recovery, and operating-system integration.</p><a href="https://github.com/billighost/netmask/blob/main/docs/ARCHITECTURE.md">Read the architecture notes →</a></div><svg viewBox="0 0 700 400" aria-label="Simplified NetMask architecture"><g><rect x="45" y="70" width="175" height="90"/><text x="132" y="108">FIELDNOTES</text><text x="132" y="132">React + TypeScript</text></g><path d="M220 115h85"/><g><rect x="305" y="70" width="175" height="90"/><text x="392" y="108">TAURI BRIDGE</text><text x="392" y="132">typed commands</text></g><path d="M480 115h85"/><g><rect x="565" y="70" width="100" height="90"/><text x="615" y="108">RUST</text><text x="615" y="132">engines</text></g><path d="M615 160v100M615 260H135M135 260v65"/><g><rect x="45" y="325" width="180" height="55"/><text x="135" y="358">WINDOWS · MAC · LINUX</text></g></svg></section>
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
  usePageEffects(page)
  useEffect(() => {
    const seo: Record<Page, { title: string; description: string; path: string }> = {
      home: { title: 'NetMask — Know your connection. Control what you show.', description: 'A local-first desktop companion for connection history, observed data use, call readiness, recoverable labels, and measured provider evidence.', path: '/' },
      story: { title: 'How NetMask works — Observe, prepare, personalize, and prove', description: 'See how NetMask keeps bounded local connection history, observed data use, Going live checks, reversible presets, honest digests, and redacted evidence reports.', path: '/story/' },
      downloads: { title: `Download NetMask v${release} for Windows, macOS, and Linux`, description: `Download NetMask v${release}, the local-first connection companion for Windows, macOS, and Linux. Official packages and SHA-256 checksums.`, path: '/downloads/' },
      project: { title: 'About the NetMask open-source project', description: 'Meet the creator and explore the local-first, measured, reversible principles behind the Tauri, Rust, React, and TypeScript desktop companion.', path: '/project/' },
      motion: { title: 'NetMask motion study', description: 'A private motion and interaction study for the NetMask website.', path: '/motion-preview/' }
    }
    const current = seo[page]
    const canonical = `${siteUrl}${current.path}`
    document.title = current.title
    const setMeta = (selector: string, value: string) => document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', value)
    setMeta('meta[name="description"]', current.description)
    setMeta('meta[property="og:title"]', current.title)
    setMeta('meta[property="og:description"]', current.description)
    setMeta('meta[property="og:url"]', canonical)
    setMeta('meta[name="twitter:title"]', current.title)
    setMeta('meta[name="twitter:description"]', current.description)
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', canonical)
    setMeta('meta[name="robots"]', page === 'motion' ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
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
  if (page === 'motion') return <HomePage motionEnabled previewControls/>
  if (page === 'story') return <StoryPage/>
  if (page === 'downloads') return <DownloadsPage/>
  if (page === 'project') return <ProjectPage/>
  return <HomePage motionEnabled/>
}
