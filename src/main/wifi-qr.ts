import { execFileSync } from 'child_process'
import { renderQrSvg } from './qr-generator'

export interface WifiQrData {
  ssid: string
  auth: string
  password: string
  qrString: string
  svg: string
  isWep: boolean
  isOpen: boolean
}

function escapeWifiString(str: string): string {
  return str.replace(/([\\;,":])/g, '\\$1')
}

export function buildWifiQrString(ssid: string, password = '', auth = 'WPA'): string {
  const cleanSsid = escapeWifiString(ssid)
  const cleanPass = escapeWifiString(password)

  let authType = 'WPA'
  const upperAuth = (auth || '').toUpperCase()
  if (upperAuth.includes('OPEN') || !password) {
    authType = 'nopass'
  } else if (upperAuth.includes('WEP')) {
    authType = 'WEP'
  } else {
    authType = 'WPA'
  }

  if (authType === 'nopass') {
    return `WIFI:T:nopass;S:${cleanSsid};;`
  }

  return `WIFI:T:${authType};S:${cleanSsid};P:${cleanPass};;`
}

export function getWifiQrData(profileName: string): WifiQrData {
  let ssid = profileName
  let auth = 'WPA2-Personal'
  let password = ''

  if (process.platform === 'win32') {
    try {
      const out = execFileSync('netsh', ['wlan', 'show', 'profile', `name=${profileName}`, 'key=clear'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000
      })

      const ssidM = /SSID name\s*:\s*"?([^"\r\n]+)"?/m.exec(out)
      if (ssidM && ssidM[1].trim()) {
        ssid = ssidM[1].trim()
      }

      const authM = /Authentication\s*:\s*([^\r\n]+)/m.exec(out)
      if (authM && authM[1].trim()) {
        auth = authM[1].trim()
      }

      const keyM = /Key Content\s*:\s*([^\r\n]+)/m.exec(out)
      if (keyM && keyM[1].trim()) {
        password = keyM[1].trim()
      }
    } catch (err) {
      console.warn(`Could not extract key=clear for WLAN profile "${profileName}":`, err)
    }
  } else if (process.platform === 'darwin') {
    try {
      const out = execFileSync('security', ['find-generic-password', '-D', 'AirPort network password', '-a', profileName, '-w'], {
        encoding: 'utf8',
        timeout: 4000
      })
      if (out && out.trim()) {
        password = out.trim()
      }
    } catch {}
  }

  const isWep = auth.toUpperCase().includes('WEP')
  const isOpen = auth.toUpperCase().includes('OPEN') || (!password && auth !== 'WPA2-Personal')
  const qrString = buildWifiQrString(ssid, password, auth)
  const svg = renderQrSvg(qrString, 240, 4)

  return {
    ssid,
    auth,
    password,
    qrString,
    svg,
    isWep,
    isOpen
  }
}

