const requiredChecks = [
  'TypeScript Check',
  'Build (windows-latest)',
  'Build (macos-latest)',
  'Build (macos-15-intel)',
  'Build (ubuntu-latest)',
  'CI Gate'
]

function verifyMergeChecks(pr, sha, checks, statuses, unavailableJobs = []) {
  if (!/^[a-f0-9]{40}$/.test(sha) || pr.head?.sha !== sha) throw new Error('The PR head changed or the reviewed SHA is invalid')
  if (pr.state !== 'open' || pr.base?.ref !== 'main' || pr.mergeable !== true) throw new Error('The PR must be open, mergeable, and target main')
  if (checks.total_count !== checks.check_runs.length) throw new Error('The check response is incomplete; refusing to merge')
  if (statuses.total_count !== undefined && statuses.total_count !== statuses.statuses.length) throw new Error('The commit status response is incomplete; refusing to merge')
  for (const name of requiredChecks) {
    const matches = checks.check_runs.filter(check => check.name === name && check.app?.slug === 'github-actions')
    const check = matches[0]
    const unavailable = unavailableJobs.some(job => job.name === name && job.check_run_url?.endsWith(`/check-runs/${check?.id}`))
    if (matches.length !== 1 || check.head_sha !== sha || check.status !== 'completed' ||
      (check.conclusion !== 'success' && !(name.startsWith('Build (') && check.conclusion === 'cancelled' && unavailable))) {
      throw new Error(`Required check must succeed on the reviewed head: ${name}`)
    }
  }
  if (statuses.statuses.some(status => status.state !== 'success')) throw new Error('A commit status is pending or failed')
}

module.exports = { requiredChecks, verifyMergeChecks }
