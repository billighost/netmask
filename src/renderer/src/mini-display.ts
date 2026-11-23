import type { Connection, SpeedSample, PingTelemetry, MiniMetric, MiniWidgetPreferences } from './types'

export type { MiniMetric, MiniWidgetPreferences } from './types'

export const MINI_DESIGNS = [
  { value: 'fieldnote', label: 'Fieldnote', description: 'Warm paper and familiar Fieldnotes type.' },
  { value: 'ribbon', label: 'Ribbon', description: 'A slim horizontal readout.' },
  { value: 'glass', label: 'Soft glass', description: 'A translucent green card.' },
  { value: 'dial', label: 'Little dial', description: 'One reading in focus.' },
  { value: 'signal', label: 'Signal desk', description: 'A dark, crisp instrument.' }
] as const

export const MINI_METRICS: readonly MiniMetric[] = ['download', 'upload', 'link', 'signal', 'latency']

export const DEFAULT_MINI_PREFERENCES: MiniWidgetPreferences = {
  design: 'fieldnote', minimal: false, opacity: 96, size: 100, metrics: [...MINI_METRICS]
}

const FULL_SIZES = {
  fieldnote: { width: 286, height: 198 }, ribbon: { width: 394, height: 88 },
  glass: { width: 286, height: 222 }, dial: { width: 208, height: 258 }, signal: { width: 332, height: 210 }
}
const MINIMAL_SIZES = {
  fieldnote: { width: 162, height: 44 }, ribbon: { width: 174, height: 36 },
  glass: { width: 166, height: 44 }, dial: { width: 136, height: 54 }, signal: { width: 176, height: 44 }
}

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, Math.round(value))) : fallback

export function normalizeMiniPreferences(value?: Partial<MiniWidgetPreferences> | null): MiniWidgetPreferences {
  const design = MINI_DESIGNS.some(item => item.value === value?.design) ? value!.design! : 'fieldnote'
  const metrics = Array.isArray(value?.metrics) ? MINI_METRICS.filter(metric => value!.metrics!.includes(metric)) : [...MINI_METRICS]
  return {
    design, minimal: value?.minimal === true,
    opacity: clamp(value?.opacity, 35, 100, 96), size: clamp(value?.size, 75, 140, 100),
    metrics: metrics.length ? metrics : ['link']
  }
}

export function miniWidgetBaseSize(preferences: MiniWidgetPreferences): {width: number; height: number} {
  return { ...(preferences.minimal ? MINIMAL_SIZES : FULL_SIZES)[preferences.design] }
}

export function miniWidgetSize(value: MiniWidgetPreferences): {width: number; height: number} {
  const preferences = normalizeMiniPreferences(value)
  const base = miniWidgetBaseSize(preferences)
  return { width: Math.ceil(base.width * preferences.size / 100), height: Math.ceil(base.height * preferences.size / 100) }
}

// Native effectiveScale is the total transform scale, not another multiplier.
// Keep requested preferences intact while fitting a constrained work area.
export function miniWidgetScale(value: MiniWidgetPreferences, viewport?: {width: number; height: number} | null, effectiveScale?: number): number {
  const preferences = normalizeMiniPreferences(value)
  const base = miniWidgetBaseSize(preferences)
  const requested = preferences.size / 100
  const native = typeof effectiveScale === 'number' && Number.isFinite(effectiveScale) && effectiveScale >= .05 ? effectiveScale : requested
  const widthFit = viewport && Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width / base.width : requested
  const heightFit = viewport && Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height / base.height : requested
  return Math.max(.01, Math.min(requested, native, widthFit, heightFit))
}

export type MiniReading = {
  id: MiniMetric
  label: string
  shortLabel: string
  value: string
  unit: string
  available: boolean
  detail: string
}

function number(value: unknown, maximum = Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum
}

function formatRate(value: number): { value: string; unit: string } {
  const gbps = value >= 1000
  const rate = gbps ? value / 1000 : value
  return { value: rate === 0 ? '0' : rate < 1 ? rate.toFixed(2) : rate < 100 ? rate.toFixed(1).replace(/\.0$/, '') : String(Math.round(rate)), unit: gbps ? 'Gbps' : 'Mbps' }
}

export function miniReadings(connection: Connection | null, speed: SpeedSample, ping: PingTelemetry | null, now = Date.now()): Record<MiniMetric, MiniReading> {
  const make = (id: MiniMetric, label: string, shortLabel: string, detail: string, available: boolean, formatted: {value: string; unit: string}): MiniReading =>
    ({ id, label, shortLabel, detail, available, value: available ? formatted.value : '—', unit: available ? formatted.unit : '' })
  const traffic = (id: 'download' | 'upload', value: number) => make(id, id === 'download' ? 'Live download' : 'Live upload', id === 'download' ? 'Download' : 'Upload',
    'Current traffic across this computer’s physical network adapters, shown in megabits per second. It is not an internet speed test or a Wi-Fi-only measurement.',
    speed.available !== false && number(value) && number(value * 8), formatRate(number(value) ? value * 8 : 0))
  const link = connection?.rxRateMbps
  const signal = connection?.signal
  const freshPing = Boolean(ping && number(ping.timestamp) && ping.timestamp > 0 && now - ping.timestamp >= -5000 && now - ping.timestamp <= 30000)
  return {
    download: traffic('download', speed.downMBps), upload: traffic('upload', speed.upMBps),
    link: make('link', 'Wi-Fi link', 'Wi-Fi', 'The receive link rate negotiated between your computer and Wi-Fi router. It is not your internet speed.', number(link) && link > 0,
      { value: number(link) ? String(Math.round(link)) : '', unit: 'Mbps' }),
    signal: make('signal', 'Signal strength', 'Signal', 'The signal quality reported by your Wi-Fi adapter.', number(signal, 100),
      { value: number(signal, 100) ? String(Math.round(signal)) : '', unit: '%' }),
    latency: make('latency', 'Internet latency', 'Latency', 'The recent round-trip time to the internet test destination. Readings older than 30 seconds are unavailable.', freshPing && number(ping?.internetMs),
      { value: number(ping?.internetMs) ? String(Math.round(ping!.internetMs!)) : '', unit: 'ms' })
  }
}

export function miniVisibleReadings(preferences: MiniWidgetPreferences, readings: Record<MiniMetric, MiniReading>): MiniReading[] {
  return (preferences.minimal ? ['link'] as const : preferences.metrics).map(metric => readings[metric])
}

export function toggleMiniMetric(preferences: MiniWidgetPreferences, metric: MiniMetric, enabled: boolean): MiniMetric[] {
  const next = enabled ? MINI_METRICS.filter(value => value === metric || preferences.metrics.includes(value)) : preferences.metrics.filter(value => value !== metric)
  return next.length ? next : [...preferences.metrics]
}

export function miniActivityPath(samples: readonly number[], width = 230, height = 26): string {
  const valid = samples.slice(-24).filter(sample => number(sample))
  if (valid.length < 2) return ''
  const peak = Math.max(...valid, .01)
  return valid.map((sample, index) => `${index ? 'L' : 'M'}${(index / (valid.length - 1) * width).toFixed(1)},${(height - 2 - sample / peak * (height - 4)).toFixed(1)}`).join(' ')
}
