delete process.env.ELECTRON_RUN_AS_NODE

import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  getNetworks, getCurrentConnection, getNetworkDetails,
  renameNetwork, reconnectNetwork
} from './registry'
import { restoreNetwork, restoreAll, readBackup, writeBackup } from './backup'
import { getSpeedSampleAsync, stopSpeedMonitor, runSpeedTest } from './speed'
import { isAdmin, elevate } from './admin'
import { getSettings, setSetting } from './settings'

// Enforce single instance so elevated and un-elevated never fight
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let speedInterval: ReturnType<typeof setInterval> | null = null
let quitting = false

function isDev(): boolean {
  return !app.isPackaged
}

function getIconPath(): string {
  const packagedPath1 = join(process.resourcesPath, 'resources', 'netmask.ico')
  if (existsSync(packagedPath1)) return packagedPath1
  const packagedPath2 = join(process.resourcesPath, 'netmask.ico')
  if (existsSync(packagedPath2)) return packagedPath2
  const devPath = join(__dirname, '../../resources/netmask.ico')
  if (existsSync(devPath)) return devPath
  return join(process.cwd(), 'resources', 'netmask.ico')
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

  mainWindow.on('close', (e) => {
    saveBoundsNow()
    if (!quitting) {
      const s = getSettings()
      if (s.minimizeToTray) {
        e.preventDefault()
        mainWindow?.hide()
        return
      }
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

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

    const rebuild = () => {
      const conn = getCurrentConnection()
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
            if (!mainWindow) createWindow()
            else { mainWindow.show(); mainWindow.focus() }
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
      if (!mainWindow) {
        createWindow()
      } else if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
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
      const nets = getNetworks(bk)
      const net = nets.find(n => n.guid === guid)
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
}

function startSpeed(): void {
  speedInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    // Only query speed when the window is actually open and visible!
    if (!mainWindow.isVisible() || mainWindow.isMinimized()) return

    const sample = await getSpeedSampleAsync()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nm:speed', sample)
    }
  }, 1000)
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  createWindow()
  createTray()
  registerIpc()
  startSpeed()
})

app.on('window-all-closed', () => {
  // Keep alive in tray
})

app.on('before-quit', () => {
  quitting = true
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
  if (speedInterval) clearInterval(speedInterval)
  stopSpeedMonitor()
})

app.on('activate', () => {
  if (!mainWindow) createWindow()
  else mainWindow.show()
})
