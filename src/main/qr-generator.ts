/**
 * Lightweight, self-contained QR Code Matrix Generator and SVG Renderer.
 * Implements ISO/IEC 18004 specification for Versions 1-10 with Error Correction Level M.
 * Produces crisp, vector-based SVG markup with 0 external dependencies.
 */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
let val = 1
for (let i = 0; i < 255; i++) {
  EXP[i] = val
  EXP[i + 255] = val
  LOG[val] = i
  val = (val << 1) ^ (val & 128 ? 0x11d : 0)
}

function gfMul(x: number, y: number): number {
  return x === 0 || y === 0 ? 0 : EXP[LOG[x] + LOG[y]]
}

function rsGeneratorPoly(numEcc: number): number[] {
  let poly = [1]
  for (let i = 0; i < numEcc; i++) {
    const factor = EXP[i]
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], factor)
    }
    poly = next
  }
  return poly
}

function rsComputeEcc(data: Uint8Array, numEcc: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcc)
  const rem = new Uint8Array(numEcc)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0]
    rem.copyWithin(0, 1)
    rem[numEcc - 1] = 0
    for (let j = 0; j < numEcc; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor)
    }
  }
  return rem
}

interface QrSpec {
  version: number
  total: number
  ecc: number
  b1: number
  d1: number
  b2: number
  d2: number
}

const QR_SPECS_M: (QrSpec | null)[] = [
  null,
  { version: 1, total: 26, ecc: 10, b1: 1, d1: 16, b2: 0, d2: 0 },
  { version: 2, total: 44, ecc: 16, b1: 1, d1: 28, b2: 0, d2: 0 },
  { version: 3, total: 70, ecc: 26, b1: 1, d1: 44, b2: 0, d2: 0 },
  { version: 4, total: 100, ecc: 18, b1: 2, d1: 32, b2: 0, d2: 0 },
  { version: 5, total: 134, ecc: 24, b1: 2, d1: 43, b2: 0, d2: 0 },
  { version: 6, total: 172, ecc: 16, b1: 4, d1: 27, b2: 0, d2: 0 },
  { version: 7, total: 196, ecc: 18, b1: 4, d1: 31, b2: 0, d2: 0 },
  { version: 8, total: 242, ecc: 22, b1: 2, d1: 38, b2: 2, d2: 39 },
  { version: 9, total: 292, ecc: 22, b1: 3, d1: 36, b2: 2, d2: 37 },
  { version: 10, total: 346, ecc: 26, b1: 4, d1: 43, b2: 1, d2: 44 }
]

const ALIGNMENT_COORDS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
]

function getBestVersion(dataLength: number): QrSpec {
  for (let v = 1; v <= 10; v++) {
    const spec = QR_SPECS_M[v]
    if (!spec) continue
    const dataCapacity = spec.b1 * spec.d1 + spec.b2 * spec.d2
    const headerBits = 4 + (v <= 9 ? 8 : 16)
    const availableBytes = Math.floor((dataCapacity * 8 - headerBits) / 8)
    if (dataLength <= availableBytes) {
      return spec
    }
  }
  throw new Error('Data exceeds capacity for supported QR code versions (up to ~270 bytes)')
}

class BitBuffer {
  buffer: number[] = []
  length = 0

  put(num: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) {
      this.buffer.push((num >>> i) & 1)
      this.length++
    }
  }
}

function encodeData(text: string, spec: QrSpec): Uint8Array {
  const bytes = Buffer.from(text, 'utf8')
  const totalDataBytes = spec.b1 * spec.d1 + spec.b2 * spec.d2
  const bb = new BitBuffer()

  // Mode: Byte (0100)
  bb.put(0b0100, 4)
  // Character count indicator
  const charCountBits = spec.version <= 9 ? 8 : 16
  bb.put(bytes.length, charCountBits)

  // Data bytes
  for (let i = 0; i < bytes.length; i++) {
    bb.put(bytes[i], 8)
  }

  // Terminator (up to 4 zeroes)
  const remainingBits = totalDataBytes * 8 - bb.length
  const termBits = Math.min(4, Math.max(0, remainingBits))
  bb.put(0, termBits)

  // Pad to byte boundary
  while (bb.length % 8 !== 0) {
    bb.put(0, 1)
  }

  const data = new Uint8Array(totalDataBytes)
  for (let i = 0; i < bb.length / 8; i++) {
    let b = 0
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bb.buffer[i * 8 + j]
    }
    data[i] = b
  }

  // Pad bytes 0xEC, 0x11
  let padIdx = bb.length / 8
  let padByte = 0xec
  while (padIdx < totalDataBytes) {
    data[padIdx++] = padByte
    padByte = padByte === 0xec ? 0x11 : 0xec
  }

  // Block splitting and ECC computation
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = []
  let offset = 0

  for (let i = 0; i < spec.b1; i++) {
    const blockData = data.slice(offset, offset + spec.d1)
    offset += spec.d1
    const ecc = rsComputeEcc(blockData, spec.ecc)
    blocks.push({ data: blockData, ecc })
  }
  for (let i = 0; i < spec.b2; i++) {
    const blockData = data.slice(offset, offset + spec.d2)
    offset += spec.d2
    const ecc = rsComputeEcc(blockData, spec.ecc)
    blocks.push({ data: blockData, ecc })
  }

  // Interleave data codewords
  const result: number[] = []
  const maxDataLen = Math.max(spec.d1, spec.d2)
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < blocks.length; b++) {
      if (i < blocks[b].data.length) {
        result.push(blocks[b].data[i])
      }
    }
  }

  // Interleave ECC codewords
  for (let i = 0; i < spec.ecc; i++) {
    for (let b = 0; b < blocks.length; b++) {
      result.push(blocks[b].ecc[i])
    }
  }

  return new Uint8Array(result)
}

export function createQrMatrix(text: string): boolean[][] {
  const bytes = Buffer.from(text, 'utf8')
  const spec = getBestVersion(bytes.length)
  const codewords = encodeData(text, spec)

  const size = spec.version * 4 + 17
  const matrix: (number | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null))
  const isReserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))

  function setModule(r: number, c: number, v: number, reserved = true): void {
    matrix[r][c] = v
    if (reserved) isReserved[r][c] = true
  }

  function placeFinder(top: number, left: number): void {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = top + r
        const nc = left + c
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
            setModule(nr, nc, isBlack ? 1 : 0)
          } else {
            setModule(nr, nc, 0)
          }
        }
      }
    }
  }

  // Finders
  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) setModule(6, i, i % 2 === 0 ? 1 : 0)
    if (matrix[i][6] === null) setModule(i, 6, i % 2 === 0 ? 1 : 0)
  }

  // Alignment patterns
  const coords = ALIGNMENT_COORDS[spec.version]
  for (let i = 0; i < coords.length; i++) {
    for (let j = 0; j < coords.length; j++) {
      const cr = coords[i]
      const cc = coords[j]
      if (
        (cr === 6 && cc === 6) ||
        (cr === 6 && cc === coords[coords.length - 1]) ||
        (cr === coords[coords.length - 1] && cc === 6)
      ) {
        continue
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1
          setModule(cr + r, cc + c, isBlack ? 1 : 0)
        }
      }
    }
  }

  // Dark module
  setModule(size - 8, 8, 1)

  // Reserve format info slots
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) setModule(8, i, 0)
    if (matrix[i][8] === null) setModule(i, 8, 0)
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) setModule(8, i, 0)
    if (matrix[i][8] === null) setModule(i, 8, 0)
  }

  // Zigzag module placement
  let bitIdx = 0
  const totalBits = codewords.length * 8
  let up = true

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (let rowStep = 0; rowStep < size; rowStep++) {
      const row = up ? (size - 1 - rowStep) : rowStep
      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = col - cOffset
        if (!isReserved[row][c]) {
          let bit = 0
          if (bitIdx < totalBits) {
            const byte = codewords[Math.floor(bitIdx / 8)]
            bit = (byte >>> (7 - (bitIdx % 8))) & 1
            bitIdx++
          }
          matrix[row][c] = bit
        }
      }
    }
    up = !up
  }

  // Standard mask 0: (r + c) % 2 === 0. Format info for Level M + Mask 0 is 0x5412
  const formatInfo = 0x5412

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isReserved[r][c]) {
        if ((r + c) % 2 === 0) {
          matrix[r][c] = (matrix[r][c] as number) ^ 1
        }
      }
    }
  }

  // Format info: 0x5412 (Level M, Mask 0)
  // Vertical
  for (let i = 0; i < 15; i++) {
    const bit = (formatInfo >> i) & 1
    if (i < 6) setModule(i, 8, bit)
    else if (i < 8) setModule(i + 1, 8, bit)
    else setModule(size - 15 + i, 8, bit)
  }
  // Horizontal
  for (let i = 0; i < 15; i++) {
    const bit = (formatInfo >> i) & 1
    if (i < 8) setModule(8, size - i - 1, bit)
    else if (i < 9) setModule(8, 15 - i - 1 + 1, bit)
    else setModule(8, 15 - i - 1, bit)
  }
  // Dark module is always black (1) at (size - 8, 8)
  setModule(size - 8, 8, 1)

  return matrix.map(row => row.map(cell => cell === 1))
}

export function renderQrSvg(text: string, size = 240, margin = 4): string {
  const matrix = createQrMatrix(text)
  const n = matrix.length
  const total = n + margin * 2
  const rects: string[] = []

  // Run-length merge horizontal black pixels into single SVG rects for minimal DOM overhead
  for (let r = 0; r < n; r++) {
    let c = 0
    while (c < n) {
      if (matrix[r][c]) {
        const start = c
        while (c < n && matrix[r][c]) c++
        rects.push(`<rect x="${start + margin}" y="${r + margin}" width="${c - start}" height="1"/>`)
      } else {
        c++
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="${total}" height="${total}" fill="#ffffff"/>
  <g fill="#0b0f19">${rects.join('')}</g>
</svg>`
}

