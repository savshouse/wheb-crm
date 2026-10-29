import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const VERSION_PREFIX = 'v1:'

function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) return null
  const buf = Buffer.from(raw, 'base64url')
  if (buf.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64url)')
  return buf
}

export function encryptToken(plaintext: string): string {
  const key = getKey()
  if (!key) return plaintext // dev fallback: no-op

  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${VERSION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith(VERSION_PREFIX)) return stored // plaintext legacy token

  const key = getKey()
  if (!key) return stored // env var removed — can't decrypt; caller will get a bad token and re-auth

  const rest = stored.slice(VERSION_PREFIX.length)
  const parts = rest.split(':')
  if (parts.length !== 3) throw new Error('Malformed encrypted token')
  const [ivHex, authTagHex, ciphertextHex] = parts

  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(ciphertextHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
