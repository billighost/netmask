/// <reference types="vite/client" />

// Expose the bridge API type to the renderer process
import type { AppSettings } from './types'

export interface NmApi {
  isAdmin(): Promise<boolean>
  elevate(): Promise<void>
  getElevationStatus(): Promise<import('./types').ElevationStatus>
  setupSilentElevation(): Promise<{ success: boolean; message?: string }>
  removeSilentElevation(): Promise<{ success: boolean; message?: string }>
  getNetworks(): Promise<import('./types').Network[]>
  getConnection(): Promise<import('./types').Connection | null>
  getDetails(guid: string): Promise<import('./types').NetworkDetails>
  rename(guid: string, newName: string, currentName?: string): Promise<void>
  restore(guid: string, currentName?: string): Promise<void>
  restoreAll(): Promise<void>
  reconnect(profile?: string): Promise<boolean>
  runSpeedTest(): Promise<import('./types').SpeedTestResult>
  exportBackup(): Promise<string>
  importBackup(json: string): Promise<void>
  getSettings(): Promise<AppSettings>
  setSetting(key: string, value: unknown): Promise<void>
  minimize(): void
  maximize(): Promise<boolean>
  isMaximized(): Promise<boolean>
  close(): void
  trimMemory(): Promise<void>
  getStreamerStatus(): Promise<import('./types').StreamerStatus>
  toggleStreamerCloak(): Promise<import('./types').StreamerStatus>
  onStreamerStatus(cb: (status: import('./types').StreamerStatus) => void): () => void
  onMaximizeChange(cb: (isMax: boolean) => void): () => void
  onSpeed(cb: (sample: import('./types').SpeedSample) => void): () => void
  checkUpdate(): Promise<import('./types').UpdateInfo | null>
  openReleaseUrl(url?: string): Promise<void>
  onUpdateAvailable(cb: (info: import('./types').UpdateInfo) => void): () => void
}

declare global {
  interface Window {
    nm: NmApi
  }
}

