// THE CORE SAFETY LOGIC.
//
// Two layers that must never be conflated:
//
// Layer A — fixed, deterministic, hardcoded, zero model calls. A short list of genuinely
// universal red flags (fever, uncontrolled/worsening bleeding, difficulty breathing, chest
// pain, confusion/fainting) that apply regardless of procedure. These are pure functions
// over structured CheckinInput fields (see lib/types.ts for why those fields are structured
// rather than free text) and ALWAYS win: nothing in Layer B, no LLM opinion, no "calm"
// verdict from anywhere else, can suppress a Layer A flag.
//
// Layer B — dynamic, per-patient. Compares the check-in against THIS patient's own
// doctorStatedWarningSigns (and, for wound photos, woundCareInstructions) extracted in
// Stage 1. This is LLM-assisted when a provider is configured, and falls back to a keyword
// overlap heuristic when it isn't — degraded, but still functional with zero API keys.
//
// Combination rule: escalate = layerA.length > 0 || layerB.length > 0. Layer A firing is
// never overridden by Layer B being calm, and vice versa — both are independent triggers.
// See deviation.test.ts for tests proving every Layer A category escalates in isolation,
// that benign input does not false-positive, and that Layer A cannot be overridden.

import type {
  CheckinInput,
  DeviationResult,
  DischargeData,
  RedFlag,
} from "./types";
import { chatCompletion, extractJsonBlock, isAnyChatProviderConfigured } from "./llm";
import { hasMeaningfulCheckinData } from "./checkinValidation";

// ---------------------------------------------------------------------------
// Layer A — hardcoded, deterministic, no model call.
// ---------------------------------------------------------------------------

const FEVER_THRESHOLD_C = 38.0;

export function checkFever(input: CheckinInput): RedFlag | null {
  if (input.temperatureC == null) return null;
  if (input.temperatureC > FEVER_THRESHOLD_C) {
    return {
      code: "fever",
      source: "layer_a",
      severity: "critical",
      message: `Reported temperature ${input.temperatureC}°C is above the ${FEVER_THRESHOLD_C}°C fever threshold.`,
    };
  }
  return null;
}

export function checkBleeding(input: CheckinInput): RedFlag | null {
  if (input.bleeding === "heavy_or_worsening") {
    return {
      code: "bleeding",
      source: "layer_a",
      severity: "critical",
      message: "Reported bleeding as heavy or worsening.",
    };
  }
  return null;
}

export function checkBreathingDifficulty(input: CheckinInput): RedFlag | null {
  if (input.breathingDifficulty) {
    return {
      code: "breathing_difficulty",
      source: "layer_a",
      severity: "critical",
      message: "Reported difficulty breathing.",
    };
  }
  return null;
}

export function checkChestPain(input: CheckinInput): RedFlag | null {
  if (input.chestPain) {
    return {
      code: "chest_pain",
      source: "layer_a",
      severity: "critical",
      message: "Reported chest pain.",
    };
  }
  return null;
}

export function checkConfusionOrFainting(input: CheckinInput): RedFlag | null {
  if (input.confusionOrFainting) {
    return {
      code: "confusion_or_fainting",
      source: "layer_a",
      severity: "critical",
      message: "Reported confusion or fainting.",
    };
  }
  return null;
}

// Severe pain threshold: a patient reporting 8+ out of 10 pain is a red flag even without
// fever, bleeding, or other symptoms. Null (untouched) is NOT the same as 0 and must never
// trigger this rule.
const SEVERE_PAIN_THRESHOLD = 8;

export function checkPainSevere(input: CheckinInput): RedFlag | null {
  if (input.painLevel == null) return null;
  if (input.painLevel >= SEVERE_PAIN_THRESHOLD) {
    return {
      code: "severe_pain",
      source: "layer_a",
      severity: "critical",
      message: `Reported pain level ${input.painLevel}/10 is at or above the severe-pain threshold (${SEVERE_PAIN_THRESHOLD}).`,
    };
  }
  return null;
}

// Pain jump: a spike of 3+ points compared to the previous check-in is a red flag even if
// the absolute level is below the severe threshold. Only fires when we actually have a
// previous pain level to compare against — the first check-in never triggers this rule.
const PAIN_JUMP_THRESHOLD = 3;

export function checkPainJump(input: CheckinInput, previousCheckin: CheckinInput | null): RedFlag | null {
  if (!previousCheckin) return null;
  if (input.painLevel == null || previousCheckin.painLevel == null) return null;
  const delta = input.painLevel - previousCheckin.painLevel;
  if (delta >= PAIN_JUMP_THRESHOLD) {
    return {
      code: "pain_jump",
      source: "layer_a",
      severity: "critical",
      message: `Reported pain level increased by ${delta} points (from ${previousCheckin.painLevel}/10 to ${input.painLevel}/10) since the previous check-in.`,
    };
  }
  return null;
}

const LAYER_A_RULES = [
  checkFever,
  checkBleeding,
  checkBreathingDifficulty,
  checkChestPain,
  checkConfusionOrFainting,
];

/** Runs every Layer A rule that depends only on the current check-in. Pure, synchronous, no
 * I/O — safe to call on every check-in regardless of LLM/network availability. */
export function runLayerARules(input: CheckinInput): RedFlag[] {
  return LAYER_A_RULES.map((rule) => rule(input)).filter(
    (flag): flag is RedFlag => flag !== null,
  );
}

/** Runs every Layer A rule including those that need the previous check-in. Pure,
 * synchronous, no I/O. The pain-jump rule is skipped when previousCheckin is null (first
 * check-in) — it simply doesn't fire, which is correct: with no baseline to compare against
 * there's no spike to flag. */
export function runLayerARulesWithHistory(
  input: CheckinInput,
  previousCheckin: CheckinInput | null,
): RedFlag[] {
  return [
    ...runLayerARules(input),
    checkPainSevere(input),
    checkPainJump(input, previousCheckin),
  ].filter((flag): flag is RedFlag => flag !== null);
}

// ---------------------------------------------------------------------------
// Layer B — dynamic, per-patient, LLM-assisted with keyword fallback.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "is", "are", "was",
  "were", "be", "been", "it", "its", "this", "that", "with", "for", "as", "if",
  "any", "your", "you", "not", "no", "yes", "day", "days", "may", "will", "can",
  "than", "into", "from", "there", "have", "has", "had",
]);

function significantTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !STOPWORDS.has(t)),
  );
}

interface WatchSignal {
  text: string;
  origin: "warning_sign" | "wound_care_instruction";
}

function buildWatchSignals(discharge: DischargeData, hasWoundSignal: boolean): WatchSignal[] {
  const signals: WatchSignal[] = discharge.doctorStatedWarningSigns.map((text) => ({
    text,
    origin: "warning_sign" as const,
  }));
  // Wound care instructions are only meaningful to compare against when this check-in
  // actually reports on the wound (photo or description) — otherwise there's nothing to
  // compare them to and every instruction would spuriously fail to match.
  if (hasWoundSignal) {
    for (const text of discharge.woundCareInstructions) {
      signals.push({ text, origin: "wound_care_instruction" });
    }
  }
  return signals;
}

/** Offline fallback: flags a watch signal when the check-in text shares enough
 * distinctive vocabulary with it. Deliberately conservative (requires 2+ shared
 * significant words, or a single strong overlap on a short phrase) since this runs with
 * no model in the loop and false positives just mean an unnecessary human review, while
 * false negatives mean a missed signal — err toward flagging. */
function keywordFallbackMatch(signal: WatchSignal, candidateText: string): RedFlag | null {
  const signalTokens = significantTokens(signal.text);
  const candidateTokens = significantTokens(candidateText);
  if (signalTokens.size === 0 || candidateTokens.size === 0) return null;

  const shared = [...signalTokens].filter((t) => candidateTokens.has(t));
  const requiredOverlap = signalTokens.size <= 3 ? 1 : 2;
  if (shared.length < requiredOverlap) return null;

  return {
    code: signal.origin === "warning_sign" ? "warning_sign_match" : "wound_care_deviation",
    source: "layer_b",
    severity: "review",
    message: `Check-in mentions "${shared.join(", ")}" which overlaps with a signal from your discharge plan (keyword match, no AI provider configured).`,
    matchedAgainst: signal.text,
  };
}

interface LlmMatch {
  signalText: string;
  reasoning: string;
}

async function llmMatch(
  signals: WatchSignal[],
  candidateText: string,
): Promise<LlmMatch[] | null> {
  if (signals.length === 0 || candidateText.trim().length === 0) return [];

  const system = `You compare a patient's daily recovery check-in against a short list of
signals taken from THIS patient's own discharge paperwork. You do not diagnose, you do not
guess at conditions, and you do not use outside medical knowledge to invent new warning
signs.

Each signal has an origin, and the origin changes what counts as a real match — matching on
shared vocabulary alone is NOT enough for either kind:

- "warning_sign": something the doctor said to watch FOR (a symptom or event). Flag it only
  if the check-in describes that symptom/event as something the patient is currently
  experiencing or observing right now.
- "wound_care_instruction": something the doctor told the patient TO DO. This is an
  instruction, not a red flag — the patient following it correctly is the expected, GOOD
  outcome and must never be flagged. Flag it ONLY if the check-in indicates the patient did
  NOT follow the instruction (a violation). Mentioning the same topic is not a violation:
  reporting "dressing dry" against the instruction "keep incision dry" is the patient
  confirming they followed it, and must NOT be flagged. Only flag it when the check-in
  describes the opposite of the instruction (e.g. "dressing got wet" or "got the incision wet
  in the shower" against "keep incision dry").

Before including a wound_care_instruction match, explicitly check: does this check-in say the
instruction was violated, or does it say the instruction was followed? Only the first case is
a match. If nothing plausibly matches under these rules, return an empty list. Respond with
strict JSON only:
{"matches": [{"signalText": "<exact signal text copied from the list>", "reasoning": "<one short sentence>"}]}`;

  const user = `Signals from this patient's discharge plan:
${signals.map((s, i) => `${i + 1}. [${s.origin}] ${s.text}`).join("\n")}

Patient's check-in text (may include a wound photo description):
"""${candidateText}"""

Which listed signals, if any, does the check-in text plausibly describe, applying the
warning_sign vs. wound_care_instruction rule above? Only include a signal if there is a real
textual/semantic basis for it — do not include a signal "to be safe," and never flag a
wound_care_instruction signal just because the check-in mentions the same topic; flag it only
if the instruction was violated, not if it was followed.`;

  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0, jsonMode: true },
  );

  const parsed = JSON.parse(extractJsonBlock(result.text)) as { matches?: LlmMatch[] };
  return Array.isArray(parsed.matches) ? parsed.matches : [];
}

export interface LayerBResult {
  flags: RedFlag[];
  mode: "llm" | "keyword_fallback";
}

/**
 * Dynamic per-patient comparison. Tries the LLM chain first; on any failure (including
 * "no provider configured") falls back to the offline keyword heuristic so the app still
 * produces a best-effort Layer B result with zero API keys.
 */
export async function runLayerB(
  checkin: CheckinInput,
  discharge: DischargeData,
  woundVisionDescription?: string,
): Promise<LayerBResult> {
  const hasWoundSignal = Boolean(checkin.woundPhotoBase64 || checkin.woundDescription.trim());
  const signals = buildWatchSignals(discharge, hasWoundSignal);
  const candidateText = [checkin.woundDescription, checkin.notes, woundVisionDescription]
    .filter(Boolean)
    .join(". ");

  if (signals.length === 0 || candidateText.trim().length === 0) {
    return { flags: [], mode: isAnyChatProviderConfigured() ? "llm" : "keyword_fallback" };
  }

  if (isAnyChatProviderConfigured()) {
    try {
      const matches = await llmMatch(signals, candidateText);
      if (matches !== null) {
        const flags: RedFlag[] = matches
          .map((m) => {
            const signal = signals.find((s) => s.text === m.signalText);
            if (!signal) return null;
            const flag: RedFlag = {
              code: signal.origin === "warning_sign" ? "warning_sign_match" : "wound_care_deviation",
              source: "layer_b",
              severity: "review",
              message: `Check-in plausibly matches a signal from your discharge plan: ${m.reasoning}`,
              matchedAgainst: signal.text,
            };
            return flag;
          })
          .filter((f): f is RedFlag => f !== null);
        return { flags, mode: "llm" };
      }
    } catch {
      // fall through to keyword fallback below
    }
  }

  const flags = signals
    .map((signal) => keywordFallbackMatch(signal, candidateText))
    .filter((f): f is RedFlag => f !== null);
  return { flags, mode: "keyword_fallback" };
}

// ---------------------------------------------------------------------------
// Combined evaluation.
// ---------------------------------------------------------------------------

export async function evaluateDeviation(
  checkin: CheckinInput,
  discharge: DischargeData,
  woundVisionDescription?: string,
  previousCheckin?: CheckinInput | null,
): Promise<DeviationResult> {
  const layerAFlags = runLayerARulesWithHistory(checkin, previousCheckin ?? null);
  const layerB = await runLayerB(checkin, discharge, woundVisionDescription);
  const escalate = layerAFlags.length > 0 || layerB.flags.length > 0;

  // A check-in with no meaningful signal must never be reported as "on track" — that reads
  // identically to a genuinely calm day. `!escalate` here is a defensive redundancy, not
  // load-bearing: hasMeaningfulCheckinData being false already implies no Layer A rule could
  // have fired (they all require a real field), so escalate is already false in this branch.
  // Keeping the check explicit means this stays correct even if a future Layer A rule is
  // added that doesn't route through the same gate.
  const insufficientData = !hasMeaningfulCheckinData(checkin) && !escalate;

  return {
    escalate,
    layerAFlags,
    layerBFlags: layerB.flags,
    allFlags: [...layerAFlags, ...layerB.flags],
    layerBMode: layerB.mode,
    woundVisionDescription,
    insufficientData,
  };
}
