# CareThread — Backend (staging copy)

> **What this is:** a *snapshot copy* of the backend files pulled out of the main
> CareThread Next.js repo, grouped in one place so the team can review and plan
> the frontend/backend split. **This is not a running server yet** — see "Status"
> below.

## Why this folder exists

The main app (`CareShareApp`) is a Next.js project that currently does **two jobs
at once**: it serves the user-facing screens *and* runs all the behind-the-scenes
logic (the backend). The plan is to separate those into a **frontend repo** and a
**backend repo (Node.js / TypeScript)**.

This folder is the backend half, copied out so it's easy to see everything that
will move. Node.js is a **runtime**, not a language — these files stay TypeScript;
nothing was translated.

## What's inside

| Folder | What it holds |
|---|---|
| `lib/` | The engine room. Sessions, encryption, the Blue Button / Medicare client, FHIR data transforms, the QR health-sharing (SHL) pipeline, database access (RDS), email. |
| `app/api/` | The 14 API endpoints (the "doors" the frontend calls): login/auth, caregiver magic-link login, fetching FHIR records, and creating/managing SHL share links. |
| `types/` | The shared "shapes" of the data (`fhir.ts`, `session.ts`, `shl.ts`). Used by both frontend and backend — a natural shared package. |
| `scripts/` | One-off command-line tools (`enrich-eob-zcodes.mjs`), run by hand, not part of the live app. |

> **Note on the database:** the live database is **AWS RDS**, accessed through
> `lib/rds.ts`. (Old `prisma/` and `supabase/` schema files from earlier setups
> were intentionally left out of this folder — they were historical leftovers,
> not the source of truth, and kept here would only cause confusion.)

## Status — read before using

- **This is a copy.** The originals still live in the `CareShareApp` repo, which
  runs exactly as before. Editing files here does **not** affect the live app.
- **It does not run on its own yet.** There is no `package.json`, and several
  files still import Next.js-specific helpers (e.g. `next/headers` in
  `lib/session.ts`, and the Next.js route format in `app/api/`). Those few
  touchpoints get swapped when this becomes a standalone service.
- **Don't edit both copies.** To avoid the two copies drifting apart, treat this
  as read-only for review until the team decides to make the split real.

## Next steps to turn this into a real backend

1. Pick a backend framework — leading candidates: **Fastify** (modern, fast,
   pairs with the Zod validation the project already uses) or **NestJS**
   (enforced structure, good for a long-lived healthcare app). Express and Hono
   are lighter-weight alternatives.
2. Add a `package.json` and install the framework + dependencies (`pg`, `qrcode`,
   `@vercel/blob`, etc.).
3. Convert the `app/api/*/route.ts` handlers into the chosen framework's route
   format.
4. Swap the few Next.js-specific imports (cookies, headers) for framework
   equivalents.
5. Decide how the frontend and backend talk: HTTP APIs over the same parent
   domain, with the login-session cookie shared securely across both
   (CORS + `HttpOnly`/`Secure`/`SameSite` cookie settings).

---

*Generated as a planning aid. Patient data (PHI) is never stored in this folder —
it lives in the AWS RDS database and is only ever transmitted over HTTPS.*
