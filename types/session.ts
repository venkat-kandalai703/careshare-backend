// Session and Authentication Types

export interface Beneficiary {
  // Unique identifier (UUID)
  id: string
  // Blue Button patient FHIR ID
  patientFhirId: string
  // Display name (from Patient resource)
  name: string
  // Blue Button access token (encrypted)
  accessToken: string
  // Blue Button refresh token (encrypted)
  refreshToken: string
  // Token expiration timestamp
  tokenExpiry: number
  // Last time data was synced
  lastSync: number
  // Active SHL ID if one exists
  activeShlId?: string
  // Medicare Beneficiary Identifier (MBI)
  medicareId?: string
}

export interface Session {
  // List of connected beneficiaries (max ~4 for cookie storage)
  beneficiaries: Beneficiary[]
  // Currently active beneficiary ID
  activeBeneficiaryId?: string
  // Session creation time
  createdAt: number
}

export interface OAuthState {
  // PKCE code verifier
  codeVerifier: string
  // Random state for CSRF protection
  state: string
  // Redirect URL after OAuth completes
  returnUrl: string
  // Timestamp for expiration
  createdAt: number
  pendingBeneficiary?: {
    relationship?: string
    consentedAt?: string
  }
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  scope: string
  patient: string // FHIR patient ID
}

export interface AuthError {
  error: string
  error_description?: string
}
