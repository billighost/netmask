import { exec } from 'child_process'
import https from 'https'
import { getPlatformProvider } from './platform'

export interface SpeedSample {
  downMBps: number
  upMBps: number
  downKbps: number
  upKbps: number
  instantDownMBps: number
  instantUpMBps: number
}

export interface SpeedTestResult {
  mbps: number
  mbPerSec: number
}

interface RawSample {
  received: number
  sent: number
  ts: number
}

let last: RawSample | null = null
let isSampling = false

// Exponential moving average smoothed values to eliminate sudden dropouts
let smoothedDownMBps = 0
let smoothedUpMBps = 0
let lastSample: SpeedSample = {
  downMBps: 0,
  upMBps: 0,
  downKbps: 0,
  upKbps: 0,
  instantDownMBps: 0,
  instantUpMBps: 0
}

function makeSample(downMB: number, upMB: number, instDownMB: number, instUpMB: number): SpeedSample {
  return {
    downMBps: Math.round(downMB * 1000) / 1000,
    upMBps: Math.round(upMB * 1000) / 1000,
    downKbps: Math.round(downMB * 1024),
    upKbps: Math.round(upMB * 1024),
    instantDownMBps: Math.round(instDownMB * 1000) / 1000,
    instantUpMBps: Math.round(instUpMB * 1000) / 1000
  }
}

/**
 * Fast, asynchronous network speed sampler.
 * Uses native Windows `netstat -e` (~20ms) with EMA smoothing filter and 32-bit wrap-around handling.
 * Never drops to 0 artificially due to concurrency or packet burst intervals.
 */
export function getSpeedSampleAsync(): Promise<SpeedSample> {
  return new Promise((resolve) => {
    if (isSampling) {
      // Previous sample still executing; return last smoothed reading instead of resetting to 0
      resolve(lastSample)
      return
    }

    isSampling = true
    getPlatformProvider().getRawNetworkBytes()
      .then(({ received, sent }) => {
        isSampling = false
        const current: RawSample = {
          received,
          sent,
          ts: Date.now()
        }

        if (!last) {
          last = current
          resolve(lastSample)
          return
        }

        const dt = Math.max(0.3, (current.ts - last.ts) / 1000)

        // Handle 32-bit integer wrap-around (wraps at 2^32 = 4,294,967,296 bytes)
        let downBytes = current.received - last.received
        if (downBytes < 0) {
          downBytes += 4294967296
        }

        let upBytes = current.sent - last.sent
        if (upBytes < 0) {
          upBytes += 4294967296
        }

        // Guard against abnormal interface reset spikes (> 5 GB/s)
        if (downBytes > 5 * 1024 * 1024 * 1024) downBytes = 0
        if (upBytes > 5 * 1024 * 1024 * 1024) upBytes = 0

        last = current

        // Raw instantaneous rates in MB/s
        const instantDown = (downBytes / dt) / (1024 * 1024)
        const instantUp = (upBytes / dt) / (1024 * 1024)

        // Responsive Exponential Moving Average:
        // When traffic surges, rise rapidly (alpha = 0.8) to track active transfers.
        // When traffic pauses between TCP chunks/video buffers, decay smoothly (alpha = 0.45)
        if (instantDown >= smoothedDownMBps) {
          smoothedDownMBps = 0.8 * instantDown + 0.2 * smoothedDownMBps
        } else {
          smoothedDownMBps = 0.45 * instantDown + 0.55 * smoothedDownMBps
        }

        if (instantUp >= smoothedUpMBps) {
          smoothedUpMBps = 0.8 * instantUp + 0.2 * smoothedUpMBps
        } else {
          smoothedUpMBps = 0.45 * instantUp + 0.55 * smoothedUpMBps
        }

        // True idle threshold (< 0.2 KB/s)
        if (smoothedDownMBps < 0.0002) smoothedDownMBps = 0
        if (smoothedUpMBps < 0.0002) smoothedUpMBps = 0

        lastSample = makeSample(smoothedDownMBps, smoothedUpMBps, instantDown, instantUp)
        resolve(lastSample)
      })
      .catch(() => {
        isSampling = false
        smoothedDownMBps *= 0.7
        smoothedUpMBps *= 0.7
        lastSample = makeSample(smoothedDownMBps, smoothedUpMBps, 0, 0)
        resolve(lastSample)
      })
  })
}

/**
 * Runs a fast ~1.5s active download speed benchmark against global Cloudflare edge CDN.
 * Measures real internet download bandwidth in Mbps and MB/s.
 */
export function runSpeedTest(): Promise<SpeedTestResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    let bytes = 0
    const req = https.get('https://speed.cloudflare.com/__down?bytes=3000000', { timeout: 6000 }, (res) => {
      res.on('data', chunk => { bytes += chunk.length })
      res.on('end', () => {
        const elapsed = Math.max(0.1, (Date.now() - start) / 1000)
        const mbPerSec = bytes / elapsed / (1024 * 1024)
        const mbps = (bytes * 8) / elapsed / 1000000
        resolve({
          mbPerSec: Math.round(mbPerSec * 100) / 100,
          mbps: Math.round(mbps * 10) / 10
        })
      })
    })
    req.on('error', (err) => reject(err))
    req.on('timeout', () => { req.destroy(); reject(new Error('Speed test timeout')) })
  })
}

export function stopSpeedMonitor(): void {
  last = null
  isSampling = false
  smoothedDownMBps = 0
  smoothedUpMBps = 0
}
