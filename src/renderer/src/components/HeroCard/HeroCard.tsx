import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useStore, getSpeedRingBuffer } from '../../store'
import { WifiIcon, ArrowDownIcon, ArrowUpIcon } from '../../icons'
import { HelpTip } from '../Controls/HelpTip'
import { SpeedInfoPanel } from '../SpeedInfoPanel/SpeedInfoPanel'
import styles from './HeroCard.module.css'
import { sharingModeActive } from '../../network-state'

function speed(value: number): { value: string; unit: string } {
  if (!Number.isFinite(value) || value <= 0) return { value: '0', unit: 'KB/s' }
  if (value < 1) return { value: String(Math.round(value * 1000)), unit: 'KB/s' }
  if (value >= 1000) return { value: (value / 1000).toFixed(2), unit: 'GB/s' }
  return { value: value.toFixed(value >= 10 ? 1 : 2), unit: 'MB/s' }
}

const Sparkline: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null)
  const tick = useStore(state => state.speedTick)
  const theme = useStore(state => state.settings.theme)
  const draw = useCallback(() => {
    const canvas = ref.current
    if (!canvas || document.hidden) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const buffer = getSpeedRingBuffer()
    const width = canvas.width, height = canvas.height
    const peak = Math.max(.1, ...buffer)
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    ctx.clearRect(0, 0, width, height)
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let index = 0; index < buffer.length; index++) ctx.lineTo(index / 59 * width, height - buffer[index] / peak * (height - 6) - 3)
    ctx.lineTo(width, height); ctx.closePath()
    ctx.globalAlpha = .08; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1
    ctx.beginPath()
    for (let index = 0; index < buffer.length; index++) {
      const x = index / 59 * width, y = height - buffer[index] / peak * (height - 6) - 3
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke()
  }, [])
  useEffect(() => { draw() }, [tick, theme, draw])
  return <canvas ref={ref} className={styles.sparkline} width={240} height={70} role="img" aria-label="Recent download activity" />
}

const LiveRates: React.FC<{ onInfo: () => void; expanded: boolean }> = ({ onInfo, expanded }) => {
  const available = useStore(state => state.speed.available !== false)
  const down = speed(useStore(state => state.speed.downMBps))
  const up = speed(useStore(state => state.speed.upMBps))
  return <div className={styles.transfer}>
    <div className={styles.rate}><div className={styles.rateCaption}><ArrowDownIcon size={11} /><span>DOWNLOAD</span><HelpTip label="Download rate">Data arriving across physical network adapters on this computer. If Wi-Fi and Ethernet are both active, both can contribute. MB/s means megabytes each second. This is current activity, not the connection's maximum speed.</HelpTip></div><p className={styles.rateValue}>{available ? down.value : '\u2014'}<span>{available ? down.unit : ''}</span></p></div>
    <div className={styles.rate}><div className={styles.rateCaption}><ArrowUpIcon size={11} /><span>UPLOAD</span><HelpTip label="Upload rate">Data leaving physical network adapters on this computer. One megabyte is eight megabits; internet plans usually use megabits per second.</HelpTip></div><p className={styles.rateValue}>{available ? up.value : '\u2014'}<span>{available ? up.unit : ''}</span></p></div>
    <div className={styles.chart}><Sparkline /><button className={styles.chartButton} type="button" aria-expanded={expanded} onClick={onInfo}>{expanded ? 'Close speed test' : 'Test download speed'} <span aria-hidden="true">↗</span></button></div>
  </div>
}

const Latency: React.FC = () => {
  const telemetry = useStore(state => state.pingTelemetry)
  const values = [
    { label: 'Router', value: telemetry?.gatewayMs, help: 'Time for a small message to reach your router and come back. A lower number means a quicker local response.' },
    { label: 'Internet', value: telemetry?.internetMs, help: 'Time for a small message to reach 1.1.1.1 on the internet and return. It is one test destination, not a guarantee for every site.' },
    { label: 'Jitter', value: telemetry?.jitterMs, help: 'How much the response time varies between recent tests. A smaller number means a steadier connection for calls and games.' }
  ]
  return <div className={styles.latency}>{values.map(item => <div className={styles.latencyItem} key={item.label}><span>{item.label}<HelpTip label={item.label}>{item.help}</HelpTip></span><strong>{item.value == null ? '—' : item.value + ' ms'}</strong></div>)}</div>
}

export const HeroCard: React.FC = () => {
  const connection = useStore(state => state.connection)
  const error = useStore(state => state.connectionError)
  const cloaked = useStore(state => sharingModeActive(state.streamerStatus, state.streamerBusy))
  const privateName = useStore(state => state.settings.streamerMaskName)
  const [infoOpen, setInfoOpen] = useState(false)
  const renamed = Boolean(connection && connection.name !== connection.ssid)
  return <section className={styles.card} aria-labelledby="connection-name">
    <div className={styles.connectionLabel}><span className={styles.eyebrow}>YOUR CONNECTION</span><span className={styles.liveLabel}><span className={styles.dot + (connection ? ' ' + styles.dotLive : '')} />{connection ? 'Connected' : error ? 'Unavailable' : 'Not connected'}</span></div>
    <div className={styles.heroTop}><div><h1 id="connection-name" className={styles.netName}>{connection ? cloaked ? privateName : connection.name : error ? 'Connection unavailable' : 'Connect to Wi-Fi'}</h1>
      <p className={styles.realName}>{!connection ? 'Saved networks stay available below.' : cloaked ? 'A private display name is active.' : renamed ? 'Wi-Fi name: ' + connection.ssid : 'Your network, on this computer.'}</p>
    </div><span className={styles.heroIcon} aria-hidden="true"><WifiIcon size={23} /></span></div>
    {error && <p className={styles.error} role="status">{cloaked ? 'Connection details are hidden while sharing.' : error}</p>}
    <LiveRates onInfo={() => setInfoOpen(value => !value)} expanded={infoOpen} />
    <Latency />
    {connection && <div className={styles.linkInfo}><span>{[connection.generation, connection.band].filter(Boolean).join(' · ') || 'Wi-Fi connection'}</span>{connection.rxRateMbps != null && <span>{Math.round(connection.rxRateMbps)} Mbps link <HelpTip label="Wi-Fi link rate">The speed your computer and router negotiated over Wi-Fi. Actual internet downloads are usually slower and depend on your internet plan, signal, and traffic.</HelpTip></span>}</div>}
    {infoOpen && <SpeedInfoPanel onClose={() => setInfoOpen(false)} />}
  </section>
}
