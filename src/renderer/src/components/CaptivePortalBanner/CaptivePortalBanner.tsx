import React from 'react'
import { useStore } from '../../store'
import { GlobeIcon, CloseIcon, ExternalLinkIcon, RefreshIcon } from '../../icons'
import styles from './CaptivePortalBanner.module.css'

export const CaptivePortalBanner: React.FC = () => {
  const captivePortal = useStore(s => s.captivePortal)
  const setCaptivePortal = useStore(s => s.setCaptivePortal)
  const addToast = useStore(s => s.addToast)

  if (!captivePortal || !captivePortal.isCaptive) return null

  const handleOpenLogin = () => {
    const url = captivePortal.portalUrl || 'http://www.msftconnecttest.com/connecttest.txt'
    window.nm.openExternal(url).catch(() => {})
    addToast('Opening captive portal web login in browser...', 'info')
  }

  const handleRecheck = async () => {
    try {
      const status = await window.nm.checkCaptivePortal()
      setCaptivePortal(status)
      if (!status.isCaptive) {
        addToast('Internet access verified! Captive portal resolved.', 'success')
      } else {
        addToast('Captive portal still active. Please log in.', 'info')
      }
    } catch {
      addToast('Error checking network access', 'error')
    }
  }

  return (
    <div className={styles.banner}>
      <div className={styles.left}>
        <div className={styles.iconWrap}>
          <GlobeIcon size={16} color="#fbbf24" />
        </div>
        <div className={styles.textWrap}>
          <div className={styles.title}>Wi-Fi Web Login Required</div>
          <div className={styles.sub}>
            A captive portal was detected on this network. Log in to activate full internet access.
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.loginBtn}
          onClick={handleOpenLogin}
          title="Open Wi-Fi login portal page in your default web browser"
        >
          <span>Open Login Portal</span>
          <ExternalLinkIcon size={12} />
        </button>
        <button
          type="button"
          className={styles.recheckBtn}
          onClick={handleRecheck}
          title="Re-check internet connectivity"
        >
          <RefreshIcon size={13} />
        </button>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setCaptivePortal(null)}
          title="Dismiss notification"
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  )
}

