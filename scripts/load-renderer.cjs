const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')
const renderer = path.resolve(__dirname, '../src/renderer/src') + path.sep

// Exercise the actual TypeScript modules without copying their algorithms into tests.
Module._extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(renderer)) throw new Error('Test loader is limited to renderer source')
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  })
  module._compile(output.outputText, filename)
}

module.exports = name => require(path.join(renderer, name))
