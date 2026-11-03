import http from 'http'
import { app } from 'electron'

export interface CaptivePortalStatus {
  isCaptive: boolean
  portalUrl: string | null
  checkedAt: number
}

function probeUrl(url: string, timeoutMs = 4000): Promise<{ statusCode: number; location: string | null; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs, headers: { 'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) NetMask/${app.getVersion()}` } }, (res) => {
      const statusCode = res.statusCode || 0
      const location = (res.headers.location as string) || null

      let body = ''
      res.on('data', chunk => {
        body += chunk
        if (body.length > 5000) res.destroy() // Limit reading
      })
      res.on('end', () => resolve({ statusCode, location, body }))
      res.on('close', () => resolve({ statusCode, location, body }))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Probe timeout'))
    })
    req.on('error', err => reject(err))
  })
}

/**
 * Probes for network captive portal / web login interception.
 */
export async function checkCaptivePortal(): Promise<CaptivePortalStatus> {
  const checkedAt = Date.now()

  try {
    // 1. Primary probe: Microsoft Connect Test
    let res1: { statusCode: number; location: string | null; body: string } | null = null
    try {
      res1 = await probeUrl('http://www.msftconnecttest.com/connecttest.txt', 3500)
    } catch {}

    if (res1) {
      // Check for HTTP redirects (301, 302, 303, 307, 308)
      if (res1.statusCode >= 300 && res1.statusCode < 400 && res1.location) {
        return {
          isCaptive: true,
          portalUrl: res1.location,
          checkedAt
        }
      }

      // Check if body is intercepted with HTML or non-matching text
      if (res1.statusCode === 200) {
        const cleanBody = res1.body.trim()
        if (cleanBody === 'Microsoft Connect Test') {
          return { isCaptive: false, portalUrl: null, checkedAt }
        }
        // If 200 OK returned something other than "Microsoft Connect Test", captive portal intercepted
        if (cleanBody.toLowerCase().includes('<html') || cleanBody.toLowerCase().includes('login') || cleanBody.toLowerCase().includes('portal')) {
          const redirM = /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i.exec(cleanBody) ||
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(cleanBody) ||
            /<form[^>]+action=["']([^"']+)["']/i.exec(cleanBody)
          const portalUrl = redirM && redirM[1] ? redirM[1].trim() : 'http://www.msftconnecttest.com/redirect'
          return {
            isCaptive: true,
            portalUrl,
            checkedAt
          }
        }
      }
    }

    // 2. Secondary probe: Google 204
    try {
      const res2 = await probeUrl('http://connectivitycheck.gstatic.com/generate_204', 3000)
      if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.location) {
        return {
          isCaptive: true,
          portalUrl: res2.location,
          checkedAt
        }
      }
      if (res2.statusCode === 204) {
        return { isCaptive: false, portalUrl: null, checkedAt }
      }
      if (res2.statusCode === 200 && res2.body.toLowerCase().includes('<html')) {
        return {
          isCaptive: true,
          portalUrl: 'http://connectivitycheck.gstatic.com/generate_204',
          checkedAt
        }
      }
    } catch {}

    return { isCaptive: false, portalUrl: null, checkedAt }
  } catch {
    return { isCaptive: false, portalUrl: null, checkedAt }
  }
}

