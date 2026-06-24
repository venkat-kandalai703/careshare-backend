// SMART Health Link Cryptography
// Implements SHL Protocol: https://docs.smarthealthit.org/smart-health-links/spec
import * as pako from 'pako'
import { base64url } from 'jose'
import { generateRandomKey, keyToBase64url } from '@/lib/encryption'

const AES_ALGORITHM = 'AES-GCM'
const AES_KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM

// Compress data using DEFLATE (raw, no headers)
export function compress(data: string): Uint8Array {
  const encoder = new TextEncoder()
  const input = encoder.encode(data)
  // Use raw deflate (no zlib headers)
  return pako.deflateRaw(input)
}

// Decompress DEFLATE data
export function decompress(data: Uint8Array): string {
  const output = pako.inflateRaw(data)
  const decoder = new TextDecoder()
  return decoder.decode(output)
}

// Encrypt data with AES-256-GCM
export async function encryptSHL(
  data: Uint8Array,
  key?: Uint8Array
): Promise<{ encrypted: Uint8Array; key: Uint8Array }> {
  const encryptionKey = key || generateRandomKey()
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encryptionKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['encrypt']
  )
  
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv },
    cryptoKey,
    data
  )
  
  // Combine IV + ciphertext
  const encrypted = new Uint8Array(iv.length + ciphertext.byteLength)
  encrypted.set(iv)
  encrypted.set(new Uint8Array(ciphertext), iv.length)
  
  return { encrypted, key: encryptionKey }
}

// Decrypt AES-256-GCM encrypted data
export async function decryptSHL(
  encrypted: Uint8Array,
  key: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
    false,
    ['decrypt']
  )
  
  const iv = encrypted.slice(0, IV_LENGTH)
  const ciphertext = encrypted.slice(IV_LENGTH)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv },
    cryptoKey,
    ciphertext
  )
  
  return new Uint8Array(decrypted)
}

// Create SHL payload object
export interface SHLPayloadData {
  manifestUrl: string
  key: Uint8Array
  label?: string
  expiresAt?: Date
  passcodeProtected?: boolean
}

export function createSHLPayload(data: SHLPayloadData): string {
  const payload: Record<string, unknown> = {
    url: data.manifestUrl,
    key: keyToBase64url(data.key),
    flag: (data.passcodeProtected ? 'LP' : 'L'), // L=long-term, P=passcode
  }
  
  if (data.label) {
    payload.label = data.label
  }
  
  if (data.expiresAt) {
    payload.exp = Math.floor(data.expiresAt.getTime() / 1000)
  }
  
  return JSON.stringify(payload)
}

// Create SHL URI from payload
export function createSHLUri(payload: string): string {
  const encoded = base64url.encode(new TextEncoder().encode(payload))
  return `shlink:/${encoded}`
}

// Parse SHL URI
export function parseSHLUri(uri: string): Record<string, unknown> | null {
  if (!uri.startsWith('shlink:/')) {
    return null
  }
  
  try {
    const encoded = uri.slice('shlink:/'.length)
    const decoded = new TextDecoder().decode(base64url.decode(encoded))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

// Full SHL creation pipeline
export async function createSHLBundle(
  fhirBundle: object,
  options: {
    manifestUrl: string
    label?: string
    expiresAt?: Date
    passcodeProtected?: boolean
  }
): Promise<{
  encryptedBundle: Uint8Array
  shlUri: string
  key: Uint8Array
}> {
  // 1. Serialize to JSON
  const json = JSON.stringify(fhirBundle)
  
  // 2. Compress with DEFLATE
  const compressed = compress(json)
  
  // 3. Encrypt with AES-256-GCM
  const { encrypted, key } = await encryptSHL(compressed)
  
  // 4. Create SHL payload
  const payload = createSHLPayload({
    manifestUrl: options.manifestUrl,
    key,
    label: options.label,
    expiresAt: options.expiresAt,
    passcodeProtected: options.passcodeProtected,
  })
  
  // 5. Create SHL URI
  const shlUri = createSHLUri(payload)
  
  return {
    encryptedBundle: encrypted,
    shlUri,
    key,
  }
}

// Decrypt and decompress SHL bundle
export async function decodeSHLBundle(
  encrypted: Uint8Array,
  key: Uint8Array
): Promise<object> {
  // 1. Decrypt
  const compressed = await decryptSHL(encrypted, key)
  
  // 2. Decompress
  const json = decompress(compressed)
  
  // 3. Parse JSON
  return JSON.parse(json)
}
