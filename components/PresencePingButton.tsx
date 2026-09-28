"use client";

import { useState } from "react";

// Deliberately not part of the check-in flow: a single tap that proves the patient is present
// on a busy day, nothing more. POSTs to app/api/presence-ping, which only ever records a
// timestamp — it never builds a CheckinInput and never calls lib/deviation.ts (no Layer A, no
// Layer B, no LLM call). lib/silenceCheck.ts treats this timestamp as equally valid to a real
// check-in for resetting the silence-detection clock, but nothing else in the app (the plan
// timeline, the caregiver dashboard, hasMeaningfulCheckinData) ever treats a ping as a
// check-in — see PlanTimeline.tsx's separate "confirmed okay" badge for how that distinction
// stays visible to the caregiver.

interface PresencePingButtonProps {
  recoveryCode: string;
  /** Forwarded verbatim into the POST body — app/api/presence-ping/route.ts rejects anything
   * other than "patient" (see lib/roleGuard.ts). This component only decides what to render;
   * the server is the actual enforcement point. */
  role: "patient" | "caregiver";
  /** Most recent presence-ping ISO timestamp already on record, if any — shown so a patient
   * isn't left wondering whether their last tap actually registered. */
  lastPingedAt?: string | null;
  onPing: (pingedAt: string) => void;
}

function formatHoursAgo(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function PresencePingButton({ recoveryCode, role, lastPingedAt, onPing }: PresencePingButtonProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  async function handlePing() {
    setSending(true);
    setError(false);
    try {
      const res = await fetch("/api/presence-ping", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recoveryCode, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.pingedAt) throw new Error("presence ping failed");
      onPing(data.pingedAt);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-homeward-border bg-homeward-card px-3.5 py-2.5">
      <div className="text-xs leading-snug text-homeward-muted">
        <p>
          <span className="font-medium text-homeward-ink">Busy today?</span> Tap to let your
          caregiver know you&apos;re okay — this doesn&apos;t replace today&apos;s check-in.
        </p>
        {lastPingedAt && !error && (
          <p className="mt-0.5 text-homeward-primaryDark">
            Last confirmed {formatHoursAgo(lastPingedAt)}.
          </p>
        )}
        {error && <p className="mt-0.5 text-red-600">Couldn&apos;t send that — try again.</p>}
      </div>
      <button onClick={handlePing} disabled={sending} className="btn-secondary shrink-0 py-1.5 text-xs">
        {sending ? "Sending…" : "I'm okay"}
      </button>
    </div>
  );
}
