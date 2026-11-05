export type Network = {
  guid: string
  name: string
  originalName: string
  renamed: boolean
  nameSyncPending?: boolean
  live: boolean
  type: 'wifi' | 'ethernet'
  profile?: string
  canRename?: boolean
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
  networkGuid?: string
  interfaceName?: string
  interfaceGuid?: string
  auth?: string
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
  error?: string
}

export type SpeedSample = {
  available?: boolean
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
  onboardingCompleted: boolean
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
  tier: 'admin' | 'task' | 'broker' | 'jit'
}

export type DeviceIdentity = {
  hostname: string
  macAddress: string
  interfaceName: string
  interfaceGuid: string
  netbiosSilenced: boolean | null
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
  configurationId?: string
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
  assetSha256?: string
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

export type NetworkSnapshot = {
  networks: Network[]
  connection: Connection | null
  connectionError?: string | null
}

export type PlatformCapabilities = {
  platform: string
  networkRename: boolean
  wifiSharing: boolean
  dnsConfiguration: boolean
  macRandomization: boolean
  netbiosControl: boolean
  roamingTuning: boolean
  elevationTask: boolean
  gpuControl: boolean
}

export interface ShortcutDefinition {
  id: string
  name: string
  description: string
  category: 'Networks' | 'Navigation' | 'Privacy' | 'App'
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

