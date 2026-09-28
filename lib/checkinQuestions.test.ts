import { describe, expect, it } from "vitest";
import { SAFETY_FLOOR_QUESTION_IDS, assembleQuestionIds, buildQuestionSet, defaultQuestionText } from "./checkinQuestions";
import type { DischargeData } from "./types";

// No chat provider keys are set in the test environment, so buildQuestionSet() exercises the
// same zero-key deterministic template path a real deployment falls back to.

function baseDischarge(overrides: Partial<DischargeData> = {}): DischargeData {
  return {
    diagnosis: "Appendicitis",
    procedureType: "Laparoscopic appendectomy",
    medications: [{ name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" }],
    woundCareInstructions: ["Keep the incision dry for 48 hours", "Change dressing daily"],
    activityRestrictions: ["No heavy lifting for 2 weeks"],
    followUpDate: "2026-07-20",
    followUpLocation: "Dr. Tan's clinic",
    doctorStatedWarningSigns: ["Fever over 38C"],
    dischargeDate: "2026-07-08",
    needsManualReview: false,
    ...overrides,
  };
}

describe("assembleQuestionIds (deterministic, never bypassable by an LLM)", () => {
  it("always includes every safety-floor id, for a fully-populated plan", () => {
    const ids = assembleQuestionIds(baseDischarge());
    for (const floorId of SAFETY_FLOOR_QUESTION_IDS) {
      expect(ids).toContain(floorId);
    }
  });

  it("always includes every safety-floor id, even for a bare-minimum plan with nothing else", () => {
    const ids = assembleQuestionIds(
      baseDischarge({ medications: [], activityRestrictions: [], woundCareInstructions: [] }),
    );
    for (const floorId of SAFETY_FLOOR_QUESTION_IDS) {
      expect(ids).toContain(floorId);
    }
    expect(ids).toContain("pain");
    expect(ids).toContain("notes");
  });

  it("includes wound questions when the plan has wound care instructions", () => {
    const ids = assembleQuestionIds(baseDischarge());
    expect(ids).toContain("bleeding");
    expect(ids).toContain("redness");
  });

  it("excludes wound questions entirely for a plan with no wound component (e.g. dengue)", () => {
    const ids = assembleQuestionIds(baseDischarge({ woundCareInstructions: [] }));
    expect(ids).not.toContain("bleeding");
    expect(ids).not.toContain("redness");
  });

  it("excludes the medication question when the plan has no medications", () => {
    const ids = assembleQuestionIds(baseDischarge({ medications: [] }));
    expect(ids).not.toContain("medication");
  });

  it("excludes the activity-restriction question when the plan has none", () => {
    const ids = assembleQuestionIds(baseDischarge({ activityRestrictions: [] }));
    expect(ids).not.toContain("activityRestriction");
  });
});

describe("defaultQuestionText (zero-key template wording)", () => {
  it("references the patient's actual medication name, not a generic phrase", () => {
    const text = defaultQuestionText("medication", baseDischarge(), undefined);
    expect(text).toContain("Amoxicillin");
  });

  it("references the patient's actual activity restriction, not a generic phrase", () => {
    const text = defaultQuestionText("activityRestriction", baseDischarge(), undefined);
    expect(text).toContain("No heavy lifting for 2 weeks");
  });
});

describe("buildQuestionSet (zero-key template path)", () => {
  it("returns exactly the assembled ids, in order, each with non-empty text", async () => {
    const discharge = baseDischarge();
    const ids = assembleQuestionIds(discharge);
    const questions = await buildQuestionSet(discharge, undefined, 3);
    expect(questions.map((q) => q.id)).toEqual(ids);
    for (const q of questions) {
      expect(q.question.trim().length).toBeGreaterThan(0);
    }
  });

  it("never drops a safety-floor question, even for a wound-free, medication-free plan", async () => {
    const discharge = baseDischarge({ medications: [], activityRestrictions: [], woundCareInstructions: [] });
    const questions = await buildQuestionSet(discharge, undefined, 1);
    const ids = questions.map((q) => q.id);
    for (const floorId of SAFETY_FLOOR_QUESTION_IDS) {
      expect(ids).toContain(floorId);
    }
  });
});
