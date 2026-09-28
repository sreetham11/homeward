import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkFever,
  checkBleeding,
  checkBreathingDifficulty,
  checkChestPain,
  checkConfusionOrFainting,
  checkPainSevere,
  checkPainJump,
  runLayerARules,
  runLayerARulesWithHistory,
  runLayerB,
  evaluateDeviation,
} from "./deviation";
import { hasMeaningfulCheckinData } from "./checkinValidation";
import type { CheckinInput, DischargeData } from "./types";

// Mocked only for the "LLM path" describe block below. The test environment has no real chat
// provider keys configured (every other describe block in this file exercises the offline
// keyword_fallback path for exactly that reason), so this is the only way to deterministically
// exercise llmMatch's prompt and prove it distinguishes "instruction followed" from
// "instruction violated" — see the compliance-vs-violation regression tests below.
vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return {
    ...actual,
    chatCompletion: vi.fn(),
    isAnyChatProviderConfigured: vi.fn(),
  };
});
import { chatCompletion, isAnyChatProviderConfigured } from "./llm";

// File-level, not scoped to one describe block: isAnyChatProviderConfigured is mocked for the
// whole file (vi.mock is file-scoped), so without this every test declared AFTER the "LLM
// path" block below would silently inherit its mocked "provider configured" state instead of
// exercising the real keyword_fallback path they're meant to test.
afterEach(() => {
  vi.mocked(isAnyChatProviderConfigured).mockReturnValue(false);
  vi.mocked(chatCompletion).mockReset();
});

function emptyCheckin(overrides: Partial<CheckinInput> = {}): CheckinInput {
  return {
    patientId: "patient-1",
    dayNumber: 3,
    temperatureC: null,
    painLevel: null,
    medicationTaken: true,
    activityRestrictionFollowed: null,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    woundDescription: "",
    woundPhotoBase64: null,
    notes: "",
    submittedAt: "2026-07-07T09:00:00.000Z",
    ...overrides,
  };
}

function benignCheckin(overrides: Partial<CheckinInput> = {}): CheckinInput {
  return {
    patientId: "patient-1",
    dayNumber: 3,
    temperatureC: 37.0,
    painLevel: 2,
    medicationTaken: true,
    activityRestrictionFollowed: true,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    woundDescription: "Looks fine, slightly pink around the edges, no discharge.",
    woundPhotoBase64: null,
    notes: "",
    submittedAt: "2026-07-07T09:00:00.000Z",
    ...overrides,
  };
}

function baseDischarge(overrides: Partial<DischargeData> = {}): DischargeData {
  return {
    diagnosis: "Appendicitis, post-appendectomy",
    procedureType: "appendectomy",
    medications: [],
    woundCareInstructions: [
      "Keep the dressing clean and dry for 48 hours.",
      "Redness spreading beyond the incision line is not normal.",
    ],
    activityRestrictions: ["No heavy lifting for 2 weeks."],
    followUpDate: "2026-07-14",
    followUpLocation: "Surgical clinic",
    doctorStatedWarningSigns: [
      "Fever above 38 degrees",
      "Severe abdominal pain that does not improve with medication",
      "Redness spreading beyond the incision line",
    ],
    dischargeDate: "2026-07-04",
    needsManualReview: false,
    ...overrides,
  };
}

describe("Layer A — hardcoded universal red flags", () => {
  it("does not flag a fully benign check-in", () => {
    expect(runLayerARules(benignCheckin())).toEqual([]);
  });

  describe("fever", () => {
    it("does not flag exactly at the 38.0°C threshold", () => {
      expect(checkFever(benignCheckin({ temperatureC: 38.0 }))).toBeNull();
    });
    it("flags above the 38.0°C threshold", () => {
      const flag = checkFever(benignCheckin({ temperatureC: 38.1 }));
      expect(flag).not.toBeNull();
      expect(flag?.code).toBe("fever");
      expect(flag?.source).toBe("layer_a");
    });
    it("does not flag when temperature was not reported", () => {
      expect(checkFever(benignCheckin({ temperatureC: null }))).toBeNull();
    });
  });

  describe("bleeding", () => {
    it.each(["none", "mild", "moderate"] as const)(
      "does not flag bleeding level '%s'",
      (level) => {
        expect(checkBleeding(benignCheckin({ bleeding: level }))).toBeNull();
      },
    );
    it("flags heavy or worsening bleeding", () => {
      const flag = checkBleeding(benignCheckin({ bleeding: "heavy_or_worsening" }));
      expect(flag?.code).toBe("bleeding");
    });
  });

  describe("breathing difficulty", () => {
    it("does not flag when false", () => {
      expect(checkBreathingDifficulty(benignCheckin({ breathingDifficulty: false }))).toBeNull();
    });
    it("flags when true", () => {
      expect(
        checkBreathingDifficulty(benignCheckin({ breathingDifficulty: true }))?.code,
      ).toBe("breathing_difficulty");
    });
  });

  describe("chest pain", () => {
    it("does not flag when false", () => {
      expect(checkChestPain(benignCheckin({ chestPain: false }))).toBeNull();
    });
    it("flags when true", () => {
      expect(checkChestPain(benignCheckin({ chestPain: true }))?.code).toBe("chest_pain");
    });
  });

  describe("confusion or fainting", () => {
    it("does not flag when false", () => {
      expect(checkConfusionOrFainting(benignCheckin({ confusionOrFainting: false }))).toBeNull();
    });
    it("flags when true", () => {
      expect(
        checkConfusionOrFainting(benignCheckin({ confusionOrFainting: true }))?.code,
      ).toBe("confusion_or_fainting");
    });
  });

  it("flags every category simultaneously without dropping any", () => {
    const flags = runLayerARules(
      benignCheckin({
        temperatureC: 39.0,
        bleeding: "heavy_or_worsening",
        breathingDifficulty: true,
        chestPain: true,
        confusionOrFainting: true,
      }),
    );
    const codes = flags.map((f) => f.code).sort();
    expect(codes).toEqual(
      ["bleeding", "breathing_difficulty", "chest_pain", "confusion_or_fainting", "fever"].sort(),
    );
  });
});

describe("Layer B — keyword fallback (no LLM provider configured in test env)", () => {
  it("matches check-in text that shares distinctive vocabulary with a warning sign", async () => {
    const result = await runLayerB(
      benignCheckin({
        woundDescription: "I'm noticing redness spreading beyond the incision line today.",
      }),
      baseDischarge(),
    );
    expect(result.mode).toBe("keyword_fallback");
    expect(result.flags.some((f) => f.matchedAgainst?.includes("Redness spreading"))).toBe(true);
  });

  it("does not match unrelated benign wound text", async () => {
    const result = await runLayerB(
      benignCheckin({
        woundDescription: "Small amount of clear fluid, dressing stayed dry all day.",
      }),
      baseDischarge(),
    );
    expect(result.flags).toEqual([]);
  });

  it("does not compare against wound care instructions when there is no wound signal", async () => {
    const result = await runLayerB(
      benignCheckin({ woundDescription: "", woundPhotoBase64: null, notes: "" }),
      baseDischarge(),
    );
    expect(result.flags).toEqual([]);
  });

  it("does not false-positive on 'dressing dry' against the 'keep the dressing clean and dry' instruction (compliance, not violation)", async () => {
    const result = await runLayerB(
      benignCheckin({ woundDescription: "Dressing looks dry, no redness or swelling." }),
      baseDischarge(),
    );
    expect(result.mode).toBe("keyword_fallback");
    expect(result.flags).toEqual([]);
  });
});

describe("Layer B — LLM path (mocked provider): compliance vs. violation", () => {
  // Regression coverage for a real false positive: a check-in reporting "dressing dry"
  // (compliant with the instruction "Keep the dressing clean and dry for 48 hours") was
  // flagged as a deviation by the live LLM path, because the prompt didn't distinguish
  // "instruction followed" from "instruction violated" for wound_care_instruction signals —
  // see the file header of lib/deviation.ts's llmMatch for the fix.
  beforeEach(() => {
    vi.mocked(isAnyChatProviderConfigured).mockReturnValue(true);
    vi.mocked(chatCompletion).mockReset();
  });

  function mockLlmResponse(matches: { signalText: string; reasoning: string }[]) {
    vi.mocked(chatCompletion).mockResolvedValue({
      text: JSON.stringify({ matches }),
      provider: "mock",
      model: "mock",
    });
  }

  it("the prompt sent to the model explicitly instructs it not to flag a followed wound-care instruction", async () => {
    mockLlmResponse([]);

    await runLayerB(
      benignCheckin({ woundDescription: "Looks clean, dressing dry, no redness." }),
      baseDischarge(),
    );

    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const [messages] = vi.mocked(chatCompletion).mock.calls[0]!;
    const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
    expect(systemPrompt).toContain("wound_care_instruction");
    expect(systemPrompt.toLowerCase()).toMatch(/violat/);
    // Anchored to the exact regression scenario, so a future prompt edit that drops this
    // example is caught here rather than only in production.
    expect(systemPrompt.toLowerCase()).toContain("dressing dry");
  });

  it("does not escalate when the model correctly reports no violation for a compliant wound-care mention", async () => {
    mockLlmResponse([]);

    const result = await evaluateDeviation(
      benignCheckin({ woundDescription: "Looks clean, dressing dry, no redness." }),
      baseDischarge(),
    );
    expect(result.layerBFlags).toEqual([]);
    expect(result.escalate).toBe(false);
  });

  it("still escalates via the LLM path when the model correctly reports an actual violation", async () => {
    mockLlmResponse([
      {
        signalText: "Keep the dressing clean and dry for 48 hours.",
        reasoning: "Patient reports the dressing got soaked in the shower, violating the instruction.",
      },
    ]);

    const result = await evaluateDeviation(
      benignCheckin({ woundDescription: "Dressing got soaked in the shower this morning." }),
      baseDischarge(),
    );
    expect(result.layerBFlags.length).toBeGreaterThan(0);
    expect(result.escalate).toBe(true);
  });
});

describe("evaluateDeviation — combination rule", () => {
  it("escalates when only Layer A fires and Layer B is calm", async () => {
    const result = await evaluateDeviation(
      benignCheckin({ chestPain: true }),
      baseDischarge(),
    );
    expect(result.layerAFlags.length).toBeGreaterThan(0);
    expect(result.layerBFlags).toEqual([]);
    expect(result.escalate).toBe(true);
  });

  it("escalates when only Layer B fires and Layer A is calm", async () => {
    const result = await evaluateDeviation(
      benignCheckin({
        woundDescription: "Redness spreading beyond the incision line since yesterday.",
      }),
      baseDischarge(),
    );
    expect(result.layerAFlags).toEqual([]);
    expect(result.layerBFlags.length).toBeGreaterThan(0);
    expect(result.escalate).toBe(true);
  });

  it("does not escalate when both layers are calm", async () => {
    const result = await evaluateDeviation(benignCheckin(), baseDischarge());
    expect(result.escalate).toBe(false);
    expect(result.allFlags).toEqual([]);
  });

  it("Layer A firing is never suppressed by an otherwise calm Layer B", async () => {
    const result = await evaluateDeviation(
      benignCheckin({
        temperatureC: 39.2,
        woundDescription: "Everything looks completely normal and unremarkable.",
      }),
      baseDischarge(),
    );
    expect(result.layerBFlags).toEqual([]);
    expect(result.layerAFlags.some((f) => f.code === "fever")).toBe(true);
    expect(result.escalate).toBe(true);
  });
});

describe("hasMeaningfulCheckinData — the untouched-form bug fix", () => {
  it("is false for a fully untouched/default check-in", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin())).toBe(false);
  });

  it("is true when only temperature is provided", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ temperatureC: 36.8 }))).toBe(true);
  });

  it("is true when pain level is explicitly 0 (not the same as untouched/null)", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ painLevel: 0 }))).toBe(true);
  });

  it("is false when pain level is null (untouched)", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ painLevel: null }))).toBe(false);
  });

  it("is true when only wound description text is provided", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ woundDescription: "a bit red" }))).toBe(true);
  });

  it("is true when only a wound photo is provided", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ woundPhotoBase64: "data:image/jpeg;base64,xyz" }))).toBe(true);
  });

  it("is true when only a Layer A checkbox is set, even with nothing else filled — a real red flag must never be blocked by this rule", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ chestPain: true }))).toBe(true);
    expect(hasMeaningfulCheckinData(emptyCheckin({ breathingDifficulty: true }))).toBe(true);
    expect(hasMeaningfulCheckinData(emptyCheckin({ confusionOrFainting: true }))).toBe(true);
  });

  it("is true when bleeding is anything other than 'none'", () => {
    expect(hasMeaningfulCheckinData(emptyCheckin({ bleeding: "mild" }))).toBe(true);
  });
});

describe("evaluateDeviation — insufficientData never reads as 'on track'", () => {
  it("flags insufficientData for a fully untouched check-in, and does not escalate", async () => {
    const result = await evaluateDeviation(emptyCheckin(), baseDischarge());
    expect(result.insufficientData).toBe(true);
    expect(result.escalate).toBe(false);
    expect(result.allFlags).toEqual([]);
  });

  it("does not flag insufficientData once a real (even calm) value is reported", async () => {
    const result = await evaluateDeviation(
      emptyCheckin({ temperatureC: 37.0 }),
      baseDischarge(),
    );
    expect(result.insufficientData).toBe(false);
    expect(result.escalate).toBe(false);
  });

  it("insufficientData is false and escalate is true when a Layer A checkbox alone is set", async () => {
    const result = await evaluateDeviation(
      emptyCheckin({ chestPain: true }),
      baseDischarge(),
    );
    expect(result.insufficientData).toBe(false);
    expect(result.escalate).toBe(true);
  });
});

describe("Layer A — severe pain (>= 8/10)", () => {
  it("does not flag pain level 7", () => {
    expect(checkPainSevere(benignCheckin({ painLevel: 7 }))).toBeNull();
  });

  it("flags pain level 8", () => {
    const flag = checkPainSevere(benignCheckin({ painLevel: 8 }));
    expect(flag).not.toBeNull();
    expect(flag?.code).toBe("severe_pain");
    expect(flag?.source).toBe("layer_a");
    expect(flag?.severity).toBe("critical");
  });

  it("flags pain level 10", () => {
    expect(checkPainSevere(benignCheckin({ painLevel: 10 }))?.code).toBe("severe_pain");
  });

  it("does not flag pain level 0 (explicitly reported zero is not severe)", () => {
    expect(checkPainSevere(benignCheckin({ painLevel: 0 }))).toBeNull();
  });

  it("does not flag when pain level is null (untouched)", () => {
    expect(checkPainSevere(benignCheckin({ painLevel: null }))).toBeNull();
  });
});

describe("Layer A — pain jump (>= 3 point increase vs previous)", () => {
  it("flags exactly +3", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 2 });
    const curr = benignCheckin({ dayNumber: 3, painLevel: 5 });
    const flag = checkPainJump(curr, prev);
    expect(flag).not.toBeNull();
    expect(flag?.code).toBe("pain_jump");
    expect(flag?.source).toBe("layer_a");
    expect(flag?.severity).toBe("critical");
  });

  it("does not flag +2", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 2 });
    const curr = benignCheckin({ dayNumber: 3, painLevel: 4 });
    expect(checkPainJump(curr, prev)).toBeNull();
  });

  it("flags +5", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 1 });
    const curr = benignCheckin({ dayNumber: 3, painLevel: 6 });
    expect(checkPainJump(curr, prev)?.code).toBe("pain_jump");
  });

  it("does not fire on the first check-in (no previous)", () => {
    expect(checkPainJump(benignCheckin({ painLevel: 9 }), null)).toBeNull();
  });

  it("does not flag when current pain is null (untouched)", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 2 });
    expect(checkPainJump(benignCheckin({ painLevel: null }), prev)).toBeNull();
  });

  it("does not flag when previous pain is null", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: null });
    expect(checkPainJump(benignCheckin({ painLevel: 8 }), prev)).toBeNull();
  });

  it("does not flag a decrease in pain", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 7 });
    expect(checkPainJump(benignCheckin({ painLevel: 2 }), prev)).toBeNull();
  });
});

describe("runLayerARulesWithHistory — pain rules included", () => {
  it("includes severe_pain flag from the current check-in", () => {
    const flags = runLayerARulesWithHistory(
      benignCheckin({ painLevel: 9 }),
      null,
    );
    expect(flags.some((f) => f.code === "severe_pain")).toBe(true);
  });

  it("includes pain_jump flag when there is a spike vs previous", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 1 });
    const flags = runLayerARulesWithHistory(
      benignCheckin({ dayNumber: 3, painLevel: 5 }),
      prev,
    );
    expect(flags.some((f) => f.code === "pain_jump")).toBe(true);
  });

  it("does not include pain_jump on the first check-in", () => {
    const flags = runLayerARulesWithHistory(
      benignCheckin({ painLevel: 5 }),
      null,
    );
    expect(flags.some((f) => f.code === "pain_jump")).toBe(false);
  });

  it("still includes existing rules alongside the new ones", () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 1 });
    const flags = runLayerARulesWithHistory(
      benignCheckin({ dayNumber: 3, painLevel: 9, temperatureC: 39.0 }),
      prev,
    );
    const codes = flags.map((f) => f.code).sort();
    expect(codes).toContain("fever");
    expect(codes).toContain("severe_pain");
    expect(codes).toContain("pain_jump");
  });
});

describe("evaluateDeviation — pain rules through the full pipeline", () => {
  it("escalates on pain 8 with no other flags", async () => {
    const result = await evaluateDeviation(
      benignCheckin({ painLevel: 8, temperatureC: 37.0, woundDescription: "" }),
      baseDischarge(),
    );
    expect(result.escalate).toBe(true);
    expect(result.layerAFlags.some((f) => f.code === "severe_pain")).toBe(true);
    expect(result.insufficientData).toBe(false);
  });

  it("does not escalate on pain 7 with no other flags", async () => {
    const result = await evaluateDeviation(
      benignCheckin({ painLevel: 7, temperatureC: 37.0, woundDescription: "" }),
      baseDischarge(),
    );
    expect(result.escalate).toBe(false);
  });

  it("escalates on a +3 pain jump even when absolute level is below 8", async () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 2 });
    const result = await evaluateDeviation(
      benignCheckin({ dayNumber: 3, painLevel: 5 }),
      baseDischarge(),
      undefined,
      prev,
    );
    expect(result.escalate).toBe(true);
    expect(result.layerAFlags.some((f) => f.code === "pain_jump")).toBe(true);
  });

  it("does not escalate on a +2 pain jump", async () => {
    const prev = benignCheckin({ dayNumber: 2, painLevel: 2 });
    const result = await evaluateDeviation(
      benignCheckin({ dayNumber: 3, painLevel: 4 }),
      baseDischarge(),
      undefined,
      prev,
    );
    expect(result.escalate).toBe(false);
  });

  it("first check-in with no previous does not break and does not fire pain_jump", async () => {
    const result = await evaluateDeviation(
      benignCheckin({ painLevel: 5 }),
      baseDischarge(),
      undefined,
      null,
    );
    expect(result.layerAFlags.some((f) => f.code === "pain_jump")).toBe(false);
    expect(result.escalate).toBe(false);
  });

  it("pain 0 vs null: 0 does not fire severe_pain, null does not fire anything", async () => {
    const result0 = await evaluateDeviation(
      benignCheckin({ painLevel: 0 }),
      baseDischarge(),
      undefined,
      null,
    );
    expect(result0.escalate).toBe(false);
    expect(result0.insufficientData).toBe(false);

    const resultNull = await evaluateDeviation(
      benignCheckin({ painLevel: null, temperatureC: null, woundDescription: "" }),
      baseDischarge(),
      undefined,
      null,
    );
    expect(resultNull.escalate).toBe(false);
    expect(resultNull.insufficientData).toBe(true);
  });

  it("Layer B cannot suppress a severe_pain flag", async () => {
    const result = await evaluateDeviation(
      benignCheckin({
        painLevel: 9,
        woundDescription: "Everything looks completely normal and unremarkable.",
      }),
      baseDischarge(),
    );
    expect(result.layerBFlags).toEqual([]);
    expect(result.layerAFlags.some((f) => f.code === "severe_pain")).toBe(true);
    expect(result.escalate).toBe(true);
  });
});
