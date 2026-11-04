import type { Network, AppSettings } from './types'

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
