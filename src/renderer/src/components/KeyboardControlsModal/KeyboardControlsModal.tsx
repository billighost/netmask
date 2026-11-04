import { shallow } from 'zustand/shallow'
import React, { useState, useEffect } from 'react'
import { useStore, DEFAULT_SHORTCUTS } from '../../store'
import type { ShortcutDefinition } from '../../types'
import { KeyboardIcon, CloseIcon, SearchIcon, RefreshIcon, CheckIcon } from '../../icons'
import styles from '../Dialog/Panel.module.css'
import { Dialog } from '../Dialog/Dialog'
import { normalizeKeyCombination, parseKeyCombination, shortcutEquals, shortcutKeyLabel } from '../../keyboard-shortcuts'

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'refresh',
    name: 'Refresh networks',
    description: 'Check saved networks and your current connection again.',
    category: 'Networks',
    defaultKey: 'Ctrl+R'
  },
  {
    id: 'focusRename',
    name: 'Edit display name',
    description: 'Move to the name box for the selected network.',
    category: 'Networks',
    defaultKey: 'Ctrl+N'
  },
  {
    id: 'applyRename',
    name: 'Save name',
    description: 'Save the name in the editor.',
    category: 'Networks',
    defaultKey: 'Ctrl+Enter'
  },
  {
    id: 'restoreOriginal',
    name: 'Restore original name',
    description: 'Put back the original name saved on this device.',
    category: 'Networks',
    defaultKey: 'Ctrl+Shift+Z'
  },
  {
    id: 'reconnectWifi',
    name: 'Reconnect Wi-Fi',
    description: 'Connect using the selected saved Wi-Fi profile.',
    category: 'Networks',
    defaultKey: 'Ctrl+Shift+R'
  },
  {
    id: 'viewDetails',
    name: 'Network details',
    description: 'See signal strength, security, and connection details.',
    category: 'Networks',
    defaultKey: 'Ctrl+D'
  },
  {
    id: 'selectNext',
    name: 'Next network',
    description: 'Select the next visible network.',
    category: 'Navigation',
    defaultKey: 'ArrowDown'
  },
  {
    id: 'selectPrev',
    name: 'Previous network',
    description: 'Select the previous visible network.',
    category: 'Navigation',
    defaultKey: 'ArrowUp'
  },
  {
    id: 'filterSearch',
    name: 'Find a network',
    description: 'Move to the saved network search box.',
    category: 'Navigation',
    defaultKey: 'Ctrl+F'
  },
  {
    id: 'closeModals',
    name: 'Close a panel',
    description: 'Close the current menu or dialog.',
    category: 'Navigation',
    defaultKey: 'Escape'
  },
  {
    id: 'toggleStreamer',
    name: 'Use a private display name',
    description: 'Switch between your private name and your usual name.',
    category: 'Privacy',
    defaultKey: 'Ctrl+Shift+S'
  },
  {
    id: 'peekBssid',
    name: 'Show the access point address',
    description: 'Reveal the hidden router address for three seconds.',
    category: 'Privacy',
    defaultKey: 'Ctrl+Shift+B'
  },
  {
    id: 'trimMemory',
    name: 'Release unused memory',
    description: 'Ask Windows to trim the memory currently held by NetMask.',
    category: 'App',
    defaultKey: 'Ctrl+Shift+M'
  },
  {
    id: 'runSpeedTest',
    name: 'Test download speed',
    description: 'Measure a 3 MB sample download from Cloudflare.',
    category: 'App',
    defaultKey: 'Ctrl+Shift+T'
  },
  {
    id: 'openSettings',
    name: 'Open settings',
    description: 'Change your NetMask preferences.',
    category: 'App',
    defaultKey: 'Ctrl+,'
  },
  {
    id: 'openShortcuts',
    name: 'Keyboard controls',
    description: 'See and change your keyboard shortcuts.',
    category: 'App',
    defaultKey: 'Ctrl+/'
  }
]

export const KeyboardControlsModal: React.FC = () => {
  const {
    shortcutsModalOpen,
    setShortcutsModalOpen,
    settings,
    updateShortcut,
    resetAllShortcuts,
    addToast
  } = useStore(state => ({ shortcutsModalOpen: state.shortcutsModalOpen, setShortcutsModalOpen: state.setShortcutsModalOpen, settings: state.settings, updateShortcut: state.updateShortcut, resetAllShortcuts: state.resetAllShortcuts, addToast: state.addToast }), shallow)

  const [search, setSearch] = useState('')
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const platform = useStore(state => state.capabilities?.platform)

  // Shortcuts map: merge user settings with fallback defaults
  const shortcuts = settings.shortcuts || DEFAULT_SHORTCUTS

  useEffect(() => { if (!shortcutsModalOpen) setRecordingId(null) }, [shortcutsModalOpen])

  useEffect(() => {
    if (!recordingId) return

    const handleKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Allow Escape to cancel recording without changing
      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }

      // Allow Backspace or Delete without modifiers to unassign
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setRecordingId(null)
        if (await updateShortcut(recordingId, '')) addToast('Shortcut unassigned', 'info')
        return
      }

      const combo = normalizeKeyCombination(e)
      if (!combo) return

      // Conflict detection: check if another action uses this shortcut
      const conflicting = Object.entries(shortcuts).find(
        ([id, key]) => id !== recordingId && shortcutEquals(key, combo, platform)
      )

      setRecordingId(null)
      if (!await updateShortcut(recordingId, combo)) return

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
  }, [recordingId, shortcuts, updateShortcut, addToast, platform])

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
            <kbd className={styles.kbd}>{shortcutKeyLabel(part, platform)}</kbd>
          </React.Fragment>
        ))}
      </>
    )
  }

  const handleResetOne = async (id: string, defaultKey: string) => {
    if (await updateShortcut(id, defaultKey)) addToast('Shortcut reset to default', 'info')
  }

  return (
    <Dialog label="Keyboard controls" onClose={() => setShortcutsModalOpen(false)} scrimClass={styles.scrim} modalClass={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.iconWrap}>
              <KeyboardIcon size={18} />
            </div>
            <div>
              <div className={styles.title}>Keyboard controls</div>
              <div className={styles.subtitle}>
                Choose a shortcut, then press the keys you want to use.
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
              placeholder="Find a shortcut…"
              aria-label="Find a keyboard shortcut"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                className={styles.clearSearchBtn}
                onClick={() => setSearch('')}
                aria-label="Clear shortcut search"
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
                              <button
                                className={styles.keyBadges}
                                onClick={() => setRecordingId(def.id)}
                                aria-label={'Change shortcut for ' + def.name}
                              >
                                {renderKeyBadges(currentKey)}
                              </button>
                            )}

                            {!isRecording && (
                              <button
                                type="button"
                                className={`${styles.rowBtn} ${styles.rowBtnPrimary}`}
                                onClick={() => setRecordingId(def.id)}
                                aria-label={'Edit shortcut for ' + def.name}
                              >
                                Edit
                              </button>
                            )}

                            {!isRecording && isModified && (
                              <button
                                type="button"
                                className={styles.rowBtn}
                                onClick={() => handleResetOne(def.id, def.defaultKey)}
                                aria-label={'Reset shortcut for ' + def.name}
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
            Choose <strong>Edit</strong>, then press the keys you want to use.
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={async () => {
                if (await resetAllShortcuts()) addToast('All shortcuts restored to defaults', 'info')
              }}
            >
              Reset all
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
    </Dialog>
  )
}
