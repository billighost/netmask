import dns from 'dns'
import { performance } from 'perf_hooks'
import { execFileSync, execSync } from 'child_process'
import { runElevatedCommand, isAdmin } from './admin'
import { getDeviceIdentity } from './privacy'

export interface DnsPreset {
  id: string
  name: string
  provider: string
  primary: string
  secondary?: string
  description: string
  isDhcp?: boolean
}

export interface DnsResolverResult extends DnsPreset {
  latencyMs: number | null
  isCurrent: boolean
  isFastest?: boolean
}

export const DNS_PRESETS: DnsPreset[] = [
  {
    id: 'cloudflare',
    name: 'Cloudflare DNS',
    provider: 'Cloudflare 1.1.1.1',
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    description: 'Fastest global resolution with privacy-first zero-logging'
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    provider: 'Google 8.8.8.8',
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    description: 'Global infrastructure with high reliability and low latency'
  },
  {
    id: 'quad9',
    name: 'Quad9 Security DNS',
    provider: 'Quad9 9.9.9.9',
    primary: '9.9.9.9',
    secondary: '149.112.112.112',
    description: 'Automated threat blocking against malware and phishing'
  },
  {
    id: 'adguard',
    name: 'AdGuard Default DNS',
    provider: 'AdGuard 94.140.14.14',
    primary: '94.140.14.14',
    secondary: '94.140.14.15',
    description: 'Blocks intrusive banner ads, trackers, and malicious domains'
  },
  {
    id: 'dhcp',
    name: 'Automatic (DHCP)',
    provider: 'Router / ISP Default',
    primary: 'Automatic',
    isDhcp: true,
    description: 'Default DNS assigned by local router DHCP server'
  }
]

async function measureResolverLatency(ip: string, testDomains = ['google.com', 'cloudflare.com']): Promise<number | null> {
  const resolver = new dns.Resolver()
  try {
    resolver.setServers([ip])
  } catch {
    return null
  }

  const times: number[] = []
  for (const domain of testDomains) {
    const start = performance.now()
    try {
      await new Promise<string[]>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout')), 2500)
        resolver.resolve4(domain, (err, addrs) => {
          clearTimeout(timeout)
          if (err) reject(err)
          else resolve(addrs)
        })
      })
      times.push(performance.now() - start)
    } catch {}
  }

  if (times.length === 0) return null
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

export async function getCurrentDns(interfaceName = 'Wi-Fi'): Promise<{ primary: string; secondary?: string; isDhcp: boolean }> {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('netsh', ['interface', 'ip', 'show', 'dns', `name=${interfaceName}`], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 4000
      })

      const isDhcp = out.includes('DHCP')
      const ips = [...out.matchAll(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g)].map(m => m[0])

      return {
        primary: ips[0] || 'Automatic',
        secondary: ips[1],
        isDhcp
      }
    } catch {
      return { primary: 'Automatic', isDhcp: true }
    }
  }

  return { primary: 'Automatic', isDhcp: true }
}

export async function benchmarkDns(): Promise<DnsResolverResult[]> {
  const identity = await getDeviceIdentity().catch(() => ({ interfaceName: 'Wi-Fi' }))
  const current = await getCurrentDns(identity.interfaceName || 'Wi-Fi')

  const results: DnsResolverResult[] = await Promise.all(
    DNS_PRESETS.map(async (preset) => {
      let isCurrent = false
      if (preset.isDhcp) {
        isCurrent = current.isDhcp
      } else {
        isCurrent = !current.isDhcp && current.primary === preset.primary
      }

      if (preset.isDhcp) {
        // Benchmark current DHCP DNS
        let dhcpLatency: number | null = null
        if (current.primary && current.primary !== 'Automatic') {
          dhcpLatency = await measureResolverLatency(current.primary)
        }
        return {
          ...preset,
          latencyMs: dhcpLatency,
          isCurrent
        }
      }

      const latencyMs = await measureResolverLatency(preset.primary)
      return {
        ...preset,
        latencyMs,
        isCurrent
      }
    })
  )

  // Find lowest latency among valid non-null results
  let minLatency = Infinity
  let fastestId: string | null = null
  for (const r of results) {
    if (r.latencyMs !== null && r.latencyMs < minLatency) {
      minLatency = r.latencyMs
      fastestId = r.id
    }
  }

  return results.map(r => ({
    ...r,
    isFastest: r.id === fastestId
  }))
}

export async function applyDns(resolverId: string): Promise<boolean> {
  const preset = DNS_PRESETS.find(p => p.id === resolverId)
  if (!preset) throw new Error(`Unknown DNS preset: ${resolverId}`)

  const identity = await getDeviceIdentity().catch(() => ({ interfaceName: 'Wi-Fi' }))
  const interfaceName = identity.interfaceName || 'Wi-Fi'

  if (process.platform === 'win32') {
    let script = ''
    if (preset.isDhcp) {
      script = `netsh interface ip set dns name="${interfaceName}" dhcp`
    } else {
      script = `netsh interface ip set dns name="${interfaceName}" static ${preset.primary} validate=no`
      if (preset.secondary) {
        script += ` ; netsh interface ip add dns name="${interfaceName}" ${preset.secondary} index=2 validate=no`
      }
    }

    const res = await runElevatedCommand(script)
    return res.success
  } else if (process.platform === 'darwin') {
    const script = preset.isDhcp
      ? `networksetup -setdnsservers "${interfaceName}" empty`
      : `networksetup -setdnsservers "${interfaceName}" ${preset.primary} ${preset.secondary || ''}`
    const res = await runElevatedCommand(script)
    return res.success
  } else {
    // Linux
    const script = preset.isDhcp
      ? `resolvectl revert "${interfaceName}"`
      : `resolvectl dns "${interfaceName}" ${preset.primary} ${preset.secondary || ''}`
    const res = await runElevatedCommand(script)
    return res.success
  }
}

