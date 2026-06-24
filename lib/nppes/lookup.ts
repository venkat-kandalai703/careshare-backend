export interface NPPESProvider {
  npi: string
  entityType: 'individual' | 'organization'
  name: string
  firstName?: string
  lastName?: string
  credential?: string
  organizationName?: string
  gender?: string
  specialty: string
  taxonomyCode?: string
  practiceAddress?: string
  practiceCity?: string
  practiceState?: string
  practiceZip?: string
  practicePhone?: string
  enumerationDate?: string
  lastUpdated?: string
}

const API_BASE = process.env.NPPES_API_URL ?? 'https://ivzvb2h7w4.execute-api.us-east-1.amazonaws.com/prod'

// Shape of a row returned by SELECT * on nppes_provider
interface NppesRow {
  npi: number
  entity_type_code: number
  org_name: string | null
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  credential: string | null
  practice_address_1: string | null
  practice_address_2: string | null
  practice_city: string | null
  practice_state: string | null
  practice_postal: string | null
  practice_phone: string | null
  primary_taxonomy: string | null
  enumeration_date: string | null
  last_update_date: string | null
  sex_code: string | null
}

const TAXONOMY_MAP: Record<string, string> = {
  '207Q00000X': 'Family Medicine',
  '207R00000X': 'Internal Medicine',
  '208000000X': 'Pediatrics',
  '207T00000X': 'Neurological Surgery',
  '207X00000X': 'Orthopedic Surgery',
  '207Y00000X': 'Otolaryngology',
  '208600000X': 'Surgery',
  '207L00000X': 'Anesthesiology',
  '207N00000X': 'Dermatology',
  '207P00000X': 'Emergency Medicine',
  '207V00000X': 'Obstetrics & Gynecology',
  '207W00000X': 'Ophthalmology',
  '207ZP0102X': 'Pathology',
  '207ZR0200X': 'Radiology',
  '207RC0000X': 'Cardiovascular Disease',
  '207RE0101X': 'Endocrinology, Diabetes & Metabolism',
  '207RG0100X': 'Gastroenterology',
  '207RH0000X': 'Hematology',
  '207RI0200X': 'Infectious Disease',
  '207RN0300X': 'Nephrology',
  '207RO0100X': 'Oncology',
  '207RP1001X': 'Pulmonary Disease',
  '207RR0500X': 'Rheumatology',
  '2084P0800X': 'Psychiatry',
  '2084N0400X': 'Neurology',
  '363LP0808X': 'Psychiatric/Mental Health (Nurse Practitioner)',
  '363L00000X': 'Nurse Practitioner',
  '363LA2200X': 'Acute Care Nurse Practitioner',
  '363LF0000X': 'Family Nurse Practitioner',
  '363LG0600X': 'Gerontological Nurse Practitioner',
  '363LN0000X': 'Neonatal Nurse Practitioner',
  '363LW0102X': "Women's Health Nurse Practitioner",
  '367500000X': 'Nurse Anesthetist',
  '374700000X': 'Anesthesiologist Assistant',
  '103K00000X': 'Behavioral Health & Social Service',
  '103T00000X': 'Psychologist',
  '1041C0700X': 'Clinical Social Worker',
  '111N00000X': 'Chiropractor',
  '122300000X': 'Dentist',
  '1223G0001X': 'General Practice Dentist',
  '1223S0112X': 'Oral & Maxillofacial Surgery',
  '152W00000X': 'Optometrist',
  '163W00000X': 'Registered Nurse',
  '163WA0400X': 'Nurse, Addiction (RN)',
  '170100000X': 'Physical Therapist',
  '171100000X': 'Respiratory Therapist',
  '172A00000X': 'Driver Rehabilitation Specialist',
  '183500000X': 'Pharmacist',
  '193200000X': 'Multi-Specialty Group',
  '193400000X': 'Single Specialty Group',
  '261QF0050X': 'Federally Qualified Health Center',
  '261QM0801X': 'Mental Health Clinic',
  '261QP2300X': 'Primary Care Clinic',
  '261QR0400X': 'Rehabilitation Outpatient Facility',
  '282N00000X': 'General Acute Care Hospital',
  '283Q00000X': 'Psychiatric Hospital',
  '291U00000X': 'Clinical Medical Laboratory',
  '302F00000X': 'Exclusive Provider Organization',
  '305S00000X': 'Community Health Center',
  '310400000X': 'Assisted Living Facility',
  '311500000X': 'Alzheimer Center',
  '314000000X': 'Hospice Care',
  '315D00000X': 'Hospice, Inpatient',
  '320600000X': 'Residential Treatment Facility, Mental Illness',
  '332B00000X': 'Durable Medical Equipment',
  '333600000X': 'Pharmacy',
  '335E00000X': 'Prosthetic/Orthotic Supplier',
  '341600000X': 'Ambulance, Air Transport',
  '341800000X': 'Ambulance, Land Transport',
  '405300000X': 'Prevention Professional',
}

function resolveTaxonomy(code: string): string {
  if (!code) return 'Unknown Specialty'
  return TAXONOMY_MAP[code] || `Specialty (${code})`
}

function mapRow(row: NppesRow): NPPESProvider {
  const isOrg = row.entity_type_code === 2

  let name: string
  if (isOrg) {
    name = row.org_name || 'Unknown Organization'
  } else {
    const parts = [row.first_name, row.middle_name, row.last_name].filter(Boolean)
    name = parts.join(' ')
    if (row.credential) name += `, ${row.credential}`
    if (!name.trim()) name = 'Unknown Provider'
  }

  const zip = row.practice_postal?.substring(0, 5)
  const rawPhone = (row.practice_phone || '').replace(/\D/g, '')
  const phone = rawPhone.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3') || undefined

  return {
    npi: String(row.npi),
    entityType: isOrg ? 'organization' : 'individual',
    name,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    credential: row.credential ?? undefined,
    organizationName: row.org_name ?? undefined,
    gender: row.sex_code ?? undefined,
    specialty: resolveTaxonomy(row.primary_taxonomy ?? ''),
    taxonomyCode: row.primary_taxonomy ?? undefined,
    practiceAddress: row.practice_address_2
      ? `${row.practice_address_1}, ${row.practice_address_2}`
      : row.practice_address_1 ?? undefined,
    practiceCity: row.practice_city ?? undefined,
    practiceState: row.practice_state ?? undefined,
    practiceZip: zip || undefined,
    practicePhone: phone,
    enumerationDate: row.enumeration_date ?? undefined,
    lastUpdated: row.last_update_date ?? undefined,
  }
}

export async function lookupProvider(npi: string): Promise<NPPESProvider | null> {
  try {
    const res = await fetch(`${API_BASE}/providers/${npi}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null
    const row: NppesRow = await res.json()
    return mapRow(row)
  } catch {
    return null
  }
}

export async function lookupProviders(npis: string[]): Promise<Map<string, NPPESProvider>> {
  const pairs = await Promise.all(
    npis.map(async (npi) => [npi, await lookupProvider(npi)] as const)
  )
  const result = new Map<string, NPPESProvider>()
  for (const [npi, provider] of pairs) {
    if (provider) result.set(npi, provider)
  }
  return result
}
