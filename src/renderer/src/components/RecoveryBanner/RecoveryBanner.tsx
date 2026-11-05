import React from 'react'
import { useStore } from '../../store'
import { selectNetworkAndFocus } from '../../network-actions'
import styles from './RecoveryBanner.module.css'

export const RecoveryBanner: React.FC = () => {
  const audit = useStore(state => state.recoveryAudit)
  const networks = useStore(state => state.networks)
  const syncPendingCount = networks.filter(network => network.nameSyncPending).length
  if (!audit || audit.attentionCount + syncPendingCount === 0) return null
  const details = [
    syncPendingCount ? `${syncPendingCount} name ${syncPendingCount === 1 ? 'needs' : 'need'} repair` : '',
    audit.attentionCount ? `${audit.attentionCount} unavailable recovery ${audit.attentionCount === 1 ? 'record needs' : 'records need'} attention` : ''
  ].filter(Boolean).join('. ') + '.'
  const repair = () => {
    const network = networks.find(item => item.nameSyncPending)
    if (network) selectNetworkAndFocus(network.guid)
    useStore.getState().setSettingsOpen(false)
  }
  const dismiss = async () => {
    try { await window.nm.dismissRecoveryAudit(); useStore.setState({ recoveryAudit: null }) }
    catch { useStore.getState().addToast('The recovery reminder could not be dismissed', 'error') }
  }
  return <section className={styles.banner} aria-live="polite">
    <div><strong>Saved names checked after the update</strong><span>{details}</span></div>
    {syncPendingCount > 0 && <button type="button" onClick={repair}>Review</button>}
    <button type="button" className={styles.dismiss} aria-label="Dismiss recovery check" onClick={() => void dismiss()}>×</button>
  </section>
}
