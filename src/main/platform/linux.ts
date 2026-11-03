import { exec, execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import type { Network, Connection, NetworkDetails, NetworkPlatformProvider } from './types'

function run(cmd: string, timeout = 3000): string {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout }).toString()
  } catch {
    return ''
  }
}

export function getCurrentConnection(): Connection | null {
  const out = run('nmcli -t -f ACTIVE,SSID,SIGNAL,SECURITY,CHAN device wifi')
  const lines = out.split('\n')
  for (const line of lines) {
    if (line.startsWith('yes:')) {
      const parts = line.split(':')
      const ssid = parts[1] || 'Wi-Fi'
      const signal = parseInt(parts[2], 10) || 80
      return {
        ssid,
        profile: ssid,
        signal,
        band: '2.4 / 5 GHz',
        name: ssid
      }
    }
  }

  // Fallback to active connection ID
  const connOut = run('nmcli -t -f NAME,TYPE,STATE connection show --active')
  const connLines = connOut.split('\n')
  for (const line of connLines) {
    const [name, type] = line.split(':')
    if (type && (type.includes('wireless') || type.includes('ethernet'))) {
      return {
        ssid: name,
        profile: name,
        signal: 100,
        band: type.includes('wireless') ? 'Wi-Fi' : 'Ethernet',
        name
      }
    }
  }

  return null
}

export function getNetworks(backup: Record<string, string>): Network[] {
  const nets: Network[] = []
  const conn = getCurrentConnection()

  const out = run('nmcli -t -f UUID,NAME,TYPE connection show')
  const lines = out.split('\n').filter(Boolean)

  for (const line of lines) {
    const [uuid, name, type] = line.split(':')
    if (!uuid || !name) continue

    const isWifi = type && (type.includes('wireless') || type.includes('802-11-wireless'))
    const isEth = type && (type.includes('ethernet') || type.includes('802-3-ethernet'))
    if (!isWifi && !isEth) continue

    const original = backup[uuid] || backup[name] || name
    const isLive = conn ? (conn.name === name || conn.ssid === name || conn.name === original) : false

    nets.push({
      guid: uuid,
      name,
      originalName: original,
      renamed: original !== name,
      live: isLive,
      type: isWifi ? 'wifi' : 'ethernet'
    })
  }

  return nets.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

export function getNetworkDetails(guidOrName: string): NetworkDetails {
  const conn = getCurrentConnection()
  const isCurrent = conn && (conn.ssid === guidOrName || conn.name === guidOrName)

  return {
    guid: guidOrName,
    bssid: isCurrent ? 'Active Interface' : 'Saved Network',
    channel: 6,
    auth: 'WPA2-PSK',
    band: 'Wi-Fi',
    frequency: 'Auto',
    lastConnected: isCurrent ? 'Active now' : 'Configured'
  }
}

export async function renameNetwork(guid: string, newName: string): Promise<void> {
  try {
    run(`nmcli connection modify "${guid.replace(/"/g, '\\"')}" connection.id "${newName.replace(/"/g, '\\"')}"`)
  } catch {}
}

export async function reconnectNetwork(profileName?: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (profileName) {
        run(`nmcli connection down "${profileName.replace(/"/g, '\\"')}"`)
        setTimeout(() => {
          run(`nmcli connection up "${profileName.replace(/"/g, '\\"')}"`)
          resolve(true)
        }, 800)
      } else {
        run('nmcli networking off')
        setTimeout(() => {
          run('nmcli networking on')
          resolve(true)
        }, 1000)
      }
    } catch {
      resolve(false)
    }
  })
}

export function getRawNetworkBytesLinux(): Promise<{ received: number; sent: number }> {
  return new Promise((resolve, reject) => {
    try {
      if (existsSync('/proc/net/dev')) {
        const data = readFileSync('/proc/net/dev', 'utf8')
        const lines = data.split('\n')
        let totalRx = 0
        let totalTx = 0
        for (const line of lines) {
          if (line.includes(':') && !line.includes('lo:')) {
            const parts = line.split(':')[1].trim().split(/\s+/)
            const rx = parseInt(parts[0], 10)
            const tx = parseInt(parts[8], 10)
            if (!isNaN(rx)) totalRx += rx
            if (!isNaN(tx)) totalTx += tx
          }
        }
        return resolve({ received: totalRx, sent: totalTx })
      }
      reject(new Error('No /proc/net/dev found'))
    } catch (err) {
      reject(err)
    }
  })
}

export const linuxProvider: NetworkPlatformProvider = {
  getNetworks,
  getCurrentConnection,
  getNetworkDetails,
  renameNetwork,
  reconnectNetwork,
  getRawNetworkBytes: getRawNetworkBytesLinux
}
