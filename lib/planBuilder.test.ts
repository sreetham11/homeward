import { describe, it, expect, vi, afterEach } from "vitest";
import { buildRecoveryPlan } from "./planBuilder";
import type { DischargeData, RecoveryPlan } from "./types";

vi.mock("./llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./llm")>();
  return {
    ...actual,
    isAnyChatProviderConfigured: vi.fn(),
  };
});
import { isAnyChatProviderConfigured } from "./llm";

afterEach(() => {
  vi.mocked(isAnyChatProviderConfigured).mockReturnValue(false);
});

function minimalDischarge(overrides?: Partial<DischargeData>): DischargeData {
  return {
    diagnosis: "Acute appendicitis",
    procedureType: "Laparoscopic appendectomy",
    medications: [],
    woundCareInstructions: [],
    activityRestrictions: [],
    followUpDate: null,
    followUpLocation: null,
    doctorStatedWarningSigns: [],
    dischargeDate: "2026-09-28",
    needsManualReview: false,
    ...overrides,
  };
}

function countReminders(plan: RecoveryPlan): number {
  return plan.days.reduce((sum, day) => sum + day.medicationReminders.length, 0);
}

describe("buildRecoveryPlan — parsed medication frequencies", () => {
  it("creates reminders for recognized frequencies", async () => {
    const discharge = minimalDischarge({
      medications: [
        { name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" },
        { name: "Paracetamol", dosage: "1g", frequency: "three times daily", duration: "5 days" },
      ],
    });

    const plan = await buildRecoveryPlan("p-123", discharge);

    expect(plan.medicationsNeedingScheduleReview).toEqual([]);
    const day0 = plan.days[0];
    if (!day0) throw new Error("Expected day 0 to exist");
    expect(day0.medicationReminders).toEqual([
      { medicationName: "Amoxicillin", dosage: "500mg", time: "08:00" },
      { medicationName: "Amoxicillin", dosage: "500mg", time: "20:00" },
      { medicationName: "Paracetamol", dosage: "1g", time: "06:00" },
      { medicationName: "Paracetamol", dosage: "1g", time: "14:00" },
      { medicationName: "Paracetamol", dosage: "1g", time: "22:00" },
    ]);
  });

  it("respects medication duration so reminders stop after the active window", async () => {
    const discharge = minimalDischarge({
      medications: [{ name: "Med", dosage: "10mg", frequency: "daily", duration: "2 days" }],
    });

    const plan = await buildRecoveryPlan("p-123", discharge);

    expect(plan.days[0]?.medicationReminders.length).toBe(1);
    expect(plan.days[1]?.medicationReminders.length).toBe(1);
    expect(plan.days[2]?.medicationReminders.length).toBe(0);
  });
});

describe("buildRecoveryPlan — unparsed medication frequencies", () => {
  it("flags unparseable frequencies instead of creating fake reminders", async () => {
    const discharge = minimalDischarge({
      medications: [
        { name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" },
        { name: "Mystery", dosage: "10mg", frequency: "as directed", duration: "7 days" },
      ],
    });

    const plan = await buildRecoveryPlan("p-123", discharge);

    expect(plan.medicationsNeedingScheduleReview).toEqual([
      { name: "Mystery", dosage: "10mg", frequency: "as directed" },
    ]);
    expect(countReminders(plan)).toBe(14); // 7 days x 2 reminders for Amoxicillin only
    const day0 = plan.days[0];
    if (!day0) throw new Error("Expected day 0 to exist");
    expect(day0.medicationReminders.some((r) => r.medicationName === "Mystery")).toBe(false);
  });

  it("records each flagged medication only once even when active for the whole plan", async () => {
    const discharge = minimalDischarge({
      medications: [
        { name: "A", dosage: "5mg", frequency: "take as instructed", duration: "14 days" },
        { name: "B", dosage: "10mg", frequency: "some weird schedule", duration: "14 days" },
      ],
    });

    const plan = await buildRecoveryPlan("p-123", discharge);

    expect(plan.medicationsNeedingScheduleReview).toHaveLength(2);
    expect(countReminders(plan)).toBe(0);
  });
});

describe("buildRecoveryPlan — backwards compatibility", () => {
  it("plans stored without medicationsNeedingScheduleReview still load safely", async () => {
    const discharge = minimalDischarge({
      medications: [{ name: "Med", dosage: "10mg", frequency: "daily", duration: "3 days" }],
    });

    const fullPlan = await buildRecoveryPlan("p-123", discharge);

    // Simulate an older stored plan that was persisted before the field existed.
    const oldPlan = { ...fullPlan } as Omit<RecoveryPlan, "medicationsNeedingScheduleReview">;
    delete (oldPlan as RecoveryPlan).medicationsNeedingScheduleReview;

    // The same guard used by the UI should treat the missing field as empty.
    const needsReview = (oldPlan as RecoveryPlan).medicationsNeedingScheduleReview ?? [];
    expect(needsReview).toEqual([]);
    expect(oldPlan.days[0]?.medicationReminders.length).toBeGreaterThan(0);
  });
});
