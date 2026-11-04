const { reportError } = require('./github-release.cjs')
const { runJobs, platformStatus } = require('./workflow-status.cjs')
async function main() {
  const jobs = await runJobs(process.env.GITHUB_RUN_ID)
  const frontend = jobs.filter(job => job.name === 'TypeScript Check')
  if (frontend.length !== 1 || frontend[0].status !== 'completed' || frontend[0].conclusion !== 'success') throw new Error('Frontend verification must succeed')
  const result = platformStatus(jobs, undefined, true)
  console.log(JSON.stringify(result))
  if (result.unavailable.length) console.log(`Runner capacity prevented checks for: ${result.unavailable.join(', ')}. Those installers must remain unavailable until successfully built.`)
}
main().catch(reportError)
