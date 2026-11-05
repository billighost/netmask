import type { CaptivePortalStatus, Connection, PingTelemetry, SpeedSample, SpeedTestResult } from './types'

export type ReportFormat = 'html' | 'markdown'

export type ConnectionReportInput = {
  generatedAt: Date
  appVersion: string
  platform: string
  connection: Connection | null
  telemetry: PingTelemetry | null
  speed: SpeedSample
  testedSpeed: SpeedTestResult | null
  captivePortal: CaptivePortalStatus | null
  includeIdentifiers: boolean
  sharingMode: boolean
}

export type ConnectionReport = {
  title: string
  markdown: string
  html: string
  filenameBase: string
}

const available = (value: number | null | undefined, unit: string, digits = 0) =>
  value == null || !Number.isFinite(value) ? 'Unavailable' : `${value.toFixed(digits)} ${unit}`

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]!))

const escapeMarkdownCell = (value: unknown) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\|/g, '\\|')
  .replace(/\r?\n/g, '<br>')

function assessment(input: ConnectionReportInput): { summary: string; findings: string[]; steps: string[] } {
  const findings: string[] = []
  const steps: string[] = []
  const connection = input.connection
  if (!connection) return {
    summary: 'No active connection was available when this report was created.',
    findings: ['Connection measurements are unavailable.'],
    steps: ['Connect to Wi-Fi or Ethernet, then create a new report.']
  }
  if (input.captivePortal?.isCaptive) {
    findings.push('The network appears to require a sign-in page.')
    steps.push('Open the network sign-in page and complete it before testing again.')
  }
  if (connection.signal > 0 && connection.signal < 40) {
    findings.push(`Wi-Fi signal is weak at ${connection.signal}%.`)
    steps.push('Move closer to the access point or remove obstacles, then compare the signal again.')
  }
  if (input.telemetry?.gatewayMs != null && input.telemetry.gatewayMs > 50) {
    findings.push(`Router response is elevated at ${input.telemetry.gatewayMs} ms.`)
    steps.push('Check local Wi-Fi congestion and compare with Ethernet if it is available.')
  }
  if (input.telemetry?.internetMs != null && input.telemetry.internetMs > 150) {
    findings.push(`Internet response is slow at ${input.telemetry.internetMs} ms.`)
    steps.push('Pause large transfers and repeat the check; contact the provider if the result remains high.')
  }
  if (input.telemetry?.jitterMs != null && input.telemetry.jitterMs > 30) {
    findings.push(`Response variation is high at ${input.telemetry.jitterMs} ms.`)
    steps.push('For calls, reduce competing traffic or use a wired connection where possible.')
  }
  if (input.testedSpeed && input.testedSpeed.mbps < 10) {
    findings.push(`The measured download sample is ${input.testedSpeed.mbps.toFixed(1)} Mbps.`)
    steps.push('Repeat the sample near the router and compare it with the speed included in your internet plan.')
  }
  if (!findings.length) {
    findings.push('The available measurements do not show an obvious connection problem.')
    steps.push('If a specific app still struggles, test that app again and compare at a different time.')
  }
  return {
    summary: findings.length === 1 && findings[0].startsWith('The available')
      ? 'The measured connection looks steady.'
      : 'The report found items worth checking.',
    findings,
    steps: [...new Set(steps)]
  }
}

export function createConnectionReport(input: ConnectionReportInput): ConnectionReport {
  const connection = input.connection
  const identifiersAllowed = input.includeIdentifiers && !input.sharingMode
  const networkName = connection ? identifiersAllowed ? connection.name : 'Redacted' : 'Not connected'
  const wifiName = connection ? identifiersAllowed ? connection.ssid : 'Redacted' : 'Unavailable'
  const adapter = connection ? identifiersAllowed ? connection.interfaceName || 'Unavailable' : 'Redacted' : 'Unavailable'
  const accessPoint = connection ? identifiersAllowed ? connection.bssid || 'Unavailable' : 'Redacted' : 'Unavailable'
  const created = input.generatedAt.toLocaleString()
  const createdIso = input.generatedAt.toISOString()
  const result = assessment(input)
  const rows = [
    ['Connection', networkName],
    ['Wi-Fi name', wifiName],
    ['Status', connection ? 'Connected' : 'Not connected'],
    ['Signal', connection ? available(connection.signal, '%') : 'Unavailable'],
    ['Signal level', connection ? available(connection.signalDbm, 'dBm') : 'Unavailable'],
    ['Signal above noise', connection ? available(connection.snr, 'dB') : 'Unavailable'],
    ['Band and channel', connection ? [connection.band, connection.channel ? `channel ${connection.channel}` : ''].filter(Boolean).join(' · ') || 'Unavailable' : 'Unavailable'],
    ['Wi-Fi version', connection?.generation || connection?.radioType || 'Unavailable'],
    ['Download link rate', connection ? available(connection.rxRateMbps, 'Mbps') : 'Unavailable'],
    ['Upload link rate', connection ? available(connection.txRateMbps, 'Mbps') : 'Unavailable'],
    ['Router response', available(input.telemetry?.gatewayMs, 'ms')],
    ['Internet response', available(input.telemetry?.internetMs, 'ms')],
    ['Jitter', available(input.telemetry?.jitterMs, 'ms')],
    ['Measured download sample', input.testedSpeed ? available(input.testedSpeed.mbps, 'Mbps', 1) : 'Not run'],
    ['Current download activity', input.speed.available === false ? 'Unavailable' : available(input.speed.downMBps, 'MB/s', 2)],
    ['Current upload activity', input.speed.available === false ? 'Unavailable' : available(input.speed.upMBps, 'MB/s', 2)],
    ['Network sign-in page', input.captivePortal ? input.captivePortal.isCaptive ? 'Detected' : 'Not detected' : 'Not checked'],
    ['Adapter', adapter],
    ['Access point address', accessPoint]
  ] as const
  const privacy = identifiersAllowed
    ? 'Network identifiers were included by explicit choice.'
    : 'Network names, adapter names, and hardware identifiers were redacted.'
  const markdownRows = rows.map(([label, value]) => `| ${label} | ${escapeMarkdownCell(value)} |`).join('\n')
  const markdown = `# NetMask connection report

Created ${created} with NetMask ${input.appVersion} on ${input.platform}.

> ${privacy}

## Summary

${result.summary}

## Measurements

| Check | Result |
| --- | --- |
${markdownRows}

## Findings

${result.findings.map(value => `- ${value}`).join('\n')}

## Suggested next steps

${result.steps.map((value, index) => `${index + 1}. ${value}`).join('\n')}

## Scope

These are point-in-time measurements from this computer. They do not guarantee the performance of every website, call, device, or destination.
`
  const htmlRows = rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(String(value))}</td></tr>`).join('')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NetMask connection report</title><style>
:root{color-scheme:light;--paper:#f6f3ec;--card:#fffcf6;--ink:#293c31;--muted:#646f61;--line:#d7dccc;--green:#294e3f;--pale:#e7eddf;--terra:#ba5c3c}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.65 Inter,system-ui,sans-serif}.page{width:min(900px,calc(100% - 32px));margin:36px auto 60px}.mast{border-bottom:2px solid var(--green);padding:0 0 20px}.eyebrow{color:var(--terra);font:700 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:42px;line-height:1.1;margin:8px 0}h2{font-size:24px;margin:0 0 14px}.meta,.scope{color:var(--muted)}.privacy{margin:24px 0;padding:14px 16px;background:var(--pale);border-left:4px solid var(--green);border-radius:6px}.summary{font-size:19px}.grid{display:grid;grid-template-columns:1.4fr .9fr;gap:22px;margin-top:26px}.card{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:22px;box-shadow:0 5px 20px #26372c0d}.measurements{grid-row:span 2}table{width:100%;border-collapse:collapse}th,td{padding:10px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{width:48%;color:var(--muted);font-size:13px;font-weight:500}td{font:13px/1.6 ui-monospace,monospace;overflow-wrap:anywhere}ul,ol{padding-left:21px;margin:0}li+li{margin-top:9px}.footer{margin-top:24px;padding-top:18px;border-top:1px solid var(--line);font-size:12px}@media(max-width:700px){.grid{grid-template-columns:1fr}.measurements{grid-row:auto}h1{font-size:34px}.page{margin-top:20px}}
</style></head><body><main class="page"><header class="mast"><div class="eyebrow">Fieldnotes · NetMask</div><h1>Connection report</h1><p class="meta">Created ${escapeHtml(created)} · NetMask ${escapeHtml(input.appVersion)} · ${escapeHtml(input.platform)}</p></header>
<p class="privacy">${escapeHtml(privacy)}</p><p class="summary">${escapeHtml(result.summary)}</p><div class="grid">
<section class="card measurements"><h2>Measurements</h2><table>${htmlRows}</table></section>
<section class="card"><h2>Findings</h2><ul>${result.findings.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>
<section class="card"><h2>Suggested next steps</h2><ol>${result.steps.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ol></section></div>
<footer class="footer scope">Point-in-time measurements from this computer. Results do not guarantee the performance of every website, call, device, or destination.<br>Generated ${escapeHtml(createdIso)}.</footer></main></body></html>`
  const date = input.generatedAt.toISOString().slice(0, 10)
  return { title: 'NetMask connection report', markdown, html, filenameBase: `netmask-connection-report-${date}` }
}
