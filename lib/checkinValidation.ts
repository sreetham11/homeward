// The "does this check-in actually carry any signal" rule.
//
// The authoritative caller is lib/deviation.ts (server side): it uses this to mark a
// submitted check-in `insufficientData` rather than silently reading it as "all clear." A
// direct POST to /api/checkin bypasses the UI entirely, so this rule MUST be enforced
// server-side regardless of what the client collects. (The conversational check-in in
// components/ConversationalCheckin.tsx makes every patient answer a fixed-choice pain
// question, so a real submission always has a non-null painLevel and clears this bar — but
// that convenience must never be mistaken for the safety guarantee, which lives on the
// server.) Keeping this in its own file with zero imports beyond ./types is deliberate:
// lib/deviation.ts transitively imports lib/llm.ts (the OpenAI/Gemini SDKs), which must never
// end up in a client bundle just because a 'use client' component needed one small pure
// function from the same file.
//
// What counts as "meaningful": an explicit temperature, an explicit pain level, wound text or
// a wound photo, or any of the Layer A symptom answers/bleeding level being positively set.
// That last part matters: if we only accepted temperature/pain/wound text, a patient who
// reports "chest pain" but nothing else would be treated as insufficient — which would make
// this rule strictly more dangerous than the bug it's closing. A real Layer A signal always
// counts as sufficient on its own.
import type { BleedingLevel } from "./types";

export interface CheckinSignalFields {
  temperatureC: number | null;
  painLevel: number | null;
  bleeding: BleedingLevel;
  breathingDifficulty: boolean;
  chestPain: boolean;
  confusionOrFainting: boolean;
  woundDescription: string;
  woundPhotoBase64: string | null;
}

export function hasMeaningfulCheckinData(input: CheckinSignalFields): boolean {
  return (
    input.temperatureC != null ||
    input.painLevel != null ||
    input.woundDescription.trim().length > 0 ||
    !!input.woundPhotoBase64 ||
    input.breathingDifficulty ||
    input.chestPain ||
    input.confusionOrFainting ||
    input.bleeding !== "none"
  );
}
