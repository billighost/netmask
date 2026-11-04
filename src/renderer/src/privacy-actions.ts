import type { DeviceIdentity, PlatformCapabilities, StreamerStatus } from './types'
import { errorMessage } from './network-state'

type PrivacyApi = {
  setMacRandomization: (profile: string, mode: 'yes') => Promise<boolean>
  setNetbiosSilencer: (enabled: boolean) => Promise<boolean>
  getStreamerStatus: () => Promise<StreamerStatus>
  toggleStreamerCloak: () => Promise<StreamerStatus>
}

export async function enablePrivacyControls(api: PrivacyApi, identity: DeviceIdentity, capabilities: PlatformCapabilities) {
  const outcomes: { label: string; error?: string }[] = []
  const apply = async (label: string, operation: () => Promise<unknown>) => {
    try {
      if (await operation() === false) throw new Error('The operating system did not confirm this change')
      outcomes.push({ label })
    } catch (error) { outcomes.push({ label, error: errorMessage(error) }) }
  }
  if (capabilities.macRandomization && identity.activeProfile) {
    await apply('MAC randomization', () => identity.macRandomization === 'enabled' || identity.macRandomization === 'daily'
      ? Promise.resolve(true) : api.setMacRandomization(identity.activeProfile!, 'yes'))
  }
  if (capabilities.netbiosControl) {
    await apply('NetBIOS disabled', () => identity.netbiosSilenced === true ? Promise.resolve(true) : api.setNetbiosSilencer(true))
  }
  if (capabilities.networkRename && identity.activeProfile) {
    await apply('Display name masked', async () => {
      let status = await api.getStreamerStatus()
      if (!status.isCloaked) status = await api.toggleStreamerCloak()
      if (status.error || !status.isCloaked) throw new Error(status.error || 'The display name could not be masked')
    })
  }
  return outcomes
}
