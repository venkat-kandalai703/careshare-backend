import { createHash, randomBytes } from 'crypto'
import { Pool, type QueryResultRow } from 'pg'

let pool: Pool | null = null

function sanitizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    url.searchParams.delete('ssl')
    url.searchParams.delete('sslcert')
    url.searchParams.delete('sslkey')
    url.searchParams.delete('sslrootcert')
    return url.toString()
  } catch {
    return connectionString
  }
}

function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL

    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured')
    }

    pool = new Pool({
      connectionString: sanitizeConnectionString(connectionString),
      ssl: {
        rejectUnauthorized: false,
      },
    })
  }

  return pool
}

export function createToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  const result = await getPool().query<T>(text, values)
  return result
}

export async function ensureCaregiverAuthTables() {
  await query(`
    create extension if not exists pgcrypto;

    create table if not exists public.caregiver_magic_links (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );

    create table if not exists public.caregiver_sessions (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create index if not exists caregiver_magic_links_email_idx
      on public.caregiver_magic_links(email);

    create index if not exists caregiver_sessions_email_idx
      on public.caregiver_sessions(email);
  `)
}
