// Wound photo -> objective visual description. Never diagnoses.
//
// This sits in front of Layer B (lib/deviation.ts): the vision model's job is purely to turn
// a photo into neutral, factual text (redness, swelling, discharge, whether edges look closed)
// that Layer B can then compare against the patient's own doctorStatedWarningSigns and
// woundCareInstructions. The vision call itself must never say "infected," name a condition,
// or otherwise render a verdict — that would bypass the "AI drafts, human decides" rule by
// smuggling a diagnosis into a "description."
//
// Direct Gemini call (not the failover chain) for the same reason as lib/parser.ts's photo
// path: multimodal input needs a vision-capable model, not the OpenAI-compatible text tiers.

import { callGeminiVision, isGeminiConfigured } from "./llm";

const VISION_PROMPT = `You are an objective visual description assistant for a wound photo taken
by a patient at home. Describe strictly what is visibly present, in neutral factual terms a
nurse could read at a glance:
- Color and extent of any redness
- Any visible swelling
- Any discharge or drainage (color/amount, if visible)
- Whether the wound edges appear closed or separated
- Presence and condition of any dressing/bandage

Do NOT diagnose. Do NOT name a medical condition. Do NOT say words like "infected",
"infection", or give any medical verdict or severity judgment — only describe what is visibly
present. If the image doesn't clearly show a wound, say so plainly instead of guessing.
Respond with 2-4 short sentences of plain description, no preamble.`;

/**
 * Returns an objective description string, or null if vision isn't available (no Gemini key,
 * or the call failed) — callers should treat null as "no photo signal" and continue with
 * text-only deviation checking rather than blocking the check-in.
 */
export async function describeWoundPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<string | null> {
  if (!isGeminiConfigured()) return null;

  try {
    const description = await callGeminiVision({
      prompt: VISION_PROMPT,
      imageBase64,
      mimeType,
    });
    return description.trim() || null;
  } catch (err) {
    console.error("describeWoundPhoto failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
