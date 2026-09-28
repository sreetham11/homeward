// Whether this patient's own discharge data is complete enough to actually rely on — for the
// caregiver dashboard notice (components/DataQualityNotice.tsx) and anything else that wants to
// know before trusting Layer B (lib/deviation.ts), which compares check-ins against
// doctorStatedWarningSigns. Kept as its own pure, zero-import file (same pattern as
// lib/checkinValidation.ts) so a 'use client' component can use it without pulling in heavier
// lib/ modules.
import type { DischargeData } from "./types";

/** Below this many doctor-stated warning signs, Layer B has too little of this patient's own
 * plan to compare a check-in against meaningfully. */
export const MIN_WARNING_SIGNS = 2;

/**
 * True when this patient's discharge data is too sparse to trust as-is: either the parser
 * itself flagged the source document as unreadable/incomplete (`needsManualReview`), or it came
 * back readable but extracted fewer than MIN_WARNING_SIGNS doctor-stated warning signs. Either
 * way, a caregiver should be told to check the discharge summary directly rather than assume
 * the app captured everything.
 */
export function hasLimitedWarningSignData(discharge: DischargeData): boolean {
  return discharge.needsManualReview || discharge.doctorStatedWarningSigns.length < MIN_WARNING_SIGNS;
}
