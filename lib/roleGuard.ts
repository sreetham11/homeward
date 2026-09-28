// Rejects a write-action request unless it self-declares role: "patient". Used by the three
// write-triggering routes (checkin, presence-ping, escalate) so a caregiver's rendered UI —
// which never constructs this field — structurally cannot trigger a write, and a request
// missing it (or declaring "caregiver") is rejected outright rather than silently accepted.
//
// NOT cryptographic access control: this app has no accounts or sessions (recovery codes are a
// shared secret, not a credential — see CLAUDE.md's "Patient/caregiver linking" section), so a
// request forged directly via curl/devtools with role: "patient" set can still get through.
// What this guarantees is that normal use of the app's own UI can never produce a write from
// the caregiver view, and that hitting these endpoints with no role signal at all fails closed.
import { NextResponse } from "next/server";

export function requirePatientRole(role: unknown): NextResponse | null {
  if (role !== "patient") {
    return NextResponse.json(
      { error: "This action is only available from the patient view." },
      { status: 403 },
    );
  }
  return null;
}
