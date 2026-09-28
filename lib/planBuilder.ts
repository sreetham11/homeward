// Stage 2 — Recovery Plan Builder Agent.
//
// Converts the structured DischargeData from Stage 1 into a day-by-day RecoveryPlan: medication
// reminder times, a wound-care checklist per day, and milestone notes ("Day 3: swelling should
// be reducing, not increasing"). This plan is what the patient-facing timeline renders AND what
// lib/deviation.ts's Layer B treats as "this patient's expected trajectory."
//
// Medication reminder times and the wound-care checklist are built deterministically (frequency
// text -> reminder clock times, duration text -> how many days a medication is active) — that
// part doesn't need a model, just careful parsing of common phrasing. Milestone notes are the
// one part where an LLM adds real value (personalized, procedure-specific language) and so are
// the only piece routed through lib/llm.ts, with a deterministic templated fallback so a plan
// is still fully generated with zero API keys — `generatedBy` on the result records which path
// produced the milestone notes.

import { chatCompletion, extractJsonBlock, isAnyChatProviderConfigured } from "./llm";
import { reminderTimesForFrequency } from "./medicationFrequency";
import type { DayPlan, DischargeData, MedicationNeedingScheduleReview, MedicationReminder, RecoveryPlan } from "./types";

const DEFAULT_PLAN_LENGTH_DAYS = 14;
const MIN_PLAN_LENGTH_DAYS = 7;
const MAX_PLAN_LENGTH_DAYS = 30;

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function isValidIsoDate(value: string | null): value is string {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function planLengthDays(discharge: DischargeData): number {
  if (isValidIsoDate(discharge.followUpDate) && isValidIsoDate(discharge.dischargeDate)) {
    const span = daysBetween(discharge.dischargeDate, discharge.followUpDate) + 1;
    if (span > 0) {
      return Math.min(Math.max(span, MIN_PLAN_LENGTH_DAYS), MAX_PLAN_LENGTH_DAYS);
    }
  }
  return DEFAULT_PLAN_LENGTH_DAYS;
}

// --- Medication frequency -> reminder clock times (deterministic, no model call) ---

// --- Medication duration -> number of active days (deterministic, no model call) ---

function activeDaysForDuration(duration: string, planLength: number): number {
  const d = duration.toLowerCase();
  const dayMatch = d.match(/(\d+)\s*day/);
  if (dayMatch && dayMatch[1]) return Math.min(parseInt(dayMatch[1], 10), planLength);
  const weekMatch = d.match(/(\d+)\s*week/);
  if (weekMatch && weekMatch[1]) return Math.min(parseInt(weekMatch[1], 10) * 7, planLength);
  // "until follow-up", empty, or unparseable phrasing: assume the medication spans the whole plan.
  return planLength;
}

// --- Deterministic templated milestone notes (zero-API-key fallback) ---

function templatedMilestoneNote(dayNumber: number, discharge: DischargeData): string | null {
  const followUpOffset = isValidIsoDate(discharge.followUpDate)
    ? daysBetween(discharge.dischargeDate, discharge.followUpDate)
    : null;

  if (dayNumber === 0) {
    return "Discharge day. Follow your medication schedule and wound care instructions below, and review your warning signs so you know what to watch for.";
  }
  if (dayNumber === 1) {
    return "Day 1 at home. Some discomfort and tiredness is expected — compare how you feel against the warning signs listed in your plan, not against how you felt before the procedure.";
  }
  if (dayNumber === 3) {
    return "By day 3, symptoms are generally expected to be stable or gradually improving rather than getting worse. If things feel like they're trending in the wrong direction, that's worth a check-in note.";
  }
  if (dayNumber === 7) {
    return "One week out. This is a common point to reassess — check your activity restrictions and confirm your follow-up appointment details are still correct.";
  }
  if (followUpOffset !== null && dayNumber === followUpOffset) {
    return `Follow-up day${discharge.followUpLocation ? ` at ${discharge.followUpLocation}` : ""}. Bring a note of anything from your daily check-ins you want to raise.`;
  }
  return null;
}

async function llmMilestoneNotes(
  discharge: DischargeData,
  planLength: number,
): Promise<Map<number, string> | null> {
  const checkpointDays = [...new Set([0, 1, 3, 7, planLength - 1])].filter(
    (d) => d >= 0 && d < planLength,
  );

  const system = `You write short, plain-language recovery milestone notes for a patient's
day-by-day home recovery plan. You are NOT diagnosing anything and must not predict a specific
medical outcome — you describe what is generally expected to be trending in the right direction
at each checkpoint, phrased as "compare how you feel against your plan" guidance, and you must
stay consistent with the patient's own diagnosis/procedure. Keep each note to 1-2 sentences.
Respond with strict JSON only: {"notes": [{"dayNumber": number, "note": string}]}`;

  const user = `Diagnosis: ${discharge.diagnosis}
Procedure type: ${discharge.procedureType}
Doctor-stated warning signs: ${discharge.doctorStatedWarningSigns.join("; ") || "none listed"}
Write one milestone note for each of these days since discharge: ${checkpointDays.join(", ")}.`;

  const result = await chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.4, jsonMode: true },
  );

  const parsed = JSON.parse(extractJsonBlock(result.text)) as {
    notes?: { dayNumber: number; note: string }[];
  };
  if (!Array.isArray(parsed.notes)) return null;
  return new Map(parsed.notes.map((n) => [n.dayNumber, n.note]));
}

export async function buildRecoveryPlan(
  patientId: string,
  discharge: DischargeData,
  caregiverEmail: string | null = null,
): Promise<RecoveryPlan> {
  const planLength = planLengthDays(discharge);
  const followUpOffset = isValidIsoDate(discharge.followUpDate)
    ? daysBetween(discharge.dischargeDate, discharge.followUpDate)
    : null;

  let milestoneNotes: Map<number, string> | null = null;
  let generatedBy: "llm" | "template" = "template";
  if (isAnyChatProviderConfigured()) {
    try {
      milestoneNotes = await llmMilestoneNotes(discharge, planLength);
      if (milestoneNotes) generatedBy = "llm";
    } catch {
      milestoneNotes = null;
    }
  }

  const medicationsNeedingScheduleReview: MedicationNeedingScheduleReview[] = [];

  const days: DayPlan[] = [];
  for (let dayNumber = 0; dayNumber < planLength; dayNumber++) {
    const date = addDays(discharge.dischargeDate, dayNumber);

    const medicationReminders: MedicationReminder[] = discharge.medications.flatMap((med) => {
      const activeDays = activeDaysForDuration(med.duration, planLength);
      if (dayNumber >= activeDays) return [];
      const { times, needsReview } = reminderTimesForFrequency(med.frequency);
      if (needsReview) {
        // Only record the medication once, on the first active day.
        if (dayNumber === 0) {
          medicationsNeedingScheduleReview.push({
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
          });
        }
        return [];
      }
      return times.map((time) => ({
        medicationName: med.name,
        dosage: med.dosage,
        time,
      }));
    });

    const milestoneNote =
      milestoneNotes?.get(dayNumber) ?? templatedMilestoneNote(dayNumber, discharge);

    days.push({
      dayNumber,
      date,
      medicationReminders,
      woundCareChecklist: discharge.woundCareInstructions,
      milestoneNote,
      isFollowUpDay: followUpOffset !== null && dayNumber === followUpOffset,
    });
  }

  return {
    patientId,
    discharge,
    days,
    generatedBy,
    createdAt: new Date().toISOString(),
    caregiverEmail,
    medicationsNeedingScheduleReview,
  };
}
