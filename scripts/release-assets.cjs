// A size threshold cannot distinguish Electron from a native AppImage.
function releaseAssetPlan(tag, assets) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('A stable version tag is required')
  const version = tag.slice(1)
  const legacy = new Set([
    `NetMask-Setup-${version}.exe`,
    `NetMask-Windows-${version}-x64.exe`, `NetMask-Windows-${version}-x64.zip`,
    ...['arm64', 'x64'].flatMap(arch => [`NetMask-macOS-${version}-${arch}.dmg`, `NetMask-macOS-${version}-${arch}.zip`]),
    `NetMask-Linux-${version}-amd64.deb`, `NetMask-Linux-${version}-x64.tar.gz`, `NetMask-Linux-${version}-x86_64.AppImage`,
    'latest.yml', 'latest-mac.yml', 'latest-linux.yml', 'control.tar.gz', 'data.tar.gz', 'netmask.exe'
  ])
  const removable = assets.filter(asset => legacy.has(asset.name) || (asset.name.endsWith('.blockmap') && legacy.has(asset.name.slice(0, -9))))
  const required = [`NetMask_${version}_x64-setup.exe`, `NetMask_${version}_x64_en-US.msi`, `NetMask_${version}_aarch64.dmg`, `NetMask_${version}_amd64.deb`, `NetMask_${version}_amd64.AppImage`]
  if (!required.every(name => assets.some(asset => asset.name === name && asset.state === 'uploaded' && asset.size > 0))) {
    throw new Error('All five published native packages must be present before compatibility assets can be removed')
  }
  return { tag, keep: assets.filter(asset => !removable.includes(asset)), remove: removable }
}
function nativePackages(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('A stable version is required')
  return {
    'windows-x64': [`NetMask_${version}_x64-setup.exe`, `NetMask_${version}_x64_en-US.msi`],
    'macos-arm64': [`NetMask_${version}_aarch64.dmg`],
    'macos-x64': [`NetMask_${version}_x64.dmg`],
    'linux-x64': [`NetMask_${version}_amd64.deb`, `NetMask_${version}_amd64.AppImage`]
  }
}
function verifyNativePackages(version, assets) {
  const required = Object.values(nativePackages(version)).flat()
  if (assets.length !== required.length || !required.every(name => assets.filter(asset => asset.name === name && asset.size > 0).length === 1)) {
    throw new Error('Release must contain exactly six complete native packages for Windows, both Macs, and Linux')
  }
  return required
}
module.exports = { releaseAssetPlan, nativePackages, verifyNativePackages }
