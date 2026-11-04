import React, { useEffect, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import type { WifiQrData } from '../../types'
import { CloseIcon, CopyIcon, EyeIcon, EyeOffIcon, QrCodeIcon } from '../../icons'
import { Dialog } from '../Dialog/Dialog'
import { HelpTip } from '../Controls/HelpTip'
import { copyText } from '../../network-actions'
import { errorMessage } from '../../network-state'
import styles from '../Dialog/Panel.module.css'

export const WifiShareModal: React.FC = () => {
  const { profile, close } = useStore(state => ({ profile: state.wifiShareModalProfile, close: state.setWifiShareModalProfile }), shallow)
  const [data, setData] = useState<WifiQrData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setData(null); setShowPassword(false); setError(null)
    if (!profile) return
    let active = true
    setLoading(true)
    window.nm.getWifiQr(profile).then(value => { if (active) setData(value) })
      .catch(error => { if (active) setError(errorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [profile, attempt])
  if (!profile) return null
  return <Dialog label="Share Wi-Fi" onClose={() => close(null)} scrimClass={styles.scrim} modalClass={styles.modal}>
    <div className={styles.header}>
      <div className={styles.titleGroup}><QrCodeIcon size={16} /><span className={styles.title}>Share Wi-Fi</span></div>
      <button className={styles.closeBtn} aria-label="Close Wi-Fi sharing" onClick={() => close(null)}><CloseIcon size={14} /></button>
    </div>
    <div className={styles.body}>
      {loading ? <div className={styles.loadingWrap} role="status"><div className={styles.spinner} />Reading saved Wi-Fi credentials…</div>
        : error ? <div className="nm-error" role="alert">{error}<button className={styles.btn} onClick={() => setAttempt(value => value + 1)}>Try again</button></div>
        : data && <>
          <p className={styles.scanInstruction}>This QR code contains the network name and password. Anyone who scans it can read these credentials.</p>
          <div className={styles.qrCard}>
            <div className={styles.qrSvgWrap}>
              <img alt="Wi-Fi connection QR code" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data.svg)} style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div className={styles.scanInstruction}>Scan with your phone’s camera to join this network.</div>
          </div>
          <div className={styles.detailsGroup}>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Wi-Fi name<HelpTip label="Wi-Fi name">The name broadcast by your router. The QR code uses this name so another device can find the right network.</HelpTip></span><span className={styles.detailValue}>{data.ssid}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Security<HelpTip label="Wi-Fi security">The security method reported for this saved connection. An open network has no Wi-Fi password.</HelpTip></span><span className={styles.detailValue}>{data.auth || 'Unavailable'}</span></div>
            <div className={styles.detailRow}><span className={styles.detailLabel}>Password</span>
              <div className={styles.passwordWrap}><span className={styles.passwordText}>{data.password ? (showPassword ? data.password : '••••••••••••') : data.isOpen ? 'Open network' : 'Unavailable'}</span>
                {data.password && <button className={styles.iconBtn} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}</button>}
              </div>
            </div>
          </div>
          <div className={styles.actionRow}>
            {data.password && <button className={styles.btn + ' ' + styles.btnPrimary} onClick={() => void copyText(data.password, 'Wi-Fi password copied')}><CopyIcon size={13} />Copy password</button>}
            <button className={styles.btn} onClick={() => {
              const url = URL.createObjectURL(new Blob([data.svg], { type: 'image/svg+xml' }))
              const link = document.createElement('a'); link.href = url; link.download = 'netmask-wifi.svg'; document.body.append(link); link.click(); link.remove()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}><QrCodeIcon size={13} />Save QR image</button>
          </div>
        </>}
    </div>
  </Dialog>
}
