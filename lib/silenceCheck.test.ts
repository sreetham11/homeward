import { describe, expect, it } from "vitest";
import { buildCaregiverPortalUrl, findSilentPatients, SILENCE_THRESHOLD_HOURS } from "./silenceCheck";
import type { DischargeData, RecoveryPlan } from "./types";

const NOW = new Date("2026-07-09T12:00:00.000Z").getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();
const NO_PINGS = new Map<string, string>();

function fixturePlan(overrides: Partial<RecoveryPlan> = {}): RecoveryPlan {
  return {
    patientId: "patient-1",
    discharge: {
      diagnosis: "Appendicitis",
      procedureType: "Laparoscopic appendectomy",
      medications: [],
      woundCareInstructions: [],
      activityRestrictions: [],
      followUpDate: null,
      followUpLocation: null,
      doctorStatedWarningSigns: [],
      dischargeDate: "2026-07-01",
      needsManualReview: false,
    } as DischargeData,
    days: [],
    generatedBy: "template",
    createdAt: hoursAgo(72),
    caregiverEmail: null,
    ...overrides,
  };
}

describe("findSilentPatients — check-ins and the plan-creation fallback", () => {
  it("flags a patient who checked in 50 hours ago (over the 48h threshold)", () => {
    const plans = [{ recoveryCode: "STALE1", plan: fixturePlan() }];
    const latest = new Map([["STALE1", hoursAgo(50)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.recoveryCode).toBe("STALE1");
    expect(result[0]?.neverCheckedIn).toBe(false);
    expect(result[0]?.lastActivityType).toBe("checkin");
    expect(result[0]?.hoursSinceLastActivity).toBeCloseTo(50, 0);
  });

  it("does not flag a patient who checked in 6 hours ago (well under the threshold)", () => {
    const plans = [{ recoveryCode: "OKAY01", plan: fixturePlan() }];
    const latest = new Map([["OKAY01", hoursAgo(6)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result).toHaveLength(0);
  });

  it("flags a patient who has never checked in at all, falling back to the plan's creation time", () => {
    const plans = [{ recoveryCode: "SILNT1", plan: fixturePlan({ createdAt: hoursAgo(72) }) }];
    const result = findSilentPatients(plans, NO_PINGS, NO_PINGS, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.neverCheckedIn).toBe(true);
    expect(result[0]?.lastActivityDate).toBe(hoursAgo(72));
    expect(result[0]?.lastActivityType).toBe("plan_created");
  });

  it("does not flag a brand-new plan with no check-in yet, if it's under the threshold", () => {
    const plans = [{ recoveryCode: "NEW001", plan: fixturePlan({ createdAt: hoursAgo(1) }) }];
    const result = findSilentPatients(plans, NO_PINGS, NO_PINGS, NOW);
    expect(result).toHaveLength(0);
  });

  it("is a boundary of >= 48h, not > 48h", () => {
    const plans = [{ recoveryCode: "EXACT1", plan: fixturePlan() }];
    const latest = new Map([["EXACT1", hoursAgo(SILENCE_THRESHOLD_HOURS)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result).toHaveLength(1);
  });

  it("never fabricates patientName — always null today (no patient-name field exists)", () => {
    const plans = [{ recoveryCode: "STALE1", plan: fixturePlan() }];
    const latest = new Map([["STALE1", hoursAgo(60)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result[0]?.patientName).toBeNull();
  });

  it("echoes caregiverEmail straight from the plan when the caregiver provided one", () => {
    const plans = [
      { recoveryCode: "STALE1", plan: fixturePlan({ caregiverEmail: "caregiver@example.com" }) },
    ];
    const latest = new Map([["STALE1", hoursAgo(60)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result[0]?.caregiverEmail).toBe("caregiver@example.com");
  });

  it("leaves caregiverEmail null when the caregiver skipped it — not fabricated", () => {
    const plans = [{ recoveryCode: "STALE1", plan: fixturePlan() }];
    const latest = new Map([["STALE1", hoursAgo(60)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result[0]?.caregiverEmail).toBeNull();
  });

  it("reports each silent patient's own procedureType from their own plan", () => {
    const plans = [
      { recoveryCode: "A", plan: fixturePlan({ discharge: { ...fixturePlan().discharge, procedureType: "Total hip replacement" } }) },
      { recoveryCode: "B", plan: fixturePlan({ discharge: { ...fixturePlan().discharge, procedureType: "Appendectomy" } }) },
    ];
    const latest = new Map([
      ["A", hoursAgo(60)],
      ["B", hoursAgo(60)],
    ]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result.find((r) => r.recoveryCode === "A")?.procedureType).toBe("Total hip replacement");
    expect(result.find((r) => r.recoveryCode === "B")?.procedureType).toBe("Appendectomy");
  });

  it("handles multiple plans, flagging only the ones over threshold", () => {
    const plans = [
      { recoveryCode: "STALE1", plan: fixturePlan() },
      { recoveryCode: "OKAY01", plan: fixturePlan() },
      { recoveryCode: "SILNT1", plan: fixturePlan({ createdAt: hoursAgo(72) }) },
    ];
    const latest = new Map([
      ["STALE1", hoursAgo(50)],
      ["OKAY01", hoursAgo(6)],
    ]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    const codes = result.map((r) => r.recoveryCode).sort();
    expect(codes).toEqual(["SILNT1", "STALE1"]);
  });
});

describe("buildCaregiverPortalUrl", () => {
  it("returns null when no app base URL is configured — never a fabricated relative path", () => {
    expect(buildCaregiverPortalUrl(null, "STALE1")).toBeNull();
  });

  it("builds an absolute caregiver deep link from a base URL and recovery code", () => {
    expect(buildCaregiverPortalUrl("https://homeward.example.com", "STALE1")).toBe(
      "https://homeward.example.com/caregiver?code=STALE1",
    );
  });

  it("strips a trailing slash from the base URL so the path never doubles up", () => {
    expect(buildCaregiverPortalUrl("https://homeward.example.com/", "STALE1")).toBe(
      "https://homeward.example.com/caregiver?code=STALE1",
    );
  });

  it("URL-encodes the recovery code", () => {
    expect(buildCaregiverPortalUrl("https://homeward.example.com", "A B")).toBe(
      "https://homeward.example.com/caregiver?code=A%20B",
    );
  });
});

describe("findSilentPatients — caregiverPortalUrl", () => {
  it("is null when findSilentPatients is called without an app base URL (the default)", () => {
    const plans = [{ recoveryCode: "STALE1", plan: fixturePlan() }];
    const latest = new Map([["STALE1", hoursAgo(60)]]);
    const result = findSilentPatients(plans, latest, NO_PINGS, NOW);
    expect(result[0]?.caregiverPortalUrl).toBeNull();
  });

  it("is populated per-patient when an app base URL is passed through", () => {
    const plans = [{ recoveryCode: "STALE1", plan: fixturePlan() }];
    const latest = new Map([["STALE1", hoursAgo(60)]]);
    const result = findSilentPatients(
      plans,
      latest,
      NO_PINGS,
      NOW,
      SILENCE_THRESHOLD_HOURS,
      "https://homeward.example.com",
    );
    expect(result[0]?.caregiverPortalUrl).toBe("https://homeward.example.com/caregiver?code=STALE1");
  });
});

describe("findSilentPatients — presence pings reset the same clock as a check-in", () => {
  it("does not flag a patient whose last check-in was 60h ago but who pinged 'I'm okay' 3h ago", () => {
    const plans = [{ recoveryCode: "BUSY01", plan: fixturePlan() }];
    const checkins = new Map([["BUSY01", hoursAgo(60)]]);
    const pings = new Map([["BUSY01", hoursAgo(3)]]);
    const result = findSilentPatients(plans, checkins, pings, NOW);
    expect(result).toHaveLength(0);
  });

  it("flags a patient whose only activity — a presence ping — is 50h old", () => {
    const plans = [{ recoveryCode: "PING50", plan: fixturePlan() }];
    const pings = new Map([["PING50", hoursAgo(50)]]);
    const result = findSilentPatients(plans, NO_PINGS, pings, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.lastActivityType).toBe("presence_ping");
    expect(result[0]?.hoursSinceLastActivity).toBeCloseTo(50, 0);
  });

  it("neverCheckedIn stays true for a patient who only ever pings, even though they aren't silent", () => {
    const plans = [{ recoveryCode: "PINGONLY", plan: fixturePlan() }];
    const pings = new Map([["PINGONLY", hoursAgo(2)]]);
    const result = findSilentPatients(plans, NO_PINGS, pings, NOW);
    // Not silent (recent ping), so it won't appear in the flagged list — but confirm via a
    // stale variant that neverCheckedIn survives regardless of how recent the ping is.
    expect(result).toHaveLength(0);

    const staleResult = findSilentPatients(
      plans,
      NO_PINGS,
      new Map([["PINGONLY", hoursAgo(50)]]),
      NOW,
    );
    expect(staleResult).toHaveLength(1);
    expect(staleResult[0]?.neverCheckedIn).toBe(true);
    expect(staleResult[0]?.lastActivityType).toBe("presence_ping");
  });

  it("picks whichever of check-in or ping is more recent, in either order", () => {
    const plans = [{ recoveryCode: "RECENT_CHECKIN", plan: fixturePlan() }];
    // Ping is older than the check-in here — check-in should win.
    const result = findSilentPatients(
      plans,
      new Map([["RECENT_CHECKIN", hoursAgo(2)]]),
      new Map([["RECENT_CHECKIN", hoursAgo(40)]]),
      NOW,
    );
    expect(result).toHaveLength(0); // 2h ago is well under the threshold either way

    const plans2 = [{ recoveryCode: "RECENT_PING", plan: fixturePlan() }];
    const result2 = findSilentPatients(
      plans2,
      new Map([["RECENT_PING", hoursAgo(60)]]),
      new Map([["RECENT_PING", hoursAgo(1)]]),
      NOW,
    );
    expect(result2).toHaveLength(0);
    // Confirm it's genuinely comparing, not just "ping always wins": make both stale and check
    // the more recent (but still stale) one is reported as lastActivityDate.
    const result3 = findSilentPatients(
      plans2,
      new Map([["RECENT_PING", hoursAgo(70)]]),
      new Map([["RECENT_PING", hoursAgo(49)]]),
      NOW,
    );
    expect(result3).toHaveLength(1);
    expect(result3[0]?.lastActivityType).toBe("presence_ping");
    expect(result3[0]?.hoursSinceLastActivity).toBeCloseTo(49, 0);
  });
});
