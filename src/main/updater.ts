import { app, shell, BrowserWindow } from 'electron'
import https from 'https'
import http from 'http'
import { URL } from 'url'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'

export interface UpdateInfo {
  version: string
  currentVersion: string
  name: string
  notes: string
  url: string
  downloadUrl?: string
  assetName?: string
  assetSize?: number
}

export interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

let updateCheckTimer: NodeJS.Timeout | null = null
let windowGetter: (() => BrowserWindow | null) | null = null
let lastUpdateInfo: UpdateInfo | null = null
let downloadedFilePath: string | null = null
let isDownloading = false
let currentProgress: DownloadProgress | null = null
let lastTrayCheckTime = 0

function compareSemver(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').trim().split('-')[0].split('.').map(Number)
  const p1 = clean(v1)
  const p2 = clean(v2)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return 1
    if (num1 < num2) return -1
  }
  return 0
}

export function checkGitHubRelease(win?: BrowserWindow | null): Promise<UpdateInfo | null> {
  return new Promise((resolve, reject) => {
    const currentVersion = app.getVersion()
    const options = {
      hostname: 'api.github.com',
      path: '/repos/billighost/netmask/releases/latest',
      headers: {
        'User-Agent': `NetMask/${currentVersion} (Electron; Windows/macOS/Linux)`
      },
      timeout: 8000
    }

    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode === 404) {
            // No releases found on repository
            resolve(null)
            return
          }
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub API returned HTTP ${res.statusCode}`))
            return
          }
          const release = JSON.parse(data)
          const latestTag = release.tag_name || release.name || ''
          const latestVersion = latestTag.replace(/^v/i, '').trim()

          if (compareSemver(latestVersion, currentVersion) > 0) {
            // Find appropriate download asset for current platform
            let downloadUrl = release.html_url
            let assetName: string | undefined
            let assetSize: number | undefined

            if (Array.isArray(release.assets)) {
              let ext = '.exe'
              if (process.platform === 'darwin') ext = '.dmg'
              if (process.platform === 'linux') ext = '.AppImage'

              // For Windows, prefer the NSIS setup installer over portable or zip
              let asset = null
              if (process.platform === 'win32') {
                asset = release.assets.find((a: any) => {
                  const n = (a.name || '').toLowerCase()
                  return n.includes('setup') && n.endsWith('.exe')
                })
              }
              if (!asset) {
                asset = release.assets.find((a: any) => (a.name || '').toLowerCase().endsWith(ext))
              }
              if (asset && asset.browser_download_url) {
                downloadUrl = asset.browser_download_url
                assetName = asset.name
                assetSize = asset.size
              }
            }

            const info: UpdateInfo = {
              version: latestVersion,
              currentVersion,
              name: release.name || `NetMask v${latestVersion}`,
              notes: release.body || 'A new version of NetMask is available.',
              url: release.html_url,
              downloadUrl,
              assetName,
              assetSize
            }

            lastUpdateInfo = info

            const targetWin = win || (windowGetter ? windowGetter() : null)
            if (targetWin && !targetWin.isDestroyed()) {
              if (targetWin.webContents.isLoading()) {
                targetWin.webContents.once('did-finish-load', () => {
                  if (!targetWin.isDestroyed()) {
                    targetWin.webContents.send('nm:update-available', info)
                  }
                })
              } else {
                targetWin.webContents.send('nm:update-available', info)
              }
            }
            resolve(info)
            return
          }
          resolve(null)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Update check request timed out'))
    })
  })
}

export function checkOnRestoreFromTray(win?: BrowserWindow | null): void {
  const now = Date.now()
  // Debounce cooldown: at most once every 30 seconds
  if (now - lastTrayCheckTime < 30000) return
  lastTrayCheckTime = now
  const targetWin = win || (windowGetter ? windowGetter() : null)
  checkGitHubRelease(targetWin).catch(() => {})
}

function downloadStream(
  urlStr: string,
  destPath: string,
  onProgress: (p: DownloadProgress) => void,
  maxRedirects = 10
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects while downloading update'))
      return
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(urlStr)
    } catch (e) {
      reject(e)
      return
    }

    const client = parsedUrl.protocol === 'http:' ? http : https

    const req = client.get(urlStr, {
      headers: {
        'User-Agent': `NetMask/${app.getVersion()} (Electron; Windows/macOS/Linux)`
      }
    }, (res) => {
      // Follow HTTP redirects (301, 302, 303, 307, 308)
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).toString()
        res.resume()
        downloadStream(redirectUrl, destPath, onProgress, maxRedirects - 1)
          .then(resolve)
          .catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`Update server returned status ${res.statusCode}`))
        return
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let transferred = 0
      let lastTime = Date.now()
      let lastTransferred = 0
      let bytesPerSecond = 0

      const fileStream = createWriteStream(destPath)

      res.on('data', (chunk) => {
        transferred += chunk.length
        const now = Date.now()
        const elapsed = (now - lastTime) / 1000
        if (elapsed >= 0.4) {
          bytesPerSecond = Math.round((transferred - lastTransferred) / elapsed)
          lastTime = now
          lastTransferred = transferred
          const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0
          onProgress({ percent, transferred, total, bytesPerSecond })
        }
      })

      res.pipe(fileStream)

      fileStream.on('finish', () => {
        fileStream.close(() => {
          onProgress({ percent: 100, transferred, total: total || transferred, bytesPerSecond: 0 })
          resolve(destPath)
        })
      })

      fileStream.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        reject(err)
      })

      res.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        reject(err)
      })
    })

    req.on('error', (err) => {
      try { unlinkSync(destPath) } catch {}
      reject(err)
    })

    req.setTimeout(30000, () => {
      req.destroy(new Error('Update download request timed out'))
    })
  })
}

export function isUpdateDownloading(): boolean {
  return isDownloading
}

export function getDownloadedVersion(): string | null {
  if (downloadedFilePath && existsSync(downloadedFilePath)) {
    return lastUpdateInfo?.version || null
  }
  return null
}

export function getUpdateStatus(): {
  isDownloading: boolean
  progress: DownloadProgress | null
  downloadedVersion: string | null
  downloadedFilePath: string | null
  availableUpdate: UpdateInfo | null
} {
  const isDownloaded = Boolean(downloadedFilePath && existsSync(downloadedFilePath))
  return {
    isDownloading,
    progress: currentProgress,
    downloadedVersion: isDownloaded ? (lastUpdateInfo?.version || null) : null,
    downloadedFilePath: isDownloaded ? downloadedFilePath : null,
    availableUpdate: lastUpdateInfo
  }
}

export function syncWindowUpdateState(win: BrowserWindow): void {
  if (!win || win.isDestroyed()) return

  if (lastUpdateInfo) {
    win.webContents.send('nm:update-available', lastUpdateInfo)
  }

  if (downloadedFilePath && existsSync(downloadedFilePath)) {
    win.webContents.send('nm:update-downloaded', {
      filePath: downloadedFilePath,
      version: lastUpdateInfo?.version || app.getVersion()
    })
  } else if (isDownloading && currentProgress) {
    win.webContents.send('nm:update-progress', currentProgress)
  }
}

export async function downloadUpdate(url?: string): Promise<{
  success: boolean
  filePath?: string
  error?: string
  inProgress?: boolean
  alreadyDownloaded?: boolean
}> {
  // If update is already downloaded and ready to install on disk
  if (downloadedFilePath && existsSync(downloadedFilePath)) {
    const win = windowGetter ? windowGetter() : null
    if (win && !win.isDestroyed()) {
      win.webContents.send('nm:update-downloaded', {
        filePath: downloadedFilePath,
        version: lastUpdateInfo?.version || app.getVersion()
      })
    }
    return {
      success: true,
      filePath: downloadedFilePath,
      alreadyDownloaded: true
    }
  }

  // If an update is already actively streaming in background
  if (isDownloading) {
    const win = windowGetter ? windowGetter() : null
    if (win && !win.isDestroyed() && currentProgress) {
      win.webContents.send('nm:update-progress', currentProgress)
    }
    return { success: true, inProgress: true }
  }

  const targetUrl = url || lastUpdateInfo?.downloadUrl
  if (!targetUrl) {
    return { success: false, error: 'No update download URL found' }
  }

  isDownloading = true
  currentProgress = { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
  const version = lastUpdateInfo?.version || 'latest'
  const ext = process.platform === 'darwin' ? '.dmg' : process.platform === 'linux' ? '.AppImage' : '.exe'
  const filename = lastUpdateInfo?.assetName || `NetMask-Setup-${version}${ext}`
  const destPath = join(app.getPath('temp'), filename)

  try {
    const downloadedPath = await downloadStream(targetUrl, destPath, (p) => {
      currentProgress = p
      const win = windowGetter ? windowGetter() : null
      if (win && !win.isDestroyed()) {
        win.webContents.send('nm:update-progress', p)
      }
    })

    downloadedFilePath = downloadedPath
    isDownloading = false
    currentProgress = null

    const win = windowGetter ? windowGetter() : null
    if (win && !win.isDestroyed()) {
      win.webContents.send('nm:update-downloaded', {
        filePath: downloadedPath,
        version
      })
    }

    return { success: true, filePath: downloadedPath }
  } catch (err: any) {
    isDownloading = false
    currentProgress = null
    return { success: false, error: err?.message || 'Download failed' }
  }
}

export function installDownloadedUpdate(filePath?: string): void {
  const target = filePath || downloadedFilePath
  if (!target || !existsSync(target)) {
    throw new Error('Update file not found on disk')
  }

  if (process.platform === 'win32') {
    // Launch NSIS installer detached and unref so it executes after NetMask quits
    const child = spawn(target, [], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    setTimeout(() => {
      app.quit()
    }, 400)
  } else if (process.platform === 'darwin') {
    shell.openPath(target)
    setTimeout(() => {
      app.quit()
    }, 500)
  } else {
    // Linux AppImage / binary
    const child = spawn(target, [], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    setTimeout(() => {
      app.quit()
    }, 400)
  }
}

export function setupAutoUpdater(target: BrowserWindow | null | (() => BrowserWindow | null)): void {
  if (typeof target === 'function') {
    windowGetter = target
  } else {
    windowGetter = () => target
  }

  // Configure electron-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    const win = windowGetter ? windowGetter() : null
    const updateInfo: UpdateInfo = {
      version: info.version,
      currentVersion: app.getVersion(),
      name: `NetMask v${info.version}`,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : 'Performance improvements and bug fixes.',
      url: `https://github.com/billighost/netmask/releases/tag/v${info.version}`
    }
    lastUpdateInfo = updateInfo
    if (win && !win.isDestroyed()) {
      win.webContents.send('nm:update-available', updateInfo)
    }
  })

  // Initial check after 4 seconds
  setTimeout(() => {
    const win = windowGetter ? windowGetter() : null
    checkGitHubRelease(win)
    if (app.isPackaged) {
      try { autoUpdater.checkForUpdates().catch(() => {}) } catch {}
    }
  }, 4000)

  // Periodic check every 4 hours
  if (updateCheckTimer) clearInterval(updateCheckTimer)
  updateCheckTimer = setInterval(() => {
    const win = windowGetter ? windowGetter() : null
    checkGitHubRelease(win)
    if (app.isPackaged) {
      try { autoUpdater.checkForUpdates().catch(() => {}) } catch {}
    }
  }, 4 * 60 * 60 * 1000)
}

export function openReleaseUrl(url?: string): void {
  const target = url || 'https://github.com/billighost/netmask/releases/latest'
  shell.openExternal(target)
}
