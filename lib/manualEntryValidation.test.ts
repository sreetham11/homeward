import { describe, it, expect } from "vitest";
import { isJunkText, validateManualDischarge, isManualDischargeComplete } from "./manualEntryValidation";
import type { DischargeData } from "./types";

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
    dischargeDate: "2026-07-01",
    needsManualReview: true,
    manualReviewNotes: ["Filled in manually."],
  };
}

function realDischarge(): DischargeData {
  return {
    diagnosis: "Acute appendicitis",
    procedureType: "Laparoscopic appendectomy",
    medications: [{ name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" }],
    woundCareInstructions: ["Keep the dressing dry for 48 hours"],
    activityRestrictions: ["No heavy lifting for 2 weeks"],
    followUpDate: "2026-07-15",
    followUpLocation: null,
    doctorStatedWarningSigns: ["Fever above 38C", "Redness spreading around the wound"],
    dischargeDate: "2026-07-01",
    needsManualReview: true,
    manualReviewNotes: ["Filled in manually."],
  };
}

describe("isJunkText", () => {
  it("rejects empty and whitespace-only text", () => {
    expect(isJunkText("")).toBe(true);
    expect(isJunkText("   ")).toBe(true);
  });

  it("rejects trivially short text", () => {
    expect(isJunkText("ab")).toBe(true);
  });

  it("rejects known placeholder/junk phrases, case-insensitively", () => {
    expect(isJunkText("lol")).toBe(true);
    expect(isJunkText("LOL")).toBe(true);
    expect(isJunkText("test")).toBe(true);
    expect(isJunkText("Testing")).toBe(true);
    expect(isJunkText("n/a")).toBe(true);
    expect(isJunkText("asdf")).toBe(true);
    expect(isJunkText("idk")).toBe(true);
  });

  it("rejects all-repeated-character runs", () => {
    expect(isJunkText("aaaa")).toBe(true);
    expect(isJunkText("1111")).toBe(true);
  });

  it("accepts real medical content", () => {
    expect(isJunkText("Acute appendicitis")).toBe(false);
    expect(isJunkText("No heavy lifting for 2 weeks")).toBe(false);
    expect(isJunkText("Fever above 38C")).toBe(false);
  });
});

describe("validateManualDischarge", () => {
  it("flags every required field on a freshly opened, empty manual form", () => {
    const errors = validateManualDischarge(emptyDischarge());
    expect(errors.diagnosis).toBeTruthy();
    expect(errors.procedureType).toBeTruthy();
    expect(errors.medications).toBeTruthy();
    expect(errors.woundCareInstructions).toBeTruthy();
    expect(errors.activityRestrictions).toBeTruthy();
    expect(errors.followUpDate).toBeTruthy();
    expect(errors.doctorStatedWarningSigns).toBeTruthy();
    expect(isManualDischargeComplete(emptyDischarge())).toBe(false);
  });

  it("passes a genuinely filled-in manual form", () => {
    const errors = validateManualDischarge(realDischarge());
    expect(errors).toEqual({});
    expect(isManualDischargeComplete(realDischarge())).toBe(true);
  });

  it("still rejects the form when fields are filled with junk instead of left empty", () => {
    const junk: DischargeData = {
      ...emptyDischarge(),
      diagnosis: "lol",
      procedureType: "test",
      medications: [{ name: "test", dosage: "test", frequency: "test", duration: "" }],
      woundCareInstructions: ["n/a"],
      activityRestrictions: ["asdf"],
      followUpDate: "2026-07-15",
      doctorStatedWarningSigns: ["idk"],
    };
    const errors = validateManualDischarge(junk);
    expect(errors.diagnosis).toBeTruthy();
    expect(errors.procedureType).toBeTruthy();
    expect(errors.medications).toBeTruthy();
    expect(errors.woundCareInstructions).toBeTruthy();
    expect(errors.activityRestrictions).toBeTruthy();
    expect(errors.doctorStatedWarningSigns).toBeTruthy();
    expect(errors.followUpDate).toBeUndefined();
    expect(isManualDischargeComplete(junk)).toBe(false);
  });

  it("does not require a follow-up location or discharge date (only follow-up date is required)", () => {
    const discharge = { ...realDischarge(), followUpLocation: null };
    expect(validateManualDischarge(discharge).followUpDate).toBeUndefined();
  });

  it("treats a medications list where only some rows are real as still incomplete if all rows are junk, but passes when at least one row is real", () => {
    const mixed = {
      ...realDischarge(),
      medications: [
        { name: "test", dosage: "test", frequency: "test", duration: "" },
        { name: "Amoxicillin", dosage: "500mg", frequency: "twice daily", duration: "7 days" },
      ],
    };
    expect(validateManualDischarge(mixed).medications).toBeUndefined();

    const allJunkMeds = {
      ...realDischarge(),
      medications: [{ name: "test", dosage: "test", frequency: "test", duration: "" }],
    };
    expect(validateManualDischarge(allJunkMeds).medications).toBeTruthy();
  });
});
