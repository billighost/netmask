import { create } from 'zustand'
import type { Network, Connection, AppSettings, Toast, SpeedSample, ToastType, StreamerStatus, DownloadProgress } from './types'

// Single persistent Float32Array(60) ring buffer for ultra-low GC pressure
const speedRingBuffer = new Float32Array(60)
let bssidPeekTimer: ReturnType<typeof setTimeout> | null = null

export function getSpeedRingBuffer(): Float32Array {
  return speedRingBuffer
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

interface Store {
  networks: Network[]
  connection: Connection | null
  selectedGuid: string | null
  settings: AppSettings
  toasts: Toast[]
  speed: SpeedSample
  speedTick: number
  peakDownMBps: number
  testedSpeed: { mbps: number; mbPerSec: number } | null
  adminOk: boolean
  refreshing: boolean
  settingsOpen: boolean
  shortcutsModalOpen: boolean
  detailsModalGuid: string | null
  contextMenu: { x: number; y: number; guid: string } | null
  streamerStatus: StreamerStatus
  bssidPeek: boolean
  elevationStatus: import('./types').ElevationStatus | null
  downloadProgress: DownloadProgress | null
  downloadedVersion: string | null

  // Actions
  setNetworks: (nets: Network[]) => void
  setConnection: (conn: Connection | null) => void
  selectNetwork: (guid: string | null) => void
  setSettings: (s: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void
  updateShortcut: (id: string, key: string) => void
  resetAllShortcuts: () => void
  addToast: (msg: string, type?: ToastType) => string
  removeToast: (id: string) => void
  setSpeed: (s: SpeedSample) => void
  setTestedSpeed: (ts: { mbps: number; mbPerSec: number } | null) => void
  setAdminOk: (ok: boolean) => void
  setRefreshing: (r: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setShortcutsModalOpen: (open: boolean) => void
  setDetailsModalGuid: (guid: string | null) => void
  setContextMenu: (cm: { x: number; y: number; guid: string } | null) => void
  setStreamerStatus: (status: StreamerStatus) => void
  setElevationStatus: (status: import('./types').ElevationStatus) => void
  peekBssid: () => void
  setDownloadProgress: (p: DownloadProgress | null) => void
  setDownloadedVersion: (v: string | null) => void
}

let toastSeq = 0

const DEFAULT_SETTINGS: AppSettings = {
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

export const useStore = create<Store>((set, get) => ({
  networks: [],
  connection: null,
  selectedGuid: null,
  settings: DEFAULT_SETTINGS,
  toasts: [],
  speed: { downMBps: 0, upMBps: 0, downKbps: 0, upKbps: 0 },
  speedTick: 0,
  peakDownMBps: 0,
  testedSpeed: null,
  adminOk: false,
  refreshing: false,
  settingsOpen: false,
  shortcutsModalOpen: false,
  detailsModalGuid: null,
  contextMenu: null,
  streamerStatus: { detectedApp: null, isCloaked: false, cooldownSeconds: 0 },
  bssidPeek: false,
  elevationStatus: null,
  downloadProgress: null,
  downloadedVersion: null,

  setNetworks: (nets) => set({ networks: nets }),
  setConnection: (conn) => set({ connection: conn }),
  selectNetwork: (guid) => set({ selectedGuid: guid }),
  setSettings: (s) => set({
    settings: {
      ...s,
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(s?.shortcuts || {}) }
    }
  }),

  updateSetting: (key, val) => {
    const settings = { ...get().settings, [key]: val }
    set({ settings })
    window.nm.setSetting(key, val).catch(() => {})
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', val as string)
    }
  },

  updateShortcut: (id, key) => {
    const current = get().settings.shortcuts || { ...DEFAULT_SHORTCUTS }
    const updated = { ...current }
    if (key) {
      for (const [k, v] of Object.entries(updated)) {
        if (k !== id && v && v.toLowerCase() === key.toLowerCase()) {
          updated[k] = ''
        }
      }
    }
    updated[id] = key
    get().updateSetting('shortcuts', updated)
  },

  resetAllShortcuts: () => {
    get().updateSetting('shortcuts', { ...DEFAULT_SHORTCUTS })
  },

  addToast: (message, type = 'info') => {
    const id = String(++toastSeq)
    set(s => ({ toasts: [...s.toasts.slice(-2), { id, message, type }] }))
    if (type !== 'loading') {
      setTimeout(() => get().removeToast(id), 3500)
    }
    return id
  },

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  setSpeed: (speed) => {
    // Push into fixed Float32Array ring buffer without creating temporary arrays
    speedRingBuffer.copyWithin(0, 1)
    speedRingBuffer[59] = speed.downMBps

    set(s => ({
      speed,
      speedTick: (s.speedTick + 1) % 1000000,
      peakDownMBps: Math.max(s.peakDownMBps, speed.downMBps)
    }))
  },

  setTestedSpeed: (ts) => set(s => ({
    testedSpeed: ts,
    peakDownMBps: ts ? Math.max(s.peakDownMBps, ts.mbPerSec) : s.peakDownMBps
  })),

  setAdminOk: (ok) => set({ adminOk: ok }),
  setRefreshing: (r) => set({ refreshing: r }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setShortcutsModalOpen: (open) => set({ shortcutsModalOpen: open }),
  setDetailsModalGuid: (guid) => set({ detailsModalGuid: guid }),
  setContextMenu: (cm) => set({ contextMenu: cm }),
  setStreamerStatus: (status) => set({ streamerStatus: status }),
  setElevationStatus: (status) => set({ elevationStatus: status }),
  setDownloadProgress: (p) => set({ downloadProgress: p }),
  setDownloadedVersion: (v) => set({ downloadedVersion: v }),

  peekBssid: () => {
    if (bssidPeekTimer) clearTimeout(bssidPeekTimer)
    set({ bssidPeek: true })
    bssidPeekTimer = setTimeout(() => {
      set({ bssidPeek: false })
      bssidPeekTimer = null
    }, 3000)
  }
}))


