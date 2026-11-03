import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { ensureDir, DATA_DIR } from './backup'

const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

export interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  refresh: 'Ctrl+R',
  focusRename: 'Ctrl+N',
  applyRename: 'Ctrl+Enter',
  restoreOriginal: 'Ctrl+Shift+Z',
  reconnectWifi: 'Ctrl+Shift+R',
  selectNext: 'ArrowDown',
  selectPrev: 'ArrowUp',
  filterSearch: 'Ctrl+F',
  viewDetails: 'Ctrl+D',
  toggleStreamer: 'Ctrl+Shift+S',
  peekBssid: 'Ctrl+Shift+B',
  trimMemory: 'Ctrl+Shift+M',
  runSpeedTest: 'Ctrl+Shift+T',
  openSettings: 'Ctrl+,',
  openShortcuts: 'Ctrl+/',
  closeModals: 'Escape'
}

export interface AppSettings {
  minimizeToTray: boolean
  launchOnStartup: boolean
  autoRefreshInterval: number
  theme: 'dark' | 'light'
  showEthernet: boolean
  ultraLowMemory: boolean
  autoCloakStreamer: boolean
  streamerMaskName: string
  bssidCloaking: boolean
  bssidMaskMode: 'full' | 'partial'
  silentElevation: boolean
  windowBounds?: WindowBounds
  shortcuts: Record<string, string>
}

const DEFAULTS: AppSettings = {
  minimizeToTray: true,
  launchOnStartup: false,
  autoRefreshInterval: 30,
  theme: 'dark',
  showEthernet: true,
  ultraLowMemory: false,
  autoCloakStreamer: true,
  streamerMaskName: 'StreamSafe-Fiber-Pro',
  bssidCloaking: true,
  bssidMaskMode: 'partial',
  silentElevation: true,
  shortcuts: { ...DEFAULT_SHORTCUTS }
}

export function getSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS }
    const raw = readFileSync(SETTINGS_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULTS,
      ...parsed,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts || {}) }
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setSetting(key: string, value: unknown): void {
  try {
    ensureDir()
    const settings = getSettings()
    ;(settings as unknown as Record<string, unknown>)[key] = value
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
  } catch {}
}

