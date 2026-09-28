// "Ask Homeward" — a small, strictly-grounded Q&A widget on the patient dashboard.
//
// This is NOT a second path around the Layer A/Layer B safety logic in lib/deviation.ts.
// It answers plain-language questions about the PATIENT'S OWN PLAN ("can I shower today?",
// "when's my next dose?") from two sources only: this patient's extracted DischargeData and
// the curated KB (lib/rag.ts) — never general model knowledge, and it never assesses how the
// patient is currently doing.
//
// Two-layer design, deliberately mirroring lib/deviation.ts's own pattern:
// - Fixed, deterministic guards (zero model calls) run first, before any LLM call:
//     - looksSymptomRelated catches symptom/health-status questions, redirecting to the
//       check-in form.
//     - looksLikeTermExplanation catches general medical-term/drug-mechanism questions
//       ("what does Amoxicillin do?", "what are sutures?") that have a definite general
//       answer but aren't specific to this patient's plan — redirecting to a
//       pharmacist/provider instead of letting the model show off what it knows.
//   Both guards are intentionally over-inclusive — a benign plan question wrongly redirected
//   costs the patient one extra click; a symptom or term question wrongly answered by an LLM
//   is the failure mode this whole feature exists to prevent. Don't narrow either without
//   re-reading this comment.
// - The system prompt below repeats both instructions (never assess a symptom, never explain
//   a general medical term, redirect instead) as defense in depth for anything that slips past
//   the guards, and separately instructs the model to say "I don't have that information"
//   rather than guess when the plan/KB context doesn't cover the question.
//
// Zero-key behavior: when no chat provider is configured, answerHomewardQuestion() falls back
// to templateAnswer(), a deterministic keyword-to-field lookup over the patient's own
// DischargeData — degraded (it can't handle open-ended phrasing), but still grounded and
// still honest about what it doesn't know, same contract as every other LLM-optional stage.
//
// Conversation history: the LLM path is genuinely multi-turn — answerHomewardQuestion() takes
// prior turns and threads them into the chatCompletion() call as alternating user/assistant
// messages ahead of the current question, so a follow-up like "what if I don't?" can resolve
// against what was just discussed. templateAnswer() stays single-turn by nature — it's a
// keyword-to-field lookup, not something history can improve — so history is not passed to it.

import { chatCompletion, isAnyChatProviderConfigured } from "./llm";
import { queryKnowledgeBase } from "./rag";
import type { AskHomewardResponse, AskHomewardTurn, DischargeData } from "./types";

// Bounds how much prior conversation gets replayed into each call — a long-running session
// shouldn't grow the prompt (and cost) unboundedly. 20 messages is ~10 back-and-forth turns.
const MAX_HISTORY_MESSAGES = 20;

const DISCLAIMER =
  "Ask Homeward answers only from your own plan and general recovery guides — it never diagnoses. For how you're feeling right now, use today's check-in.";

const REDIRECT_MESSAGE =
  "That sounds like something to log in today's check-in so it can be assessed properly — I'm not able to judge symptoms or how you're feeling.";

const TERM_MESSAGE =
  "That's a general medical question rather than something specific to your plan — it's best to ask your pharmacist or care provider, since I only have information about your specific recovery plan, not general medical explanations.";

const UNKNOWN_MESSAGE =
  "That's not something I have information on for your specific plan — please check with your care team.";

// ---------------------------------------------------------------------------
// Deterministic guard — no model call. Deliberately over-inclusive (see file header).
// ---------------------------------------------------------------------------

const SYMPTOM_PATTERNS: RegExp[] = [
  // Direct symptom/status words.
  /\bfever\b/i,
  /\btemperature\b/i,
  /\bpain\b/i,
  /\bhurts?\b/i,
  /\bhurting\b/i,
  /\bache[sd]?\b/i,
  /\baching\b/i,
  /\bbleed(ing)?\b/i,
  /\bblood\b/i,
  /\bswoll?en\b/i,
  /\bswelling\b/i,
  /\bredness\b/i,
  /\bpus\b/i,
  /\boozing\b/i,
  /\binfect(ed|ion)?\b/i,
  /\bdizz(y|iness)\b/i,
  /\bfaint(ing)?\b/i,
  /\bconfus(ed|ion)\b/i,
  /\bnause(a|ous)\b/i,
  /\bvomit(ing)?\b/i,
  /\bbreath(e|ing)?\b/i,
  /\bshortness of breath\b/i,
  /\bchest pain\b/i,
  /\bnumb(ness)?\b/i,
  /\britchy|itching\b/i,
  /\brash\b/i,
  /\bworse|worsening\b/i,
  /\bsick\b/i,
  // Health-status framing patterns.
  /\bshould i (be )?worr(y|ied)\b/i,
  /\bis (this|it|that) normal\b/i,
  /\bis (this|it|that) bad\b/i,
  /\bis (this|it|that) ok(ay)?\b/i,
  /\bam i (ok(ay)?|fine|alright)\b/i,
  /\bdo i have\b/i,
  /\bcould this be\b/i,
  /\bdoes this mean\b/i,
  /\bis (it|this) serious\b/i,
  /\bis (it|this) an emergency\b/i,
  /\bwhat'?s wrong with me\b/i,
  /\bhow bad is\b/i,
  /\bi feel\b/i,
  /\bi'?m feeling\b/i,
  /\bi am feeling\b/i,
];

/**
 * True if the question describes or asks about a current symptom or how the patient is
 * doing right now, rather than a plain fact about their plan. See file header for why this
 * is deliberately over-inclusive and runs before any model call.
 */
export function looksSymptomRelated(question: string): boolean {
  return SYMPTOM_PATTERNS.some((pattern) => pattern.test(question));
}

// A bare "my"/"mine"/"i" marks the question as being about THIS patient's own plan
// ("what's my dose", "what was I told") rather than a general term — those are left to the
// normal plan-question path, never this guard.
const PLAN_SELF_REFERENCE_PATTERN = /\b(my|mine|i)\b/i;

const TERM_EXPLANATION_PATTERNS: RegExp[] = [
  // "what is/are X" — a definition question, not a fact lookup, once self-reference is ruled out.
  /^\s*what\s+(is|are)\b/i,
  // "what does X do/mean/work/treat"
  /\bwhat\s+(does|do)\s+.+\s+(do|mean|work|treat)\b/i,
  /\bhow\s+does\s+.+\s+work\b/i,
  /\b(explain|define)\b/i,
];

/**
 * True if the question asks for a general medical/drug/term explanation ("what does
 * Amoxicillin do?", "what are sutures?") rather than a fact about this patient's own plan.
 * Deliberately over-inclusive and runs before any model call — see file header. Skips
 * anything with a self-referencing pronoun ("my", "I") since those are almost always plan
 * questions ("what's my dose"), not term-definition questions.
 */
export function looksLikeTermExplanation(question: string): boolean {
  if (PLAN_SELF_REFERENCE_PATTERN.test(question)) return false;
  return TERM_EXPLANATION_PATTERNS.some((pattern) => pattern.test(question));
}

// ---------------------------------------------------------------------------
// Deterministic template fallback — used with zero API keys, or if every LLM tier fails.
// ---------------------------------------------------------------------------

function templateAnswer(discharge: DischargeData, question: string): string {
  const q = question.toLowerCase();

  if (/\bshower|bath(ing)?|wash(ing)?|wet|swim/i.test(q)) {
    return discharge.woundCareInstructions.length > 0
      ? `Your plan's wound care instructions: ${discharge.woundCareInstructions.join("; ")}.`
      : UNKNOWN_MESSAGE;
  }
  if (/\bdose|medication|medicine|pill|prescription\b/i.test(q)) {
    return discharge.medications.length > 0
      ? `Your medications: ${discharge.medications
          .map((m) => `${m.name} — ${m.dosage}, ${m.frequency}${m.duration ? ` (${m.duration})` : ""}`)
          .join("; ")}.`
      : UNKNOWN_MESSAGE;
  }
  if (/\blift(ing)?|exercise|activity|work ?out|driv(e|ing)\b/i.test(q)) {
    return discharge.activityRestrictions.length > 0
      ? `Your activity restrictions: ${discharge.activityRestrictions.join("; ")}.`
      : UNKNOWN_MESSAGE;
  }
  if (/\bfollow.?up|appointment|next visit|see (my|the) (doctor|provider)\b/i.test(q)) {
    if (!discharge.followUpDate) return UNKNOWN_MESSAGE;
    return `Your follow-up is on ${discharge.followUpDate}${discharge.followUpLocation ? ` at ${discharge.followUpLocation}` : ""}.`;
  }
  if (/\bwarning sign|watch for|look out for|red flag\b/i.test(q)) {
    return discharge.doctorStatedWarningSigns.length > 0
      ? `Your doctor's warning signs to watch for: ${discharge.doctorStatedWarningSigns.join("; ")}.`
      : UNKNOWN_MESSAGE;
  }
  if (/\bdiagnosis|procedure|surgery|what (happened|did i have)\b/i.test(q)) {
    return discharge.diagnosis || discharge.procedureType
      ? `Your plan lists: ${discharge.diagnosis || "no diagnosis recorded"}${discharge.procedureType ? ` (${discharge.procedureType})` : ""}.`
      : UNKNOWN_MESSAGE;
  }
  return UNKNOWN_MESSAGE;
}

// ---------------------------------------------------------------------------
// LLM path — grounded strictly in this patient's plan + curated KB.
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are "Ask Homeward," a small assistant answering ONE patient's questions about
their OWN recovery plan. Follow these rules exactly:

1. Answer only using the PLAN CONTEXT and KNOWLEDGE BASE CONTEXT given in the user message.
Never use general medical knowledge, and never invent a detail that isn't in that context.

2. You are not a diagnostic tool and must never assess, diagnose, or reassure about a symptom
or how the patient is feeling right now (fever, pain, wound appearance, bleeding, dizziness,
etc). If the question describes or asks about a current symptom or how they're doing, do not
answer it — respond only with: "${REDIRECT_MESSAGE}"

3. Never explain a general medical term, drug mechanism, or health concept (e.g. "what does
Amoxicillin do?", "what are sutures?", "what does hydration mean?"), even if you know the
answer. That knowledge is real but out of scope for this tool — respond only with:
"${TERM_MESSAGE}"

4. If the plan/KB context doesn't cover the question, say so honestly — respond with:
"${UNKNOWN_MESSAGE}" — do not guess or extrapolate.

5. Otherwise, answer briefly (1-3 sentences) in plain language, grounded in the plan/KB
context provided.

Respond with plain text only — no JSON, no markdown, no preamble.`;
}

function buildUserMessage(discharge: DischargeData, kbContext: string, question: string): string {
  const planContext = `PLAN CONTEXT:
Diagnosis: ${discharge.diagnosis || "not recorded"}
Procedure: ${discharge.procedureType || "not recorded"}
Discharge date: ${discharge.dischargeDate}
Follow-up: ${discharge.followUpDate ? `${discharge.followUpDate}${discharge.followUpLocation ? ` at ${discharge.followUpLocation}` : ""}` : "not recorded"}
Medications: ${
    discharge.medications.length > 0
      ? discharge.medications
          .map((m) => `${m.name} — ${m.dosage}, ${m.frequency}${m.duration ? ` (${m.duration})` : ""}`)
          .join("; ")
      : "none recorded"
  }
Wound care instructions: ${discharge.woundCareInstructions.join("; ") || "none recorded"}
Activity restrictions: ${discharge.activityRestrictions.join("; ") || "none recorded"}
Doctor-stated warning signs: ${discharge.doctorStatedWarningSigns.join("; ") || "none recorded"}`;

  return `${planContext}

KNOWLEDGE BASE CONTEXT:
${kbContext || "none relevant"}

Patient's question: ${question}`;
}

async function llmAnswer(
  discharge: DischargeData,
  question: string,
  history: AskHomewardTurn[],
): Promise<string | null> {
  const kbMatches = await queryKnowledgeBase(question, 2);
  const kbContext = kbMatches
    .map((m) => `- ${m.doc.title}: ${m.doc.content}`)
    .join("\n");

  // Prior turns go in as plain role/content pairs (no repeated plan/KB context per turn —
  // that would just bloat every historical message with duplicate data); the plan/KB grounding
  // is only attached once, to the current question, via buildUserMessage below.
  const result = await chatCompletion(
    [
      { role: "system", content: buildSystemPrompt() },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: buildUserMessage(discharge, kbContext, question) },
    ],
    { temperature: 0.2, maxTokens: 300 },
  );

  console.info(`Ask Homeward answered via ${result.provider} (${result.model}).`);

  const text = result.text.trim();
  return text.length > 0 ? text : null;
}

// Substring, not exact-match: the deterministic guard is the real safety net (it decides
// BEFORE any model call and is never bypassable), so this only decides which UI treatment
// the rare LLM-only redirect/unknown gets — a model reproducing the instructed message with
// slightly different punctuation shouldn't fall through to being labeled a plain "answer".
function classify(answer: string): AskHomewardResponse["type"] {
  if (answer.includes("log in today's check-in")) return "redirect";
  if (answer.includes("pharmacist or care provider")) return "term";
  if (answer.includes("check with your care team")) return "unknown";
  return "answer";
}

/**
 * Main entry point for app/api/ask/route.ts. Runs the deterministic symptom and
 * term-explanation guards first (no model call, never bypassable by the LLM), then answers
 * from the LLM (grounded in this patient's plan + curated KB, with prior turns for
 * conversational follow-ups) or the deterministic template if no provider is configured or
 * every tier fails — a failure is logged, never swallowed silently, so a degraded answer is
 * visible in the server logs rather than looking identical to a normal template response.
 */
export async function answerHomewardQuestion(
  discharge: DischargeData,
  question: string,
  history: AskHomewardTurn[] = [],
): Promise<AskHomewardResponse> {
  if (looksSymptomRelated(question)) {
    return { answer: REDIRECT_MESSAGE, type: "redirect", disclaimer: DISCLAIMER, generatedBy: "template" };
  }

  if (looksLikeTermExplanation(question)) {
    return { answer: TERM_MESSAGE, type: "term", disclaimer: DISCLAIMER, generatedBy: "template" };
  }

  if (isAnyChatProviderConfigured()) {
    const boundedHistory = history.slice(-MAX_HISTORY_MESSAGES);
    try {
      const answer = await llmAnswer(discharge, question, boundedHistory);
      if (answer) {
        return { answer, type: classify(answer), disclaimer: DISCLAIMER, generatedBy: "llm" };
      }
      console.error("Ask Homeward: LLM call returned an empty response — falling back to template.");
    } catch (err) {
      console.error(
        "Ask Homeward: LLM call failed — falling back to template.",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const answer = templateAnswer(discharge, question);
  return { answer, type: classify(answer), disclaimer: DISCLAIMER, generatedBy: "template" };
}
