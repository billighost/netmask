import React, { useState } from 'react'
import { useStore } from '../../store'
import styles from './AdminBanner.module.css'

export const AdminBanner: React.FC = () => {
  const { adminOk } = useStore()
  const [requesting, setRequesting] = useState(false)
  if (adminOk) return null

  const handleElevate = async () => {
    if (requesting) return
    setRequesting(true)
    try {
      await window.nm.elevate()
    } catch {
      setRequesting(false)
    }
  }

  return (
    <div className={styles.banner}>
      <svg className={styles.lockIcon} width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span className={styles.text}>Renaming needs administrator access.</span>
      <button className={styles.btn} disabled={requesting} onClick={handleElevate}>
        {requesting ? 'Requesting...' : 'Grant access'}
      </button>
    </div>
  )
}

