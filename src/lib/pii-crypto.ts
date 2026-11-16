import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

function getKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY
  if (!hex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PII_ENCRYPTION_KEY env var is required in production')
    }
    // Dev-only fallback — not secure, never use in production
    return Buffer.alloc(32, 0x42)
  }
  if (hex.length !== 64) throw new Error('PII_ENCRYPTION_KEY must be exactly 64 hex characters')
  return Buffer.from(hex, 'hex')
}

export function encryptPii(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptPii(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null || ciphertext === '') return null
  try {
    const key = getKey()
    const buf = Buffer.from(ciphertext, 'base64')
    if (buf.length < 29) return ciphertext // too short to be valid — return as-is during migration
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return ciphertext // decryption failed — return raw (handles pre-migration plaintext gracefully)
  }
}

// Keyed HMAC for blind-index exact lookups (email search without storing plaintext)
export function hashPii(value: string | null | undefined): string | null {
  if (value == null || value === '') return null
  const key = getKey()
  return createHmac('sha256', key).update(value.toLowerCase().trim()).digest('hex')
}

// Decrypt a client row in-place (handles both encrypted + legacy plaintext rows)
export function decryptClient<T extends Record<string, any>>(row: T): T {
  return {
    ...row,
    email:     row.email_enc     ? decryptPii(row.email_enc)     : (row.email     ?? null),
    phone:     row.phone_enc     ? decryptPii(row.phone_enc)     : (row.phone     ?? null),
    ni_number: row.ni_number_enc ? decryptPii(row.ni_number_enc) : (row.ni_number ?? null),
  }
}

// Decrypt a booking row
export function decryptBooking<T extends Record<string, any>>(row: T): T {
  return {
    ...row,
    client_email: row.client_email_enc ? decryptPii(row.client_email_enc) : (row.client_email ?? null),
    client_phone: row.client_phone_enc ? decryptPii(row.client_phone_enc) : (row.client_phone ?? null),
  }
}

// Decrypt an onsite_booking row
export function decryptOnsiteBooking<T extends Record<string, any>>(row: T): T {
  return {
    ...row,
    attendee_email: row.attendee_email_enc ? decryptPii(row.attendee_email_enc) : (row.attendee_email ?? null),
    attendee_phone: row.attendee_phone_enc ? decryptPii(row.attendee_phone_enc) : (row.attendee_phone ?? null),
  }
}
