// One-time SDOH cohort build.
//
// Reads the BCDA synthetic ExplanationOfBenefit (EOB) NDJSON export from
// data/raw/, randomly attaches realistic SDOH ICD-10 Z-codes (Z55-Z65 range)
// to each patient — weighted by real-world prevalence — and writes a
// Blue-Button-shaped enriched NDJSON to data/enriched/.
//
// The Z-codes are injected directly into eob.diagnosis[] by cloning a real
// diagnosis entry from the same claim, so the output is indistinguishable in
// shape from real BB data and flows through the existing extraction logic in
// lib/bluebutton/fhir-resources.ts with zero changes.
//
// Deterministic: a seeded PRNG + sorted patient iteration means reruns produce
// byte-identical output. Idempotent: the raw input is never modified.
//
// Run:  node scripts/enrich-eob-zcodes.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RAW_DIR = path.join(ROOT, 'data', 'raw')
const OUT_DIR = path.join(ROOT, 'data', 'enriched')
const OUT_FILE = path.join(OUT_DIR, 'ExplanationOfBenefit.ndjson')

// Fixed seed → reproducible cohort. Bump to reshuffle the assignment.
const SEED = 1337

// ── SDOH Z-code prevalence table ────────────────────────────────────────────
// Codes are DOTLESS to match the BCDA data (e.g. "Z5941", not "Z59.41").
// Validate against the official ICD-10-CM Z-code list before clinical use.
const SDOH_DOMAINS = [
  { domain: 'food_insecurity',      code: 'Z5941',  display: 'Food insecurity',                   prevalence: 0.18 },
  { domain: 'housing_instability',  code: 'Z59811', display: 'Housing instability, housed',        prevalence: 0.12 },
  { domain: 'homelessness',         code: 'Z5900',  display: 'Homelessness, unspecified',          prevalence: 0.04 },
  { domain: 'transportation',       code: 'Z5982',  display: 'Transportation insecurity',          prevalence: 0.15 },
  { domain: 'financial_strain',     code: 'Z5986',  display: 'Financial insecurity',               prevalence: 0.22 },
  { domain: 'social_isolation',     code: 'Z602',   display: 'Problems related to living alone',    prevalence: 0.20 },
  { domain: 'unemployment',         code: 'Z560',   display: 'Unemployment, unspecified',           prevalence: 0.10 },
  { domain: 'education_literacy',   code: 'Z550',   display: 'Illiteracy and low-level literacy',   prevalence: 0.08 },
  { domain: 'interpersonal_safety', code: 'Z654',   display: 'Victim of crime and terrorism',       prevalence: 0.06 },
]

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10'
const DIAG_TYPE_SYSTEM = 'https://bluebutton.cms.gov/resources/codesystem/diagnosis-type'

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Load raw EOB NDJSON (all ExplanationOfBenefit*.ndjson part files) ────────
function loadRawEobs() {
  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`Missing input dir: ${RAW_DIR}`)
  }
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => /^ExplanationOfBenefit.*\.ndjson$/i.test(f))
    .sort()
  if (files.length === 0) {
    throw new Error(`No ExplanationOfBenefit*.ndjson files found in ${RAW_DIR}`)
  }

  const eobs = []
  for (const file of files) {
    const text = fs.readFileSync(path.join(RAW_DIR, file), 'utf8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      eobs.push(JSON.parse(trimmed))
    }
  }
  console.log(`Loaded ${eobs.length} EOB records from ${files.length} file(s): ${files.join(', ')}`)
  return eobs
}

function patientRef(eob) {
  return eob?.patient?.reference || null
}

// Best available date for "most recent claim" selection.
function eobDate(eob) {
  const s =
    eob?.billablePeriod?.end ||
    eob?.billablePeriod?.start ||
    eob?.created ||
    null
  const t = s ? Date.parse(s) : NaN
  return Number.isNaN(t) ? -Infinity : t
}

// Find a diagnosis entry to use as a structural template (prefer the target
// EOB's own entries; fall back to any of the patient's EOBs; else null).
function findTemplate(targetEob, patientEobs) {
  if (Array.isArray(targetEob.diagnosis) && targetEob.diagnosis.length) {
    return targetEob.diagnosis[0]
  }
  for (const e of patientEobs) {
    if (Array.isArray(e.diagnosis) && e.diagnosis.length) return e.diagnosis[0]
  }
  return null
}

// Build a BB-shaped diagnosis entry for a Z-code by cloning a real one.
// We preserve the template's exact structure (e.g. dual icd-10-cm + icd-10
// codings, and whichever diagnosis-type code system this export uses) and only
// swap in the Z-code, the sequence, and a "secondary" type designation.
// Displays are upper-cased to match the BCDA data's style (e.g. "HYPOXEMIA").
function makeDiagnosisEntry(template, sequence, code, display) {
  const upper = display.toUpperCase()
  let entry

  if (template) {
    entry = JSON.parse(JSON.stringify(template)) // deep clone → carries shape/systems
    const codings = entry.diagnosisCodeableConcept?.coding
    if (Array.isArray(codings) && codings.length) {
      // Rewrite the code/display in every coding, preserving each system.
      for (const c of codings) {
        c.code = code
        c.display = upper
      }
    } else {
      entry.diagnosisCodeableConcept = { coding: [{ system: ICD10_SYSTEM, code, display: upper }] }
    }
  } else {
    // Fallback when the patient has no diagnosis anywhere to clone from.
    entry = { diagnosisCodeableConcept: { coding: [{ system: ICD10_SYSTEM, code, display: upper }] } }
  }

  // Mark as secondary, using the same type code system the export uses.
  const typeSystem = template?.type?.[0]?.coding?.[0]?.system || DIAG_TYPE_SYSTEM
  entry.type = [{ coding: [{ system: typeSystem, code: 'secondary', display: 'secondary' }] }]
  entry.sequence = sequence
  return entry
}

function maxSequence(eob) {
  let max = 0
  for (const d of eob.diagnosis || []) {
    if (typeof d.sequence === 'number' && d.sequence > max) max = d.sequence
  }
  return max
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const eobs = loadRawEobs()

  // Group EOBs by patient (preserve object references; we mutate in place).
  const byPatient = new Map()
  let noPatientRef = 0
  for (const eob of eobs) {
    const ref = patientRef(eob)
    if (!ref) {
      noPatientRef++
      continue
    }
    if (!byPatient.has(ref)) byPatient.set(ref, [])
    byPatient.get(ref).push(eob)
  }

  const patientIds = Array.from(byPatient.keys()).sort() // deterministic order
  const rng = mulberry32(SEED)

  const domainCounts = Object.fromEntries(SDOH_DOMAINS.map((d) => [d.domain, 0]))
  let patientsWithAnyZ = 0
  let totalZ = 0
  let modifiedEobs = 0

  for (const pid of patientIds) {
    const patientEobs = byPatient.get(pid)

    // Roll each domain independently against its prevalence.
    const assigned = []
    for (const d of SDOH_DOMAINS) {
      if (rng() < d.prevalence) assigned.push(d)
    }
    if (assigned.length === 0) continue

    // Attach all of this patient's Z-codes to their single most-recent claim.
    let target = patientEobs[0]
    for (const e of patientEobs) {
      if (eobDate(e) > eobDate(target)) target = e
    }
    if (!Array.isArray(target.diagnosis)) target.diagnosis = []

    const template = findTemplate(target, patientEobs)
    let seq = maxSequence(target)
    for (const d of assigned) {
      seq += 1
      target.diagnosis.push(makeDiagnosisEntry(template, seq, d.code, d.display))
      domainCounts[d.domain] += 1
      totalZ += 1
    }
    patientsWithAnyZ += 1
    modifiedEobs += 1
  }

  // Write enriched output (untouched EOBs pass through verbatim).
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = fs.createWriteStream(OUT_FILE, { encoding: 'utf8' })
  for (const eob of eobs) out.write(JSON.stringify(eob) + '\n')
  out.end()

  out.on('finish', () => {
    console.log('\n── SDOH enrichment summary ─────────────────────────────')
    console.log(`Distinct patients:           ${patientIds.length}`)
    if (noPatientRef) console.log(`EOBs without patient ref:    ${noPatientRef} (skipped)`)
    console.log(`Patients given >=1 Z-code:   ${patientsWithAnyZ}`)
    console.log(`EOBs modified:               ${modifiedEobs}`)
    console.log(`Total Z-codes injected:      ${totalZ}`)
    console.log('\nPer-domain (count / expected at prevalence):')
    for (const d of SDOH_DOMAINS) {
      const expected = (d.prevalence * patientIds.length).toFixed(0)
      console.log(
        `  ${d.domain.padEnd(20)} ${String(domainCounts[d.domain]).padStart(3)}  (~${expected})  ${d.code}`,
      )
    }
    console.log(`\nWrote ${OUT_FILE}`)
  })
}

main()
