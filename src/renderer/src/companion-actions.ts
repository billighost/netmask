import { useStore } from './store'
import { errorMessage } from './network-state'

export async function acceptContextPrompt(): Promise<void> {
  const state = useStore.getState()
  const prompt = state.contextPrompt
  if (!prompt) return
  try {
    if (prompt.kind === 'broadcast-app') {
      state.setGoingLiveOpen(true)
      await window.nm.respondContextPrompt(prompt.id, 'accept')
    } else if (prompt.networkGuid) {
      state.setPresetModalGuid(prompt.networkGuid)
      await window.nm.respondContextPrompt(prompt.id, 'accept')
    }
    state.setContextPrompt(null)
  } catch (error) { state.addToast(errorMessage(error), 'error') }
}

export async function dismissContextPrompt(disable = false): Promise<void> {
  const state = useStore.getState()
  const prompt = state.contextPrompt
  if (!prompt) return
  try {
    await window.nm.respondContextPrompt(prompt.id, disable ? 'disable' : 'dismiss')
    state.setContextPrompt(null)
  } catch (error) { state.addToast(errorMessage(error), 'error') }
}

export async function dismissNetworkAlert(): Promise<void> {
  const state = useStore.getState()
  const alert = state.networkAlert
  if (!alert) return
  try {
    await window.nm.dismissNetworkAlert(alert.id)
    state.setNetworkAlert(null)
  } catch (error) { state.addToast(errorMessage(error), 'error') }
}

export async function undoPreset(): Promise<void> {
  const state = useStore.getState()
  const undo = state.presetUndo
  if (!undo) return
  try {
    await window.nm.undoNetworkPreset(undo.token)
    state.setPresetUndo(null)
    state.addToast('Network preset undone', 'success')
  } catch (error) { state.addToast(errorMessage(error, 'The preset could not be undone'), 'error') }
}
