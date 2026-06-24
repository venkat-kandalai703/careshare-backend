import { query } from '@/lib/rds'

export interface CaregiverProfileInput {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  authUserId?: string
  consentedAt?: string
}

export async function upsertCaregiverProfile(input: CaregiverProfileInput): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!email) return

  await query(
    `
      insert into public.caregivers (email, first_name, last_name, phone, updated_at)
      values ($1, $2, $3, $4, now())
      on conflict (email)
      do update set
        first_name = coalesce(excluded.first_name, public.caregivers.first_name),
        last_name = coalesce(excluded.last_name, public.caregivers.last_name),
        phone = coalesce(excluded.phone, public.caregivers.phone),
        updated_at = now()
    `,
    [
      email,
      input.firstName || null,
      input.lastName || null,
      input.phone || null,
    ],
  )
}

export async function getCaregiverProfile(email: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return null

  const result = await query<{
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    created_at: Date
    updated_at: Date
  }>(
    `
      select email, first_name, last_name, phone, created_at, updated_at
      from public.caregivers
      where email = $1
      limit 1
    `,
    [normalizedEmail],
  )

  return result.rows[0] || null
}

export async function caregiverExists(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return false

  const result = await query<{ exists: boolean }>(
    'select exists(select 1 from public.caregivers where email = $1)',
    [normalizedEmail],
  )

  return result.rows[0]?.exists === true
}

export async function createCaregiverMagicLink(email: string, token: string, expiresAt: Date) {
  await query(
    `
      insert into public.caregiver_magic_links (email, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [email.trim().toLowerCase(), token, expiresAt],
  )
}

export async function consumeCaregiverMagicLink(tokenHash: string): Promise<string | null> {
  const result = await query<{ email: string }>(
    `
      update public.caregiver_magic_links
      set used_at = now()
      where token_hash = $1
        and used_at is null
        and expires_at > now()
      returning email
    `,
    [tokenHash],
  )

  return result.rows[0]?.email || null
}

export async function createCaregiverSession(email: string, tokenHash: string, expiresAt: Date) {
  await query(
    `
      insert into public.caregiver_sessions (email, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [email.trim().toLowerCase(), tokenHash, expiresAt],
  )
}

export async function getCaregiverSessionByToken(tokenHash: string) {
  const result = await query<{ email: string }>(
    `
      select email
      from public.caregiver_sessions
      where token_hash = $1
        and expires_at > now()
      limit 1
    `,
    [tokenHash],
  )

  return result.rows[0] || null
}
