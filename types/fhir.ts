// FHIR R4 Resource Types for Blue Button 2.0 / USCDI v3

export interface FHIRResource {
  resourceType: string
  id?: string
  meta?: {
    lastUpdated?: string
    profile?: string[]
  }
}

export interface FHIRBundle extends FHIRResource {
  resourceType: 'Bundle'
  type: 'collection' | 'searchset' | 'document'
  total?: number
  entry?: Array<{
    fullUrl?: string
    resource: FHIRResource
  }>
  link?: Array<{
    relation: string
    url: string
  }>
}

export interface HumanName {
  use?: 'official' | 'usual' | 'nickname'
  family?: string
  given?: string[]
  prefix?: string[]
  suffix?: string[]
}

export interface Address {
  use?: 'home' | 'work' | 'temp'
  type?: 'postal' | 'physical' | 'both'
  line?: string[]
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface ContactPoint {
  system?: 'phone' | 'email' | 'fax'
  value?: string
  use?: 'home' | 'work' | 'mobile'
}

export interface Identifier {
  system?: string
  value?: string
  type?: {
    coding?: Array<{
      system?: string
      code?: string
      display?: string
    }>
  }
}

export interface CodeableConcept {
  coding?: Array<{
    system?: string
    code?: string
    display?: string
  }>
  text?: string
}

export interface Reference {
  reference?: string
  display?: string
  identifier?: Identifier
}

export interface Period {
  start?: string
  end?: string
}

// Patient Resource
export interface Patient extends FHIRResource {
  resourceType: 'Patient'
  identifier?: Identifier[]
  name?: HumanName[]
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  address?: Address[]
  telecom?: ContactPoint[]
  maritalStatus?: CodeableConcept
}

// Coverage Resource (Insurance)
export interface Coverage extends FHIRResource {
  resourceType: 'Coverage'
  status?: string
  type?: CodeableConcept
  subscriber?: Reference
  beneficiary?: Reference
  relationship?: CodeableConcept
  period?: Period
  payor?: Reference[]
  class?: Array<{
    type: CodeableConcept
    value: string
    name?: string
  }>
}

// Condition Resource (Diagnoses)
export interface Condition extends FHIRResource {
  resourceType: 'Condition'
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  category?: CodeableConcept[]
  severity?: CodeableConcept
  code?: CodeableConcept
  subject: Reference
  onsetDateTime?: string
  recordedDate?: string
}

// MedicationRequest Resource
export interface MedicationRequest extends FHIRResource {
  resourceType: 'MedicationRequest'
  status?: string
  intent?: string
  medicationCodeableConcept?: CodeableConcept
  medicationReference?: Reference
  subject: Reference
  requester?: Reference
  authoredOn?: string
  dosageInstruction?: Array<{
    text?: string
    timing?: {
      repeat?: {
        frequency?: number
        period?: number
        periodUnit?: string
      }
    }
    doseAndRate?: Array<{
      doseQuantity?: {
        value?: number
        unit?: string
      }
    }>
  }>
}

// AllergyIntolerance Resource
export interface AllergyIntolerance extends FHIRResource {
  resourceType: 'AllergyIntolerance'
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  type?: 'allergy' | 'intolerance'
  category?: Array<'food' | 'medication' | 'environment' | 'biologic'>
  criticality?: 'low' | 'high' | 'unable-to-assess'
  code?: CodeableConcept
  patient: Reference
  onsetDateTime?: string
  recordedDate?: string
  reaction?: Array<{
    substance?: CodeableConcept
    manifestation: CodeableConcept[]
    severity?: 'mild' | 'moderate' | 'severe'
  }>
}

// Procedure Resource
export interface Procedure extends FHIRResource {
  resourceType: 'Procedure'
  status: string
  code?: CodeableConcept
  subject: Reference
  performedDateTime?: string
  performedPeriod?: Period
}

// Observation Resource (Labs, Vitals)
export interface Observation extends FHIRResource {
  resourceType: 'Observation'
  status: string
  category?: CodeableConcept[]
  code: CodeableConcept
  subject?: Reference
  effectiveDateTime?: string
  valueQuantity?: {
    value?: number
    unit?: string
    system?: string
    code?: string
  }
  valueCodeableConcept?: CodeableConcept
  valueString?: string
  interpretation?: CodeableConcept[]
  referenceRange?: Array<{
    low?: { value?: number; unit?: string }
    high?: { value?: number; unit?: string }
    text?: string
  }>
}

// Immunization Resource
export interface Immunization extends FHIRResource {
  resourceType: 'Immunization'
  status: string
  vaccineCode: CodeableConcept
  patient: Reference
  occurrenceDateTime?: string
  occurrenceString?: string
  primarySource?: boolean
  lotNumber?: string
  expirationDate?: string
}

// ExplanationOfBenefit Resource (Claims)
export interface ExplanationOfBenefit extends FHIRResource {
  resourceType: 'ExplanationOfBenefit'
  status?: string
  type?: CodeableConcept
  use?: string
  patient: Reference
  billablePeriod?: Period
  created?: string
  provider?: Reference
  facility?: Reference
  careTeam?: Array<{
    sequence: number
    provider: Reference
    responsible?: boolean
    role?: CodeableConcept
    qualification?: CodeableConcept
  }>
  diagnosis?: Array<{
    sequence: number
    diagnosisCodeableConcept?: CodeableConcept
  }>
  procedure?: Array<{
    sequence: number
    procedureCodeableConcept?: CodeableConcept
    date?: string
  }>
  item?: Array<{
    sequence: number
    servicedDate?: string
    servicedPeriod?: Period
    productOrService?: CodeableConcept
    quantity?: {
      value?: number
      unit?: string
    }
  }>
  total?: Array<{
    category: CodeableConcept
    amount: {
      value: number
      currency: string
    }
  }>
}

// DocumentReference Resource
export interface DocumentReference extends FHIRResource {
  resourceType: 'DocumentReference'
  status: string
  type?: CodeableConcept
  category?: CodeableConcept[]
  subject?: Reference
  date?: string
  description?: string
  content: Array<{
    attachment: {
      contentType?: string
      url?: string
      data?: string
      title?: string
    }
  }>
}

// Union type for all resources
export type USCDIResource =
  | Patient
  | Coverage
  | Condition
  | MedicationRequest
  | AllergyIntolerance
  | Procedure
  | Observation
  | Immunization
  | ExplanationOfBenefit
  | DocumentReference

// Health Summary (transformed data for display)
export interface HealthSummary {
  patient: {
    id: string
    name: string
    birthDate: string
    gender: string
    address?: string
    phone?: string
    email?: string
    medicareId?: string
  }
  coverage: Array<{
    type: string
    status: string
    period?: string
  }>
  conditions: Array<{
    name: string
    status: string
    onsetDate?: string
  }>
  medications: Array<{
    name: string
    code?: string
    codeSystem?: string
    displayCode?: string
    rxcui?: string
    ndcCode?: string
    activeIngredient?: string
    strength?: string
    doseForm?: string
    dosage?: string
    frequency?: string
    fillDate?: string
    status: string
    authoredOn?: string
    prescriber?: string
    source?: string
    isActive: boolean
  }>
  allergies: Array<{
    substance: string
    type: string
    status: string
    verificationStatus?: string
    severity?: string
    recordedDate?: string
    reactions?: string[]
    isActive: boolean
  }>
  procedures: Array<{
    name: string
    code?: string
    date?: string
    status: string
  }>
  immunizations: Array<{
    vaccine: string
    date?: string
    status: string
  }>
  providers: Array<{
    npi?: string
    claimIdentifier?: string
    name: string
    specialty: string
    entityType: 'individual' | 'organization'
    address?: string
    city?: string
    state?: string
    zip?: string
    phone?: string
    role?: string
  }>
  lastUpdated: string
}
