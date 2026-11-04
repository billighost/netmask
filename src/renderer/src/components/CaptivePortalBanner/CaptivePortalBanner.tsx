import React, { useState } from 'react'
import { useStore } from '../../store'
import { GlobeIcon, CloseIcon, ExternalLinkIcon, RefreshIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { errorMessage } from '../../network-state'
import styles from './CaptivePortalBanner.module.css'

export const CaptivePortalBanner: React.FC = () => {
  const portal = useStore(state => state.captivePortal)
  const [checking, setChecking] = useState(false)
  const state = useStore.getState()
  if (!portal?.isCaptive) return null
  const openLogin = async () => {
    try { await window.nm.openExternal(portal.portalUrl || 'http://www.msftconnecttest.com/connecttest.txt'); state.addToast('Sign-in page opened in your browser.', 'info') }
    catch (error) { state.addToast(errorMessage(error, 'The sign-in page could not be opened'), 'error') }
  }
  const recheck = async () => {
    if (checking) return
    setChecking(true)
    try { const status = await window.nm.checkCaptivePortal(); state.setCaptivePortal(status); state.addToast(status.isCaptive ? 'This network still needs a sign-in.' : 'No Wi-Fi sign-in page detected.', 'info') }
    catch (error) { state.addToast(errorMessage(error, 'The connection check could not finish'), 'error') }
    finally { setChecking(false) }
  }
  return <section className={styles.banner} aria-label="Wi-Fi sign-in"><div className={styles.left}><GlobeIcon size={17} /><div><h2>This Wi-Fi needs a sign-in.<HelpTip label="Wi-Fi sign-in">Some hotel, guest, and public networks need a web sign-in before they allow internet access. Open the sign-in page, then check again.</HelpTip></h2><p>Open the network's sign-in page, then check again.</p></div></div>
    <div className={styles.actions}><button type="button" className={styles.loginButton} onClick={() => void openLogin()}>Open sign-in page<ExternalLinkIcon size={12} /></button>
      <button type="button" className={styles.iconButton} aria-label="Check Wi-Fi sign-in again" disabled={checking} onClick={() => void recheck()}><RefreshIcon size={13} /></button>
      <button type="button" className={styles.iconButton} aria-label="Dismiss Wi-Fi sign-in notice" onClick={() => state.setCaptivePortal(null)}><CloseIcon size={13} /></button>
    </div>
  </section>
}

