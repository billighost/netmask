const { nativePackages } = require('./release-assets.cjs')
const platformLabels = {
  'windows-x64': 'Windows x64',
  'macos-arm64': 'macOS Apple silicon',
  'macos-x64': 'macOS Intel',
  'linux-x64': 'Linux x64'
}

function availablePlatforms(version, assets) {
  const packages = nativePackages(version)
  const available = Object.keys(packages).filter(platform => packages[platform].every(name => assets.some(asset => asset.name === name && asset.size > 0)))
  return available
}

function releaseNotes(notes, version, available) {
  const names = new Set(available.flatMap(platform => nativePackages(version)[platform]))
  const pending = Object.keys(platformLabels).filter(platform => !available.includes(platform))
  const availability = `Available installers: **${available.map(platform => platformLabels[platform]).join(', ')}**.` +
    (pending.length ? `\n\nTemporarily unavailable: **${pending.map(platform => platformLabels[platform]).join(', ')}**. GitHub could not allocate those build runners. This release currently supplies installers only for the available platforms. Missing platforms are retried automatically up to three workflow attempts and can be added later after successful verification; the source tag stays unchanged.` : '\n\nAll four platform builds are available.')
  const filtered = notes.split(/\r?\n/).filter(line => {
    if (!line.startsWith('|')) return true
    const downloads = [...line.matchAll(/\/releases\/download\/v[^/]+\/([^\s)]+)/g)].map(match => match[1])
    return downloads.every(name => names.has(name))
  }).join('\n')
  return filtered.replace('## Downloads', `## Downloads\n\n${availability}`)
}

module.exports = { platformLabels, availablePlatforms, releaseNotes }
