import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { staffTier } from "./roles";
import { segmentSeconds, validHandleSeconds } from "./aht-rules";

const TABLES = { recruitment: "interview_evaluations", manager: "manager_evaluations" } as const;

async function roles(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  return { db: supabaseAdmin, tier: staffTier((data ?? []).map((r) => r.role as string)) };
}

/** Starts the interview timer once (Iniciar button). Ignored if already started or finished. */
export const startInterviewTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["recruitment", "manager"]), evaluationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, tier } = await roles(context.userId);
    const ok = data.kind === "manager" ? tier.isAdmin || tier.isManager : tier.isAdmin || tier.isRecruitment;
    if (!ok) throw new Error("You cannot start this interview timer.");
    const now = new Date().toISOString();
    // Resume keeps any previously accumulated handle_seconds (paused time is not counted).
    const { error } = await db
      .from(TABLES[data.kind])
      .update({ timer_started_at: now, timer_ended_at: null, timer_last_seen_at: now, timer_owner_id: context.userId })
      .eq("id", data.evaluationId)
      .is("timer_started_at", null);
    if (error) throw new Error(error.message);
    const { data: row } = await db.from(TABLES[data.kind]).select("timer_started_at").eq("id", data.evaluationId).maybeSingle();
    return { startedAt: row?.timer_started_at ?? now };
  });

/** Pauses a running timer (user left the interview page). Accumulates elapsed time into handle_seconds so it can resume later. */
export const pauseInterviewTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["recruitment", "manager"]), evaluationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, tier } = await roles(context.userId);
    const ok = data.kind === "manager" ? tier.isAdmin || tier.isManager : tier.isAdmin || tier.isRecruitment;
    if (!ok) throw new Error("You cannot pause this interview timer.");
    const { data: row } = await db
      .from(TABLES[data.kind])
      .select("timer_started_at, timer_ended_at, timer_last_seen_at, handle_seconds")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!row?.timer_started_at || row.timer_ended_at) return { paused: false };
    const elapsed = segmentSeconds(row.timer_started_at, row.timer_last_seen_at, Date.now());
    const total = (row.handle_seconds ?? 0) + elapsed;
    const { error } = await db
      .from(TABLES[data.kind])
      .update({ timer_started_at: null, timer_ended_at: null, handle_seconds: total })
      .eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    return { paused: true, handleSeconds: total };
  });

/** Heartbeat while the interview page is visible; lets the server cut abandoned timers. */
export const heartbeatInterviewTimer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["recruitment", "manager"]), evaluationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, tier } = await roles(context.userId);
    const ok = data.kind === "manager" ? tier.isAdmin || tier.isManager : tier.isAdmin || tier.isRecruitment;
    if (!ok) return { ok: false };
    await db
      .from(TABLES[data.kind])
      .update({ timer_last_seen_at: new Date().toISOString(), timer_owner_id: context.userId })
      .eq("id", data.evaluationId)
      .not("timer_started_at", "is", null)
      .is("timer_ended_at", null);
    return { ok: true };
  });

export const getAhtReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().optional(), to: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { db, tier } = await roles(context.userId);
    if (!tier.isAdmin) throw new Error("Only Admin can view AHT.");
    const range = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T) => {
      let r = q;
      if (data.from) r = r.gte("timer_ended_at", data.from);
      if (data.to) r = r.lte("timer_ended_at", `${data.to}T23:59:59Z`);
      return r;
    };
    const [rec, man, { data: profiles }] = await Promise.all([
      range(db.from("interview_evaluations").select("evaluator_id, decided_by, timer_owner_id, handle_seconds").not("handle_seconds", "is", null) as never) as unknown as Promise<{ data: Array<{ evaluator_id: string | null; decided_by: string | null; timer_owner_id: string | null; handle_seconds: number }> | null }>,
      range(db.from("manager_evaluations").select("evaluator_id, decided_by, timer_owner_id, handle_seconds").not("handle_seconds", "is", null) as never) as unknown as Promise<{ data: Array<{ evaluator_id: string | null; decided_by: string | null; timer_owner_id: string | null; handle_seconds: number }> | null }>,
      db.from("staff_profiles").select("user_id, full_name, email"),
    ]);
    const name = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email]));
    const summarize = (rows: Array<{ evaluator_id: string | null; decided_by: string | null; timer_owner_id: string | null; handle_seconds: number }> | null) => {
      const by = new Map<string, number[]>();
      for (const r of rows ?? []) {
        if (!validHandleSeconds(r.handle_seconds)) continue;
        const id = r.timer_owner_id ?? r.decided_by ?? r.evaluator_id ?? "unknown";
        by.set(id, [...(by.get(id) ?? []), r.handle_seconds]);
      }
      return [...by.entries()]
        .map(([id, s]) => ({
          id,
          name: name.get(id) ?? "Unknown",
          count: s.length,
          avgSeconds: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
          minSeconds: Math.min(...s),
          maxSeconds: Math.max(...s),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };
    return { recruitment: summarize(rec.data), manager: summarize(man.data) };
  });
