import { execSync, execFile, exec, spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { getSettings } from './settings'

export interface ElevationStatus {
  isElevated: boolean
  silentElevationEnabled: boolean
  taskConfigured: boolean
  tier: 'task' | 'broker' | 'jit'
}

export function isAdmin(): boolean {
  if (process.platform === 'win32') {
    try {
      execSync('fltmc', { stdio: 'ignore', windowsHide: true, timeout: 2000 })
      return true
    } catch {
      return false
    }
  }
  // On Unix-like systems, root UID is 0
  if (typeof process.getuid === 'function') {
    return process.getuid() === 0
  }
  return true
}

/**
 * Checks whether the Windows Task Scheduler silent elevation task "NetMask_Elevated" is registered.
 */
export function isTaskConfigured(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false)
      return
    }
    execFile('schtasks.exe', ['/query', '/tn', 'NetMask_Elevated'], { windowsHide: true, timeout: 3000 }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Registers the highest-privilege task "NetMask_Elevated" in Windows Task Scheduler.
 * When launched via this task, NetMask runs with full administrative privileges and 0 UAC prompts.
 */
export function setupTaskElevation(): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: true, message: 'Platform manages elevation natively' })
      return
    }

    const exe = process.execPath
    if (isAdmin()) {
      execFile(
        'schtasks.exe',
        ['/create', '/tn', 'NetMask_Elevated', '/tr', `"${exe}"`, '/rl', 'HIGHEST', '/sc', 'ONLOGON', '/f'],
        { windowsHide: true, timeout: 8000 },
        (err) => {
          if (err) {
            resolve({ success: false, message: 'Failed to create elevation task' })
          } else {
            resolve({ success: true, message: 'Silent elevation task registered successfully' })
          }
        }
      )
    } else {
      // Trigger a single UAC prompt to register the task permanently
      const psCommand = `Start-Process -FilePath 'schtasks.exe' -ArgumentList @('/create', '/tn', 'NetMask_Elevated', '/tr', "\`"${exe}\`"", '/rl', 'HIGHEST', '/sc', 'ONLOGON', '/f') -Verb RunAs -Wait -WindowStyle Hidden`
      const b64 = Buffer.from(psCommand, 'utf16le').toString('base64')
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, { timeout: 25000 }, (err) => {
        if (err) {
          resolve({ success: false, message: 'Elevation prompt was canceled or rejected' })
        } else {
          isTaskConfigured().then((configured) => {
            if (configured) {
              resolve({ success: true, message: 'Zero-prompt task registered successfully' })
            } else {
              resolve({ success: false, message: 'Failed to configure task' })
            }
          })
        }
      })
    }
  })
}

/**
 * Removes the Windows Task Scheduler silent elevation task "NetMask_Elevated".
 */
export function removeTaskElevation(): Promise<{ success: boolean; message?: string }> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ success: true })
      return
    }

    if (isAdmin()) {
      execFile('schtasks.exe', ['/delete', '/tn', 'NetMask_Elevated', '/f'], { windowsHide: true, timeout: 5000 }, (err) => {
        resolve({ success: !err, message: err ? 'Task does not exist or deletion failed' : 'Task removed' })
      })
    } else {
      const psCommand = `Start-Process -FilePath 'schtasks.exe' -ArgumentList @('/delete', '/tn', 'NetMask_Elevated', '/f') -Verb RunAs -Wait -WindowStyle Hidden`
      const b64 = Buffer.from(psCommand, 'utf16le').toString('base64')
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}`, { timeout: 20000 }, (err) => {
        resolve({ success: !err, message: err ? 'Deletion canceled' : 'Task removed' })
      })
    }
  })
}

/**
 * Returns the current 3-Tier Cascading Elevation status of the application.
 */
export async function getElevationStatus(): Promise<ElevationStatus> {
  const isElevated = isAdmin()
  const taskConfigured = await isTaskConfigured()
  const settings = getSettings()
  const silentElevationEnabled = settings.silentElevation !== false

  let tier: 'task' | 'broker' | 'jit' = 'jit'
  if (taskConfigured) {
    tier = 'task'
  } else if (isElevated) {
    tier = 'broker'
  } else {
    tier = 'jit'
  }

  return {
    isElevated,
    silentElevationEnabled,
    taskConfigured,
    tier
  }
}

function launchJitElevation(): void {
  const exe = process.execPath.replace(/'/g, "''")
  let script: string

  if (app.isPackaged) {
    const workDir = join(process.execPath, '..').replace(/'/g, "''")
    script = `[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process'); Start-Process -FilePath '${exe}' -WorkingDirectory '${workDir}' -Verb RunAs`
  } else {
    const runJs = join(app.getAppPath(), 'scripts', 'run.js').replace(/'/g, "''")
    const workDir = app.getAppPath().replace(/'/g, "''")
    script = `[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process'); Start-Process -FilePath 'node.exe' -ArgumentList '${runJs}' -WorkingDirectory '${workDir}' -Verb RunAs`
  }

  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`
  const child = spawn(cmd, {
    shell: true,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()

  setTimeout(() => {
    app.exit(0)
  }, 400)
}

/**
 * Elevates the application using the 3-Tier Cascading Elevation architecture:
 * Tier 1: Windows Task Scheduler silent elevation (zero UAC prompt)
 * Tier 2: Background Broker / Administrator Process
 * Tier 3: On-Demand Just-In-Time Elevation via RunAs
 */
export async function elevate(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      const taskConfigured = await isTaskConfigured()
      const settings = getSettings()

      if (taskConfigured && settings.silentElevation !== false) {
        // Tier 1: Silent execution without UAC prompt
        execFile('schtasks.exe', ['/run', '/tn', 'NetMask_Elevated'], { windowsHide: true, timeout: 5000 }, (err) => {
          if (!err) {
            setTimeout(() => {
              app.exit(0)
            }, 600)
          } else {
            // Fall back to Tier 3 on unexpected error
            launchJitElevation()
          }
        })
        return
      }

      // Tier 3: JIT Elevation
      launchJitElevation()
    } else if (process.platform === 'darwin') {
      const child = spawn('osascript', ['-e', `do shell script "${process.execPath}" with administrator privileges`], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      setTimeout(() => {
        app.exit(0)
      }, 400)
    } else if (process.platform === 'linux') {
      const child = spawn('pkexec', [process.execPath], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      setTimeout(() => {
        app.exit(0)
      }, 400)
    }
  } catch (err) {
    console.error('Failed to elevate:', err)
  }
}

/**
 * Silently triggers the elevated scheduled task if configured.
 */
export function triggerSilentElevation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false)
    execFile('schtasks.exe', ['/run', '/tn', 'NetMask_Elevated'], { windowsHide: true, timeout: 5000 }, (err) => {
      resolve(!err)
    })
  })
}

/**
 * Runs a PowerShell script or shell command with elevated administrative privileges.
 * If NetMask is already running as Administrator, executes directly.
 * Otherwise, dispatches via RunAs or scheduled task.
 */
export function runElevatedCommand(script: string, timeout = 25000): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      if (isAdmin()) {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
          { windowsHide: true, timeout },
          (err, stdout, stderr) => {
            if (err) {
              resolve({ success: false, output: stdout || '', error: stderr || err.message })
            } else {
              resolve({ success: true, output: stdout || '' })
            }
          }
        )
      } else {
        const b64 = Buffer.from(script, 'utf16le').toString('base64')
        const elevatedCmd = `$p = Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${b64}' -Verb RunAs -Wait -WindowStyle Hidden -PassThru; exit $p.ExitCode`
        const outerB64 = Buffer.from(elevatedCmd, 'utf16le').toString('base64')
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${outerB64}`, { timeout }, (err, stdout, stderr) => {
          if (err) {
            resolve({ success: false, output: stdout || '', error: stderr || err.message })
          } else {
            resolve({ success: true, output: stdout || '' })
          }
        })
      }
    } else if (process.platform === 'darwin') {
      const escaped = script.replace(/"/g, '\\"')
      exec(`osascript -e 'do shell script "${escaped}" with administrator privileges'`, { timeout }, (err, stdout, stderr) => {
        resolve({ success: !err, output: stdout || '', error: stderr || (err ? err.message : undefined) })
      })
    } else {
      exec(`pkexec bash -c "${script.replace(/"/g, '\\"')}"`, { timeout }, (err, stdout, stderr) => {
        resolve({ success: !err, output: stdout || '', error: stderr || (err ? err.message : undefined) })
      })
    }
  })
}

