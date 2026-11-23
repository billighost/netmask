import { useStore } from './store'
import { errorMessage } from './network-state'
import type { MiniWidgetPreferences } from './types'

let opening = false
let menuTail: Promise<unknown> = Promise.resolve()

export function setMiniMenuVisibility(open: boolean): Promise<void> {
  const request = menuTail.then(() => window.nm.setMiniMenuOpen(open))
  menuTail = request.catch(() => {})
  return request
}

export async function activateMiniMode(): Promise<void> {
  if (opening) return
  opening = true
  const state = useStore.getState()
  try {
    await window.nm.saveUiSession({ activeView: state.activeView, journalTab: state.journalTab,
      historyRange: state.historyRange, selectedGuid: state.selectedGuid,
      mainScrollTop: document.getElementById('main-content')?.scrollTop ?? 0 })
    await window.nm.showMini()
  } catch (error) { state.addToast(errorMessage(error, 'Mini mode could not open'), 'error') }
  finally { opening = false }
}

export async function updateMiniPreferences(patch: Partial<MiniWidgetPreferences>): Promise<boolean> {
  const state = useStore.getState()
  return state.updateSetting('miniWidget', { ...state.settings.miniWidget, ...patch })
}
