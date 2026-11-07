import { create } from 'zustand'
import type { Network, Connection, AppSettings, Toast, SpeedSample, ToastType, StreamerStatus, DownloadProgress,
  CompanionView, JournalTab, HistoryRange, UiSession, ContextPrompt, NetworkAlert } from './types'
import { errorMessage, visibleNetworks, nextSelection } from './network-state'
import { createSettingsQueue } from './settings-queue'
import { shortcutEquals } from './keyboard-shortcuts'

// Single persistent Float32Array(60) ring buffer for ultra-low GC pressure
const speedRingBuffer = new Float32Array(60)
let bssidPeekTimer: ReturnType<typeof setTimeout> | null = null
let uiSessionTimer: ReturnType<typeof setTimeout> | null = null

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
  startSharingTimer: 'Ctrl+Alt+S',
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
  connectionError: string | null
  connectionEpoch: number
  capabilities: import('./types').PlatformCapabilities | null
  networkSearch: string
  visible: boolean
  reconnecting: boolean
  streamerBusy: boolean
  speedTesting: boolean
  selectedGuid: string | null
  activeView: CompanionView
  journalTab: JournalTab
  historyRange: HistoryRange
  settings: AppSettings
  toasts: Toast[]
  speed: SpeedSample
  speedTick: number
  peakDownMBps: number
  testedSpeed: { mbps: number; mbPerSec: number } | null
  adminOk: boolean
  refreshing: boolean
  settingsOpen: boolean
  onboardingOpen: boolean
  reportModalOpen: boolean
  shortcutsModalOpen: boolean
  detailsModalGuid: string | null
  contextMenu: { x: number; y: number; guid: string } | null
  streamerStatus: StreamerStatus
  bssidPeek: boolean
  elevationStatus: import('./types').ElevationStatus | null
  downloadProgress: DownloadProgress | null
  downloadedVersion: string | null
  updateInfo: import('./types').UpdateInfo | null
  updateLastCheckedAt: number | null
  updateError: string | null
  updateDownloading: boolean
  recoveryAudit: import('./types').RecoveryAudit | null

  // Device/adapter controls, DNS, roaming, ping, captive portal, and sharing.
  pingTelemetry: import('./types').PingTelemetry | null
  deviceIdentity: import('./types').DeviceIdentity | null
  dnsResults: import('./types').DnsResolverResult[] | null
  roamingSettings: import('./types').RoamingSettings | null
  captivePortal: import('./types').CaptivePortalStatus | null
  wifiShareModalProfile: string | null
  dnsModalOpen: boolean
  privacyCloakModalOpen: boolean
  roamingModalOpen: boolean
  goingLiveOpen: boolean
  presetModalGuid: string | null
  evidenceReportOpen: boolean
  contextPrompt: ContextPrompt | null
  networkAlert: NetworkAlert | null
  presetUndo: { token: string; summary: string } | null

  // Actions
  setNetworks: (nets: Network[]) => void
  setNetworkSearch: (search: string) => void
  setConnection: (conn: Connection | null) => void
  selectNetwork: (guid: string | null) => void
  setActiveView: (view: CompanionView) => void
  setJournalTab: (tab: JournalTab) => void
  setHistoryRange: (range: HistoryRange) => void
  initializeUiSession: (session: UiSession) => void
  saveUiSession: (mainScrollTop?: number) => void
  setSettings: (s: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => Promise<boolean>
  updateShortcut: (id: string, key: string) => Promise<boolean>
  resetAllShortcuts: () => Promise<boolean>
  addToast: (msg: string, type?: ToastType) => string
  removeToast: (id: string) => void
  setSpeed: (s: SpeedSample) => void
  resetTelemetry: () => void
  setTestedSpeed: (ts: { mbps: number; mbPerSec: number } | null) => void
  setAdminOk: (ok: boolean) => void
  setRefreshing: (r: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setOnboardingOpen: (open: boolean) => void
  setReportModalOpen: (open: boolean) => void
  setShortcutsModalOpen: (open: boolean) => void
  setDetailsModalGuid: (guid: string | null) => void
  setContextMenu: (cm: { x: number; y: number; guid: string } | null) => void
  setStreamerStatus: (status: StreamerStatus) => void
  setElevationStatus: (status: import('./types').ElevationStatus) => void
  peekBssid: () => void
  setDownloadProgress: (p: DownloadProgress | null) => void
  setDownloadedVersion: (v: string | null) => void

  setPingTelemetry: (t: import('./types').PingTelemetry | null) => void
  setDeviceIdentity: (d: import('./types').DeviceIdentity | null) => void
  setDnsResults: (r: import('./types').DnsResolverResult[] | null) => void
  setRoamingSettings: (s: import('./types').RoamingSettings | null) => void
  setCaptivePortal: (cp: import('./types').CaptivePortalStatus | null) => void
  setWifiShareModalProfile: (profile: string | null) => void
  setDnsModalOpen: (open: boolean) => void
  setPrivacyCloakModalOpen: (open: boolean) => void
  setRoamingModalOpen: (open: boolean) => void
  setGoingLiveOpen: (open: boolean) => void
  setPresetModalGuid: (guid: string | null) => void
  setEvidenceReportOpen: (open: boolean) => void
  setContextPrompt: (prompt: ContextPrompt | null) => void
  setNetworkAlert: (alert: NetworkAlert | null) => void
  setPresetUndo: (undo: { token: string; summary: string } | null) => void
}

let toastSeq = 0

const DEFAULT_SETTINGS: AppSettings = {
  onboardingCompleted: false,
  minimizeToTray: true,
  launchOnStartup: false,
  autoRefreshInterval: 30,
  theme: 'light',
  showEthernet: true,
  ultraLowMemory: false,
  autoCloakStreamer: false,
  streamerMaskName: 'Private network',
  customBroadcastApps: [],
  sharingTimerMinutes: 30,
  bssidCloaking: true,
  bssidMaskMode: 'partial',
  silentElevation: true,
  monitoringEnabled: false,
  monitoringPaused: false,
  historyRetentionDays: 30,
  usageTrackingEnabled: false,
  contextPromptsEnabled: false,
  networkChangeAlerts: false,
  behaviorChangeAlerts: false,
  usageLimitAlerts: false,
  shortcuts: { ...DEFAULT_SHORTCUTS }
}

export const useStore = create<Store>((set, get) => ({
  networks: [],
  connection: null,
  connectionError: null,
  connectionEpoch: 0,
  capabilities: null,
  networkSearch: '',
  visible: true,
  reconnecting: false,
  streamerBusy: false,
  speedTesting: false,
  selectedGuid: null,
  activeView: 'overview',
  journalTab: 'history',
  historyRange: '24h',
  settings: DEFAULT_SETTINGS,
  toasts: [],
  speed: { downMBps: 0, upMBps: 0, downKbps: 0, upKbps: 0 },
  speedTick: 0,
  peakDownMBps: 0,
  testedSpeed: null,
  adminOk: false,
  refreshing: false,
  settingsOpen: false,
  onboardingOpen: false,
  reportModalOpen: false,
  shortcutsModalOpen: false,
  detailsModalGuid: null,
  contextMenu: null,
  streamerStatus: { detectedApp: null, isCloaked: false, cooldownSeconds: 0, manualSecondsRemaining: 0, manualTimed: false },
  bssidPeek: false,
  elevationStatus: null,
  downloadProgress: null,
  downloadedVersion: null,
  updateInfo: null,
  updateLastCheckedAt: null,
  updateError: null,
  updateDownloading: false,
  recoveryAudit: null,
  pingTelemetry: null,
  deviceIdentity: null,
  dnsResults: null,
  roamingSettings: null,
  captivePortal: null,
  wifiShareModalProfile: null,
  dnsModalOpen: false,
  privacyCloakModalOpen: false,
  roamingModalOpen: false,
  goingLiveOpen: false,
  presetModalGuid: null,
  evidenceReportOpen: false,
  contextPrompt: null,
  networkAlert: null,
  presetUndo: null,

  setNetworks: (nets) => set({ networks: nets }),
  setNetworkSearch: (networkSearch) => set(state => ({ networkSearch, selectedGuid: nextSelection(visibleNetworks(state.networks, state.settings, networkSearch, state.streamerStatus.isCloaked), state.selectedGuid) })),
  setConnection: (conn) => set({ connection: conn }),
  selectNetwork: (guid) => { set({ selectedGuid: guid }); scheduleUiSession() },
  setActiveView: (activeView) => { set({ activeView }); scheduleUiSession() },
  setJournalTab: (journalTab) => { set({ journalTab }); scheduleUiSession() },
  setHistoryRange: (historyRange) => { set({ historyRange }); scheduleUiSession() },
  initializeUiSession: (session) => set({
    activeView: session.activeView || 'overview', journalTab: session.journalTab || 'history',
    historyRange: session.historyRange || '24h', selectedGuid: session.selectedGuid
  }),
  saveUiSession: (mainScrollTop = 0) => persistUiSession(mainScrollTop),
  setSettings: (s) => set({ settings: settingWrites.initialize({
    ...DEFAULT_SETTINGS, ...s, shortcuts: { ...DEFAULT_SHORTCUTS, ...(s?.shortcuts || {}) }
  }) }),

  updateSetting: (key, val) => {
    const settings = { ...get().settings, [key]: val }
    set({ settings })
    if (key === 'showEthernet') {
      set(state => ({ selectedGuid: nextSelection(visibleNetworks(state.networks, settings, state.networkSearch, state.streamerStatus.isCloaked), state.selectedGuid) }))
    }
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', val as string)
    }
    return settingWrites.write(key, val)
  },

  updateShortcut: (id, key) => {
    const current = get().settings.shortcuts || { ...DEFAULT_SHORTCUTS }
    const updated = { ...current }
    if (key) {
      for (const [k, v] of Object.entries(updated)) {
        if (k !== id && shortcutEquals(v, key, get().capabilities?.platform)) {
          updated[k] = ''
        }
      }
    }
    updated[id] = key
    return get().updateSetting('shortcuts', updated)
  },

  resetAllShortcuts: () => {
    return get().updateSetting('shortcuts', { ...DEFAULT_SHORTCUTS })
  },

  addToast: (message, type = 'info') => {
    const duplicate = get().toasts.find(toast => toast.message === message && toast.type === type)
    if (duplicate) return duplicate.id
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

  resetTelemetry: () => {
    speedRingBuffer.fill(0)
    set(state => ({ speed: { downMBps: 0, upMBps: 0, downKbps: 0, upKbps: 0 },
      speedTick: state.speedTick + 1, testedSpeed: null, peakDownMBps: 0,
      pingTelemetry: null, captivePortal: null, dnsResults: null, deviceIdentity: null, roamingSettings: null,
      connectionEpoch: state.connectionEpoch + 1 }))
  },

  setTestedSpeed: (ts) => set(s => ({
    testedSpeed: ts,
    peakDownMBps: ts ? Math.max(s.peakDownMBps, ts.mbPerSec) : s.peakDownMBps
  })),

  setAdminOk: (ok) => set({ adminOk: ok }),
  setRefreshing: (r) => set({ refreshing: r }),
  setSettingsOpen: (open) => set(state => ({ settingsOpen: open, contextMenu: open ? null : state.contextMenu })),
  setOnboardingOpen: (open) => set(state => ({ onboardingOpen: open, contextMenu: open ? null : state.contextMenu })),
  setReportModalOpen: (open) => set(state => ({ reportModalOpen: open, contextMenu: open ? null : state.contextMenu })),
  setShortcutsModalOpen: (open) => set(state => ({ shortcutsModalOpen: open, contextMenu: open ? null : state.contextMenu })),
  setDetailsModalGuid: (guid) => set(state => ({ detailsModalGuid: guid, contextMenu: guid ? null : state.contextMenu })),
  setContextMenu: (cm) => set({ contextMenu: cm }),
  setStreamerStatus: (status) => set(state => ({ streamerStatus: status,
    networkSearch: status.isCloaked ? '' : state.networkSearch,
    bssidPeek: status.isCloaked ? false : state.bssidPeek,
    contextMenu: status.isCloaked ? null : state.contextMenu,
    selectedGuid: nextSelection(visibleNetworks(state.networks, state.settings, status.isCloaked ? '' : state.networkSearch, status.isCloaked), state.selectedGuid) })),
  setElevationStatus: (status) => set({ elevationStatus: status }),
  setDownloadProgress: (p) => set({ downloadProgress: p }),
  setDownloadedVersion: (v) => set({ downloadedVersion: v }),

  setPingTelemetry: (t) => set({ pingTelemetry: t }),
  setDeviceIdentity: (d) => set({ deviceIdentity: d }),
  setDnsResults: (r) => set({ dnsResults: r }),
  setRoamingSettings: (s) => set({ roamingSettings: s }),
  setCaptivePortal: (cp) => set({ captivePortal: cp }),
  setWifiShareModalProfile: (p) => set(state => ({ wifiShareModalProfile: p, contextMenu: p ? null : state.contextMenu })),
  setDnsModalOpen: (open) => set(state => ({ dnsModalOpen: open, contextMenu: open ? null : state.contextMenu })),
  setPrivacyCloakModalOpen: (open) => set(state => ({ privacyCloakModalOpen: open, contextMenu: open ? null : state.contextMenu })),
  setRoamingModalOpen: (open) => set(state => ({ roamingModalOpen: open, contextMenu: open ? null : state.contextMenu })),
  setGoingLiveOpen: (open) => set(state => ({ goingLiveOpen: open, contextMenu: open ? null : state.contextMenu })),
  setPresetModalGuid: (guid) => set(state => ({ presetModalGuid: guid, contextMenu: guid ? null : state.contextMenu })),
  setEvidenceReportOpen: (open) => set(state => ({ evidenceReportOpen: open, contextMenu: open ? null : state.contextMenu })),
  setContextPrompt: (contextPrompt) => set({ contextPrompt }),
  setNetworkAlert: (networkAlert) => set({ networkAlert }),
  setPresetUndo: (presetUndo) => set({ presetUndo }),

  peekBssid: () => {
    if (bssidPeekTimer) clearTimeout(bssidPeekTimer)
    set({ bssidPeek: true })
    bssidPeekTimer = setTimeout(() => {
      set({ bssidPeek: false })
      bssidPeekTimer = null
    }, 3000)
  }
}))

const settingWrites = createSettingsQueue(DEFAULT_SETTINGS,
  (key, value) => window.nm.setSetting(key, value),
  (key, value) => {
    useStore.setState(state => {
      const settings = { ...state.settings, [key]: value }
      return { settings, selectedGuid: nextSelection(visibleNetworks(state.networks, settings, state.networkSearch, state.streamerStatus.isCloaked), state.selectedGuid) }
    })
    if (key === 'theme') document.documentElement.setAttribute('data-theme', value as string)
  },
  error => useStore.getState().addToast(errorMessage(error, 'The setting could not be saved'), 'error')
)

function currentUiSession(mainScrollTop = typeof document === 'undefined' ? 0 : document.getElementById('main-content')?.scrollTop ?? 0): UiSession {
  const state = useStore.getState()
  return { activeView: state.activeView, journalTab: state.journalTab, historyRange: state.historyRange,
    selectedGuid: state.selectedGuid, mainScrollTop }
}

function persistUiSession(mainScrollTop?: number): void {
  if (typeof window === 'undefined' || typeof window.nm?.saveUiSession !== 'function') return
  void window.nm.saveUiSession(currentUiSession(mainScrollTop)).catch(() => {})
}

function scheduleUiSession(): void {
  if (uiSessionTimer) clearTimeout(uiSessionTimer)
  uiSessionTimer = setTimeout(() => { uiSessionTimer = null; persistUiSession() }, 250)
}


