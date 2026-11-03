import { join } from 'path'
import { homedir } from 'os'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { renameNetwork } from './registry'

function getDataDir(): string {
  if (process.platform === 'win32') {
    return join(process.env['ProgramData'] || 'C:\\ProgramData', 'NetMask')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'NetMask')
  }
  return join(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config'), 'netmask')
}

export const DATA_DIR = getDataDir()
export const BACKUP_FILE = join(DATA_DIR, 'names.json')

export function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

export function readBackup(): Record<string, string> {
  try {
    if (!existsSync(BACKUP_FILE)) return {}
    const raw = readFileSync(BACKUP_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function writeBackup(data: Record<string, string>): void {
  try {
    ensureDir()
    writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch {}
}

export async function restoreNetwork(guid: string, currentDisplayName?: string): Promise<void> {
  const bk = readBackup()
  const original = bk[guid]
  if (!original) return
  await renameNetwork(guid, original, currentDisplayName)
  delete bk[guid]
  writeBackup(bk)
}

export async function restoreAll(): Promise<void> {
  const bk = readBackup()
  for (const [guid, name] of Object.entries(bk)) {
    try { await renameNetwork(guid, name) } catch {}
  }
  writeBackup({})
}

