import React, { useState, useEffect } from 'react'
import type { UpdateInfo } from '../../types'
import { useStore } from '../../store'
import { SparkleIcon, DownloadIcon } from '../../icons'
import styles from './UpdateBanner.module.css'

export const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const { addToast } = useStore()

  useEffect(() => {
    // Listen for push notifications from main process
    const unsub = window.nm.onUpdateAvailable((info) => {
      setUpdate(info)
    })

    // Check automatically on mount after a short delay
    const timer = setTimeout(async () => {
      try {
        const found = await window.nm.checkUpdate()
        if (found) {
          setUpdate(found)
        }
      } catch (err) {
        // Silently catch offline or check failure
      }
    }, 3500)

    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  if (!update || dismissed) return null

  const handleUpdate = async () => {
    setIsUpdating(true)
    addToast(`Opening NetMask ${update.version} download...`, 'info')
    try {
      await window.nm.openReleaseUrl(update.downloadUrl || update.url)
    } catch {
      addToast('Could not open update URL', 'error')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleNotes = async () => {
    try {
      await window.nm.openReleaseUrl(update.url)
    } catch {}
  }

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.glow} />
      <div className={styles.iconWrap}>
        <SparkleIcon size={16} />
      </div>

      <div className={styles.content}>
        <div className={styles.titleRow}>
          <span className={styles.badge}>Update Available</span>
          <strong className={styles.version}>v{update.version}</strong>
          <span className={styles.subtext}>
            {update.name && update.name !== update.version ? `— ${update.name}` : 'is ready to install'}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.notesBtn}
          onClick={handleNotes}
          title="View full release notes on GitHub"
        >
          Notes
        </button>
        <button
          className={styles.updateBtn}
          onClick={handleUpdate}
          disabled={isUpdating}
          title={`Download NetMask v${update.version}`}
        >
          <DownloadIcon size={13} />
          <span>{isUpdating ? 'Opening...' : 'Update now'}</span>
        </button>
        <button
          className={styles.closeBtn}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notification"
          title="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
