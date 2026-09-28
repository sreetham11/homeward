import { describe, it, expect } from "vitest";
import { hasLimitedWarningSignData, MIN_WARNING_SIGNS } from "./dischargeDataQuality";
import type { DischargeData } from "./types";

function baseDischarge(overrides: Partial<DischargeData> = {}): DischargeData {
  return {
    diagnosis: "Acute appendicitis",
    procedureType: "Laparoscopic appendectomy",
    medications: [],
    woundCareInstructions: [],
    activityRestrictions: [],
    followUpDate: null,
    followUpLocation: null,
    doctorStatedWarningSigns: ["Fever above 38 degrees", "Severe abdominal pain"],
    dischargeDate: "2026-09-22",
    needsManualReview: false,
    ...overrides,
  };
}

describe("hasLimitedWarningSignData", () => {
  it("MIN_WARNING_SIGNS is 2", () => {
    expect(MIN_WARNING_SIGNS).toBe(2);
  });

  it("is false when needsManualReview is false and there are enough warning signs", () => {
    expect(hasLimitedWarningSignData(baseDischarge())).toBe(false);
  });

  it("is false right at the threshold (exactly MIN_WARNING_SIGNS)", () => {
    expect(
      hasLimitedWarningSignData(
        baseDischarge({ doctorStatedWarningSigns: ["Fever above 38 degrees", "Chest pain"] }),
      ),
    ).toBe(false);
  });

  it("is true when there are fewer than MIN_WARNING_SIGNS warning signs", () => {
    expect(
      hasLimitedWarningSignData(baseDischarge({ doctorStatedWarningSigns: ["Fever above 38 degrees"] })),
    ).toBe(true);
  });

  it("is true when there are zero warning signs", () => {
    expect(hasLimitedWarningSignData(baseDischarge({ doctorStatedWarningSigns: [] }))).toBe(true);
  });

  it("is true when needsManualReview is true, even with plenty of warning signs", () => {
    expect(
      hasLimitedWarningSignData(
        baseDischarge({
          needsManualReview: true,
          doctorStatedWarningSigns: ["Fever above 38 degrees", "Chest pain", "Severe pain"],
        }),
      ),
    ).toBe(true);
  });

  it("is false only when both conditions are satisfied: manual review not needed AND enough signs", () => {
    expect(
      hasLimitedWarningSignData(
        baseDischarge({
          needsManualReview: false,
          doctorStatedWarningSigns: ["Fever above 38 degrees", "Chest pain", "Severe pain"],
        }),
      ),
    ).toBe(false);
  });
});
