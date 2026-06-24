import { cookies } from 'next/headers'
import { decryptJSON } from '@/lib/encryption'

export const CAREGIVER_DEMO_COOKIE_NAME = 'caregiver_demo_session'

export interface CaregiverDemoSession {
  email: string
  caregiverName?: string
  patientName?: string
  patientDateOfBirth?: string
  patientZipCode?: string
  relationship?: string
  consentAt?: string
  loginAt: number
}

export async function getCaregiverDemoSession(): Promise<CaregiverDemoSession | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(CAREGIVER_DEMO_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    return await decryptJSON<CaregiverDemoSession>(sessionCookie.value)
  } catch {
    return null
  }
}
