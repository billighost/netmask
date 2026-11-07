const { chromium } = require('playwright')

const origin = process.argv[2] || 'http://127.0.0.1:4174'
const expectedVersion = '2.7.0'
const routes = [
  ['/', false],
  ['/story/', false],
  ['/downloads/', false],
  ['/project/', false],
  ['/motion-preview/', true]
]

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))

  for (const [path, noindex] of routes) {
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
    const metadata = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content,
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      openGraphImage: document.querySelector('meta[property="og:image"]')?.content,
      robots: document.querySelector('meta[name="robots"]')?.content,
      staleVersion: document.body.innerText.includes('2.4.1')
    }))
    if (!metadata.title || !metadata.description || !metadata.canonical || metadata.staleVersion) {
      throw new Error(`Invalid metadata or stale version on ${path}: ${JSON.stringify(metadata)}`)
    }
    if (noindex !== metadata.robots?.includes('noindex')) {
      throw new Error(`Unexpected robots policy on ${path}: ${metadata.robots}`)
    }
    if (!noindex && !metadata.openGraphImage?.endsWith(`/og/netmask-v${expectedVersion}.png`)) {
      throw new Error(`Missing social image on ${path}: ${metadata.openGraphImage}`)
    }
    console.log(`${path} ${metadata.title}`)
  }

  await page.goto(`${origin}/downloads/`, { waitUntil: 'networkidle' })
  const releaseLinks = await page.locator('a[href*="releases/download"]').evaluateAll(nodes => nodes.map(node => node.href))
  if (!releaseLinks.length || releaseLinks.some(href => !href.includes(`/v${expectedVersion}/`))) {
    throw new Error(`Download URLs are not v${expectedVersion}: ${releaseLinks.join(', ')}`)
  }

  const ogResponse = await page.request.get(`${origin}/og/netmask-v${expectedVersion}.png`)
  const ogBytes = await ogResponse.body()
  if (!ogResponse.ok() || ogResponse.headers()['content-type'] !== 'image/png' || ogBytes.length < 10_000) {
    throw new Error(`Invalid social image response: ${ogResponse.status()} ${ogBytes.length} bytes`)
  }
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`)

  console.log(`Verified ${releaseLinks.length} release links and ${ogBytes.length}-byte social image.`)
  await browser.close()
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
