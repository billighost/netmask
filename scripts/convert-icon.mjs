/**
 * convert-icon.mjs
 * Converts the generated 512×512 PNG to a proper multi-size .ico file
 * using the `sharp` module (already pulled in via electron-builder deps chain).
 * Run with: node convert-icon.mjs
 */

import { createCanvas } from 'canvas'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// If sharp is available, use it. Otherwise fall back to canvas-based approach.
async function main() {
  const pngPath = join(__dir, '../.gemini/antigravity/brain/dd68ec7a-87fd-48a0-af42-437f96e42760/netmask-icon-512.png')
  const outIco  = join(__dir, 'resources/netmask.ico')

  // Try sharp first
  try {
    const { default: sharp } = await import('sharp')
    const sizes = [16, 24, 32, 48, 64, 128, 256]
    const bufs  = await Promise.all(
      sizes.map(s => sharp(pngPath).resize(s, s).png().toBuffer())
    )
    writeIco(bufs, sizes, outIco)
    console.log(`✅ Icon written to ${outIco}`)
    return
  } catch {}

  // Fallback: just copy the PNG as-is and rename
  // electron-builder will handle PNG→ICO on Windows
  const pngOut = join(__dir, 'resources/netmask-512.png')
  if (existsSync(pngPath)) {
    const data = readFileSync(pngPath)
    writeFileSync(pngOut, data)
    console.log(`✅ PNG copied to ${pngOut} (electron-builder will convert)`)
  } else {
    console.log('⚠️  PNG not found yet — image generator still running?')
  }
}

/**
 * Minimal ICO writer — packs multiple PNGs into an ICO container.
 * Each image is stored as raw PNG data (valid for Win Vista+).
 */
function writeIco(pngBuffers, sizes, outPath) {
  const n = pngBuffers.length
  const headerSize = 6 + n * 16
  let offset = headerSize

  const header = Buffer.alloc(headerSize)
  // ICO header
  header.writeUInt16LE(0, 0)  // reserved
  header.writeUInt16LE(1, 2)  // type = ICO
  header.writeUInt16LE(n, 4)  // count

  const images = pngBuffers.map((buf, i) => {
    const size = sizes[i]
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0)  // width (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1)  // height
    entry.writeUInt8(0, 2)   // color palette
    entry.writeUInt8(0, 3)   // reserved
    entry.writeUInt16LE(1, 4)  // planes
    entry.writeUInt16LE(32, 6) // bit count
    entry.writeUInt32LE(buf.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += buf.length
    header.set(entry, 6 + i * 16)
    return buf
  })

  writeFileSync(outPath, Buffer.concat([header, ...images]))
}

main().catch(console.error)

