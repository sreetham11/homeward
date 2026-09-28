"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DischargeData, Medication, RecoveryPlan } from "@/lib/types";
import { saveLocalPlan } from "@/lib/planStore";
import { validateManualDischarge, type ManualEntryErrors } from "@/lib/manualEntryValidation";
import { isValidEmail } from "@/lib/email";
import { medicationNeedsScheduleReview } from "@/lib/medicationFrequency";
import { StepIndicator } from "@/components/StepIndicator";

// Mirrors lib/parser.ts's MIN_DISCHARGE_TEXT_LENGTH — kept as a plain constant here rather than
// importing it, since lib/parser.ts pulls in lib/llm.ts (server-only SDKs) that must never end
// up in a client bundle. This is a cheap, free, client-side pre-check only; the model-side
// isValidDischargeDocument check in lib/parser.ts is the real gate for text that's merely long
// enough but not actually medical content — see app/api/parse/route.ts.
const MIN_DISCHARGE_TEXT_LENGTH = 50;

type Step = "input" | "manual" | "review" | "creating";

const FLOW_STEPS = ["Upload discharge summary", "Review extracted plan", "Daily check-ins"];

function emptyDischarge(): DischargeData {
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
    manualReviewNotes: ["Filled in manually."],
  };
}

function parseMedicationLines(text: string): Medication[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", dosage = "", frequency = "", duration = ""] = line
        .split(",")
        .map((p) => p.trim());
      return { name, dosage, frequency, duration };
    });
}

function medicationsToLines(meds: Medication[]): string {
  return meds.map((m) => [m.name, m.dosage, m.frequency, m.duration].join(", ")).join("\n");
}

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [discharge, setDischarge] = useState<DischargeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTouched, setManualTouched] = useState(false);
  const [caregiverEmail, setCaregiverEmail] = useState("");
  const [caregiverEmailTouched, setCaregiverEmailTouched] = useState(false);

  // Genuinely optional — blank is always fine. Only a non-empty, malformed value is an error,
  // so an untouched/empty field never blocks plan creation.
  const caregiverEmailError =
    caregiverEmail.trim() && !isValidEmail(caregiverEmail)
      ? "That doesn't look like a valid email address."
      : null;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setPhoto(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      setPhoto({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  }

  async function handleParse() {
    setError(null);
    setParsing(true);
    try {
      const body = photo
        ? { imageBase64: photo.base64, mimeType: photo.mimeType }
        : { text };
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parsing failed.");
      setDischarge(data.discharge as DischargeData);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong parsing the document.");
    } finally {
      setParsing(false);
    }
  }

  function useManualEntry() {
    setDischarge(emptyDischarge());
    setManualTouched(false);
    setStep("manual");
  }

  const manualErrors: ManualEntryErrors = discharge ? validateManualDischarge(discharge) : {};
  const manualIsComplete = Object.keys(manualErrors).length === 0;

  function handleContinueManual() {
    setManualTouched(true);
    if (!discharge || !manualIsComplete) return;
    // The form is genuinely filled in now — the "needs review" banner on the review screen
    // would otherwise be stale/confusing right after the user just finished completing it.
    setDischarge({ ...discharge, needsManualReview: false, manualReviewNotes: [] });
    setStep("review");
  }

  async function handleCreatePlan() {
    if (!discharge) return;
    if (caregiverEmailError) {
      setCaregiverEmailTouched(true);
      return;
    }
    setStep("creating");
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discharge, caregiverEmail: caregiverEmail.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create plan.");
      const { recoveryCode, plan } = data as { recoveryCode: string; plan: RecoveryPlan };
      saveLocalPlan(recoveryCode, plan);
      router.push(`/patient?code=${recoveryCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong creating the plan.");
      setStep("review");
    }
  }

  const stepIndex = step === "review" || step === "creating" ? 1 : 0;

  return (
    <div>
      <div className="card !p-5">
        <StepIndicator steps={FLOW_STEPS} currentIndex={stepIndex} />
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-homeward-danger">
          {error}
        </p>
      )}

      {step === "input" && (
        <div className="mt-6 card space-y-5">
          <div>
            <h3 className="text-base font-semibold text-homeward-ink">Discharge summary</h3>
            <p className="mt-0.5 text-sm text-homeward-muted">
              Paste the text, or upload a photo of the discharge sheet.
            </p>
          </div>

          <label className="block">
            <span className="field-label">Paste discharge summary text</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              className="input"
              placeholder="Paste the discharge summary here…"
            />
            {!photo && text.trim().length > 0 && text.trim().length < MIN_DISCHARGE_TEXT_LENGTH && (
              <p className="mt-1 text-xs text-homeward-muted">
                Add a bit more — paste the actual discharge summary text (at least a few
                sentences) so Homeward has something real to extract.
              </p>
            )}
          </label>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-homeward-border" />
            <span className="chip">or</span>
            <div className="h-px flex-1 bg-homeward-border" />
          </div>

          <label className="block">
            <span className="field-label">Upload a photo of the discharge sheet</span>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="mt-1 block w-full text-sm text-homeward-muted file:mr-3 file:rounded-lg file:border-0 file:bg-homeward-mint file:px-3 file:py-2 file:text-xs file:font-semibold file:text-homeward-primary"
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleParse}
              disabled={parsing || (!photo && text.trim().length < MIN_DISCHARGE_TEXT_LENGTH)}
              className="btn-primary flex-1"
            >
              {parsing ? "Reading document…" : "Parse discharge document"}
            </button>
            <button onClick={useManualEntry} className="btn-secondary">
              Fill in manually
            </button>
          </div>
        </div>
      )}

      {step === "manual" && discharge && (
        <div className="mt-6 card space-y-6">
          <div>
            <h3 className="text-base font-semibold text-homeward-ink">Fill in the discharge details</h3>
            <p className="mt-0.5 text-sm text-homeward-muted">
              No discharge document handy? Enter the real details from your doctor&apos;s
              instructions below — every field needs real content before you can continue.
            </p>
          </div>

          <div className="space-y-4">
            <span className="eyebrow">Diagnosis &amp; procedure</span>
            <label className="block">
              <span className="field-label">Diagnosis</span>
              <input
                value={discharge.diagnosis}
                onChange={(e) => setDischarge({ ...discharge, diagnosis: e.target.value })}
                className="input"
                placeholder="e.g. Acute appendicitis"
              />
              {manualTouched && manualErrors.diagnosis && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.diagnosis}</p>
              )}
            </label>

            <label className="block">
              <span className="field-label">Procedure type</span>
              <input
                value={discharge.procedureType}
                onChange={(e) => setDischarge({ ...discharge, procedureType: e.target.value })}
                className="input"
                placeholder="e.g. Laparoscopic appendectomy"
              />
              {manualTouched && manualErrors.procedureType && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.procedureType}</p>
              )}
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Medications &amp; care</span>
            <label className="block">
              <span className="field-label">
                Medications (one per line: name, dosage, frequency, duration)
              </span>
              <textarea
                value={medicationsToLines(discharge.medications)}
                onChange={(e) =>
                  setDischarge({ ...discharge, medications: parseMedicationLines(e.target.value) })
                }
                rows={3}
                className="input font-mono text-xs"
                placeholder="Amoxicillin, 500mg, three times daily, 7 days"
              />
              {manualTouched && manualErrors.medications && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.medications}</p>
              )}
            </label>

            <label className="block">
              <span className="field-label">Wound care instructions (one per line)</span>
              <textarea
                value={discharge.woundCareInstructions.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    woundCareInstructions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={3}
                className="input text-xs"
                placeholder="Keep the dressing dry and change it daily"
              />
              {manualTouched && manualErrors.woundCareInstructions && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.woundCareInstructions}</p>
              )}
            </label>

            <label className="block">
              <span className="field-label">Activity restrictions (one per line)</span>
              <textarea
                value={discharge.activityRestrictions.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    activityRestrictions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={2}
                className="input text-xs"
                placeholder="No heavy lifting for 2 weeks"
              />
              {manualTouched && manualErrors.activityRestrictions && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.activityRestrictions}</p>
              )}
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Follow-up</span>
            <label className="block">
              <span className="field-label">Follow-up date</span>
              <input
                type="date"
                value={discharge.followUpDate ?? ""}
                onChange={(e) =>
                  setDischarge({ ...discharge, followUpDate: e.target.value || null })
                }
                className="input"
              />
              {manualTouched && manualErrors.followUpDate && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.followUpDate}</p>
              )}
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Warning signs</span>
            <label className="block">
              <span className="field-label">
                Doctor-stated warning signs (one per line — keep exact wording)
              </span>
              <textarea
                value={discharge.doctorStatedWarningSigns.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    doctorStatedWarningSigns: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={3}
                className="input text-xs"
                placeholder="Fever above 38°C, redness spreading around the wound"
              />
              {manualTouched && manualErrors.doctorStatedWarningSigns && (
                <p className="mt-1 text-xs text-homeward-danger">{manualErrors.doctorStatedWarningSigns}</p>
              )}
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setStep("input")}
              className="btn-secondary"
            >
              Back
            </button>
            <button onClick={handleContinueManual} className="btn-primary flex-1">
              Continue to review →
            </button>
          </div>
        </div>
      )}

      {(step === "review" || step === "creating") && discharge && (
        <div className="mt-6 card space-y-6">
          <div>
            <h3 className="text-base font-semibold text-homeward-ink">Review extracted plan</h3>
            <p className="mt-0.5 text-sm text-homeward-muted">
              Confirm the details below before Homeward builds your day-by-day plan.
            </p>
          </div>

          {discharge.needsManualReview && (
            <p className="disclaimer">
              Some fields need your review before the plan is created.
              {discharge.manualReviewNotes?.length
                ? ` ${discharge.manualReviewNotes.join(" ")}`
                : ""}
            </p>
          )}

          <div className="space-y-4">
            <span className="eyebrow">Diagnosis &amp; procedure</span>
            <label className="block">
              <span className="field-label">Diagnosis</span>
              <input
                value={discharge.diagnosis}
                onChange={(e) => setDischarge({ ...discharge, diagnosis: e.target.value })}
                className="input"
              />
            </label>

            <label className="block">
              <span className="field-label">Procedure type</span>
              <input
                value={discharge.procedureType}
                onChange={(e) => setDischarge({ ...discharge, procedureType: e.target.value })}
                className="input"
              />
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Dates</span>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="field-label">Discharge date</span>
                <input
                  type="date"
                  value={discharge.dischargeDate}
                  onChange={(e) => setDischarge({ ...discharge, dischargeDate: e.target.value })}
                  className="input"
                />
              </label>
              <label className="block">
                <span className="field-label">Follow-up date</span>
                <input
                  type="date"
                  value={discharge.followUpDate ?? ""}
                  onChange={(e) =>
                    setDischarge({ ...discharge, followUpDate: e.target.value || null })
                  }
                  className="input"
                />
              </label>
            </div>

            <label className="block">
              <span className="field-label">Follow-up location</span>
              <input
                value={discharge.followUpLocation ?? ""}
                onChange={(e) =>
                  setDischarge({ ...discharge, followUpLocation: e.target.value || null })
                }
                className="input"
              />
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Medications &amp; care</span>
            <label className="block">
              <span className="field-label">
                Medications (one per line: name, dosage, frequency, duration)
              </span>
              <textarea
                value={medicationsToLines(discharge.medications)}
                onChange={(e) =>
                  setDischarge({ ...discharge, medications: parseMedicationLines(e.target.value) })
                }
                rows={3}
                className="input font-mono text-xs"
              />
              {discharge.medications.some((m) => medicationNeedsScheduleReview(m.frequency)) && (
                <p className="mt-1 text-xs text-amber-700">
                  Please confirm this schedule with your discharge paperwork — we couldn&apos;t
                  automatically parse one or more medication frequencies.
                </p>
              )}
            </label>

            <label className="block">
              <span className="field-label">Wound care instructions (one per line)</span>
              <textarea
                value={discharge.woundCareInstructions.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    woundCareInstructions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={3}
                className="input text-xs"
              />
            </label>

            <label className="block">
              <span className="field-label">Activity restrictions (one per line)</span>
              <textarea
                value={discharge.activityRestrictions.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    activityRestrictions: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={2}
                className="input text-xs"
              />
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Warning signs</span>
            <label className="block">
              <span className="field-label">
                Doctor-stated warning signs (one per line — keep exact wording)
              </span>
              <textarea
                value={discharge.doctorStatedWarningSigns.join("\n")}
                onChange={(e) =>
                  setDischarge({
                    ...discharge,
                    doctorStatedWarningSigns: e.target.value.split("\n").filter(Boolean),
                  })
                }
                rows={3}
                className="input text-xs"
              />
            </label>
          </div>

          <div className="space-y-4 border-t border-homeward-border pt-5">
            <span className="eyebrow">Caregiver notifications</span>
            <label className="block">
              <span className="field-label">Caregiver email (optional)</span>
              <input
                type="email"
                value={caregiverEmail}
                onChange={(e) => setCaregiverEmail(e.target.value)}
                onBlur={() => setCaregiverEmailTouched(true)}
                className="input"
                placeholder="caregiver@example.com"
              />
              <p className="mt-1 text-xs text-homeward-muted">
                Leave this blank if you&apos;d rather not — everything else works the same
                either way. If set, this is who gets notified if check-ins go quiet.
              </p>
              {caregiverEmailTouched && caregiverEmailError && (
                <p className="mt-1 text-xs text-homeward-danger">{caregiverEmailError}</p>
              )}
            </label>
          </div>

          <button
            onClick={handleCreatePlan}
            disabled={step === "creating"}
            className="btn-primary w-full py-3"
          >
            {step === "creating" ? "Building your plan…" : "Create recovery plan →"}
          </button>
        </div>
      )}
    </div>
  );
}
