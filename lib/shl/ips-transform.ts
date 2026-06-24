// Transform FHIR resources to International Patient Summary (IPS) Bundle
import type { HealthSummary } from '@/types/fhir'
import type { IPSBundle } from '@/types/shl'

// LOINC codes for IPS sections
const IPS_SECTION_CODES = {
  problems: { system: 'http://loinc.org', code: '11450-4', display: 'Problem list' },
  medications: { system: 'http://loinc.org', code: '10160-0', display: 'Medication use' },
  allergies: { system: 'http://loinc.org', code: '48765-2', display: 'Allergies' },
  procedures: { system: 'http://loinc.org', code: '47519-4', display: 'Procedures' },
  immunizations: { system: 'http://loinc.org', code: '11369-6', display: 'Immunizations' },
} as const

// Create an IPS-compliant FHIR Bundle from HealthSummary
export function createIPSBundle(summary: HealthSummary): IPSBundle {
  const bundleId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const patientRef = `urn:uuid:${crypto.randomUUID()}`
  
  // Build entries array
  const entries: IPSBundle['entry'] = []
  const sectionEntries: Record<string, Array<{ reference: string }>> = {
    problems: [],
    medications: [],
    allergies: [],
    procedures: [],
    immunizations: [],
  }
  
  // Add Patient resource
  const patientEntry = {
    fullUrl: patientRef,
    resource: {
      resourceType: 'Patient',
      id: summary.patient.id,
      name: [{ 
        family: summary.patient.name.split(' ').pop(),
        given: summary.patient.name.split(' ').slice(0, -1),
      }],
      gender: summary.patient.gender,
      birthDate: summary.patient.birthDate,
      identifier: summary.patient.medicareId ? [{
        system: 'http://hl7.org/fhir/sid/us-mbi',
        value: summary.patient.medicareId,
      }] : undefined,
    },
  }
  entries.push(patientEntry)
  
  // Add Condition resources (problems)
  for (const condition of summary.conditions) {
    const conditionRef = `urn:uuid:${crypto.randomUUID()}`
    entries.push({
      fullUrl: conditionRef,
      resource: {
        resourceType: 'Condition',
        clinicalStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: condition.status === 'active' ? 'active' : 'resolved',
          }],
        },
        code: {
          text: condition.name,
        },
        subject: { reference: patientRef },
        onsetDateTime: condition.onsetDate,
      },
    })
    sectionEntries.problems.push({ reference: conditionRef })
  }
  
  // Add MedicationStatement resources
  for (const medication of summary.medications) {
    const medRef = `urn:uuid:${crypto.randomUUID()}`
    entries.push({
      fullUrl: medRef,
      resource: {
        resourceType: 'MedicationStatement',
        status: medication.status === 'active' ? 'active' : 'completed',
        medicationCodeableConcept: {
          text: medication.name,
        },
        subject: { reference: patientRef },
        dosage: medication.dosage ? [{
          text: medication.dosage,
        }] : undefined,
      },
    })
    sectionEntries.medications.push({ reference: medRef })
  }
  
  // Add AllergyIntolerance resources
  for (const allergy of summary.allergies) {
    const allergyRef = `urn:uuid:${crypto.randomUUID()}`
    entries.push({
      fullUrl: allergyRef,
      resource: {
        resourceType: 'AllergyIntolerance',
        clinicalStatus: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
            code: 'active',
          }],
        },
        code: {
          text: allergy.substance,
        },
        patient: { reference: patientRef },
        type: allergy.type as 'allergy' | 'intolerance',
        criticality: allergy.severity as 'low' | 'high' | 'unable-to-assess' | undefined,
        reaction: allergy.reactions?.length ? [{
          manifestation: allergy.reactions.map(r => ({ text: r })),
        }] : undefined,
      },
    })
    sectionEntries.allergies.push({ reference: allergyRef })
  }
  
  // Add Procedure resources
  for (const procedure of summary.procedures) {
    const procRef = `urn:uuid:${crypto.randomUUID()}`
    entries.push({
      fullUrl: procRef,
      resource: {
        resourceType: 'Procedure',
        status: procedure.status,
        code: {
          text: procedure.name,
        },
        subject: { reference: patientRef },
        performedDateTime: procedure.date,
      },
    })
    sectionEntries.procedures.push({ reference: procRef })
  }
  
  // Add Immunization resources
  for (const immunization of summary.immunizations) {
    const immRef = `urn:uuid:${crypto.randomUUID()}`
    entries.push({
      fullUrl: immRef,
      resource: {
        resourceType: 'Immunization',
        status: immunization.status,
        vaccineCode: {
          text: immunization.vaccine,
        },
        patient: { reference: patientRef },
        occurrenceDateTime: immunization.date,
      },
    })
    sectionEntries.immunizations.push({ reference: immRef })
  }
  
  // Create Composition resource
  const compositionId = crypto.randomUUID()
  const composition = {
    resourceType: 'Composition' as const,
    id: compositionId,
    status: 'final' as const,
    type: {
      coding: [{
        system: 'http://loinc.org' as const,
        code: '60591-5' as const,
        display: 'Patient summary Document' as const,
      }],
    },
    subject: { reference: patientRef },
    date: timestamp,
    title: `Medicare Health Summary for ${summary.patient.name}`,
    section: Object.entries(sectionEntries).map(([key, entries]) => {
      const code = IPS_SECTION_CODES[key as keyof typeof IPS_SECTION_CODES]
      return {
        title: code.display,
        code: { coding: [code] },
        entry: entries.length > 0 ? entries : undefined,
        emptyReason: entries.length === 0 ? {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/list-empty-reason' as const,
            code: 'unavailable' as const,
            display: 'No data available',
          }],
        } : undefined,
      }
    }),
  }
  
  // Insert Composition as first entry
  entries.unshift({
    fullUrl: `urn:uuid:${compositionId}`,
    resource: composition,
  })
  
  return {
    resourceType: 'Bundle',
    id: bundleId,
    type: 'document',
    timestamp,
    entry: entries,
  }
}
