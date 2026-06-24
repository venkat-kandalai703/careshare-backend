import { NextRequest, NextResponse } from 'next/server'
import { encryptJSON } from '@/lib/encryption'

const COOKIE_NAME = 'caregiver_demo_session'

export async function POST(request: NextRequest) {
  const {
    authMode,
    email,
    password,
    caregiverName,
    patientName,
    patientDateOfBirth,
    patientZipCode,
    relationship,
    consentAt,
  } = await request.json()
  const demoEmail = process.env.CAREGIVER_DEMO_EMAIL || 'linda@carethread.test'
  const demoPassword = process.env.CAREGIVER_DEMO_PASSWORD || 'demo-caregiver'
  const demoPatientName = process.env.CAREGIVER_DEMO_PATIENT_NAME || patientName

  if (!email) {
    return NextResponse.json(
      { error: 'Caregiver email is required' },
      { status: 400 },
    )
  }

  if (authMode !== 'magic-link' && (email !== demoEmail || password !== demoPassword)) {
    return NextResponse.json(
      { error: 'Invalid caregiver email or password' },
      { status: 401 },
    )
  }

  const response = NextResponse.json({ success: true })
  const encryptedSession = await encryptJSON({
    email,
    caregiverName: caregiverName || 'Linda',
    patientName: demoPatientName || undefined,
    patientDateOfBirth,
    patientZipCode,
    relationship: relationship || 'daughter',
    consentAt,
    loginAt: Date.now(),
  })

  response.cookies.set(COOKIE_NAME, encryptedSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 2,
    path: '/',
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete(COOKIE_NAME)
  return response
}
