import React from 'react'
import { shallow } from 'zustand/shallow'
import { useStore } from '../../store'
import { updateMiniPreferences, activateMiniMode } from '../../mini-actions'
import { MINI_DESIGNS, MINI_METRICS, miniWidgetSize, toggleMiniMetric } from '../../mini-display'
import { sharingModeActive, wiredNetworkState } from '../../network-state'
import { MiniWidgetPreview } from '../MiniWidget/MiniWidget'
import { Toggle } from '../Controls/Toggle'
import { HelpTip } from '../Controls/HelpTip'
import type { MiniMetric } from '../../types'
import styles from './MiniSettingsPanel.module.css'

const metricNames: Record<MiniMetric, string> = { download: 'Live download', upload: 'Live upload', link: 'Wi-Fi link speed', signal: 'Signal strength', latency: 'Internet latency' }

export const MiniSettingsPanel: React.FC = () => {
  const { preferences, connection, networks, speed, ping, sharing, mask } = useStore(state => ({ preferences: state.settings.miniWidget,
    connection: state.connection, networks: state.networks, speed: state.speed, ping: state.pingTelemetry,
    sharing: sharingModeActive(state.streamerStatus, state.streamerBusy), mask: state.settings.streamerMaskName }), shallow)
  const update = updateMiniPreferences
  const wired = connection ? null : wiredNetworkState(networks)
  return <div className={styles.panel}>
    <div className={styles.intro}><div><h3>A little more in view</h3><p>Pick a window that feels right on your desktop. Drag it anywhere and right-click for quick controls.</p></div>
      <button type="button" className={styles.activate} onClick={() => void activateMiniMode()}>Open mini mode <span aria-hidden="true">↗</span></button></div>
    <div className={styles.designs} role="group" aria-label="Mini window style">{MINI_DESIGNS.map(design => {
      const previewPreferences = { ...preferences, design: design.value, opacity: 100, size: 100 }
      const dimensions = miniWidgetSize(previewPreferences)
      const scale = Math.min(135 / dimensions.width, 105 / dimensions.height)
      return <div key={design.value} className={styles.design + (preferences.design === design.value ? ' ' + styles.selected : '')}>
        <div className={styles.thumb}><div style={{ width: dimensions.width * scale, height: dimensions.height * scale }}>
          <div className={styles.scaled} style={{ transform: `scale(${scale})` }}><MiniWidgetPreview preferences={previewPreferences}
            connection={connection} connected={Boolean(connection || wired)} connectionStatus={wired ? 'Wired' : undefined} fallbackConnectionKey={wired?.key}
            speed={speed} pingTelemetry={ping} displayName={sharing ? mask : connection?.name ?? wired?.name} /></div></div></div>
        <button type="button" className={styles.chooseDesign} aria-label={design.label} aria-pressed={preferences.design === design.value}
          onClick={() => void update({ design: design.value })}>
          <span className={styles.designLabel}>{design.label}<span aria-hidden="true">{preferences.design === design.value ? '✓' : '○'}</span></span>
          <span className={styles.description}>{design.description}</span>
        </button>
      </div>
    })}</div>
    <section className={styles.section}>
      <Toggle label="Tiny mode" sub="Just Wi-Fi link speed, in a very small window. Available for every style."
        on={preferences.minimal} onChange={minimal => void update({ minimal })} />
      <p className={styles.note}>Wi-Fi link speed is the connection to your router. Internet speed and current traffic are different readings.</p>
    </section>
    <section className={styles.section} aria-label="Window appearance">
      <div className={styles.slider}><label htmlFor="mini-opacity">Opacity <output htmlFor="mini-opacity">{preferences.opacity}%</output></label>
        <input id="mini-opacity" type="range" min="35" max="100" step="1" value={preferences.opacity} style={{ '--range-fill': `${(preferences.opacity - 35) / 65 * 100}%` } as React.CSSProperties}
          onChange={event => void update({ opacity: Number(event.target.value) })} /></div>
      <div className={styles.slider}><label htmlFor="mini-size">Size <output htmlFor="mini-size">{preferences.size}%</output></label>
        <input id="mini-size" type="range" min="75" max="140" step="5" value={preferences.size} style={{ '--range-fill': `${(preferences.size - 75) / 65 * 100}%` } as React.CSSProperties}
          onChange={event => void update({ size: Number(event.target.value) })} /><div className={styles.rangeEnds}><span>Smaller</span><span>Larger</span></div></div>
    </section>
    <section className={styles.section}><h4>Readings in the full widget <HelpTip label="Mini window readings">Live download and upload show current traffic across this computer's physical network adapters. Wi-Fi link speed is the adapter's receive link rate. Signal and latency appear only when measured values are available.</HelpTip></h4>
      {MINI_METRICS.map(metric => <Toggle key={metric} label={metricNames[metric]} on={preferences.metrics.includes(metric)} disabled={preferences.minimal || preferences.metrics.length === 1 && preferences.metrics.includes(metric)}
        onChange={enabled => void update({ metrics: toggleMiniMetric(preferences, metric, enabled) })} />)}
      <p className={styles.note}>{preferences.minimal ? 'Tiny mode always shows Wi-Fi link speed. Your other readings are kept for the full widget.' : 'Keep at least one reading selected. Unavailable readings stay visibly missing.'}</p>
    </section>
    <p className={styles.note}>Your choices save as you change them. The window stays above other apps.</p>
  </div>
}
