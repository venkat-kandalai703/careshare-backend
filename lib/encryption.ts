// AES-256-GCM Encryption Utilities
import { base64url } from 'jose'

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM
const TAG_LENGTH = 128 // bits

// Get the encryption key from environment
function getEncryptionKey(): Uint8Array {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY environment variable is not set')
  }
  
  // Convert hex string to Uint8Array
  const key = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    key[i] = parseInt(keyHex.slice(i * 2, i * 2 + 2), 16)
  }
  return key
}

// Generate a random encryption key (for SHL bundles)
export function generateRandomKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

// Generate a random IV
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH))
}

// Import a raw key for Web Crypto API
async function importKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

// Encrypt data with AES-256-GCM
export async function encrypt(data: string, customKey?: Uint8Array): Promise<string> {
  const key = customKey || getEncryptionKey()
  const cryptoKey = await importKey(key)
  const iv = generateIV()
  const encoder = new TextEncoder()
  const encodedData = encoder.encode(data)
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    encodedData
  )
  
  // Combine IV + ciphertext and encode as base64url
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  
  return base64url.encode(combined)
}

// Decrypt data with AES-256-GCM
export async function decrypt(encryptedData: string, customKey?: Uint8Array): Promise<string> {
  const key = customKey || getEncryptionKey()
  const cryptoKey = await importKey(key)
  
  // Decode and split IV + ciphertext
  const combined = base64url.decode(encryptedData)
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: TAG_LENGTH },
    cryptoKey,
    ciphertext
  )
  
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

// Encrypt JSON object
export async function encryptJSON<T>(data: T, customKey?: Uint8Array): Promise<string> {
  return encrypt(JSON.stringify(data), customKey)
}

// Decrypt to JSON object
export async function decryptJSON<T>(encryptedData: string, customKey?: Uint8Array): Promise<T> {
  const json = await decrypt(encryptedData, customKey)
  return JSON.parse(json) as T
}

// Key to base64url string (for SHL payloads)
export function keyToBase64url(key: Uint8Array): string {
  return base64url.encode(key)
}

// Base64url string to key
export function base64urlToKey(encoded: string): Uint8Array {
  return base64url.decode(encoded)
}

// Generate a cryptographically secure random string
export function generateRandomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return base64url.encode(bytes).slice(0, length)
}

// Hash a passcode for storage (using PBKDF2-SHA-256 with random salt)
export async function hashPasscode(passcode: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
      keyMaterial,
      256
    )
    const combined = new Uint8Array(salt.length + derived.byteLength)
    combined.set(salt)
    combined.set(new Uint8Array(derived), salt.length)
    return base64url.encode(combined)
}


// Verify a passcode against its hash
export async function verifyPasscode(passcode: string, storedHash: string): Promise<boolean> {
    const combined = base64url.decode(storedHash)
    const salt = combined.slice(0, 16)
    const storedDerived = combined.slice(16)
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passcode),
      'PBKDF2',
      false,
      ['deriveBits']
    )
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200_000 },
      keyMaterial,
      256
    )
    const a = new Uint8Array(derived)
    const b = new Uint8Array(storedDerived)
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}