import React, { useState, useEffect } from 'react'
import { useStore, DEFAULT_SHORTCUTS } from '../../store'
import type { ShortcutDefinition } from '../../types'
import { KeyboardIcon, CloseIcon, SearchIcon, RefreshIcon, CheckIcon } from '../../icons'
import styles from './KeyboardControlsModal.module.css'

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'refresh',
    name: 'Refresh Networks',
    description: 'Rescan Wi-Fi profiles, active adapter link, and RF connection stats',
    category: 'Network Actions',
    defaultKey: 'Ctrl+R'
  },
  {
    id: 'focusRename',
    name: 'Focus Rename Input',
    description: 'Jump immediately into the rename input box for the selected network',
    category: 'Network Actions',
    defaultKey: 'Ctrl+N'
  },
  {
    id: 'applyRename',
    name: 'Apply New Name',
    description: 'Apply the pending display name to the Windows network registry',
    category: 'Network Actions',
    defaultKey: 'Ctrl+Enter'
  },
  {
    id: 'restoreOriginal',
    name: 'Restore Original Name',
    description: 'Restore the hardware SSID and true profile name',
    category: 'Network Actions',
    defaultKey: 'Ctrl+Shift+Z'
  },
  {
    id: 'reconnectWifi',
    name: 'Reconnect Wi-Fi',
    description: 'Cycle Wi-Fi interface connection to update Windows taskbar shell',
    category: 'Network Actions',
    defaultKey: 'Ctrl+Shift+R'
  },
  {
    id: 'viewDetails',
    name: 'Network Diagnostics',
    description: 'Open RF telemetry, BSSID, RSSI, SNR, and channel details modal',
    category: 'Network Actions',
    defaultKey: 'Ctrl+D'
  },
  {
    id: 'selectNext',
    name: 'Next Network',
    description: 'Move selection cursor down through saved network profiles',
    category: 'Navigation',
    defaultKey: 'ArrowDown'
  },
  {
    id: 'selectPrev',
    name: 'Previous Network',
    description: 'Move selection cursor up through saved network profiles',
    category: 'Navigation',
    defaultKey: 'ArrowUp'
  },
  {
    id: 'filterSearch',
    name: 'Filter Networks',
    description: 'Focus the network profile search filter',
    category: 'Navigation',
    defaultKey: 'Ctrl+F'
  },
  {
    id: 'closeModals',
    name: 'Dismiss / Close Modals',
    description: 'Close active popups, shortcuts modal, or context menu',
    category: 'Navigation',
    defaultKey: 'Escape'
  },
  {
    id: 'toggleStreamer',
    name: 'Toggle Streamer Cloak',
    description: 'Instantly cloak or uncloak active network for broadcast safety',
    category: 'Privacy & Streamer',
    defaultKey: 'Ctrl+Shift+S'
  },
  {
    id: 'peekBssid',
    name: 'Peek Hardware BSSID',
    description: 'Temporarily reveal masked router MAC address for 3 seconds',
    category: 'Privacy & Streamer',
    defaultKey: 'Ctrl+Shift+B'
  },
  {
    id: 'trimMemory',
    name: 'Trim Process Memory',
    description: 'Evict stale heap pages and flush working set to minimum RAM footprint',
    category: 'Window & General',
    defaultKey: 'Ctrl+Shift+M'
  },
  {
    id: 'runSpeedTest',
    name: 'Run Speed Benchmark',
    description: 'Test live network throughput and packet latency',
    category: 'Window & General',
    defaultKey: 'Ctrl+Shift+T'
  },
  {
    id: 'openSettings',
    name: 'Open Settings',
    description: 'Open the main NetMask configuration and options panel',
    category: 'Window & General',
    defaultKey: 'Ctrl+,'
  },
  {
    id: 'openShortcuts',
    name: 'Keyboard Controls',
    description: 'Open this keyboard shortcuts mapping and reference panel',
    category: 'Window & General',
    defaultKey: 'Ctrl+/'
  }
]

export function normalizeKeyCombination(e: KeyboardEvent): string | null {
  // Solitary modifiers and lock keys don't constitute a valid shortcut
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock'].includes(e.key)) {
    return null
  }

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')

  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp') key = 'ArrowUp'
  else if (key === 'ArrowDown') key = 'ArrowDown'
  else if (key === 'ArrowLeft') key = 'ArrowLeft'
  else if (key === 'ArrowRight') key = 'ArrowRight'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts.join('+')
}

export function parseKeyCombination(keyStr: string): string[] {
  if (!keyStr) return []
  if (keyStr.endsWith('++')) {
    const prefix = keyStr.slice(0, -2)
    return [...(prefix ? prefix.split('+') : []), '+']
  }
  if (keyStr === '+') {
    return ['+']
  }
  return keyStr.split('+')
}

export const KeyboardControlsModal: React.FC = () => {
  const {
    shortcutsModalOpen,
    setShortcutsModalOpen,
    settings,
    updateShortcut,
    resetAllShortcuts,
    addToast
  } = useStore()

  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)

  // Shortcuts map: merge user settings with fallback defaults
  const shortcuts = settings.shortcuts || DEFAULT_SHORTCUTS

  useEffect(() => {
    if (!recordingId) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Allow Escape to cancel recording without changing
      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }

      // Allow Backspace or Delete without modifiers to unassign
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        updateShortcut(recordingId, '')
        setRecordingId(null)
        addToast('Shortcut unassigned', 'info')
        return
      }

      const combo = normalizeKeyCombination(e)
      if (!combo) return

      // Conflict detection: check if another action uses this shortcut
      const conflicting = Object.entries(shortcuts).find(
        ([id, key]) => id !== recordingId && key && key.toLowerCase() === combo.toLowerCase()
      )

      updateShortcut(recordingId, combo)
      setRecordingId(null)

      if (conflicting) {
        const def = SHORTCUT_DEFINITIONS.find(d => d.id === conflicting[0])
        addToast(
          `Mapped to "${combo}". (Replaced on "${def?.name || conflicting[0]}")`,
          'info'
        )
      } else {
        addToast(`Shortcut saved: ${combo}`, 'success')
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recordingId, shortcuts, updateShortcut, addToast])

  if (!shortcutsModalOpen) return null

  const filtered = SHORTCUT_DEFINITIONS.filter(d => {
    const term = search.toLowerCase().trim()
    if (!term) return true
    const rawKey = shortcuts[d.id] !== undefined ? shortcuts[d.id] : d.defaultKey
    const currentKey = (rawKey || 'unassigned').toLowerCase()
    return (
      d.name.toLowerCase().includes(term) ||
      d.description.toLowerCase().includes(term) ||
      d.category.toLowerCase().includes(term) ||
      currentKey.includes(term)
    )
  })

  // Group by category
  const categories = Array.from(new Set(SHORTCUT_DEFINITIONS.map(d => d.category)))

  const renderKeyBadges = (keyStr: string) => {
    const parts = parseKeyCombination(keyStr)
    if (parts.length === 0) {
      return <span className={styles.unassigned}>Unassigned</span>
    }
    return (
      <>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className={styles.plusSep}>+</span>}
            <kbd className={styles.kbd}>{part}</kbd>
          </React.Fragment>
        ))}
      </>
    )
  }

  const handleResetOne = (id: string, defaultKey: string) => {
    updateShortcut(id, defaultKey)
    addToast('Shortcut reset to default', 'info')
  }

  return (
    <div className={styles.scrim} onClick={() => setShortcutsModalOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.iconWrap}>
              <KeyboardIcon size={18} />
            </div>
            <div>
              <div className={styles.title}>Keyboard Controls & Shortcuts</div>
              <div className={styles.subtitle}>
                Customize keybindings to execute network operations instantly
              </div>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setShortcutsModalOpen(false)}
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <div className={styles.searchInputWrap}>
            <SearchIcon size={14} color="var(--text-muted)" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search shortcuts by name, key, or category…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                className={styles.clearSearchBtn}
                onClick={() => setSearch('')}
                title="Clear filter"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.emptySearch}>No shortcuts match "{search}"</div>
          ) : (
            categories.map(cat => {
              const catItems = filtered.filter(d => d.category === cat)
              if (catItems.length === 0) return null

              return (
                <div key={cat} className={styles.categoryGroup}>
                  <div className={styles.categoryHeader}>
                    <span className={styles.categoryDot} />
                    <span>{cat}</span>
                  </div>
                  <div className={styles.shortcutList}>
                    {catItems.map(def => {
                      const currentKey = shortcuts[def.id] !== undefined ? shortcuts[def.id] : def.defaultKey
                      const isRecording = recordingId === def.id
                      const isModified = currentKey !== def.defaultKey

                      return (
                        <div
                          key={def.id}
                          className={`${styles.shortcutRow} ${
                            isRecording ? styles.shortcutRowRecording : ''
                          }`}
                        >
                          <div className={styles.infoCol}>
                            <div className={styles.actionName}>{def.name}</div>
                            <div className={styles.actionDesc}>{def.description}</div>
                          </div>

                          <div className={styles.controlsCol}>
                            {isRecording ? (
                              <div className={styles.recordingBadge}>
                                <span className={styles.recordingDot} />
                                <span>Press keys… (Esc to cancel)</span>
                              </div>
                            ) : (
                              <div
                                className={styles.keyBadges}
                                onClick={() => setRecordingId(def.id)}
                                title="Click to remap shortcut"
                              >
                                {renderKeyBadges(currentKey)}
                              </div>
                            )}

                            {!isRecording && (
                              <button
                                type="button"
                                className={`${styles.rowBtn} ${styles.rowBtnPrimary}`}
                                onClick={() => setRecordingId(def.id)}
                                title="Change key combination"
                              >
                                Edit
                              </button>
                            )}

                            {!isRecording && isModified && (
                              <button
                                type="button"
                                className={styles.rowBtn}
                                onClick={() => handleResetOne(def.id, def.defaultKey)}
                                title={`Reset to default (${def.defaultKey})`}
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.hint}>
            Click <strong>Edit</strong> or any key badge, then press your new shortcut combo.
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => {
                resetAllShortcuts()
                addToast('All shortcuts restored to defaults', 'info')
              }}
            >
              Reset All
            </button>
            <button
              type="button"
              className={styles.doneBtn}
              onClick={() => setShortcutsModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
