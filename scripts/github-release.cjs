// Release helper: uses Git Credential Manager without printing or persisting credentials.
// Examples: node scripts/github-release.cjs checks <sha>
//           node scripts/github-release.cjs release v2.2.0
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { releaseAssetPlan } = require('./release-assets.cjs')
const { verifyMergeChecks } = require('./release-checks.cjs')

const repository = '/repos/billighost/netmask'
let credential

function getCredential() {
  if (credential) return credential
  credential = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (credential) return credential
  try {
    const result = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
    })
    credential = result.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9)
  } catch {
    throw new Error('GitHub authentication is unavailable in Git Credential Manager.')
  }
  if (!credential) throw new Error('No stored GitHub credential was found.')
  return credential
}

async function api(method, path, body) {
  const response = await fetch(`https://api.github.com${repository}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getCredential()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'NetMask-release-helper',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  })
  const payload = response.status === 204 ? '' : await response.text()
  let result
  try { result = payload.trim() ? JSON.parse(payload) : {} }
  catch { throw new Error(`GitHub returned an incomplete response (${response.status})`) }
  if (!payload.trim() && method === 'GET' && response.ok) throw new Error(`GitHub returned an empty read response (${response.status})`)
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${result.message || 'Request failed'}`)
  return result
}

function prInfo(pr) {
  return {
    number: pr.number, title: pr.title, url: pr.html_url, state: pr.state,
    merged: pr.merged, mergeable: pr.mergeable, mergeableState: pr.mergeable_state,
    head: pr.head?.ref, headSha: pr.head?.sha, base: pr.base?.ref,
    mergeCommitSha: pr.merge_commit_sha
  }
}

async function main() {
  const [action, arg, extra] = process.argv.slice(2)
  let result
  switch (action) {
    case 'prs':
      result = (await api('GET', '/pulls?state=open&per_page=30')).map(prInfo)
      break
    case 'pr-create':
      result = prInfo(await api('POST', '/pulls', JSON.parse(fs.readFileSync(arg, 'utf8'))))
      break
    case 'pr':
      result = prInfo(await api('GET', `/pulls/${arg}`))
      break
    case 'checks': {
      const checks = await api('GET', `/commits/${arg}/check-runs?per_page=100`)
      const statuses = await api('GET', `/commits/${arg}/status`)
      result = {
        sha: arg, combinedStatus: statuses.state,
        checks: checks.check_runs.map(c => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url })),
        statuses: statuses.statuses.map(s => ({ context: s.context, state: s.state, url: s.target_url }))
      }
      break
    }
    case 'pr-merge': {
      if (!extra) throw new Error('The reviewed PR head SHA is required when merging.')
      const pr = await api('GET', `/pulls/${arg}`)
      const [checks, statuses] = await Promise.all([
        api('GET', `/commits/${extra}/check-runs?filter=latest&per_page=100`),
        api('GET', `/commits/${extra}/status?per_page=100`)
      ])
      const gate = checks.check_runs.find(check => check.name === 'CI Gate' && check.app?.slug === 'github-actions')
      const runId = (gate?.details_url || gate?.html_url || '').match(/\/actions\/runs\/(\d+)/)?.[1]
      if (!runId) throw new Error('The required CI workflow run could not be identified')
      const { runJobs, platformStatus, runnerUnavailable } = require('./workflow-status.cjs')
      const run = await api('GET', `/actions/runs/${runId}`)
      if (run.head_sha !== extra || run.event !== 'pull_request') throw new Error('CI must belong to this PR head')
      const jobs = await runJobs(runId)
      platformStatus(jobs, undefined, true)
      verifyMergeChecks(pr, extra, checks, statuses, jobs.filter(runnerUnavailable))
      result = await api('PUT', `/pulls/${arg}/merge`, { merge_method: 'squash', sha: extra })
      break
    }
    case 'runs': {
      const runs = await api('GET', `/actions/runs?per_page=15${arg ? `&head_sha=${encodeURIComponent(arg)}` : ''}`)
      result = runs.workflow_runs.map(r => ({ id: r.id, name: r.name, event: r.event, branch: r.head_branch, sha: r.head_sha, status: r.status, conclusion: r.conclusion, url: r.html_url }))
      break
    }
    case 'run-notices': {
      const jobs = await api('GET', `/actions/runs/${arg}/jobs?per_page=100`)
      result = await Promise.all(jobs.jobs.map(async job => {
        const id = job.check_run_url?.split('/').at(-1)
        if (!id) return { name: job.name, conclusion: job.conclusion }
        const check = await api('GET', `/check-runs/${id}`)
        const annotations = await api('GET', `/check-runs/${id}/annotations?per_page=100`)
        return { name: job.name, conclusion: job.conclusion, labels: job.labels, runner: job.runner_name,
          output: check.output, annotations }
      }))
      break
    }
    case 'run-rerun-failed':
      result = await api('POST', `/actions/runs/${arg}/rerun-failed-jobs`)
      break
    case 'workflow-dispatch':
      if (!extra) throw new Error('A dispatch JSON file with ref and inputs is required')
      result = await api('POST', `/actions/workflows/${encodeURIComponent(arg)}/dispatches`, JSON.parse(fs.readFileSync(extra, 'utf8')))
      break
    case 'run': {
      const run = await api('GET', `/actions/runs/${arg}`)
      const jobs = await api('GET', `/actions/runs/${arg}/jobs?per_page=100`)
      result = {
        id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url,
        jobs: jobs.jobs.map(j => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion,
          steps: j.steps.map(s => ({ name: s.name, status: s.status, conclusion: s.conclusion })) }))
      }
      break
    }
    case 'release': {
      const release = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      result = { id: release.id, tag: release.tag_name, url: release.html_url, draft: release.draft, prerelease: release.prerelease,
        body: release.body, assets: release.assets.map(a => ({ id: a.id, name: a.name, size: a.size, state: a.state, digest: a.digest, url: a.browser_download_url })) }
      break
    }
    case 'release-asset-plan': {
      const release = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      const plan = releaseAssetPlan(release.tag_name, release.assets)
      result = { tag: plan.tag, keep: plan.keep.map(a => ({ id: a.id, name: a.name, size: a.size })), remove: plan.remove.map(a => ({ id: a.id, name: a.name, size: a.size })) }
      break
    }
    case 'release-asset-cleanup': {
      if (!extra) throw new Error('An exact reviewed asset plan JSON file is required')
      const reviewed = JSON.parse(fs.readFileSync(extra, 'utf8'))
      const release = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      const plan = releaseAssetPlan(release.tag_name, release.assets)
      if (reviewed.tag !== plan.tag || reviewed.remove.length !== plan.remove.length || !plan.remove.every(a => reviewed.remove.some(r => r.id === a.id && r.name === a.name && r.size === a.size))) {
        throw new Error('The release assets changed since the plan was reviewed')
      }
      const removed = []
      for (const asset of plan.remove) {
        await api('DELETE', `/releases/assets/${asset.id}`)
        removed.push({ id: asset.id, name: asset.name })
      }
      const verified = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      if (plan.keep.some(a => !verified.assets.some(v => v.id === a.id))) throw new Error('A retained asset is missing')
      result = { tag: arg, removed, remaining: verified.assets.map(a => ({ name: a.name, size: a.size })) }
      break
    }
    case 'logs': {
      const response = await fetch(`https://api.github.com${repository}/actions/jobs/${arg}/logs`, {
        headers: { Authorization: `Bearer ${getCredential()}`, 'User-Agent': 'NetMask-release-helper' },
        redirect: 'manual', signal: AbortSignal.timeout(30000)
      })
      const location = response.headers.get('location')
      if (!location || !location.startsWith('https://')) throw new Error('GitHub did not provide a secure job log URL.')
      const logResponse = await fetch(location, { signal: AbortSignal.timeout(30000) })
      if (!logResponse.ok) throw new Error(`Could not fetch job log: ${logResponse.status}`)
      result = (await logResponse.text()).split(/\r?\n/).filter(line => /error|missing|invalid|failed|package-lock|warning|could not|not found|not supported/i.test(line)).slice(-120)
      break
    }
    case 'release-edit': {
      const release = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      const updated = await api('PATCH', `/releases/${release.id}`, { body: fs.readFileSync(extra, 'utf8'), name: `NetMask ${arg}` })
      result = { id: updated.id, tag: updated.tag_name, url: updated.html_url }
      break
    }
    default:
      throw new Error('Usage: github-release.cjs prs | pr-create <json-file> | pr <number> | checks <sha> | pr-merge <number> <sha> | runs [sha] | run <id> | run-notices <id> | run-rerun-failed <id> | workflow-dispatch <workflow> <json-file> | logs <job-id> | release <tag> | release-edit <tag> <notes-file>')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

function reportError(error) {
  const message = String(error.message || 'Release helper failed')
  process.stderr.write(`${credential ? message.replaceAll(credential, '[redacted]') : message}\n`)
  process.exitCode = 1
}

module.exports = { api, reportError }
if (require.main === module) main().catch(reportError)
