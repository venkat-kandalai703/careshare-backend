// SMART Health Link Manifest Endpoint
// This is the endpoint that SHL consumers (providers) call to fetch the manifest
import { NextRequest, NextResponse } from 'next/server'
import { getSHLMetadata } from '@/lib/shl/generator'
import { verifyPasscode, generateRandomString } from '@/lib/encryption'
import { issueToken } from '@/lib/shl/bundle-tokens'

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes
const attemptTracker = new Map<string, { count: number; resetAt: number }>()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  // Get SHL metadata
  const metadata = await getSHLMetadata(id)
  
  if (!metadata) {
    return NextResponse.json(
      { error: 'SHL not found or expired' },
      { status: 404 }
    )
  }
  
  if (!metadata.isActive) {
    return NextResponse.json(
      { error: 'SHL has been revoked' },
      { status: 410 }
    )
  }
  
  // Check passcode if required
  if (metadata.passcodeHash) {
    // Rate limit check
    const now = Date.now()
    const attempts = attemptTracker.get(id)

    if (attempts) {
      if (now < attempts.resetAt && attempts.count >= MAX_ATTEMPTS) {
        return NextResponse.json(
          { error: 'Too many attempts. Try again later.' },
          { status: 429 }
        )
      }
      if (now >= attempts.resetAt) {
        attemptTracker.delete(id)
      }
    }

    try {
      const body = await request.json()
      const { passcode } = body

      if (!passcode) {
        return NextResponse.json(
          { error: 'Passcode required' },
          { status: 401 }
        )
      }

      const valid = await verifyPasscode(passcode, metadata.passcodeHash)
      if (!valid) {
        const current = attemptTracker.get(id) ?? { count: 0, resetAt: now + LOCKOUT_MS }
        attemptTracker.set(id, { count: current.count + 1, resetAt: current.resetAt })
        return NextResponse.json(
          { error: 'Invalid passcode' },
          { status: 401 }
        )
      }

      // Successful attempt — clear the tracker for this SHL
      attemptTracker.delete(id)
    } catch {
      return NextResponse.json(
        { error: 'Passcode required' },
        { status: 401 }
      )
    }
  }
  
  // Return manifest according to SHL spec
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const token = generateRandomString(32)
  issueToken(id, token)

  const manifest = {
    files: [
      {
        contentType: 'application/fhir+json',
        location: `${appUrl}/api/shl/bundle/${id}?token=${token}`,
      },
    ],
  }
  
  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
