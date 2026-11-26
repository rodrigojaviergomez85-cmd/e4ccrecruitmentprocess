import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";
import { nextStage, type AdmonStage } from "./admon";

export async function requireAdmonStaff(userId: string, authDb: SupabaseClient<Database>, fullOnly = false) {
  const [{ data: roles, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    authDb.from("user_roles").select("role").eq("user_id", userId),
    authDb.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  // Restricted ADMON interviewers (Operations / Technical) only touch the stages assigned to them.
  const operationsOnly = !tier.isStaff && (tier.isOperationsManager || tier.isTechnicalInterviewer);
  const myStages: ("operations" | "technical")[] = operationsOnly
    ? [...(tier.isOperationsManager ? ["operations" as const] : []), ...(tier.isTechnicalInterviewer ? ["technical" as const] : [])]
    : [];
  if (roleError || profileError || (!tier.isStaff && !operationsOnly) || (fullOnly && !tier.isStaff) || profile?.active === false) throw new Error("Acceso solo para personal interno.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return { db, email: profile?.email ?? null, operationsOnly, myStages };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = Record<string, any>;

export type AdmonCandidate = {
  id: string; full_name: string; email: string; phone: string; cv_link: string; country: string; branch: string;
  position: string; stage: AdmonStage; screening: AnyJson; operations: AnyJson;
  technical: AnyJson; screening_by: string | null; screening_decision: string | null; screening_at: string | null;
  operations_interviewer: string | null; operations_decision: string | null; operations_at: string | null;
  technical_interviewer: string | null; technical_decision: string | null; technical_at: string | null; created_at: string;
};

export const listAdmon = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, operationsOnly, myStages } = await requireAdmonStaff(context.userId, context.supabase);
    const [{ data, error }, { data: staff }, { data: roleRows }] = await Promise.all([
      db.from("admon_candidates").select("*").order("created_at", { ascending: false }).limit(1000),
      db.from("staff_profiles").select("user_id, full_name, active").order("full_name"),
      db.from("user_roles").select("user_id, role").in("role", ["operations_manager", "technical_interviewer"]),
    ]);
    const withRole = (role: string) => new Set((roleRows ?? []).filter((r) => r.role === role).map((r) => r.user_id as string));
    const opsIds = withRole("operations_manager");
    const techIds = withRole("technical_interviewer");
    const activeStaff = (staff ?? []).filter((s) => s.active !== false).map((s) => ({ id: s.user_id as string, name: s.full_name as string }));
    if (error) throw new Error(error.message);
    return {
      me: context.userId,
      candidates: ((data ?? []) as unknown as AdmonCandidate[]).filter((c) => !operationsOnly
        || (myStages.includes("operations") && c.operations_interviewer === context.userId)
        || (myStages.includes("technical") && c.technical_interviewer === context.userId)),
      operationsOnly,
      myStages,
      staff: (staff ?? []).map((s) => ({ id: s.user_id as string, name: s.full_name as string })),
      operationsInterviewers: activeStaff.filter((s) => opsIds.has(s.id)),
      technicalInterviewers: activeStaff.filter((s) => techIds.has(s.id)),
    };
  });

const basics = z.object({
  full_name: z.string().trim().min(2).max(160),
  email: z.string().trim().max(255).refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), "Correo inválido"),
  phone: z.string().trim().max(40),
  cv_link: z.string().trim().max(500),
  country: z.string().trim().max(40),
  branch: z.string().trim().max(80),
  position: z.string().trim().min(1, "Elige el puesto").max(80),
});

export const createAdmon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => basics.parse(d))
  .handler(async ({ data, context }) => {
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase, true);
    const { data: row, error } = await db.from("admon_candidates")
      .insert({ ...data, email: data.email.toLowerCase(), created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.create", entityType: "admon_candidate", entityId: row.id, newValue: data });
    return { id: row.id as string };
  });

export const updateAdmonBasics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => basics.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, email } = await requireAdmonStaff(context.userId, context.supabase, true);
    const { id, ...rest } = data;
    const { error } = await db.from("admon_candidates").update({ ...rest, email: rest.email.toLowerCase() }).eq("id", id);
    if (error) throw new Error(error.message);
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: "admon.update_basics", entityType: "admon_candidate", entityId: id, newValue: rest });
    return { ok: true };
  });

const answers = z.record(z.string().max(60), z.unknown()).refine((v) => JSON.stringify(v).length < 100_000, "Demasiado texto");

export const saveAdmonStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    stage: z.enum(["screening", "operations", "technical"]),
    answers,
    finish: z.enum(["pass", "fail"]).optional(),
    nextInterviewer: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, email, operationsOnly, myStages } = await requireAdmonStaff(context.userId, context.supabase);
    const { data: current, error: e1 } = await db.from("admon_candidates").select("stage, operations_interviewer, technical_interviewer").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    if (current.stage !== data.stage) throw new Error("Esta etapa ya fue cerrada.");
    if (operationsOnly && (data.stage === "screening" || !myStages.includes(data.stage) || current[`${data.stage}_interviewer`] !== context.userId)) throw new Error("Solo puedes evaluar las entrevistas asignadas a ti.");
    if (data.finish === "pass" && data.stage !== "technical") {
      if (!data.nextInterviewer) throw new Error("Elige quién hará la siguiente entrevista.");
      const role = data.stage === "screening" ? "operations_manager" : "technical_interviewer";
      const { data: ok } = await db.from("user_roles").select("user_id").eq("user_id", data.nextInterviewer).eq("role", role).maybeSingle();
      if (!ok) throw new Error(data.stage === "screening" ? "Elige un Gerente de Operaciones." : "Elige un Entrevistador Técnico.");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { [data.stage]: data.answers };
    if (data.finish) {
      const now = new Date().toISOString();
      patch[`${data.stage}_decision`] = data.finish === "pass" ? "Pasa" : "No pasa";
      patch[`${data.stage}_at`] = now;
      patch["stage"] = nextStage(data.stage, data.finish === "pass");
      if (data.stage === "screening") patch["screening_by"] = context.userId;
      if (data.finish === "pass" && data.stage === "screening") patch["operations_interviewer"] = data.nextInterviewer;
      if (data.finish === "pass" && data.stage === "operations") patch["technical_interviewer"] = data.nextInterviewer;
    }
    const { error } = await db.from("admon_candidates").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.finish) await writeAudit(db, { actorId: context.userId, actorEmail: email, action: `admon.${data.stage}.${data.finish}`, entityType: "admon_candidate", entityId: data.id, newValue: { stage: patch["stage"] } });
    return { ok: true };
  });

/** Reopens the last closed stage (e.g. a decision recorded by mistake). */
export const reopenAdmonStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), stage: z.enum(["screening", "operations", "technical"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, email, operationsOnly, myStages } = await requireAdmonStaff(context.userId, context.supabase);
    if (operationsOnly) {
      const { data: assigned } = await db.from("admon_candidates").select("operations_interviewer, technical_interviewer").eq("id", data.id).single();
      if (data.stage === "screening" || !myStages.includes(data.stage) || assigned?.[`${data.stage}_interviewer`] !== context.userId) throw new Error("Solo puedes reabrir tus propias entrevistas.");
    }
    const { error } = await db.from("admon_candidates")
      .update({ stage: data.stage, [`${data.stage}_decision`]: null, [`${data.stage}_at`]: null } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(db, { actorId: context.userId, actorEmail: email, action: `admon.${data.stage}.reopen`, entityType: "admon_candidate", entityId: data.id });
    return { ok: true };
  });
