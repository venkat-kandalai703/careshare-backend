// FHIR Resource Fetchers for USCDI v3 Data
import { BlueButtonClient } from './client'
import { lookupProviders } from '@/lib/nppes/lookup'
import { lookupDrugs } from '@/lib/rxnorm/lookup'
import type {
  Patient,
  Coverage,
  Condition,
  MedicationRequest,
  AllergyIntolerance,
  Procedure,
  Observation,
  Immunization,
  ExplanationOfBenefit,
  HealthSummary,
} from '@/types/fhir'

// Fetch all USCDI v3 resources for a patient
export async function fetchAllResources(
  client: BlueButtonClient,
  patientId: string
) {
  // Fetch resources in parallel where possible
  const [
    patient,
    coverages,
    conditions,
    medications,
    allergies,
    procedures,
    observations,
    immunizations,
    eobs,
  ] = await Promise.all([
    fetchPatient(client, patientId),
    fetchCoverages(client),
    fetchConditions(client),
    fetchMedications(client),
    fetchAllergies(client),
    fetchProcedures(client),
    fetchObservations(client),
    fetchImmunizations(client),
    fetchExplanationOfBenefits(client),
  ])
  
  return {
    patient,
    coverages,
    conditions,
    medications,
    allergies,
    procedures,
    observations,
    immunizations,
    eobs,
  }
}

// Individual resource fetchers
export async function fetchPatient(
  client: BlueButtonClient,
  patientId: string
): Promise<Patient> {
  return client.getResource<Patient>('Patient', patientId)
}

export async function fetchCoverages(client: BlueButtonClient): Promise<Coverage[]> {
  return client.searchResources<Coverage>('Coverage')
}

export async function fetchConditions(client: BlueButtonClient): Promise<Condition[]> {
  // Blue Button may not have Condition resources directly
  // We extract diagnoses from ExplanationOfBenefit
  try {
    return await client.searchResources<Condition>('Condition')
  } catch {
    return []
  }
}

export async function fetchMedications(client: BlueButtonClient): Promise<MedicationRequest[]> {
  try {
    return await client.searchResources<MedicationRequest>('MedicationRequest')
  } catch {
    return []
  }
}

export async function fetchAllergies(client: BlueButtonClient): Promise<AllergyIntolerance[]> {
  try {
    return await client.searchResources<AllergyIntolerance>('AllergyIntolerance')
  } catch {
    return []
  }
}

export async function fetchProcedures(client: BlueButtonClient): Promise<Procedure[]> {
  try {
    return await client.searchResources<Procedure>('Procedure')
  } catch {
    return []
  }
}

export async function fetchObservations(client: BlueButtonClient): Promise<Observation[]> {
  try {
    return await client.searchResources<Observation>('Observation')
  } catch {
    return []
  }
}

export async function fetchImmunizations(client: BlueButtonClient): Promise<Immunization[]> {
  try {
    return await client.searchResources<Immunization>('Immunization')
  } catch {
    return []
  }
}

export async function fetchExplanationOfBenefits(
  client: BlueButtonClient
): Promise<ExplanationOfBenefit[]> {
  // EOBs are the primary data source in Blue Button
  return client.searchResources<ExplanationOfBenefit>('ExplanationOfBenefit')
}

// Transform FHIR resources to display-friendly HealthSummary
export async function transformToHealthSummary(data: {
  patient: Patient
  coverages: Coverage[]
  conditions: Condition[]
  medications: MedicationRequest[]
  allergies: AllergyIntolerance[]
  procedures: Procedure[]
  observations: Observation[]
  immunizations: Immunization[]
  eobs: ExplanationOfBenefit[]
}): Promise<HealthSummary> {
  const { patient, coverages, conditions, medications, allergies, procedures, immunizations, eobs } = data
  
  // Extract patient info
  const name = patient.name?.[0]
  const displayName = name
    ? `${name.given?.join(' ') || ''} ${name.family || ''}`.trim()
    : 'Unknown'
  
  const address = patient.address?.[0]
  const addressStr = address
    ? `${address.line?.join(', ') || ''}, ${address.city || ''}, ${address.state || ''} ${address.postalCode || ''}`
    : undefined
  
  const phone = patient.telecom?.find(t => t.system === 'phone')?.value
  const email = patient.telecom?.find(t => t.system === 'email')?.value
  
  const mbi = patient.identifier?.find(
    id => id.system === 'http://hl7.org/fhir/sid/us-mbi'
  )?.value
  
  // Extract conditions from direct resources and EOBs
  const conditionsList = conditions.map(c => ({
    name: c.code?.text || c.code?.coding?.[0]?.display || 'Unknown condition',
    status: c.clinicalStatus?.coding?.[0]?.code || 'unknown',
    onsetDate: c.onsetDateTime,
  }))
  
  // Also extract diagnoses from EOBs
  const eobDiagnoses = new Map<string, { name: string; status: string }>()
  for (const eob of eobs) {
    for (const diag of eob.diagnosis || []) {
      const code = diag.diagnosisCodeableConcept?.coding?.[0]
      if (code?.code && !eobDiagnoses.has(code.code)) {
        eobDiagnoses.set(code.code, {
          name: code.display || code.code,
          status: 'active',
        })
      }
    }
  }
  
  // Merge conditions
  const allConditions = [
    ...conditionsList,
    ...Array.from(eobDiagnoses.values()).map(d => ({ ...d, onsetDate: undefined })),
  ]
  
  // Extract medications
  const medicationsList = medications.map(m => ({
    name: m.medicationCodeableConcept?.text ||
          m.medicationCodeableConcept?.coding?.[0]?.display ||
          'Unknown medication',
    code: m.medicationCodeableConcept?.coding?.[0]?.code,
    codeSystem: m.medicationCodeableConcept?.coding?.[0]?.system,
    displayCode: m.medicationCodeableConcept?.coding?.[0]?.code,
    dosage: m.dosageInstruction?.[0]?.text,
    frequency: m.dosageInstruction?.[0]?.timing?.repeat?.frequency
      ? `${m.dosageInstruction[0].timing?.repeat?.frequency} time${m.dosageInstruction[0].timing?.repeat?.frequency === 1 ? '' : 's'}`
      : undefined,
    status: m.status || 'unknown',
    authoredOn: m.authoredOn,
    prescriber: m.requester?.display,
    source: 'Medication record',
    isActive: ['active', 'on-hold', 'draft', 'unknown'].includes((m.status || 'unknown').toLowerCase()),
  }))

  function isPharmacyEob(eob: ExplanationOfBenefit): boolean {
    const profiles = eob.meta?.profile || []
    const typeCodings = eob.type?.coding || []

    return (
      profiles.some(profile => profile.toLowerCase().includes('pharmacy')) ||
      typeCodings.some(coding =>
        coding.code?.toLowerCase() === 'pde' ||
        coding.display?.toLowerCase().includes('pharmacy') ||
        coding.display?.toLowerCase().includes('part d')
      )
    )
  }

  function isNdcCoding(system?: string, code?: string): boolean {
    return Boolean(
      system?.toLowerCase().includes('/ndc') ||
      system?.toLowerCase().includes('us-ndc') ||
      code?.replace(/\D/g, '').length === 11
    )
  }

  const pharmacyClaims = new Map<string, {
    name: string
    code: string
    codeSystem?: string
    displayCode: string
    dosage: string
    fillDate?: string
    authoredOn?: string
    status: string
    source: string
    isActive: boolean
  }>()

  for (const eob of eobs) {
    if (!isPharmacyEob(eob)) continue

    for (const item of eob.item || []) {
      const coding = item.productOrService?.coding?.find(code =>
        isNdcCoding(code.system, code.code)
      )
      const ndc = coding?.code
      if (!ndc) continue

      const fillDate = item.servicedDate ||
        item.servicedPeriod?.end ||
        eob.billablePeriod?.end ||
        eob.billablePeriod?.start ||
        eob.created
      const existing = pharmacyClaims.get(ndc)

      if (existing?.fillDate && fillDate && new Date(existing.fillDate) > new Date(fillDate)) {
        continue
      }

      pharmacyClaims.set(ndc, {
        name: item.productOrService?.text ||
          coding.display ||
          'Medication name not provided by claim',
        code: ndc,
        codeSystem: coding.system,
        displayCode: ndc,
        dosage: 'Prescription fill',
        fillDate,
        authoredOn: fillDate,
        status: eob.status || 'claim-history',
        source: 'Medicare Part D claim',
        isActive: false,
      })
    }
  }

  // Resolve each NDC to a human-readable drug name via the free NLM RxNav API
  // (batched + 24h HTTP-cached, same pattern as the NPPES provider lookup).
  // Unmatched NDCs fall back to the existing claim-derived name.
  const rxData = await lookupDrugs(Array.from(pharmacyClaims.keys()))

  const medicationClaimList = Array.from(pharmacyClaims.entries()).map(([ndc, claim]) => {
    const rx = rxData.get(ndc)
    return {
      ...claim,
      name: rx?.name ?? claim.name,
      rxcui: rx?.rxcui,
      ndcCode: ndc,
      strength: rx?.strength,
      doseForm: rx?.doseForm,
    }
  })

  // Extract allergies
  const allergiesList = allergies.map(a => ({
    substance: a.code?.text || a.code?.coding?.[0]?.display || 'Unknown',
    type: a.type || 'unknown',
    status: a.clinicalStatus?.coding?.[0]?.code || 'unknown',
    verificationStatus: a.verificationStatus?.coding?.[0]?.code,
    severity: a.criticality,
    recordedDate: a.recordedDate,
    reactions: a.reaction?.flatMap(r => 
      r.manifestation.map(m => m.text || m.coding?.[0]?.display || '')
    ).filter(Boolean),
    isActive: ['active', 'unknown'].includes((a.clinicalStatus?.coding?.[0]?.code || 'unknown').toLowerCase()),
  }))
  
  // Extract procedures from direct resources and EOBs
  const proceduresList = procedures.map(p => ({
    name: p.code?.text || p.code?.coding?.[0]?.display || 'Unknown procedure',
    code: p.code?.coding?.[0]?.code,
    date: p.performedDateTime || p.performedPeriod?.start,
    status: p.status,
  }))
  
  // Also extract procedures from EOBs
  const eobProcedures = new Map<string, { name: string; code?: string; date?: string; status: string }>()
  for (const eob of eobs) {
    for (const proc of eob.procedure || []) {
      const code = proc.procedureCodeableConcept?.coding?.[0]
      if (code?.code && !eobProcedures.has(code.code)) {
        eobProcedures.set(code.code, {
          name: code.display || code.code,
          code: code.code,
          date: proc.date,
          status: 'completed',
        })
      }
    }
  }
  
  const allProcedures = [
    ...proceduresList,
    ...Array.from(eobProcedures.values()),
  ]
  
  // Extract immunizations
  const immunizationsList = immunizations.map(i => ({
    vaccine: i.vaccineCode?.text || i.vaccineCode?.coding?.[0]?.display || 'Unknown vaccine',
    date: i.occurrenceDateTime || i.occurrenceString,
    status: i.status,
  }))
  
  // Extract coverage info
  const coveragesList = coverages.map(c => ({
    type: c.type?.text || c.type?.coding?.[0]?.display || 'Medicare',
    status: c.status || 'active',
    period: c.period
      ? `${c.period.start || ''} - ${c.period.end || 'Present'}`
      : undefined,
  }))

  // ── Extract provider NPIs from EOBs ──────────────────────────────────────
  // Blue Button EOBs carry NPIs in the careTeam and provider fields.
  // The reference value is typically "Practitioner/<npi>" or contains an
  // identifier with system "http://hl7.org/fhir/sid/us-npi".
  const npiRoleMap = new Map<string, string>() // npi → role label

  function extractNpi(ref?: { reference?: string; identifier?: { system?: string; value?: string }; display?: string }): string | null {
    if (!ref) return null
    // e.g. "Practitioner/1234567890" or "Organization/1234567890"
    const refStr = ref.reference || ''
    const match = refStr.match(/\/(1\d{9})$/)
    if (match) return match[1]
    // identifier-based
    if (ref.identifier?.system?.includes('us-npi') && ref.identifier.value) {
      return ref.identifier.value
    }
    return null
  }

  const CARE_TEAM_ROLES: Record<string, string> = {
    attending: 'Attending Physician',
    primary: 'Primary Care Provider',
    supervising: 'Supervising Physician',
    operating: 'Operating Physician',
    otheroperating: 'Other Operating Physician',
    rendering: 'Rendering Provider',
    referring: 'Referring Provider',
    prescribing: 'Prescribing Provider',
    performing: 'Performing Provider',
  }

  for (const eob of eobs) {
    // careTeam members (most reliable source)
    for (const member of eob.careTeam || []) {
      const npi = extractNpi(member.provider)
      if (npi) {
        const roleCode = member.role?.coding?.[0]?.code?.toLowerCase() || ''
        const roleLabel = CARE_TEAM_ROLES[roleCode] || 'Care Team Member'
        if (!npiRoleMap.has(npi)) {
          npiRoleMap.set(npi, roleLabel)
        }
      }
    }
    // top-level provider field as fallback
    const topNpi = extractNpi(eob.provider)
    if (topNpi && !npiRoleMap.has(topNpi)) {
      npiRoleMap.set(topNpi, 'Provider')
    }
  }

  // Look up all collected NPIs in the NPPES dataset
  const nppiData = await lookupProviders(Array.from(npiRoleMap.keys()))

  const providersList = Array.from(npiRoleMap.entries()).map(([npi, role]) => {
    const p = nppiData.get(npi)
    return {
      npi,
      name: p?.name ?? `NPI ${npi}`,
      specialty: p?.specialty ?? 'Unknown Specialty',
      entityType: (p?.entityType ?? 'individual') as 'individual' | 'organization',
      address: p?.practiceAddress,
      city: p?.practiceCity,
      state: p?.practiceState,
      zip: p?.practiceZip,
      phone: p?.practicePhone,
      role,
    }
  })

  return {
    patient: {
      id: patient.id || '',
      name: displayName,
      birthDate: patient.birthDate || '',
      gender: patient.gender || 'unknown',
      address: addressStr,
      phone,
      email,
      medicareId: mbi,
    },
    coverage: coveragesList,
    conditions: allConditions,
    medications: [...medicationsList, ...medicationClaimList],
    allergies: allergiesList,
    procedures: allProcedures,
    immunizations: immunizationsList,
    providers: providersList,
    lastUpdated: new Date().toISOString(),
  }
}
