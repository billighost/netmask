import { useStore } from './store'
import type { UpdateInfo } from './types'
import { errorMessage } from './network-state'

let check: Promise<UpdateInfo | null> | null = null
let lastAutomaticCheck = 0
const VISIBILITY_RECHECK_MS = 15 * 60 * 1000
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000
const RETRY_DELAYS_MS = [15_000, 60_000]

export async function checkAppUpdate(): Promise<UpdateInfo | null> {
  if (check) return check
  check = window.nm.checkUpdate()
  try {
    const info = await check
    useStore.setState({ updateInfo: info, updateLastCheckedAt: Date.now(), updateError: null })
    return info
  } catch (error) {
    useStore.setState({ updateLastCheckedAt: Date.now(), updateError: errorMessage(error, 'The update check could not finish') })
    throw error
  } finally { check = null }
}

export function requestAutomaticUpdateCheck(force = false): Promise<UpdateInfo | null> {
  const now = Date.now()
  if (!force && lastAutomaticCheck && now - lastAutomaticCheck < VISIBILITY_RECHECK_MS) {
    return Promise.resolve(useStore.getState().updateInfo)
  }
  lastAutomaticCheck = now
  return checkAppUpdate()
}

function downloaded(version: string) {
  const state = useStore.getState()
  if (state.downloadedVersion !== version) state.addToast('NetMask v' + version + ' is ready to install', 'success')
  useStore.setState({ downloadedVersion: version, updateDownloading: false, downloadProgress: null })
}

export function subscribeToUpdates(): () => void {
  let active = true
  let eventRevision = 0
  let checkStarted = false
  const retryTimers: ReturnType<typeof setTimeout>[] = []
  const listeners = [
    window.nm.onUpdateAvailable(info => { eventRevision++; useStore.setState({ updateInfo: info }) }),
    window.nm.onUpdateProgress(progress => { eventRevision++; useStore.setState({ downloadProgress: progress, updateDownloading: true }) }),
    window.nm.onUpdateDownloaded(info => { eventRevision++; downloaded(info.version) })
  ]
  window.nm.getUpdateStatus().then(status => {
    if (!active) return
    if (eventRevision === 0) useStore.setState({
      ...(!checkStarted ? { updateInfo: status.availableUpdate } : {}),
      downloadedVersion: status.downloadedVersion, downloadProgress: status.progress,
      updateDownloading: status.isDownloading
    })
  }).catch(() => {})
  const automaticCheck = (retryIndex = 0) => {
    if (!active) return
    checkStarted = true
    void requestAutomaticUpdateCheck(true).catch(() => {
      if (!active || retryIndex >= RETRY_DELAYS_MS.length) return
      const retry = setTimeout(() => automaticCheck(retryIndex + 1), RETRY_DELAYS_MS[retryIndex])
      ;(retry as unknown as { unref?: () => void }).unref?.()
      retryTimers.push(retry)
    })
  }
  automaticCheck()
  const periodic = setInterval(() => automaticCheck(), PERIODIC_CHECK_MS)
  ;(periodic as unknown as { unref?: () => void }).unref?.()
  return () => {
    active = false
    clearInterval(periodic)
    retryTimers.forEach(clearTimeout)
    listeners.forEach(unsubscribe => unsubscribe())
  }
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
