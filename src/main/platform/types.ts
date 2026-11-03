export interface Network {
  guid: string
  name: string
  originalName: string
  renamed: boolean
  live: boolean
  type: 'wifi' | 'ethernet'
}

export interface Connection {
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

export interface NetworkDetails {
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

export interface StreamerStatus {
  detectedApp: string | null
  isCloaked: boolean
  cooldownSeconds: number
}

export interface NetworkPlatformProvider {
  getNetworks(backup: Record<string, string>): Promise<Network[]> | Network[]
  getCurrentConnection(): Promise<Connection | null> | Connection | null
  getNetworkDetails(guidOrName: string): Promise<NetworkDetails> | NetworkDetails
  renameNetwork(guid: string, newName: string, currentDisplayName?: string): Promise<void>
  reconnectNetwork(profileName?: string): Promise<boolean>
  getRawNetworkBytes(): Promise<{ received: number; sent: number }>
}

