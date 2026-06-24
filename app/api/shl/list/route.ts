// List all SHLs for a beneficiary
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { listSHLsForBeneficiary, getSHLMetadata } from '@/lib/shl/generator'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId')
  
  if (!beneficiaryId) {
    return NextResponse.json(
      { error: 'Missing beneficiaryId' },
      { status: 400 }
    )
  }
  
  // Verify beneficiary belongs to this session
  const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
  if (!beneficiary) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
  }
  
  try {
    const shls = await listSHLsForBeneficiary(beneficiaryId)
    
    return NextResponse.json({
      shls: shls.map(shl => ({
        id: shl.id,
        label: shl.label,
        qrCodeDataUrl: shl.qrCodeDataUrl,
        expiresAt: shl.expiresAt,
        createdAt: shl.createdAt,
        hasPasscode: !!shl.passcodeHash,
      })),
    })
  } catch (error) {
    console.error('Error listing SHLs:', error)
    return NextResponse.json(
      { error: 'Failed to list SHLs' },
      { status: 500 }
    )
  }
}

// Get a specific SHL by ID
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
    const shl = await getSHLMetadata(shlId)
    
    if (!shl || shl.beneficiaryId !== beneficiaryId) {
      return NextResponse.json({ error: 'SHL not found' }, { status: 404 })
    }
    
    return NextResponse.json({
      shl: {
        id: shl.id,
        shlUri: shl.shlUri,
        qrCodeDataUrl: shl.qrCodeDataUrl,
        label: shl.label,
        expiresAt: shl.expiresAt,
        createdAt: shl.createdAt,
        hasPasscode: !!shl.passcodeHash,
      },
    })
  } catch (error) {
    console.error('Error getting SHL:', error)
    return NextResponse.json(
      { error: 'Failed to get SHL' },
      { status: 500 }
    )
  }
}
