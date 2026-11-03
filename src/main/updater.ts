import { app, shell, BrowserWindow } from 'electron'
import https from 'https'
import { autoUpdater } from 'electron-updater'

export interface UpdateInfo {
  version: string
  currentVersion: string
  name: string
  notes: string
  url: string
  downloadUrl?: string
}

let updateCheckTimer: NodeJS.Timeout | null = null

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
  return new Promise((resolve) => {
    const currentVersion = app.getVersion()
    const options = {
      hostname: 'api.github.com',
      path: '/repos/billighost/netmask/releases/latest',
      headers: {
        'User-Agent': `NetMask/${currentVersion} (Electron; Windows/macOS/Linux)`
      },
      timeout: 6000
    }

    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve(null)
            return
          }
          const release = JSON.parse(data)
          const latestTag = release.tag_name || release.name || ''
          const latestVersion = latestTag.replace(/^v/i, '').trim()

          if (compareSemver(latestVersion, currentVersion) > 0) {
            // Find appropriate download asset for current platform
            let downloadUrl = release.html_url
            if (Array.isArray(release.assets)) {
              let ext = '.exe'
              if (process.platform === 'darwin') ext = '.dmg'
              if (process.platform === 'linux') ext = '.AppImage'
              const asset = release.assets.find((a: any) => a.name && a.name.toLowerCase().endsWith(ext))
              if (asset && asset.browser_download_url) {
                downloadUrl = asset.browser_download_url
              }
            }

            const info: UpdateInfo = {
              version: latestVersion,
              currentVersion,
              name: release.name || `NetMask v${latestVersion}`,
              notes: release.body || 'A new version of NetMask is available.',
              url: release.html_url,
              downloadUrl
            }

            if (win && !win.isDestroyed()) {
              win.webContents.send('nm:update-available', info)
            }
            resolve(info)
            return
          }
          resolve(null)
        } catch {
          resolve(null)
        }
      })
    })

    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

let windowGetter: (() => BrowserWindow | null) | null = null

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
    if (win && !win.isDestroyed()) {
      win.webContents.send('nm:update-available', {
        version: info.version,
        currentVersion: app.getVersion(),
        name: `NetMask v${info.version}`,
        notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : 'Performance improvements and bug fixes.',
        url: `https://github.com/billighost/netmask/releases/tag/v${info.version}`
      })
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
