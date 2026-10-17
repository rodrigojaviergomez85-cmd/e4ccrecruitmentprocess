import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";
import { DEFAULT_TIER_LABELS, type TierLabels } from "./scorecard-metrics";

const stage = z.enum(["recruitment", "manager"]);
const tableOf = (s: z.infer<typeof stage>) => (s === "recruitment" ? "interview_evaluations" : "manager_evaluations");

async function ctx(userId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active").eq("user_id", userId).maybeSingle(),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  if (!tier.isStaff || profile?.active === false) throw new Error("You do not have staff access.");
  return { db, tier, countries: (countries ?? []).map((c) => c.country_code) };
}

async function loadLabels(db: Awaited<ReturnType<typeof ctx>>["db"]): Promise<TierLabels> {
  const { data } = await db.from("scorecard_weights").select("thresholds").maybeSingle();
  const saved = ((data?.thresholds ?? {}) as { tierLabels?: Partial<TierLabels> }).tierLabels ?? {};
  return { ...DEFAULT_TIER_LABELS, ...saved };
}

export const getProfileTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stage, evaluationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, tier } = await ctx(context.userId);
    const { data: row } = await db
      .from(tableOf(data.stage))
      .select("profile_tier, profile_tier_reason, profile_tier_by, profile_tier_at")
      .eq("id", data.evaluationId)
      .maybeSingle();
    let by = "";
    if (row?.profile_tier_by) {
      const { data: s } = await db.from("staff_profiles").select("full_name, email").eq("user_id", row.profile_tier_by).maybeSingle();
      by = s?.full_name || s?.email || "";
    }
    const canEdit = tier.isAdmin || (data.stage === "recruitment" ? tier.isRecruitment : tier.isManager);
    return {
      tier: (row?.profile_tier as "A" | "B" | "C" | null) ?? null,
      reason: row?.profile_tier_reason ?? "",
      by,
      at: row?.profile_tier_at ?? null,
      labels: await loadLabels(db),
      canEdit,
    };
  });

export const setProfileTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      stage,
      evaluationId: z.string().uuid(),
      tier: z.enum(["A", "B", "C"]).nullable(),
      reason: z.string().trim().max(500),
    }).refine((v) => v.tier === null || v.reason.length >= 5, "Escribe una justificación breve (mínimo 5 caracteres).").parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, tier, countries } = await ctx(context.userId);
    const allowed = tier.isAdmin || (data.stage === "recruitment" ? tier.isRecruitment : tier.isManager);
    if (!allowed) throw new Error("No tienes permiso para clasificar en esta etapa.");
    const table = tableOf(data.stage);
    const { data: ev } = await db.from(table).select("application_id, profile_tier").eq("id", data.evaluationId).maybeSingle();
    if (!ev) throw new Error("Evaluación no encontrada.");
    const { data: app } = await db.from("applications").select("country_code").eq("id", ev.application_id).maybeSingle();
    if (!tier.isAdmin && app?.country_code && !countries.includes(app.country_code)) {
      throw new Error("Este candidato está fuera de los países asignados a tu cuenta.");
    }
    const patch = {
      profile_tier: data.tier,
      profile_tier_reason: data.tier ? data.reason : null,
      profile_tier_by: data.tier ? context.userId : null,
      profile_tier_at: data.tier ? new Date().toISOString() : null,
    };
    const { error } = await db.from(table).update(patch).eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    await writeAudit(db, {
      actorId: context.userId,
      action: "evaluation.profile_tier",
      entityType: table,
      entityId: data.evaluationId,
      applicationId: ev.application_id,
      oldValue: { profile_tier: ev.profile_tier },
      newValue: { profile_tier: data.tier, reason: patch.profile_tier_reason, stage: data.stage },
    });
    return { ok: true };
  });

export const saveTierLabels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ A: z.string().trim().min(2).max(80), B: z.string().trim().min(2).max(80), C: z.string().trim().min(2).max(80) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, tier } = await ctx(context.userId);
    if (!tier.isAdmin) throw new Error("Solo Admin puede editar las etiquetas.");
    const { data: row } = await db.from("scorecard_weights").select("id, thresholds").maybeSingle();
    if (!row) throw new Error("No hay configuración del scorecard.");
    const thresholds = { ...((row.thresholds ?? {}) as Record<string, unknown>), tierLabels: data };
    const { error } = await db.from("scorecard_weights").update({ thresholds }).eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
