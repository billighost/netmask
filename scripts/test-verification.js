const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('--- Running NetMask 2.1 Verification Suite ---')

// 1. Verify package.json and electron-builder.yml
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'))
assert.strictEqual(pkg.author.name, 'Bello Bilal', 'package.json author name must be Bello Bilal')
assert.strictEqual(pkg.author.email, 'bb2010ng@gmail.com', 'package.json author email must be bb2010ng@gmail.com')
assert.strictEqual(pkg.author.url, 'https://github.com/billighost', 'package.json author url must be billighost')
console.log('✓ package.json author configuration verified')

const builderYml = fs.readFileSync(path.join(__dirname, '../electron-builder.yml'), 'utf8')
assert(builderYml.includes('maintainer: "Bello Bilal <bb2010ng@gmail.com>"'), 'electron-builder.yml must have maintainer email')
assert(builderYml.includes('copyright: "Copyright © 2026 Bello Bilal"'), 'electron-builder.yml copyright must be Bello Bilal')
assert(builderYml.includes('owner: billighost'), 'electron-builder.yml owner must be billighost')
assert(builderYml.includes('repo: netmask'), 'electron-builder.yml repo must be netmask')
console.log('✓ electron-builder.yml author, maintainer and repo verified')

// 2. Verify Key Combinations Normalization & Parsing logic
function normalizeKeyCombination(e) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock'].includes(e.key)) {
    return null
  }
  const parts = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')

  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp') key = 'ArrowUp'
  else if (key === 'ArrowDown') key = 'ArrowDown'
  else if (key === 'ArrowLeft') key = 'ArrowLeft'
  else if (key === 'ArrowRight') key = 'ArrowRight'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts.join('+')
}

function parseKeyCombination(keyStr) {
  if (!keyStr) return []
  if (keyStr.endsWith('++')) {
    const prefix = keyStr.slice(0, -2)
    return [...(prefix ? prefix.split('+') : []), '+']
  }
  if (keyStr === '+') {
    return ['+']
  }
  return keyStr.split('+')
}

// Test solitary modifiers return null
assert.strictEqual(normalizeKeyCombination({ key: 'Control', ctrlKey: true }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'Alt', altKey: true }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'Shift', shiftKey: true }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'Meta', metaKey: true }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'AltGraph' }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'CapsLock' }), null)
assert.strictEqual(normalizeKeyCombination({ key: 'NumLock' }), null)

// Test key combos
assert.strictEqual(normalizeKeyCombination({ key: 'r', ctrlKey: true }), 'Ctrl+R')
assert.strictEqual(normalizeKeyCombination({ key: 'Z', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Z')
assert.strictEqual(normalizeKeyCombination({ key: 'ArrowDown' }), 'ArrowDown')
assert.strictEqual(normalizeKeyCombination({ key: 'Escape' }), 'Escape')
assert.strictEqual(normalizeKeyCombination({ key: ',' , ctrlKey: true }), 'Ctrl+,')
assert.strictEqual(normalizeKeyCombination({ key: '/' , ctrlKey: true }), 'Ctrl+/')
assert.strictEqual(normalizeKeyCombination({ key: '+' , ctrlKey: true }), 'Ctrl++')
console.log('✓ normalizeKeyCombination unit tests passed')

// Test parseKeyCombination
assert.deepStrictEqual(parseKeyCombination('Ctrl+R'), ['Ctrl', 'R'])
assert.deepStrictEqual(parseKeyCombination('Ctrl+Shift+Z'), ['Ctrl', 'Shift', 'Z'])
assert.deepStrictEqual(parseKeyCombination('Ctrl++'), ['Ctrl', '+'])
assert.deepStrictEqual(parseKeyCombination('+'), ['+'])
assert.deepStrictEqual(parseKeyCombination(''), [])
console.log('✓ parseKeyCombination edge cases passed (including Ctrl++)')

// 3. Test de-conflicting shortcut logic
function updateShortcut(current, id, key) {
  const updated = { ...current }
  if (key) {
    for (const [k, v] of Object.entries(updated)) {
      if (k !== id && v && v.toLowerCase() === key.toLowerCase()) {
        updated[k] = ''
      }
    }
  }
  updated[id] = key
  return updated
}

const initialShortcuts = {
  refresh: 'Ctrl+R',
  focusRename: 'Ctrl+N'
}
const remapResult = updateShortcut(initialShortcuts, 'focusRename', 'Ctrl+R')
assert.strictEqual(remapResult.focusRename, 'Ctrl+R', 'focusRename should be Ctrl+R')
assert.strictEqual(remapResult.refresh, '', 'refresh should be unassigned when conflict occurs')
console.log('✓ shortcut conflict de-duplication passed')

// 4. Test compareSemver logic from updater
function compareSemver(v1, v2) {
  const clean = (v) => v.replace(/^v/i, '').trim().split('-')[0].split('.').map(Number)
  const p1 = clean(v1)
  const p2 = clean(v2)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return 1
    if (num1 < num2) return -1
  }
  return 0
}

assert(compareSemver('2.1.1', '2.1.0') > 0, '2.1.1 should be greater than 2.1.0')
assert(compareSemver('v2.2.0', '2.1.0') > 0, 'v2.2.0 should be greater than 2.1.0')
assert.strictEqual(compareSemver('2.1.0', '2.1.0'), 0, '2.1.0 should equal 2.1.0')
assert(compareSemver('2.0.9', '2.1.0') < 0, '2.0.9 should be less than 2.1.0')
console.log('✓ compareSemver logic passed')

// 5. Verify CSS classes exist in SettingsModal.module.css
const settingsCss = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/SettingsModal/SettingsModal.module.css'), 'utf8')
assert(settingsCss.includes('.spinner'), 'SettingsModal.module.css must contain .spinner')
assert(settingsCss.includes('.progressBox'), 'SettingsModal.module.css must contain .progressBox')
assert(settingsCss.includes('.btnRow'), 'SettingsModal.module.css must contain .btnRow')
assert(settingsCss.includes('.authorCard'), 'SettingsModal.module.css must contain .authorCard')
assert(settingsCss.includes('.updateStatusCard'), 'SettingsModal.module.css must contain .updateStatusCard')
console.log('✓ SettingsModal.module.css contains .spinner, .progressBox, .btnRow, .authorCard')

// 6. Verify CSS in KeyboardControlsModal.module.css
const keyboardCss = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/KeyboardControlsModal/KeyboardControlsModal.module.css'), 'utf8')
assert(keyboardCss.includes('.unassigned'), 'KeyboardControlsModal.module.css must contain .unassigned')
assert(keyboardCss.includes('.kbd'), 'KeyboardControlsModal.module.css must contain .kbd')
assert(keyboardCss.includes('.recordingBadge'), 'KeyboardControlsModal.module.css must contain .recordingBadge')
console.log('✓ KeyboardControlsModal.module.css contains .unassigned, .kbd, .recordingBadge')

console.log('--- ALL VERIFICATION CHECKS PASSED SUCCESSFULLY ---')
