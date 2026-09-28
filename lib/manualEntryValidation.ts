// Deterministic, zero-model junk-value guard for the "Fill in manually" path
// (components/OnboardingFlow.tsx's useManualEntry / the "manual" step). Mirrors the spirit of
// lib/parser.ts's cheap MIN_DISCHARGE_TEXT_LENGTH pre-check and lib/askHomeward.ts's
// looksSymptomRelated guard: a fixed, client-safe check that never needs an API key, since
// manual entry must keep working in the zero-key demo path same as every other stage (see
// CLAUDE.md). This is NOT a replacement for lib/parser.ts's model-assisted
// isValidDischargeDocument check — that judges whether an entire pasted document plausibly
// reads as a discharge summary; this only judges whether a single field a patient/caregiver
// typed by hand looks like real content instead of a placeholder ("lol", "test", "n/a", ...).
//
// Kept import-free (beyond ./types) so it's safe in a 'use client' bundle, same reasoning as
// lib/checkinValidation.ts.
import type { DischargeData } from "./types";

const JUNK_VALUES = new Set([
  "lol", "lmao", "haha", "test", "testing", "test123", "asdf", "asdfasdf", "qwerty",
  "n a", "na", "none", "nil", "null", "undefined", "idk", "xxx", "abc", "123", "1234",
  "todo", "tbd", "placeholder", "sample", "example", "foo", "bar", "foobar", "hello",
  "hi", "hey", "blah", "whatever", "dummy", "fake", "random", "unknown", "asd",
]);

const MIN_FIELD_LENGTH = 3;

/** True when `value` is empty, a known placeholder/junk phrase, an all-repeated-character run
 * ("aaaa", "1111"), or too short to plausibly be real medical content. */
export function isJunkText(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < MIN_FIELD_LENGTH) return true;
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!normalized || normalized.length < MIN_FIELD_LENGTH) return true;
  if (JUNK_VALUES.has(normalized)) return true;
  const noSpaces = normalized.replace(/\s/g, "");
  if (/^(.)\1*$/.test(noSpaces)) return true; // "aaaa", "1111", "......"
  return false;
}

/** True when none of `values` is real (non-junk) content — the "this whole list is still
 * effectively empty" check for the array-shaped DischargeData fields. */
function allJunk(values: string[]): boolean {
  return values.length === 0 || values.every(isJunkText);
}

export interface ManualEntryErrors {
  diagnosis?: string;
  procedureType?: string;
  medications?: string;
  woundCareInstructions?: string;
  activityRestrictions?: string;
  followUpDate?: string;
  doctorStatedWarningSigns?: string;
}

/** Field-by-field validation for the manual-entry form. Returns an empty object when every
 * required field carries real content — see isManualDischargeComplete for the boolean form. */
export function validateManualDischarge(discharge: DischargeData): ManualEntryErrors {
  const errors: ManualEntryErrors = {};

  if (isJunkText(discharge.diagnosis)) {
    errors.diagnosis = "Enter the real diagnosis or condition — not a placeholder.";
  }
  if (isJunkText(discharge.procedureType)) {
    errors.procedureType = "Enter the real procedure type — not a placeholder.";
  }
  if (discharge.medications.length === 0 || discharge.medications.every((m) => isJunkText(m.name) || isJunkText(m.dosage) || isJunkText(m.frequency))) {
    errors.medications = "Add at least one real medication with a name, dosage, and frequency.";
  }
  if (allJunk(discharge.woundCareInstructions)) {
    errors.woundCareInstructions = "Add at least one real wound care instruction.";
  }
  if (allJunk(discharge.activityRestrictions)) {
    errors.activityRestrictions = "Add at least one real activity restriction.";
  }
  if (!discharge.followUpDate) {
    errors.followUpDate = "Enter a follow-up date.";
  }
  if (allJunk(discharge.doctorStatedWarningSigns)) {
    errors.doctorStatedWarningSigns = "Add at least one real warning sign to watch for.";
  }

  return errors;
}

export function isManualDischargeComplete(discharge: DischargeData): boolean {
  return Object.keys(validateManualDischarge(discharge)).length === 0;
}
