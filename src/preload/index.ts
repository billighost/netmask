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

const api = {
  isAdmin: (): Promise<boolean> => ipcRenderer.invoke('nm:is-admin'),
  elevate: (): Promise<void> => ipcRenderer.invoke('nm:elevate'),

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
  }
}

contextBridge.exposeInMainWorld('nm', api)

declare global {
  interface Window {
    nm: typeof api
  }
}

