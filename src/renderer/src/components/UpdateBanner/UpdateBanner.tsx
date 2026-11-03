import React, { useState, useEffect } from 'react'
import type { UpdateInfo } from '../../types'
import { useStore } from '../../store'
import { SparkleIcon, DownloadIcon } from '../../icons'
import styles from './UpdateBanner.module.css'

export const UpdateBanner: React.FC = () => {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const {
    addToast,
    downloadProgress,
    setDownloadProgress,
    downloadedVersion,
    setDownloadedVersion
  } = useStore()

  useEffect(() => {
    // Listen for push notifications from main process
    const unsub = window.nm.onUpdateAvailable((info) => {
      setUpdate(info)
    })

    const unsubProgress = window.nm.onUpdateProgress((p) => {
      setDownloadProgress(p)
    })

    const unsubDownloaded = window.nm.onUpdateDownloaded((info) => {
      setIsUpdating(false)
      setDownloadedVersion(info.version)
      setDownloadProgress(null)
      addToast(`NetMask v${info.version} downloaded!`, 'success')
    })

    // Synchronize existing update / download status immediately
    window.nm.getUpdateStatus?.().then((status) => {
      if (!status) return
      if (status.availableUpdate) setUpdate(status.availableUpdate)
      if (status.downloadedVersion) setDownloadedVersion(status.downloadedVersion)
      if (status.progress) setDownloadProgress(status.progress)
      if (status.isDownloading) setIsUpdating(true)
    }).catch(() => {})

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
      unsubProgress()
      unsubDownloaded()
    }
  }, [])

  if (!update || dismissed) return null

  const isDownloaded = downloadedVersion === update.version

  const handleUpdate = async () => {
    if (isDownloaded) {
      addToast('Launching updater and restarting NetMask...', 'info')
      try {
        await window.nm.installUpdate()
      } catch {
        addToast('Failed to launch installer', 'error')
      }
      return
    }

    setIsUpdating(true)
    addToast(`Downloading NetMask v${update.version}...`, 'info')
    try {
      const res = await window.nm.downloadUpdate(update.downloadUrl)
      if (res.success) {
        if (res.alreadyDownloaded || (res.filePath && !res.inProgress)) {
          setDownloadedVersion(update.version)
          setIsUpdating(false)
          addToast(`NetMask v${update.version} ready to install!`, 'success')
        } else if (res.inProgress) {
          setIsUpdating(true)
        } else {
          setDownloadedVersion(update.version)
          setIsUpdating(false)
          addToast(`NetMask v${update.version} ready to install!`, 'success')
        }
      } else {
        // Fallback to browser only if stream download actually failed
        addToast('In-app download issue; opening release download in browser...', 'info')
        await window.nm.openReleaseUrl(update.downloadUrl || update.url)
      }
    } catch {
      try {
        await window.nm.openReleaseUrl(update.downloadUrl || update.url)
      } catch {}
    } finally {
      if (!downloadProgress) {
        setIsUpdating(false)
      }
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
            {downloadProgress
              ? `Downloading ${downloadProgress.percent}% (${(downloadProgress.transferred / (1024 * 1024)).toFixed(1)} / ${(downloadProgress.total / (1024 * 1024)).toFixed(1)} MB)`
              : isDownloaded
              ? '— Update downloaded and ready to install!'
              : update.name && update.name !== update.version
              ? `— ${update.name}`
              : 'is ready to download'}
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
          disabled={isUpdating && !downloadProgress}
          title={isDownloaded ? 'Restart NetMask and install update' : `Download NetMask v${update.version}`}
        >
          <DownloadIcon size={13} />
          <span>
            {isDownloaded
              ? 'Restart & Install'
              : downloadProgress
              ? `${downloadProgress.percent}%`
              : isUpdating
              ? 'Starting…'
              : 'Update now'}
          </span>
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
