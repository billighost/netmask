const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const tag = process.env.RELEASE_TAG
const version = require('../package.json').version
if (tag !== `v${version}` || !/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error('Release tag must match the stable package version')
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
if (git('rev-parse', 'HEAD') !== git('rev-parse', `${tag}^{commit}`)) throw new Error('Checkout does not match the release tag')
git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
if (!fs.existsSync(`docs/releases/${tag}.md`)) throw new Error('Release notes are missing')
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`)
console.log(`Verified ${tag} at a commit merged into main.`)
