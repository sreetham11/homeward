// Pure computation for the n8n silence-detection workflow (app/api/silence-check). Kept
// separate from the route so the 48-hour threshold math, the "never checked in at all"
// fallback, and the check-in/presence-ping combination rule can be unit tested directly, same
// pattern as every other stage in this project (thin route, logic in lib/).
import type { RecoveryPlan } from "./types";

export const SILENCE_THRESHOLD_HOURS = 48;

export type LastActivityType = "checkin" | "presence_ping" | "plan_created";

export interface SilentPatient {
  recoveryCode: string;
  /** Not captured anywhere in the current schema (DischargeData has no patient-name field —
   * see lib/types.ts) — always null today, not fabricated. */
  patientName: string | null;
  procedureType: string | null;
  /** The more recent of: a full check-in, an "I'm okay" presence ping
   * (components/PresencePingButton.tsx), or (if neither ever happened) the plan's own creation
   * time. Renamed from an earlier `lastCheckinDate` now that a presence ping can also be the
   * most recent activity — see `lastActivityType` to tell which kind it was. */
  lastActivityDate: string;
  lastActivityType: LastActivityType;
  hoursSinceLastActivity: number;
  /** True when there is no check-in row at all yet — independent of presence pings. A patient
   * who only ever taps "I'm okay" and never does a real check-in has neverCheckedIn: true
   * forever, even while never appearing on this silent list — that distinction (confirmed okay
   * vs. an actual check-in) is deliberate, see CLAUDE.md and the caregiver-facing plan timeline. */
  neverCheckedIn: boolean;
  /** The caregiver email captured at plan creation (components/OnboardingFlow.tsx), if any —
   * echoed straight from plan.caregiverEmail, never fabricated. Still null for any plan
   * created before this field existed, or where the caregiver chose to skip it. */
  caregiverEmail: string | null;
  /** Deep link to this patient's caregiver dashboard (/caregiver?code=...), for the
   * silence-check email's call-to-action. Null when no app base URL is configured — see
   * buildCaregiverPortalUrl — never fabricated as a relative path, since this response is
   * consumed by an external workflow (n8n) with no browser origin of its own to resolve
   * a relative URL against. */
  caregiverPortalUrl: string | null;
}

/**
 * Builds the absolute caregiver-dashboard URL for a recovery code, or null if no base URL is
 * configured (see app/api/silence-check/route.ts's APP_URL). Pure and easily unit-tested in
 * isolation from findSilentPatients' date-math, same "small pure helper" pattern as the rest
 * of this file.
 */
export function buildCaregiverPortalUrl(appBaseUrl: string | null, recoveryCode: string): string | null {
  if (!appBaseUrl) return null;
  return `${appBaseUrl.replace(/\/+$/, "")}/caregiver?code=${encodeURIComponent(recoveryCode)}`;
}

/**
 * Given every persisted plan and maps of recovery code -> most recent check-in / presence-ping
 * timestamp, returns the patients whose most recent known activity (a check-in, a presence
 * ping, or failing both, the plan's own creation time) is 48+ hours old. A presence ping counts
 * toward resetting this clock exactly like a check-in does — see PresencePingButton's file
 * header for why it's still never treated as a check-in anywhere else in the app. Pure and
 * synchronous — no I/O, no Date.now() surprises — so it's fully unit-testable; the route only
 * wires in the real "now" and real data.
 */
export function findSilentPatients(
  plans: { recoveryCode: string; plan: RecoveryPlan }[],
  latestCheckins: Map<string, string>,
  latestPresencePings: Map<string, string>,
  nowMs: number,
  thresholdHours = SILENCE_THRESHOLD_HOURS,
  appBaseUrl: string | null = null,
): SilentPatient[] {
  const silent: SilentPatient[] = [];

  for (const { recoveryCode, plan } of plans) {
    const neverCheckedIn = !latestCheckins.has(recoveryCode);

    let lastActivityDate = plan.createdAt;
    let lastActivityType: LastActivityType = "plan_created";

    const checkinDate = latestCheckins.get(recoveryCode);
    if (checkinDate && new Date(checkinDate).getTime() > new Date(lastActivityDate).getTime()) {
      lastActivityDate = checkinDate;
      lastActivityType = "checkin";
    }

    const pingDate = latestPresencePings.get(recoveryCode);
    if (pingDate && new Date(pingDate).getTime() > new Date(lastActivityDate).getTime()) {
      lastActivityDate = pingDate;
      lastActivityType = "presence_ping";
    }

    const hoursSinceLastActivity = (nowMs - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastActivity >= thresholdHours) {
      silent.push({
        recoveryCode,
        patientName: null,
        procedureType: plan.discharge.procedureType || null,
        lastActivityDate,
        lastActivityType,
        hoursSinceLastActivity: Math.round(hoursSinceLastActivity * 10) / 10,
        neverCheckedIn,
        caregiverEmail: plan.caregiverEmail,
        caregiverPortalUrl: buildCaregiverPortalUrl(appBaseUrl, recoveryCode),
      });
    }
  }

  return silent;
}
