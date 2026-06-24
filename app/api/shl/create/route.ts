// Create a new SMART Health Link
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/bluebutton/client'
import { fetchAllResources, transformToHealthSummary } from '@/lib/bluebutton/fhir-resources'
import { generateSHL } from '@/lib/shl/generator'
import type { CreateSHLRequest } from '@/types/shl'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  const body: CreateSHLRequest = await request.json()
  const { beneficiaryId, label, passcode, expiresInDays } = body
  
  // Validate beneficiary
  const beneficiary = session.beneficiaries.find(b => b.id === beneficiaryId)
  if (!beneficiary) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
  }
  
  // Validate passcode length if provided
  if (passcode) {
    if (passcode.length < 4 || passcode.length > 32) {
      return NextResponse.json(
        { error: 'Passcode must be between 4 and 32 characters' },
        { status: 400 }
      )
    }
  }
  
  try {
    // Fetch latest health data
    const client = await createServerClient(beneficiaryId)
    if (!client) {
      return NextResponse.json(
        { error: 'Failed to authenticate with Blue Button' },
        { status: 401 }
      )
    }
    
    const resources = await fetchAllResources(client, beneficiary.patientFhirId)
    const summary = await transformToHealthSummary(resources)
    
    // Generate SHL
    const shl = await generateSHL(summary, {
      beneficiaryId,
      label,
      passcode,
      expiresInDays,
    })
    
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
    console.error('Error creating SHL:', error)
    return NextResponse.json(
      { error: 'Failed to create SMART Health Link' },
      { status: 500 }
    )
  }
}
