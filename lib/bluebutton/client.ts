// Blue Button 2.0 FHIR API Client
import { BB_URLS } from '@/lib/constants'
import { decrypt } from '@/lib/encryption'
import { getSession, updateBeneficiary } from '@/lib/session'
import type { Beneficiary } from '@/types/session'
import type { FHIRBundle, FHIRResource } from '@/types/fhir'

export class BlueButtonClient {
  private accessToken: string
  private beneficiaryId: string
  
  constructor(accessToken: string, beneficiaryId: string) {
    this.accessToken = accessToken
    this.beneficiaryId = beneficiaryId
  }
  
  // Create client for a beneficiary
  static async forBeneficiary(beneficiaryId: string): Promise<BlueButtonClient | null> {
    const session = await getSession()
    if (!session) return null
    
    const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
    if (!beneficiary) return null
    
    // Check if token needs refresh
    if (beneficiary.tokenExpiry < Date.now() + 60000) {
      const refreshed = await BlueButtonClient.refreshToken(beneficiary)
      if (!refreshed) return null
    }
    
    const accessToken = await decrypt(beneficiary.accessToken)
    return new BlueButtonClient(accessToken, beneficiaryId)
  }
  
  // Refresh token for a beneficiary
  private static async refreshToken(beneficiary: Beneficiary): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId: beneficiary.id }),
      })
      return response.ok
    } catch {
      return false
    }
  }
  
  // Generic FHIR request
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${BB_URLS.fhirBaseUrl}${endpoint}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/fhir+json',
        ...options.headers,
      },
    })
    
    if (!response.ok) {
      throw new Error(`FHIR request failed: ${response.status} ${response.statusText}`)
    }
    
    return response.json()
  }
  
  // Get a single resource by type and ID
  async getResource<T extends FHIRResource>(
    resourceType: string,
    id: string
  ): Promise<T> {
    return this.request<T>(`${resourceType}/${id}`)
  }
  
  // Search for resources with pagination
  async searchResources<T extends FHIRResource>(
    resourceType: string,
    params: Record<string, string> = {}
  ): Promise<T[]> {
    const searchParams = new URLSearchParams(params)
    const bundle = await this.request<FHIRBundle>(
      `${resourceType}?${searchParams.toString()}`
    )
    
    const resources: T[] = []
    
    // Get all entries from first page
    if (bundle.entry) {
      for (const entry of bundle.entry) {
        if (entry.resource) {
          resources.push(entry.resource as T)
        }
      }
    }
    
    // Follow pagination links (limit to 5 pages for performance)
    let nextUrl = bundle.link?.find(l => l.relation === 'next')?.url
    let pageCount = 0
    const maxPages = 5
    
    while (nextUrl && pageCount < maxPages) {
      const nextBundle = await this.request<FHIRBundle>(nextUrl)
      
      if (nextBundle.entry) {
        for (const entry of nextBundle.entry) {
          if (entry.resource) {
            resources.push(entry.resource as T)
          }
        }
      }
      
      nextUrl = nextBundle.link?.find(l => l.relation === 'next')?.url
      pageCount++
    }
    
    return resources
  }
  
  // Update last sync time
  async updateLastSync(): Promise<void> {
    await updateBeneficiary(this.beneficiaryId, {
      lastSync: Date.now(),
    })
  }
}

// Server-side client creation (for API routes)
export async function createServerClient(beneficiaryId: string): Promise<BlueButtonClient | null> {
  const session = await getSession()
  if (!session) return null
  
  const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
  if (!beneficiary) return null
  
  // Check if token needs refresh
  if (beneficiary.tokenExpiry < Date.now() + 60000) {
    // Token expired, need to refresh
    const clientId = process.env.BB_CLIENT_ID
    const clientSecret = process.env.BB_CLIENT_SECRET
    
    if (!clientId || !clientSecret) return null
    
    try {
      const refreshToken = await decrypt(beneficiary.refreshToken)
      
      const tokenResponse = await fetch(BB_URLS.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })
      
      if (!tokenResponse.ok) return null
      
      const tokens = await tokenResponse.json()
      const { encrypt } = await import('@/lib/encryption')
      
      await updateBeneficiary(beneficiaryId, {
        accessToken: await encrypt(tokens.access_token),
        refreshToken: await encrypt(tokens.refresh_token),
        tokenExpiry: Date.now() + tokens.expires_in * 1000,
      })
      
      return new BlueButtonClient(tokens.access_token, beneficiaryId)
    } catch {
      return null
    }
  }
  
  const accessToken = await decrypt(beneficiary.accessToken)
  return new BlueButtonClient(accessToken, beneficiaryId)
}
