// Stage 1 — Discharge Parser Agent.
//
// Turns an unstructured discharge document (pasted text, or a photo of a printed/handwritten
// sheet) into the structured DischargeData shape everything downstream depends on. This is a
// document-understanding problem, not a lookup problem: every discharge sheet is phrased
// differently, so we lean on the LLM to read and extract rather than pattern-match a fixed
// template.
//
// Text path uses the failover chat chain in lib/llm.ts. Photo path calls Gemini directly
// (lib/llm.ts's callGeminiVision) since multimodal input isn't available through the
// OpenAI-compatible failover tiers used for plain chat.
//
// Golden rule: never fabricate. If the document is unreadable, incomplete, or the model's
// output doesn't validate, we return a partial object with needsManualReview: true rather
// than guessing — and doctorStatedWarningSigns in particular must be extracted verbatim,
// never invented or generalized, because Layer B of lib/deviation.ts trusts this field as
// ground truth for this specific patient.
//
// Input validation (this is the part that keeps garbage like "lol" from ever reaching a
// generated plan): a cheap length check catches trivially empty/short input for free before
// any model call, and — since a short-but-present string alone can't prove real medical
// content — the SAME extraction call also asks the model to first judge whether the document
// plausibly IS a discharge summary at all (isValidDischargeDocument/invalidReason on the raw
// LLM JSON, stripped back off before returning DischargeData). This is one call, not two: the
// plausibility check rides along with extraction rather than costing a separate round trip.
// Both the text and photo paths return a ParseResult so a rejection is a distinct case from a
// successful-but-needs-review parse — app/api/parse/route.ts turns `ok: false` into a 422 so
// the client's existing error-handling path naturally refuses to advance past step 1 (see
// OnboardingFlow.tsx's handleParse — it only calls setStep("review") after a 2xx response).
// "Fill in manually" is a completely separate code path (OnboardingFlow.tsx's useManualEntry)
// and never touches this file or calls a model at all — it's gated instead by the deterministic
// junk-value checks in lib/manualEntryValidation.ts, enforced by OnboardingFlow.tsx's "manual"
// step before the user can reach step 2's review screen.

import { z } from "zod";
import {
  callGeminiVision,
  chatCompletion,
  extractJsonBlock,
  isAnyChatProviderConfigured,
  isGeminiConfigured,
} from "./llm";
import type { DischargeData } from "./types";

const medicationSchema = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  duration: z.string(),
});

// Internal to this file only — isValidDischargeDocument/invalidReason are a parsing-time
// concern, not part of the shared DischargeData shape every other stage depends on. See
// toParseResult() for where they get stripped back off.
const rawExtractionSchema = z.object({
  isValidDischargeDocument: z.boolean(),
  invalidReason: z.string().nullable().optional(),
  diagnosis: z.string(),
  procedureType: z.string(),
  medications: z.array(medicationSchema),
  woundCareInstructions: z.array(z.string()),
  activityRestrictions: z.array(z.string()),
  followUpDate: z.string().nullable(),
  followUpLocation: z.string().nullable(),
  doctorStatedWarningSigns: z.array(z.string()),
  // Nullable here even though DischargeData.dischargeDate is a non-null string: a model that
  // (correctly) flags a document as invalid has no real discharge date to report and, despite
  // the prompt's "empty default" instruction, sometimes sends null rather than "" for it. That
  // must not fail the whole parse — see toParseResult(), which is the only place this gets
  // coalesced to a real string, and only for the ok:true (valid document) branch.
  dischargeDate: z.string().nullable(),
  needsManualReview: z.boolean(),
  manualReviewNotes: z.array(z.string()).optional(),
});

const EXTRACTION_INSTRUCTIONS = `You extract structured data from a hospital discharge summary.

FIRST, judge whether this document plausibly IS a real hospital discharge summary — does it
read like real medical documentation (some combination of a diagnosis/condition, medications,
care instructions, follow-up plans, warning signs, etc)? Casual text, small talk, unrelated
content, gibberish, or a photo of something that isn't a medical document is NOT a discharge
summary, no matter how long it is. Be reasonably strict, but if it's genuinely messy/informal
yet clearly medical in nature, treat it as valid and use needsManualReview for the gaps instead
of rejecting it.

If it is NOT plausibly a discharge summary: set "isValidDischargeDocument" to false, give a
short one-sentence "invalidReason" explaining why, and leave every other field at its empty
default (empty string/array, null, "needsManualReview": true, empty "manualReviewNotes") —
do not extract or fabricate any data in this case.

If it IS plausibly a discharge summary: set "isValidDischargeDocument" to true and extract data
following these rules:
- Extract ONLY what is literally written in the document. Never infer, generalize, or invent
  a fact that isn't stated.
- "doctorStatedWarningSigns" must be copied close to VERBATIM from the document — these are
  the specific phrases the doctor used to describe when the patient should seek help. Do not
  paraphrase them into generic categories; specificity matters more than tidiness.
- If a field is not present in the document, use an empty string / empty array / null as
  appropriate. Do not fabricate a plausible-sounding value.
- If large parts of the document are unreadable, garbled, or clearly incomplete, set
  "needsManualReview": true and explain what's missing in "manualReviewNotes". Otherwise set
  "needsManualReview": false.
- Dates should be ISO format (YYYY-MM-DD) when a specific date is stated; otherwise null.

Respond with strict JSON only, matching exactly this shape:
{
  "isValidDischargeDocument": boolean,
  "invalidReason": string | null,
  "diagnosis": string,
  "procedureType": string,
  "medications": [{ "name": string, "dosage": string, "frequency": string, "duration": string }],
  "woundCareInstructions": string[],
  "activityRestrictions": string[],
  "followUpDate": string | null,
  "followUpLocation": string | null,
  "doctorStatedWarningSigns": string[],
  "dischargeDate": string,
  "needsManualReview": boolean,
  "manualReviewNotes": string[]
}`;

/** Minimum pasted-text length before we even attempt a model call — catches trivially empty or
 * one-word input ("lol") for free. Deliberately loose (real discharge summaries are much
 * longer than this); the model-side isValidDischargeDocument check is the real gate for
 * anything that's merely long enough but not actually medical content. */
export const MIN_DISCHARGE_TEXT_LENGTH = 50;

const DEFAULT_INVALID_REASON =
  'This doesn\'t look like a discharge summary — please paste the actual text from your discharge document, or use "Fill in manually" instead.';

export type ParseResult = { ok: true; discharge: DischargeData } | { ok: false; reason: string };

function manualReviewFallback(reason: string): DischargeData {
  return {
    diagnosis: "",
    procedureType: "",
    medications: [],
    woundCareInstructions: [],
    activityRestrictions: [],
    followUpDate: null,
    followUpLocation: null,
    doctorStatedWarningSigns: [],
    dischargeDate: new Date().toISOString().slice(0, 10),
    needsManualReview: true,
    manualReviewNotes: [reason],
  };
}

function parseModelOutput(rawText: string): z.infer<typeof rawExtractionSchema> {
  const json = JSON.parse(extractJsonBlock(rawText));
  return rawExtractionSchema.parse(json);
}

/** Splits the model's raw (isValidDischargeDocument-tagged) output into a ParseResult — a
 * rejection never reaches DischargeData at all, so nothing downstream can accidentally treat
 * a rejected document as real patient data. */
function toParseResult(parsed: z.infer<typeof rawExtractionSchema>): ParseResult {
  if (!parsed.isValidDischargeDocument) {
    return { ok: false, reason: parsed.invalidReason?.trim() || DEFAULT_INVALID_REASON };
  }
  const { isValidDischargeDocument: _valid, invalidReason: _reason, ...rest } = parsed;
  return {
    ok: true,
    discharge: { ...rest, dischargeDate: rest.dischargeDate ?? new Date().toISOString().slice(0, 10) },
  };
}

/** Stage 1, text path: pasted discharge summary text -> structured DischargeData. */
export async function parseDischargeText(text: string): Promise<ParseResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: 'No discharge text was provided — please paste the discharge summary, or use "Fill in manually" instead.',
    };
  }
  if (trimmed.length < MIN_DISCHARGE_TEXT_LENGTH) {
    return {
      ok: false,
      reason:
        'This looks too short to be a real discharge summary — please paste more of the document, or use "Fill in manually" instead.',
    };
  }
  if (!isAnyChatProviderConfigured()) {
    // No provider configured means we can't run the plausibility check OR extraction at all —
    // degrade to manual review rather than blocking the zero-key demo path (see CLAUDE.md).
    // Validation is a "nice to have on top of" the LLM-optional pipeline, not a reason to make
    // the whole app depend on an API key.
    return {
      ok: true,
      discharge: manualReviewFallback(
        "No LLM provider is configured — please fill in the discharge details manually.",
      ),
    };
  }

  try {
    const result = await chatCompletion(
      [
        { role: "system", content: EXTRACTION_INSTRUCTIONS },
        { role: "user", content: text },
      ],
      { temperature: 0, jsonMode: true },
    );
    return toParseResult(parseModelOutput(result.text));
  } catch (err) {
    // A transient extraction failure (network/API error) is not the same thing as "this isn't
    // a discharge summary" — don't reject a possibly-real document just because the model call
    // failed, fall back to manual review like every other LLM-optional stage in this app.
    return {
      ok: true,
      discharge: manualReviewFallback(
        `Automatic extraction failed (${err instanceof Error ? err.message : "unknown error"}) — please fill in the discharge details manually.`,
      ),
    };
  }
}

/** Stage 1, photo path: a photo of a discharge sheet -> structured DischargeData via Gemini vision. */
export async function parseDischargePhoto(imageBase64: string, mimeType: string): Promise<ParseResult> {
  if (!isGeminiConfigured()) {
    return {
      ok: true,
      discharge: manualReviewFallback(
        "Photo parsing requires a Gemini API key, which is not configured. Please paste the discharge text instead, or fill in the details manually.",
      ),
    };
  }

  try {
    const rawText = await callGeminiVision({
      prompt: `${EXTRACTION_INSTRUCTIONS}\n\nThe document is provided as an image below.`,
      imageBase64,
      mimeType,
    });
    return toParseResult(parseModelOutput(rawText));
  } catch (err) {
    return {
      ok: true,
      discharge: manualReviewFallback(
        `Automatic photo extraction failed (${err instanceof Error ? err.message : "unknown error"}) — please paste the discharge text instead, or fill in the details manually.`,
      ),
    };
  }
}
