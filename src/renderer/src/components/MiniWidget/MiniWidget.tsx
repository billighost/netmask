import React, { useEffect, useId, useRef, useState } from 'react'
import type { Connection, SpeedSample, PingTelemetry, MiniMetric, MiniWidgetPreferences } from '../../types'
import { miniActivityPath, miniReadings, miniVisibleReadings, miniWidgetBaseSize, miniWidgetSize, miniWidgetScale, normalizeMiniPreferences, toggleMiniMetric, MINI_METRICS } from '../../mini-display'
import type { MiniReading } from '../../mini-display'
import { connectionKey as connectionIdentity } from '../../network-state'
import { NetMaskLogoIcon, WifiIcon, ArrowDownIcon, ArrowUpIcon } from '../../icons'
import { Popover } from '../Controls/Popover'
import styles from './MiniWidget.module.css'

type Action = () => void | Promise<void>
export type MiniWidgetProps = {
  preferences: MiniWidgetPreferences
  connection: Connection | null
  speed: SpeedSample
  pingTelemetry: PingTelemetry | null
  displayName?: string
  connected?: boolean
  connectionStatus?: string
  fallbackConnectionKey?: string | null
  connectionError?: boolean
  offset?: {top: number; right: number}
  effectiveScale?: number
  preview?: boolean
  readingsPaused?: boolean
  onPreferencesChange: (patch: Partial<MiniWidgetPreferences>) => void | Promise<void>
  onStartDrag: Action
  onRestoreFull: Action
  onCustomize: Action
  onMenuOpenChange?: (open: boolean) => void | Promise<void>
  onToggleReadingsPaused?: Action
}

const Reading: React.FC<{ reading: MiniReading; focal?: boolean }> = ({ reading, focal = false }) =>
  <div className={`${styles.reading} ${focal ? styles.focalReading : ''}`} data-mini-metric={reading.id} data-available={reading.available} title={reading.available ? reading.detail : `${reading.label} is unavailable. ${reading.detail}`}>
    <span className={styles.readingLabel}>{reading.id === 'download' ? <ArrowDownIcon size={10} /> : reading.id === 'upload' ? <ArrowUpIcon size={10} /> : null}{reading.label}</span>
    <strong className={styles.readingValue}>{reading.value}<small>{reading.unit}</small></strong>
  </div>

const SmallReading: React.FC<{ reading: MiniReading }> = ({ reading }) =>
  <span className={styles.smallReading} data-mini-metric={reading.id} data-available={reading.available} title={reading.available ? reading.detail : `${reading.label} is unavailable. ${reading.detail}`}><span>{reading.shortLabel}</span> <b>{reading.value}</b><small>{reading.unit}</small></span>

const MiniMenu: React.FC<{ preferences: MiniWidgetPreferences; readings: Record<MiniMetric, MiniReading>; paused: boolean; close: () => void; apply: MiniWidgetProps['onPreferencesChange']; restore: Action; customize: Action; pause?: Action; report: (error: unknown) => void; titleId: string }> =
  ({ preferences, readings, paused, close, apply, restore, customize, pause, report, titleId }) => {
    const ref = useRef<HTMLDivElement>(null)
    const opacityId = useId(), sizeId = useId()
    // Commit pointer sizing on release to keep the native slider stationary.
    const sizing = useRef(false)
    const [sizeChoice, setSizeChoice] = useState(preferences.size)
    useEffect(() => { if (!sizing.current) setSizeChoice(preferences.size) }, [preferences.size])
    const action = async (callback: Action) => { try { await callback(); close() } catch (error) { report(error) } }
    const change = (patch: Partial<MiniWidgetPreferences>) => { Promise.resolve().then(() => apply(patch)).catch(report) }
    useEffect(() => { ref.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }) }, [])
    const trapFocus = (event: React.KeyboardEvent) => {
      if (event.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    return <div ref={ref} className={styles.menuContent} role="dialog" onKeyDown={trapFocus} aria-labelledby={titleId}>
      <div className={styles.menuHeading}><h2 id={titleId}>Make it yours</h2><button type="button" onClick={close} aria-label="Close mini window controls">×</button></div>
      <div className={styles.sliderRow}><label htmlFor={opacityId}>Opacity <output>{preferences.opacity}%</output></label><input id={opacityId} type="range" min={35} max={100} step={1} value={preferences.opacity} style={{ '--mini-fill': `${(preferences.opacity - 35) / 65 * 100}%` } as React.CSSProperties} onChange={event => change({opacity: Number(event.target.value)})} /></div>
      <div className={styles.sliderRow}><label htmlFor={sizeId}>Size <output>{sizeChoice}%</output></label><input id={sizeId} type="range" min={75} max={140} step={5} value={sizeChoice} style={{ '--mini-fill': `${(sizeChoice - 75) / 65 * 100}%` } as React.CSSProperties}
        onPointerDown={event => { if (event.button === 0) sizing.current = true }}
        onPointerUp={event => { if (sizing.current) { sizing.current = false; change({size: Number(event.currentTarget.value)}) } }}
        onPointerCancel={() => { sizing.current = false; setSizeChoice(preferences.size) }}
        onChange={event => { const size = Number(event.target.value); setSizeChoice(size); if (!sizing.current) change({size}) }} /><div className={styles.rangeHints}><span>Smaller</span><span>Larger</span></div></div>
      <div className={styles.divider} />
      <label className={styles.minimalToggle}><input type="checkbox" checked={preferences.minimal} onChange={event => change({minimal: event.target.checked})} /><span>Minimal view<small>Just your Wi-Fi link speed.</small></span></label>
      <p className={styles.menuEyebrow}>SHOW IN FULL MINI VIEW</p>
      {MINI_METRICS.map(metric => <label key={metric} className={styles.metricToggle}><input type="checkbox" checked={preferences.metrics.includes(metric)} disabled={preferences.minimal || preferences.metrics.length === 1 && preferences.metrics.includes(metric)} onChange={event => change({metrics: toggleMiniMetric(preferences, metric, event.target.checked)})} /><span>{readings[metric].label}</span><small>{readings[metric].available ? readings[metric].value + ' ' + readings[metric].unit : 'Unavailable'}</small></label>)}
      <div className={styles.divider} />
      <button className={styles.menuAction} type="button" onClick={() => void action(restore)}><span aria-hidden="true">↗</span> Open full NetMask</button>
      <button className={styles.menuAction} type="button" onClick={() => void action(customize)}><span aria-hidden="true">⚙</span> Customize widget <small>5 designs</small></button>
      {pause && <button className={styles.menuAction} type="button" onClick={() => void action(pause)}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span> {paused ? 'Resume' : 'Pause'} readings</button>}
      <p className={styles.menuFoot}>Wi-Fi link is the speed to your router.<br/>Live traffic is current activity on this computer.</p>
    </div>
  }

export const MiniWidget: React.FC<MiniWidgetProps> = props => {
  const {connection, speed, pingTelemetry, displayName, connectionError, offset, effectiveScale, preview = false, readingsPaused = false, onPreferencesChange, onStartDrag, onRestoreFull, onCustomize, onMenuOpenChange, onToggleReadingsPaused} = props
  const preferences = normalizeMiniPreferences(props.preferences)
  const anchor = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuBusy, setMenuBusy] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<number[]>([])
  const [viewport, setViewport] = useState<{width:number; height:number} | null>(() => typeof window === 'undefined' ? null : {width:window.innerWidth,height:window.innerHeight})
  const menuId = useId(), titleId = useId()
  const connected = props.connected ?? Boolean(connection)
  const connectionKey = connectionIdentity(connection) ?? props.fallbackConnectionKey ?? null
  const frozen = useRef({ connection, speed, pingTelemetry, now: Date.now(), key: connectionKey })
  const historyConnection = useRef(connectionKey)
  const previousSpeed = useRef<SpeedSample | null>(null)
  const lifecycle = useRef(true)
  const menuChange = useRef(onMenuOpenChange)
  menuChange.current = onMenuOpenChange
  const closing = useRef(false)
  useEffect(() => {
    lifecycle.current = true
    return () => { lifecycle.current = false; void Promise.resolve().then(() => menuChange.current?.(false)).catch(() => {}) }
  }, [])
  useEffect(() => {
    const resize = () => setViewport({width:window.innerWidth,height:window.innerHeight})
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (readingsPaused) {
      if (frozen.current.key !== connectionKey) frozen.current = { connection:null, speed:{...speed,available:false}, pingTelemetry:null, now:Date.now(), key:connectionKey }
      return
    }
    frozen.current = { connection, speed, pingTelemetry, now: Date.now(), key:connectionKey }
  }, [connectionKey, connection, speed, pingTelemetry, readingsPaused])
  useEffect(() => {
    if (historyConnection.current !== connectionKey) {
      historyConnection.current = connectionKey
      previousSpeed.current = speed
      setHistory([])
      return
    }
    if (readingsPaused || previousSpeed.current === speed) return
    previousSpeed.current = speed
    if (speed.available !== false && Number.isFinite(speed.downMBps) && speed.downMBps >= 0) setHistory(values => [...values.slice(-23), speed.downMBps])
    else setHistory([])
  }, [connectionKey, speed, readingsPaused])
  const data = readingsPaused ? frozen.current.key === connectionKey ? frozen.current : {connection:null, speed:{...speed,available:false}, pingTelemetry:null, now:Date.now()} : {connection, speed, pingTelemetry, now: Date.now()}
  const readings = miniReadings(data.connection, data.speed, data.pingTelemetry, data.now)
  const visible = miniVisibleReadings(preferences, readings)
  const base = miniWidgetBaseSize(preferences)
  const topOffset = Number.isFinite(offset?.top) ? Math.max(0,offset!.top) : 0
  const rightOffset = Number.isFinite(offset?.right) ? Math.max(0,offset!.right) : 0
  const scale = miniWidgetScale(preferences, preview || !viewport ? null : {width:Math.max(1,viewport.width-rightOffset),height:Math.max(1,viewport.height-topOffset)}, effectiveScale)
  const name = displayName ?? connection?.name ?? (connected ? 'Connected network' : connectionError ? 'Connection unavailable' : 'Not connected')
  const status = readingsPaused ? 'Paused' : connection ? connection.generation || 'Connected' : connected ? props.connectionStatus || 'Connected' : connectionError ? 'Unavailable' : 'Offline'
  const report = (failure: unknown) => setError(failure instanceof Error ? failure.message : 'This action could not be completed.')
  const open = async () => {
    if (menuOpen || menuBusy) return
    setMenuBusy(true); setError('')
    try { await onMenuOpenChange?.(true); if (lifecycle.current) setMenuOpen(true) }
    catch (failure) { if (lifecycle.current) report(failure) }
    finally { if (lifecycle.current) setMenuBusy(false) }
  }
  const close = () => {
    if (closing.current || !lifecycle.current) return
    closing.current = true
    void Promise.resolve().then(() => onMenuOpenChange?.(false)).then(() => {
      if (!lifecycle.current) return
      setMenuOpen(false)
      setError('')
      anchor.current?.focus({preventScroll:true})
    }).catch(report).finally(() => {closing.current = false})
  }
  const keyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey || (event.key === 'Enter' || event.key === ' ') && event.target === anchor.current) { event.preventDefault(); void open() }
    if (event.key === 'Escape' && !menuOpen) { event.preventDefault(); void Promise.resolve().then(onRestoreFull).catch(report) }
  }
  const top = <div className={styles.header}><NetMaskLogoIcon size={12} /><span>NETMASK{preferences.design === 'signal' ? ' / LIVE' : ''}</span><span className={styles.headerControls}><span className={styles.pin} title="Always on top" aria-label="Always on top">⌖</span><button type="button" tabIndex={preview ? -1 : undefined} aria-label="Customize mini window" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => void open()}>⋯</button></span></div>
  const nameLine = <div className={styles.nameLine}><h1 className={styles.name} title={name}>{name}</h1><span className={styles.status}><i className={connected ? styles.connected : ''} />{status}</span></div>
  const primary = visible.filter(reading => reading.id === 'download' || reading.id === 'upload')
  const secondary = visible.filter(reading => reading.id !== 'download' && reading.id !== 'upload')
  const graph = miniActivityPath(history)
  const mainReadings = primary.length ? primary : secondary.slice(0, 2)
  const remainingReadings = primary.length ? secondary : secondary.slice(2)
  const focal = visible[0]
  const signalPercent = focal.id === 'signal' && focal.available ? Number(focal.value) : undefined

  return <div className={styles.host} data-mini-host>
    <div className={styles.frame} style={{width: Math.ceil(base.width * scale), height: Math.ceil(base.height * scale), top:topOffset, right:rightOffset}}>
      <div ref={anchor} tabIndex={preview ? -1 : 0} role="group" aria-label={preferences.minimal ? `${readingsPaused ? 'Paused. ' : ''}Wi-Fi link ${readings.link.available ? readings.link.value + ' ' + readings.link.unit : 'unavailable'}. Right-click for controls.` : `NetMask mini window. ${status}. Right-click for controls.`}
        className={`${styles.widget} ${styles[preferences.design]} ${preferences.minimal ? styles.minimal : ''} ${readingsPaused ? styles.paused : ''}`}
        data-mini-design={preferences.design} data-mini-minimal={preferences.minimal} style={{width:base.width, height:base.height, transform:`scale(${scale})`, opacity:preferences.opacity/100}}
        onContextMenu={event => {event.preventDefault(); void open()}} onKeyDown={keyboard}
        onMouseDown={event => {if (event.button === 0 && !(event.target as HTMLElement).closest('button,input') && !menuOpen) void Promise.resolve().then(onStartDrag).catch(report)}}>
        {preferences.minimal ? <div className={styles.minimalBody}><span className={styles.minimalIcon} aria-hidden="true"><WifiIcon size={preferences.design === 'dial' ? 15 : 17} /></span><div className={styles.minimalReading} data-mini-metric="link" data-available={readings.link.available} title={readings.link.detail}><span>{readingsPaused ? 'Wi-Fi · paused' : 'Wi-Fi link'}</span><strong>{readings.link.value}<small>{readings.link.unit}</small></strong></div><button type="button" tabIndex={preview ? -1 : undefined} className={styles.minimalMenu} onClick={() => void open()} aria-label="Customize mini window" aria-expanded={menuOpen}>⋯</button></div> : <>
          {top}
          {preferences.design === 'ribbon' ? <div className={styles.ribbonBody}><div className={styles.ribbonName}><h1 className={styles.name} title={name}>{name}</h1><span className={styles.status}><i className={connected ? styles.connected : ''} />{status}</span></div><div className={styles.ribbonReadings}>{visible.map(reading => <Reading reading={reading} key={reading.id} />)}</div></div> : preferences.design === 'dial' ? <>
            <div className={styles.dialReadout}><svg className={styles.dialRing} viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r="61" className={styles.dialTrack} />{signalPercent != null && <circle cx="70" cy="70" r="61" className={styles.dialValue} strokeDasharray={`${signalPercent / 100 * 383.27} 383.27`} />}</svg><Reading reading={focal} focal /></div>{nameLine}<div className={styles.secondaryReadings}>{visible.slice(1).map(reading => <SmallReading reading={reading} key={reading.id} />)}</div>
          </> : <>{nameLine}<div className={styles.primaryReadings}>{mainReadings.map(reading => <Reading reading={reading} key={reading.id} />)}</div>
            {(preferences.design === 'glass' || preferences.design === 'signal') && <svg className={styles.activity} viewBox="0 0 230 26" role="img" aria-label={graph ? 'Recent measured download activity' : 'No recent download activity available'}><path d="M0 24H230" className={styles.activityGuide}/>{graph && <path d={graph} className={styles.activityLine}/>}</svg>}
            {remainingReadings.length > 0 && <div className={styles.secondaryReadings}>{remainingReadings.map(reading => <SmallReading reading={reading} key={reading.id} />)}</div>}
          </>}
        </>}
      </div>
    </div>
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    {menuOpen && <Popover anchor={anchor} onClose={close} id={menuId} width={280} placement="side" closeOnBlur positionKey={`${offset?.top ?? 0}:${offset?.right ?? 0}:${scale}:${base.width}:${base.height}`} className={styles.popover}><MiniMenu preferences={preferences} readings={readings} paused={readingsPaused} close={close} apply={onPreferencesChange} restore={onRestoreFull} customize={onCustomize} pause={onToggleReadingsPaused} report={report} titleId={titleId}/></Popover>}
  </div>
}

const noop = () => {}
export const MiniWidgetPreview: React.FC<Pick<MiniWidgetProps, 'preferences' | 'connection' | 'speed' | 'pingTelemetry' | 'displayName' | 'connected' | 'connectionStatus' | 'fallbackConnectionKey'>> = props => {
  const dimensions = miniWidgetSize(props.preferences)
  return <div className={styles.preview} style={dimensions} aria-hidden="true"><MiniWidget {...props} preview onPreferencesChange={noop} onStartDrag={noop} onRestoreFull={noop} onCustomize={noop}/></div>
}
