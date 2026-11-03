delete process.env.ELECTRON_RUN_AS_NODE

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync } from 'fs'
import { execFile } from 'child_process'
import {
  getNetworks, getCurrentConnection, getNetworkDetails,
  renameNetwork, reconnectNetwork
} from './registry'
import { restoreNetwork, restoreAll, readBackup, writeBackup } from './backup'
import { getSpeedSampleAsync, stopSpeedMonitor, runSpeedTest } from './speed'
import {
  isAdmin, elevate, getElevationStatus, setupTaskElevation,
  removeTaskElevation, isTaskConfigured, triggerSilentElevation
} from './admin'
import { getSettings, setSetting } from './settings'
import {
  setupAutoUpdater, openReleaseUrl, checkGitHubRelease,
  checkOnRestoreFromTray, downloadUpdate, installDownloadedUpdate
} from './updater'
import {
  startStreamerMonitor, stopStreamerMonitor, getStreamerStatus,
  toggleStreamerCloak, checkStreamerNow
} from './streamer'
import { getDeviceIdentity, setMacRandomization, setNetbiosSilencer } from './privacy'
import { benchmarkDns, getCurrentDns, applyDns } from './dns'
import { getRoamingSettings, setRoamingSettings } from './roaming'
import { getPingTelemetry } from './ping-monitor'
import { getWifiQrData } from './wifi-qr'
import { checkCaptivePortal } from './captive-portal'

// --- Ultra-Low RAM & Performance Optimization: Chromium / V8 Flags ---
// Enforce strict memory budget and prune overhead to target <35-45MB active and 18-25MB in tray
app.commandLine.appendSwitch('max-old-space-size', '64')
app.commandLine.appendSwitch('optimize_for_size')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64 --optimize_for_size --expose-gc')
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,BackForwardCache')
app.commandLine.appendSwitch('renderer-process-limit', '1')
app.commandLine.appendSwitch('disable-breakpad')
app.commandLine.appendSwitch('disable-component-update')
// app.commandLine.appendSwitch('in-process-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')

// Optional Ultra-Low Memory Mode: disable GPU hardware acceleration completely if enabled
try {
  const initialSettings = getSettings()
  if (initialSettings.ultraLowMemory || process.argv.includes('--ultra-low-memory')) {
    app.disableHardwareAcceleration()
  }
} catch {}

// Enforce single instance so elevated and un-elevated never fight
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let speedInterval: ReturnType<typeof setInterval> | null = null
let quitting = false

export function trimMemory(): void {
  try {
    if (typeof (global as any).gc === 'function') {
      ;(global as any).gc()
    }
  } catch {}
  if (process.platform === 'win32') {
    try {
      const script = `
$sig = @'
[DllImport("psapi.dll")]
public static extern bool EmptyWorkingSet(IntPtr hProcess);
'@
$type = Add-Type -MemberDefinition $sig -Name "Psapi" -Namespace "Win32" -PassThru
try {
  $p = [System.Diagnostics.Process]::GetCurrentProcess()
  $type::EmptyWorkingSet($p.Handle)
} catch {}
`
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, () => {})
    } catch {}
  }
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nm:trim-memory')
    }
  } catch {}
}

/**
 * Tray Standby Unloading:
 * Unloads and destroys the BrowserWindow, terminating the Chromium Renderer process
 * and freeing all GPU compositor contexts. The app footprint drops to just the
 * lightweight Node/Electron main event loop (~18–25 MB WS-Private).
 */
export function destroyWindowToTray(): void {
  stopSpeed()
  if (mainWindow && !mainWindow.isDestroyed()) {
    const win = mainWindow
    mainWindow = null
    try {
      win.destroy()
    } catch (err) {
      console.error('Error destroying window on tray minimize:', err)
    }
  }
  trimMemory()
  setTimeout(() => {
    trimMemory()
  }, 400)
}

export function showOrCreateWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    checkOnRestoreFromTray(mainWindow)
  }
}

function isDev(): boolean {
  return !app.isPackaged
}

function getIconPath(): string {
  const iconName = process.platform === 'win32' ? 'netmask.ico' : 'icon.png'
  const packagedPath1 = join(process.resourcesPath, 'resources', iconName)
  if (existsSync(packagedPath1)) return packagedPath1
  const packagedPath2 = join(process.resourcesPath, iconName)
  if (existsSync(packagedPath2)) return packagedPath2
  const devPath = join(__dirname, '../../resources', iconName)
  if (existsSync(devPath)) return devPath
  return join(process.cwd(), 'resources', iconName)
}

function createWindow(): void {
  const settings = getSettings()
  const saved = settings.windowBounds
  const width = (saved && saved.width >= 380) ? saved.width : 440
  const height = (saved && saved.height >= 460) ? saved.height : 700

  let x = saved?.x
  let y = saved?.y
  if (typeof x === 'number' && typeof y === 'number') {
    try {
      const displays = screen.getAllDisplays()
      const isVisibleOnAnyDisplay = displays.some(d => {
        const b = d.bounds
        return x! >= b.x - 20 && x! < b.x + b.width && y! >= b.y - 20 && y! < b.y + b.height
      })
      if (!isVisibleOnAnyDisplay) {
        x = undefined
        y = undefined
      }
    } catch {}
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 380,
    minHeight: 460,
    frame: false,
    transparent: false,
    resizable: true,
    show: false,
    skipTaskbar: false,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Windows 11 Mica material
  if (process.platform === 'win32') {
    try { (mainWindow as any).setBackgroundMaterial('mica') } catch {}
  }

  mainWindow.on('ready-to-show', () => {
    if (saved?.isMaximized) {
      mainWindow?.maximize()
    }
    mainWindow?.show()
    mainWindow?.focus()
    checkStreamerNow().catch(() => {})
  })

  const saveBoundsNow = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      const isMax = mainWindow.isMaximized()
      const b = isMax
        ? (mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : (saved || { width: 440, height: 700 }))
        : mainWindow.getBounds()
      setSetting('windowBounds', {
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y,
        isMaximized: isMax
      })
    } catch {}
  }

  // Debounced window bounds persistence
  let saveTimer: NodeJS.Timeout | null = null
  const scheduleSaveBounds = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveBoundsNow, 300)
  }

  mainWindow.on('resize', scheduleSaveBounds)
  mainWindow.on('move', scheduleSaveBounds)

  mainWindow.on('maximize', () => {
    saveBoundsNow()
    mainWindow?.webContents.send('nm:maximize-change', true)
  })

  mainWindow.on('unmaximize', () => {
    saveBoundsNow()
    mainWindow?.webContents.send('nm:maximize-change', false)
  })

  mainWindow.on('minimize', () => {
    stopSpeed()
    trimMemory()
  })

  mainWindow.on('restore', () => {
    startSpeed()
    trimMemory()
  })

  mainWindow.on('hide', () => {
    stopSpeed()
    trimMemory()
  })

  mainWindow.on('show', () => {
    startSpeed()
    trimMemory()
    checkOnRestoreFromTray(mainWindow)
  })

  mainWindow.on('focus', () => {
    checkStreamerNow().catch(() => {})
  })

  mainWindow.on('close', (e) => {
    saveBoundsNow()
    if (!quitting) {
      const s = getSettings()
      if (s.minimizeToTray) {
        e.preventDefault()
        destroyWindowToTray()
        return
      }
    }
  })

  mainWindow.on('closed', () => {
    stopSpeed()
    mainWindow = null
  })

  if (isDev() && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    const iconPath = getIconPath()
    tray = new Tray(iconPath)
    tray.setToolTip('NetMask')

    const rebuild = async () => {
      const conn = await getCurrentConnection()
      const menu = Menu.buildFromTemplate([
        { label: 'NetMask 2.0', enabled: false },
        { type: 'separator' },
        {
          label: conn ? `Connected: ${conn.name}` : 'Not connected',
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Show NetMask',
          click: () => {
            showOrCreateWindow()
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
      tray?.setContextMenu(menu)
    }

    rebuild()
    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        createWindow()
        checkOnRestoreFromTray(mainWindow)
      } else if (mainWindow.isVisible()) {
        destroyWindowToTray()
      } else {
        mainWindow.show()
        mainWindow.focus()
        checkOnRestoreFromTray(mainWindow)
      }
    })

    // Rebuild tray status menu every 10s
    setInterval(rebuild, 10_000)
  } catch (err) {
    console.error('Failed to create tray icon:', err)
  }
}

function registerIpc(): void {
  ipcMain.handle('nm:is-admin', () => isAdmin())
  ipcMain.handle('nm:elevate', () => {
    quitting = true
    elevate()
  })

  ipcMain.handle('nm:get-networks', () => {
    const bk = readBackup()
    return getNetworks(bk)
  })

  ipcMain.handle('nm:get-connection', () => getCurrentConnection())
  ipcMain.handle('nm:get-details', (_e, guid: string) => getNetworkDetails(guid))

  ipcMain.handle('nm:rename', async (_e, guid: string, newName: string, currentName?: string) => {
    const bk = readBackup()
    if (!bk[guid]) {
      const nets = await getNetworks(bk)
      const net = nets.find((n: import('./platform/types').Network) => n.guid === guid)
      if (net) {
        bk[guid] = net.originalName
        writeBackup(bk)
      } else if (currentName) {
        bk[guid] = currentName
        writeBackup(bk)
      }
    }
    await renameNetwork(guid, newName, currentName)
  })

  ipcMain.handle('nm:restore', async (_e, guid: string, currentName?: string) => restoreNetwork(guid, currentName))
  ipcMain.handle('nm:restore-all', async () => restoreAll())
  ipcMain.handle('nm:reconnect', async (_e, profile?: string) => reconnectNetwork(profile))

  ipcMain.handle('nm:export-backup', () => JSON.stringify(readBackup(), null, 2))
  ipcMain.handle('nm:import-backup', (_e, json: string) => {
    const data = JSON.parse(json)
    writeBackup(data)
  })

  ipcMain.handle('nm:get-settings', () => getSettings())
  ipcMain.handle('nm:set-setting', (_e, key: string, value: unknown) => {
    setSetting(key, value)
    if (key === 'launchOnStartup') {
      app.setLoginItemSettings({
        openAtLogin: value as boolean,
        name: 'NetMask'
      })
    }
  })

  ipcMain.handle('nm:run-speed-test', () => runSpeedTest())
  ipcMain.handle('nm:check-update', () => checkGitHubRelease(mainWindow))
  ipcMain.handle('nm:download-update', (_e, url?: string) => downloadUpdate(url))
  ipcMain.handle('nm:install-update', (_e, filePath?: string) => {
    installDownloadedUpdate(filePath)
  })
  ipcMain.handle('nm:open-release-url', (_e, url?: string) => openReleaseUrl(url))
  ipcMain.on('nm:minimize', () => mainWindow?.minimize())
  ipcMain.handle('nm:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
      return false
    } else {
      mainWindow.maximize()
      return true
    }
  })
  ipcMain.handle('nm:is-maximized', () => mainWindow?.isMaximized() ?? false)
  ipcMain.on('nm:close', () => mainWindow?.close())

  ipcMain.handle('nm:trim-memory', () => {
    trimMemory()
  })

  ipcMain.handle('nm:get-streamer-status', () => getStreamerStatus())
  ipcMain.handle('nm:toggle-streamer-cloak', () => toggleStreamerCloak())

  ipcMain.handle('nm:get-elevation-status', () => getElevationStatus())
  ipcMain.handle('nm:setup-silent-elevation', () => setupTaskElevation())
  ipcMain.handle('nm:remove-silent-elevation', () => removeTaskElevation())

  // Hotspot Device Identity & Privacy Cloak Suite
  ipcMain.handle('nm:get-device-identity', () => getDeviceIdentity())
  ipcMain.handle('nm:set-mac-randomization', (_e, profileName: string, mode: 'yes' | 'no' | 'daily') => setMacRandomization(profileName, mode))
  ipcMain.handle('nm:set-netbios-silencer', (_e, enableSilence: boolean) => setNetbiosSilencer(enableSilence))

  // 1-Click Fastest DNS Benchmarker & Switcher
  ipcMain.handle('nm:benchmark-dns', () => benchmarkDns())
  ipcMain.handle('nm:get-current-dns', (_e, interfaceName?: string) => getCurrentDns(interfaceName))
  ipcMain.handle('nm:apply-dns', (_e, resolverId: string) => applyDns(resolverId))

  // Wi-Fi Roaming & Band Steering Tuner
  ipcMain.handle('nm:get-roaming-settings', () => getRoamingSettings())
  ipcMain.handle('nm:set-roaming-settings', (_e, params: { preferredBand?: string; roamingAggressiveness?: string }) => setRoamingSettings(params))

  // Real-Time Gateway & Internet Latency / Jitter Monitor
  ipcMain.handle('nm:get-ping-telemetry', () => getPingTelemetry())

  // Instant Wi-Fi Share via Encrypted QR Code
  ipcMain.handle('nm:get-wifi-qr', (_e, profileName: string) => getWifiQrData(profileName))

  // Captive Portal Detection
  ipcMain.handle('nm:check-captive-portal', () => checkCaptivePortal())
  ipcMain.handle('nm:open-external', (_e, url: string) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url)
    }
  })
}

let pingCycle = 0

function startSpeed(): void {
  if (speedInterval) return
  speedInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // Only query speed when the window is actually open and visible!
    if (!mainWindow.isVisible() || mainWindow.isMinimized()) return

    const sample = await getSpeedSampleAsync()
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.webContents.send('nm:speed', sample)
    }

    pingCycle++
    if (pingCycle % 2 === 0) {
      getPingTelemetry().then((telemetry) => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.webContents.send('nm:ping-telemetry', telemetry)
        }
      }).catch(() => {})
    }
  }, 1000)
}

function stopSpeed(): void {
  if (speedInterval) {
    clearInterval(speedInterval)
    speedInterval = null
  }
  stopSpeedMonitor()
}

app.on('second-instance', () => {
  showOrCreateWindow()
})

app.whenReady().then(async () => {
  // Cascading Silent Elevation: If configured and enabled, hand over to elevated instance seamlessly
  if (process.platform === 'win32' && !isAdmin() && !process.argv.includes('--no-elevate')) {
    try {
      const s = getSettings()
      if (s.silentElevation !== false) {
        const configured = await isTaskConfigured()
        if (configured) {
          const launched = await triggerSilentElevation()
          if (launched) {
            app.exit(0)
            return
          }
        }
      }
    } catch {}
  }

  // If already elevated and silent elevation is enabled, auto-register the task for future zero-prompt launches
  if (process.platform === 'win32' && isAdmin()) {
    try {
      const s = getSettings()
      if (s.silentElevation !== false) {
        isTaskConfigured().then(configured => {
          if (!configured) setupTaskElevation().catch(() => {})
        })
      }
    } catch {}
  }

  createWindow()
  createTray()
  registerIpc()
  startSpeed()
  startStreamerMonitor(() => mainWindow)
  setupAutoUpdater(() => mainWindow)

  // Automated performance & RAM footprint benchmark hook
  if (process.argv.includes('--benchmark')) {
    setTimeout(async () => {
      try {
        const getOsMetrics = async (pids: number[]) => {
          if (process.platform !== 'win32' || pids.length === 0) return {}
          return new Promise<Record<number, { privateWorkingSetMB: number; commitMB: number; sharedWorkingSetMB: number }>>((resolve) => {
            const filter = pids.map(p => `IDProcess = ${p}`).join(' or ')
            const cmd = `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "${filter}" | Select-Object IDProcess, WorkingSet, WorkingSetPrivate, PageFileBytes | ConvertTo-Json -Compress`
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 5000 }, (err, stdout) => {
              if (err || !stdout) {
                resolve({})
                return
              }
              try {
                const parsed = JSON.parse(stdout)
                const items = Array.isArray(parsed) ? parsed : [parsed]
                const res: Record<number, { privateWorkingSetMB: number; commitMB: number; sharedWorkingSetMB: number }> = {}
                for (const item of items) {
                  if (item && item.IDProcess) {
                    res[item.IDProcess] = {
                      privateWorkingSetMB: parseFloat(((item.WorkingSetPrivate || 0) / (1024 * 1024)).toFixed(1)),
                      commitMB: parseFloat(((item.PageFileBytes || 0) / (1024 * 1024)).toFixed(1)),
                      sharedWorkingSetMB: parseFloat(((item.WorkingSet || 0) / (1024 * 1024)).toFixed(1))
                    }
                  }
                }
                resolve(res)
              } catch {
                resolve({})
              }
            })
          })
        }

        const activeMetrics = app.getAppMetrics()
        const activeOs = await getOsMetrics(activeMetrics.map(m => m.pid))
        let activePrivWSMB = 0
        let activeCommitMB = 0
        let activeSharedWSMB = 0
        for (const m of activeMetrics) {
          const os = activeOs[m.pid]
          const priv = os ? os.privateWorkingSetMB : parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1))
          const commit = os ? os.commitMB : parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1))
          const shared = os ? os.sharedWorkingSetMB : parseFloat(((m.memory.workingSetSize || 0) / 1024).toFixed(1))
          activePrivWSMB += priv
          activeCommitMB += commit
          activeSharedWSMB += shared
        }

        // Transition to hidden tray state via true Standby Unloading
        destroyWindowToTray()

        setTimeout(async () => {
          const trayMetrics = app.getAppMetrics()
          const trayOs = await getOsMetrics(trayMetrics.map(m => m.pid))
          let trayPrivWSMB = 0
          let trayCommitMB = 0
          let traySharedWSMB = 0
          for (const m of trayMetrics) {
            const os = trayOs[m.pid]
            const priv = os ? os.privateWorkingSetMB : parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1))
            const commit = os ? os.commitMB : parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1))
            const shared = os ? os.sharedWorkingSetMB : parseFloat(((m.memory.workingSetSize || 0) / 1024).toFixed(1))
            trayPrivWSMB += priv
            trayCommitMB += commit
            traySharedWSMB += shared
          }

          const report = {
            timestamp: new Date().toISOString(),
            platform: process.platform,
            arch: process.arch,
            active: {
              privateWorkingSetMB: parseFloat(activePrivWSMB.toFixed(1)),
              commitMB: parseFloat(activeCommitMB.toFixed(1)),
              totalSharedWorkingSetMB: parseFloat(activeSharedWSMB.toFixed(1)),
              processes: activeMetrics.map(m => ({
                pid: m.pid,
                type: m.type,
                privateWorkingSetMB: activeOs[m.pid]?.privateWorkingSetMB ?? parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1)),
                commitMB: activeOs[m.pid]?.commitMB ?? parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1)),
                workingSetMB: activeOs[m.pid]?.sharedWorkingSetMB ?? parseFloat(((m.memory.workingSetSize || 0) / 1024).toFixed(1)),
                cpuPercent: m.cpu.percentCPUUsage
              }))
            },
            tray: {
              privateWorkingSetMB: parseFloat(trayPrivWSMB.toFixed(1)),
              commitMB: parseFloat(trayCommitMB.toFixed(1)),
              totalSharedWorkingSetMB: parseFloat(traySharedWSMB.toFixed(1)),
              processes: trayMetrics.map(m => ({
                pid: m.pid,
                type: m.type,
                privateWorkingSetMB: trayOs[m.pid]?.privateWorkingSetMB ?? parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1)),
                commitMB: trayOs[m.pid]?.commitMB ?? parseFloat(((m.memory.privateBytes || 0) / 1024).toFixed(1)),
                workingSetMB: trayOs[m.pid]?.sharedWorkingSetMB ?? parseFloat(((m.memory.workingSetSize || 0) / 1024).toFixed(1)),
                cpuPercent: m.cpu.percentCPUUsage
              }))
            }
          }

          const json = JSON.stringify(report, null, 2)
          console.log('=== NETMASK PERFORMANCE BENCHMARK RESULT ===')
          console.log(json)
          try {
            writeFileSync('benchmark-results.json', json, 'utf-8')
          } catch {}

          quitting = true
          app.exit(0)
        }, 3000)
      } catch (err) {
        console.error('Benchmark execution error:', err)
        app.exit(1)
      }
    }, 4000)
  }
})

app.on('window-all-closed', () => {
  // Keep alive in tray
})

app.on('before-quit', () => {
  quitting = true
  stopStreamerMonitor(true)
  stopSpeed()
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const isMax = mainWindow.isMaximized()
      const b = isMax
        ? (mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds())
        : mainWindow.getBounds()
      setSetting('windowBounds', {
        width: b.width,
        height: b.height,
        x: b.x,
        y: b.y,
        isMaximized: isMax
      })
    } catch {}
  }
})

app.on('activate', () => {
  showOrCreateWindow()
})

