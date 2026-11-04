export function normalizeKeyCombination(event: KeyboardEvent): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock'].includes(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  return [...parts, key].join('+')
}

export function parseKeyCombination(binding: string): string[] {
  if (!binding) return []
  if (binding === '+') return ['+']
  if (binding.endsWith('++')) return [...binding.slice(0, -2).split('+'), '+']
  return binding.split('+')
}

// Existing Ctrl bindings also use Command on macOS, including conflict checks.
export function shortcutEquals(binding: string, pressed: string, platform?: string): boolean {
  const canonical = (value: string) => value.toLowerCase().split('+')
    .map(part => platform === 'macos' && part === 'ctrl' ? 'meta' : part).join('+')
  return Boolean(binding && pressed && canonical(binding) === canonical(pressed))
}

export function shortcutKeyLabel(key: string, platform?: string): string {
  return platform === 'macos' && (key === 'Ctrl' || key === 'Meta') ? 'Cmd' : key
}
