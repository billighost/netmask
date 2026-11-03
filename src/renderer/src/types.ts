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

export interface ShortcutDefinition {
  id: string
  name: string
  description: string
  category: 'Network Actions' | 'Navigation' | 'Privacy & Streamer' | 'Window & General'
  defaultKey: string
}

export type ToastType = 'success' | 'error' | 'info' | 'loading'

export type Toast = {
  id: string
  message: string
  type: ToastType
}

export type SpeedInfo = {
  label: string
  items: { ok: boolean; text: string }[]
}

