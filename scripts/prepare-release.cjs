const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { api, reportError } = require('./github-release.cjs')
const { nativePackages, verifyNativePackages } = require('./release-assets.cjs')
const { runJobs, platformStatus, platformRunners } = require('./workflow-status.cjs')
const { availablePlatforms, releaseNotes } = require('./release-notes.cjs')

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
async function main() {
  const [directory, notesFile, version] = process.argv.slice(2)
  const packages = nativePackages(version)
  if (!directory || !notesFile || process.env.RELEASE_TAG !== `v${version}`) throw new Error('Release directory, notes, and matching tag/version are required')
  const selected = process.env.RELEASE_PLATFORM && process.env.RELEASE_PLATFORM !== 'all' ? [process.env.RELEASE_PLATFORM] : Object.keys(platformRunners)
  const jobs = await runJobs(process.env.GITHUB_RUN_ID)
  const verify = jobs.filter(job => job.name === 'Verify release source')
  if (verify.length !== 1 || verify[0].conclusion !== 'success') throw new Error('Release source verification must succeed')
  const status = platformStatus(jobs, selected)
  fs.mkdirSync(directory, { recursive: true })
  const files = () => fs.readdirSync(directory).filter(name => !['checksums.txt', 'availability.json'].includes(name)).map(name => {
    const info = fs.lstatSync(path.join(directory, name))
    if (!info.isFile()) throw new Error('Release assets must be regular files')
    return { name, size: info.size }
  })
  verifyNativePackages(version, files(), status.available)
  let previous
  try { previous = await api('GET', `/releases/tags/v${version}`) }
  catch (error) { if (!/^GitHub 404:/.test(error.message)) throw error }
  if (previous) {
    const existing = previous.assets.filter(asset => !['checksums.txt', 'availability.json'].includes(asset.name))
    verifyNativePackages(version, existing, availablePlatforms(version, existing))
    for (const asset of existing) {
      if (fs.existsSync(path.join(directory, asset.name))) continue
      if (asset.state !== 'uploaded' || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error(`Existing asset has no verified digest: ${asset.name}`)
      const url = new URL(asset.browser_download_url)
      if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/billighost/netmask/releases/download/v${version}/`)) throw new Error('Unexpected existing asset URL')
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
      if (!response.ok) throw new Error(`Existing package download failed: ${asset.name}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length !== asset.size || `sha256:${sha256(bytes)}` !== asset.digest) throw new Error(`Existing package failed verification: ${asset.name}`)
      fs.writeFileSync(path.join(directory, asset.name), bytes)
    }
  }
  const assets = files()
  const available = availablePlatforms(version, assets)
  verifyNativePackages(version, assets, available)
  const unavailable = Object.keys(packages).filter(platform => !available.includes(platform))
  const checksums = assets.sort((a, b) => a.name.localeCompare(b.name)).map(asset => `${sha256(fs.readFileSync(path.join(directory, asset.name)))}  ${asset.name}`).join('\n') + '\n'
  fs.writeFileSync(path.join(directory, 'checksums.txt'), checksums)
  fs.writeFileSync(path.join(directory, 'availability.json'), JSON.stringify({ tag: `v${version}`, runId: process.env.GITHUB_RUN_ID, available, unavailable, assets: assets.map(asset => asset.name) }, null, 2) + '\n')
  fs.writeFileSync('release-notes.md', releaseNotes(fs.readFileSync(notesFile, 'utf8'), version, available))
  console.log(JSON.stringify({ available, unavailable, packages: assets.length }))
}
main().catch(reportError)
