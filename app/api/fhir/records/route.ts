// Fetch USCDI v3 health records for a beneficiary
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/bluebutton/client'
import { fetchAllResources, transformToHealthSummary } from '@/lib/bluebutton/fhir-resources'

export async function GET(request: NextRequest) {
  const beneficiaryId = request.nextUrl.searchParams.get('beneficiaryId')
  
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  
  // Use provided beneficiaryId or active beneficiary
  const targetId = beneficiaryId || session.activeBeneficiaryId
  if (!targetId) {
    return NextResponse.json({ error: 'No beneficiary specified' }, { status: 400 })
  }
  
  const beneficiary = session.beneficiaries.find(b => b.id === targetId)
  if (!beneficiary) {
    return NextResponse.json({ error: 'Beneficiary not found' }, { status: 404 })
  }
  
  try {
    // Create Blue Button client
    const client = await createServerClient(targetId)
    if (!client) {
      return NextResponse.json({ error: 'Failed to authenticate with Blue Button' }, { status: 401 })
    }
    
    // Fetch all USCDI resources
    const resources = await fetchAllResources(client, beneficiary.patientFhirId)
    
    // Transform to display-friendly format
    const summary = await transformToHealthSummary(resources)
    
    // Update last sync time
    await client.updateLastSync()
    
    return NextResponse.json({
      summary,
      rawResources: {
        patient: resources.patient,
        coverageCount: resources.coverages.length,
        conditionCount: resources.conditions.length,
        medicationCount: resources.medications.length,
        allergyCount: resources.allergies.length,
        procedureCount: resources.procedures.length,
        immunizationCount: resources.immunizations.length,
        eobCount: resources.eobs.length,
      },
    })
  } catch (error) {
    console.error('Error fetching FHIR records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch health records' },
      { status: 500 }
    )
  }
}
