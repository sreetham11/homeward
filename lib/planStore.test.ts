import { describe, it, expect } from "vitest";
import { generateRecoveryCode } from "./planStore";

const VALID_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));
const EXCLUDED_CHARS = ["0", "O", "1", "I"];

describe("generateRecoveryCode", () => {
  it("defaults to 8 characters (bumped from 6 for a larger keyspace)", () => {
    expect(generateRecoveryCode()).toHaveLength(8);
  });

  it("only ever uses characters from the ambiguity-free alphabet", () => {
    for (let i = 0; i < 200; i++) {
      for (const char of generateRecoveryCode()) {
        expect(VALID_CHARS.has(char)).toBe(true);
      }
    }
  });

  it("never includes visually ambiguous characters (0/O/1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode();
      for (const excluded of EXCLUDED_CHARS) {
        expect(code.includes(excluded)).toBe(false);
      }
    }
  });

  it("still supports an explicit length for backwards compatibility with old 6-character codes", () => {
    expect(generateRecoveryCode(6)).toHaveLength(6);
  });
});
