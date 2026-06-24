// Get current session info (for client-side use)
import { NextRequest, NextResponse } from 'next/server'
import { getSession, setActiveBeneficiary } from '@/lib/session'

// Get session data (without sensitive tokens)
export async function GET() {
  const session = await getSession()
  
  if (!session) {
    return NextResponse.json({ authenticated: false })
  }
  
  // Return session without encrypted tokens
  return NextResponse.json({
    authenticated: true,
    activeBeneficiaryId: session.activeBeneficiaryId,
    beneficiaries: session.beneficiaries.map(b => ({
      id: b.id,
      name: b.name,
      patientFhirId: b.patientFhirId,
      medicareId: b.medicareId,
      lastSync: b.lastSync,
      activeShlId: b.activeShlId,
      tokenExpiry: b.tokenExpiry,
    })),
  })
}

// Switch active beneficiary
export async function POST(request: NextRequest) {
  const { beneficiaryId } = await request.json()
  
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'Missing beneficiary ID' }, { status: 400 })
  }
  
  await setActiveBeneficiary(beneficiaryId)
  
  return NextResponse.json({ success: true })
}
