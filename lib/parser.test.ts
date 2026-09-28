import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseDischargeText, parseDischargePhoto, MIN_DISCHARGE_TEXT_LENGTH } from "./parser";

// Mocked only for the "model-side rejection" describe block below. The test environment has no
// real chat/Gemini provider keys configured, so every other test here exercises the deterministic
// (no-provider) fallback path for exactly that reason — same pattern as deviation.test.ts's LLM
// mocking, including the file-level afterEach reset to avoid leaking the mock into other tests.
vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return {
    ...actual,
    chatCompletion: vi.fn(),
    callGeminiVision: vi.fn(),
    isAnyChatProviderConfigured: vi.fn(),
    isGeminiConfigured: vi.fn(),
  };
});
import { chatCompletion, callGeminiVision, isAnyChatProviderConfigured, isGeminiConfigured } from "./llm";

afterEach(() => {
  vi.mocked(isAnyChatProviderConfigured).mockReturnValue(false);
  vi.mocked(isGeminiConfigured).mockReturnValue(false);
  vi.mocked(chatCompletion).mockReset();
  vi.mocked(callGeminiVision).mockReset();
});

const REAL_DISCHARGE_TEXT = `
Patient discharged following laparoscopic appendectomy. Diagnosis: acute appendicitis.
Medications: Amoxicillin 500mg twice daily for 7 days. Keep incision dry for 48 hours.
No heavy lifting for 2 weeks. Follow up in 2 weeks. Seek care for fever above 38C.
`;

describe("parseDischargeText — free (no model call) validation", () => {
  it("rejects empty text", async () => {
    const result = await parseDischargeText("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("fill in manually");
  });

  it("rejects whitespace-only text", async () => {
    const result = await parseDischargeText("   \n\t  ");
    expect(result.ok).toBe(false);
  });

  it("rejects trivially short text like 'lol' without ever calling a model", async () => {
    const result = await parseDischargeText("lol");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("too short");
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("the minimum length threshold is genuinely enforced", async () => {
    const justUnder = "a".repeat(MIN_DISCHARGE_TEXT_LENGTH - 1);
    const result = await parseDischargeText(justUnder);
    expect(result.ok).toBe(false);
  });
});

describe("parseDischargeText — zero-key fallback (degrades to manual review, never rejects)", () => {
  it("long-enough text with no provider configured falls back to manual review, not a rejection", async () => {
    const result = await parseDischargeText(REAL_DISCHARGE_TEXT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discharge.needsManualReview).toBe(true);
      expect(result.discharge.manualReviewNotes?.[0]).toContain("No LLM provider");
    }
  });
});

describe("parseDischargeText — model-side plausibility rejection (mocked provider)", () => {
  beforeEach(() => {
    vi.mocked(isAnyChatProviderConfigured).mockReturnValue(true);
  });

  it("the extraction prompt instructs the model to judge plausibility before extracting", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      text: JSON.stringify({
        isValidDischargeDocument: true,
        invalidReason: null,
        diagnosis: "Appendicitis",
        procedureType: "Appendectomy",
        medications: [],
        woundCareInstructions: [],
        activityRestrictions: [],
        followUpDate: null,
        followUpLocation: null,
        doctorStatedWarningSigns: [],
        dischargeDate: "2026-07-01",
        needsManualReview: false,
        manualReviewNotes: [],
      }),
      provider: "mock",
      model: "mock",
    });

    await parseDischargeText(REAL_DISCHARGE_TEXT);

    const [messages] = vi.mocked(chatCompletion).mock.calls[0]!;
    const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";
    expect(systemPrompt).toContain("isValidDischargeDocument");
    expect(systemPrompt.toLowerCase()).toContain("plausibly");
  });

  it("rejects when the model reports the document is not plausibly a discharge summary", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      text: JSON.stringify({
        isValidDischargeDocument: false,
        invalidReason: "This text is casual conversation, not medical documentation.",
        diagnosis: "",
        procedureType: "",
        medications: [],
        woundCareInstructions: [],
        activityRestrictions: [],
        followUpDate: null,
        followUpLocation: null,
        doctorStatedWarningSigns: [],
        dischargeDate: "2026-07-01",
        needsManualReview: true,
        manualReviewNotes: [],
      }),
      provider: "mock",
      model: "mock",
    });

    // Long enough to pass the free length check, but not remotely medical.
    const result = await parseDischargeText(
      "lol lol lol this is definitely not a real discharge summary just filler words here",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("casual conversation");
  });

  it("still rejects cleanly when the model sends dischargeDate: null for an invalid document (regression: this used to throw a Zod error and wrongly fall through to a manual-review pass-through instead of a rejection)", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      text: JSON.stringify({
        isValidDischargeDocument: false,
        invalidReason: "This is casual filler text, not a discharge summary.",
        diagnosis: "",
        procedureType: "",
        medications: [],
        woundCareInstructions: [],
        activityRestrictions: [],
        followUpDate: null,
        followUpLocation: null,
        doctorStatedWarningSigns: [],
        dischargeDate: null,
        needsManualReview: true,
        manualReviewNotes: [],
      }),
      provider: "mock",
      model: "mock",
    });

    const result = await parseDischargeText(
      "lol lol lol lol lol lol lol lol lol lol lol lol lol this is just filler text repeated",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("casual filler text");
  });

  it("accepts and returns DischargeData (without the validity-check fields) when the model confirms it's real", async () => {
    vi.mocked(chatCompletion).mockResolvedValue({
      text: JSON.stringify({
        isValidDischargeDocument: true,
        invalidReason: null,
        diagnosis: "Acute appendicitis",
        procedureType: "Laparoscopic appendectomy",
        medications: [],
        woundCareInstructions: ["Keep incision dry for 48 hours"],
        activityRestrictions: [],
        followUpDate: null,
        followUpLocation: null,
        doctorStatedWarningSigns: ["Fever above 38C"],
        dischargeDate: "2026-07-01",
        needsManualReview: false,
        manualReviewNotes: [],
      }),
      provider: "mock",
      model: "mock",
    });

    const result = await parseDischargeText(REAL_DISCHARGE_TEXT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.discharge.diagnosis).toBe("Acute appendicitis");
      expect(result.discharge).not.toHaveProperty("isValidDischargeDocument");
      expect(result.discharge).not.toHaveProperty("invalidReason");
    }
  });
});

describe("parseDischargePhoto", () => {
  it("falls back to manual review (not a rejection) when Gemini isn't configured", async () => {
    const result = await parseDischargePhoto("base64data", "image/jpeg");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.discharge.needsManualReview).toBe(true);
  });

  it("rejects when Gemini vision reports the photo isn't plausibly a discharge document", async () => {
    vi.mocked(isGeminiConfigured).mockReturnValue(true);
    vi.mocked(callGeminiVision).mockResolvedValue(
      JSON.stringify({
        isValidDischargeDocument: false,
        invalidReason: "This image shows a cat, not a medical document.",
        diagnosis: "",
        procedureType: "",
        medications: [],
        woundCareInstructions: [],
        activityRestrictions: [],
        followUpDate: null,
        followUpLocation: null,
        doctorStatedWarningSigns: [],
        dischargeDate: "2026-07-01",
        needsManualReview: true,
        manualReviewNotes: [],
      }),
    );

    const result = await parseDischargePhoto("base64data", "image/jpeg");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cat");
  });
});
