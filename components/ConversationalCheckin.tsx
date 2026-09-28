"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BleedingLevel,
  CheckinInput,
  CheckinQuestionId,
  CheckinQuestionSpec,
  DayPlan,
  DischargeData,
  EscalationSummary,
  RedFlag,
} from "@/lib/types";
import { Badge } from "./Badge";

// A step-by-step, chat-style check-in. Two things changed from a plain flat form:
//
// 1. The QUESTION SET is per-patient, not a fixed list. On mount this component asks
//    POST /api/checkin/questions (lib/checkinQuestions.ts) which patient-specific ids apply
//    (skip wound questions for a wound-free plan, reference actual medication names, etc.) and
//    how to word each one. The four Layer A safety questions (temperature/breathing/chestPain/
//    confusion) are always in that list, no exceptions — see SAFETY_FLOOR_QUESTION_IDS in
//    lib/checkinQuestions.ts. This component never filters that list further; it only renders
//    whatever ids come back, using the fixed, hardcoded QUESTION_REGISTRY below for the actual
//    button choices, values, and field mapping. The LLM/personalization step only ever supplies
//    the *wording* (`question` text) — it cannot change what's asked or what data is collected.
//
// 2. A brief FOLLOW-UP step is inserted at runtime — never sent from the server — only when a
//    fixed-choice answer suggests something worth clarifying (temperature "38°C or higher",
//    wound redness "Yes", bleeding "moderate"/"heavy or worsening"). It reuses the existing
//    free-text wound-appearance field (or, for a wound-free plan, the general notes field) —
//    not a new field. At most one follow-up per session; a calm/normal check-in never sees it.
//
// Critically unchanged from before: buildCheckin() assembles the exact same CheckinInput shape
// and calls the exact same pipeline via onSubmit(). Every question that feeds Layer A is a
// fixed-choice button, never free text — the deterministic safety net in lib/deviation.ts must
// never depend on regexing prose. See CLAUDE.md's Layer A note.

interface ConversationalCheckinProps {
  patientId: string;
  dayNumber: number;
  discharge: DischargeData;
  todayPlan?: DayPlan;
  /** Runs the real checkin -> deviation -> escalate pipeline and returns the resulting
   * summary, so the closing chat message can reflect the actual result (never hardcoded). */
  onSubmit: (checkin: CheckinInput) => Promise<EscalationSummary>;
}

// Temperature is collected as a coarse button choice, then mapped to a representative number
// so temperatureC stays `number | null` and Layer A's checkFever (temp > 38.0) fires exactly
// as before: "38°C or higher" maps above the threshold, "Below 38°C" clearly under it.
const TEMP_BELOW = 37.5;
const TEMP_AT_OR_ABOVE = 38.5;

// Pain buckets map to a representative number within the bucket. painLevel does NOT feed any
// Layer A rule (verified against lib/deviation.ts) — it's context shown in the summary — so
// bucketing it loses no safety fidelity while keeping the type `number | null`.
const PAIN_OPTIONS: { label: string; value: number }[] = [
  { label: "0–2 (mild)", value: 1 },
  { label: "3–5 (moderate)", value: 4 },
  { label: "6–8 (strong)", value: 7 },
  { label: "9–10 (severe)", value: 9 },
];

// Only injected on an affirmative "Yes" to redness/swelling — never a negated phrase on "No",
// which would put symptom keywords ("redness", "swelling") into the free-text woundDescription
// that Layer B keyword-matches against the patient's own warning signs, risking a false match.
const REDNESS_PHRASE = "Reports redness or swelling around the wound site.";

type Answers = {
  temperatureC: number | null;
  painLevel: number | null;
  medicationTaken: boolean | "partial";
  activityRestrictionFollowed: boolean | "partial" | null;
  bleeding: BleedingLevel;
  breathingDifficulty: boolean;
  chestPain: boolean;
  confusionOrFainting: boolean;
  rednessReported: boolean;
  woundText: string;
  woundPhotoBase64: string | null;
  notes: string;
};

function freshAnswers(): Answers {
  return {
    temperatureC: null,
    painLevel: null,
    medicationTaken: true,
    activityRestrictionFollowed: null,
    bleeding: "none",
    breathingDifficulty: false,
    chestPain: false,
    confusionOrFainting: false,
    rednessReported: false,
    woundText: "",
    woundPhotoBase64: null,
    notes: "",
  };
}

type ChoiceOption = { label: string; warning?: boolean; apply: (a: Answers) => void };

type StepId = CheckinQuestionId | "followUp";

type Step =
  | { kind: "choice"; id: StepId; question: string; options: ChoiceOption[] }
  | {
      kind: "text";
      id: StepId;
      question: string;
      placeholder: string;
      allowPhoto?: boolean;
      apply: (a: Answers, text: string, photo: string | null) => void;
    };

// Fixed, hardcoded, client-side. Every button label, value mapping, and Layer A field
// assignment lives here — the server-assembled question set only ever supplies `id` (which of
// these to show) and personalized `question` wording, never the options or apply logic.
type StepTemplate =
  | { kind: "choice"; options: ChoiceOption[] }
  | { kind: "text"; placeholder: string; allowPhoto?: boolean; apply: (a: Answers, text: string, photo: string | null) => void };

const QUESTION_REGISTRY: Record<CheckinQuestionId, StepTemplate> = {
  pain: {
    kind: "choice",
    options: PAIN_OPTIONS.map((o) => ({
      label: o.label,
      apply: (a) => {
        a.painLevel = o.value;
      },
    })),
  },
  medication: {
    kind: "choice",
    options: [
      { label: "Yes, all of it", apply: (a) => (a.medicationTaken = true) },
      { label: "Partially", apply: (a) => (a.medicationTaken = "partial") },
      { label: "No", warning: true, apply: (a) => (a.medicationTaken = false) },
    ],
  },
  activityRestriction: {
    kind: "choice",
    options: [
      { label: "Yes", apply: (a) => (a.activityRestrictionFollowed = true) },
      { label: "Partially", apply: (a) => (a.activityRestrictionFollowed = "partial") },
      { label: "No", warning: true, apply: (a) => (a.activityRestrictionFollowed = false) },
    ],
  },
  bleeding: {
    kind: "choice",
    options: [
      { label: "None", apply: (a) => (a.bleeding = "none") },
      { label: "Mild (small spot)", apply: (a) => (a.bleeding = "mild") },
      { label: "Moderate", warning: true, apply: (a) => (a.bleeding = "moderate") },
      { label: "Heavy or getting worse", warning: true, apply: (a) => (a.bleeding = "heavy_or_worsening") },
    ],
  },
  redness: {
    kind: "choice",
    options: [
      { label: "No", apply: (a) => (a.rednessReported = false) },
      {
        label: "Yes",
        warning: true,
        apply: (a) => {
          a.rednessReported = true;
          a.woundText = [REDNESS_PHRASE, a.woundText].filter(Boolean).join(" ");
        },
      },
    ],
  },
  temperature: {
    kind: "choice",
    options: [
      { label: "Below 38°C", apply: (a) => (a.temperatureC = TEMP_BELOW) },
      { label: "38°C or higher", warning: true, apply: (a) => (a.temperatureC = TEMP_AT_OR_ABOVE) },
      { label: "I haven't checked", apply: (a) => (a.temperatureC = null) },
    ],
  },
  breathing: {
    kind: "choice",
    options: [
      { label: "No", apply: (a) => (a.breathingDifficulty = false) },
      { label: "Yes", warning: true, apply: (a) => (a.breathingDifficulty = true) },
    ],
  },
  chestPain: {
    kind: "choice",
    options: [
      { label: "No", apply: (a) => (a.chestPain = false) },
      { label: "Yes", warning: true, apply: (a) => (a.chestPain = true) },
    ],
  },
  confusion: {
    kind: "choice",
    options: [
      { label: "No", apply: (a) => (a.confusionOrFainting = false) },
      { label: "Yes", warning: true, apply: (a) => (a.confusionOrFainting = true) },
    ],
  },
  notes: {
    kind: "text",
    placeholder: "Anything else on your mind today?",
    apply: (a, text) => {
      a.notes = text;
    },
  },
};

function buildStepFromSpec(spec: CheckinQuestionSpec): Step {
  const template = QUESTION_REGISTRY[spec.id];
  return { ...template, id: spec.id, question: spec.question } as Step;
}

// Runtime-only follow-up, never sent by the server. Reuses the existing free-text
// wound-appearance field (with photo) for a wound-care patient, or the general notes field
// otherwise — never a new field.
function makeFollowUpStep(hasWoundCare: boolean, trigger: "temperature" | "redness" | "bleeding"): Step {
  const prompts: Record<typeof trigger, string> = {
    temperature: "You mentioned a higher temperature — anything else worth noting about how you're feeling?",
    redness: "You mentioned redness or swelling — can you describe what it looks like, or add a photo?",
    bleeding: "You mentioned some bleeding — can you describe it, or add a photo?",
  };
  return {
    kind: "text",
    id: "followUp",
    question: prompts[trigger],
    placeholder: hasWoundCare ? "e.g. a coin-sized patch near the incision, dressing dry" : "Add any extra detail here",
    allowPhoto: hasWoundCare,
    apply: (a, text, photo) => {
      if (hasWoundCare) {
        a.woundText = [a.woundText, text].filter(Boolean).join(" ");
        if (photo) a.woundPhotoBase64 = photo;
      } else {
        a.notes = [a.notes, text].filter(Boolean).join(" ");
      }
    },
  };
}

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; kind: "text"; text: string; tone?: "warning" }
  | { role: "bot"; kind: "result-flagged"; summary: EscalationSummary };

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function buildReminder(plan?: DayPlan): string | null {
  if (!plan) return null;
  const bits: string[] = [];
  if (plan.isFollowUpDay) bits.push("You have a follow-up appointment today — don't miss it.");
  if (plan.woundCareChecklist.length > 0) bits.push(`Wound care today: ${plan.woundCareChecklist.join("; ")}.`);
  const next = plan.medicationReminders[0];
  if (next) {
    bits.push(
      `Next medication: ${next.medicationName}${next.dosage ? ` (${next.dosage})` : ""} at ${next.time}.`,
    );
  }
  return bits.length > 0 ? bits.slice(0, 2).join(" ") : null;
}

const TYPING_MS = 750;

function HomewardAvatar() {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-homeward-primary text-white">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9h14v-9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-homeward-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function FlagRow({ flag }: { flag: RedFlag }) {
  return (
    <li className="flex items-start gap-2 text-xs text-homeward-muted">
      <Badge tone={flag.source === "layer_a" ? "danger" : "warning"} dot={false} className="shrink-0">
        {flag.source === "layer_a" ? "safety rule" : "plan match"}
      </Badge>
      <span className="pt-0.5">
        {flag.message}
        {flag.matchedAgainst ? ` — matches your plan's note: “${flag.matchedAgainst}”` : ""}
      </span>
    </li>
  );
}

// Reuses the escalation summary's own copy (headline/details/flags/disclaimer) from the real
// pipeline, delivered as the closing chat bubble rather than a separate CaregiverAlert card.
function FlaggedResult({ summary }: { summary: EscalationSummary }) {
  return (
    <div className="rounded-2xl rounded-bl-sm border border-red-200 bg-red-50 px-3.5 py-3 text-sm">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-homeward-ink">{summary.headline}</h4>
        <Badge tone="danger">Flagged</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line leading-relaxed text-homeward-ink">{summary.details}</p>
      {summary.flags.length > 0 && (
        <ul className="mt-3 space-y-2">
          {summary.flags.map((f, i) => (
            <FlagRow key={i} flag={f} />
          ))}
        </ul>
      )}
      <p className="disclaimer mt-3">{summary.disclaimer}</p>
    </div>
  );
}

export function ConversationalCheckin({
  patientId,
  dayNumber,
  discharge,
  todayPlan,
  onSubmit,
}: ConversationalCheckinProps) {
  const openingText = `${greeting()}! It's Day ${dayNumber} after your ${discharge.procedureType || "procedure"}. Let's do today's check-in — it'll take about a minute.`;
  const hasWoundCare = discharge.woundCareInstructions.length > 0;

  const answers = useRef<Answers>(freshAnswers());
  // Source of truth for the assembled step list. A plain ref (not state) so a follow-up can be
  // spliced in synchronously and read back immediately in the same handler — no stale-closure
  // race with React's async state updates. `activeStep` (state) still drives re-renders; by the
  // time a render reads stepsRef.current[activeStep], any same-tick splice has already landed.
  const stepsRef = useRef<Step[] | null>(null);
  const originalStepsRef = useRef<Step[] | null>(null);
  const followUpAsked = useRef(false);
  const fetchedRef = useRef(false);

  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "bot", kind: "text", text: openingText },
  ]);
  const [typing, setTyping] = useState(true);
  const [activeStep, setActiveStep] = useState(-1); // -1 = no dock (typing / between steps / loading)
  const [phase, setPhase] = useState<"asking" | "submitting" | "done" | "error">("asking");
  const [loadFailed, setLoadFailed] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function later(fn: () => void, ms: number) {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  }

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  function loadQuestions() {
    setLoadFailed(false);
    setTyping(true);
    fetch("/api/checkin/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discharge, todayPlan, dayNumber }),
    })
      .then((r) => r.json())
      .then((data: { questions?: CheckinQuestionSpec[] }) => {
        const specs = data.questions ?? [];
        const built = specs.map(buildStepFromSpec);
        const first = built[0];
        if (!first) throw new Error("empty question set");
        later(() => {
          stepsRef.current = built;
          originalStepsRef.current = built;
          setTyping(false);
          setMessages((m) => [...m, { role: "bot", kind: "text", text: first.question }]);
          setDraftText("");
          setDraftPhoto(null);
          setActiveStep(0);
        }, TYPING_MS);
      })
      .catch(() => {
        setTyping(false);
        setLoadFailed(true);
      });
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal a step's question after a short "typing" pause, then enable its dock.
  function revealStep(index: number) {
    const next = stepsRef.current?.[index];
    if (!next) return;
    setActiveStep(-1);
    setTyping(true);
    later(() => {
      setTyping(false);
      setMessages((m) => [...m, { role: "bot", kind: "text", text: next.question }]);
      setDraftText("");
      setDraftPhoto(null);
      setActiveStep(index);
    }, TYPING_MS);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function buildCheckin(): CheckinInput {
    const a = answers.current;
    const woundDescription = [a.woundText.trim()].filter(Boolean).join(" ");
    return {
      patientId,
      dayNumber,
      temperatureC: a.temperatureC,
      painLevel: a.painLevel,
      medicationTaken: a.medicationTaken,
      activityRestrictionFollowed: a.activityRestrictionFollowed,
      bleeding: a.bleeding,
      breathingDifficulty: a.breathingDifficulty,
      chestPain: a.chestPain,
      confusionOrFainting: a.confusionOrFainting,
      woundDescription,
      woundPhotoBase64: a.woundPhotoBase64,
      notes: a.notes,
      submittedAt: new Date().toISOString(),
    };
  }

  async function runSubmit() {
    setActiveStep(-1);
    setPhase("submitting");
    setTyping(true);
    try {
      const summary = await onSubmit(buildCheckin());
      setTyping(false);
      if (summary.escalate) {
        setMessages((m) => [...m, { role: "bot", kind: "result-flagged", summary }]);
      } else {
        setMessages((m) => [
          ...m,
          {
            role: "bot",
            kind: "text",
            text: "Thanks! Based on your responses, your recovery appears to be progressing as expected.",
          },
        ]);
        const reminder = buildReminder(todayPlan);
        if (reminder) {
          later(() => setMessages((m) => [...m, { role: "bot", kind: "text", text: reminder }]), 400);
        }
      }
      setPhase("done");
    } catch {
      setTyping(false);
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          kind: "text",
          text: "Something went wrong submitting your check-in. Please try again.",
          tone: "warning",
        },
      ]);
      setPhase("error");
    }
  }

  function advanceFrom(index: number) {
    const total = stepsRef.current?.length ?? 0;
    if (index >= total - 1) {
      runSubmit();
    } else {
      revealStep(index + 1);
    }
  }

  // Only inserts a follow-up the first time a concerning answer shows up in this session — a
  // calm/normal answer never triggers it, and a second concerning answer later doesn't ask
  // twice. See file header.
  function maybeInsertFollowUp(step: Step, index: number) {
    if (followUpAsked.current || !stepsRef.current) return;
    const a = answers.current;
    let trigger: "temperature" | "redness" | "bleeding" | null = null;
    if (step.id === "temperature" && a.temperatureC === TEMP_AT_OR_ABOVE) trigger = "temperature";
    else if (step.id === "redness" && a.rednessReported) trigger = "redness";
    else if (step.id === "bleeding" && (a.bleeding === "moderate" || a.bleeding === "heavy_or_worsening")) trigger = "bleeding";
    if (!trigger) return;

    followUpAsked.current = true;
    const copy = [...stepsRef.current];
    copy.splice(index + 1, 0, makeFollowUpStep(hasWoundCare, trigger));
    stepsRef.current = copy;
  }

  function handleChoice(index: number, option: ChoiceOption) {
    option.apply(answers.current);
    setMessages((m) => [...m, { role: "user", text: option.label }]);
    const step = stepsRef.current?.[index];
    if (step) maybeInsertFollowUp(step, index);
    advanceFrom(index);
  }

  function handleTextSend(index: number, step: Extract<Step, { kind: "text" }>) {
    const text = draftText.trim();
    step.apply(answers.current, text, draftPhoto);
    const echo = [text, draftPhoto ? "📷 photo added" : ""].filter(Boolean).join(" · ") || "Skipped";
    setMessages((m) => [...m, { role: "user", text: echo }]);
    advanceFrom(index);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setDraftPhoto(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraftPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function restart() {
    answers.current = freshAnswers();
    followUpAsked.current = false;
    stepsRef.current = originalStepsRef.current ? [...originalStepsRef.current] : null;
    const first = stepsRef.current?.[0];
    setMessages([
      { role: "bot", kind: "text", text: "Okay, let's go through today's check-in again." },
      ...(first ? [{ role: "bot", kind: "text", text: first.question } as Message] : []),
    ]);
    setDraftText("");
    setDraftPhoto(null);
    setPhase("asking");
    setActiveStep(0);
  }

  const step = activeStep >= 0 ? stepsRef.current?.[activeStep] ?? null : null;

  return (
    <div id="checkin-form" className="card !p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-homeward-border bg-homeward-forest px-4 py-3">
        <HomewardAvatar />
        <div>
          <p className="text-sm font-semibold text-white">Homeward · Day {dayNumber} check-in</p>
          <p className="text-[11px] text-white/70">One quick question at a time</p>
        </div>
      </div>

      <div ref={scrollRef} className="max-h-[26rem] space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-homeward-primary px-3.5 py-2 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2">
              <HomewardAvatar />
              {m.kind === "result-flagged" ? (
                <div className="max-w-[85%]">
                  <FlaggedResult summary={m.summary} />
                </div>
              ) : (
                <div
                  className={`max-w-[85%] rounded-2xl rounded-bl-sm border px-3.5 py-2 text-sm ${
                    m.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-homeward-border bg-homeward-bg text-homeward-ink"
                  }`}
                >
                  {m.text}
                </div>
              )}
            </div>
          ),
        )}

        {typing && (
          <div className="flex items-start gap-2">
            <HomewardAvatar />
            <div className="rounded-2xl rounded-bl-sm border border-homeward-border bg-homeward-bg px-3.5 py-2">
              <TypingDots />
            </div>
          </div>
        )}
      </div>

      {/* Interaction dock — fixed-choice pills for Layer A/structured steps, text+photo for
          free-text (Layer B / context / follow-up) steps, result actions when done. */}
      <div className="border-t border-homeward-border p-3">
        {step?.kind === "choice" && (
          <div className="flex flex-wrap gap-2">
            {step.options.map((option) => (
              <button
                key={option.label}
                onClick={() => handleChoice(activeStep, option)}
                className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                  option.warning
                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                    : "border-homeward-border bg-homeward-card text-homeward-ink hover:border-homeward-primary hover:text-homeward-primary"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}

        {step?.kind === "text" && (
          <div className="space-y-2">
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={2}
              placeholder={step.placeholder}
              className="input"
            />
            <div className="flex items-center justify-between gap-2">
              {step.allowPhoto ? (
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="block w-full text-xs text-homeward-muted file:mr-2 file:rounded-lg file:border-0 file:bg-homeward-mint file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-homeward-primary"
                />
              ) : (
                <span />
              )}
              <div className="flex shrink-0 gap-2">
                <button onClick={() => handleTextSend(activeStep, step)} className="btn-secondary py-2 text-sm">
                  Skip
                </button>
                <button
                  onClick={() => handleTextSend(activeStep, step)}
                  disabled={!draftText.trim() && !draftPhoto}
                  className="btn-primary py-2 text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {loadFailed && (
          <button onClick={loadQuestions} className="btn-primary w-full py-2.5 text-sm">
            Retry loading today&apos;s check-in
          </button>
        )}

        {phase === "submitting" && (
          <p className="px-1 text-xs text-homeward-muted">Reviewing your check-in…</p>
        )}

        {phase === "error" && (
          <button onClick={runSubmit} className="btn-primary w-full py-2.5 text-sm">
            Retry submission
          </button>
        )}

        {phase === "done" && (
          <button onClick={restart} className="btn-secondary w-full py-2.5 text-sm">
            Start a new check-in
          </button>
        )}
      </div>
    </div>
  );
}
