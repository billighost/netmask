import os from 'os'
import { execFileSync, execSync } from 'child_process'
import { runElevatedCommand, isAdmin } from './admin'
import { getCurrentConnection } from './registry'

export interface DeviceIdentity {
  hostname: string
  macAddress: string
  interfaceName: string
  interfaceGuid: string
  netbiosSilenced: boolean
  macRandomization: 'disabled' | 'enabled' | 'daily' | 'unknown'
  activeProfile: string | null
}

function run(cmd: string, timeout = 3000): string {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout
    }).toString()
  } catch {
    return ''
  }
}

/**
 * Retrieves the hardware identity and privacy cloaking status for the active adapter.
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const hostname = os.hostname()
  let macAddress = '00:00:00:00:00:00'
  let interfaceName = 'Wi-Fi'
  let interfaceGuid = ''
  let macRandomization: 'disabled' | 'enabled' | 'daily' | 'unknown' = 'unknown'
  let netbiosSilenced = false
  let activeProfile: string | null = null

  if (process.platform === 'win32') {
    try {
      const out = run('netsh wlan show interfaces', 3000)
      const nameM = /^\s*Name\s*:\s*(.+)$/m.exec(out)
      if (nameM) interfaceName = nameM[1].trim()

      const guidM = /^\s*GUID\s*:\s*([0-9a-fA-F-]{36})/m.exec(out)
      if (guidM) interfaceGuid = guidM[1].trim()

      const macM = /^\s*Physical address\s*:\s*([0-9a-fA-F:]{17})/m.exec(out)
      if (macM) macAddress = macM[1].trim()

      const profM = /^\s*Profile\s*:\s*(.+)$/m.exec(out)
      if (profM) activeProfile = profM[1].trim()
    } catch {}

    // Check MAC randomization for active profile
    if (activeProfile) {
      try {
        const profOut = run(`netsh wlan show profile name="${activeProfile}"`, 3000)
        const randM = /MAC Randomization\s*:\s*(.+)$/m.exec(profOut)
        if (randM) {
          const val = randM[1].trim().toLowerCase()
          if (val.includes('daily')) macRandomization = 'daily'
          else if (val.includes('enabled')) macRandomization = 'enabled'
          else if (val.includes('disabled')) macRandomization = 'disabled'
        }
      } catch {}
    }

    // Check NetBIOS-over-TCP/IP status
    if (interfaceGuid) {
      try {
        const regOut = run(`reg query "HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{${interfaceGuid}}" /v NetbiosOptions`, 2500)
        const optM = /NetbiosOptions\s+REG_DWORD\s+0x([0-9a-fA-F]+)/i.exec(regOut)
        if (optM) {
          const opt = parseInt(optM[1], 16)
          netbiosSilenced = opt === 2
        }
      } catch {}
    }
  } else {
    // Non-Windows fallbacks
    const conn = await getCurrentConnection()
    if (conn) {
      activeProfile = conn.profile || conn.ssid
      macAddress = conn.bssid || '00:00:00:00:00:00'
    }
  }

  return {
    hostname,
    macAddress,
    interfaceName,
    interfaceGuid,
    netbiosSilenced,
    macRandomization,
    activeProfile
  }
}

/**
 * Toggles or sets hardware MAC address randomization for a Wi-Fi profile.
 * Mode: 'yes' (Enabled), 'no' (Disabled), or 'daily' (Randomized daily).
 */
export async function setMacRandomization(profileName: string, mode: 'yes' | 'no' | 'daily'): Promise<boolean> {
  if (process.platform !== 'win32') return true

  try {
    const res = execFileSync('netsh', ['wlan', 'set', 'profileparameter', `name=${profileName}`, `Randomization=${mode}`], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 6000
    })
    return res.includes('successfully') || res.includes('updated')
  } catch (err) {
    // If permission issue, try elevated command
    try {
      const safeProfile = profileName.replace(/"/g, '`"')
      const script = `netsh wlan set profileparameter name="${safeProfile}" Randomization=${mode}`
      const elevatedRes = await runElevatedCommand(script)
      return elevatedRes.success
    } catch {
      return false
    }
  }
}

/**
 * Toggles the NetBIOS LAN Broadcast Silencer on the active interface.
 * When enabled (silence = true), sets NetbiosOptions = 2 (Disable NetBIOS-over-TCP/IP).
 * This prevents Windows from broadcasting the hostname (UDP 137 NBNS) across the local subnet.
 */
export async function setNetbiosSilencer(enableSilence: boolean): Promise<boolean> {
  if (process.platform !== 'win32') return true

  const id = await getDeviceIdentity()
  const guid = id.interfaceGuid
  const val = enableSilence ? 2 : 0

  // Configure via registry and CIM (immediate live stack update)
  const script = `
$val = ${val};
$guid = '${guid}';
if ($guid) {
  reg add "HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_{$guid}" /v NetbiosOptions /t REG_DWORD /d $val /f | Out-Null
}
Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" | ForEach-Object {
  $_.SetTcpipNetbios($val) | Out-Null
}
`.trim()

  const res = await runElevatedCommand(script)
  return res.success
}

