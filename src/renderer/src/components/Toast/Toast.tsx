import React from 'react'
import { useStore } from '../../store'
import { CheckIcon, CloseIcon, InfoIcon } from '../../icons'
import styles from './Toast.module.css'

export const ToastContainer: React.FC = () => {
  const { toasts } = useStore()

  return (
    <div className={styles.container}>
      {toasts.map(t => (
        <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} />
      ))}
    </div>
  )
}

const ToastItem: React.FC<{ id: string; message: string; type: string }> = ({ id, message, type }) => {
  const { removeToast } = useStore()

  return (
    <div className={`${styles.toast} ${styles[type] || ''}`} role="alert">
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
        title="Dismiss"
      >
        <CloseIcon size={10} />
      </button>
    </div>
  )
}

