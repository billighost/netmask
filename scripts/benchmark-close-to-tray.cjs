const port = Number(process.argv[2])

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Pass the local WebView2 debugging port')
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function targets() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const value = await response.json()
      if (value.length) return value
    } catch {}
    await delay(100)
  }
  throw new Error('The local WebView2 debugging endpoint did not become ready')
}

async function main() {
  const available = await targets()
  const target = available.find(item => String(item.url).startsWith('http://tauri.localhost'))
  if (!target?.webSocketDebuggerUrl) throw new Error('The NetMask WebView2 target was not found')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebView2 did not accept the local debugging connection')), 10_000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('The local WebView2 debugging connection failed'))
    }, { once: true })
  })

  socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: 'window.nm.close()',
      awaitPromise: true,
      returnByValue: true,
    },
  }))

  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('NetMask did not complete its close-to-tray action')), 10_000)
    socket.addEventListener('message', event => {
      const value = JSON.parse(event.data)
      if (value.id !== 1) return
      clearTimeout(timer)
      resolve(value)
    })
  })
  socket.close()
  if (response.error || response.result?.exceptionDetails || response.result?.result?.subtype === 'error') {
    throw new Error('NetMask rejected the close-to-tray action')
  }
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
