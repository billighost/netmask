const test = require('node:test')
const assert = require('node:assert/strict')
const { releaseAssetPlan, nativePackages, verifyNativePackages } = require('./release-assets.cjs')
const { requiredChecks, verifyMergeChecks } = require('./release-checks.cjs')
const { platformRunners, runnerUnavailable, platformStatus } = require('./workflow-status.cjs')
const { availablePlatforms, releaseNotes } = require('./release-notes.cjs')
const { busyTemporaryDisk, buildMacDmg } = require('./build-macos-dmg.cjs')
const native = ['NetMask_2.2.0_x64-setup.exe', 'NetMask_2.2.0_x64_en-US.msi', 'NetMask_2.2.0_aarch64.dmg', 'NetMask_2.2.0_amd64.deb', 'NetMask_2.2.0_amd64.AppImage']
  .map((name, index) => ({ id: index + 1, name, size: name.endsWith('AppImage') ? 87468536 : 4000000, state: 'uploaded' }))
test('release cleanup retains every native package and removes only known compatibility assets', () => {
  const legacy = { id: 7, name: 'NetMask-Setup-2.2.0.exe', size: 80000000, state: 'uploaded' }
  const unknown = { id: 8, name: 'unknown-large-file.exe', size: 90000000, state: 'uploaded' }
  const plan = releaseAssetPlan('v2.2.0', [...native, legacy, { ...legacy, id: 9, name: legacy.name + '.blockmap' }, unknown])
  assert.deepEqual(plan.remove.map(asset => asset.id), [7, 9])
  assert.ok(plan.keep.some(asset => asset.name === 'NetMask_2.2.0_amd64.AppImage'))
  assert.ok(plan.keep.includes(unknown))
})
test('cleanup refuses to proceed if any native package is missing or not uploaded', () => {
  assert.throws(() => releaseAssetPlan('v2.2.0', native.slice(1)), /five published native packages/)
  assert.throws(() => releaseAssetPlan('main', native), /stable version tag/)
  assert.throws(() => releaseAssetPlan('v2.2.0', native.map(asset => ({ ...asset, state: 'new' }))), /five published native packages/)
})

test('publishing requires every architecture and rejects extra, empty, or duplicate packages', () => {
  const files = Object.values(nativePackages('2.2.1')).flat().map(name => ({ name, size: 100 }))
  assert.equal(verifyNativePackages('2.2.1', files).length, 6)
  assert.throws(() => verifyNativePackages('2.2.1', files.slice(1)), /six complete native packages/)
  assert.throws(() => verifyNativePackages('2.2.1', [...files, { name: 'NetMask-Setup-2.2.1.exe', size: 80000000 }]), /six complete native packages/)
  assert.throws(() => verifyNativePackages('2.2.1', files.map(file => ({ ...file, size: 0 }))), /six complete native packages/)
  assert.throws(() => verifyNativePackages('2.2.1', [...files.slice(1), files[1]]), /six complete native packages/)
})

test('merge gate requires all successful checks on the reviewed PR head', () => {
  const sha = 'a'.repeat(40)
  const pr = { state: 'open', mergeable: true, head: { sha }, base: { ref: 'main' } }
  const check_runs = requiredChecks.map(name => ({ name, head_sha: sha, app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' }))
  const checks = { total_count: check_runs.length, check_runs }
  const statuses = { statuses: [] }
  assert.doesNotThrow(() => verifyMergeChecks(pr, sha, checks, statuses))
  for (const name of requiredChecks) {
    for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
      assert.throws(() => verifyMergeChecks(pr, sha, { ...checks, check_runs: check_runs.map(c => c.name === name ? { ...c, conclusion } : c) }, statuses), /Required check/)
    }
    assert.throws(() => verifyMergeChecks(pr, sha, { total_count: checks.total_count - 1, check_runs: check_runs.filter(c => c.name !== name) }, statuses), /Required check/)
  }
  assert.throws(() => verifyMergeChecks(pr, 'b'.repeat(40), checks, statuses), /PR head changed/)
  assert.throws(() => verifyMergeChecks(pr, sha, { ...checks, check_runs: check_runs.map(c => ({ ...c, head_sha: 'b'.repeat(40) })) }, statuses), /Required check/)
  assert.throws(() => verifyMergeChecks(pr, sha, { ...checks, check_runs: check_runs.map(c => ({ ...c, app: { slug: 'other-app' } })) }, statuses), /Required check/)
  assert.throws(() => verifyMergeChecks(pr, sha, { ...checks, total_count: 1000 }, statuses), /incomplete/)
  assert.throws(() => verifyMergeChecks(pr, sha, checks, { statuses: [{ state: 'pending' }] }), /commit status/)
  assert.throws(() => verifyMergeChecks({ ...pr, base: { ref: 'feature' } }, sha, checks, statuses), /target main/)
})

test('only confirmed runner-allocation cancellations permit an unavailable platform', () => {
  const jobs = Object.keys(platformRunners).map(platform => ({ name: `Build (${platform})`, status: 'completed', conclusion: 'success' }))
  const unavailable = { ...jobs[1], conclusion: 'cancelled', runner_name: '', steps: [], annotations: [{ message: 'The job was not acquired by Runner of type hosted even after multiple attempts' }] }
  assert.equal(runnerUnavailable(unavailable), true)
  assert.deepEqual(platformStatus(jobs.map((job, index) => index === 1 ? unavailable : job)), {
    available: ['windows-x64', 'macos-x64', 'linux-x64'], unavailable: ['macos-arm64']
  })
  for (const change of [{ annotations: [] }, { runner_name: 'runner-1' }, { steps: [{ name: 'Run npm test' }] }, { conclusion: 'failure' }, { status: 'queued' }]) {
    const invalid = { ...unavailable, ...change }
    assert.equal(runnerUnavailable(invalid), false)
    assert.throws(() => platformStatus(jobs.map((job, index) => index === 1 ? invalid : job)), /did not succeed/)
  }
  assert.throws(() => platformStatus(jobs.slice(1)), /Missing/)
  assert.throws(() => platformStatus(jobs.map(job => ({ ...unavailable, name: job.name }))), /At least one platform/)
})

test('macOS DMG packaging retries only the exact temporary disk ejection failure', () => {
  const busy = 'Searching for mounted interstitial disk image using /dev/disk2s...\nhdiutil: couldn\'t eject "disk2" - Resource busy'
  assert.equal(busyTemporaryDisk(busy), 'disk2')
  assert.equal(busyTemporaryDisk(busy.replace('"disk2"', '"disk3"')), undefined)
  assert.equal(busyTemporaryDisk('failed to bundle project'), undefined)

  let builds = 0
  const detached = []
  const retried = buildMacDmg({
    platform: 'darwin',
    build: () => ++builds === 1 ? { status: 1, output: busy } : { status: 0, output: '' },
    detach: device => detached.push(device),
    wait: () => {},
    report: () => {}
  })
  assert.equal(retried.status, 0)
  assert.equal(builds, 2)
  assert.deepEqual(detached, ['disk2'])

  for (const [platform, output] of [['darwin', 'another bundle failure'], ['linux', busy]]) {
    builds = 0
    const failed = buildMacDmg({
      platform,
      build: () => { builds += 1; return { status: 1, output } },
      detach: () => assert.fail('an unrelated disk must not be detached'),
      wait: () => {},
      report: () => {}
    })
    assert.equal(failed.status, 1)
    assert.equal(builds, 1)
  }
})

test('partial publication requires complete OS package sets and removes unavailable download links', () => {
  const version = '2.3.1'
  const packages = nativePackages(version)
  const platforms = ['windows-x64', 'linux-x64']
  const files = platforms.flatMap(platform => packages[platform]).map(name => ({ name, size: 100 }))
  assert.deepEqual(availablePlatforms(version, files), platforms)
  assert.equal(verifyNativePackages(version, files, platforms).length, 4)
  assert.throws(() => verifyNativePackages(version, files.slice(1), platforms), /complete native package sets/)
  assert.throws(() => verifyNativePackages(version, [...files, { name: packages['macos-arm64'][0], size: 0 }], platforms), /complete native package sets/)
  assert.throws(() => verifyNativePackages(version, [], []), /Invalid release platform/)
  const notes = '## Downloads\n\n' + Object.entries(packages).map(([platform, names]) => `| ${platform} | ${names.map(name => `[Download](https://github.com/billighost/netmask/releases/download/v${version}/${name})`).join(' ')} |`).join('\n')
  const partial = releaseNotes(notes, version, platforms)
  assert.match(partial, /Temporarily unavailable: \*\*macOS Apple silicon, macOS Intel\*\*/)
  assert.doesNotMatch(partial, /\/NetMask_2\.3\.1_(aarch64|x64)\.dmg/)
  assert.match(partial, /\/NetMask_2\.3\.1_x64-setup\.exe/)
  const full = releaseNotes(notes, version, Object.keys(packages))
  assert.match(full, /All four platform builds are available/)
  assert.match(full, /\/NetMask_2\.3\.1_aarch64\.dmg/)
})

test('a platform retry preserves prior verified installers and regenerates complete checksums', () => {
  const fs = require('node:fs')
  const os = require('node:os')
  const path = require('node:path')
  const crypto = require('node:crypto')
  const { spawnSync } = require('node:child_process')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'netmask-release-test-'))
  try {
    const version = '2.3.1'
    const packages = nativePackages(version)
    const assetsDir = path.join(root, 'assets')
    fs.mkdirSync(assetsDir)
    for (const name of packages['linux-x64']) fs.writeFileSync(path.join(assetsDir, name), 'new Linux package')
    const bytes = Buffer.from('previous verified Windows package')
    const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
    const previous = packages['windows-x64'].map(name => ({ name, size: bytes.length, state: 'uploaded', digest, browser_download_url: `https://github.com/billighost/netmask/releases/download/v${version}/${name}` }))
    const notes = path.join(root, 'notes.md')
    fs.writeFileSync(notes, '## Downloads\n\n' + Object.entries(packages).map(([platform, names]) => `| ${platform} | ${names.map(name => `[Download](https://github.com/billighost/netmask/releases/download/v${version}/${name})`).join(' ')} |`).join('\n'))
    const fixture = path.join(root, 'fetch-fixture.cjs')
    fs.writeFileSync(fixture, `const previous = ${JSON.stringify(previous)}; global.fetch = async url => {
      const path = new URL(url).pathname;
      if (path.endsWith('/actions/runs/1/jobs')) return new Response(JSON.stringify({total_count:2,jobs:[{name:'Verify release source',status:'completed',conclusion:'success',steps:[]},{name:'Build (linux-x64)',status:'completed',conclusion:'success',steps:[]}]}));
      if (path.endsWith('/releases/tags/v2.3.1')) return new Response(JSON.stringify({assets:previous}));
      if (String(url).startsWith('https://github.com/')) return new Response(Buffer.from('previous verified Windows package'));
      throw Error('Unexpected fixture request');
    };`)
    const result = spawnSync(process.execPath, ['--require', fixture, path.join(__dirname, 'prepare-release.cjs'), assetsDir, notes, version], {
      cwd: root, encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'fixture-token', RELEASE_TAG: `v${version}`, GITHUB_RUN_ID: '1', RELEASE_PLATFORM: 'linux-x64' }
    })
    assert.equal(result.status, 0, result.stderr)
    const availability = JSON.parse(fs.readFileSync(path.join(assetsDir, 'availability.json'), 'utf8'))
    assert.deepEqual(availability.available, ['windows-x64', 'linux-x64'])
    assert.deepEqual(availability.unavailable, ['macos-arm64', 'macos-x64'])
    for (const name of packages['windows-x64']) assert.deepEqual(fs.readFileSync(path.join(assetsDir, name)), bytes)
    assert.deepEqual(fs.readdirSync(path.join(root, 'publish-assets')).sort(), [...packages['linux-x64'], 'availability.json', 'checksums.txt'].sort())
    const checksums = fs.readFileSync(path.join(assetsDir, 'checksums.txt'), 'utf8').trim().split('\n')
    assert.equal(checksums.length, 4)
    for (const line of checksums) {
      const [hash, name] = line.split('  ')
      assert.equal(hash, crypto.createHash('sha256').update(fs.readFileSync(path.join(assetsDir, name))).digest('hex'))
    }
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'release-notes.md'), 'utf8'), /\/NetMask_2\.3\.1_aarch64\.dmg/)
    fs.writeFileSync(fixture, fs.readFileSync(fixture, 'utf8').replace("Buffer.from('previous verified Windows package')", "Buffer.from('tampered package')"))
    for (const name of packages['windows-x64']) fs.unlinkSync(path.join(assetsDir, name))
    const invalid = spawnSync(process.execPath, ['--require', fixture, path.join(__dirname, 'prepare-release.cjs'), assetsDir, notes, version], {
      cwd: root, encoding: 'utf8', env: { ...process.env, GH_TOKEN: 'fixture-token', RELEASE_TAG: `v${version}`, GITHUB_RUN_ID: '1', RELEASE_PLATFORM: 'linux-x64' }
    })
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /failed verification/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
