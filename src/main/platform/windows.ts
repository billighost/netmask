import { exec, execSync, execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Network, Connection, NetworkDetails, NetworkPlatformProvider } from './types'

const BASE = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles'

function run(cmd: string, timeout = 3000): string {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      windowsHide: true,
      timeout
    }).toString()
  } catch {
    return ''
  }
}

function runStrict(cmd: string, timeout = 5000): string {
  return execSync(cmd, {
    encoding: 'utf8',
    windowsHide: true,
    timeout
  }).toString()
}

export function getCurrentConnection(): Connection | null {
  const out = run('netsh wlan show interfaces')
  const ssidM = /^\s*SSID\s*:\s*(.+)$/m.exec(out)
  if (!ssidM) return null

  const ssid = ssidM[1].trim()
  const profM = /^\s*Profile\s*:\s*(.+)$/m.exec(out)
  const sigM = /^\s*Signal\s*:\s*(\d+)%/m.exec(out)
  const radioM = /^\s*Radio type\s*:\s*(.+)$/m.exec(out)
  const bandM = /^\s*Band\s*:\s*(.+)$/m.exec(out)

  const signal = sigM ? parseInt(sigM[1], 10) : 0
  const radio = radioM ? radioM[1].trim() : ''
  let band = bandM ? bandM[1].trim() : ''
  if (!band) {
    band = radio.includes('802.11ax') || radio.includes('802.11ac')
      ? '5 GHz' : radio.includes('802.11g') || radio.includes('802.11n')
      ? '2.4 GHz' : 'Wi-Fi'
  }

  const rxM = /^\s*Receive rate \(Mbps\)\s*:\s*([\d.]+)/m.exec(out)
  const txM = /^\s*Transmit rate \(Mbps\)\s*:\s*([\d.]+)/m.exec(out)
  const rxRateMbps = rxM ? parseFloat(rxM[1]) : undefined
  const txRateMbps = txM ? parseFloat(txM[1]) : undefined

  const profile = profM ? profM[1].trim() : ssid

  return {
    ssid,
    profile,
    signal,
    band,
    name: profile || ssid,
    rxRateMbps,
    txRateMbps
  }
}

export function getNetworks(backup: Record<string, string>): Network[] {
  const nets: Network[] = []
  const conn = getCurrentConnection()

  // 1. Try registry query (works when running as Administrator)
  let regSuccess = false
  try {
    const regOut = run(`reg query "${BASE}" /s`, 4000)
    if (regOut && regOut.includes('HKEY_LOCAL_MACHINE')) {
      const blocks = regOut.split(/(?=HKEY_LOCAL_MACHINE)/g)
      for (const block of blocks) {
        const guidM = /\{[0-9A-Fa-f-]{36}\}/i.exec(block)
        if (!guidM) continue
        const guid = guidM[0]

        const pnM = /ProfileName\s+REG_SZ\s+(.+)$/m.exec(block)
        if (!pnM) continue
        const profileName = pnM[1].trim()

        const ntM = /NameType\s+REG_DWORD\s+0x(\w+)/i.exec(block)
        const nameType = ntM ? parseInt(ntM[1], 16) : 0
        const type = nameType === 71 ? 'wifi' : 'ethernet'

        const original = backup[guid] || profileName
        const isLive = Boolean(
          conn && (
            conn.profile.toLowerCase() === profileName.toLowerCase() ||
            conn.ssid.toLowerCase() === profileName.toLowerCase() ||
            conn.profile.toLowerCase() === original.toLowerCase() ||
            conn.ssid.toLowerCase() === original.toLowerCase() ||
            (conn.name && (conn.name.toLowerCase() === profileName.toLowerCase() || conn.name.toLowerCase() === original.toLowerCase()))
          )
        )

        nets.push({
          guid,
          name: profileName,
          originalName: original,
          renamed: original !== profileName,
          live: isLive,
          type
        })
      }
      if (nets.length > 0) {
        regSuccess = true
      }
    }
  } catch {}

  // 2. Fallback: query `netsh wlan show profiles` so user sees saved networks immediately
  if (!regSuccess) {
    try {
      const netshOut = run('netsh wlan show profiles', 3000)
      const matches = [...netshOut.matchAll(/(?:All User Profile\s*:\s*)(.+)$/gmi)]
      for (const m of matches) {
        const profileName = m[1].trim()
        if (!profileName) continue

        let guid = profileName
        let original = profileName
        for (const [bkGuid, orig] of Object.entries(backup)) {
          if (orig === profileName || bkGuid === profileName) {
            guid = bkGuid
            original = orig
            break
          }
        }

        const isLive = conn
          ? (conn.profile.toLowerCase() === profileName.toLowerCase() ||
             conn.ssid.toLowerCase() === profileName.toLowerCase() ||
             conn.profile.toLowerCase() === original.toLowerCase() ||
             conn.ssid.toLowerCase() === original.toLowerCase())
          : false

        nets.push({
          guid,
          name: profileName,
          originalName: original,
          renamed: original !== profileName,
          live: isLive,
          type: 'wifi'
        })
      }
    } catch {}
  }

  return nets.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
}

function runElevatedRename(target: string, newName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const psScript = `
$target = '${target.replace(/'/g, "''")}';
$newName = '${newName.replace(/'/g, "''")}';
$base = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles';
$renamed = $false;
Get-ChildItem -Path $base -ErrorAction SilentlyContinue | ForEach-Object {
  $p = (Get-ItemProperty $_.PsPath -ErrorAction SilentlyContinue).ProfileName;
  if ($_.PSChildName -eq $target -or $p -eq $target) {
    Set-ItemProperty -Path $_.PsPath -Name 'ProfileName' -Value $newName -Force -ErrorAction SilentlyContinue;
    $renamed = $true;
  }
};
if (-not $renamed) {
  if ($target -match '^\\{[0-9a-fA-F-]{36}\\}$') {
    Set-ItemProperty -Path "$base\\$target" -Name 'ProfileName' -Value $newName -Force -ErrorAction SilentlyContinue;
    $renamed = $true;
  }
}
if (-not $renamed) { exit 1; }
`.trim()

    const b64 = Buffer.from(psScript, 'utf16le').toString('base64')
    const elevatedCmd = `Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}' -Verb RunAs -Wait -WindowStyle Hidden`
    const outerB64 = Buffer.from(elevatedCmd, 'utf16le').toString('base64')

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${outerB64}`, { timeout: 30000 }, (err) => {
      if (err) {
        reject(new Error('Administrator permission was cancelled or elevation failed.'))
      } else {
        resolve()
      }
    })
  })
}

export function getWlanProfiles(): string[] {
  try {
    const out = execFileSync('netsh', ['wlan', 'show', 'profiles'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 4000
    })
    const matches = [...out.matchAll(/(?:All User Profile\s*:\s*)(.+)$/gmi)]
    return matches.map(m => m[1].trim()).filter(Boolean)
  } catch {
    return []
  }
}

export async function renameWlanProfile(oldProfile: string, newProfile: string): Promise<boolean> {
  if (!oldProfile || !newProfile || oldProfile.trim().toLowerCase() === newProfile.trim().toLowerCase()) {
    return true
  }

  const cleanOld = oldProfile.trim()
  const cleanNew = newProfile.trim()
  const tempDir = join(tmpdir(), 'netmask_wlan')

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    } else {
      for (const f of readdirSync(tempDir)) {
        if (f.toLowerCase().endsWith('.xml')) {
          try { unlinkSync(join(tempDir, f)) } catch {}
        }
      }
    }

    const exportOut = execFileSync('netsh', ['wlan', 'export', 'profile', `name=${cleanOld}`, `folder=${tempDir}`], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    })

    if (!exportOut.includes('successfully') && !exportOut.includes('saved')) {
      return false
    }

    const xmlFiles = readdirSync(tempDir).filter(f => f.toLowerCase().endsWith('.xml'))
    if (xmlFiles.length === 0) return false
    const xmlPath = join(tempDir, xmlFiles[0])
    const xmlContent = readFileSync(xmlPath, 'utf8')

    const safeNew = cleanNew
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')

    const updatedXml = xmlContent.replace(
      /(<WLANProfile[^>]*>[\s\S]*?<name>)(.*?)(<\/name>)/i,
      `$1${safeNew}$3`
    )

    const updatedFile = join(tempDir, 'wlan_renamed_temp.xml')
    writeFileSync(updatedFile, updatedXml, 'utf8')

    const addOut = execFileSync('netsh', ['wlan', 'add', 'profile', `filename=${updatedFile}`, 'user=all'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    })

    if (!addOut.includes('successfully') && !addOut.includes('added') && !addOut.includes('is added')) {
      return false
    }

    const conn = getCurrentConnection()
    const isCurrentlyConnected = conn && (
      conn.profile.trim().toLowerCase() === cleanOld.toLowerCase() ||
      conn.name.trim().toLowerCase() === cleanOld.toLowerCase() ||
      conn.ssid.trim().toLowerCase() === cleanOld.toLowerCase()
    )

    if (isCurrentlyConnected) {
      try {
        execFileSync('netsh', ['wlan', 'connect', `name=${cleanNew}`], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000
        })
      } catch {}
      await new Promise(r => setTimeout(r, 600))
    }

    if (cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
      try {
        execFileSync('netsh', ['wlan', 'delete', 'profile', `name=${cleanOld}`], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000
        })
      } catch {}
    }

    try { unlinkSync(xmlPath); unlinkSync(updatedFile) } catch {}
    return true
  } catch (err) {
    console.error('Failed to rename WLAN profile:', err)
    return false
  }
}

export async function renameNetwork(guid: string, newName: string, currentDisplayName?: string): Promise<void> {
  const escaped = newName.replace(/"/g, '\\"')
  const wlanProfiles = getWlanProfiles()
  const conn = getCurrentConnection()

  // 1. Direct registry write if already elevated or if target is a known GUID
  let regSuccess = false
  if (guid.startsWith('{') && guid.endsWith('}')) {
    try {
      runStrict(`reg add "${BASE}\\${guid}" /v ProfileName /d "${escaped}" /f`)
      regSuccess = true
    } catch {}
  } else {
    try {
      const regOut = run(`reg query "${BASE}" /s`, 4000)
      if (regOut && regOut.includes('HKEY_LOCAL_MACHINE')) {
        const blocks = regOut.split(/(?=HKEY_LOCAL_MACHINE)/g)
        let foundGuid: string | null = null
        for (const block of blocks) {
          if (block.includes(guid) || (currentDisplayName && block.includes(currentDisplayName))) {
            const m = /\{[0-9A-Fa-f-]{36}\}/i.exec(block)
            if (m) { foundGuid = m[0]; break }
          }
        }
        if (foundGuid) {
          runStrict(`reg add "${BASE}\\${foundGuid}" /v ProfileName /d "${escaped}" /f`)
          regSuccess = true
        }
      }
    } catch {}
  }

  if (!regSuccess) {
    await runElevatedRename(guid, newName)
  }

  // 2. Rename in Windows WLAN Service (WlanSvc XML profile)
  const candidates: string[] = []
  if (currentDisplayName && currentDisplayName.trim()) {
    candidates.push(currentDisplayName.trim())
  }
  if (conn) {
    const isLive =
      (guid === conn.profile || guid === conn.ssid || guid === conn.name) ||
      (currentDisplayName && (
        currentDisplayName.toLowerCase() === conn.profile.toLowerCase() ||
        currentDisplayName.toLowerCase() === conn.ssid.toLowerCase()
      ))
    if (isLive) {
      candidates.unshift(conn.profile)
      if (conn.ssid) candidates.push(conn.ssid)
    }
  }
  if (!guid.startsWith('{')) {
    candidates.push(guid)
  }

  if (guid.startsWith('{')) {
    try {
      const q = run(`reg query "${BASE}\\${guid}" /v ProfileName`, 2000)
      const qm = /ProfileName\s+REG_SZ\s+(.+)$/m.exec(q)
      if (qm && qm[1].trim()) candidates.push(qm[1].trim())
    } catch {}
  }

  let targetWlan: string | null = null
  for (const cand of candidates) {
    const matched = wlanProfiles.find(p => p.toLowerCase() === cand.toLowerCase())
    if (matched) {
      targetWlan = matched
      break
    }
  }

  if (!targetWlan && conn?.profile) {
    if (guid === conn.profile || (currentDisplayName && currentDisplayName.toLowerCase() === conn.profile.toLowerCase())) {
      targetWlan = conn.profile
    }
  }

  if (targetWlan) {
    await renameWlanProfile(targetWlan, newName)
  }
}

export async function reconnectNetwork(profileName?: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const conn = getCurrentConnection()
      const wlanProfiles = getWlanProfiles()

      let target: string | null = null
      if (profileName) {
        const found = wlanProfiles.find(p => p.toLowerCase() === profileName.toLowerCase())
        if (found) target = found
      }
      if (!target && conn?.profile) {
        const found = wlanProfiles.find(p => p.toLowerCase() === conn.profile.toLowerCase())
        if (found) target = found || conn.profile
      }
      if (!target && conn?.name) target = conn.name
      if (!target && conn?.ssid) target = conn.ssid
      if (!target && profileName) target = profileName

      if (!target) {
        resolve(false)
        return
      }

      try {
        execFileSync('netsh', ['wlan', 'disconnect'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 4000
        })
      } catch {}

      setTimeout(() => {
        try {
          const out = execFileSync('netsh', ['wlan', 'connect', `name=${target}`], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 6000
          })
          const ok = out.includes('successfully') || out.includes('completed')
          resolve(ok)
        } catch {
          if (conn?.profile && conn.profile !== target) {
            try {
              const fbOut = execFileSync('netsh', ['wlan', 'connect', `name=${conn.profile}`], {
                encoding: 'utf8',
                windowsHide: true,
                timeout: 6000
              })
              resolve(fbOut.includes('successfully') || fbOut.includes('completed'))
              return
            } catch {}
          }
          resolve(false)
        }
      }, 900)
    } catch {
      resolve(false)
    }
  })
}

export function getNetworkDetails(guidOrName: string): NetworkDetails {
  const out = run('netsh wlan show interfaces', 2500)
  const bssidM = /^\s*BSSID\s*:\s*(.+)$/m.exec(out)
  const chanM = /^\s*Channel\s*:\s*(\d+)/m.exec(out)
  const authM = /^\s*Authentication\s*:\s*(.+)$/m.exec(out)
  const radioM = /^\s*Radio type\s*:\s*(.+)$/m.exec(out)
  const bandM = /^\s*Band\s*:\s*(.+)$/m.exec(out)

  const radio = radioM ? radioM[1].trim() : ''
  let band = bandM ? bandM[1].trim() : ''
  if (!band) {
    band = radio.includes('802.11ax') || radio.includes('802.11ac') ? '5 GHz' : '2.4 GHz'
  }
  const freq = band === '5 GHz' ? '5.0 GHz' : '2.4 GHz'

  const conn = getCurrentConnection()
  const isCurrent = conn && (conn.profile === guidOrName || conn.name === guidOrName || conn.ssid === guidOrName)

  return {
    guid: guidOrName,
    bssid: isCurrent && bssidM ? bssidM[1].trim() : 'Saved Profile',
    channel: isCurrent && chanM ? parseInt(chanM[1], 10) : 0,
    auth: isCurrent && authM ? authM[1].trim() : 'WPA2-Personal',
    band,
    frequency: freq,
    lastConnected: isCurrent ? 'Active now' : 'Previously connected'
  }
}

export function getRawNetworkBytesWindows(): Promise<{ received: number; sent: number }> {
  return new Promise((resolve, reject) => {
    exec('netstat -e', { timeout: 1500, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err)
      const lines = stdout.split('\n')
      for (const line of lines) {
        if (/Bytes/i.test(line)) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 3) {
            const rx = parseInt(parts[1], 10)
            const tx = parseInt(parts[2], 10)
            if (!isNaN(rx) && !isNaN(tx)) {
              return resolve({ received: rx, sent: tx })
            }
          }
        }
      }
      reject(new Error('No bytes line in netstat output'))
    })
  })
}

export const windowsProvider: NetworkPlatformProvider = {
  getNetworks,
  getCurrentConnection,
  getNetworkDetails,
  renameNetwork,
  reconnectNetwork,
  getRawNetworkBytes: getRawNetworkBytesWindows
}
