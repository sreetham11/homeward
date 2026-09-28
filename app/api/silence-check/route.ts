// Silence-detection endpoint for the n8n workflow (called on a schedule, e.g. once daily).
// Finds recovery plans that have gone quiet — no check-in in 48+ hours — so a human can follow
// up. This is a monitoring/ops endpoint, not part of the patient-facing pipeline: it never
// runs Layer A/B logic, it only reports on submission timing. The threshold math and the
// "never checked in at all" fallback are pure logic in lib/silenceCheck.ts — see
// lib/silenceCheck.test.ts before touching either.
//
// Data source: lib/planStore.ts's server-side (Supabase) persistence only. This app's
// zero-Supabase fallback keeps recovery state in each patient's own browser localStorage
// (see planStore.ts's file header), which is fundamentally not queryable from a server route —
// there is no "check localStorage instead" fallback possible here. When Supabase isn't
// configured, or is configured but has no plans yet, this endpoint says so explicitly
// (`dataSource`/`warning`) rather than returning an empty `silentPatients` array that would
// read identically to "checked everyone, nobody's silent."
//
// Auth: a single shared-secret header (X-Silence-Check-Key vs. SILENCE_CHECK_SECRET), checked
// with a constant-time comparison so this can't be triggered by anyone who finds the URL. Fails
// closed: if the server has no SILENCE_CHECK_SECRET configured, every request is rejected
// rather than the check silently running unauthenticated.
//
// APP_URL (optional): base URL used to build each silent patient's caregiverPortalUrl (see
// lib/silenceCheck.ts's buildCaregiverPortalUrl) — the deep link an n8n email node uses as its
// call-to-action. Left null (not a fabricated relative path) when unset, since this response is
// consumed by an external workflow with no browser origin to resolve a relative URL against.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllPlansServer,
  fetchLatestCheckinTimestampsServer,
  fetchLatestPresencePingsServer,
  isSupabaseConfigured,
} from "@/lib/planStore";
import { findSilentPatients, SILENCE_THRESHOLD_HOURS, type SilentPatient } from "@/lib/silenceCheck";

export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.SILENCE_CHECK_SECRET;
  if (!expected) return false;

  const provided = req.headers.get("x-silence-check-key");
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

export async function GET(req: NextRequest) {
  if (!process.env.SILENCE_CHECK_SECRET) {
    return NextResponse.json(
      { error: "SILENCE_CHECK_SECRET is not configured on the server — refusing to run unauthenticated." },
      { status: 500 },
    );
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const checkedAt = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      dataSource: "none",
      checkedAt,
      thresholdHours: SILENCE_THRESHOLD_HOURS,
      totalActivePlans: 0,
      silentPatients: [] as SilentPatient[],
      warning:
        "Supabase isn't configured for this deployment (NEXT_PUBLIC_SUPABASE_URL / " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY unset). This app's zero-Supabase fallback stores " +
        "recovery state in each patient's own browser localStorage, which a server route " +
        "cannot see. This response is NOT 'zero patients are silent' — it means silence " +
        "detection could not run at all. Configure Supabase to enable it.",
    });
  }

  let plans, latestCheckins, latestPresencePings;
  try {
    plans = await fetchAllPlansServer();
    if (plans.length > 0) {
      [latestCheckins, latestPresencePings] = await Promise.all([
        fetchLatestCheckinTimestampsServer(),
        fetchLatestPresencePingsServer(),
      ]);
    } else {
      latestCheckins = new Map<string, string>();
      latestPresencePings = new Map<string, string>();
    }
  } catch (err) {
    // A real query failure (e.g. supabase/schema.sql was never applied to this project, or the
    // table/columns drifted) — distinct from "queried successfully, zero rows." Reported as
    // its own dataSource rather than folded into an empty silentPatients array, which is
    // exactly the "silently looks fine" failure mode this endpoint exists to avoid.
    return NextResponse.json(
      {
        dataSource: "error",
        checkedAt,
        thresholdHours: SILENCE_THRESHOLD_HOURS,
        totalActivePlans: 0,
        silentPatients: [] as SilentPatient[],
        warning: `Supabase is configured, but the query failed: ${err instanceof Error ? err.message : String(err)}. This is NOT "zero patients are silent" — silence detection could not run. If this mentions a missing table, supabase/schema.sql likely hasn't been applied to this Supabase project yet.`,
      },
      { status: 502 },
    );
  }

  if (plans.length === 0) {
    return NextResponse.json({
      dataSource: "supabase",
      checkedAt,
      thresholdHours: SILENCE_THRESHOLD_HOURS,
      totalActivePlans: 0,
      silentPatients: [] as SilentPatient[],
      warning: "Supabase is configured and reachable, but no recovery plans have been persisted yet.",
    });
  }

  const silentPatients = findSilentPatients(
    plans,
    latestCheckins,
    latestPresencePings,
    Date.now(),
    SILENCE_THRESHOLD_HOURS,
    process.env.APP_URL || null,
  );

  return NextResponse.json({
    dataSource: "supabase",
    checkedAt,
    thresholdHours: SILENCE_THRESHOLD_HOURS,
    totalActivePlans: plans.length,
    silentPatients: silentPatients.map((p) => ({
      ...p,
      // Legacy aliases for external workflows (e.g. an n8n silence-check automation) still
      // built against the pre-rename response shape — lastActivityDate/hoursSinceLastActivity
      // replaced these when a presence ping became able to count as "last activity" too (see
      // lib/silenceCheck.ts's SilentPatient header). Purely additive: safe to delete once every
      // external consumer has migrated to the current field names.
      lastCheckinDate: p.lastActivityDate,
      hoursSinceLastCheckin: p.hoursSinceLastActivity,
    })),
  });
}
