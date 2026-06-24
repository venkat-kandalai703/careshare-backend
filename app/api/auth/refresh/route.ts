// Blue Button 2.0 Token Refresh
import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateBeneficiary } from '@/lib/session'
import { encrypt, decrypt } from '@/lib/encryption'
import { BB_URLS } from '@/lib/constants'
import { createBasicAuthHeader, getBlueButtonCredentials } from '@/lib/oauth-credentials'
import type { TokenResponse } from '@/types/session'

export async function POST(request: NextRequest) {
  const { beneficiaryId } = await request.json()
  
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'Missing beneficiary ID' }, { status: 400 })
  }
  
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
  if (!beneficiary) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
  }
  
  const { clientId, clientSecret, hasCredentials } = getBlueButtonCredentials()
  
  if (!hasCredentials) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 500 })
  }
  
  try {
    // Decrypt refresh token
    const refreshToken = await decrypt(beneficiary.refreshToken)
    
    // Request new tokens
    const tokenResponse = await fetch(BB_URLS.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: createBasicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token refresh failed:', errorText)
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 })
    }
    
    const tokens: TokenResponse = await tokenResponse.json()
    
    // Encrypt new tokens
    const encryptedAccessToken = await encrypt(tokens.access_token)
    const encryptedRefreshToken = await encrypt(tokens.refresh_token)
    
    // Update beneficiary with new tokens
    await updateBeneficiary(beneficiaryId, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiry: Date.now() + tokens.expires_in * 1000,
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}
