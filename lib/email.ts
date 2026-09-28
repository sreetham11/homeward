// Basic, deterministic email-format check — not a mailbox-existence check, just "plausible
// enough to store and later hand to Resend." Kept in its own zero-import file so it's safe in
// both the OnboardingFlow.tsx 'use client' bundle and server routes (app/api/plan).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
