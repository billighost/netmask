import type { Network, AppSettings, Connection } from './types'

// Labels can change without changing the physical connection. SSID, adapter,
// and access point changes must invalidate measurements even on the same service.
export function connectionKey(connection: Connection | null): string | null {
  return connection ? JSON.stringify([connection.networkGuid ?? connection.profile, connection.ssid,
    connection.interfaceGuid ?? connection.interfaceName, connection.bssid]) : null
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
    return network.name.toLocaleLowerCase().includes(term) || (!privateNames && network.originalName.toLocaleLowerCase().includes(term))
  })
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
