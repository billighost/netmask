const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')
const load = require('./load-renderer.cjs')
const rendererRoot = path.resolve(__dirname, '../src/renderer/src') + path.sep
Module._extensions['.tsx'] = (module, filename) => {
  if (!filename.startsWith(rendererRoot)) throw new Error('Test loader is limited to renderer source')
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}})
  module._compile(output.outputText, filename)
}
Module._extensions['.css'] = module => {module.exports = {__esModule:true,default:new Proxy({}, {get:(_target,name) => String(name)})}}

const {DEFAULT_MINI_PREFERENCES,MINI_DESIGNS,MINI_METRICS,normalizeMiniPreferences,miniWidgetSize,miniWidgetScale,miniReadings,miniVisibleReadings,toggleMiniMetric,miniActivityPath} = load('mini-display.ts')
const {MiniWidget,MiniWidgetPreview} = load('components/MiniWidget/MiniWidget.tsx')
const now = Date.now()
const connection = {ssid:'Actual network',profile:'saved-profile',name:'Familiar nickname',signal:92,band:'5 GHz',rxRateMbps:866.7,txRateMbps:433}
const speed = {available:true,downMBps:3.1,upMBps:.4,downKbps:3100,upKbps:400}
const ping = {gatewayIp:null,gatewayMs:2,internetMs:18,jitterMs:1,timestamp:now}
const props = {connection,speed,pingTelemetry:ping,onPreferencesChange:()=>{},onStartDrag:()=>{},onRestoreFull:()=>{},onCustomize:()=>{}}

test('mini readings use real traffic and receive Wi-Fi link rate with distinct units and explanations', () => {
  const values = miniReadings(connection,speed,ping,now)
  assert.equal(values.download.value,'24.8')
  assert.equal(values.upload.value,'3.2')
  assert.equal(values.download.unit,'Mbps')
  assert.equal(values.link.value,'867')
  assert.equal(values.link.unit,'Mbps')
  assert.equal(values.signal.value,'92')
  assert.equal(values.latency.value,'18')
  assert.match(values.download.detail,/not an internet speed test/)
  assert.match(values.link.detail,/not your internet speed/)
})

test('zero traffic is valid; unsupported Wi-Fi and stale latency remain unavailable', () => {
  assert.equal(miniReadings(null,{...speed,downMBps:0},null,now).download.value,'0')
  const values = miniReadings({...connection,rxRateMbps:undefined,signal:NaN},{...speed,available:false},{...ping,timestamp:now-30001},now)
  for (const id of MINI_METRICS) {
    assert.equal(values[id].available,false,id)
    assert.equal(values[id].value,'—',id)
    assert.equal(values[id].unit,'',id)
  }
  assert.equal(miniReadings({...connection,rxRateMbps:0},speed,ping,now).link.available,false)
  assert.equal(miniReadings({...connection,rxRateMbps:-1},speed,ping,now).link.available,false)
  assert.equal(miniReadings(connection,speed,{...ping,timestamp:now+6000},now).latency.available,false)
  assert.equal(miniReadings(connection,speed,{...ping,timestamp:0},now).latency.available,false)
  assert.equal(miniReadings(null,{...speed,downMBps:NaN},null,now).download.available,false)
})

test('preferences normalize corrupt storage and protect the last selected reading', () => {
  assert.deepEqual(normalizeMiniPreferences({design:'unknown',size:Infinity,opacity:-100,metrics:['unknown','link','link']}), {...DEFAULT_MINI_PREFERENCES,opacity:35,metrics:['link']})
  assert.deepEqual(normalizeMiniPreferences({metrics:[]}).metrics,['link'])
  assert.deepEqual(toggleMiniMetric({...DEFAULT_MINI_PREFERENCES,metrics:['upload']},'upload',false),['upload'])
  assert.deepEqual(toggleMiniMetric({...DEFAULT_MINI_PREFERENCES,metrics:['upload']},'link',true),['upload','link'])
})

test('all five designs render every single selected reading; minimal always shows only Wi-Fi link', () => {
  for (const design of MINI_DESIGNS) {
    for (const metric of MINI_METRICS) {
      const preferences = {...DEFAULT_MINI_PREFERENCES,design:design.value,metrics:[metric]}
      const markup = renderToStaticMarkup(React.createElement(MiniWidget,{...props,preferences}))
      assert.equal((markup.match(/data-mini-metric=/g)||[]).length,1,`${design.value}/${metric}`)
      assert.match(markup,new RegExp(`data-mini-metric="${metric}"`))
      assert.ok(markup.includes('Familiar nickname'))
      assert.ok(!markup.includes('Actual network'))
      const minimal = renderToStaticMarkup(React.createElement(MiniWidget,{...props,preferences:{...preferences,minimal:true}}))
      assert.equal((minimal.match(/data-mini-metric=/g)||[]).length,1)
      assert.match(minimal,/data-mini-metric="link"/)
      assert.match(minimal,/>867<small>Mbps/)
      assert.ok(!minimal.includes('Familiar nickname'))
      assert.deepEqual(miniVisibleReadings({...preferences,minimal:true},miniReadings(connection,speed,ping,now)).map(value=>value.id),['link'])
    }
  }
})

test('all minimal designs show honest unavailable state with no negotiated receive link rate', () => {
  for (const design of MINI_DESIGNS) {
    const markup = renderToStaticMarkup(React.createElement(MiniWidget,{...props,connection:{...connection,rxRateMbps:undefined},preferences:{...DEFAULT_MINI_PREFERENCES,design:design.value,minimal:true}}))
    assert.match(markup,/Wi-Fi link unavailable/)
    assert.match(markup,/data-available="false"/)
    assert.ok(!markup.includes('433'))
  }
})

test('all full wired widgets show their connected nickname and real internet readings without Wi-Fi details', () => {
  for (const design of MINI_DESIGNS) {
    const preferences = {...DEFAULT_MINI_PREFERENCES,design:design.value}
    const wired = {...props,connection:null,connected:true,connectionStatus:'Wired',fallbackConnectionKey:'wired-profile',displayName:'Workshop',preferences}
    const markup = renderToStaticMarkup(React.createElement(MiniWidget,wired))
    assert.match(markup,/Workshop/)
    assert.match(markup,/>Wired</)
    assert.ok(!markup.includes('Offline') && !markup.includes('Not connected'))
    for (const metric of ['download','upload','latency']) assert.match(markup,new RegExp(`data-mini-metric="${metric}" data-available="true"`))
    for (const metric of ['link','signal']) assert.match(markup,new RegExp(`data-mini-metric="${metric}" data-available="false"`))
    const tiny = renderToStaticMarkup(React.createElement(MiniWidget,{...wired,preferences:{...preferences,minimal:true}}))
    assert.match(tiny,/Wi-Fi link unavailable/)
    assert.equal((tiny.match(/data-mini-metric=/g)||[]).length,1)
    assert.ok(!tiny.includes('867') && !tiny.includes('433'))
    const privateName = renderToStaticMarkup(React.createElement(MiniWidget,{...wired,displayName:'Private connection'}))
    assert.ok(privateName.includes('Private connection') && !privateName.includes('Workshop'))
  }
})

test('native dimensions match all full and compact designs and scale to whole pixels', () => {
  for (const design of MINI_DESIGNS) {
    const preferences = {...DEFAULT_MINI_PREFERENCES,design:design.value}
    const full = miniWidgetSize(preferences)
    const small = miniWidgetSize({...preferences,minimal:true})
    assert.ok(small.width < full.width && small.height < full.height)
    assert.ok(small.width <=176 && small.height<=54)
    const scaled = miniWidgetSize({...preferences,size:125})
    assert.deepEqual(scaled,{width:Math.ceil(full.width*1.25),height:Math.ceil(full.height*1.25)})
  }
})

test('requested widget size survives constrained work areas and native fit remains stable while menu expands', () => {
  const preferences = {...DEFAULT_MINI_PREFERENCES,design:'ribbon',size:140}
  const scale = miniWidgetScale(preferences,{width:512,height:300})
  assert.equal(scale,512/394)
  assert.equal(Math.ceil(394*scale),512)
  assert.equal(preferences.size,140)
  assert.equal(miniWidgetScale(preferences,{width:700,height:600},scale),scale)
  assert.equal(miniWidgetScale(preferences,{width:700,height:44}),.5)
  for (const invalid of [NaN,Infinity,0,-1]) assert.equal(miniWidgetScale(preferences,{width:512,height:300},invalid),scale)
  assert.equal(miniWidgetScale(preferences,null,100),1.4)
  assert.equal(miniWidgetScale(preferences,null,.75),.75)
})

test('sharing label hides real network name and Settings preview is inert', () => {
  const markup = renderToStaticMarkup(React.createElement(MiniWidget,{...props,displayName:'Private connection',preferences:DEFAULT_MINI_PREFERENCES}))
  assert.ok(markup.includes('Private connection'))
  assert.ok(!markup.includes('Familiar nickname'))
  assert.ok(!markup.includes('Actual network'))
  const preview = renderToStaticMarkup(React.createElement(MiniWidgetPreview,{...props,preferences:DEFAULT_MINI_PREFERENCES}))
  assert.match(preview,/aria-hidden="true"/)
  assert.ok(!preview.includes('tabindex="0"'))
  const paused = renderToStaticMarkup(React.createElement(MiniWidget,{...props,readingsPaused:true,preferences:{...DEFAULT_MINI_PREFERENCES,minimal:true}}))
  assert.match(paused,/Paused\. Wi-Fi link/)
  assert.match(paused,/Wi-Fi · paused/)
})

test('activity chart needs measured history and stays bounded with invalid samples', () => {
  assert.equal(miniActivityPath([]),'')
  assert.equal(miniActivityPath([1]),'')
  assert.equal(miniActivityPath([NaN,-1]),'')
  assert.match(miniActivityPath([0,1,NaN,2]),/^M0\.0,24\.0 L115\.0,13\.0 L230\.0,2\.0$/)
})
