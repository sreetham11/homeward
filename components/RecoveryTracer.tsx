"use client";

import { useEffect, useState } from "react";
import { PlanTimeline } from "./PlanTimeline";
import { ConversationalCheckin } from "./ConversationalCheckin";
import { CaregiverAlert } from "./CaregiverAlert";
import { DataQualityNotice } from "./DataQualityNotice";
import { TodayCard } from "./TodayCard";
import { Badge } from "./Badge";
import { AskHomeward } from "./AskHomeward";
import { PresencePingButton } from "./PresencePingButton";
import {
  appendLocalCheckin,
  appendLocalEscalation,
  appendLocalPresencePing,
  fetchCheckinsServer,
  fetchEscalationsServer,
  fetchPresencePingsServer,
  readLocalState,
  subscribeToRecoveryCode,
  type LocalRecoveryState,
} from "@/lib/planStore";
import type { CheckinInput, DeviationResult, EscalationSummary } from "@/lib/types";

const DISCLAIMER_BANNER =
  "Homeward tracks your recovery against your own discharge plan — it never diagnoses. Always contact your provider if you're unsure, or emergency services for anything urgent.";

async function loadState(recoveryCode: string): Promise<LocalRecoveryState | null> {
  const local = readLocalState(recoveryCode);
  let plan = local?.plan ?? null;

  if (!plan) {
    try {
      const res = await fetch(`/api/plan?code=${encodeURIComponent(recoveryCode)}`);
      if (res.ok) {
        const data = await res.json();
        plan = data.plan;
      }
    } catch {
      // no Supabase / network issue — fall through, handled by the null check below
    }
  }
  if (!plan) return null;

  const [serverCheckins, serverEscalations, serverPresencePings] = await Promise.all([
    fetchCheckinsServer(recoveryCode),
    fetchEscalationsServer(recoveryCode),
    fetchPresencePingsServer(recoveryCode),
  ]);

  return {
    plan,
    checkins: serverCheckins.length > 0 ? serverCheckins : local?.checkins ?? [],
    escalations: serverEscalations.length > 0 ? serverEscalations : local?.escalations ?? [],
    presencePings: serverPresencePings.length > 0 ? serverPresencePings : local?.presencePings ?? [],
  };
}

function currentDayNumber(dischargeDate: string, planLength: number): number {
  const from = new Date(`${dischargeDate}T00:00:00Z`).getTime();
  const today = Date.now();
  const diff = Math.floor((today - from) / (1000 * 60 * 60 * 24));
  return Math.min(Math.max(diff, 0), Math.max(planLength - 1, 0));
}

interface RecoveryTracerProps {
  recoveryCode: string;
  role: "patient" | "caregiver";
}

export function RecoveryTracer({ recoveryCode, role }: RecoveryTracerProps) {
  const [state, setState] = useState<LocalRecoveryState | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    loadState(recoveryCode).then((s) => {
      if (!cancelled) setState(s);
    });
    const unsubscribe = subscribeToRecoveryCode(recoveryCode, () => {
      loadState(recoveryCode).then((s) => {
        if (!cancelled) setState(s);
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recoveryCode]);

  // Runs stages 3->4->5 and returns the resulting summary so the conversational check-in can
  // deliver the result as its closing chat message (reflecting the real pipeline output, never
  // hardcoded). The API contract and safety logic are unchanged — only the caller differs.
  async function handleCheckinSubmit(checkin: CheckinInput): Promise<EscalationSummary> {
    if (!state) throw new Error("No recovery state loaded.");
    const checkinRes = await fetch("/api/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ checkin, role, recoveryCode }),
    }).then((r) => r.json());
    const woundVisionDescription: string | undefined =
      checkinRes.woundVisionDescription ?? undefined;

    const deviationRes = await fetch("/api/deviation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        checkin,
        discharge: state.plan.discharge,
        woundVisionDescription,
        previousCheckin: state.checkins.length > 0
          ? state.checkins[state.checkins.length - 1]?.checkin ?? null
          : null,
      }),
    }).then((r) => r.json());
    const deviation: DeviationResult = deviationRes.deviation;

    const escalateRes = await fetch("/api/escalate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        checkin,
        discharge: state.plan.discharge,
        deviation,
        recoveryCode,
        role,
      }),
    }).then((r) => r.json());
    const summary: EscalationSummary = escalateRes.summary;

    appendLocalCheckin(recoveryCode, checkin, deviation);
    if (summary.escalate) appendLocalEscalation(recoveryCode, summary);

    setState((prev) =>
      prev
        ? {
            ...prev,
            checkins: [...prev.checkins, { checkin, deviation }],
            escalations: summary.escalate ? [...prev.escalations, summary] : prev.escalations,
          }
        : prev,
    );
    return summary;
  }

  // NOT a check-in: records a timestamp only, never touches CheckinInput or lib/deviation.ts.
  // See components/PresencePingButton.tsx's file header — this only resets the silence-check
  // clock (lib/silenceCheck.ts), it never affects the plan itself or reads as a real check-in
  // anywhere in the UI.
  function handlePresencePing(pingedAt: string) {
    appendLocalPresencePing(recoveryCode, pingedAt);
    setState((prev) => (prev ? { ...prev, presencePings: [...prev.presencePings, pingedAt] } : prev));
  }

  if (state === undefined) {
    return <p className="text-sm text-homeward-muted">Loading recovery plan…</p>;
  }

  if (state === null) {
    return (
      <div className="card">
        <p className="text-sm text-homeward-ink">
          Couldn&apos;t find a recovery plan for code <span className="font-mono">{recoveryCode}</span>.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-homeward-muted">
          If Supabase isn&apos;t configured for this deployment, recovery codes only work within
          the browser that created them — open the plan in a new tab on this same device instead
          of a different one.
        </p>
      </div>
    );
  }

  const dayNumber = currentDayNumber(state.plan.discharge.dischargeDate, state.plan.days.length);
  const todayPlan = state.plan.days.find((d) => d.dayNumber === dayNumber);
  const totalDays = state.plan.days.length;

  return (
    <div className="space-y-4">
      <p className="disclaimer">{DISCLAIMER_BANNER}</p>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-homeward-border bg-homeward-mint/60 px-4 py-2.5 text-xs text-homeward-muted">
        <span>
          Recovery code: <span className="font-mono font-semibold text-homeward-ink">{recoveryCode}</span>{" "}
          — share this with your {role === "patient" ? "caregiver" : "patient"} to link views.
        </span>
        <Badge tone={role === "caregiver" ? "accent" : "info"} dot={false} className="capitalize">
          {role} view
        </Badge>
      </div>

      {role === "caregiver" && <DataQualityNotice discharge={state.plan.discharge} />}

      {role === "patient" && (
        <>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-homeward-muted">
              Day {dayNumber} of {totalDays - 1}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-homeward-border/60">
              <div
                className="h-full rounded-full bg-homeward-primary transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(100, Math.round((dayNumber / (totalDays - 1)) * 100))}%`,
                }}
              />
            </div>
          </div>

          <TodayCard dayNumber={dayNumber} todayPlan={todayPlan} />

          <ConversationalCheckin
            patientId={state.plan.patientId}
            dayNumber={dayNumber}
            discharge={state.plan.discharge}
            todayPlan={todayPlan}
            onSubmit={handleCheckinSubmit}
          />
          <PresencePingButton
            recoveryCode={recoveryCode}
            role={role}
            lastPingedAt={state.presencePings[state.presencePings.length - 1] ?? null}
            onPing={handlePresencePing}
          />
        </>
      )}

      {role === "caregiver" && state.escalations.length > 0 && (
        <div className="space-y-3">
          <span className="eyebrow">Flagged check-ins</span>
          {[...state.escalations]
            .reverse()
            .map((summary, i) => (
              <CaregiverAlert key={i} summary={summary} />
            ))}
        </div>
      )}

      <PlanTimeline
        plan={state.plan}
        checkins={state.checkins}
        presencePings={state.presencePings}
        highlightDay={dayNumber}
        collapsible={role === "patient"}
      />

      {role === "patient" && <AskHomeward discharge={state.plan.discharge} />}
    </div>
  );
}
