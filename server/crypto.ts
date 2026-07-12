import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getConfig } from './config.js'

function key() {
  return Buffer.from(getConfig().DATA_ENCRYPTION_KEY, 'hex')
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

export function decryptSecret(value: string) {
  const [version, iv, tag, ciphertext, ...rest] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !ciphertext || rest.length) throw new Error('Encrypted secret format is invalid')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}
