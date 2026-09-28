// Deterministic, zero-dependency medication frequency parsing.
//
// Kept separate from lib/planBuilder.ts so client components (e.g. OnboardingFlow.tsx) can
// check whether a frequency needs review without pulling in lib/llm.ts's server-only SDKs.

export interface FrequencyParseResult {
  times: string[];
  needsReview: boolean;
}

export function reminderTimesForFrequency(frequency: string): FrequencyParseResult {
  const f = frequency.toLowerCase();
  if (/\bprn\b|as needed|as required/.test(f)) return { times: ["PRN"], needsReview: false };
  if (/\bonce\b|\bdaily\b(?!.*twice)|\bqd\b|once a day|once daily/.test(f) && !/twice|three|four|\bbid\b|\btid\b|\bqid\b/.test(f)) {
    return { times: ["09:00"], needsReview: false };
  }
  if (/twice|\bbid\b|every 12 hours|two times/.test(f)) return { times: ["08:00", "20:00"], needsReview: false };
  if (/three times|thrice|\btid\b|every 8 hours/.test(f)) return { times: ["06:00", "14:00", "22:00"], needsReview: false };
  if (/four times|\bqid\b|every 6 hours/.test(f)) return { times: ["06:00", "12:00", "18:00", "00:00"], needsReview: false };
  if (/every 4 hours/.test(f)) return { times: ["06:00", "10:00", "14:00", "18:00", "22:00"], needsReview: false };
  // Unrecognized phrasing: do not guess a schedule. The caller will flag this medication for review.
  return { times: [], needsReview: true };
}

/** Public helper so the UI can flag medications with unparseable frequencies before a plan is built. */
export function medicationNeedsScheduleReview(frequency: string): boolean {
  return reminderTimesForFrequency(frequency).needsReview;
}
