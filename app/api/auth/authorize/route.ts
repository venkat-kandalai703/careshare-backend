// Blue Button 2.0 OAuth Authorization Initiation
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createOAuthState, generateCodeChallenge } from '@/lib/session'
import { BB_URLS, BB_SCOPES } from '@/lib/constants'
import { getBlueButtonCredentials } from '@/lib/oauth-credentials'

export async function GET(request: NextRequest) {
  const { clientId } = getBlueButtonCredentials()
  
  if (!clientId) {
    return NextResponse.json(
      { error: 'Blue Button client ID not configured' },
      { status: 500 }
    )
  }
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/auth/callback`
  const returnUrl = request.nextUrl.searchParams.get('returnUrl') || '/dashboard'
  const relationship = request.nextUrl.searchParams.get('relationship') || undefined
  const consentedAt = request.nextUrl.searchParams.get('consentedAt') || undefined
  
  try {
    // Create OAuth state with PKCE
    const oauthState = await createOAuthState(returnUrl, { relationship, consentedAt })
    const codeChallenge = await generateCodeChallenge(oauthState.codeVerifier)
    
    // Build authorization URL
    const authUrl = new URL(BB_URLS.authUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', BB_SCOPES)
    authUrl.searchParams.set('state', oauthState.state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    
    // Redirect to Blue Button authorization
    return NextResponse.redirect(authUrl.toString())
  } catch (error) {
    console.error('OAuth initiation error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate OAuth flow' },
      { status: 500 }
    )
  }
}
