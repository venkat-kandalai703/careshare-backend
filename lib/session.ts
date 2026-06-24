// Session Management for Beneficiary Accounts
import { cookies } from 'next/headers'
import { encryptJSON, decryptJSON, generateRandomString } from './encryption'
import { SESSION_CONFIG } from './constants'
import type { Session, Beneficiary, OAuthState } from '@/types/session'

// Get the current session from cookies
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(SESSION_CONFIG.cookieName)
  
  if (!sessionCookie?.value) {
    return null
  }
  
  try {
    return await decryptJSON<Session>(sessionCookie.value)
  } catch {
    // Invalid or corrupted session
    return null
  }
}

// Create or update session
export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies()
  const encrypted = await encryptJSON(session)
  
  cookieStore.set(SESSION_CONFIG.cookieName, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_CONFIG.maxAge,
    path: '/',
  })
}

// Clear session
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_CONFIG.cookieName)
}

// Get the active beneficiary
export async function getActiveBeneficiary(): Promise<Beneficiary | null> {
  const session = await getSession()
  if (!session || !session.activeBeneficiaryId) {
    return null
  }
  
  return session.beneficiaries.find(b => b.id === session.activeBeneficiaryId) || null
}

// Add a beneficiary to the session
export async function addBeneficiary(beneficiary: Beneficiary): Promise<void> {
  let session = await getSession()
  
  if (!session) {
    session = {
      beneficiaries: [],
      createdAt: Date.now(),
    }
  }
  
  // Check if this beneficiary already exists (by patientFhirId)
  const existingIndex = session.beneficiaries.findIndex(
    b => b.patientFhirId === beneficiary.patientFhirId
  )
  
  if (existingIndex >= 0) {
    // Update existing beneficiary
    session.beneficiaries[existingIndex] = beneficiary
  } else {
    // Add new beneficiary
    session.beneficiaries.push(beneficiary)
  }
  
  // Set as active
  session.activeBeneficiaryId = beneficiary.id
  
  await setSession(session)
}

// Remove a beneficiary from the session
export async function removeBeneficiary(beneficiaryId: string): Promise<void> {
  const session = await getSession()
  if (!session) return
  
  session.beneficiaries = session.beneficiaries.filter(b => b.id !== beneficiaryId)
  
  // If we removed the active beneficiary, select the first one
  if (session.activeBeneficiaryId === beneficiaryId) {
    session.activeBeneficiaryId = session.beneficiaries[0]?.id
  }
  
  if (session.beneficiaries.length === 0) {
    await clearSession()
  } else {
    await setSession(session)
  }
}

// Update a beneficiary
export async function updateBeneficiary(
  beneficiaryId: string,
  updates: Partial<Beneficiary>
): Promise<void> {
  const session = await getSession()
  if (!session) return
  
  const index = session.beneficiaries.findIndex(b => b.id === beneficiaryId)
  if (index >= 0) {
    session.beneficiaries[index] = { ...session.beneficiaries[index], ...updates }
    await setSession(session)
  }
}

// Switch active beneficiary
export async function setActiveBeneficiary(beneficiaryId: string): Promise<void> {
  const session = await getSession()
  if (!session) return
  
  const exists = session.beneficiaries.some(b => b.id === beneficiaryId)
  if (exists) {
    session.activeBeneficiaryId = beneficiaryId
    await setSession(session)
  }
}

// OAuth State Management

export async function createOAuthState(
  returnUrl: string = '/dashboard',
  pendingBeneficiary?: OAuthState['pendingBeneficiary'],
): Promise<OAuthState> {
  const state: OAuthState = {
    codeVerifier: generateRandomString(64),
    state: generateRandomString(32),
    returnUrl,
    createdAt: Date.now(),
    pendingBeneficiary,
  }
  
  const cookieStore = await cookies()
  const encrypted = await encryptJSON(state)
  
  cookieStore.set(SESSION_CONFIG.stateCookieName, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_CONFIG.stateMaxAge,
    path: '/',
  })
  
  return state
}

export async function getOAuthState(): Promise<OAuthState | null> {
  const cookieStore = await cookies()
  const stateCookie = cookieStore.get(SESSION_CONFIG.stateCookieName)
  
  if (!stateCookie?.value) {
    return null
  }
  
  try {
    const state = await decryptJSON<OAuthState>(stateCookie.value)
    
    // Check if state is expired (10 minutes)
    if (Date.now() - state.createdAt > SESSION_CONFIG.stateMaxAge * 1000) {
      return null
    }
    
    return state
  } catch {
    return null
  }
}

export async function clearOAuthState(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_CONFIG.stateCookieName)
}

// Generate PKCE code challenge from verifier
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  
  // Convert to base64url
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
