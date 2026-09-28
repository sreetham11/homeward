import { describe, expect, it } from "vitest";
import { looksSymptomRelated, looksLikeTermExplanation, answerHomewardQuestion } from "./askHomeward";
import type { DischargeData } from "./types";

// No chat provider keys are set in the test environment, so answerHomewardQuestion()
// exercises the same zero-key deterministic template path a real deployment falls back to —
// see lib/askHomeward.ts's file header for why that's the intended, not degraded-only,
// contract for this feature.

function fixtureDischarge(): DischargeData {
  return {
    diagnosis: "Appendicitis",
    procedureType: "Laparoscopic appendectomy",
    medications: [
      { name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" },
    ],
    woundCareInstructions: ["Keep the incision dry for 48 hours", "Change dressing daily"],
    activityRestrictions: ["No heavy lifting for 2 weeks", "No driving for 1 week"],
    followUpDate: "2026-07-20",
    followUpLocation: "Dr. Tan's clinic",
    doctorStatedWarningSigns: ["Fever over 38C", "Redness spreading around incision"],
    dischargeDate: "2026-07-08",
    needsManualReview: false,
  };
}

describe("looksSymptomRelated (deterministic guard, never bypassable by an LLM)", () => {
  const symptomQuestions = [
    "Is this fever bad?",
    "Should I be worried about this pain?",
    "Is this normal, my wound looks red and swollen?",
    "I feel dizzy, is that ok?",
    "Am I okay?",
    "Does this mean I have an infection?",
    "I'm feeling really sick today",
    "Is this bleeding serious?",
  ];

  it.each(symptomQuestions)("flags %p as symptom-related", (q) => {
    expect(looksSymptomRelated(q)).toBe(true);
  });

  const planQuestions = [
    "Can I shower today?",
    "When's my next dose?",
    "What was I told about lifting?",
    "When's my follow-up?",
    "What medications am I on?",
    "What's my diagnosis?",
  ];

  it.each(planQuestions)("does not flag plan question %p", (q) => {
    expect(looksSymptomRelated(q)).toBe(false);
  });
});

describe("looksLikeTermExplanation (deterministic guard, never bypassable by an LLM)", () => {
  const termQuestions = [
    "What does Amoxicillin do?",
    "What are sutures?",
    "What does hydration mean?",
    "Can you explain what an antibiotic is?",
    "How does anesthesia work?",
  ];

  it.each(termQuestions)("flags %p as a general term-explanation question", (q) => {
    expect(looksLikeTermExplanation(q)).toBe(true);
  });

  const planQuestions = [
    "Can I shower today?",
    "When's my next dose?",
    "What was I told about lifting?",
    "When's my follow-up?",
    "What are my activity restrictions?",
    "What's my diagnosis?",
  ];

  it.each(planQuestions)("does not flag plan question %p", (q) => {
    expect(looksLikeTermExplanation(q)).toBe(false);
  });
});

describe("answerHomewardQuestion (zero-key template path)", () => {
  it("redirects a symptom question to the check-in, without answering it", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "Is this fever bad?");
    expect(res.type).toBe("redirect");
    expect(res.answer.toLowerCase()).toContain("check-in");
    expect(res.answer.toLowerCase()).not.toMatch(/mild|normal|shouldn't worry|you're fine/);
  });

  it("redirects a general term-explanation question to a pharmacist/provider, without explaining the term", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "What does Amoxicillin do?");
    expect(res.type).toBe("term");
    expect(res.answer.toLowerCase()).toContain("pharmacist");
    expect(res.answer.toLowerCase()).not.toMatch(/antibiotic|bacteria|infection-fighting/);
  });

  it("answers a wound-care question grounded in this patient's own instructions", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "Can I shower today?");
    expect(res.type).toBe("answer");
    expect(res.answer).toContain("Keep the incision dry for 48 hours");
  });

  it("answers a medication question grounded in this patient's own medications", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "When's my next dose?");
    expect(res.type).toBe("answer");
    expect(res.answer).toContain("Amoxicillin");
  });

  it("answers an activity-restriction question grounded in this patient's own plan", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "What was I told about lifting?");
    expect(res.type).toBe("answer");
    expect(res.answer).toContain("No heavy lifting for 2 weeks");
  });

  it("answers a follow-up question grounded in this patient's own plan", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "When's my follow-up?");
    expect(res.type).toBe("answer");
    expect(res.answer).toContain("2026-07-20");
  });

  it("says it doesn't know rather than guessing for an out-of-scope question", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "What's the capital of France?");
    expect(res.type).toBe("unknown");
    expect(res.answer.toLowerCase()).toContain("care team");
  });

  it("every response carries the not-a-diagnosis disclaimer", async () => {
    const res = await answerHomewardQuestion(fixtureDischarge(), "Can I shower today?");
    expect(res.disclaimer.toLowerCase()).toContain("never diagnoses");
  });
});
