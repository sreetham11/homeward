// Patient+caregiver linked recovery state.
//
// Two independent persistence paths, matching the "each integration degrades independently"
// principle:
// - Server-side (persist*Server / fetchPlanServer, used from app/api/*): writes to Supabase
//   when configured; a silent no-op otherwise. API routes always return the full object in
//   the response body regardless, so the client can persist it itself when Supabase is absent.
// - Client-side (saveLocalPlan / appendLocal* / subscribeToRecoveryCode, used from
//   components/*): when Supabase is configured, live updates come from Supabase Realtime
//   (works across devices — patient's phone, caregiver's phone). When it isn't, state lives
//   in localStorage and BroadcastChannel notifies other same-device tabs — the "zero setup,
//   single device" demo path where patient and caregiver views are just two browser tabs.
//
// A recovery code (not a login) is what links patient and caregiver — see CLAUDE.md for why
// this project uses a short shared code instead of formal auth for the FA prototype.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CheckinInput, DeviationResult, EscalationSummary, RecoveryPlan } from "./types";

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

// Bumped from 6 to 8 characters for a larger keyspace (harder to brute-force guess a valid
// code — see lib/rateLimit.ts for the other half of that mitigation). Nothing in this codebase
// validates or length-checks a recovery code before using it as a lookup key (grep for
// RECOVERY_CODE_ALPHABET/recoveryCode before assuming otherwise), so existing 6-character codes
// — including the fixed demo codes DEMO01/DEMO02 in scripts/seed-demo.ts — keep working
// unchanged; only newly generated codes get the longer length.
export function generateRecoveryCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += RECOVERY_CODE_ALPHABET[Math.floor(Math.random() * RECOVERY_CODE_ALPHABET.length)];
  }
  return code;
}

export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function supabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}

// --- Server-side: Supabase only, no-ops when unconfigured ---

export async function persistPlanServer(recoveryCode: string, plan: RecoveryPlan): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseClient().from("recovery_plans").upsert({
    recovery_code: recoveryCode,
    patient_id: plan.patientId,
    discharge_data: plan.discharge,
    days: plan.days,
    generated_by: plan.generatedBy,
    created_at: plan.createdAt,
    caregiver_email: plan.caregiverEmail,
  });
  if (error) console.error("persistPlanServer failed:", error.message);
}

export async function fetchPlanServer(recoveryCode: string): Promise<RecoveryPlan | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseClient()
    .from("recovery_plans")
    .select("*")
    .eq("recovery_code", recoveryCode)
    .maybeSingle();
  if (error || !data) return null;
  return {
    patientId: data.patient_id,
    discharge: data.discharge_data,
    days: data.days,
    generatedBy: data.generated_by,
    createdAt: data.created_at,
    caregiverEmail: data.caregiver_email ?? null,
  };
}

export async function persistCheckinServer(
  recoveryCode: string,
  checkin: CheckinInput,
  deviation: DeviationResult,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseClient().from("checkins").insert({
    recovery_code: recoveryCode,
    day_number: checkin.dayNumber,
    payload: checkin,
    deviation_result: deviation,
  });
  if (error) console.error("persistCheckinServer failed:", error.message);
}

export async function persistEscalationServer(
  recoveryCode: string,
  summary: EscalationSummary,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseClient().from("escalations").insert({
    recovery_code: recoveryCode,
    day_number: summary.dayNumber,
    summary,
  });
  if (error) console.error("persistEscalationServer failed:", error.message);
}

export interface StoredPlanRow {
  recoveryCode: string;
  plan: RecoveryPlan;
}

/** Every persisted recovery plan, across all patients. Used by the silence-detection endpoint
 * (app/api/silence-check) to know which recovery codes to check — not exposed to any
 * patient/caregiver-facing route, which always operate on a single known recoveryCode.
 *
 * Unlike every other function in this file, this one THROWS on a Supabase error rather than
 * silently returning []. Every other caller in this app is best-effort (a failed persist just
 * means the client falls back to localStorage — not safety-critical), so swallowing errors
 * there is correct. app/api/silence-check is different: to it, [] means "confirmed zero
 * plans," and conflating that with "the query itself failed" (e.g. schema.sql was never run
 * against this project) is exactly the "silently looks fine" failure mode that endpoint exists
 * to avoid. Let the route decide how to report a real query failure. */
export async function fetchAllPlansServer(): Promise<StoredPlanRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabaseClient().from("recovery_plans").select("*");
  if (error) throw new Error(`fetchAllPlansServer: ${error.message}`);
  return (data ?? []).map((row) => ({
    recoveryCode: row.recovery_code,
    plan: {
      patientId: row.patient_id,
      discharge: row.discharge_data,
      days: row.days,
      generatedBy: row.generated_by,
      createdAt: row.created_at,
      caregiverEmail: row.caregiver_email ?? null,
    },
  }));
}

/** Most recent check-in timestamp per recovery code, across every patient — one query instead
 * of N+1 per-plan lookups. A recovery code with no entry here has never had a check-in
 * submitted at all. Used by app/api/silence-check. Throws on a Supabase error rather than
 * silently returning an empty map — see fetchAllPlansServer's comment for why that distinction
 * matters specifically for this endpoint. */
export async function fetchLatestCheckinTimestampsServer(): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map();
  const { data, error } = await supabaseClient()
    .from("checkins")
    .select("recovery_code, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`fetchLatestCheckinTimestampsServer: ${error.message}`);
  const latest = new Map<string, string>();
  for (const row of data ?? []) {
    // Sorted descending, so the first row seen per recovery_code is its most recent check-in.
    if (!latest.has(row.recovery_code)) latest.set(row.recovery_code, row.created_at);
  }
  return latest;
}

export async function fetchCheckinsServer(
  recoveryCode: string,
): Promise<{ checkin: CheckinInput; deviation: DeviationResult }[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabaseClient()
    .from("checkins")
    .select("*")
    .eq("recovery_code", recoveryCode)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({ checkin: row.payload, deviation: row.deviation_result }));
}

export async function fetchEscalationsServer(recoveryCode: string): Promise<EscalationSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabaseClient()
    .from("escalations")
    .select("*")
    .eq("recovery_code", recoveryCode)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => row.summary as EscalationSummary);
}

/**
 * Records a lightweight "I'm okay" presence ping — NOT a check-in. See presence_pings' comment
 * in supabase/schema.sql: this never touches CheckinInput or lib/deviation.ts, it only proves
 * the patient is present. Best-effort like every other persist*Server function (silent no-op
 * without Supabase); unlike fetchAllPlansServer/fetchLatestCheckinTimestampsServer this one is
 * a write from a patient-facing route, not a read the silence-check ops endpoint depends on to
 * distinguish "confirmed empty" from "query failed," so swallowing errors here is correct.
 */
export async function persistPresencePingServer(recoveryCode: string, pingedAt: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseClient()
    .from("presence_pings")
    .insert({ recovery_code: recoveryCode, created_at: pingedAt });
  if (error) console.error("persistPresencePingServer failed:", error.message);
}

export async function fetchPresencePingsServer(recoveryCode: string): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabaseClient()
    .from("presence_pings")
    .select("created_at")
    .eq("recovery_code", recoveryCode)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((row) => row.created_at as string);
}

/** Most recent presence-ping timestamp per recovery code, across every patient. Used by
 * app/api/silence-check alongside fetchLatestCheckinTimestampsServer — see lib/silenceCheck.ts
 * for how the two are combined into "last activity." Throws on a Supabase error rather than
 * silently returning an empty map, same reasoning as fetchAllPlansServer. */
export async function fetchLatestPresencePingsServer(): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map();
  const { data, error } = await supabaseClient()
    .from("presence_pings")
    .select("recovery_code, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`fetchLatestPresencePingsServer: ${error.message}`);
  const latest = new Map<string, string>();
  for (const row of data ?? []) {
    if (!latest.has(row.recovery_code)) latest.set(row.recovery_code, row.created_at);
  }
  return latest;
}

// --- Client-side: localStorage + BroadcastChannel fallback ---

export interface LocalRecoveryState {
  plan: RecoveryPlan;
  checkins: { checkin: CheckinInput; deviation: DeviationResult }[];
  escalations: EscalationSummary[];
  /** ISO timestamps of "I'm okay" presence pings — see persistPresencePingServer's comment.
   * Kept separate from `checkins` so the UI never confuses the two. */
  presencePings: string[];
}

function localStorageKey(recoveryCode: string): string {
  return `homeward:${recoveryCode}`;
}

function broadcastChannelFor(recoveryCode: string): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(`homeward:${recoveryCode}`);
}

export function readLocalState(recoveryCode: string): LocalRecoveryState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(localStorageKey(recoveryCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LocalRecoveryState;
  } catch {
    return null;
  }
}

function writeLocalState(recoveryCode: string, state: LocalRecoveryState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localStorageKey(recoveryCode), JSON.stringify(state));
  const channel = broadcastChannelFor(recoveryCode);
  channel?.postMessage({ type: "state_updated" });
  channel?.close();
}

export function saveLocalPlan(recoveryCode: string, plan: RecoveryPlan): void {
  const existing = readLocalState(recoveryCode);
  writeLocalState(recoveryCode, {
    plan,
    checkins: existing?.checkins ?? [],
    escalations: existing?.escalations ?? [],
    presencePings: existing?.presencePings ?? [],
  });
}

export function appendLocalCheckin(
  recoveryCode: string,
  checkin: CheckinInput,
  deviation: DeviationResult,
): void {
  const existing = readLocalState(recoveryCode);
  if (!existing) return;
  writeLocalState(recoveryCode, {
    ...existing,
    checkins: [...existing.checkins, { checkin, deviation }],
  });
}

export function appendLocalEscalation(recoveryCode: string, summary: EscalationSummary): void {
  const existing = readLocalState(recoveryCode);
  if (!existing) return;
  writeLocalState(recoveryCode, {
    ...existing,
    escalations: [...existing.escalations, summary],
  });
}

export function appendLocalPresencePing(recoveryCode: string, pingedAt: string): void {
  const existing = readLocalState(recoveryCode);
  if (!existing) return;
  writeLocalState(recoveryCode, {
    ...existing,
    presencePings: [...existing.presencePings, pingedAt],
  });
}

/**
 * Live updates for a recovery code: Supabase Realtime across devices when configured,
 * BroadcastChannel across same-device tabs otherwise. Returns an unsubscribe function.
 * Client-only — safe to call from a useEffect, a no-op if called during SSR.
 */
export function subscribeToRecoveryCode(recoveryCode: string, onUpdate: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  if (isSupabaseConfigured()) {
    const supabase = supabaseClient();
    const channel = supabase
      .channel(`recovery:${recoveryCode}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "checkins", filter: `recovery_code=eq.${recoveryCode}` },
        onUpdate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "escalations", filter: `recovery_code=eq.${recoveryCode}` },
        onUpdate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "presence_pings", filter: `recovery_code=eq.${recoveryCode}` },
        onUpdate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }

  const channel = broadcastChannelFor(recoveryCode);
  if (!channel) return () => {};
  channel.onmessage = () => onUpdate();
  return () => channel.close();
}

/**
 * Real runtime check for whether Supabase Realtime actually connects — not just whether it's
 * configured. Realtime is a browser WebSocket handshake, which a corporate proxy, ad blocker,
 * or misconfigured project could kill even with valid keys, so isSupabaseConfigured() alone
 * can't tell the UI whether sync will actually work. Opens a disposable channel, waits for the
 * subscribe callback to report SUBSCRIBED, and always cleans up. Client-only.
 */
export function checkRealtimeHealth(timeoutMs = 4000): Promise<boolean> {
  if (typeof window === "undefined" || !isSupabaseConfigured()) return Promise.resolve(false);

  return new Promise((resolve) => {
    const supabase = supabaseClient();
    const channel = supabase.channel(`health-check-${Math.random().toString(36).slice(2)}`);
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      supabase.removeChannel(channel);
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") finish(true);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") finish(false);
    });
  });
}
