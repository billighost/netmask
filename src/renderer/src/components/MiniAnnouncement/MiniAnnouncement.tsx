import React from 'react'
import { useStore } from '../../store'
import { activateMiniMode } from '../../mini-actions'
import styles from './MiniAnnouncement.module.css'

export const MiniAnnouncement: React.FC = () => {
  const dismissed = useStore(state => state.settings.miniAnnouncementDismissed)
  if (dismissed) return null
  return <aside className={styles.banner} aria-label="New in NetMask">
    <span className={styles.icon} aria-hidden="true">▣</span>
    <div><strong>Your connection, always in view. <span className={styles.newTag}>NEW</span></strong>
      <p>Keep a small NetMask window on your desktop while you work.</p>
      <button type="button" onClick={() => void activateMiniMode()}>Try mini mode <span aria-hidden="true">↗</span></button></div>
    <button type="button" className={styles.close} aria-label="Dismiss mini mode announcement forever"
      onClick={() => void useStore.getState().updateSetting('miniAnnouncementDismissed', true)}>×</button>
  </aside>
}
