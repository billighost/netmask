import type { Network, AppSettings, Connection } from './types'

// Labels can change without changing the physical connection. SSID, adapter,
// and access point changes must invalidate measurements even on the same service.
export function connectionKey(connection: Connection | null): string | null {
  return connection ? JSON.stringify([connection.networkGuid ?? connection.profile, connection.ssid,
    connection.interfaceGuid ?? connection.interfaceName, connection.bssid]) : null
}

export function wiredNetworkState(networks: Network[]): { name: string; key: string } | null {
  const wired = [...new Map(networks.filter(network => network.live && network.type === 'ethernet')
    .map(network => [network.guid, network])).values()].sort((first, second) => first.guid.localeCompare(second.guid))
  return wired.length ? { name: wired.length === 1 ? wired[0].name || 'Wired connection' : 'Wired connections',
    key: JSON.stringify(['ethernet', wired.map(network => network.guid)]) } : null
}

export function snapshotConnectionKey(connection: Connection | null, networks: Network[]): string | null {
  return connectionKey(connection) ?? wiredNetworkState(networks)?.key ?? null
}

export function sameFields<T extends object>(first: T, second: T): boolean {
  const keys = Object.keys(first) as (keyof T)[]
  return keys.length === Object.keys(second).length && keys.every(key => Object.is(first[key], second[key]))
}

export function reconcileNetworks(previous: Network[], incoming: Network[]): Network[] {
  const byGuid = new Map(previous.map(network => [network.guid, network]))
  const next = incoming.map(network => {
    const old = byGuid.get(network.guid)
    return old && sameFields(old, network) ? old : network
  })
  return next.length === previous.length && next.every((network, index) => network === previous[index]) ? previous : next
}

export function visibleNetworks(networks: Network[], settings: Pick<AppSettings, 'showEthernet'>, search: string, privateNames = false): Network[] {
  const term = search.trim().toLocaleLowerCase()
  return networks.filter(network => {
    if (!settings.showEthernet && network.type === 'ethernet') return false
    if (!term) return true
    if (privateNames) return false
    return network.name.toLocaleLowerCase().includes(term) || (!privateNames && network.originalName.toLocaleLowerCase().includes(term))
  })
}

export function sharingModeActive(status: { isCloaked: boolean }, busy = false): boolean {
  return status.isCloaked || busy
}

export function displayNetworkName(network: Network, index: number, privateNames: boolean, maskName = 'Private network'): string {
  if (!privateNames) return network.name
  if (network.live) return maskName
  return network.type === 'ethernet' ? `Wired connection ${index + 1}` : `Saved Wi-Fi ${index + 1}`
}

export function nextSelection(networks: Network[], selected: string | null): string | null {
  return networks.some(network => network.guid === selected)
    ? selected : networks.find(network => network.live)?.guid ?? networks[0]?.guid ?? null
}

export function maskBssid(value?: string, mode: 'partial' | 'full' = 'partial'): string {
  if (mode === 'full' || !value || !/^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(value.trim())) return 'XX:XX:XX:XX:XX:XX'
  return `${value.trim().split(/[:-]/).slice(0, 3).join(':').toUpperCase()}:••:••:••`
}

export function errorMessage(error: unknown, fallback = 'The operation could not finish'): string {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message) return error.message
  return fallback
}
