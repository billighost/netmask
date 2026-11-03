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

export interface AppSettings {
  minimizeToTray: boolean
  launchOnStartup: boolean
  autoRefreshInterval: number
  theme: 'dark' | 'light'
  showEthernet: boolean
  windowBounds?: WindowBounds
}

const DEFAULTS: AppSettings = {
  minimizeToTray: true,
  launchOnStartup: false,
  autoRefreshInterval: 30,
  theme: 'dark',
  showEthernet: true
}

export function getSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return { ...DEFAULTS }
    const raw = readFileSync(SETTINGS_FILE, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
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

