// SMART Health Link Generator
import { Buffer } from 'node:buffer'
import { put, del } from '@vercel/blob'
import QRCode from 'qrcode'
import { createSHLBundle } from './crypto'
import { createIPSBundle } from './ips-transform'
import { hashPasscode, keyToBase64url } from '@/lib/encryption'
import { updateBeneficiary } from '@/lib/session'
import { SHL_CONFIG } from '@/lib/constants'
import type { HealthSummary } from '@/types/fhir'
import type { SHLFile, CreateSHLRequest } from '@/types/shl'

// Store SHL metadata (in production, use a database)
// For MVP, we store minimal info in session and full data in Blob
const shlMetadataPrefix = 'shl-meta/'
const shlBundlePrefix = 'shl-bundle/'

export async function generateSHL(
  summary: HealthSummary,
  request: CreateSHLRequest
): Promise<SHLFile> {
  const shlId = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Calculate expiration
  const expiresInDays = request.expiresInDays || SHL_CONFIG.defaultExpirationDays
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  
  // Hash passcode if provided
  const passcodeHash = request.passcode
    ? await hashPasscode(request.passcode)
    : undefined
  
  // Create IPS FHIR Bundle
  const ipsBundle = createIPSBundle(summary)
  
  // Manifest URL (where the SHL protocol will fetch manifest)
  const manifestUrl = `${appUrl}/api/shl/manifest/${shlId}`
  
  // Create encrypted SHL bundle
  const { encryptedBundle, shlUri, key } = await createSHLBundle(ipsBundle, {
    manifestUrl,
    label: request.label || SHL_CONFIG.defaultLabel,
    expiresAt,
    passcodeProtected: !!passcodeHash,
  })
  
  // Upload encrypted bundle to Vercel Blob
  const bundleBlob = await put(
    `${shlBundlePrefix}${shlId}.bin`,
    Buffer.from(encryptedBundle),
    {
      access: 'private',
      contentType: 'application/octet-stream',
    }
  )
  
  // Store SHL metadata
  const metadata: SHLFile = {
    id: shlId,
    beneficiaryId: request.beneficiaryId,
    shlUri,
    qrCodeDataUrl: '', // Will be generated next

    blobUrl: bundleBlob.url,
    manifestPathname: bundleBlob.pathname,
    passcodeHash,
    expiresAt,
    createdAt: new Date(),
    label: request.label || SHL_CONFIG.defaultLabel,
    isActive: true,
  }
  
  // Generate QR code
  const qrCodeDataUrl = await QRCode.toDataURL(shlUri, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
  metadata.qrCodeDataUrl = qrCodeDataUrl
  
  // Store metadata in Blob (for retrieval)
  await put(
    `${shlMetadataPrefix}${shlId}.json`,
    JSON.stringify(metadata),
    {
      access: 'private',
      contentType: 'application/json',
    }
  )
  
  // Update beneficiary with active SHL ID
  await updateBeneficiary(request.beneficiaryId, {
    activeShlId: shlId,
  })
  
  return metadata
}

// Get SHL metadata by ID
export async function getSHLMetadata(shlId: string): Promise<SHLFile | null> {
  try {
    const { get } = await import('@vercel/blob')
    const result = await get(`${shlMetadataPrefix}${shlId}.json`, {
      access: 'private',
    })
    
    if (!result) return null
    
    const text = await new Response(result.stream).text()
    const metadata = JSON.parse(text) as SHLFile
    
    // Check if expired
    if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
      return null
    }
    
    return metadata
  } catch {
    return null
  }
}

// Get encrypted bundle
export async function getSHLBundle(shlId: string): Promise<Uint8Array | null> {
  try {
    const { get } = await import('@vercel/blob')
    const result = await get(`${shlBundlePrefix}${shlId}.bin`, {
      access: 'private',
    })
    
    if (!result) return null
    
    const arrayBuffer = await new Response(result.stream).arrayBuffer()
    return new Uint8Array(arrayBuffer)
  } catch {
    return null
  }
}

// Revoke/delete an SHL
export async function revokeSHL(shlId: string, beneficiaryId: string): Promise<boolean> {
  try {
    const metadata = await getSHLMetadata(shlId)
    
    if (!metadata || metadata.beneficiaryId !== beneficiaryId) {
      return false
    }
    
    // Delete bundle and metadata from Blob
    await del([
      `${shlBundlePrefix}${shlId}.bin`,
      `${shlMetadataPrefix}${shlId}.json`,
    ])
    
    // Clear active SHL from beneficiary
    await updateBeneficiary(beneficiaryId, {
      activeShlId: undefined,
    })
    
    return true
  } catch {
    return false
  }
}

// List all SHLs for a beneficiary
export async function listSHLsForBeneficiary(beneficiaryId: string): Promise<SHLFile[]> {
  try {
    const { list } = await import('@vercel/blob')
    const { blobs } = await list({
      prefix: shlMetadataPrefix,
    })
    
    const shls: SHLFile[] = []
    
    for (const blob of blobs) {
      try {
        const { get } = await import('@vercel/blob')
        const result = await get(blob.pathname, { access: 'private' })
        if (!result) continue
        
        const text = await new Response(result.stream).text()
        const metadata = JSON.parse(text) as SHLFile
        
        if (metadata.beneficiaryId === beneficiaryId && metadata.isActive) {
          // Check expiration
          if (!metadata.expiresAt || new Date(metadata.expiresAt) > new Date()) {
            shls.push(metadata)
          }
        }
      } catch {
        continue
      }
    }
    
    return shls
  } catch {
    return []
  }
}
