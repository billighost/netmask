const { chromium } = require('playwright')

const target = process.argv[2] || 'http://127.0.0.1:4174/og-card.html'
const output = process.argv[3] || 'website/public/og/netmask-v2.6.0.png'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.goto(target, { waitUntil: 'networkidle' })
  await page.screenshot({ path: output, type: 'png' })
  await browser.close()
  console.log(`Rendered ${output}`)
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
