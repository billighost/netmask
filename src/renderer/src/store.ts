import { create } from 'zustand'
import type { Network, Connection, AppSettings, Toast, SpeedSample, ToastType } from './types'

interface Store {
  networks: Network[]
  connection: Connection | null
  selectedGuid: string | null
  settings: AppSettings
  toasts: Toast[]
  speed: SpeedSample
  speedHistory: number[]  // last 60 downMBps samples
  peakDownMBps: number
  testedSpeed: { mbps: number; mbPerSec: number } | null
  adminOk: boolean
  refreshing: boolean
  settingsOpen: boolean
  contextMenu: { x: number; y: number; guid: string } | null

  // Actions
  setNetworks: (nets: Network[]) => void
  setConnection: (conn: Connection | null) => void
  selectNetwork: (guid: string | null) => void
  setSettings: (s: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => void
  addToast: (msg: string, type?: ToastType) => string
  removeToast: (id: string) => void
  setSpeed: (s: SpeedSample) => void
  setTestedSpeed: (ts: { mbps: number; mbPerSec: number } | null) => void
  setAdminOk: (ok: boolean) => void
  setRefreshing: (r: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setContextMenu: (cm: { x: number; y: number; guid: string } | null) => void
}

let toastSeq = 0

const DEFAULT_SETTINGS: AppSettings = {
  minimizeToTray: true,
  launchOnStartup: false,
  autoRefreshInterval: 30,
  theme: 'dark',
  showEthernet: true
}

export const useStore = create<Store>((set, get) => ({
  networks: [],
  connection: null,
  selectedGuid: null,
  settings: DEFAULT_SETTINGS,
  toasts: [],
  speed: { downMBps: 0, upMBps: 0, downKbps: 0, upKbps: 0 },
  speedHistory: Array(60).fill(0),
  peakDownMBps: 0,
  testedSpeed: null,
  adminOk: false,
  refreshing: false,
  settingsOpen: false,
  contextMenu: null,

  setNetworks: (nets) => set({ networks: nets }),
  setConnection: (conn) => set({ connection: conn }),
  selectNetwork: (guid) => set({ selectedGuid: guid }),
  setSettings: (s) => set({ settings: s }),

  updateSetting: (key, val) => {
    const settings = { ...get().settings, [key]: val }
    set({ settings })
    window.nm.setSetting(key, val).catch(() => {})
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', val as string)
    }
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

  setSpeed: (speed) => set(s => ({
    speed,
    peakDownMBps: Math.max(s.peakDownMBps, speed.downMBps),
    speedHistory: [...s.speedHistory.slice(1), speed.downMBps]
  })),

  setTestedSpeed: (ts) => set(s => ({
    testedSpeed: ts,
    peakDownMBps: ts ? Math.max(s.peakDownMBps, ts.mbPerSec) : s.peakDownMBps
  })),

  setAdminOk: (ok) => set({ adminOk: ok }),
  setRefreshing: (r) => set({ refreshing: r }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setContextMenu: (cm) => set({ contextMenu: cm })
}))

