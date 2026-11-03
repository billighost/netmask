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

export function getCurrentConnection(): Connection | null {
  const iface = getActiveWifiInterface()
  const out = run(`networksetup -getairportnetwork ${iface}`)
  const m = /Current Wi-Fi Network:\s*(.+)$/m.exec(out)
  if (!m) return null
  const ssid = m[1].trim()

  return {
    ssid,
    profile: ssid,
    signal: 90,
    band: '5 GHz',
    name: ssid
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
    bssid: isCurrent ? 'Active Interface' : 'Saved Profile',
    channel: 36,
    auth: 'WPA2/WPA3 Personal',
    band: '5 GHz',
    frequency: '5.0 GHz',
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
