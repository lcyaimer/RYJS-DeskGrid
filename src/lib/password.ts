const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const HASH_BITS = 256
const ALGORITHM = 'pbkdf2-sha256'

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前环境不支持安全密码存储')
  }
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    HASH_BITS,
  )
  return new Uint8Array(bits)
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) {
    difference |= a[i] ^ b[i]
  }
  return difference === 0
}

export function passwordMeetsMinimum(password: string): boolean {
  return password.trim().length >= 4
}

export async function createPasswordHash(password: string): Promise<string> {
  if (!passwordMeetsMinimum(password)) {
    throw new Error('密码至少需要 4 个字符')
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, PBKDF2_ITERATIONS)
  return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 10_000) return false
  try {
    const salt = fromBase64(parts[2])
    const expected = fromBase64(parts[3])
    const actual = await derive(password, salt, iterations)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}
