import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  Network, Connection, NetworkDetails, StreamerStatus, SpeedSample, SpeedTestResult,
  UpdateInfo, DownloadProgress, UpdateStatus, AppSettings, ElevationStatus,
  DeviceIdentity, DnsResolverResult, RoamingSettings, PingTelemetry, WifiQrData,
  CaptivePortalStatus
} from './types'

function createListener<T>(eventName: string) {
  return (cb: (data: T) => void): (() => void) => {
    let unlisten: (() => void) | null = null
    let active = true
    listen<T>(eventName, (event) => {
      if (active) cb(event.payload)
    }).then((fn) => {
      if (!active) fn()
      else unlisten = fn
    }).catch(() => {})

    return () => {
      active = false
      if (unlisten) unlisten()
    }
  }
}

export const tauriApi = {
  isAdmin: (): Promise<boolean> => invoke('nm_is_admin'),
  elevate: (): Promise<void> => invoke('nm_elevate'),
  getElevationStatus: (): Promise<ElevationStatus> => invoke('nm_get_elevation_status'),
  setupSilentElevation: (): Promise<{ success: boolean; message?: string }> => invoke('nm_setup_silent_elevation'),
  removeSilentElevation: (): Promise<{ success: boolean; message?: string }> => invoke('nm_remove_silent_elevation'),

  // Hotspot Device Identity & Privacy Cloak Suite
  getDeviceIdentity: (): Promise<DeviceIdentity> => invoke('nm_get_device_identity'),
  setMacRandomization: (profileName: string, mode: 'yes' | 'no' | 'daily'): Promise<boolean> =>
    invoke('nm_set_mac_randomization', { profileName, mode }),
  setNetbiosSilencer: (enableSilence: boolean): Promise<boolean> =>
    invoke('nm_set_netbios_silencer', { enableSilence }),

  // 1-Click Fastest DNS Benchmarker & Switcher
  benchmarkDns: (): Promise<DnsResolverResult[]> => invoke('nm_benchmark_dns'),
  getCurrentDns: (interfaceName?: string): Promise<{ primary: string; secondary?: string; isDhcp: boolean }> =>
    invoke('nm_get_current_dns', { interfaceName }),
  applyDns: (resolverId: string): Promise<boolean> => invoke('nm_apply_dns', { resolverId }),

  // Wi-Fi Roaming & Band Steering Tuner
  getRoamingSettings: (): Promise<RoamingSettings> => invoke('nm_get_roaming_settings'),
  setRoamingSettings: (params: { preferredBand?: string; roamingAggressiveness?: string }): Promise<boolean> =>
    invoke('nm_set_roaming_settings', { params }),

  // Real-Time Gateway & Internet Latency / Jitter Monitor
  getPingTelemetry: (): Promise<PingTelemetry> => invoke('nm_get_ping_telemetry'),
  onPingTelemetry: createListener<PingTelemetry>('nm:ping-telemetry'),

  // Instant Wi-Fi Share via Encrypted QR Code
  getWifiQr: (profileName: string): Promise<WifiQrData> => invoke('nm_get_wifi_qr', { profileName }),

  // Captive Portal Detection
  checkCaptivePortal: (): Promise<CaptivePortalStatus> => invoke('nm_check_captive_portal'),
  openExternal: (url: string): Promise<void> => invoke('nm_open_external', { url }),
  onCaptivePortalStatus: createListener<CaptivePortalStatus>('nm:captive-portal-status'),

  getNetworks: (): Promise<Network[]> => invoke('nm_get_networks'),
  getConnection: (): Promise<Connection | null> => invoke('nm_get_connection'),
  getDetails: (guid: string): Promise<NetworkDetails> => invoke('nm_get_details', { guid }),

  rename: (guid: string, newName: string, currentName?: string): Promise<void> =>
    invoke('nm_rename', { guid, newName, currentName }),
  restore: (guid: string, currentName?: string): Promise<void> =>
    invoke('nm_restore', { guid, currentName }),
  restoreAll: (): Promise<void> => invoke('nm_restore_all'),
  reconnect: (profile?: string): Promise<boolean> => invoke('nm_reconnect', { profile }),
  runSpeedTest: (): Promise<SpeedTestResult> => invoke('nm_run_speed_test'),

  exportBackup: (): Promise<string> => invoke('nm_export_backup'),
  importBackup: (json: string): Promise<void> => invoke('nm_import_backup', { json }),

  getSettings: (): Promise<AppSettings> => invoke('nm_get_settings'),
  setSetting: (key: string, value: unknown): Promise<void> =>
    invoke('nm_set_setting', { key, value }),

  minimize: (): void => { invoke('nm_minimize').catch(() => {}) },
  maximize: (): Promise<boolean> => invoke('nm_maximize'),
  isMaximized: (): Promise<boolean> => invoke('nm_is_maximized'),
  close: (): void => { invoke('nm_close').catch(() => {}) },

  trimMemory: (): Promise<void> => invoke('nm_trim_memory'),

  getStreamerStatus: (): Promise<StreamerStatus> => invoke('nm_get_streamer_status'),
  toggleStreamerCloak: (): Promise<StreamerStatus> => invoke('nm_toggle_streamer_cloak'),
  onStreamerStatus: createListener<StreamerStatus>('nm:streamer-status'),

  onMaximizeChange: createListener<boolean>('nm:maximize-change'),
  onSpeed: createListener<SpeedSample>('nm:speed'),

  getVersion: (): Promise<string> => invoke('nm_get_version'),
  getUpdateStatus: (): Promise<UpdateStatus> => invoke('nm_get_update_status'),
  checkUpdate: (): Promise<UpdateInfo | null> => invoke('nm_check_update'),
  downloadUpdate: (url?: string): Promise<{ success: boolean; filePath?: string; error?: string; inProgress?: boolean; alreadyDownloaded?: boolean }> =>
    invoke('nm_download_update', { url }),
  installUpdate: (filePath?: string): Promise<void> => invoke('nm_install_update', { filePath }),
  openReleaseUrl: (url?: string): Promise<void> => invoke('nm_open_release_url', { url }),
  onUpdateAvailable: createListener<UpdateInfo>('nm:update-available'),
  onUpdateProgress: createListener<DownloadProgress>('nm:update-progress'),
  onUpdateDownloaded: createListener<{ filePath: string; version: string }>('nm:update-downloaded')
}

// In Tauri environment (or webview), populate window.nm with Tauri API if not already provided
if (typeof window !== 'undefined' && (!window.nm || isTauri())) {
  window.nm = tauriApi as unknown as typeof window.nm
}

