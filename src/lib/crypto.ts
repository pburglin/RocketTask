const encoder = new TextEncoder()
const decoder = new TextDecoder()

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const SALT_BYTES = 16
const IV_BYTES = 12
const PBKDF2_ITERATIONS = 120_000

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export async function deriveAesKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${password}:${toBase64(salt)}`))
  return toBase64(new Uint8Array(digest))
}

export async function encryptText(plainText: string, key: CryptoKey): Promise<string> {
  const iv = randomBytes(IV_BYTES)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    encoder.encode(plainText),
  )

  const payload = {
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted)),
  }

  return JSON.stringify(payload)
}

export async function decryptText(cipherText: string, key: CryptoKey): Promise<string> {
  const payload = JSON.parse(cipherText) as { iv: string; data: string }
  const iv = fromBase64(payload.iv)
  const data = fromBase64(payload.data)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data),
  )

  return decoder.decode(decrypted)
}

export function encodeSalt(salt: Uint8Array): string {
  return toBase64(salt)
}

export function decodeSalt(value: string): Uint8Array {
  return fromBase64(value)
}

export const cryptoConstants = {
  SALT_BYTES,
}
