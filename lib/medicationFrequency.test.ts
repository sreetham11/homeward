import { describe, it, expect } from "vitest";
import { medicationNeedsScheduleReview, reminderTimesForFrequency } from "./medicationFrequency";

describe("reminderTimesForFrequency — parsed cases", () => {
  it.each([
    ["prn", ["PRN"]],
    ["as needed", ["PRN"]],
    ["daily", ["09:00"]],
    ["once daily", ["09:00"]],
    ["qd", ["09:00"]],
    ["twice daily", ["08:00", "20:00"]],
    ["BID", ["08:00", "20:00"]],
    ["every 12 hours", ["08:00", "20:00"]],
    ["three times daily", ["06:00", "14:00", "22:00"]],
    ["TID", ["06:00", "14:00", "22:00"]],
    ["every 8 hours", ["06:00", "14:00", "22:00"]],
    ["four times daily", ["06:00", "12:00", "18:00", "00:00"]],
    ["QID", ["06:00", "12:00", "18:00", "00:00"]],
    ["every 6 hours", ["06:00", "12:00", "18:00", "00:00"]],
    ["every 4 hours", ["06:00", "10:00", "14:00", "18:00", "22:00"]],
  ])("parses %j into %j", (frequency, expectedTimes) => {
    const result = reminderTimesForFrequency(frequency as string);
    expect(result.needsReview).toBe(false);
    expect(result.times).toEqual(expectedTimes);
  });
});

describe("reminderTimesForFrequency — unparsed cases", () => {
  it.each([
    "as directed",
    "take as instructed",
    "every few hours",
    "with meals",
    "",
    "some weird schedule",
  ])("flags %j as needing review instead of guessing", (frequency) => {
    const result = reminderTimesForFrequency(frequency);
    expect(result.needsReview).toBe(true);
    expect(result.times).toEqual([]);
  });

  it("exposes the review flag through medicationNeedsScheduleReview", () => {
    expect(medicationNeedsScheduleReview("daily")).toBe(false);
    expect(medicationNeedsScheduleReview("as directed")).toBe(true);
  });
});
