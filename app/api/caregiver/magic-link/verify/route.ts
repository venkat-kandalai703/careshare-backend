import { NextRequest, NextResponse } from 'next/server'
import { encryptJSON } from '@/lib/encryption'
import { CAREGIVER_DEMO_COOKIE_NAME } from '@/lib/caregiver-demo-session'
import {
  consumeCaregiverMagicLink,
  createCaregiverSession,
  getCaregiverProfile,
} from '@/lib/caregiver-profiles'
import { createToken, hashToken } from '@/lib/rds'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin

  if (!token) {
    return NextResponse.redirect(`${appUrl}/caregiver/login?error=missing_magic_link`)
  }

  try {
    const email = await consumeCaregiverMagicLink(hashToken(token))

    if (!email) {
      return NextResponse.redirect(`${appUrl}/caregiver/login?error=expired_magic_link`)
    }

    const sessionToken = createToken()
    await createCaregiverSession(
      email,
      hashToken(sessionToken),
      new Date(Date.now() + 60 * 60 * 8 * 1000),
    )

    const profile = await getCaregiverProfile(email)
    const response = NextResponse.redirect(`${appUrl}/caregiver/portal`)
    const encryptedSession = await encryptJSON({
      email,
      caregiverName: [profile?.first_name, profile?.last_name]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ') || undefined,
      loginAt: Date.now(),
    })

    response.cookies.set(CAREGIVER_DEMO_COOKIE_NAME, encryptedSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 8,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.redirect(`${appUrl}/caregiver/login?error=invalid_magic_link`)
  }
}
