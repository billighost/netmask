import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  Network, Connection, NetworkDetails, StreamerStatus, SpeedSample, SpeedTestResult,
  UpdateInfo, DownloadProgress, UpdateStatus, AppSettings, ElevationStatus,
  DeviceIdentity, DnsResolverResult, RoamingSettings, PingTelemetry, WifiQrData,
  CaptivePortalStatus, PlatformCapabilities, NetworkSnapshot, DiagnosticReport, RecoveryAudit, NameConflict,
  UiSession, HistoryRange, HistorySeries, UsageReport, WeeklyDigest, ContextPrompt, NetworkAlert,
  NetworkPreset, PresetPreview, PresetApplication, GoingLiveResult, EvidenceReportData
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
  getCapabilities: (): Promise<PlatformCapabilities> => invoke('nm_get_capabilities'),
  setupSilentElevation: (): Promise<{ success: boolean; message?: string }> => invoke('nm_setup_silent_elevation'),
  removeSilentElevation: (): Promise<{ success: boolean; message?: string }> => invoke('nm_remove_silent_elevation'),

  // This computer's active adapter identity and privacy controls.
  getDeviceIdentity: (): Promise<DeviceIdentity> => invoke('nm_get_device_identity'),
  setMacRandomization: (profileName: string, mode: 'yes' | 'no' | 'daily'): Promise<boolean> =>
    invoke('nm_set_mac_randomization', { profileName, mode }),
  setNetbiosSilencer: (enableSilence: boolean): Promise<boolean> =>
    invoke('nm_set_netbios_silencer', { enableSilence }),

  // 1-Click Fastest DNS Benchmarker & Switcher
  benchmarkDns: (): Promise<DnsResolverResult[]> => invoke('nm_benchmark_dns'),
  getCurrentDns: (interfaceName?: string): Promise<{ primary: string; secondary?: string; isDhcp: boolean }> =>
    invoke('nm_get_current_dns', { interfaceName }),
  applyDns: (resolverId: string, configurationId?: string): Promise<boolean> => invoke('nm_apply_dns', { resolverId, configurationId }),

  // Wi-Fi Roaming & Band Steering Tuner
  getRoamingSettings: (): Promise<RoamingSettings> => invoke('nm_get_roaming_settings'),
  setRoamingSettings: (params: { preferredBand?: string; roamingAggressiveness?: string }): Promise<boolean> =>
    invoke('nm_set_roaming_settings', { params }),

  // Real-Time Gateway & Internet Latency / Jitter Monitor
  getPingTelemetry: (): Promise<PingTelemetry> => invoke('nm_get_ping_telemetry'),
  onPingTelemetry: createListener<PingTelemetry>('nm:ping-telemetry'),

  // Wi-Fi QR codes contain credentials; sharing requires an explicit user action.
  getWifiQr: (profileName: string): Promise<WifiQrData> => invoke('nm_get_wifi_qr', { profileName }),

  // Captive Portal Detection
  checkCaptivePortal: (): Promise<CaptivePortalStatus> => invoke('nm_check_captive_portal'),
  openExternal: (url: string): Promise<void> => invoke('nm_open_external', { url }),
  onCaptivePortalStatus: createListener<CaptivePortalStatus>('nm:captive-portal-status'),
  onNetworkChanged: createListener<void>('nm:network-changed'),

  getUiSession: (): Promise<UiSession> => invoke('nm_get_ui_session'),
  saveUiSession: (session: UiSession): Promise<void> => invoke('nm_save_ui_session', { session }),

  getConnectionHistory: (range: HistoryRange, networkGuid?: string): Promise<HistorySeries> =>
    invoke('nm_get_connection_history', { range, networkGuid }),
  getNetworkUsage: (): Promise<UsageReport> => invoke('nm_get_network_usage'),
  setNetworkUsageLimit: (networkGuid: string, limitBytes: number | null): Promise<void> =>
    invoke('nm_set_network_usage_limit', { networkGuid, limitBytes }),
  getWeeklyDigest: (): Promise<WeeklyDigest> => invoke('nm_get_weekly_digest'),
  deleteMonitoringData: (): Promise<void> => invoke('nm_delete_monitoring_data'),

  getContextPrompt: (): Promise<ContextPrompt | null> => invoke('nm_get_context_prompt'),
  respondContextPrompt: (promptId: string, response: 'accept' | 'dismiss' | 'disable'): Promise<void> =>
    invoke('nm_respond_context_prompt', { promptId, response }),
  getNetworkAlert: (): Promise<NetworkAlert | null> => invoke('nm_get_network_alert'),
  dismissNetworkAlert: (alertId: string): Promise<void> => invoke('nm_dismiss_network_alert', { alertId }),
  onContextPrompt: createListener<ContextPrompt>('nm:context-prompt'),
  onNetworkAlert: createListener<NetworkAlert>('nm:network-alert'),

  getNetworkPreset: (networkGuid: string): Promise<NetworkPreset> => invoke('nm_get_network_preset', { networkGuid }),
  getPendingPresetUndo: (): Promise<PresetApplication | null> => invoke('nm_get_pending_preset_undo'),
  previewNetworkPreset: (preset: NetworkPreset): Promise<PresetPreview> => invoke('nm_preview_network_preset', { preset }),
  saveNetworkPreset: (preset: NetworkPreset): Promise<void> => invoke('nm_save_network_preset', { preset }),
  applyNetworkPreset: (networkGuid: string): Promise<PresetApplication> => invoke('nm_apply_network_preset', { networkGuid }),
  undoNetworkPreset: (undoToken: string): Promise<void> => invoke('nm_undo_network_preset', { undoToken }),
  onPresetApplied: createListener<PresetApplication>('nm:preset-applied'),

  runGoingLive: (): Promise<GoingLiveResult> => invoke('nm_run_going_live'),
  getEvidenceReport: (range: HistoryRange, networkGuid?: string): Promise<EvidenceReportData> =>
    invoke('nm_get_evidence_report', { range, networkGuid }),

  getNetworks: (): Promise<Network[]> => invoke('nm_get_networks'),
  getNetworkSnapshot: (): Promise<NetworkSnapshot> => invoke('nm_get_network_snapshot'),
  getConnection: (): Promise<Connection | null> => invoke('nm_get_connection'),
  getDetails: (guid: string): Promise<NetworkDetails> => invoke('nm_get_details', { guid }),

  rename: (guid: string, newName: string, currentName?: string): Promise<void> =>
    invoke('nm_rename', { guid, newName, currentName }),
  getNameConflict: (guid: string, newName: string, currentName?: string): Promise<NameConflict | null> =>
    invoke('nm_get_name_conflict', { guid, newName, currentName }),
  repairNameConflict: (guid: string, newName: string, currentName?: string): Promise<void> =>
    invoke('nm_repair_name_conflict', { guid, newName, currentName }),
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

  minimize: (): Promise<void> => invoke('nm_minimize'),
  maximize: (): Promise<boolean> => invoke('nm_maximize'),
  isMaximized: (): Promise<boolean> => invoke('nm_is_maximized'),
  close: (): Promise<void> => invoke('nm_close'),

  trimMemory: (): Promise<void> => invoke('nm_trim_memory'),

  getStreamerStatus: (): Promise<StreamerStatus> => invoke('nm_get_streamer_status'),
  getDiagnosticReport: (): Promise<DiagnosticReport> => invoke('nm_get_diagnostic_report'),
  getRecoveryAudit: (): Promise<RecoveryAudit | null> => invoke('nm_get_recovery_audit'),
  dismissRecoveryAudit: (): Promise<void> => invoke('nm_dismiss_recovery_audit'),
  toggleStreamerCloak: (): Promise<StreamerStatus> => invoke('nm_toggle_streamer_cloak'),
  startStreamerTimer: (minutes: number): Promise<StreamerStatus> => invoke('nm_start_streamer_timer', { minutes }),
  onStreamerStatus: createListener<StreamerStatus>('nm:streamer-status'),

  onMaximizeChange: createListener<boolean>('nm:maximize-change'),
  onVisibility: createListener<boolean>('nm:visibility'),
  onTrayConnectionCheck: createListener<void>('nm:tray-connection-check'),
  rendererReady: (): Promise<'connection-check' | 'going-live' | null> => invoke('nm_renderer_ready'),
  onUiIntent: createListener<'connection-check' | 'going-live'>('nm:ui-intent'),
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

if (typeof window !== 'undefined') window.nm = tauriApi

