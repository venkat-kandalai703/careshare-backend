// Blue Button 2.0 OAuth Callback Handler
import { NextRequest, NextResponse } from 'next/server'
import { getOAuthState, clearOAuthState, addBeneficiary } from '@/lib/session'
import { encrypt } from '@/lib/encryption'
import { BB_URLS } from '@/lib/constants'
import { createBasicAuthHeader, getBlueButtonCredentials } from '@/lib/oauth-credentials'
import type { TokenResponse } from '@/types/session'
import type { Patient } from '@/types/fhir'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      `${appUrl}/?error=${encodeURIComponent(errorDescription || error)}`
    )
  }
  
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/?error=missing_parameters`)
  }
  
  // Verify state
  const oauthState = await getOAuthState()
  if (!oauthState || oauthState.state !== state) {
    return NextResponse.redirect(`${appUrl}/?error=invalid_state`)
  }
  
  const { clientId, clientSecret, hasCredentials } = getBlueButtonCredentials()
  const redirectUri = `${appUrl}/api/auth/callback`
  
  if (!hasCredentials) {
    return NextResponse.redirect(`${appUrl}/?error=missing_credentials`)
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(BB_URLS.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: createBasicAuthHeader(clientId, clientSecret),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: oauthState.codeVerifier,
      }),
    })
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Token exchange failed:', errorData)
      return NextResponse.redirect(`${appUrl}/?error=token_exchange_failed&details=${encodeURIComponent(errorData.slice(0, 300))}`)
    }
    
    const tokens: TokenResponse = await tokenResponse.json()

    // DEBUG: token response did not contain the expected fields
    if (!tokens.access_token) {
      const keys = Object.keys(tokens || {}).join(',')
      console.error('Token response missing access_token. keys:', keys, 'patient:', tokens.patient)
      return NextResponse.redirect(`${appUrl}/?error=token_no_access_token&keys=${encodeURIComponent(keys)}&pid=${encodeURIComponent(String(tokens.patient))}`)
    }

    // Resolve the patient. BB's token response may omit the `patient` field, so
    // fall back to a Patient search, which returns the single authorized beneficiary.
    const patientUrl = tokens.patient
      ? `${BB_URLS.fhirBaseUrl}Patient/${tokens.patient}`
      : `${BB_URLS.fhirBaseUrl}Patient`
    const patientResponse = await fetch(patientUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/fhir+json',
      },
    })

    if (!patientResponse.ok) {
      const patientError = await patientResponse.text()
      const tokenKeys = Object.keys(tokens || {}).join(',')
      const atLen = tokens.access_token ? String(tokens.access_token).length : 0
      console.error('Failed to fetch patient data', patientResponse.status, 'url:', patientUrl, 'scope:', tokens.scope, 'tokenKeys:', tokenKeys, patientError)
      return NextResponse.redirect(`${appUrl}/?error=patient_fetch_failed&status=${patientResponse.status}&pid=${encodeURIComponent(String(tokens.patient))}&scope=${encodeURIComponent(String(tokens.scope))}&keys=${encodeURIComponent(tokenKeys)}&atlen=${atLen}&details=${encodeURIComponent(patientError.slice(0, 200))}`)
    }

    // A search returns a Bundle; a direct read returns the Patient resource.
    const patientPayload = await patientResponse.json()
    const patient: Patient = patientPayload.resourceType === 'Bundle'
      ? patientPayload.entry?.[0]?.resource
      : patientPayload

    if (!patient || patient.resourceType !== 'Patient') {
      console.error('No Patient resource resolved from', patientUrl)
      return NextResponse.redirect(`${appUrl}/?error=no_patient_resolved&scope=${encodeURIComponent(String(tokens.scope))}`)
    }

    const patientFhirId = patient.id || tokens.patient

    // Extract patient name
    const name = patient.name?.[0]
    const displayName = name
      ? `${name.given?.join(' ') || ''} ${name.family || ''}`.trim()
      : `Beneficiary ${patientFhirId}`
    
    // Extract Medicare Beneficiary Identifier (MBI)
    const mbiIdentifier = patient.identifier?.find(
      id => id.system === 'http://hl7.org/fhir/sid/us-mbi'
    )
    
    // Encrypt tokens
    const encryptedAccessToken = await encrypt(tokens.access_token)
    const encryptedRefreshToken = await encrypt(tokens.refresh_token)
    
    // Create beneficiary record
    await addBeneficiary({
      id: crypto.randomUUID(),
      patientFhirId,
      name: displayName,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiry: Date.now() + tokens.expires_in * 1000,
      lastSync: Date.now(),
      medicareId: mbiIdentifier?.value,
    })
    
    // Clear OAuth state
    await clearOAuthState()
    
    // Redirect to dashboard
    return NextResponse.redirect(`${appUrl}${oauthState.returnUrl}`)
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(`${appUrl}/?error=callback_failed`)
  }
}
