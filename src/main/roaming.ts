import { execFileSync } from 'child_process'
import { runElevatedCommand, isAdmin } from './admin'
import { getDeviceIdentity } from './privacy'

export interface RoamingSettings {
  supported: boolean
  adapterName: string
  preferredBand: string
  validPreferredBands: string[]
  roamingAggressiveness: string
  validRoamingAggressiveness: string[]
}

const DEFAULT_PREFERRED_BANDS = [
  '1. No Preference',
  '2. Prefer 2.4GHz band',
  '3. Prefer 5GHz band'
]

const DEFAULT_ROAMING_LEVELS = [
  '1. Lowest',
  '2. Medium-low',
  '3. Medium',
  '4. Medium-High',
  '5. Highest'
]

export async function getRoamingSettings(): Promise<RoamingSettings> {
  const identity = await getDeviceIdentity().catch(() => ({ interfaceName: 'Wi-Fi' }))
  const adapterName = identity.interfaceName || 'Wi-Fi'

  if (process.platform !== 'win32') {
    return {
      supported: false,
      adapterName,
      preferredBand: '1. No Preference',
      validPreferredBands: DEFAULT_PREFERRED_BANDS,
      roamingAggressiveness: '3. Medium',
      validRoamingAggressiveness: DEFAULT_ROAMING_LEVELS
    }
  }

  try {
    const psScript = `
$res = @{}
try {
  $props = Get-NetAdapterAdvancedProperty -Name '${adapterName}' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Roaming Aggressiveness|Preferred Band' }
  foreach ($p in $props) {
    if ($p.DisplayName -like '*Preferred Band*') {
      $res.preferredBand = $p.DisplayValue
      $res.validBands = @($p.ValidDisplayValues)
    }
    if ($p.DisplayName -like '*Roaming Aggressiveness*') {
      $res.roamingAggressiveness = $p.DisplayValue
      $res.validRoaming = @($p.ValidDisplayValues)
    }
  }
} catch {}
$res | ConvertTo-Json -Compress
`.trim()

    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000
    }).trim()

    if (raw) {
      const parsed = JSON.parse(raw)
      const validBands = Array.isArray(parsed.validBands) && parsed.validBands.length > 0
        ? parsed.validBands
        : DEFAULT_PREFERRED_BANDS
      const validRoaming = Array.isArray(parsed.validRoaming) && parsed.validRoaming.length > 0
        ? parsed.validRoaming
        : DEFAULT_ROAMING_LEVELS

      return {
        supported: Boolean(parsed.preferredBand || parsed.roamingAggressiveness),
        adapterName,
        preferredBand: parsed.preferredBand || '1. No Preference',
        validPreferredBands: validBands,
        roamingAggressiveness: parsed.roamingAggressiveness || '3. Medium',
        validRoamingAggressiveness: validRoaming
      }
    }
  } catch (err) {
    console.warn('Failed to query NIC Roaming settings:', err)
  }

  return {
    supported: false,
    adapterName,
    preferredBand: '1. No Preference',
    validPreferredBands: DEFAULT_PREFERRED_BANDS,
    roamingAggressiveness: '3. Medium',
    validRoamingAggressiveness: DEFAULT_ROAMING_LEVELS
  }
}

export async function setRoamingSettings(params: {
  preferredBand?: string
  roamingAggressiveness?: string
}): Promise<boolean> {
  const identity = await getDeviceIdentity().catch(() => ({ interfaceName: 'Wi-Fi' }))
  const adapterName = identity.interfaceName || 'Wi-Fi'

  if (process.platform !== 'win32') return true

  const commands: string[] = []
  if (params.preferredBand) {
    const safeBand = params.preferredBand.replace(/'/g, "''")
    commands.push(`Set-NetAdapterAdvancedProperty -Name '${adapterName}' -DisplayName 'Preferred Band*' -DisplayValue '${safeBand}' -ErrorAction SilentlyContinue`)
  }
  if (params.roamingAggressiveness) {
    const safeRoam = params.roamingAggressiveness.replace(/'/g, "''")
    commands.push(`Set-NetAdapterAdvancedProperty -Name '${adapterName}' -DisplayName 'Roaming Aggressiveness*' -DisplayValue '${safeRoam}' -ErrorAction SilentlyContinue`)
  }

  if (commands.length === 0) return true

  const script = commands.join(' ; ')
  const res = await runElevatedCommand(script)
  return res.success
}

