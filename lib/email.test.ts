import { describe, expect, it } from "vitest";
import { isValidEmail } from "./email";

describe("isValidEmail", () => {
  it("accepts plausible email addresses", () => {
    expect(isValidEmail("caregiver@example.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co.uk")).toBe(true);
    expect(isValidEmail("  caregiver@example.com  ")).toBe(true); // trims surrounding whitespace
  });

  it("rejects empty, missing @, or missing domain dot", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing-domain@")).toBe(false);
    expect(isValidEmail("@missing-local.com")).toBe(false);
    expect(isValidEmail("no-dot@example")).toBe(false);
  });

  it("rejects addresses with spaces", () => {
    expect(isValidEmail("has space@example.com")).toBe(false);
  });
});
