import { getPlatformProvider } from './platform'
import { renameWlanProfile as winRenameWlanProfile, getWlanProfiles as winGetWlanProfiles } from './platform/windows'

export * from './platform/types'

export function getCurrentConnection() {
  return getPlatformProvider().getCurrentConnection()
}

export function getNetworks(backup: Record<string, string>) {
  return getPlatformProvider().getNetworks(backup)
}

export function getNetworkDetails(guidOrName: string) {
  return getPlatformProvider().getNetworkDetails(guidOrName)
}

export function renameNetwork(guid: string, newName: string, currentDisplayName?: string) {
  return getPlatformProvider().renameNetwork(guid, newName, currentDisplayName)
}

export function reconnectNetwork(profileName?: string) {
  return getPlatformProvider().reconnectNetwork(profileName)
}

export function renameWlanProfile(oldProfile: string, newProfile: string) {
  return winRenameWlanProfile(oldProfile, newProfile)
}

export function getWlanProfiles() {
  return winGetWlanProfiles()
}
