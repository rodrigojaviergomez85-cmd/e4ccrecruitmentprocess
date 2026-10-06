import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { AGREEMENT_KEYS, TRAINING_KEYS, normalizeModality } from "./manager-scorecard";
import { staffTier } from "./roles";
import { trainingDocsFor } from "./candidate-emails";
import { TRAINING_STATUSES, REFERENCE_CALL_VALUES, SPOT_TYPES, trainingPermissions } from "./training";

async function ctxFor(userId: string, userDb: { from: typeof import("@/integrations/supabase/client").supabase.from }) {
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    userDb.from("user_roles").select("role").eq("user_id", userId),
    userDb.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
    userDb.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  if (!tier.canSignIn) throw new Error("You do not have access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const [{ data: fullProfile, error: profileError }, { data: fullCountries, error: countryError }] = await Promise.all([
    db.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  if (profileError || countryError) throw new Error("Could not verify your access.");
  if (fullProfile?.active === false) throw new Error("Your account is deactivated.");
  return {
    db,
    tier,
    email: fullProfile?.email ?? null,
    allowedCountries: tier.isAdmin ? null : (fullCountries ?? countries ?? []).map((c) => c.country_code),
    ...trainingPermissions((roles ?? []).map((r) => r.role as string)),
  };
}

export const listTrainingRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    let q = ctx.db
      .from("applications")
      .select("id, full_name, email, phone, country, country_code, city, status, assigned_manager_id, manager_evaluations(attempt_number, final_decision, decided_at, evidence), work_references(verification_status), training_roster(*)")
      .eq("status", "Approved for Training")
      .is("archived_at", null);
    if (ctx.allowedCountries) q = q.in("country_code", ctx.allowedCountries.length ? ctx.allowedCountries : ["__none__"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((a) => {
      const ev = [...(a.manager_evaluations ?? [])]
        .filter((e) => e.final_decision === "Approved for Training")
        .sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0];
      const t = (ev?.evidence as Record<string, string> | null) ?? {};
      const r = (Array.isArray(a.training_roster) ? a.training_roster[0] : a.training_roster) ?? null;
      const modality = normalizeModality(t[AGREEMENT_KEYS.modality]);
      const docs = trainingDocsFor(a.country_code)?.items ?? [];
      const refs = a.work_references ?? [];
      return {
        id: a.id,
        fullName: a.full_name,
        email: a.email,
        phone: a.phone,
        country: a.country,
        countryCode: a.country_code,
        lob: (t[AGREEMENT_KEYS.lob] || "").trim() || "Sin LOB",
        modality,
        branch: (t[TRAINING_KEYS.branch] || "").trim() || (modality === "online" ? "Online" : a.city),
        trainer: (t[TRAINING_KEYS.trainer] || "").trim(),
        approvedAt: ev?.decided_at ?? null,
        waveStart: r?.wave_start ?? (t[TRAINING_KEYS.startDate] || null),
        requestDate: r?.request_date ?? null,
        hiringDate: r?.hiring_date ?? null,
        status: r?.status ?? "RECLUTADO",
        agreedSchedule: r?.agreed_schedule || t[TRAINING_KEYS.schedule] || "",
        comments: r?.comments ?? "",
        documentList: docs,
        documents: (r?.documents as Record<string, boolean> | null) ?? {},
        referenceCall: r?.reference_call ?? "pending",
        referenceDetails: r?.reference_details ?? "",
        referencesOnFile: refs.length,
        referencesVerified: refs.filter((x) => x.verification_status === "Verified").length,
      };
    });
    rows.sort((x, y) => (x.waveStart ?? "9999").localeCompare(y.waveStart ?? "9999"));
    return { rows, canEditReferences: ctx.canEditReferences, canEditDocuments: ctx.canEditDocuments, canEditTraining: ctx.canEditTraining, trainingOnly: ctx.trainingOnly };
  });

export const updateTrainingRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        waveStart: z.string().max(20).nullable().optional(),
        requestDate: z.string().max(20).nullable().optional(),
        hiringDate: z.string().max(20).nullable().optional(),
        status: z.enum(TRAINING_STATUSES).optional(),
        agreedSchedule: z.string().max(300).optional(),
        comments: z.string().max(4000).optional(),
        documents: z.record(z.string().max(200), z.boolean()).optional(),
        referenceCall: z.enum(REFERENCE_CALL_VALUES).optional(),
        referenceDetails: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    const { data: app } = await ctx.db.from("applications").select("id, country_code, status").eq("id", data.applicationId).maybeSingle();
    if (!app || app.status !== "Approved for Training") throw new Error("Candidate not found in Training.");
    if (ctx.allowedCountries && !ctx.allowedCountries.includes(app.country_code ?? ""))
      throw new Error("This candidate is outside your countries.");
    const touchesRefs = data.referenceCall !== undefined || data.referenceDetails !== undefined;
    if (touchesRefs && !ctx.canEditReferences) throw new Error("Only Recruitment can record reference calls.");
    if (data.documents !== undefined && !ctx.canEditDocuments) throw new Error("Only Generalistas can verify documents.");
    const touchesTraining = [data.waveStart, data.requestDate, data.hiringDate, data.status, data.agreedSchedule, data.comments].some((v) => v !== undefined);
    if (touchesTraining && !ctx.canEditTraining) throw new Error("You can only verify documents.");
    if (data.documents) {
      const allowed = trainingDocsFor(app.country_code)?.items ?? [];
      if (Object.keys(data.documents).some((key) => !allowed.includes(key))) throw new Error("Unknown document for this candidate.");
    }
    const nd = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    const patch: Record<string, unknown> = {
      application_id: app.id,
      updated_by: context.userId,
      wave_start: nd(data.waveStart),
      request_date: nd(data.requestDate),
      hiring_date: nd(data.hiringDate),
      status: data.status,
      agreed_schedule: data.agreedSchedule,
      comments: data.comments,
      documents: data.documents,
      reference_call: data.referenceCall,
      reference_details: data.referenceDetails,
    };
    if (data.referenceCall !== undefined) {
      patch["reference_called_by"] = context.userId;
      patch["reference_called_at"] = new Date().toISOString();
    }
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    const { error } = await ctx.db.from("training_roster").upsert(patch as never, { onConflict: "application_id" });
    if (error) throw new Error(error.message);
    await writeAudit(ctx.db as never, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "training.updated",
      entityType: "application",
      entityId: app.id,
      applicationId: app.id,
      newValue: patch,
    });
    return { ok: true };
  });

const GROUP_COUNTRY: Record<string, string> = { "EL SALVADOR": "SV", NICARAGUA: "NI", GUATEMALA: "GT" };
const groupAllowed = (group: string, allowed: string[] | null) =>
  !allowed || group === "ONLINE" || allowed.includes(GROUP_COUNTRY[group] ?? "__none__");

export const listRequisitions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    const { data, error } = await ctx.db
      .from("training_requisitions")
      .select("*, applications:filled_application_id(full_name)")
      .order("wave_start", { ascending: true, nullsFirst: false })
      .order("created_at");
    if (error) throw new Error(error.message);
    const spots = (data ?? [])
      .filter((r) => groupAllowed(r.lob_group, ctx.allowedCountries))
      .map((r) => ({
        id: r.id,
        group: r.lob_group,
        branch: r.branch,
        waveStart: r.wave_start,
        requestDate: r.request_date,
        spotType: r.spot_type,
        agreedSchedule: r.agreed_schedule,
        comments: r.comments,
        filledApplicationId: r.filled_application_id,
        filledName: (r.applications as { full_name: string } | null)?.full_name ?? null,
        filledAt: r.filled_at,
      }));
    return { spots, canManage: ctx.canManageRequisitions };
  });

export const createRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        group: z.enum(["ONLINE", "EL SALVADOR", "NICARAGUA", "GUATEMALA"]),
        branch: z.string().max(200),
        waveStart: z.string().max(20).nullable(),
        requestDate: z.string().max(20).nullable(),
        spotType: z.enum(SPOT_TYPES),
        agreedSchedule: z.string().max(300),
        comments: z.string().max(4000),
        quantity: z.number().int().min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (!ctx.canManageRequisitions) throw new Error("You cannot add requisitions.");
    if (!groupAllowed(data.group, ctx.allowedCountries)) throw new Error("This LOB is outside your countries.");
    const row = {
      lob_group: data.group,
      branch: data.branch.trim(),
      wave_start: data.waveStart || null,
      request_date: data.requestDate || null,
      spot_type: data.spotType,
      agreed_schedule: data.agreedSchedule.trim(),
      comments: data.comments.trim(),
      created_by: context.userId,
    };
    const { error } = await ctx.db.from("training_requisitions").insert(Array.from({ length: data.quantity }, () => row));
    if (error) throw new Error(error.message);
    await writeAudit(ctx.db as never, { actorId: context.userId, actorEmail: ctx.email, action: "requisition.created", entityType: "training_requisition", entityId: null, newValue: { ...row, quantity: data.quantity } });
    return { ok: true };
  });

export const updateRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["fill", "release", "delete"]),
        applicationId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (!ctx.canManageRequisitions) throw new Error("You cannot change requisitions.");
    const { data: spot } = await ctx.db.from("training_requisitions").select("*").eq("id", data.id).maybeSingle();
    if (!spot || !groupAllowed(spot.lob_group, ctx.allowedCountries)) throw new Error("Requisition not found.");
    if (data.action === "delete") {
      if (spot.filled_application_id) throw new Error("Release the candidate before deleting this spot.");
      const { error } = await ctx.db.from("training_requisitions").delete().eq("id", spot.id);
      if (error) throw new Error(error.message);
    } else if (data.action === "release") {
      const { error } = await ctx.db.from("training_requisitions").update({ filled_application_id: null, filled_at: null, filled_by: null }).eq("id", spot.id);
      if (error) throw new Error(error.message);
    } else {
      if (!data.applicationId) throw new Error("Choose a candidate.");
      const { data: app } = await ctx.db.from("applications").select("id, country_code, status").eq("id", data.applicationId).maybeSingle();
      if (!app || app.status !== "Approved for Training") throw new Error("Candidate not found in Training.");
      if (ctx.allowedCountries && !ctx.allowedCountries.includes(app.country_code ?? "")) throw new Error("This candidate is outside your countries.");
      const { data: taken } = await ctx.db.from("training_requisitions").select("id").eq("filled_application_id", app.id).maybeSingle();
      if (taken) throw new Error("This candidate already fills another spot.");
      const now = new Date().toISOString();
      const { error } = await ctx.db.from("training_requisitions").update({ filled_application_id: app.id, filled_at: now, filled_by: context.userId }).eq("id", spot.id).is("filled_application_id", null);
      if (error) throw new Error(error.message);
      const { data: existing } = await ctx.db.from("training_roster").select("*").eq("application_id", app.id).maybeSingle();
      const roster: Record<string, unknown> = { application_id: app.id, updated_by: context.userId };
      if (!existing?.wave_start && spot.wave_start) roster["wave_start"] = spot.wave_start;
      if (!existing?.request_date && spot.request_date) roster["request_date"] = spot.request_date;
      if (!existing?.hiring_date) roster["hiring_date"] = now.slice(0, 10);
      if (!existing?.agreed_schedule && spot.agreed_schedule) roster["agreed_schedule"] = spot.agreed_schedule;
      await ctx.db.from("training_roster").upsert(roster as never, { onConflict: "application_id" });
    }
    await writeAudit(ctx.db as never, { actorId: context.userId, actorEmail: ctx.email, action: `requisition.${data.action}`, entityType: "training_requisition", entityId: spot.id, applicationId: data.applicationId ?? spot.filled_application_id ?? null, newValue: data });
    return { ok: true };
  });
