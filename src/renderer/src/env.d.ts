/// <reference types="vite/client" />

import type { tauriApi } from './bridge'

// One API contract prevents Tauri commands and renderer declarations diverging.
export type NmApi = typeof tauriApi

declare global {
  interface Window { nm: NmApi }
}
