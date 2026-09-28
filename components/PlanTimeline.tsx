"use client";

import { useState } from "react";
import type { CheckinInput, DeviationResult, RecoveryPlan } from "@/lib/types";
import { Badge, type BadgeTone } from "./Badge";

interface PlanTimelineProps {
  plan: RecoveryPlan;
  checkins?: { checkin: CheckinInput; deviation: DeviationResult }[];
  /** ISO timestamps of "I'm okay" presence pings (components/PresencePingButton.tsx) — never a
   * substitute for a checkin, only ever rendered as a separate, lighter-weight badge. Bucketed
   * to a day number the same way currentDayNumber() in RecoveryTracer.tsx does, purely for
   * display — this never affects `plan.days`, which stays anchored to the discharge date
   * exactly as planBuilder.ts generated it regardless of check-ins or pings. */
  presencePings?: string[];
  highlightDay?: number;
  /** Patient-view-only: every day, including today, renders collapsed by default as a one-line
   * "Day N · date" row with just its status chip, and expands on tap — TodayCard surfaces
   * today's details separately, so there's no need to force today's row open here too. Left
   * unset (false) for the caregiver view, which keeps rendering every day fully expanded
   * exactly as before this existed. */
  collapsible?: boolean;
}

function statusBadge(deviation: DeviationResult) {
  const tone: BadgeTone = deviation.escalate
    ? "danger"
    : deviation.insufficientData
      ? "warning"
      : "success";
  const label = deviation.escalate
    ? "Flagged for review"
    : deviation.insufficientData
      ? "Needs more detail"
      : "Checked in, on track";
  return <Badge tone={tone}>{label}</Badge>;
}

function dayNumberForTimestamp(dischargeDate: string, iso: string): number {
  const from = new Date(`${dischargeDate}T00:00:00Z`).getTime();
  return Math.floor((new Date(iso).getTime() - from) / (1000 * 60 * 60 * 24));
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 text-homeward-muted transition-transform duration-200 ease-out"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7.5l5 5 5-5" />
      </svg>
    </span>
  );
}

export function PlanTimeline({
  plan,
  checkins = [],
  presencePings = [],
  highlightDay,
  collapsible = false,
}: PlanTimelineProps) {
  const checkinsByDay = new Map<number, DeviationResult>();
  for (const { checkin, deviation } of checkins) {
    checkinsByDay.set(checkin.dayNumber, deviation);
  }

  const pingedDays = new Set(
    presencePings.map((iso) => dayNumberForTimestamp(plan.discharge.dischargeDate, iso)),
  );

  // Only consulted when collapsible — every day, including today, starts absent (collapsed).
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set());

  function toggleDay(dayNumber: number) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {plan.generatedBy === "template" && (
        <p className="text-xs text-homeward-muted">
          Milestone notes below are template-generated (no LLM provider configured) — medication
          reminders and wound-care checklist are unaffected either way.
        </p>
      )}
      {plan.medicationsNeedingScheduleReview && plan.medicationsNeedingScheduleReview.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <p className="font-medium">Please confirm this schedule with your discharge paperwork:</p>
          <ul className="mt-1 list-inside list-disc">
            {plan.medicationsNeedingScheduleReview.map((med, i) => (
              <li key={i}>
                {med.name}
                {med.dosage ? ` — ${med.dosage}` : ""} ({med.frequency})
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.days.map((day) => {
        const deviation = checkinsByDay.get(day.dayNumber);
        const isToday = day.dayNumber === highlightDay;
        // Patient view only, and only for a day strictly before today with nothing recorded —
        // never today (still in progress) or a future day (hasn't happened yet).
        const isPastWithNoCheckin =
          collapsible && highlightDay != null && day.dayNumber < highlightDay;
        const statusChip = deviation
          ? statusBadge(deviation)
          : pingedDays.has(day.dayNumber)
            ? <Badge tone="neutral">Confirmed okay (no check-in)</Badge>
            : isPastWithNoCheckin
              ? <Badge tone="neutral">No check-in</Badge>
              : null;

        const header = (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-homeward-ink">
                Day {day.dayNumber}
              </span>
              <span className="text-xs text-homeward-muted">· {day.date}</span>
              {isToday && <Badge tone="info" dot={false}>Today</Badge>}
              {day.isFollowUpDay && <Badge tone="warning">Follow-up</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {statusChip}
              {collapsible && <ChevronIcon open={expandedDays.has(day.dayNumber)} />}
            </div>
          </div>
        );

        const body = (
          <>
            {day.milestoneNote && (
              <p className="mt-3 text-sm italic leading-relaxed text-homeward-muted">
                {day.milestoneNote}
              </p>
            )}

            {day.medicationReminders.length > 0 && (
              <div className="mt-4 border-t border-homeward-border pt-3">
                <p className="eyebrow">Medications</p>
                <ul className="mt-1.5 space-y-1 text-sm text-homeward-ink">
                  {day.medicationReminders.map((r, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs text-homeward-muted">{r.time}</span>{" "}
                      {r.medicationName} {r.dosage && `— ${r.dosage}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {day.woundCareChecklist.length > 0 && (
              <div className="mt-4 border-t border-homeward-border pt-3">
                <p className="eyebrow">Wound care</p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-homeward-ink">
                  {day.woundCareChecklist.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );

        const cardClass = `card ${
          isToday ? "border-homeward-primary bg-homeward-mint/50 ring-1 ring-homeward-primary" : ""
        }`;

        // Caregiver view: always fully expanded, no button wrapper — identical markup to
        // before this feature existed.
        if (!collapsible) {
          return (
            <div key={day.dayNumber} className={cardClass}>
              {header}
              {body}
            </div>
          );
        }

        const isOpen = expandedDays.has(day.dayNumber);
        const panelId = `plan-timeline-day-${day.dayNumber}`;
        return (
          <div key={day.dayNumber} className={cardClass}>
            <button
              type="button"
              onClick={() => toggleDay(day.dayNumber)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="w-full text-left"
            >
              {header}
            </button>
            {/* grid-rows trick (see app/globals.css's .accordion-panel): smooth height
                transition without measuring scrollHeight in JS, same pattern as the FAQ
                accordion in components/marketing/Faq.tsx. */}
            <div id={panelId} className="accordion-panel" data-open={isOpen}>
              <div>{body}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
