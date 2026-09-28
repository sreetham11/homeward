# Homeward

A caregiver-in-the-loop aftercare recovery assistant. Converts a messy hospital
discharge summary into a structured, trackable day-by-day recovery plan for a patient and
their caregiver, with daily check-ins (text + wound photo) that flag when something looks
abnormal enough to escalate to a real provider.

Built for a C240 (AI Essentials & Innovations) polytechnic module — a working FA prototype
that runs cleanly with minimal setup and degrades gracefully with zero API keys.

## Non-negotiable design principle

**The AI extracts and tracks. The patient's own doctor's instructions are the source of
truth. Homeward never diagnoses.** Any ambiguous or concerning signal routes to a human
(caregiver or provider) — never a verdict from the app itself. Every escalation/reassurance
output carries a visible "not a diagnosis" disclaimer (see `DISCLAIMER` in
`app/api/escalate/route.ts` and the banner in `components/RecoveryTracer.tsx`).

This mirrors a sister project, TRIAX (clinical intake triage): "the AI drafts, the nurse
decides." Here: the AI extracts and compares, the human decides.

## The five-stage pipeline

Each stage is its own API route, backed by a corresponding `lib/` module. Client components
call them in sequence rather than one route calling another over HTTP.

| Stage | Route | Logic lives in | Job |
|---|---|---|---|
| 1. Parse | `app/api/parse` | `lib/parser.ts` | Discharge doc/photo → structured `DischargeData` JSON |
| 2. Plan | `app/api/plan` | `lib/planBuilder.ts` | `DischargeData` → day-by-day `RecoveryPlan` |
| 3. Check-in | `app/api/checkin` | `lib/woundVision.ts` | Daily check-in intake + wound photo → objective description |
| 4. Deviation | `app/api/deviation` | `lib/deviation.ts` | Check-in vs. universal red flags + this patient's own plan |
| 5. Escalate | `app/api/escalate` | inline in the route | Structured summary for caregiver/provider, or calm reassurance |

`components/RecoveryTracer.tsx` orchestrates stages 3→4→5 on check-in submit, so a judge can
watch each stage's response in the network tab independently.

## The two-layer deviation logic (the safety-critical core)

`lib/deviation.ts`, tested in `lib/deviation.test.ts`. **Read this before touching that file.**

- **Layer A — fixed, hardcoded, zero model calls.** Five pure functions
  (`checkFever`, `checkBleeding`, `checkBreathingDifficulty`, `checkChestPain`,
  `checkConfusionOrFainting`) over **structured** `CheckinInput` fields — temperature is a
  number, bleeding is an enum, breathing/chest-pain/confusion are booleans. Not free text.
  This was a deliberate call: a hardcoded safety rule that's supposed to always win must not
  depend on regexing prose for "no chest pain" vs. "chest pain." `ConversationalCheckin.tsx`
  collects these as **fixed-choice buttons/pills** (one question per chat step), never free
  text — temperature is a three-way button ("Below 38°C" / "38°C or higher" / "haven't
  checked") mapped to a representative number, bleeding is its enum, breathing/chest/confusion
  are Yes/No. Fever threshold is `>38.0°C` (not `>=`), see `lib/deviation.ts`'s
  `FEVER_THRESHOLD_C`; the "38°C or higher" button maps above it so `checkFever` fires exactly
  as before.

- **Layer B — dynamic, per-patient.** Compares free text (wound description, notes, and the
  wound-photo description from `lib/woundVision.ts`) against **this specific patient's**
  `doctorStatedWarningSigns` (and, only when a wound signal is present, their
  `woundCareInstructions`) from Stage 1. LLM-assisted when a chat provider is configured
  (`runLayerB` → `llmMatch`); falls back to a conservative keyword-overlap heuristic
  (`keywordFallbackMatch`) with zero keys, so Layer B still produces best-effort matches
  offline — degraded relevance, same behavior contract.

- **Combination rule:** `escalate = layerA.length > 0 || layerB.length > 0`. Layer A firing
  is never suppressed by Layer B being calm, and vice versa — both are independent triggers,
  enforced structurally (there's no code path where one layer's output can veto the other).
  `lib/deviation.test.ts` has an explicit test for this ("Layer A firing is never suppressed
  by an otherwise calm Layer B").

- **Wound photos:** `lib/woundVision.ts` calls Gemini vision directly (not the failover
  chain — only Gemini does multimodal here) for an **objective description only** — redness,
  swelling, discharge, dressing state. The prompt explicitly forbids the word "infected" or
  any verdict. That description is then fed into Layer B's text comparison, never treated as
  a standalone diagnosis.

## Knowledge base strategy — curated first, domain-locked search only as fallback

This is the explicit fix for "your retrieval source is uncontrolled":

1. **Primary:** `lib/rag.ts` queries a small curated set of 16 patient-education documents
   (`lib/kb/documents.ts`) spanning surgical wound care, RICE, dengue/viral fever, medication
   adherence, C-section, diabetic foot wounds, cardiac procedures (angioplasty/bypass),
   concussion, elderly falls, pneumonia, hip/knee replacement, and pediatric day surgery
   (tonsillectomy), among others. Each document is an **original paraphrase written for this
   project** — never copied sentences or mirrored structure — of a real, named public
   patient-education page (MedlinePlus/NIH preferred; Singapore public-health sources such as
   the Communicable Diseases Agency and HealthXchange.sg for region-specific topics like
   dengue). The exact source title, publisher, and URL are recorded in each document's
   `source` field, e.g. `'Paraphrased from MedlinePlus (U.S. National Library of Medicine):
   "Surgical wound care - closed" (medlineplus.gov/ency/patientinstructions/000738.htm)'` —
   this is a curated, auditable set, not a scrape or verbatim copy. Retrieval is real pgvector
   cosine search via Supabase when both Supabase and `GEMINI_API_KEY` are configured
   (`lib/kb/seed.ts` embeds and upserts the documents; `supabase/schema.sql` defines the table
   + `match_kb_documents()` RPC); otherwise it's a keyword-overlap search over the same
   in-memory document list — same curated set, degraded ranking, zero setup required.
   `lib/rag.test.ts` exercises the keyword-fallback path against a realistic query for every
   one of the 16 topics — run it (`npm test`) after editing `lib/kb/documents.ts`.
2. **Fallback only:** `lib/exa.ts` is called **only** when the curated KB returns no match
   (see `gatherReferences()` in `app/api/escalate/route.ts`), and is hard-locked to
   `includeDomains: ["moh.gov.sg", "healthhub.sg", "nhs.uk", "mayoclinic.org"]`. It is never
   used as open web search.

References returned by either path are supporting color in the escalation summary — **never**
the basis for the escalate/no-escalate decision, which comes entirely from `lib/deviation.ts`.

## "Ask Homeward" — a small, strictly-grounded Q&A widget, not a second safety path

A collapsible widget on the patient dashboard (`components/AskHomeward.tsx`, floating
bottom-right, closed by default) lets a patient ask plain-language questions about their own
plan — "Can I shower today?", "When's my next dose?" — without re-reading the discharge
document. All logic lives in `lib/askHomeward.ts`; `app/api/ask/route.ts` is a thin wrapper,
matching the pattern of every other stage in this project.

This is explicitly **not** a sixth pipeline stage and **not** a second, unmonitored route
around the Layer A/Layer B safety logic in `lib/deviation.ts`:

- **Grounding only:** every answer is built from (a) this specific patient's own
  `DischargeData` (medications, wound care, restrictions, follow-up, their own warning signs)
  and (b) `lib/rag.ts`'s curated KB — never general model knowledge. The system prompt in
  `lib/askHomeward.ts` instructs the model to say so honestly ("that's not something I have
  information on for your specific plan") rather than guess when the plan/KB context doesn't
  cover the question.
- **Symptom questions are refused, not answered.** `looksSymptomRelated()` is a fixed,
  deterministic keyword/pattern guard (zero model calls) that runs *before* any LLM call and
  redirects anything symptom- or status-related ("is this fever bad?", "should I be
  worried?") to a fixed message pointing at today's check-in — it never reaches the model.
  This mirrors Layer A's "hardcoded, always wins, not the LLM's call to make" design on
  purpose. The system prompt repeats the same instruction as defense in depth for edge
  phrasing that slips past the guard, but the guard — not the prompt — is the real safety
  net; see the file header in `lib/askHomeward.ts` before narrowing its pattern list.
- **Zero-key fallback:** with no chat provider configured, `answerHomewardQuestion()` falls
  back to a deterministic keyword-to-field lookup over the patient's own `DischargeData` —
  degraded, but still grounded and still honest, same contract as every other LLM-optional
  stage in this project.
- `lib/askHomeward.test.ts` covers the guard (symptom vs. plan questions) and the zero-key
  template path — run it (`npm test`) before touching `lib/askHomeward.ts`.

## Multi-provider LLM layer — `lib/llm.ts`

Failover chain: **Groq (free, default) → OpenAI → Gemini → Grok (xAI) → Tencent Hunyuan**. All
five are called through the same `openai` SDK client with a different `baseURL`/`apiKey`/model
per tier (Gemini and Hunyuan each via their own OpenAI-compatible endpoint) — that's what makes
`chatCompletion()` one generic function instead of five bespoke integrations. A provider with no API key set is
skipped, not attempted; a configured provider that errors falls through to the next tier.
If every tier is unavailable, `chatCompletion()` throws `LLMUnavailableError`, and every
caller (`planBuilder.ts`, `deviation.ts`, `escalate/route.ts`) catches that and drops to a
local deterministic/templated fallback — the app still produces a full plan and full
check-in flow with **zero API keys configured**.

Gemini is also called **directly**, bypassing this chain entirely, via `callGeminiVision()` —
used by `lib/parser.ts` (photo discharge parsing) and `lib/woundVision.ts` (wound photo
description), since multimodal input needs a vision-capable model that the OpenAI-compatible
text tiers don't provide here.

Override default models per provider via `GROQ_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` /
`XAI_MODEL` / `HUNYUAN_MODEL` env vars if a default model name goes stale.

## Patient/caregiver linking — recovery codes, not accounts

No formal auth. `app/api/plan` mints a short recovery code (`generateRecoveryCode()` in
`lib/planStore.ts`, 6 chars, ambiguous characters like `0/O/1/I` excluded) when a plan is
created. Sharing that code (`/patient?code=XXXXXX` ↔ `/caregiver?code=XXXXXX`) is what links
the two views — no email, no password, no magic link, so there's no dependency on email
delivery (`RESEND_API_KEY`) for the core demo flow. This was a deliberate simplification for
the FA prototype; `supabase/schema.sql` leaves RLS open behind the recovery code as a shared
secret and says explicitly not to use it as-is for real patient data.

## Sync: Supabase Realtime vs. localStorage + BroadcastChannel

`lib/planStore.ts` has two independent halves:
- **Server-side** (`persistPlanServer`, `persistCheckinServer`, `persistEscalationServer`,
  `fetchPlanServer`, `fetchCheckinsServer`, `fetchEscalationsServer`) — Supabase only, silent
  no-ops when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't set. API
  routes always return the full object in the response regardless, so the client can persist
  it itself.
- **Client-side** (`saveLocalPlan`, `appendLocalCheckin`, `appendLocalEscalation`,
  `readLocalState`, `subscribeToRecoveryCode`) — when Supabase is configured, live updates
  come from Supabase Realtime (works across devices — patient's phone, caregiver's phone).
  When it isn't, state lives in `localStorage` under `homeward:<code>` and a `BroadcastChannel`
  notifies other same-origin tabs — the zero-setup demo path where patient and caregiver
  views are two browser tabs on one laptop.

`components/RecoveryTracer.tsx`'s `loadState()` prefers server data when Supabase has any,
falls back to local state otherwise — see that function if cross-device sync looks stale.

## Env setup

Copy `.env.local.example` to `.env.local`. Every key is optional; each unlocks one
integration and the app is designed to demo fully with **zero keys set** (Layer A rules
still run, plan generation falls back to templates, RAG falls back to keyword search, sync
falls back to BroadcastChannel). See the comments in `.env.local.example` for exactly what
each key does and what happens without it.

Quick start:

```bash
npm install
npm run dev        # http://localhost:3000, works with zero env vars
npm test           # deviation.test.ts, rag.test.ts, askHomeward.test.ts — run before touching any of those files
npm run typecheck
```

Optional, if you have Supabase + Gemini keys and want real pgvector search / cross-device
sync instead of the local fallbacks:

```bash
# 1. Run supabase/schema.sql against your Supabase project (SQL editor or CLI)
# 2. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
npm run seed:kb     # embeds lib/kb/documents.ts into Supabase's kb_documents table
```

## Where things live (quick map)

```
app/
  api/parse|plan|checkin|deviation|escalate/route.ts   # the five pipeline stages
  api/ask/route.ts                                      # "Ask Homeward" widget — thin wrapper, see lib/askHomeward.ts
  api/status/route.ts                                   # debug: which integrations are live
  page.tsx                                               # onboarding: upload → parse → review → create plan
  patient/page.tsx, caregiver/page.tsx                   # thin wrappers around RecoveryTracer
lib/
  llm.ts            # multi-provider failover + direct Gemini vision
  parser.ts         # Stage 1
  planBuilder.ts     # Stage 2
  deviation.ts       # Stage 4 — THE SAFETY-CRITICAL FILE, read before editing
  deviation.test.ts  # run before and after any deviation.ts change
  woundVision.ts     # objective wound photo description, never diagnoses
  rag.ts, exa.ts      # curated KB first, domain-locked fallback second
  kb/documents.ts     # the 16 curated documents, paraphrased from real cited sources (source of truth, also seeds Supabase)
  rag.test.ts         # keyword-fallback retrieval check for all 16 KB topics — run after editing kb/documents.ts
  kb/seed.ts          # embeds + upserts kb/documents.ts into Supabase
  planStore.ts        # server (Supabase) + client (localStorage/BroadcastChannel) persistence
  askHomeward.ts       # "Ask Homeward" widget logic — symptom guard + grounded Q&A, see its file header
  askHomeward.test.ts   # covers the symptom guard and zero-key template path
  types.ts            # shared types across every stage — read this first when in doubt
components/
  RecoveryTracer.tsx   # main client island: loads state, orchestrates checkin→deviation→escalate
  PlanTimeline.tsx      # day-by-day plan view
  ConversationalCheckin.tsx  # chat-style check-in: one fixed-choice question per step (see Layer A note); assembles the same CheckinInput, delivers the pipeline result as its closing message; id="checkin-form" is the Ask Homeward redirect target
  CaregiverAlert.tsx      # renders an EscalationSummary (caregiver view)
  AskHomeward.tsx         # patient-only floating Q&A widget, collapsed by default
supabase/schema.sql   # kb_documents (+ pgvector match fn) and recovery_plans/checkins/escalations
```

## Known simplifications (student FA prototype, not production)

- No auth — recovery codes are a shared secret, not a credential.
- Supabase RLS is open; do not point this at real patient data as-is.
- Medication reminder times and duration are parsed from free-text frequency/duration
  strings with a small heuristic (`lib/planBuilder.ts`) — reasonable common phrasings only.
- `RESEND_API_KEY` (email notifications) and `UPSTASH_REDIS_REST_URL`/`_TOKEN` (check-in
  session state) are scaffolded in `.env.local.example` and `package.json` per the original
  tech stack but not yet wired to any route in this app — the check-in pipeline is stateless
  request/response today, and escalation summaries surface in-app only (`CaregiverAlert`).
  An optional caregiver email *is* captured at plan creation (`components/OnboardingFlow.tsx`,
  `RecoveryPlan.caregiverEmail` in `lib/types.ts`) and returned by `/api/silence-check`
  (`lib/silenceCheck.ts`) for an external workflow (e.g. n8n) to actually send with — this app
  itself never calls Resend directly.
