import React from 'react'
import { useStore } from '../../store'
import styles from './CompanionNav.module.css'

export const CompanionNav: React.FC = () => {
  const active = useStore(state => state.activeView)
  const setActive = useStore(state => state.setActiveView)
  return <nav className={styles.nav} aria-label="NetMask sections">
    {([['overview', 'Overview'], ['journal', 'Journal']] as const).map(([id, label]) => <button key={id} type="button"
      aria-current={active === id ? 'page' : undefined} className={active === id ? styles.active : ''} onClick={() => setActive(id)}>{label}</button>)}
  </nav>
}
