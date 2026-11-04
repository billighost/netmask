import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { NetMaskLogoIcon, MinimizeIcon, MaximizeIcon, RestoreWindowIcon, WindowCloseIcon, GearIcon } from '../../icons'
import styles from './TitleBar.module.css'

export const TitleBar: React.FC = () => {
  const { setSettingsOpen } = useStore()
  const [isMax, setIsMax] = useState(false)
  const [appVersion, setAppVersion] = useState('2.1.2')

  useEffect(() => {
    window.nm.getVersion?.().then(setAppVersion).catch(() => {})
    window.nm.isMaximized().then(setIsMax).catch(() => {})
    const unsub = window.nm.onMaximizeChange(setIsMax)
    return () => unsub()
  }, [])

  const handleMinimize = () => window.nm.minimize()
  const handleMaximize = async () => {
    const next = await window.nm.maximize()
    setIsMax(next)
  }
  const handleClose = () => window.nm.close()

  return (
    <div className={styles.bar} id="title-bar" data-tauri-drag-region onDoubleClick={handleMaximize}>
      <div className={styles.dragRegion} data-tauri-drag-region />
      <div className={styles.left}>
        <NetMaskLogoIcon size={18} className={styles.logo} />
        <span className={styles.title}>NetMask</span>
        <span className={styles.versionBadge}>v{appVersion}</span>
      </div>
      <div className={styles.controls}>
        <button
          className={styles.ctrlBtn}
          title="Settings"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon size={13} />
        </button>
        <button
          className={styles.ctrlBtn}
          title="Minimize"
          onMouseDown={e => e.stopPropagation()}
          onClick={handleMinimize}
        >
          <MinimizeIcon size={12} />
        </button>
        <button
          className={styles.ctrlBtn}
          title={isMax ? 'Restore' : 'Maximize'}
          onMouseDown={e => e.stopPropagation()}
          onClick={handleMaximize}
        >
          {isMax ? <RestoreWindowIcon size={11} /> : <MaximizeIcon size={11} />}
        </button>
        <button
          className={`${styles.ctrlBtn} ${styles.closeBtn}`}
          title="Close to tray"
          onMouseDown={e => e.stopPropagation()}
          onClick={handleClose}
        >
          <WindowCloseIcon size={12} />
        </button>
      </div>
    </div>
  )
}
