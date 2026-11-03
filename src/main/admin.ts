import { execSync, spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'

export function isAdmin(): boolean {
  try {
    execSync('fltmc', { stdio: 'ignore', windowsHide: true, timeout: 2000 })
    return true
  } catch {
    return false
  }
}

/**
 * Elevates the application to Administrator via UAC.
 * Spawns the elevated process detached and forcefully terminates
 * the current un-elevated instance so only one clean process remains.
 */
export function elevate(): void {
  try {
    let script: string

    if (app.isPackaged) {
      const exe = process.execPath.replace(/'/g, "''")
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

    // Forceful exit to bypass any window close / minimize-to-tray cancellation
    setTimeout(() => {
      app.exit(0)
    }, 400)
  } catch (err) {
    console.error('Failed to elevate:', err)
  }
}
