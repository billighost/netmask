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
  manualSecondsRemaining: number
  manualTimed: boolean
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
  customBroadcastApps: string[]
  sharingTimerMinutes: 15 | 30 | 60
  bssidCloaking: boolean
  bssidMaskMode: 'full' | 'partial'
  silentElevation: boolean
  monitoringEnabled: boolean
  monitoringPaused: boolean
  historyRetentionDays: 7 | 30 | 90
  usageTrackingEnabled: boolean
  contextPromptsEnabled: boolean
  networkChangeAlerts: boolean
  behaviorChangeAlerts: boolean
  usageLimitAlerts: boolean
  shortcuts: Record<string, string>
}

export type CompanionView = 'overview' | 'journal'
export type JournalTab = 'history' | 'usage' | 'week'
export type HistoryRange = '24h' | '7d' | '30d'

export type UiSession = {
  activeView: CompanionView
  journalTab: JournalTab
  historyRange: HistoryRange
  selectedGuid: string | null
  mainScrollTop: number
}

export type MissingSampleReason = 'paused' | 'not-running' | 'unavailable' | 'permission' | 'unknown'

export type HistoryBucket = {
  startMs: number
  endMs: number
  sampleCount: number
  expectedSampleCount: number
  missingReason?: MissingSampleReason
  gatewayMedianMs?: number
  internetMedianMs?: number
  internetP95Ms?: number
  jitterMedianMs?: number
  jitterMaxMs?: number
  dropCount: number
}

export type ConnectionEvent = {
  id: string
  atMs: number
  kind: 'drop' | 'latency-spike' | 'jitter-spike' | 'network-switch' | 'access-point-change' | 'monitoring-paused' | 'monitoring-resumed'
  title: string
  detail: string
  redactedDetail?: string
  networkGuid?: string
}

export type HistorySeries = {
  fromMs: number
  toMs: number
  networkGuid: string | null
  coveragePercent: number
  sampleCount: number
  buckets: HistoryBucket[]
  events: ConnectionEvent[]
}

export type NetworkUsageSummary = {
  networkGuid: string
  displayName: string
  fromMs: number
  toMs: number
  downloadedBytes: number
  uploadedBytes: number
  totalBytes: number
  limitBytes: number | null
  limitPercent: number | null
  counterResets: number
  adapterChanges: number
}

export type UsageReport = {
  fromMs: number
  toMs: number
  networks: NetworkUsageSummary[]
  unavailableReason?: string
}

export type DigestFinding = {
  id: string
  title: string
  detail: string
  evidence: string
  suggestion?: string
}

export type WeeklyDigest = {
  fromMs: number
  toMs: number
  enoughData: boolean
  coveragePercent: number
  summary: string
  insufficientReason?: string
  findings: DigestFinding[]
}

export type ContextPrompt = {
  id: string
  kind: 'broadcast-app' | 'preset-ready'
  title: string
  detail: string
  appName?: string
  networkGuid?: string
}

export type NetworkAlert = {
  id: string
  kind: 'access-point-change' | 'behavior-change' | 'usage-near-limit' | 'usage-over-limit'
  title: string
  detail: string
  detectedAtMs: number
  networkGuid?: string
}

export type NetworkPreset = {
  networkGuid: string
  enabled: boolean
  applyMode: 'ask' | 'automatic'
  label: string | null
  theme: 'inherit' | 'light' | 'dark'
  bssidVisibility: 'inherit' | 'partial' | 'full'
}

export type PresetPreview = {
  networkGuid: string
  changes: { label: string; before: string; after: string; requiresPermission: boolean }[]
  canApplyAutomatically: boolean
  automaticLimitReason?: string
}

export type PresetApplication = {
  applied: boolean
  summary: string
  undoToken?: string
}

export type GoingLiveCheck = {
  id: string
  label: string
  status: 'ready' | 'caution' | 'not-ready' | 'unavailable'
  value: string
  detail: string
}

export type GoingLiveResult = {
  status: 'ready' | 'caution' | 'not-ready' | 'unavailable'
  summary: string
  checkedAtMs: number
  sharingStatus: StreamerStatus
  checks: GoingLiveCheck[]
}

export type EvidenceReportData = {
  fromMs: number
  toMs: number
  generatedAtMs: number
  timezone: string
  coveragePercent: number
  sampleCount: number
  missingSampleCount: number
  dropCount: number
  latencySpikeCount: number
  jitterSpikeCount: number
  networkCount: number
  networkLabel?: string
  events: ConnectionEvent[]
  notes: string[]
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

export type DiagnosticReport = {
  generatedAt: number
  version: string
  platform: string
  capabilities: PlatformCapabilities
  networkCount: number
  wifiCount: number
  renamedCount: number
  syncPendingCount: number
  recoveryRecordCount: number
  connected: boolean
  snapshotError: boolean
  sharingMode: boolean
  sharingTimerActive: boolean
  broadcastAppDetected: boolean
  updateAvailable: boolean
  updateVersion: string | null
  updateDownloading: boolean
  downloadedVersion: string | null
}

export type RecoveryAudit = {
  checkedVersion: string
  recoveryRecordCount: number
  attentionCount: number
  syncPendingCount: number
}

export type NameConflict = {
  conflictingGuid: string
  currentName: string
  suggestedName: string
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

