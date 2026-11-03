import net from 'net'
import { execFile } from 'child_process'
import { performance } from 'perf_hooks'

export interface PingTelemetry {
  gatewayIp: string | null
  gatewayMs: number | null
  internetMs: number | null
  jitterMs: number | null
  timestamp: number
}

let cachedGatewayIp: string | null = null
let lastGatewayLookup = 0
const recentLatencies: number[] = []

/**
 * Discovers default gateway IP using fast route table lookup (<10ms).
 */
export function getGatewayIp(): Promise<string | null> {
  const now = Date.now()
  if (cachedGatewayIp && now - lastGatewayLookup < 30_000) {
    return Promise.resolve(cachedGatewayIp)
  }

  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile('route.exe', ['print', '0.0.0.0'], { windowsHide: true, timeout: 2500 }, (err, stdout) => {
        if (!err && stdout) {
          const m = /0\.0\.0\.0\s+0\.0\.0\.0\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/m.exec(stdout)
          if (m && m[1] && m[1] !== '0.0.0.0') {
            cachedGatewayIp = m[1].trim()
            lastGatewayLookup = now
            return resolve(cachedGatewayIp)
          }
        }
        resolve(cachedGatewayIp)
      })
    } else {
      execFile('netstat', ['-rn'], { timeout: 2500 }, (err, stdout) => {
        if (!err && stdout) {
          const m = /default\s+([0-9.]+)/m.exec(stdout) || /0\.0\.0\.0\s+([0-9.]+)/m.exec(stdout)
          if (m && m[1]) {
            cachedGatewayIp = m[1].trim()
            lastGatewayLookup = now
            return resolve(cachedGatewayIp)
          }
        }
        resolve(cachedGatewayIp)
      })
    }
  })
}

function probeTcpLatency(host: string, port = 53, timeoutMs = 1200): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now()
    const socket = net.createConnection({ host, port, timeout: timeoutMs })

    let resolved = false
    const cleanup = () => {
      socket.removeAllListeners()
      socket.destroy()
    }

    socket.on('connect', () => {
      if (!resolved) {
        resolved = true
        const elapsed = performance.now() - start
        cleanup()
        resolve(Math.round(elapsed))
      }
    })

    socket.on('timeout', () => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(null)
      }
    })

    socket.on('error', (err: any) => {
      if (!resolved) {
        resolved = true
        const elapsed = performance.now() - start
        cleanup()
        if (err && err.code === 'ECONNREFUSED') {
          resolve(Math.round(elapsed))
        } else {
          resolve(null)
        }
      }
    })
  })
}

function probeIcmpPing(host: string, timeoutMs = 1200): Promise<number | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'ping.exe' : 'ping'
    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.ceil(timeoutMs / 1000)), host]

    execFile(cmd, args, { windowsHide: true, timeout: timeoutMs + 500 }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const m = /(?:time[=<]|Average = )([0-9]+)\s*ms/i.exec(stdout)
      if (m && m[1]) {
        resolve(parseInt(m[1], 10))
      } else {
        resolve(null)
      }
    })
  })
}

async function probeTarget(host: string, port = 53): Promise<number | null> {
  // First attempt fast TCP SYN-ACK probe (zero child process churn)
  const tcpMs = await probeTcpLatency(host, port, 1000)
  if (tcpMs !== null) return tcpMs

  // Fallback to ICMP ping
  return probeIcmpPing(host, 1200)
}

function computeJitter(samples: number[]): number | null {
  if (samples.length < 2) return null
  let diffSum = 0
  for (let i = 1; i < samples.length; i++) {
    diffSum += Math.abs(samples[i] - samples[i - 1])
  }
  const jitter = diffSum / (samples.length - 1)
  return Math.round(jitter * 10) / 10
}

let isProbing = false
let lastTelemetry: PingTelemetry = {
  gatewayIp: null,
  gatewayMs: null,
  internetMs: null,
  jitterMs: null,
  timestamp: Date.now()
}

export async function getPingTelemetry(): Promise<PingTelemetry> {
  if (isProbing) return lastTelemetry
  isProbing = true

  try {
    const gatewayIp = await getGatewayIp()

    // Parallel probes: Gateway hop and Global Internet edge (1.1.1.1)
    const [gatewayMs, internetMs] = await Promise.all([
      gatewayIp ? (probeTcpLatency(gatewayIp, 80, 800).then(res => res !== null ? res : probeTarget(gatewayIp, 53))) : Promise.resolve(null),
      probeTarget('1.1.1.1', 53)
    ])

    if (internetMs !== null && internetMs > 0) {
      recentLatencies.push(internetMs)
      if (recentLatencies.length > 10) {
        recentLatencies.shift()
      }
    }

    const jitterMs = internetMs !== null ? computeJitter(recentLatencies) : null

    lastTelemetry = {
      gatewayIp,
      gatewayMs,
      internetMs,
      jitterMs,
      timestamp: Date.now()
    }
  } catch {
  } finally {
    isProbing = false
  }

  return lastTelemetry
}

