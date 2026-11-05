import { shallow } from 'zustand/shallow'
import React from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import { CheckIcon, CloseIcon, InfoIcon } from '../../icons'
import styles from './Toast.module.css'
import { sharingModeActive } from '../../network-state'

export const ToastContainer: React.FC = () => {
  const { toasts, sharing } = useStore(state => ({ toasts: state.toasts, sharing: sharingModeActive(state.streamerStatus, state.streamerBusy) }), shallow)

  return createPortal(
    <div className={styles.container} aria-label="Notifications">
      {toasts.map(t => (
        <ToastItem key={t.id} id={t.id} message={sharing ? t.type === 'error' ? 'An action needs attention. Exit sharing mode for details.' : t.type === 'loading' ? 'Working…' : 'Action completed.' : t.message} type={t.type} />
      ))}
    </div>, document.body
  )
}

const ToastItem: React.FC<{ id: string; message: string; type: string }> = ({ id, message, type }) => {
  const { removeToast } = useStore(state => ({ removeToast: state.removeToast }), shallow)

  return (
    <div className={`${styles.toast} ${styles[type] || ''}`} role={type === 'error' ? 'alert' : 'status'}>
      <div className={`${styles.badge} ${styles[`${type}Badge`] || ''}`}>
        {type === 'success' && <CheckIcon size={12} color="var(--green, #3dd68c)" />}
        {type === 'error' && <CloseIcon size={11} color="var(--red, #f0606a)" />}
        {type === 'info' && <InfoIcon size={12} color="var(--accent, #4f8ef7)" />}
        {type === 'loading' && <span className={styles.spinner} />}
      </div>
      <div className={styles.content}>
        <span className={styles.msg}>{message}</span>
      </div>
      <button
        className={styles.close}
        onClick={() => removeToast(id)}
        aria-label="Dismiss notification"
      >
        <CloseIcon size={10} />
      </button>
    </div>
  )
}

