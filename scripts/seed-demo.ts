// Demo seed script: creates realistic multi-day recovery plans with genuine deviation
// results, so you don't have to fake several days of check-ins by hand before a demo.
//
// Run with: npm run seed:demo
//
// What it creates:
//   - DEMO01 — an active recovery plan (laparoscopic appendectomy) with:
//       Day 1: calm check-in (no flags, on track)
//       Day 3: calm check-in (no flags, on track)
//       Day 5: escalating check-in — fever (Layer A) + wound note matching a warning sign (Layer B)
//   - DEMO02 — a "gone quiet" patient (only seeded when DEMO_CAREGIVER_EMAIL is set — see below):
//       A single calm check-in backdated ~3 days ago and nothing since, so
//       /api/silence-check (48-hour threshold) picks it up as silent and can exercise the
//       caregiver-email notification path end to end.
//
// Safety:
//   - Uses FIXED recovery codes so re-runs don't pile up duplicate demo plans.
//   - Before (re-)seeding a given demo code, deletes only that code's existing
//     checkins/escalations rows (Supabase) or its entry in the local JSON file (zero-Supabase).
//     Never touches any other recovery code's data.
//
// DEMO02 requires DEMO_CAREGIVER_EMAIL (an email address to attach to that plan so
// /api/silence-check has somewhere to point the caregiver notification) — without it, DEMO02
// is skipped entirely (no cleanup, no persist) and the script says so plainly. Set it in
// .env.local or the shell environment, e.g. DEMO_CAREGIVER_EMAIL=you@example.com.
//
// Works with:
//   - Supabase configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — persists
//     each plan, its check-ins, and escalation summaries server-side, so the code works across
//     devices just like a real plan. This is also the ONLY path /api/silence-check can see —
//     it queries Supabase directly and has no visibility into a browser's localStorage.
//   - No Supabase — writes a .demo-seed.json file (gitignored) and prints a localStorage
//     snippet per recovery code to paste into the browser console so each plan loads in the
//     same-browser demo path. DEMO02 will still appear "quiet" in the UI's own timeline this
//     way, but /api/silence-check won't be able to find it without Supabase configured.

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

config({ path: ".env.local" });

import { buildRecoveryPlan } from "@/lib/planBuilder";
import { evaluateDeviation } from "@/lib/deviation";
import { isAnyChatProviderConfigured } from "@/lib/llm";
import { isValidEmail } from "@/lib/email";
import type {
  CheckinInput,
  DeviationResult,
  DischargeData,
  EscalationSummary,
  RecoveryPlan,
} from "@/lib/types";
import type { LocalRecoveryState } from "@/lib/planStore";

const DEMO_RECOVERY_CODE = "DEMO01";
const DEMO_PATIENT_ID = "demo-patient";
const DISCHARGE_DATE = "2026-09-22";

const QUIET_RECOVERY_CODE = "DEMO02";
const QUIET_PATIENT_ID = "demo-quiet-patient";
const QUIET_LAST_ACTIVITY_DAYS_AGO = 3; // comfortably past the 48-hour silence threshold

const DEMO_DISCHARGE: DischargeData = {
  diagnosis: "Acute appendicitis",
  procedureType: "Laparoscopic appendectomy",
  medications: [
    { name: "Amoxicillin", dosage: "500mg", frequency: "three times daily", duration: "7 days" },
    { name: "Paracetamol", dosage: "1g", frequency: "as needed", duration: "until follow-up" },
  ],
  woundCareInstructions: [
    "Keep the dressing clean and dry for 48 hours.",
    "Shower after 48 hours, do not soak the wound.",
  ],
  activityRestrictions: ["No heavy lifting for 2 weeks."],
  followUpDate: "2026-10-06",
  followUpLocation: "Surgical clinic",
  doctorStatedWarningSigns: [
    "Fever above 38 degrees",
    "Severe abdominal pain that does not improve with medication",
    "Redness spreading beyond the incision line",
  ],
  dischargeDate: DISCHARGE_DATE,
  needsManualReview: false,
};

interface SeededCheckin {
  checkin: CheckinInput;
  deviation: DeviationResult;
  summary: EscalationSummary;
  /** Overrides the checkins row's created_at at insert time (Supabase only). Used for DEMO02 so
   * /api/silence-check's "most recent activity" query sees a backdated timestamp instead of the
   * row's real insert time. Left unset for DEMO01 so its check-ins stay "fresh" (never silent)
   * regardless of when the script is run. */
  createdAtOverride?: string;
}

function isoAt(daysAfterDischarge: number, hour = 9): string {
  const d = new Date(`${DISCHARGE_DATE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysAfterDischarge);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

function calmCheckin(dayNumber: number): CheckinInput {
  return {
    patientId: DEMO_PATIENT_ID,
    dayNumber,
    temperatureC: 37.0,
    painLevel: 2,
    medicationTaken: true,
    activityRestrictionFollowed: true,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    woundDescription: "Incision looks clean, slightly pink around the edges, no discharge.",
    woundPhotoBase64: null,
    notes: "",
    submittedAt: isoAt(dayNumber),
  };
}

function escalatingCheckin(dayNumber: number): CheckinInput {
  return {
    patientId: DEMO_PATIENT_ID,
    dayNumber,
    temperatureC: 38.6,
    painLevel: 5,
    medicationTaken: true,
    activityRestrictionFollowed: true,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    // Deliberately includes "redness spreading beyond the incision line" to match one of the
    // plan's doctorStatedWarningSigns — so Layer B fires alongside the Layer A fever.
    woundDescription:
      "Noticing redness spreading beyond the incision line since this morning. Area feels warm.",
    woundPhotoBase64: null,
    notes: "Took Paracetamol but the redness seems to be getting wider.",
    submittedAt: isoAt(dayNumber),
  };
}

function templatedSummary(
  checkin: CheckinInput,
  discharge: DischargeData,
  deviation: DeviationResult,
): { headline: string; details: string } {
  if (deviation.escalate) {
    const flagLines = deviation.allFlags.map((f) =>
      f.source === "layer_a"
        ? `- ${f.message} (always-escalate safety rule)`
        : `- ${f.message}${f.matchedAgainst ? ` — matches your plan's note: "${f.matchedAgainst}"` : ""}`,
    );
    return {
      headline: `Day ${checkin.dayNumber} check-in: something you reported matches a signal worth a human review.`,
      details: `Diagnosis on file: ${discharge.procedureType || discharge.diagnosis || "not specified"}.\n${flagLines.join("\n")}\nRecommend contacting your provider or clinic to review this.`,
    };
  }
  return {
    headline: `Day ${checkin.dayNumber} check-in: nothing you reported matches a warning sign from your plan.`,
    details: `Pain level ${checkin.painLevel ?? "not reported"}${checkin.painLevel != null ? "/10" : ""}, medication taken: ${checkin.medicationTaken}${checkin.activityRestrictionFollowed != null ? `, activity restriction followed: ${checkin.activityRestrictionFollowed}` : ""}. This is within what your plan expects at this stage — keep going with your medication schedule and wound care checklist.`,
  };
}

function buildEscalationSummary(
  checkin: CheckinInput,
  discharge: DischargeData,
  deviation: DeviationResult,
): EscalationSummary {
  const summaryText = templatedSummary(checkin, discharge, deviation);
  return {
    patientId: checkin.patientId,
    dayNumber: checkin.dayNumber,
    escalate: deviation.escalate,
    insufficientData: deviation.insufficientData,
    headline: summaryText.headline,
    details: summaryText.details,
    flags: deviation.allFlags,
    disclaimer:
      "This is not a diagnosis. Homeward compares what you reported against your own doctor's instructions — it does not replace medical judgment. If you're ever unsure, contact your provider, or emergency services for anything urgent.",
    generatedAt: new Date().toISOString(),
    generatedBy: "template" as const,
    references: [],
  };
}

async function seedCheckins(plan: RecoveryPlan): Promise<SeededCheckin[]> {
  const seeded: SeededCheckin[] = [];

  // Day 1 — calm
  {
    const checkin = calmCheckin(1);
    const deviation = await evaluateDeviation(checkin, plan.discharge);
    const summary = buildEscalationSummary(checkin, plan.discharge, deviation);
    seeded.push({ checkin, deviation, summary });
  }

  // Day 3 — calm
  {
    const checkin = calmCheckin(3);
    const deviation = await evaluateDeviation(checkin, plan.discharge);
    const summary = buildEscalationSummary(checkin, plan.discharge, deviation);
    seeded.push({ checkin, deviation, summary });
  }

  // Day 5 — escalating: fever + wound note matching a warning sign (both layers fire)
  {
    const checkin = escalatingCheckin(5);
    const deviation = await evaluateDeviation(
      checkin,
      plan.discharge,
      undefined,
      calmCheckin(3), // previous check-in for pain-jump comparison
    );
    const summary = buildEscalationSummary(checkin, plan.discharge, deviation);
    seeded.push({ checkin, deviation, summary });
  }

  return seeded;
}

/**
 * DEMO02's discharge date and single check-in are computed relative to "now" (not a fixed
 * historical date, unlike DEMO01) so this plan reads as "~3 days quiet" no matter when the
 * script is actually run.
 *
 * planCreatedAt is set to dischargeDate (one day before the backdated check-in, not "now") so
 * the check-in is genuinely the most recent activity — see lib/silenceCheck.ts's
 * findSilentPatients, which takes the MOST RECENT of (plan created, check-in, presence ping)
 * as "last activity." If the plan's own created_at were left at real insert time (as
 * buildRecoveryPlan() sets it by default), it would be newer than the backdated check-in and
 * would mask it, so /api/silence-check would never see this patient as silent — this was a
 * real bug caught by comparing n8n's silence-check output against the seeded data directly.
 */
function buildQuietPatientPlanInputs(now: Date): {
  discharge: DischargeData;
  checkinSubmittedAt: string;
  planCreatedAt: string;
} {
  const lastActivity = new Date(now.getTime() - QUIET_LAST_ACTIVITY_DAYS_AGO * 24 * 60 * 60 * 1000);
  const dischargeDate = new Date(lastActivity.getTime() - 1 * 24 * 60 * 60 * 1000);

  const discharge: DischargeData = {
    diagnosis: "Total knee replacement",
    procedureType: "Total knee arthroplasty",
    medications: [
      { name: "Paracetamol", dosage: "1g", frequency: "four times daily", duration: "10 days" },
    ],
    woundCareInstructions: ["Keep the surgical dressing clean and dry until your follow-up."],
    activityRestrictions: ["Use crutches/walker as instructed, no weight-bearing without support."],
    followUpDate: null,
    followUpLocation: "Orthopedic clinic",
    doctorStatedWarningSigns: [
      "Fever above 38 degrees",
      "Calf pain, swelling, or redness (possible blood clot)",
      "Increasing redness or discharge from the incision",
    ],
    dischargeDate: dischargeDate.toISOString().slice(0, 10),
    needsManualReview: false,
  };

  return {
    discharge,
    checkinSubmittedAt: lastActivity.toISOString(),
    planCreatedAt: dischargeDate.toISOString(),
  };
}

function quietPatientCalmCheckin(submittedAt: string): CheckinInput {
  return {
    patientId: QUIET_PATIENT_ID,
    dayNumber: 1,
    temperatureC: 36.9,
    painLevel: 3,
    medicationTaken: true,
    activityRestrictionFollowed: true,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    woundDescription: "Dressing clean and dry, mild swelling as expected.",
    woundPhotoBase64: null,
    notes: "Feeling okay, a bit sore.",
    submittedAt,
  };
}

/**
 * Only built when DEMO_CAREGIVER_EMAIL is a valid email — see main(). Returns null (with the
 * caller responsible for logging why) rather than fabricating a caregiver email, matching this
 * project's "never fabricate patient-facing data" convention (see lib/silenceCheck.ts).
 */
async function buildQuietPatientEntry(
  caregiverEmail: string,
  now: Date,
): Promise<{ plan: RecoveryPlan; seeded: SeededCheckin[] }> {
  const { discharge, checkinSubmittedAt, planCreatedAt } = buildQuietPatientPlanInputs(now);
  const builtPlan = await buildRecoveryPlan(QUIET_PATIENT_ID, discharge, caregiverEmail);
  // Overrides buildRecoveryPlan()'s default createdAt (real insert time) with the backdated
  // value — see buildQuietPatientPlanInputs' comment above for why this matters for
  // /api/silence-check.
  const plan: RecoveryPlan = { ...builtPlan, createdAt: planCreatedAt };

  const checkin = quietPatientCalmCheckin(checkinSubmittedAt);
  const deviation = await evaluateDeviation(checkin, plan.discharge);
  const summary = buildEscalationSummary(checkin, plan.discharge, deviation);

  return {
    plan,
    seeded: [{ checkin, deviation, summary, createdAtOverride: checkinSubmittedAt }],
  };
}

// --- Supabase helpers (mirror lib/planStore.ts but use the service-role key directly) ---

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

async function clearDemoData(supabase: SupabaseClient, recoveryCode: string): Promise<void> {
  // Delete child rows first (FK constraints with on delete cascade would handle this, but
  // being explicit is safer in case the cascade wasn't applied). Scoped to a single recovery
  // code — never a blanket delete across demo codes or real patient data.
  await supabase.from("escalations").delete().eq("recovery_code", recoveryCode);
  await supabase.from("checkins").delete().eq("recovery_code", recoveryCode);
}

async function persistDemoEntry(
  supabase: SupabaseClient,
  recoveryCode: string,
  plan: RecoveryPlan,
  seeded: SeededCheckin[],
  // Only DEMO02 (the "gone quiet" entry) passes true. A plain upsert's ON CONFLICT DO UPDATE
  // should already overwrite created_at since it's included in the payload below — but for a
  // deliberately backdated timestamp that /api/silence-check's staleness check depends on, an
  // explicit follow-up UPDATE removes any doubt on a re-run rather than trusting upsert
  // semantics. DEMO01 never sets this, so its persistence is unchanged from before.
  forceCreatedAt = false,
): Promise<void> {
  // Upsert the plan (upsert handles both first-run and re-run).
  const { error: planError } = await supabase.from("recovery_plans").upsert({
    recovery_code: recoveryCode,
    patient_id: plan.patientId,
    discharge_data: plan.discharge,
    days: plan.days,
    generated_by: plan.generatedBy,
    created_at: plan.createdAt,
    caregiver_email: plan.caregiverEmail,
  });
  if (planError) {
    console.error(`Failed to upsert plan ${recoveryCode}:`, planError.message);
    process.exit(1);
  }

  if (forceCreatedAt) {
    const { error: forceError } = await supabase
      .from("recovery_plans")
      .update({ created_at: plan.createdAt })
      .eq("recovery_code", recoveryCode);
    if (forceError) {
      console.error(`Failed to force-update created_at for ${recoveryCode}:`, forceError.message);
      process.exit(1);
    }
  }

  for (const { checkin, deviation, summary, createdAtOverride } of seeded) {
    const { error: checkinError } = await supabase.from("checkins").insert({
      recovery_code: recoveryCode,
      day_number: checkin.dayNumber,
      payload: checkin,
      deviation_result: deviation,
      ...(createdAtOverride ? { created_at: createdAtOverride } : {}),
    });
    if (checkinError) {
      console.error(`Failed to insert ${recoveryCode} day ${checkin.dayNumber} check-in:`, checkinError.message);
    }

    if (deviation.escalate) {
      const { error: escalationError } = await supabase.from("escalations").insert({
        recovery_code: recoveryCode,
        day_number: summary.dayNumber,
        summary,
        ...(createdAtOverride ? { created_at: createdAtOverride } : {}),
      });
      if (escalationError) {
        console.error(`Failed to insert ${recoveryCode} day ${summary.dayNumber} escalation:`, escalationError.message);
      }
    }
  }
}

function writeLocalSeedFile(entries: { recoveryCode: string; plan: RecoveryPlan; seeded: SeededCheckin[] }[]): void {
  const fileContents: Record<string, LocalRecoveryState> = {};
  for (const { recoveryCode, plan, seeded } of entries) {
    fileContents[recoveryCode] = {
      plan,
      checkins: seeded.map((s) => ({ checkin: s.checkin, deviation: s.deviation })),
      escalations: seeded.filter((s) => s.summary.escalate).map((s) => s.summary),
      presencePings: [],
    };
  }

  const outPath = resolve(process.cwd(), ".demo-seed.json");
  writeFileSync(outPath, JSON.stringify(fileContents, null, 2));
  console.log(`\nNo Supabase configured — wrote local seed file: ${outPath}`);
  console.log(`Open your browser console on http://localhost:3000 and paste these to load the demo:\n`);
  for (const [recoveryCode, state] of Object.entries(fileContents)) {
    console.log(`localStorage.setItem("homeward:${recoveryCode}", \`${JSON.stringify(state)}\`);`);
  }
  console.log(
    `\nNote: /api/silence-check reads Supabase directly and cannot see localStorage, so the ` +
      `"gone quiet" demo (${QUIET_RECOVERY_CODE}) will only be detectable by that endpoint once ` +
      `Supabase is configured and this script is run again against it.`,
  );
}

async function main() {
  const now = new Date();
  console.log("Building demo recovery plan(s)…\n");

  const mainPlan = await buildRecoveryPlan(DEMO_PATIENT_ID, DEMO_DISCHARGE, null);
  const mainSeeded = await seedCheckins(mainPlan);
  const entries: {
    recoveryCode: string;
    plan: RecoveryPlan;
    seeded: SeededCheckin[];
    forceCreatedAt?: boolean;
  }[] = [{ recoveryCode: DEMO_RECOVERY_CODE, plan: mainPlan, seeded: mainSeeded }];

  const rawCaregiverEmail = (process.env.DEMO_CAREGIVER_EMAIL ?? "").trim();
  if (!rawCaregiverEmail) {
    console.log(
      `Skipping ${QUIET_RECOVERY_CODE} (gone-quiet demo patient): DEMO_CAREGIVER_EMAIL is not set. ` +
        `Set it in .env.local or your shell environment to seed a silent patient for /api/silence-check.`,
    );
  } else if (!isValidEmail(rawCaregiverEmail)) {
    console.log(
      `Skipping ${QUIET_RECOVERY_CODE} (gone-quiet demo patient): DEMO_CAREGIVER_EMAIL ("${rawCaregiverEmail}") doesn't look like a valid email.`,
    );
  } else {
    const { plan: quietPlan, seeded: quietSeeded } = await buildQuietPatientEntry(rawCaregiverEmail, now);
    entries.push({
      recoveryCode: QUIET_RECOVERY_CODE,
      plan: quietPlan,
      seeded: quietSeeded,
      forceCreatedAt: true,
    });
  }

  const supabase = getSupabase();
  if (supabase) {
    for (const { recoveryCode, plan, seeded, forceCreatedAt } of entries) {
      console.log(`Supabase configured — clearing old data for ${recoveryCode}…`);
      await clearDemoData(supabase, recoveryCode);
      console.log(`Persisting ${recoveryCode} to Supabase…`);
      await persistDemoEntry(supabase, recoveryCode, plan, seeded, forceCreatedAt);
    }
  } else {
    writeLocalSeedFile(entries);
  }

  console.log("\n--- Demo seeded ---");
  for (const { recoveryCode, seeded } of entries) {
    console.log(`\nRecovery code: ${recoveryCode}`);
    console.log(`Patient URL:   http://localhost:3000/patient?code=${recoveryCode}`);
    console.log(`Caregiver URL: http://localhost:3000/caregiver?code=${recoveryCode}`);
    console.log(`Check-ins:`);
    for (const { checkin, deviation } of seeded) {
      const status = deviation.insufficientData
        ? "insufficient data"
        : deviation.escalate
          ? `ESCALATED (${deviation.allFlags.map((f) => f.code).join(", ")})`
          : "on track";
      console.log(`  Day ${checkin.dayNumber}: ${status}`);
    }
  }
  if (entries.length === 1) {
    console.log(`\n(${QUIET_RECOVERY_CODE} was skipped — see message above.)`);
  }

  console.log(
    `\nLLM provider: ${isAnyChatProviderConfigured() ? "configured (milestone notes + Layer B may use LLM)" : "not configured (template/keyword fallback)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
