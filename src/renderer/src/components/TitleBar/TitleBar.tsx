import { shallow } from 'zustand/shallow'
import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import { NetMaskLogoIcon, MinimizeIcon, MaximizeIcon, RestoreWindowIcon, WindowCloseIcon, GearIcon } from '../../icons'
import styles from './TitleBar.module.css'
import { errorMessage } from '../../network-state'
import { Tooltip } from '../Controls/Tooltip'

export const TitleBar: React.FC = () => {
  const { setSettingsOpen } = useStore(state => ({ setSettingsOpen: state.setSettingsOpen }), shallow)
  const [isMax, setIsMax] = useState(false)
  const [appVersion, setAppVersion] = useState('…')
  const closeToTray = useStore(state => state.settings.minimizeToTray)

  useEffect(() => {
    window.nm.getVersion().then(setAppVersion).catch(() => {})
    window.nm.isMaximized().then(setIsMax).catch(() => {})
    const unsub = window.nm.onMaximizeChange(setIsMax)
    return () => unsub()
  }, [])

  const handleMinimize = () => window.nm.minimize().catch(error => useStore.getState().addToast(errorMessage(error), 'error'))
  const handleMaximize = async () => {
    try { setIsMax(await window.nm.maximize()) }
    catch (error) { useStore.getState().addToast(errorMessage(error), 'error') }
  }
  const handleClose = () => window.nm.close().catch(error => useStore.getState().addToast(errorMessage(error), 'error'))

  return (
    <div className={styles.bar} id="title-bar">
      <div className={styles.dragRegion} data-tauri-drag-region onDoubleClick={handleMaximize} />
      <div className={styles.left}>
        <NetMaskLogoIcon size={18} className={styles.logo} />
        <span className={styles.title}>NetMask</span>
        <span className={styles.versionBadge}>v{appVersion}</span>
      </div>
      <div className={styles.controls}>
        <Tooltip label="Settings">
        <button
          className={styles.ctrlBtn}
          aria-label="Open settings"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setSettingsOpen(true)}
        >
          <GearIcon size={13} />
        </button>
        </Tooltip>
        <Tooltip label="Minimize">
        <button
          className={styles.ctrlBtn}
          aria-label="Minimize window"
          onMouseDown={e => e.stopPropagation()}
          onClick={handleMinimize}
        >
          <MinimizeIcon size={12} />
        </button>
        </Tooltip>
        <Tooltip label={isMax ? 'Restore window size' : 'Maximize'}>
        <button
          className={styles.ctrlBtn}
          aria-label={isMax ? 'Restore window size' : 'Maximize window'}
          onMouseDown={e => e.stopPropagation()}
          onClick={handleMaximize}
        >
          {isMax ? <RestoreWindowIcon size={11} /> : <MaximizeIcon size={11} />}
        </button>
        </Tooltip>
        <Tooltip label={closeToTray ? 'Close to tray' : 'Quit NetMask'}>
        <button
          className={`${styles.ctrlBtn} ${styles.closeBtn}`}
          aria-label={closeToTray ? 'Close to tray' : 'Quit NetMask'}
          onMouseDown={e => e.stopPropagation()}
          onClick={handleClose}
        >
          <WindowCloseIcon size={12} />
        </button>
        </Tooltip>
      </div>
    </div>
  )
}
