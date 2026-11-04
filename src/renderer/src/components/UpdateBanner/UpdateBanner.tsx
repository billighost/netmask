import React, { useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { SparkleIcon, DownloadIcon } from '../../icons'
import { downloadAppUpdate, installAppUpdate, openWebPage } from '../../update-actions'
import styles from './UpdateBanner.module.css'

export const UpdateBanner: React.FC = () => {
  const { update, downloading, progress, version } = useStore(state => ({
    update: state.updateInfo, downloading: state.updateDownloading, progress: state.downloadProgress, version: state.downloadedVersion
  }), shallow)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  if (!update || dismissedVersion === update.version) return null
  const ready = version === update.version
  return <div className={styles.banner} role="status">
    <div className={styles.iconWrap}><SparkleIcon size={16} /></div>
    <div className={styles.content}><div className={styles.titleRow}>
      <span className={styles.badge}>Update available</span><strong className={styles.version}>v{update.version}</strong>
      <span className={styles.subtext}>{progress ? 'Downloading ' + Math.round(progress.percent) + '%' : ready ? 'Ready to install' : update.name}</span>
    </div></div>
    <div className={styles.actions}>
      <button className={styles.notesBtn} onClick={() => void openWebPage(update.url)}>Notes</button>
      <button className={styles.updateBtn} disabled={downloading} onClick={() => void (ready ? installAppUpdate() : downloadAppUpdate(update))}>
        <DownloadIcon size={13} />{downloading ? 'Downloading…' : ready ? 'Open installer' : update.downloadUrl ? 'Download' : 'View release'}
      </button>
      <button className={styles.closeBtn} aria-label="Dismiss update notification" onClick={() => setDismissedVersion(update.version)}>×</button>
    </div>
  </div>
}
