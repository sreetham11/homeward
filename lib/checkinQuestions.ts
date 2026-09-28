// Assembles a per-patient check-in question set: which questions this patient sees, and how
// they're worded. Two separate, deliberately non-overlapping jobs:
//
// 1. assembleQuestionIds() — deterministic, zero model calls, decides WHICH question ids
//    apply to this patient from their own DischargeData (medications, activityRestrictions,
//    woundCareInstructions). The four safety-floor ids (temperature/breathing/chestPain/
//    confusion) are hardcoded into SAFETY_FLOOR_QUESTION_IDS and unconditionally included —
//    this mirrors lib/deviation.ts's Layer A design on purpose: a fixed set that must always
//    win can't depend on an LLM call, and here it can't even depend on what's in the
//    discharge document. See checkinQuestions.test.ts for the test that pins this down.
//
// 2. buildQuestionSet() — takes the id list assembleQuestionIds() produced and asks the LLM to
//    personalize each question's WORDING only (e.g. "Did you take your Amoxicillin today?"
//    instead of "Have you taken your medication today?"), grounded in this patient's own plan.
//    The LLM is never given the power to add, drop, or reorder ids — its JSON response is
//    matched back against the exact id list by id; any id it omits or invents extra text for
//    outside that list falls back to (or is discarded in favor of) the deterministic template
//    wording in defaultQuestionText(). Same zero-key/fallback contract as every other
//    LLM-optional stage in this project.
import { chatCompletion, extractJsonBlock, isAnyChatProviderConfigured } from "./llm";
import type { CheckinQuestionId, CheckinQuestionSpec, DayPlan, DischargeData } from "./types";

/** Always asked, every patient, no exceptions — the Layer A safety net. Never filtered by
 * personalization or by what's (or isn't) in the discharge document. */
export const SAFETY_FLOOR_QUESTION_IDS: CheckinQuestionId[] = [
  "temperature",
  "breathing",
  "chestPain",
  "confusion",
];

/**
 * Deterministic, zero model calls. Decides which question ids this patient sees, in a fixed
 * order. Conditional inclusions are driven entirely by this patient's own DischargeData:
 * - "medication" only if they have any medications prescribed.
 * - "activityRestriction" only if their plan states any activity restrictions.
 * - "bleeding"/"redness" (the wound-signal questions) only if their plan has a wound-care
 *   component at all — skipped entirely for e.g. a viral/dengue recovery with no wound.
 */
export function assembleQuestionIds(discharge: DischargeData): CheckinQuestionId[] {
  const hasWoundCare = discharge.woundCareInstructions.length > 0;
  const ids: CheckinQuestionId[] = ["pain"];
  if (discharge.medications.length > 0) ids.push("medication");
  if (discharge.activityRestrictions.length > 0) ids.push("activityRestriction");
  if (hasWoundCare) ids.push("bleeding", "redness");
  ids.push(...SAFETY_FLOOR_QUESTION_IDS);
  ids.push("notes");
  return ids;
}

// ---------------------------------------------------------------------------
// Deterministic template wording — used with zero API keys, or if the LLM call/parse fails.
// ---------------------------------------------------------------------------

function listMedicationNames(discharge: DischargeData): string {
  return discharge.medications.map((m) => m.name).join(" and ");
}

export function defaultQuestionText(
  id: CheckinQuestionId,
  discharge: DischargeData,
  todayPlan?: DayPlan,
): string {
  switch (id) {
    case "pain":
      return "How's your pain level today?";
    case "medication":
      return `Did you take your ${listMedicationNames(discharge) || "medication"} today?`;
    case "activityRestriction":
      return `Did you follow today's activity restriction — ${discharge.activityRestrictions[0] ?? "as instructed"}?`;
    case "bleeding":
      return "Any bleeding from your wound today?";
    case "redness":
      return todayPlan?.milestoneNote
        ? `Any redness or swelling around your wound today? (${todayPlan.milestoneNote})`
        : "Any redness or swelling around your wound today?";
    case "temperature":
      return "Have you taken your temperature?";
    case "breathing":
      return "Any difficulty breathing?";
    case "chestPain":
      return "Any chest pain?";
    case "confusion":
      return "Any confusion or fainting?";
    case "notes":
      return "Anything else you'd like to add?";
  }
}

function defaultQuestionSet(discharge: DischargeData, todayPlan: DayPlan | undefined, ids: CheckinQuestionId[]): CheckinQuestionSpec[] {
  return ids.map((id) => ({ id, question: defaultQuestionText(id, discharge, todayPlan) }));
}

// One line per id describing what it's asking about, so the LLM can personalize wording
// without being able to redefine what the question means or what data it collects.
const QUESTION_INTENT: Record<CheckinQuestionId, string> = {
  pain: "Ask for their current pain level (they will pick from a fixed 0-10 scale, don't propose a scale yourself).",
  medication: "Ask whether they took their prescribed medication(s) today (yes/partially/no).",
  activityRestriction: "Ask whether they followed their activity restriction today (yes/partially/no).",
  bleeding: "Ask whether there's any bleeding from their wound today (they'll pick none/mild/moderate/heavy).",
  redness: "Ask whether there's any redness or swelling around their wound today (yes/no).",
  temperature: "Ask whether they've taken their temperature today (they'll pick a bracket, not type a number).",
  breathing: "Ask whether they have any difficulty breathing today (yes/no).",
  chestPain: "Ask whether they have any chest pain today (yes/no).",
  confusion: "Ask whether they've had any confusion or fainting today (yes/no).",
  notes: "Ask if there's anything else they'd like to add today (open-ended, optional).",
};

async function llmQuestionSet(
  discharge: DischargeData,
  todayPlan: DayPlan | undefined,
  dayNumber: number,
  ids: CheckinQuestionId[],
): Promise<CheckinQuestionSpec[] | null> {
  const system = `You personalize the WORDING of a fixed set of daily recovery check-in
questions for one patient. You do NOT decide which questions are asked — that list is already
fixed and given to you. For each id below, write ONE short, plain-language question (under 20
words) that references this patient's own procedure, medication names, activity restrictions,
or wound care where the id's intent calls for it — otherwise keep it simple and universal.
Never change what the question is asking about, never merge two ids into one question, never
add a question for an id not listed. Respond with strict JSON only:
{"questions": [{"id": "<id from the list>", "text": "<personalized question>"}]}`;

  const user = `Patient's diagnosis: ${discharge.diagnosis || "not recorded"}
Procedure: ${discharge.procedureType || "not recorded"}
Day since discharge: ${dayNumber}
Medications: ${discharge.medications.map((m) => `${m.name} (${m.dosage}, ${m.frequency})`).join("; ") || "none"}
Activity restrictions: ${discharge.activityRestrictions.join("; ") || "none"}
Wound care instructions: ${discharge.woundCareInstructions.join("; ") || "none"}
Today's plan milestone note: ${todayPlan?.milestoneNote || "none"}

Write personalized wording for exactly these question ids:
${ids.map((id) => `- ${id}: ${QUESTION_INTENT[id]}`).join("\n")}`;

  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, jsonMode: true },
  );

  const parsed = JSON.parse(extractJsonBlock(result.text)) as {
    questions?: { id: string; text: string }[];
  };
  if (!Array.isArray(parsed.questions)) return null;

  const byId = new Map(parsed.questions.map((q) => [q.id, q.text]));
  // Rebuild strictly from the original `ids` list/order — the LLM's response can only fill in
  // wording for an id we asked about, never introduce, drop, or reorder one.
  return ids.map((id) => {
    const text = byId.get(id);
    return { id, question: text && text.trim().length > 0 ? text.trim() : defaultQuestionText(id, discharge, todayPlan) };
  });
}

/**
 * Main entry point for app/api/checkin/questions/route.ts. Assembles this patient's question
 * ids (deterministic, always includes the safety floor), then personalizes wording via the
 * LLM chain, or the deterministic template if no provider is configured or the call fails.
 */
export async function buildQuestionSet(
  discharge: DischargeData,
  todayPlan: DayPlan | undefined,
  dayNumber: number,
): Promise<CheckinQuestionSpec[]> {
  const ids = assembleQuestionIds(discharge);

  if (isAnyChatProviderConfigured()) {
    try {
      const questions = await llmQuestionSet(discharge, todayPlan, dayNumber, ids);
      if (questions) return questions;
    } catch {
      // fall through to the deterministic template below
    }
  }

  return defaultQuestionSet(discharge, todayPlan, ids);
}
