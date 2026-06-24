// Logout / Clear Session
import { NextRequest, NextResponse } from 'next/server'
import { clearSession, removeBeneficiary, getSession } from '@/lib/session'

// Clear entire session
export async function DELETE() {
  await clearSession()
  return NextResponse.json({ success: true })
}

// Remove a specific beneficiary
export async function POST(request: NextRequest) {
  const { beneficiaryId } = await request.json()
  
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'Missing beneficiary ID' }, { status: 400 })
  }
  
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  await removeBeneficiary(beneficiaryId)
  
  return NextResponse.json({ success: true })
}
