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
  band: string
  name: string
  rxRateMbps?: number
  txRateMbps?: number
}

export type NetworkDetails = {
  guid: string
  bssid: string
  channel: number
  auth: string
  band: string
  frequency: string
  lastConnected: string
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

