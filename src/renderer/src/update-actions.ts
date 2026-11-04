import { useStore } from './store'
import type { UpdateInfo } from './types'
import { errorMessage } from './network-state'

let check: Promise<UpdateInfo | null> | null = null

export async function checkAppUpdate(): Promise<UpdateInfo | null> {
  if (check) return check
  check = window.nm.checkUpdate()
  try {
    const info = await check
    useStore.setState({ updateInfo: info })
    return info
  } finally { check = null }
}

function downloaded(version: string) {
  const state = useStore.getState()
  if (state.downloadedVersion !== version) state.addToast('NetMask v' + version + ' is ready to install', 'success')
  useStore.setState({ downloadedVersion: version, updateDownloading: false, downloadProgress: null })
}

export function subscribeToUpdates(): () => void {
  let active = true
  let revision = 0
  const listeners = [
    window.nm.onUpdateAvailable(info => { revision++; useStore.setState({ updateInfo: info }) }),
    window.nm.onUpdateProgress(progress => { revision++; useStore.setState({ downloadProgress: progress, updateDownloading: true }) }),
    window.nm.onUpdateDownloaded(info => { revision++; downloaded(info.version) })
  ]
  window.nm.getUpdateStatus().then(status => {
    if (active && revision === 0) useStore.setState({ updateInfo: status.availableUpdate, downloadedVersion: status.downloadedVersion,
      downloadProgress: status.progress, updateDownloading: status.isDownloading })
  }).catch(() => {})
  const timer = setTimeout(() => { void checkAppUpdate().catch(() => {}) }, 3500)
  return () => { active = false; clearTimeout(timer); listeners.forEach(unsubscribe => unsubscribe()) }
}

export async function downloadAppUpdate(info: UpdateInfo): Promise<void> {
  if (useStore.getState().updateDownloading) return
  if (!info.downloadUrl) { await openWebPage(info.url); return }
  useStore.setState({ updateDownloading: true, downloadProgress: null, downloadedVersion: null })
  let inProgress = false
  try {
    const result = await window.nm.downloadUpdate(info.downloadUrl)
    if (!result.success) throw new Error(result.error || 'The update could not be downloaded')
    inProgress = result.inProgress === true
    if (!inProgress) {
      if (!result.filePath && !result.alreadyDownloaded) throw new Error('No verified installer was returned')
      downloaded(info.version)
    }
  } catch (error) { useStore.getState().addToast(errorMessage(error), 'error') }
  finally { if (!inProgress) useStore.setState({ updateDownloading: false, downloadProgress: null }) }
}

export async function installAppUpdate(): Promise<void> {
  try { await window.nm.installUpdate() }
  catch (error) { useStore.setState({ downloadedVersion: null }); useStore.getState().addToast(errorMessage(error, 'The installer could not open'), 'error') }
}

export async function openWebPage(url: string): Promise<void> {
  try { await window.nm.openExternal(url) }
  catch (error) { useStore.getState().addToast(errorMessage(error, 'The browser could not open'), 'error') }
}
