"use client";

import type { DayPlan } from "@/lib/types";
import { Badge } from "./Badge";

interface TodayCardProps {
  dayNumber: number;
  todayPlan: DayPlan | undefined;
}

/** Patient-view-only summary of today: medication times, wound care, and a jump-to-check-in
 * button. Sits above the day-by-day PlanTimeline so the one thing a patient needs *right now*
 * doesn't require scrolling or expanding anything. Purely presentational — reads the same
 * DayPlan the timeline already renders, doesn't call any API or safety logic itself. */
export function TodayCard({ dayNumber, todayPlan }: TodayCardProps) {
  function goToCheckin() {
    // Same pattern as components/AskHomeward.tsx's redirect-to-checkin button.
    document.getElementById("checkin-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="card border-homeward-primary bg-homeward-mint/40 ring-1 ring-homeward-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="eyebrow">Today</span>
          <span className="text-sm font-semibold text-homeward-ink">Day {dayNumber}</span>
        </div>
        {todayPlan?.isFollowUpDay && <Badge tone="warning">Follow-up</Badge>}
      </div>

      {todayPlan?.milestoneNote && (
        <p className="mt-3 text-sm italic leading-relaxed text-homeward-muted">{todayPlan.milestoneNote}</p>
      )}

      {todayPlan && todayPlan.medicationReminders.length > 0 && (
        <div className="mt-4 border-t border-homeward-border pt-3">
          <p className="eyebrow">Medications today</p>
          <ul className="mt-1.5 space-y-1 text-sm text-homeward-ink">
            {todayPlan.medicationReminders.map((r, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-homeward-muted">{r.time}</span>{" "}
                {r.medicationName} {r.dosage && `— ${r.dosage}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {todayPlan && todayPlan.woundCareChecklist.length > 0 && (
        <div className="mt-4 border-t border-homeward-border pt-3">
          <p className="eyebrow">Wound care today</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-homeward-ink">
            {todayPlan.woundCareChecklist.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={goToCheckin} className="btn-primary mt-4 w-full sm:w-auto">
        Do today's check-in
      </button>
    </div>
  );
}
