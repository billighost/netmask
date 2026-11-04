const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { verifyNativePackages } = require('./release-assets.cjs')
const version = require('../package.json').version
if (process.env.RELEASE_TAG !== `v${version}`) throw new Error('Release tag and package version differ')
const directory = process.argv[2]
if (!directory) throw new Error('Provide the native package directory')
const names = fs.readdirSync(directory).filter(name => name !== 'checksums.txt')
verifyNativePackages(version, names.map(name => ({ name, size: fs.statSync(path.join(directory, name)).size })))
const checksums = names.sort().map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex')}  ${name}`).join('\n') + '\n'
fs.writeFileSync(path.join(directory, 'checksums.txt'), checksums)
console.log(`Verified all ${names.length} native packages and generated checksums.txt.`)
