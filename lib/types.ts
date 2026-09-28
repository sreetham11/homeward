// Shared types across the Homeward pipeline: parse -> plan -> check-in -> deviation -> escalate.
// Keep this the single source of truth for shapes that cross the stage boundaries above —
// every stage in app/api/* and lib/* imports from here rather than redeclaring shapes.

export interface Medication {
  name: string;
  dosage: string;
  frequency: string; // free text as written by the doctor, e.g. "twice daily", "every 6 hours"
  duration: string; // e.g. "7 days", "until follow-up"
}

/**
 * Structured extraction of a discharge summary. Produced by lib/parser.ts (Stage 1).
 * `doctorStatedWarningSigns` must be verbatim (or near-verbatim) strings lifted from the
 * source document — Layer B of lib/deviation.ts compares patient check-ins against these
 * specific strings, not a generic symptom list, so paraphrasing away specificity here
 * breaks the "grounded in this patient's own document" guarantee the whole project rests on.
 */
export interface DischargeData {
  diagnosis: string;
  procedureType: string;
  medications: Medication[];
  woundCareInstructions: string[];
  activityRestrictions: string[];
  followUpDate: string | null; // ISO date, or null if not stated
  followUpLocation: string | null;
  doctorStatedWarningSigns: string[];
  dischargeDate: string; // ISO date
  /** True when the source document was unreadable/incomplete and fields were left blank
   * rather than guessed. The patient/caregiver must fill gaps manually before a plan
   * that depends on missing fields (e.g. followUpDate) is treated as complete. */
  needsManualReview: boolean;
  /** Human-readable notes on what couldn't be extracted, shown next to the manual-review flag. */
  manualReviewNotes?: string[];
}

export interface MedicationReminder {
  medicationName: string;
  dosage: string;
  time: string; // "HH:mm", local time-of-day
}

export interface DayPlan {
  dayNumber: number; // 0 = discharge day
  date: string; // ISO date
  medicationReminders: MedicationReminder[];
  woundCareChecklist: string[];
  milestoneNote: string | null; // e.g. "Swelling should be reducing, not increasing."
  isFollowUpDay: boolean;
}

export interface RecoveryPlan {
  patientId: string;
  discharge: DischargeData;
  days: DayPlan[];
  generatedBy: "llm" | "template"; // which path built the milestone notes
  createdAt: string; // ISO datetime
  /** Optional, caregiver-supplied at plan creation (components/OnboardingFlow.tsx) —
   * validated (see lib/email.ts) but never required, so the app works identically whether or
   * not it's set. Read by lib/silenceCheck.ts to address the silence-detection notification. */
  caregiverEmail: string | null;
  /** Medications whose frequency text could not be confidently parsed into reminder times.
   * Kept optional so plans stored before this field was added still load without breakage.
   * Callers should render a "confirm with discharge paperwork" notice when present. */
  medicationsNeedingScheduleReview?: MedicationNeedingScheduleReview[];
}

export interface MedicationNeedingScheduleReview {
  name: string;
  dosage: string;
  frequency: string;
}

export type BleedingLevel = "none" | "mild" | "moderate" | "heavy_or_worsening";

/**
 * Structured daily check-in input. Fields that feed Layer A red-flag rules
 * (temperatureC, bleeding, breathingDifficulty, chestPain, confusionOrFainting) are
 * deliberately structured (numeric/enum/boolean), not free text — Layer A is a
 * deterministic safety net and must never depend on regexing prose for a "no chest pain"
 * vs "chest pain" distinction. Free text (woundDescription, notes) still feeds Layer B.
 */
export interface CheckinInput {
  patientId: string;
  dayNumber: number;
  temperatureC: number | null;
  /** 0-10, or null if the patient never actually touched the pain-level control. Kept
   * nullable (not defaulted to a plausible-looking number) specifically so an untouched
   * form can be told apart from a deliberate "pain level 0" report — see
   * lib/checkinValidation.ts. */
  painLevel: number | null;
  medicationTaken: boolean | "partial";
  /** Null when the patient's plan has no activity restrictions at all, so the question was
   * never asked — see lib/checkinQuestions.ts's assembleQuestionIds. Never defaulted to a
   * plausible-looking value for a question the patient never saw. */
  activityRestrictionFollowed: boolean | "partial" | null;
  bleeding: BleedingLevel;
  breathingDifficulty: boolean;
  chestPain: boolean;
  confusionOrFainting: boolean;
  woundDescription: string;
  woundPhotoBase64: string | null;
  notes: string;
  submittedAt: string; // ISO datetime
}

/**
 * The stable set of check-in question "slots." lib/checkinQuestions.ts's assembleQuestionIds
 * decides WHICH of these apply to a given patient (deterministic, zero model calls) — the
 * four safety-floor ids (temperature/breathing/chestPain/confusion) are always included, no
 * exceptions. buildQuestionSet then personalizes only the wording (`question` text) per id,
 * grounded in this patient's own plan; it can never add, remove, or reorder ids.
 */
export type CheckinQuestionId =
  | "pain"
  | "medication"
  | "activityRestriction"
  | "bleeding"
  | "redness"
  | "temperature"
  | "breathing"
  | "chestPain"
  | "confusion"
  | "notes";

export interface CheckinQuestionSpec {
  id: CheckinQuestionId;
  question: string;
}

export type FlagSeverity = "critical" | "review";
export type FlagSource = "layer_a" | "layer_b";

export interface RedFlag {
  code: string;
  source: FlagSource;
  severity: FlagSeverity;
  message: string;
  /** For Layer B, the doctor-stated warning sign (or wound-care instruction) that matched. */
  matchedAgainst?: string;
}

export interface DeviationResult {
  escalate: boolean;
  layerAFlags: RedFlag[];
  layerBFlags: RedFlag[];
  allFlags: RedFlag[];
  /** Whether Layer B ran via LLM comparison or the offline keyword-overlap fallback. */
  layerBMode: "llm" | "keyword_fallback";
  woundVisionDescription?: string;
  /** True when the check-in carried no meaningful signal at all (see
   * lib/checkinValidation.ts) — no data was reported, not "reported data was calm." Mutually
   * exclusive with escalate: a check-in that trips a Layer A/B flag always has *some*
   * meaningful field set, so it can never simultaneously be insufficientData. Callers (see
   * app/api/escalate/route.ts) must treat this as a third state, not fold it into "on track."
   */
  insufficientData: boolean;
}

export interface EscalationReference {
  title: string;
  source: string;
  url?: string;
}

export interface EscalationSummary {
  patientId: string;
  dayNumber: number;
  escalate: boolean;
  /** Mirrors DeviationResult.insufficientData — a third UI state alongside escalate/calm.
   * When true, `escalate` is always false, but callers must render this distinctly from a
   * genuine "on track" result rather than defaulting to reassurance language. */
  insufficientData: boolean;
  headline: string;
  details: string;
  flags: RedFlag[];
  disclaimer: string;
  generatedAt: string;
  generatedBy: "llm" | "template";
  /** Supporting context from lib/rag.ts (curated KB, preferred) or lib/exa.ts (domain-locked
   * fallback, only used when the curated KB had no match) — never the basis for the escalate
   * decision itself, which comes entirely from lib/deviation.ts. */
  references: EscalationReference[];
}

export interface KbDocument {
  id: string;
  title: string;
  source: string; // real source citation: publisher + title + URL, e.g. 'Paraphrased from MedlinePlus: "Surgical wound care - closed" (medlineplus.gov/ency/patientinstructions/000738.htm)'
  condition: string[]; // tags: e.g. ["surgical wound care", "post-op"]
  content: string;
}

export interface KbMatch {
  doc: KbDocument;
  score: number;
  method: "vector" | "keyword";
}

/**
 * Response from the "Ask Homeward" widget (lib/askHomeward.ts / app/api/ask/route.ts).
 * `type` records which of the three allowed outcomes fired — never a fourth "diagnosis"
 * path: "answer" (grounded in this patient's plan/KB), "redirect" (question was symptom or
 * health-status related, deliberately not answered — see lib/askHomeward.ts's
 * looksSymptomRelated), or "unknown" (honest "I don't have that information" rather than a
 * guess).
 */
export interface AskHomewardResponse {
  answer: string;
  type: "answer" | "redirect" | "term" | "unknown";
  disclaimer: string;
  generatedBy: "llm" | "template";
}

/** One prior turn of an Ask Homeward conversation, sent back on each request so the LLM path
 * can answer follow-ups ("what if I don't?") with context instead of in isolation. */
export interface AskHomewardTurn {
  role: "user" | "assistant";
  content: string;
}
