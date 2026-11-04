const { api, reportError } = require('./github-release.cjs')
const { runJobs, runnerUnavailable } = require('./workflow-status.cjs')
async function main() {
  const runId = process.env.RELEASE_RUN_ID
  if (!/^\d+$/.test(runId || '')) throw new Error('A completed release run ID is required')
  const run = await api('GET', `/actions/runs/${runId}`)
  if (run.name !== 'Release & Multi-OS Distribution' || !['push', 'workflow_dispatch'].includes(run.event) || run.status !== 'completed' || run.repository?.full_name !== 'billighost/netmask') throw new Error('Unexpected release workflow')
  if (run.run_attempt >= 3) { console.log('Automatic retry limit reached; missing platforms can be retried manually.'); return }
  const jobs = await runJobs(runId)
  const builds = jobs.filter(job => /^Build \((windows-x64|macos-arm64|macos-x64|linux-x64)\)$/.test(job.name))
  if (!jobs.some(job => job.name === 'Verify release source' && job.conclusion === 'success') ||
    !builds.length || !builds.some(runnerUnavailable) ||
    builds.some(job => !(job.status === 'completed' && job.conclusion === 'success') && !runnerUnavailable(job))) {
    console.log('No retryable runner-allocation failure; build/test failures require a source fix.'); return
  }
  await api('POST', `/actions/runs/${runId}/rerun-failed-jobs`)
  console.log(`Retry requested for missing installers in run ${runId}; successful jobs are retained.`)
}
main().catch(reportError)
