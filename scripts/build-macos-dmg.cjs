const { spawnSync } = require('node:child_process')

const maxAttempts = 3

function busyTemporaryDisk(output) {
  const mounted = output.match(/Searching for mounted interstitial disk image using \/dev\/(disk\d+)s/)
  const busy = output.match(/hdiutil: couldn't eject "(disk\d+)" - Resource busy/)
  return mounted?.[1] && mounted[1] === busy?.[1] ? mounted[1] : undefined
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function runBuild() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['run', 'tauri', '--', 'build', '--bundles', 'dmg'], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  return { status: result.status ?? 1, output: `${result.stdout || ''}\n${result.stderr || ''}` }
}

function forceDetach(device) {
  const result = spawnSync('hdiutil', ['detach', '-force', `/dev/${device}`], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
}

function buildMacDmg({
  platform = process.platform,
  build = runBuild,
  detach = forceDetach,
  wait = pause,
  report = message => process.stderr.write(`${message}\n`)
} = {}) {
  let result
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    result = build()
    if (result.status === 0) return result
    const device = busyTemporaryDisk(result.output || '')
    if (platform !== 'darwin' || !device || attempt === maxAttempts) return result
    report(`The temporary macOS DMG device /dev/${device} is busy; forcing its detachment before retry ${attempt + 1} of ${maxAttempts}.`)
    wait(3000)
    detach(device)
    wait(2000)
  }
  return result
}

module.exports = { busyTemporaryDisk, buildMacDmg }

if (require.main === module) {
  const result = buildMacDmg()
  if (result.status !== 0) process.exitCode = result.status
}
