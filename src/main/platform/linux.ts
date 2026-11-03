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
  const out = run('nmcli -t -f ACTIVE,SSID,BSSID,SIGNAL,SECURITY,CHAN,FREQ,RATE device wifi')
  const lines = out.split('\n')
  for (const line of lines) {
    if (line.startsWith('yes:')) {
      // Split on colon taking into account escaped colons if any, or fields
      // nmcli -t format with 8 fields: ACTIVE:SSID:BSSID:SIGNAL:SECURITY:CHAN:FREQ:RATE
      const parts = line.split(/(?<!\\):/)
      const ssid = parts[1]?.replace(/\\:/g, ':') || 'Wi-Fi'
      const bssid = parts[2]?.replace(/\\:/g, ':') || undefined
      const signal = parseInt(parts[3], 10) || 80
      const chan = parseInt(parts[5], 10) || 6
      const freqStr = parts[6] || ''
      const rateStr = parts[7] || ''
      const rateMbps = parseFloat(rateStr) || undefined

      const signalDbm = Math.round(signal / 2 - 100)
      const snr = Math.max(0, signalDbm + 95)
      const is5G = chan > 14 || freqStr.includes('5') || freqStr.includes('51') || freqStr.includes('52') || freqStr.includes('58')
      const band = is5G ? '5 GHz' : '2.4 GHz'
      const generation = (rateMbps && rateMbps > 600) ? 'Wi-Fi 6' : is5G ? 'Wi-Fi 5' : 'Wi-Fi 4'

      return {
        ssid,
        profile: ssid,
        signal,
        signalDbm,
        snr,
        channel: chan,
        frequency: freqStr ? `${freqStr} (Ch ${chan})` : `${band} (Ch ${chan})`,
        band,
        generation,
        bssid,
        name: ssid,
        rxRateMbps: rateMbps,
        txRateMbps: rateMbps
      }
    }
  }

  // Fallback to active connection ID
  const connOut = run('nmcli -t -f NAME,TYPE,STATE connection show --active')
  const connLines = connOut.split('\n')
  for (const line of connLines) {
    const [name, type] = line.split(':')
    if (type && (type.includes('wireless') || type.includes('ethernet'))) {
      const isWifi = type.includes('wireless')
      return {
        ssid: name,
        profile: name,
        signal: 100,
        signalDbm: -50,
        snr: 45,
        channel: isWifi ? 6 : undefined,
        frequency: isWifi ? '2.4 GHz (Ch 6)' : undefined,
        band: isWifi ? 'Wi-Fi' : 'Ethernet',
        generation: isWifi ? 'Wi-Fi 5' : undefined,
        name
      }
    }
  }
  // Fallback to iw / iwconfig on distros without NetworkManager (e.g. systemd-networkd, minimal server)
  try {
    const iwOut = run('iw dev')
    const ifaceM = /Interface\s+([a-zA-Z0-9]+)/.exec(iwOut)
    if (ifaceM) {
      const iface = ifaceM[1]
      const linkOut = run(`iw dev ${iface} link`)
      const ssidM = /SSID:\s*(.+)$/m.exec(linkOut)
      const bssidM = /Connected to\s+([0-9a-fA-F:]{17})/i.exec(linkOut)
      const sigM = /signal:\s*(-?\d+)\s*dBm/i.exec(linkOut)
      const freqM = /freq:\s*(\d+)/i.exec(linkOut)
      const txM = /tx bitrate:\s*([\d.]+)\s*MBit/i.exec(linkOut)

      if (ssidM) {
        const ssid = ssidM[1].trim()
        const signalDbm = sigM ? parseInt(sigM[1], 10) : -55
        const snr = Math.max(0, signalDbm + 95)
        const signal = Math.min(100, Math.max(0, Math.round((signalDbm + 100) * 2)))
        const freqMhz = freqM ? parseInt(freqM[1], 10) : 5180
        const is5G = freqMhz > 3000
        const chan = is5G ? Math.round((freqMhz - 5000) / 5) : Math.round((freqMhz - 2407) / 5)
        const rateMbps = txM ? parseFloat(txM[1]) : undefined

        return {
          ssid,
          profile: ssid,
          signal,
          signalDbm,
          snr,
          channel: chan,
          frequency: `${(freqMhz / 1000).toFixed(3)} GHz (Ch ${chan})`,
          band: is5G ? '5 GHz' : '2.4 GHz',
          generation: (rateMbps && rateMbps > 600) ? 'Wi-Fi 6' : is5G ? 'Wi-Fi 5' : 'Wi-Fi 4',
          bssid: bssidM ? bssidM[1].trim() : undefined,
          name: ssid,
          rxRateMbps: rateMbps,
          txRateMbps: rateMbps
        }
      }
    }
  } catch {}

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
    bssid: isCurrent && conn?.bssid ? conn.bssid : (isCurrent ? 'Active Interface' : 'Saved Network'),
    channel: isCurrent && conn?.channel ? conn.channel : 6,
    auth: 'WPA2-PSK',
    band: isCurrent && conn?.band ? conn.band : 'Wi-Fi',
    frequency: isCurrent && conn?.frequency ? conn.frequency : 'Auto',
    generation: isCurrent ? conn?.generation : undefined,
    signalDbm: isCurrent ? conn?.signalDbm : undefined,
    snr: isCurrent ? conn?.snr : undefined,
    rxRateMbps: isCurrent ? conn?.rxRateMbps : undefined,
    txRateMbps: isCurrent ? conn?.txRateMbps : undefined,
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
