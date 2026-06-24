// Blue Button 2.0 API Configuration

// Environment-based URLs
export const BB_CONFIG = {
  // Sandbox environment (default)
  sandbox: {
    authUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/authorize/',
    tokenUrl: 'https://sandbox.bluebutton.cms.gov/v2/o/token/',
    fhirBaseUrl: 'https://sandbox.bluebutton.cms.gov/v2/fhir/',
    userInfoUrl: 'https://sandbox.bluebutton.cms.gov/v2/connect/userinfo',
  },
  // Production environment
  production: {
    authUrl: 'https://api.bluebutton.cms.gov/v2/o/authorize/',
    tokenUrl: 'https://api.bluebutton.cms.gov/v2/o/token/',
    fhirBaseUrl: 'https://api.bluebutton.cms.gov/v2/fhir/',
    userInfoUrl: 'https://api.bluebutton.cms.gov/v2/connect/userinfo',
  },
} as const

// Use sandbox by default, can be overridden by env var
export const BB_ENV = (process.env.BB_ENVIRONMENT || 'sandbox') as keyof typeof BB_CONFIG
export const BB_URLS = BB_CONFIG[BB_ENV]

// OAuth scopes - we need patient data access
export const BB_SCOPES = [
  'patient/Patient.rs',
  'patient/Coverage.rs',
  'patient/ExplanationOfBenefit.rs'
].join(' ')

// FHIR resource types we fetch for USCDI v3
export const USCDI_RESOURCES = [
  'Patient',
  'Coverage',
  'ExplanationOfBenefit',
  'Condition',
  'MedicationRequest',
  'AllergyIntolerance',
  'Procedure',
  'Observation',
  'Immunization',
] as const

// Session configuration
export const SESSION_CONFIG = {
  cookieName: 'mbb_session',
  maxAge: 60 * 60 * 24 * 7, // 7 days
  stateCookieName: 'mbb_oauth_state',
  stateMaxAge: 60 * 10, // 10 minutes
} as const

// SHL configuration
export const SHL_CONFIG = {
  defaultLabel: 'Medicare Health Summary',
  defaultExpirationDays: 365,
  maxPasscodeLength: 32,
  minPasscodeLength: 4,
} as const

// App metadata
export const APP_CONFIG = {
  name: 'Medicare Health Card',
  description: 'Your Medicare health summary in a QR code',
  version: '1.0.0',
} as const
