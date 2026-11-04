const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { scanFile } = require('./lint-hooks.js')
function scan(source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'netmask-hooks-'))
  const file = path.join(directory, 'fixture.tsx')
  try { fs.writeFileSync(file, source); return scanFile(file) }
  finally { fs.unlinkSync(file); fs.rmdirSync(directory) }
}
test('hook checks detect an early return and conditional calls', () => {
  assert.ok(scan('function Broken({hide}) { if(hide) return null; const [x] = useState(0); return <div>{x}</div> }').length)
  assert.ok(scan('function Broken({show}) { if(show) { useEffect(() => {}, []); } return null }').length)
})
test('unconditional hooks and event handlers are accepted', () => {
  assert.equal(scan('function Good({hide}) { const [x] = useState(0); if(hide) return null; return <button onClick={() => { if(x) return; }}>Go</button> }').length, 0)
})
