// Release helper: uses Git Credential Manager without printing or persisting credentials.
// Examples: node scripts/github-release.cjs checks <sha>
//           node scripts/github-release.cjs release v2.2.0
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

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
  const result = response.status === 204 ? {} : await response.json()
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
    case 'pr-merge':
      if (!extra) throw new Error('The reviewed PR head SHA is required when merging.')
      result = await api('PUT', `/pulls/${arg}/merge`, { merge_method: 'squash', sha: extra })
      break
    case 'runs': {
      const runs = await api('GET', `/actions/runs?per_page=15${arg ? `&head_sha=${encodeURIComponent(arg)}` : ''}`)
      result = runs.workflow_runs.map(r => ({ id: r.id, name: r.name, event: r.event, branch: r.head_branch, sha: r.head_sha, status: r.status, conclusion: r.conclusion, url: r.html_url }))
      break
    }
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
        body: release.body, assets: release.assets.map(a => ({ name: a.name, size: a.size, state: a.state, url: a.browser_download_url })) }
      break
    }
    case 'release-edit': {
      const release = await api('GET', `/releases/tags/${encodeURIComponent(arg)}`)
      const updated = await api('PATCH', `/releases/${release.id}`, { body: fs.readFileSync(extra, 'utf8'), name: `NetMask ${arg}` })
      result = { id: updated.id, tag: updated.tag_name, url: updated.html_url }
      break
    }
    default:
      throw new Error('Usage: github-release.cjs prs | pr-create <json-file> | pr <number> | checks <sha> | pr-merge <number> <sha> | runs [sha] | run <id> | release <tag> | release-edit <tag> <notes-file>')
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch(error => {
  const message = String(error.message || 'Release helper failed')
  process.stderr.write(`${credential ? message.replaceAll(credential, '[redacted]') : message}\n`)
  process.exitCode = 1
})
