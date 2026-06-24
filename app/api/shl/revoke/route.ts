// Revoke/delete a SMART Health Link
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { revokeSHL } from '@/lib/shl/generator'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  const { shlId, beneficiaryId } = await request.json()
  
  if (!shlId || !beneficiaryId) {
    return NextResponse.json(
      { error: 'Missing shlId or beneficiaryId' },
      { status: 400 }
    )
  }
  
  // Verify beneficiary belongs to this session
  const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
  if (!beneficiary) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
  }
  
  try {
    const success = await revokeSHL(shlId, beneficiaryId)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to revoke SHL' },
        { status: 400 }
      )
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error revoking SHL:', error)
    return NextResponse.json(
      { error: 'Failed to revoke SHL' },
      { status: 500 }
    )
  }
}
