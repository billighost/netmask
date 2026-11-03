import { execSync, spawn } from 'child_process'
import { app } from 'electron'
import { join } from 'path'

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
 * Elevates the application to Administrator / Root.
 * Spawns the elevated process detached and forcefully terminates
 * the current un-elevated instance so only one clean process remains.
 */
export function elevate(): void {
  try {
    if (process.platform === 'win32') {
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
    } else if (process.platform === 'darwin') {
      const child = spawn('osascript', ['-e', `do shell script "${process.execPath}" with administrator privileges`], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    } else if (process.platform === 'linux') {
      const child = spawn('pkexec', [process.execPath], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
    }

    setTimeout(() => {
      app.exit(0)
    }, 400)
  } catch (err) {
    console.error('Failed to elevate:', err)
  }
}
