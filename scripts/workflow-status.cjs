const { api } = require('./github-release.cjs')

const platformRunners = {
  'windows-x64': 'windows-latest',
  'macos-arm64': 'macos-latest',
  'macos-x64': 'macos-15-intel',
  'linux-x64': 'ubuntu-latest'
}

function runnerUnavailable(job) {
  return job.status === 'completed' && job.conclusion === 'cancelled' && !job.runner_name &&
    Array.isArray(job.steps) && job.steps.length === 0 &&
    job.annotations?.some(annotation => /The job was not acquired by Runner of type hosted/i.test(annotation.message))
}

function platformStatus(jobs, platforms = Object.keys(platformRunners), ci = false) {
  if (!platforms.length || platforms.some(platform => !platformRunners[platform]) || new Set(platforms).size !== platforms.length) throw new Error('Invalid platform selection')
  const available = [], unavailable = []
  for (const platform of platforms) {
    const name = `Build (${ci ? platformRunners[platform] : platform})`
    const matches = jobs.filter(job => job.name === name)
    if (matches.length !== 1) throw new Error(`Missing or duplicate platform job: ${name}`)
    const job = matches[0]
    if (job.status === 'completed' && job.conclusion === 'success') available.push(platform)
    else if (runnerUnavailable(job)) unavailable.push(platform)
    else throw new Error(`Platform job did not succeed: ${name} (${job.status}/${job.conclusion})`)
  }
  if (!available.length) throw new Error('At least one platform must build successfully')
  return { available, unavailable }
}

async function runJobs(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('A workflow run ID is required')
  const result = await api('GET', `/actions/runs/${id}/jobs?filter=latest&per_page=100`)
  if (result.total_count !== result.jobs.length) throw new Error('Incomplete workflow job response')
  return Promise.all(result.jobs.map(async job => {
    if (job.conclusion !== 'cancelled' || job.runner_name || job.steps.length) return job
    const checkId = job.check_run_url?.split('/').at(-1)
    if (!/^\d+$/.test(checkId || '')) return job
    return { ...job, annotations: await api('GET', `/check-runs/${checkId}/annotations?per_page=100`) }
  }))
}

module.exports = { platformRunners, runnerUnavailable, platformStatus, runJobs }
