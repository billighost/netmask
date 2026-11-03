import { exec, execSync } from 'child_process'
import type { Network, Connection, NetworkDetails, NetworkPlatformProvider } from './types'

function run(cmd: string, timeout = 3000): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout }).toString()
  } catch {
    return ''
  }
}

function getActiveWifiInterface(): string {
  const out = run('networksetup -listallhardwareports')
  const m = /Hardware Port:\s*Wi-Fi\s+Device:\s*([a-zA-Z0-9]+)/i.exec(out)
  return m ? m[1].trim() : 'en0'
}

interface DarwinAirportInfo {
  bssid?: string
  rssi?: number
  noise?: number
  channel?: number
  lastTxRate?: number
  maxRate?: number
  phyMode?: string
  ssid?: string
}

function getAirportInfo(): DarwinAirportInfo | null {
  const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
  const out = run(`${airportPath} -I`)
  if (!out || !out.includes('agrCtlRSSI')) return null

  const rssiM = /agrCtlRSSI:\s*(-?\d+)/.exec(out)
  const noiseM = /agrCtlNoise:\s*(-?\d+)/.exec(out)
  const bssidM = /BSSID:\s*([0-9a-fA-F:]+)/.exec(out)
  const chanM = /channel:\s*(\d+)/.exec(out)
  const txM = /lastTxRate:\s*(\d+)/.exec(out)
  const maxM = /maxRate:\s*(\d+)/.exec(out)
  const ssidM = /^\s*SSID:\s*(.+)$/m.exec(out)
  const phyM = /PHY Mode:\s*(.+)$/m.exec(out)

  return {
    rssi: rssiM ? parseInt(rssiM[1], 10) : undefined,
    noise: noiseM ? parseInt(noiseM[1], 10) : undefined,
    bssid: bssidM ? bssidM[1].trim() : undefined,
    channel: chanM ? parseInt(chanM[1], 10) : undefined,
    lastTxRate: txM ? parseFloat(txM[1]) : undefined,
    maxRate: maxM ? parseFloat(maxM[1]) : undefined,
    ssid: ssidM ? ssidM[1].trim() : undefined,
    phyMode: phyM ? phyM[1].trim() : undefined
  }
}

function getDarwinProfileInfo(): DarwinAirportInfo | null {
  const info = getAirportInfo()
  if (info) return info

  try {
    const out = run('system_profiler SPAirPortDataType', 3000)
    if (!out) return null

    const bssidM = /BSSID:\s*([0-9a-fA-F:]+)/i.exec(out)
    const chanM = /Channel:\s*(\d+)/i.exec(out)
    const rssiM = /Signal \/ Noise:\s*(-?\d+)\s*dBm\s*\/\s*(-?\d+)\s*dBm/i.exec(out)
    const rateM = /Transmit Rate:\s*(\d+)/i.exec(out)
    const phyM = /PHY Mode:\s*(.+)$/m.exec(out)
    const ssidM = /Current Network Information:\s*\n\s*([^:]+):/i.exec(out)

    return {
      bssid: bssidM ? bssidM[1].trim() : undefined,
      channel: chanM ? parseInt(chanM[1], 10) : undefined,
      rssi: rssiM ? parseInt(rssiM[1], 10) : undefined,
      noise: rssiM ? parseInt(rssiM[2], 10) : undefined,
      lastTxRate: rateM ? parseFloat(rateM[1]) : undefined,
      maxRate: rateM ? parseFloat(rateM[1]) : undefined,
      phyMode: phyM ? phyM[1].trim() : undefined,
      ssid: ssidM ? ssidM[1].trim() : undefined
    }
  } catch {
    return null
  }
}

export function getCurrentConnection(): Connection | null {
  const ap = getDarwinProfileInfo()
  const iface = getActiveWifiInterface()
  const out = run(`networksetup -getairportnetwork ${iface}`)
  const m = /Current Wi-Fi Network:\s*(.+)$/m.exec(out)
  const ssid = ap?.ssid || (m ? m[1].trim() : null)
  if (!ssid) return null

  const signalDbm = ap?.rssi ?? -55
  const noiseDbm = ap?.noise ?? -92
  const snr = ap?.rssi && ap?.noise ? Math.max(0, ap.rssi - ap.noise) : Math.max(0, signalDbm + 95)
  const signal = Math.min(100, Math.max(0, Math.round((signalDbm + 100) * 2)))
  const channel = ap?.channel ?? 36
  const band = channel > 14 ? '5 GHz' : '2.4 GHz'
  const generation = ap?.phyMode?.includes('ax') ? 'Wi-Fi 6' : ap?.phyMode?.includes('ac') ? 'Wi-Fi 5' : channel > 14 ? 'Wi-Fi 5' : 'Wi-Fi 4'

  return {
    ssid,
    profile: ssid,
    signal,
    signalDbm,
    snr,
    channel,
    frequency: channel > 14 ? `5.${channel} GHz (Ch ${channel})` : `2.4 GHz (Ch ${channel})`,
    band,
    generation,
    bssid: ap?.bssid,
    name: ssid,
    rxRateMbps: ap?.lastTxRate,
    txRateMbps: ap?.maxRate
  }
}

export function getNetworks(backup: Record<string, string>): Network[] {
  const nets: Network[] = []
  const conn = getCurrentConnection()
  const iface = getActiveWifiInterface()

  const out = run(`networksetup -listpreferredwirelessnetworks ${iface}`)
  const lines = out.split('\n').map(l => l.trim()).filter(l => l && !l.toLowerCase().includes('preferred networks'))

  for (const name of lines) {
    const original = backup[name] || name
    const isLive = conn ? (conn.ssid === name || conn.ssid === original) : false
    nets.push({
      guid: name,
      name,
      originalName: original,
      renamed: original !== name,
      live: isLive,
      type: 'wifi'
    })
  }

  // Also include active connection if not listed
  if (conn && !nets.some(n => n.name === conn.name)) {
    nets.unshift({
      guid: conn.name,
      name: conn.name,
      originalName: backup[conn.name] || conn.name,
      renamed: (backup[conn.name] || conn.name) !== conn.name,
      live: true,
      type: 'wifi'
    })
  }

  return nets.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

export function getNetworkDetails(guidOrName: string): NetworkDetails {
  const conn = getCurrentConnection()
  const isCurrent = conn && (conn.ssid === guidOrName || conn.name === guidOrName)

  return {
    guid: guidOrName,
    bssid: isCurrent && conn?.bssid ? conn.bssid : (isCurrent ? 'Active Interface' : 'Saved Profile'),
    channel: isCurrent && conn?.channel ? conn.channel : 36,
    auth: 'WPA2/WPA3 Personal',
    band: isCurrent && conn?.band ? conn.band : '5 GHz',
    frequency: isCurrent && conn?.frequency ? conn.frequency : '5.0 GHz',
    generation: isCurrent ? conn?.generation : undefined,
    signalDbm: isCurrent ? conn?.signalDbm : undefined,
    snr: isCurrent ? conn?.snr : undefined,
    rxRateMbps: isCurrent ? conn?.rxRateMbps : undefined,
    txRateMbps: isCurrent ? conn?.txRateMbps : undefined,
    lastConnected: isCurrent ? 'Active now' : 'Previously connected'
  }
}

export async function renameNetwork(guid: string, newName: string): Promise<void> {
  // On macOS, network service labels or preferred aliases are managed via networksetup
  try {
    const iface = getActiveWifiInterface()
    // Re-add network with preferred alias
    run(`networksetup -removepreferredwirelessnetwork ${iface} "${guid.replace(/"/g, '\\"')}"`)
    run(`networksetup -addpreferredwirelessnetworkatindex ${iface} "${newName.replace(/"/g, '\\"')}" 0 OPEN`)
  } catch {}
}

export async function reconnectNetwork(profileName?: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const iface = getActiveWifiInterface()
      run(`networksetup -setairportpower ${iface} off`)
      setTimeout(() => {
        run(`networksetup -setairportpower ${iface} on`)
        if (profileName) {
          run(`networksetup -setairportnetwork ${iface} "${profileName.replace(/"/g, '\\"')}"`)
        }
        resolve(true)
      }, 1000)
    } catch {
      resolve(false)
    }
  })
}

export function getRawNetworkBytesDarwin(): Promise<{ received: number; sent: number }> {
  return new Promise((resolve, reject) => {
    exec('netstat -ib', { timeout: 1500 }, (err, stdout) => {
      if (err) return reject(err)
      const lines = stdout.split('\n')
      let totalRx = 0
      let totalTx = 0
      for (const line of lines) {
        if (/Link#/i.test(line)) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 10) {
            const rx = parseInt(parts[6], 10)
            const tx = parseInt(parts[9], 10)
            if (!isNaN(rx)) totalRx += rx
            if (!isNaN(tx)) totalTx += tx
          }
        }
      }
      if (totalRx > 0 || totalTx > 0) {
        return resolve({ received: totalRx, sent: totalTx })
      }
      reject(new Error('No bytes found in netstat output'))
    })
  })
}

export const darwinProvider: NetworkPlatformProvider = {
  getNetworks,
  getCurrentConnection,
  getNetworkDetails,
  renameNetwork,
  reconnectNetwork,
  getRawNetworkBytes: getRawNetworkBytesDarwin
}
