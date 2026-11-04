const test = require('node:test')
const assert = require('node:assert/strict')
const { releaseAssetPlan, nativePackages, verifyNativePackages } = require('./release-assets.cjs')
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
