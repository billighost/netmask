import type { NetworkPlatformProvider } from './types'
import { windowsProvider } from './windows'
import { darwinProvider } from './darwin'
import { linuxProvider } from './linux'

export * from './types'

export function getPlatformProvider(): NetworkPlatformProvider {
  switch (process.platform) {
    case 'darwin':
      return darwinProvider
    case 'linux':
      return linuxProvider
    case 'win32':
    default:
      return windowsProvider
  }
}
