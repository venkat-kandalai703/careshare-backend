// RxNorm drug lookup: NDC (11-digit drug code) -> human-readable drug name.
//
// Mirrors lib/nppes/lookup.ts: a single-item lookup plus a batched lookup over
// Promise.all, each fetch cached 24h via Next.js fetch revalidation. Server-side
// only. Backed by the NLM RxNav REST API, which is public and free (no API key,
// no cost). See https://lhncbc.nlm.nih.gov/RxNav/APIs/

export interface RxNormDrug {
  ndc: string // the 11-digit NDC we queried
  rxcui: string // RxNorm concept id
  name: string // full RxNorm name, e.g. "simvastatin 20 MG Oral Tablet"
  strength?: string // best-effort, parsed from name, e.g. "20 MG"
  doseForm?: string // best-effort, parsed from name, e.g. "Oral Tablet"
}

const API_BASE = process.env.RXNORM_API_URL ?? 'https://rxnav.nlm.nih.gov/REST'

// Common RxNorm dose-form phrases, longest first so "Oral Tablet" wins over
// "Tablet". Best-effort only — a miss just leaves doseForm undefined.
const DOSE_FORMS = [
  'Extended Release Oral Tablet',
  'Extended Release Oral Capsule',
  'Delayed Release Oral Tablet',
  'Delayed Release Oral Capsule',
  'Oral Tablet',
  'Oral Capsule',
  'Oral Solution',
  'Oral Suspension',
  'Chewable Tablet',
  'Disintegrating Oral Tablet',
  'Injectable Solution',
  'Injectable Suspension',
  'Prefilled Syringe',
  'Metered Dose Inhaler',
  'Dry Powder Inhaler',
  'Transdermal System',
  'Topical Cream',
  'Topical Ointment',
  'Topical Gel',
  'Ophthalmic Solution',
  'Otic Solution',
  'Nasal Spray',
  'Rectal Suppository',
  'Tablet',
  'Capsule',
  'Solution',
  'Suspension',
  'Cream',
  'Ointment',
  'Injection',
]

// Pull "20 MG", "0.5 MG/ML", "100 UNT/ML" etc. out of an RxNorm name.
function parseStrength(name: string): string | undefined {
  const match = name.match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?\s*[A-Za-z%]+(?:\s*\/\s*[A-Za-z%]+)?)/)
  return match ? match[1].replace(/\s+/g, ' ').trim() : undefined
}

function parseDoseForm(name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const form of DOSE_FORMS) {
    if (lower.includes(form.toLowerCase())) return form
  }
  return undefined
}

interface RxcuiResponse {
  idGroup?: { rxnormId?: string[] }
}

interface PropertiesResponse {
  properties?: { rxcui?: string; name?: string }
}

export async function lookupDrug(ndc: string): Promise<RxNormDrug | null> {
  try {
    const cleanNdc = ndc.replace(/\D/g, '')
    if (!cleanNdc) return null

    // 1. NDC -> rxcui
    const idRes = await fetch(`${API_BASE}/rxcui.json?idtype=NDC&id=${cleanNdc}`, {
      next: { revalidate: 86400 },
    })
    if (!idRes.ok) return null
    const idData: RxcuiResponse = await idRes.json()
    const rxcui = idData.idGroup?.rxnormId?.[0]
    if (!rxcui) return null

    // 2. rxcui -> properties (name already embeds strength + dose form)
    const propRes = await fetch(`${API_BASE}/rxcui/${rxcui}/properties.json`, {
      next: { revalidate: 86400 },
    })
    if (!propRes.ok) return null
    const propData: PropertiesResponse = await propRes.json()
    const name = propData.properties?.name
    if (!name) return null

    return {
      ndc: cleanNdc,
      rxcui,
      name,
      strength: parseStrength(name),
      doseForm: parseDoseForm(name),
    }
  } catch {
    return null
  }
}

// Cap how many NDCs we resolve at once. RxNav's published limit is ~20
// requests/sec per IP; each lookupDrug makes 2 calls, so 8 in flight keeps us
// safely under the limit instead of bursting every NDC at once via Promise.all.
const MAX_CONCURRENCY = 8

export async function lookupDrugs(ndcs: string[]): Promise<Map<string, RxNormDrug>> {
  const result = new Map<string, RxNormDrug>()
  let next = 0

  // Run MAX_CONCURRENCY "workers" that each pull the next NDC off the queue
  // until the list is exhausted, so we never have more than that many in flight.
  async function worker() {
    while (next < ndcs.length) {
      const ndc = ndcs[next++]
      const drug = await lookupDrug(ndc)
      if (drug) result.set(ndc, drug)
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, ndcs.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return result
}
