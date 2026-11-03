import { contextBridge, ipcRenderer } from 'electron'

export type Network = {
  guid: string
  name: string
  originalName: string
  renamed: boolean
  live: boolean
  type: 'wifi' | 'ethernet'
}

export type Connection = {
  ssid: string
  profile: string
  signal: number
  signalDbm?: number
  snr?: number
  channel?: number
  frequency?: string
  band: string
  generation?: string
  radioType?: string
  bssid?: string
  name: string
  rxRateMbps?: number
  txRateMbps?: number
}

export type NetworkDetails = {
  guid: string
  bssid: string
  maskedBssid?: string
  channel: number
  auth: string
  band: string
  frequency: string
  generation?: string
  signalDbm?: number
  snr?: number
  radioType?: string
  rxRateMbps?: number
  txRateMbps?: number
  lastConnected: string
}

export type StreamerStatus = {
  detectedApp: string | null
  isCloaked: boolean
  cooldownSeconds: number
}

export type SpeedSample = {
  downMBps: number
  upMBps: number
  downKbps: number
  upKbps: number
  instantDownMBps?: number
  instantUpMBps?: number
}

export type SpeedTestResult = {
  mbps: number
  mbPerSec: number
}

export type UpdateInfo = {
  version: string
  currentVersion: string
  name: string
  notes: string
  url: string
  downloadUrl?: string
  assetName?: string
  assetSize?: number
}

export type DownloadProgress = {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export type UpdateStatus = {
  isDownloading: boolean
  progress: DownloadProgress | null
  downloadedVersion: string | null
  downloadedFilePath: string | null
  availableUpdate: UpdateInfo | null
}

export type AppSettings = {
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
  shortcuts: Record<string, string>
}

export type ElevationStatus = {
  isElevated: boolean
  silentElevationEnabled: boolean
  taskConfigured: boolean
  tier: 'task' | 'broker' | 'jit'
}

export type DeviceIdentity = {
  hostname: string
  macAddress: string
  interfaceName: string
  interfaceGuid: string
  netbiosSilenced: boolean
  macRandomization: 'disabled' | 'enabled' | 'daily' | 'unknown'
  activeProfile: string | null
}

export type DnsResolverResult = {
  id: string
  name: string
  provider: string
  primary: string
  secondary?: string
  description: string
  isDhcp?: boolean
  latencyMs: number | null
  isCurrent: boolean
  isFastest?: boolean
}

export type RoamingSettings = {
  supported: boolean
  adapterName: string
  preferredBand: string
  validPreferredBands: string[]
  roamingAggressiveness: string
  validRoamingAggressiveness: string[]
}

export type PingTelemetry = {
  gatewayIp: string | null
  gatewayMs: number | null
  internetMs: number | null
  jitterMs: number | null
  timestamp: number
}

export type WifiQrData = {
  ssid: string
  auth: string
  password: string
  qrString: string
  svg: string
  isWep: boolean
  isOpen: boolean
}

export type CaptivePortalStatus = {
  isCaptive: boolean
  portalUrl: string | null
  checkedAt: number
}

const api = {
  isAdmin: (): Promise<boolean> => ipcRenderer.invoke('nm:is-admin'),
  elevate: (): Promise<void> => ipcRenderer.invoke('nm:elevate'),
  getElevationStatus: (): Promise<ElevationStatus> => ipcRenderer.invoke('nm:get-elevation-status'),
  setupSilentElevation: (): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('nm:setup-silent-elevation'),
  removeSilentElevation: (): Promise<{ success: boolean; message?: string }> => ipcRenderer.invoke('nm:remove-silent-elevation'),

  // Hotspot Device Identity & Privacy Cloak Suite
  getDeviceIdentity: (): Promise<DeviceIdentity> => ipcRenderer.invoke('nm:get-device-identity'),
  setMacRandomization: (profileName: string, mode: 'yes' | 'no' | 'daily'): Promise<boolean> => ipcRenderer.invoke('nm:set-mac-randomization', profileName, mode),
  setNetbiosSilencer: (enableSilence: boolean): Promise<boolean> => ipcRenderer.invoke('nm:set-netbios-silencer', enableSilence),

  // 1-Click Fastest DNS Benchmarker & Switcher
  benchmarkDns: (): Promise<DnsResolverResult[]> => ipcRenderer.invoke('nm:benchmark-dns'),
  getCurrentDns: (interfaceName?: string): Promise<{ primary: string; secondary?: string; isDhcp: boolean }> => ipcRenderer.invoke('nm:get-current-dns', interfaceName),
  applyDns: (resolverId: string): Promise<boolean> => ipcRenderer.invoke('nm:apply-dns', resolverId),

  // Wi-Fi Roaming & Band Steering Tuner
  getRoamingSettings: (): Promise<RoamingSettings> => ipcRenderer.invoke('nm:get-roaming-settings'),
  setRoamingSettings: (params: { preferredBand?: string; roamingAggressiveness?: string }): Promise<boolean> => ipcRenderer.invoke('nm:set-roaming-settings', params),

  // Real-Time Gateway & Internet Latency / Jitter Monitor
  getPingTelemetry: (): Promise<PingTelemetry> => ipcRenderer.invoke('nm:get-ping-telemetry'),
  onPingTelemetry: (cb: (telemetry: PingTelemetry) => void): (() => void) => {
    const handler = (_: unknown, t: PingTelemetry) => cb(t)
    ipcRenderer.on('nm:ping-telemetry', handler)
    return () => {
      ipcRenderer.removeListener('nm:ping-telemetry', handler)
    }
  },

  // Instant Wi-Fi Share via Encrypted QR Code
  getWifiQr: (profileName: string): Promise<WifiQrData> => ipcRenderer.invoke('nm:get-wifi-qr', profileName),

  // Captive Portal Detection
  checkCaptivePortal: (): Promise<CaptivePortalStatus> => ipcRenderer.invoke('nm:check-captive-portal'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('nm:open-external', url),
  onCaptivePortalStatus: (cb: (status: CaptivePortalStatus) => void): (() => void) => {
    const handler = (_: unknown, s: CaptivePortalStatus) => cb(s)
    ipcRenderer.on('nm:captive-portal-status', handler)
    return () => {
      ipcRenderer.removeListener('nm:captive-portal-status', handler)
    }
  },

  getNetworks: (): Promise<Network[]> => ipcRenderer.invoke('nm:get-networks'),
  getConnection: (): Promise<Connection | null> => ipcRenderer.invoke('nm:get-connection'),
  getDetails: (guid: string): Promise<NetworkDetails> => ipcRenderer.invoke('nm:get-details', guid),

  rename: (guid: string, newName: string, currentName?: string): Promise<void> => ipcRenderer.invoke('nm:rename', guid, newName, currentName),
  restore: (guid: string, currentName?: string): Promise<void> => ipcRenderer.invoke('nm:restore', guid, currentName),
  restoreAll: (): Promise<void> => ipcRenderer.invoke('nm:restore-all'),
  reconnect: (profile?: string): Promise<boolean> => ipcRenderer.invoke('nm:reconnect', profile),
  runSpeedTest: (): Promise<SpeedTestResult> => ipcRenderer.invoke('nm:run-speed-test'),

  exportBackup: (): Promise<string> => ipcRenderer.invoke('nm:export-backup'),
  importBackup: (json: string): Promise<void> => ipcRenderer.invoke('nm:import-backup', json),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('nm:get-settings'),
  setSetting: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('nm:set-setting', key, value),

  minimize: (): void => ipcRenderer.send('nm:minimize'),
  maximize: (): Promise<boolean> => ipcRenderer.invoke('nm:maximize'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('nm:is-maximized'),
  close: (): void => ipcRenderer.send('nm:close'),

  trimMemory: (): Promise<void> => ipcRenderer.invoke('nm:trim-memory'),

  getStreamerStatus: (): Promise<StreamerStatus> => ipcRenderer.invoke('nm:get-streamer-status'),
  toggleStreamerCloak: (): Promise<StreamerStatus> => ipcRenderer.invoke('nm:toggle-streamer-cloak'),
  onStreamerStatus: (cb: (status: StreamerStatus) => void): (() => void) => {
    const handler = (_: unknown, status: StreamerStatus) => cb(status)
    ipcRenderer.on('nm:streamer-status', handler)
    return () => {
      ipcRenderer.removeListener('nm:streamer-status', handler)
    }
  },

  onMaximizeChange: (cb: (isMax: boolean) => void): (() => void) => {
    const handler = (_: unknown, val: boolean) => cb(val)
    ipcRenderer.on('nm:maximize-change', handler)
    return () => {
      ipcRenderer.removeListener('nm:maximize-change', handler)
    }
  },

  onSpeed: (cb: (sample: SpeedSample) => void): (() => void) => {
    const handler = (_: unknown, data: SpeedSample) => cb(data)
    ipcRenderer.on('nm:speed', handler)
    return () => {
      ipcRenderer.removeListener('nm:speed', handler)
    }
  },

  getVersion: (): Promise<string> => ipcRenderer.invoke('nm:get-version'),
  getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke('nm:get-update-status'),
  checkUpdate: (): Promise<UpdateInfo | null> => ipcRenderer.invoke('nm:check-update'),
  downloadUpdate: (url?: string): Promise<{ success: boolean; filePath?: string; error?: string; inProgress?: boolean; alreadyDownloaded?: boolean }> => ipcRenderer.invoke('nm:download-update', url),
  installUpdate: (filePath?: string): Promise<void> => ipcRenderer.invoke('nm:install-update', filePath),
  openReleaseUrl: (url?: string): Promise<void> => ipcRenderer.invoke('nm:open-release-url', url),
  onUpdateAvailable: (cb: (info: UpdateInfo) => void): (() => void) => {
    const handler = (_: unknown, info: UpdateInfo) => cb(info)
    ipcRenderer.on('nm:update-available', handler)
    return () => {
      ipcRenderer.removeListener('nm:update-available', handler)
    }
  },
  onUpdateProgress: (cb: (progress: DownloadProgress) => void): (() => void) => {
    const handler = (_: unknown, p: DownloadProgress) => cb(p)
    ipcRenderer.on('nm:update-progress', handler)
    return () => {
      ipcRenderer.removeListener('nm:update-progress', handler)
    }
  },
  onUpdateDownloaded: (cb: (info: { filePath: string; version: string }) => void): (() => void) => {
    const handler = (_: unknown, info: { filePath: string; version: string }) => cb(info)
    ipcRenderer.on('nm:update-downloaded', handler)
    return () => {
      ipcRenderer.removeListener('nm:update-downloaded', handler)
    }
  }
}

contextBridge.exposeInMainWorld('nm', api)

declare global {
  interface Window {
    nm: typeof api
  }
}

