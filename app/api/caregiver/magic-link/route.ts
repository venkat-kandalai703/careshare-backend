import { NextRequest, NextResponse } from 'next/server'
import {
  caregiverExists,
  createCaregiverMagicLink,
  upsertCaregiverProfile,
} from '@/lib/caregiver-profiles'
import { createToken, ensureCaregiverAuthTables, hashToken } from '@/lib/rds'
import { sendMagicLinkEmail } from '@/lib/smtp'

const TOKEN_TTL_MS = 15 * 60 * 1000

function getAppUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const email = String(body.email || '').trim().toLowerCase()
  const firstName = String(body.firstName || '').trim()
  const lastName = String(body.lastName || '').trim()
  const phone = String(body.phone || '').trim()
  const isRegistration = body.intent === 'register'
  const consentAccepted = body.consentAccepted === true

  if (!email) {
    return NextResponse.json({ error: 'Caregiver email is required' }, { status: 400 })
  }

  if (isRegistration) {
    if (!firstName || !lastName || !phone) {
      return NextResponse.json({ error: 'First name, last name, and phone are required' }, { status: 400 })
    }

    if (!consentAccepted) {
      return NextResponse.json({ error: 'Caregiver consent is required before registration' }, { status: 400 })
    }
  }

  try {
    await ensureCaregiverAuthTables()
    const consentedAt = isRegistration ? new Date().toISOString() : undefined

    if (isRegistration) {
      await upsertCaregiverProfile({ email, firstName, lastName, phone, consentedAt })
    } else {
      const exists = await caregiverExists(email)
      if (!exists) {
        return NextResponse.json(
          { error: 'No caregiver account was found for this email. Please sign up first.' },
          { status: 404 },
        )
      }
    }

    const token = createToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
    await createCaregiverMagicLink(email, hashToken(token), expiresAt)
    const magicLink = `${getAppUrl(request)}/api/caregiver/magic-link/verify?token=${encodeURIComponent(token)}`
    await sendMagicLinkEmail(email, magicLink)

    return NextResponse.json({
      success: true,
      emailSent: true,
      authProvider: 'aws-rds-smtp',
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Could not send caregiver magic link:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not send magic link' },
      { status: 500 },
    )
  }
}

