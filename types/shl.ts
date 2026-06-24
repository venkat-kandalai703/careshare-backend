// SMART Health Link Types

export interface SHLPayload {
  // URL to the manifest endpoint
  url: string
  // Base64url-encoded decryption key
  key: string
  // Flags: L=long-term, P=passcode-protected, U=single-use
  flag?: string
  // Human-readable label
  label?: string
  // Expiration timestamp (Unix seconds)
  exp?: number
  // Version (currently 1)
  v?: number
}

export interface SHLManifest {
  files: Array<{
    contentType: string
    location: string
    // Optional: embedded content for small payloads
    embedded?: string
  }>
}

export interface SHLFile {
  // Unique identifier for this SHL
  id: string
  // Beneficiary this SHL belongs to
  beneficiaryId: string
  // The full SHL URI (shlink:/...)
  shlUri: string
  // QR code data URL (base64 PNG)
  qrCodeDataUrl: string

  // Vercel Blob URL for encrypted bundle
  blobUrl: string
  // Vercel Blob pathname for manifest
  manifestPathname: string
  // Optional passcode hash (PBKDF2)
  passcodeHash?: string
  // Expiration date
  expiresAt?: Date
  // Creation date
  createdAt: Date
  // Human-readable label
  label: string
  // Whether this SHL is still active
  isActive: boolean
}

export interface CreateSHLRequest {
  beneficiaryId: string
  label?: string
  passcode?: string
  expiresInDays?: number
}

export interface CreateSHLResponse {
  shl: SHLFile
  qrCodeDataUrl: string
}

// IPS (International Patient Summary) Bundle structure
export interface IPSBundle {
  resourceType: 'Bundle'
  id: string
  type: 'document'
  timestamp: string
  entry: Array<{
    fullUrl: string
    resource: IPSComposition | IPSResource
  }>
}

export interface IPSComposition {
  resourceType: 'Composition'
  id: string
  status: 'final'
  type: {
    coding: Array<{
      system: 'http://loinc.org'
      code: '60591-5'
      display: 'Patient summary Document'
    }>
  }
  subject: { reference: string }
  date: string
  title: string
  section: Array<{
    title: string
    code: {
      coding: Array<{
        system: string
        code: string
        display: string
      }>
    }
    entry?: Array<{ reference: string }>
    text?: {
      status: 'generated'
      div: string
    }
    emptyReason?: {
      coding: Array<{
        system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason'
        code: 'unavailable'
        display: string
      }>
    }
  }>
}

export type IPSResource = Record<string, unknown>
