// Synthetic renderer workload; never invokes the real native backend.
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
const crypto = require('node:crypto')
const { chromium } = require('playwright')
const { nativeFixture } = require('./verify-ui.cjs')
const root = path.resolve(__dirname, '..')
const directories = { current: path.join(root, 'dist') }
if (process.argv[2]) directories.baseline = path.resolve(root, process.argv[2])
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' }
const server = http.createServer((request, response) => {
  try {
    const [variant, ...parts] = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1).split('/')
    const directory = directories[variant]
    if (!directory) { response.writeHead(404).end(); return }
    const file = path.resolve(directory, parts.join('/'))
    if (!file.startsWith(directory + path.sep) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return }
    let body = fs.readFileSync(file)
    if (path.extname(file) === '.html') body = body.toString().replaceAll('"/assets/', '"/' + variant + '/assets/')
    response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
    response.end(body)
  } catch { response.writeHead(404).end() }
})
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))]
async function measure(browser, variant, port) {
  const page = await browser.newPage({ viewport: { width: 440, height: 700 }, reducedMotion: 'reduce' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript({ content: `(${nativeFixture.toString()})(${JSON.stringify({ version: require('../package.json').version })});
    for (let index = 2; index < 1000; index++) window.__NM_FIXTURE__.networks.push({ guid: 'stress-' + index, name: 'Saved network ' + index, originalName: 'Original ' + index, renamed: true, live: false, type: 'wifi', profile: 'Profile ' + index, canRename: true });` })
  await page.goto(`http://127.0.0.1:${port}/${variant}/index.html`)
  await page.locator('[data-network-guid]').first().waitFor()
  await page.locator('[role="list"]').evaluate(element => { element.style.maxHeight = '300px'; element.style.overflowY = 'auto' })
  const session = await page.context().newCDPSession(page)
  await session.send('Performance.enable')
  const before = await session.send('Performance.getMetrics')
  const frames = await page.evaluate(() => new Promise(resolve => {
    const main = document.getElementById('main-content'), list = document.querySelector('[role="list"]'), fixture = window.__NM_FIXTURE__
    const frames = [], start = performance.now()
    let previous = start, lastWork = start
    function frame(now) {
      frames.push(now - previous); previous = now
      main.scrollTop = (Math.sin((now - start) / 650) + 1) / 2 * (main.scrollHeight - main.clientHeight)
      list.scrollTop = (Math.sin((now - start) / 650) + 1) / 2 * (list.scrollHeight - list.clientHeight)
      if (now - lastWork >= 250) {
        fixture.emit('nm:speed', { downMBps: 10, upMBps: 1, downKbps: 10000, upKbps: 1000 })
        fixture.emit('nm:ping-telemetry', { gatewayMs: 5, internetMs: 15, jitterMs: 1 })
        document.querySelector('button[aria-label="Refresh saved networks"]').click()
        lastWork = now
      }
      if (now - start < 4000) requestAnimationFrame(frame)
      else resolve(frames.slice(1))
    }
    requestAnimationFrame(frame)
  }))
  const after = await session.send('Performance.getMetrics')
  const value = (metrics, name) => metrics.metrics.find(metric => metric.name === name)?.value || 0
  const result = { variant, frames: frames.length, frameP50Ms: percentile(frames, .5), frameP95Ms: percentile(frames, .95),
    framesOver50Ms: frames.filter(frame => frame > 50).length, scriptMs: (value(after, 'ScriptDuration') - value(before, 'ScriptDuration')) * 1000,
    layoutMs: (value(after, 'LayoutDuration') - value(before, 'LayoutDuration')) * 1000 }
  await page.close()
  if (errors.length) throw Error(errors.join('\n'))
  return result
}
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    browser = await chromium.launch({ executablePath: process.env.NETMASK_BROWSER || (fs.existsSync(edge) ? edge : undefined), headless: true })
    const runs = []
    for (let round = 0; round < 3; round++) for (const variant of Object.keys(directories)) runs.push(await measure(browser, variant, server.address().port))
    const summaries = Object.keys(directories).map(variant => {
      const samples = runs.filter(run => run.variant === variant)
      return { variant, frameP95Ms: percentile(samples.map(run => run.frameP95Ms), .5),
        scriptMs: percentile(samples.map(run => run.scriptMs), .5), layoutMs: percentile(samples.map(run => run.layoutMs), .5),
        framesOver50Ms: percentile(samples.map(run => run.framesOver50Ms), .5) }
    })
    const report = { workload: '1000 saved networks, identical 300px list viewport, continuous scrolling, transfer/ping events and unchanged refreshes every 250 ms; three 4-second runs per build',
      browser: browser.version(), node: process.version, os: os.type() + ' ' + os.release(), cpu: os.cpus()[0]?.model,
      buildAssets: Object.fromEntries(Object.entries(directories).map(([variant, directory]) => [variant,
        fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(js|css)$/.test(file)).sort().map(file => ({ file,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, 'assets', file))).digest('hex') }))])),
      boundary: 'Headless browser with fictional IPC, not a native app RAM/battery benchmark. Timings vary with machine load.', summaries, runs }
    const output = path.join(root, '.tmp/ui-checks/benchmark.json')
    fs.writeFileSync(output, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { if (browser) await browser.close(); server.close() }
}
main().catch(error => { console.error(error.stack); server.close(); process.exitCode = 1 })
