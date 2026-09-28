-- Homeward Supabase schema. Optional: the app runs without any of this configured (see
-- lib/rag.ts and lib/planStore.ts for the corresponding fallbacks). Run this once against a
-- Supabase project, then `npm run seed:kb` to populate kb_documents.

create extension if not exists vector;
create extension if not exists pgcrypto; -- for gen_random_uuid()

-- Curated RAG knowledge base (lib/rag.ts, lib/kb/documents.ts, lib/kb/seed.ts).
-- 3072 dimensions matches Gemini's gemini-embedding-001 model's default output size
-- (text-embedding-004, a smaller/older model, is not available on the API version this
-- project's key resolves to — confirmed via a live ListModels call). No ivfflat index:
-- pgvector's ivfflat can't index vectors over 2000 dimensions, and with only ~8 curated
-- documents a brute-force scan is instant anyway, so an index would add nothing.
create table if not exists kb_documents (
  id text primary key,
  title text not null,
  source text not null,
  condition text[] not null default '{}',
  content text not null,
  embedding vector(3072)
);

create or replace function match_kb_documents(query_embedding vector(3072), match_count int default 3)
returns table (id text, title text, source text, condition text[], content text, similarity float)
language sql stable
as $$
  select id, title, source, condition, content, 1 - (embedding <=> query_embedding) as similarity
  from kb_documents
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Patient/caregiver linked recovery state (lib/planStore.ts).
-- recovery_code is the short code a caregiver enters to join a patient's plan — see the
-- "Linking" decision in CLAUDE.md for why this is a code instead of formal auth.
create table if not exists recovery_plans (
  recovery_code text primary key,
  patient_id text not null,
  discharge_data jsonb not null,
  days jsonb not null,
  generated_by text not null,
  created_at timestamptz not null default now(),
  -- Optional, caregiver-supplied at plan creation (components/OnboardingFlow.tsx). Nullable —
  -- the app works identically whether or not it's set. Read by lib/silenceCheck.ts to address
  -- the silence-detection notification (RESEND_API_KEY / the n8n email workflow).
  caregiver_email text
);

-- Idempotent migration for a recovery_plans table created before caregiver_email existed —
-- `create table if not exists` above is a no-op against an already-created table.
alter table recovery_plans add column if not exists caregiver_email text;

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  recovery_code text not null references recovery_plans(recovery_code) on delete cascade,
  day_number int not null,
  payload jsonb not null,
  deviation_result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  recovery_code text not null references recovery_plans(recovery_code) on delete cascade,
  day_number int not null,
  summary jsonb not null,
  created_at timestamptz not null default now()
);

-- Lightweight "I'm okay" presence ping (components/PresencePingButton.tsx, app/api/presence-ping).
-- Deliberately its own tiny append-only table, not a column on checkins: a presence ping is
-- NOT a check-in — it never runs Layer A/B (lib/deviation.ts) and never carries CheckinInput
-- data, it only proves the patient is present. lib/silenceCheck.ts treats the more recent of a
-- checkins row or a presence_pings row as "last activity" for silence detection, while
-- neverCheckedIn (and the caregiver-facing day timeline) still only look at real checkins rows,
-- so "confirmed okay" and "did a full check-in" stay visibly distinct — see CLAUDE.md.
create table if not exists presence_pings (
  id uuid primary key default gen_random_uuid(),
  recovery_code text not null references recovery_plans(recovery_code) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists checkins_recovery_code_idx on checkins (recovery_code);
create index if not exists escalations_recovery_code_idx on escalations (recovery_code);
create index if not exists presence_pings_recovery_code_idx on presence_pings (recovery_code);

-- Enable Realtime so the caregiver dashboard gets live updates when a patient checks in.
alter publication supabase_realtime add table recovery_plans;
alter publication supabase_realtime add table checkins;
alter publication supabase_realtime add table escalations;
alter publication supabase_realtime add table presence_pings;

-- This is a student FA prototype: RLS is intentionally left open (no row-level security
-- policies) behind the recovery_code acting as a shared secret. Do not use this schema
-- as-is for real patient data — add RLS keyed on authenticated patient/caregiver identity
-- before any real deployment.
