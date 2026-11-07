import type { EvidenceReportData } from './types'

export type EvidenceFormat = 'html' | 'markdown'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]!))

const escapeMarkdown = (value: string) => value.replace(/\\/g, '\\\\').replace(/[<>]/g, value => value === '<' ? '&lt;' : '&gt;').replace(/\|/g, '\\|')

export function createEvidenceReport(data: EvidenceReportData, includeIdentifiers: boolean) {
  const from = new Date(data.fromMs)
  const to = new Date(data.toMs)
  const created = new Date(data.generatedAtMs)
  const identity = includeIdentifiers && data.networkLabel ? data.networkLabel : 'Redacted'
  const rows = data.events.map(event => ({
    time: new Date(event.atMs).toLocaleString(),
    kind: event.title,
    detail: includeIdentifiers ? event.detail : event.redactedDetail || event.title
  }))
  const coverage = `${data.coveragePercent.toFixed(1)}% (${data.sampleCount} measured, ${data.missingSampleCount} missing)`
  const markdownEvents = rows.length ? rows.map(row => `| ${escapeMarkdown(row.time)} | ${escapeMarkdown(row.kind)} | ${escapeMarkdown(row.detail)} |`).join('\n') : '| — | No recorded incidents | — |'
  const markdown = `# NetMask provider evidence report

Period: ${from.toLocaleString()} to ${to.toLocaleString()} (${data.timezone})<br>
Created: ${created.toLocaleString()}<br>
Network: ${escapeMarkdown(identity)}

## Evidence summary

- Coverage: ${coverage}
- Connection drops: ${data.dropCount}
- Latency spikes: ${data.latencySpikeCount}
- Jitter spikes: ${data.jitterSpikeCount}
- Networks observed: ${data.networkCount}

## Recorded incidents

| Time | Event | Measured evidence |
| --- | --- | --- |
${markdownEvents}

## Measurement notes

${data.notes.map(note => `- ${escapeMarkdown(note)}`).join('\n')}

Missing samples are reported as missing. This report contains measurements made by this computer; it does not infer performance for times without samples. Wi-Fi passwords are never included.
`
  const htmlEvents = rows.length ? rows.map(row => `<tr><td>${escapeHtml(row.time)}</td><td>${escapeHtml(row.kind)}</td><td>${escapeHtml(row.detail)}</td></tr>`).join('') : '<tr><td>—</td><td>No recorded incidents</td><td>—</td></tr>'
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NetMask provider evidence report</title><style>
body{margin:0;background:#f6f3ec;color:#293c31;font:15px/1.6 system-ui,sans-serif}.page{width:min(920px,calc(100% - 28px));margin:30px auto 54px}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:38px}.meta,.scope{color:#646f61}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card{background:#fffcf6;border:1px solid #d7dccc;border-radius:8px;padding:16px}.card strong{display:block;font-size:22px}table{width:100%;border-collapse:collapse;background:#fffcf6}th,td{padding:10px;border-bottom:1px solid #d7dccc;text-align:left;vertical-align:top}th{color:#646f61}.privacy{border-left:4px solid #294e3f;padding:12px 14px;background:#e7eddf}@media(max-width:650px){.summary{grid-template-columns:1fr 1fr}h1{font-size:30px}}@media(max-width:400px){.summary{grid-template-columns:1fr}}
</style></head><body><main class="page"><p>FIELDNOTES · MEASURED EVIDENCE</p><h1>Provider evidence report</h1><p class="meta">${escapeHtml(from.toLocaleString())} to ${escapeHtml(to.toLocaleString())} · ${escapeHtml(data.timezone)}<br>Created ${escapeHtml(created.toLocaleString())}</p><p class="privacy">Network identifiers ${includeIdentifiers ? 'were included by explicit choice' : 'are redacted by default'}. Network: ${escapeHtml(identity)}</p><section class="summary"><div class="card"><span>Coverage</span><strong>${escapeHtml(data.coveragePercent.toFixed(1))}%</strong><small>${data.sampleCount} measured · ${data.missingSampleCount} missing</small></div><div class="card"><span>Drops</span><strong>${data.dropCount}</strong></div><div class="card"><span>Latency spikes</span><strong>${data.latencySpikeCount}</strong></div><div class="card"><span>Jitter spikes</span><strong>${data.jitterSpikeCount}</strong></div></section><h2>Recorded incidents</h2><table><thead><tr><th>Time</th><th>Event</th><th>Measured evidence</th></tr></thead><tbody>${htmlEvents}</tbody></table><h2>Measurement notes</h2><ul>${data.notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul><p class="scope">Missing samples are reported as missing. This report contains measurements made by this computer; it does not infer performance for times without samples. Wi-Fi passwords are never included.</p></main></body></html>`
  return { html, markdown, filenameBase: `netmask-provider-evidence-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}` }
}
