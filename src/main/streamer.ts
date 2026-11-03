import { execFile } from 'child_process'
import type { BrowserWindow } from 'electron'
import type { StreamerStatus } from './platform/types'
import { getSettings } from './settings'
import { getCurrentConnection, renameNetwork } from './registry'

const BROADCAST_APP_TARGETS = [
  { match: /^(obs64|obs32|obs)\.exe$/i, name: 'OBS Studio' },
  { match: /^streamlabs\s*obs\.exe$/i, name: 'Streamlabs' },
  { match: /^discord\.exe$/i, name: 'Discord' },
  { match: /^zoom\.exe$/i, name: 'Zoom' },
  { match: /^(teams|ms-teams|msteams)\.exe$/i, name: 'Microsoft Teams' },
  { match: /^twitchstudio\.exe$/i, name: 'Twitch Studio' },
  { match: /^xsplit\.core\.exe$/i, name: 'XSplit' }
]

const BROADCAST_APP_UNIX_TARGETS = [
  { match: /obs(64)?$/i, name: 'OBS Studio' },
  { match: /discord/i, name: 'Discord' },
  { match: /zoom/i, name: 'Zoom' },
  { match: /(teams|ms-teams)/i, name: 'Microsoft Teams' },
  { match: /twitchstudio/i, name: 'Twitch Studio' }
]

let detectedApp: string | null = null
let isCloaked = false
let cloakedGuid: string | null = null
let originalName: string | null = null

let cooldownTimer: NodeJS.Timeout | null = null
let cooldownSeconds = 0

let checkInterval: NodeJS.Timeout | null = null
let getWindowRef: (() => BrowserWindow | null) | null = null
let isChecking = false

/**
 * Low-overhead check for running broadcast/streaming software.
 * Bypasses cmd.exe / shell entirely to eliminate process churn.
 */
export function checkRunningBroadcastApps(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 2500 }, (err, stdout) => {
        if (err || !stdout) {
          resolve(null)
          return
        }
        const lines = stdout.split('\n')
        for (const line of lines) {
          // Format: "Image Name","PID","Session Name","Session#","Mem Usage"
          const firstQuote = line.indexOf('"')
          if (firstQuote !== -1) {
            const secondQuote = line.indexOf('"', firstQuote + 1)
            if (secondQuote !== -1) {
              const proc = line.substring(firstQuote + 1, secondQuote)
              for (const target of BROADCAST_APP_TARGETS) {
                if (target.match.test(proc)) {
                  resolve(target.name)
                  return
                }
              }
            }
          }
        }
        resolve(null)
      })
    } else {
      // macOS and Linux: ps -e -o comm=
      execFile('ps', ['-e', '-o', 'comm='], { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) {
          resolve(null)
          return
        }
        const lines = stdout.split('\n')
        for (const line of lines) {
          const proc = line.trim()
          for (const target of BROADCAST_APP_UNIX_TARGETS) {
            if (target.match.test(proc)) {
              resolve(target.name)
              return
            }
          }
        }
        resolve(null)
      })
    }
  })
}

function broadcastStatus(): void {
  const win = getWindowRef ? getWindowRef() : null
  if (win && !win.isDestroyed()) {
    win.webContents.send('nm:streamer-status', getStreamerStatus())
  }
}

export function getStreamerStatus(): StreamerStatus {
  return {
    detectedApp,
    isCloaked,
    cooldownSeconds
  }
}

export async function checkStreamerNow(): Promise<StreamerStatus> {
  if (isChecking) return getStreamerStatus()
  isChecking = true

  try {
    const appFound = await checkRunningBroadcastApps()
    detectedApp = appFound
    const settings = getSettings()

    if (appFound) {
      // Broadcast app active: Cancel any pending cooldown
      if (cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
        cooldownSeconds = 0
      }

      // Auto-cloak if enabled in settings and not already cloaked
      if (settings.autoCloakStreamer && !isCloaked) {
        try {
          const conn = await getCurrentConnection()
          if (conn && conn.name) {
            const maskName = settings.streamerMaskName?.trim() || 'StreamSafe-Fiber-Pro'
            if (conn.name.toLowerCase() !== maskName.toLowerCase()) {
              originalName = conn.name
              cloakedGuid = conn.profile || conn.ssid || conn.name
              await renameNetwork(cloakedGuid, maskName, conn.name)
              isCloaked = true
            }
          }
        } catch (err) {
          console.error('Failed to auto-cloak network for streamer:', err)
        }
      }
    } else {
      // Broadcast app closed
      if (isCloaked && !cooldownTimer) {
        // Start 10-second cooldown before restoring original network name
        cooldownSeconds = 10
        cooldownTimer = setInterval(async () => {
          cooldownSeconds--
          broadcastStatus()

          if (cooldownSeconds <= 0) {
            if (cooldownTimer) {
              clearInterval(cooldownTimer)
              cooldownTimer = null
            }
            // Restore original name
            if (isCloaked && cloakedGuid && originalName) {
              try {
                const maskName = settings.streamerMaskName?.trim() || 'StreamSafe-Fiber-Pro'
                await renameNetwork(cloakedGuid, originalName, maskName)
              } catch (err) {
                console.error('Failed to restore network name after streamer cooldown:', err)
              }
            }
            isCloaked = false
            cloakedGuid = null
            originalName = null
            cooldownSeconds = 0
            broadcastStatus()
          }
        }, 1000)
      }
    }

    broadcastStatus()
    return getStreamerStatus()
  } finally {
    isChecking = false
  }
}

export async function toggleStreamerCloak(): Promise<StreamerStatus> {
  const settings = getSettings()
  const maskName = settings.streamerMaskName?.trim() || 'StreamSafe-Fiber-Pro'

  if (isCloaked) {
    // Uncloak manually
    if (cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
      cooldownSeconds = 0
    }
    if (cloakedGuid && originalName) {
      try {
        await renameNetwork(cloakedGuid, originalName, maskName)
      } catch {}
    }
    isCloaked = false
    cloakedGuid = null
    originalName = null
  } else {
    // Cloak manually
    try {
      const conn = await getCurrentConnection()
      if (conn && conn.name) {
        originalName = conn.name
        cloakedGuid = conn.profile || conn.ssid || conn.name
        await renameNetwork(cloakedGuid, maskName, conn.name)
        isCloaked = true
      }
    } catch {}
  }

  broadcastStatus()
  return getStreamerStatus()
}

export function startStreamerMonitor(winGetter: () => BrowserWindow | null): void {
  getWindowRef = winGetter
  if (checkInterval) clearInterval(checkInterval)

  // Run initial check after 2 seconds
  setTimeout(() => {
    checkStreamerNow()
  }, 2000)

  // Periodic check every 15 seconds (minimal CPU overhead: ~240 checks/hr)
  // Runs even when window is minimized/hidden in tray so streaming protection is always active
  checkInterval = setInterval(() => {
    checkStreamerNow().catch(() => {})
  }, 15_000)
}

export async function restoreIfCloaked(): Promise<void> {
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
  if (isCloaked && cloakedGuid && originalName) {
    try {
      const settings = getSettings()
      const maskName = settings.streamerMaskName?.trim() || 'StreamSafe-Fiber-Pro'
      await renameNetwork(cloakedGuid, originalName, maskName)
    } catch (err) {
      console.error('Failed to restore network name on exit:', err)
    }
  }
  isCloaked = false
  cloakedGuid = null
  originalName = null
  cooldownSeconds = 0
}

export function stopStreamerMonitor(restore = false): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
  if (restore) {
    restoreIfCloaked().catch(() => {})
  }
}
