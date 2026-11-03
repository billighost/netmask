import React, { useEffect, useState } from 'react'
import { useStore } from '../../store'
import type { WifiQrData } from '../../types'
import { CloseIcon, WifiIcon, CopyIcon, EyeIcon, EyeOffIcon, QrCodeIcon, CheckIcon } from '../../icons'
import styles from './WifiShareModal.module.css'

export const WifiShareModal: React.FC = () => {
  const { wifiShareModalProfile, setWifiShareModalProfile, addToast } = useStore()
  const [data, setData] = useState<WifiQrData | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)
  const [copiedSvg, setCopiedSvg] = useState(false)

  useEffect(() => {
    if (!wifiShareModalProfile) {
      setData(null)
      setShowPassword(false)
      setCopiedPass(false)
      setCopiedSvg(false)
      return
    }

    let active = true
    setLoading(true)
    window.nm.getWifiQr(wifiShareModalProfile)
      .then(d => {
        if (active) {
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [wifiShareModalProfile])

  if (!wifiShareModalProfile) return null

  const handleCopyPassword = () => {
    if (!data?.password) {
      addToast('No password required for open network', 'info')
      return
    }
    navigator.clipboard.writeText(data.password)
    setCopiedPass(true)
    setTimeout(() => setCopiedPass(false), 2000)
    addToast('Wi-Fi password copied to clipboard', 'success')
  }

  const handleCopySvg = () => {
    if (!data?.svg) return
    navigator.clipboard.writeText(data.svg)
    setCopiedSvg(true)
    setTimeout(() => setCopiedSvg(false), 2000)
    addToast('QR Code SVG vector copied to clipboard', 'success')
  }

  return (
    <div className={styles.scrim} onClick={() => setWifiShareModalProfile(null)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <QrCodeIcon size={16} color="var(--accent)" />
            <span className={styles.title}>Instant Wi-Fi Share</span>
          </div>
          <button className={styles.closeBtn} onClick={() => setWifiShareModalProfile(null)}>
            <CloseIcon size={14} />
          </button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loadingWrap}>
              <div className={styles.spinner} />
              <span>Generating encrypted Wi-Fi QR Code...</span>
            </div>
          ) : data ? (
            <>
              {/* QR Code Container */}
              <div className={styles.qrCard}>
                <div
                  className={styles.qrSvgWrap}
                  dangerouslySetInnerHTML={{ __html: data.svg }}
                />
                <div className={styles.scanInstruction}>
                  Point camera on iOS or Android to connect instantly without typing passwords
                </div>
              </div>

              {/* Wi-Fi Details */}
              <div className={styles.detailsGroup}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Network SSID</span>
                  <span className={styles.detailValue}>{data.ssid}</span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Security</span>
                  <span className={styles.detailValue}>{data.auth || 'WPA2/WPA3'}</span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Wi-Fi Password</span>
                  <div className={styles.passwordWrap}>
                    <span className={styles.passwordText}>
                      {data.password
                        ? (showPassword ? data.password : '••••••••••••')
                        : 'None (Open Network)'
                      }
                    </span>
                    {data.password && (
                      <div className={styles.passActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={() => setShowPassword(v => !v)}
                          title={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          onClick={handleCopyPassword}
                          title="Copy password"
                        >
                          {copiedPass ? <CheckIcon size={14} color="var(--green)" /> : <CopyIcon size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={styles.actionRow}>
                {data.password && (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    onClick={handleCopyPassword}
                  >
                    <CopyIcon size={13} />
                    <span>Copy Password</span>
                  </button>
                )}
                <button
                  type="button"
                  className={styles.btn}
                  onClick={handleCopySvg}
                >
                  <QrCodeIcon size={13} />
                  <span>{copiedSvg ? 'Copied SVG!' : 'Copy QR SVG'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className={styles.loadingWrap}>
              <span>Could not generate Wi-Fi QR code for this profile</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

