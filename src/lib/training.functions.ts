import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import { AGREEMENT_KEYS, TRAINING_KEYS, normalizeModality } from "./manager-scorecard";
import { creditedRecruiterId } from "./recruiter-quota";
import { staffTier } from "./roles";
import { trainingGroup as trainingGroupOf } from "./training";
import { certificationFromStatus, TRAINING_STATUSES, CERTIFICATION_VALUES, DAY1_VALUES, REFERENCE_CALL_VALUES, SPOT_TYPES, trainingPermissions, trainingDocList, compactDocuments, DOC_PAYMENT, EMPTY_PAYMENT, paymentComplete, readPayment } from "./training";

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
    allowedCountries: tier.isAdmin || tier.isManager ? null : (fullCountries ?? countries ?? []).map((c) => c.country_code),
    ...trainingPermissions((roles ?? []).map((r) => r.role as string)),
  };
}

export const listTrainingRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    let q = ctx.db
      .from("applications")
      .select("id, full_name, email, phone, country, country_code, city, status, assigned_manager_id, manager_evaluations(attempt_number, final_decision, decided_at, evidence), work_references(slot, company, position, supervisor_name, supervisor_position, supervisor_phone, supervisor_email, verification_status, verification_notes), interview_evaluations(id, attempt_number, evaluator_id, decided_by, final_result, decided_at, submitted_at, sections), training_roster(*), recruitment_progress(work_modality)")
      .eq("status", "Approved for Training")
      .is("archived_at", null);
    if (ctx.allowedCountries) q = q.in("country_code", ctx.allowedCountries.length ? ctx.allowedCountries : ["__none__"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const latestEval = (a: { interview_evaluations?: { id: string; attempt_number: number | null; evaluator_id: string | null; decided_by: string | null; final_result: string | null; decided_at?: string | null; submitted_at?: string | null; sections?: unknown }[] | null }) =>
      [...(a.interview_evaluations ?? [])].sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0] ?? null;
    const recruiterOf = (a: Parameters<typeof latestEval>[0]) => creditedRecruiterId(latestEval(a));
    const showContacts = ctx.canEditReferences || !ctx.trainingOnly;
    const evalIds = showContacts ? ((data ?? []).map((a) => latestEval(a)?.id).filter(Boolean) as string[]) : [];
    const { data: jobs } = evalIds.length
      ? await ctx.db.from("evaluation_jobs").select("id, evaluation_id, slot, company, position, supervisor_name, supervisor_contact, reference_comment" as "id, evaluation_id, slot, company, position, supervisor_name, supervisor_contact").in("evaluation_id", evalIds)
      : { data: [] as { id: string; evaluation_id: string; slot: number; company: string; position: string; supervisor_name: string; supervisor_contact: string }[] };
    const ids = [...new Set((data ?? []).map(recruiterOf).filter(Boolean))] as string[];
    const { data: staff } = ids.length ? await ctx.db.from("staff_profiles").select("user_id, full_name").in("user_id", ids) : { data: [] };
    const names = new Map((staff ?? []).map((p) => [p.user_id, p.full_name]));
    const rows = (data ?? []).map((a) => {
      const ev = [...(a.manager_evaluations ?? [])]
        .filter((e) => e.final_decision === "Approved for Training")
        .sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0];
      const t = (ev?.evidence as Record<string, string> | null) ?? {};
      const r0 = (Array.isArray(a.training_roster) ? a.training_roster[0] : a.training_roster) ?? null;
      const r = r0 as (NonNullable<typeof r0> & { certification?: string; certification_reason?: string; day1_followup?: string; day1_notes?: string }) | null;
      const recruiterId = recruiterOf(a);
      const rp = (Array.isArray(a.recruitment_progress) ? a.recruitment_progress[0] : a.recruitment_progress) as { work_modality: string | null } | null;
      const modality = normalizeModality(t[AGREEMENT_KEYS.modality]) ?? normalizeModality(rp?.work_modality);
      const docs = trainingDocList(a.country_code);
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
        // Work branch (where they will teach), never the training venue: roster > Recruitment's assigned branch > Manager's class branch.
        branch: modality === "online" ? (((r as { branch?: string | null } | null)?.branch || "").trim() || "Online") : (((r as { branch?: string | null } | null)?.branch || "").trim() || String(((latestEval(a)?.sections as Record<string, Record<string, unknown>> | null)?.["candidate"]?.["branch"]) ?? "").trim() || (t[AGREEMENT_KEYS.classSameBranch] !== "yes" ? (t[AGREEMENT_KEYS.classBranch] || "").trim() : "") || (t[TRAINING_KEYS.branch] || "").trim() || a.city),
        trainer: (t[TRAINING_KEYS.trainer] || "").trim(),
        approvedAt: ev?.decided_at ?? null,
        waveStart: r?.wave_start ?? (t[TRAINING_KEYS.startDate] || null),
        requestDate: r?.request_date ?? null,
        hiringDate: r?.hiring_date ?? null,
        status: r?.certification === "CERTIFIED" || r?.certification === "NOT CERTIFIED" ? r.certification : (r?.status ?? "RECLUTADO"),
        group: trainingGroupOf(modality, a.country_code),
        agreedSchedule: r?.agreed_schedule || t[TRAINING_KEYS.schedule] || String(((latestEval(a)?.sections as Record<string, Record<string, unknown>> | null)?.["candidate"]?.["schedule"]) ?? ""),
        recruitmentApprovedAt: (latestEval(a)?.decided_at ?? latestEval(a)?.submitted_at ?? null)?.slice(0, 10) ?? null,
        comments: r?.comments ?? "",
        incorporationConfirmed: r?.incorporation_confirmed ?? false,
        startedAt: r?.started_at ?? null,
        outcomeAt: r?.outcome_at ?? null,
        outcomeReason: r?.outcome_reason ?? "",
        canceledBeforeStart: r?.canceled_before_start ?? false,
        recruiter: recruiterId ? (names.get(recruiterId) ?? "Sin registrar") : "Sin registrar",
        certification: r?.certification ?? "PENDIENTE",
        certificationReason: r?.certification_reason ?? "",
        day1Followup: r?.day1_followup ?? "pending",
        day1Notes: r?.day1_notes ?? "",
        documentList: docs,
        documents: compactDocuments(r?.documents as Record<string, unknown> | null, docs),
        payment: (() => { const p = readPayment((r?.documents as Record<string, unknown> | null)?.["__payment"]); return ctx.canEditDocuments || ctx.canEditTraining ? p : { ...EMPTY_PAYMENT, method: p.method }; })(),
        referenceCall: r?.reference_call ?? "pending",
        referenceDetails: r?.reference_details ?? "",
        referencesOnFile: refs.length,
        referencesVerified: refs.filter((x) => x.verification_status === "Verified").length,
        applicantRefs: !ctx.canEditReferences ? [] : [
          ...[...refs].sort((x, y) => x.slot - y.slot).map((x) => ({ source: "app" as const, id: null as string | null, slot: x.slot, company: x.company ?? "", position: x.position ?? "", supervisor: x.supervisor_name ?? "", phone: x.supervisor_phone ?? "", email: x.supervisor_email ?? "", comment: x.verification_notes ?? "" })),
          ...((jobs ?? []) as { id?: string; evaluation_id: string; slot: number; company: string; position: string; supervisor_name: string; supervisor_contact: string; reference_comment?: string }[]).filter((j) => j.evaluation_id === latestEval(a)?.id).sort((x, y) => x.slot - y.slot).map((j) => ({ source: "rec" as const, id: j.id ?? null, slot: j.slot, company: j.company ?? "", position: j.position ?? "", supervisor: j.supervisor_name ?? "", phone: j.supervisor_contact ?? "", email: "", comment: j.reference_comment ?? "" })),
        ],
        latestEvaluationId: latestEval(a)?.id ?? null,
        referenceContacts: !showContacts ? [] : [
          ...[...refs].sort((x, y) => x.slot - y.slot).map((x) => ({ source: "Aplicante", company: x.company, position: x.position, supervisor: x.supervisor_name, contact: [x.supervisor_phone, x.supervisor_email].filter(Boolean).join(" · "), comment: x.verification_notes ?? "" })),
          ...(jobs ?? []).filter((j) => j.evaluation_id === latestEval(a)?.id).sort((x, y) => x.slot - y.slot).map((j) => ({ source: "Reclutador", company: j.company, position: j.position, supervisor: j.supervisor_name, contact: j.supervisor_contact, comment: (j as { reference_comment?: string }).reference_comment ?? "" })),
        ].filter((c) => c.company || c.supervisor || c.contact),
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
        branch: z.string().trim().min(1).max(200).optional(),
        agreedSchedule: z.string().max(300).optional(),
        comments: z.string().max(4000).optional(),
        incorporationConfirmed: z.boolean().optional(),
        startedAt: z.string().max(20).nullable().optional(),
        outcomeAt: z.string().max(20).nullable().optional(),
        outcomeReason: z.string().max(500).optional(),
        canceledBeforeStart: z.boolean().optional(),
        certification: z.enum(CERTIFICATION_VALUES).optional(),
        certificationReason: z.string().max(500).optional(),
        day1Followup: z.enum(DAY1_VALUES).optional(),
        day1Notes: z.string().max(2000).optional(),
        documents: z.record(z.string().max(200), z.boolean()).optional(),
        payment: z.object({ method: z.enum(["paypal", "bank", ""]), paypalEmail: z.string().trim().max(200), bankName: z.string().trim().max(120), bankAccount: z.string().trim().max(60) }).optional(),
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
    const touchesRefs = [data.referenceCall, data.referenceDetails, data.day1Followup, data.day1Notes].some((v) => v !== undefined);
    if (touchesRefs && !ctx.canEditReferences) throw new Error("Only Recruitment can record reference calls.");
    if (data.documents !== undefined && !ctx.canEditDocuments) throw new Error("Only Generalistas can verify documents.");
    const touchesTraining = [data.waveStart, data.requestDate, data.hiringDate, data.status, data.agreedSchedule, data.branch, data.comments, data.incorporationConfirmed, data.startedAt, data.outcomeAt, data.outcomeReason, data.canceledBeforeStart, data.certification, data.certificationReason].some((v) => v !== undefined);
    if (touchesTraining && !ctx.canEditTraining) throw new Error("You can only verify documents.");
    if (data.payment !== undefined && !ctx.canEditDocuments) throw new Error("Only Generalistas can verify documents.");
    let storedDocuments: Record<string, unknown> | undefined;
    if (data.documents || data.payment) {
      const allowed = trainingDocList(app.country_code);
      if (data.documents && Object.keys(data.documents).some((key) => !allowed.includes(key) || key === DOC_PAYMENT)) throw new Error("Unknown document for this candidate.");
      if (data.payment && !allowed.includes(DOC_PAYMENT)) throw new Error("Payment data does not apply to this candidate.");
      const { data: prev } = await ctx.db.from("training_roster").select("documents").eq("application_id", app.id).maybeSingle();
      const prevDocs = (prev?.documents ?? {}) as Record<string, unknown>;
      storedDocuments = { ...prevDocs, ...(data.documents ?? {}) };
      if (data.payment) storedDocuments["__payment"] = data.payment;
      if (allowed.includes(DOC_PAYMENT)) storedDocuments[DOC_PAYMENT] = paymentComplete(readPayment(storedDocuments["__payment"]));
    }
    const nd = (v: string | null | undefined) => (v === undefined ? undefined : v || null);
    const patch: Record<string, unknown> = {
      application_id: app.id,
      updated_by: context.userId,
      wave_start: nd(data.waveStart),
      request_date: nd(data.requestDate),
      hiring_date: nd(data.hiringDate),
      status: data.status,
      certification: data.status !== undefined ? certificationFromStatus(data.status) : undefined,
      agreed_schedule: data.agreedSchedule,
      branch: data.branch,
      comments: data.comments,
      incorporation_confirmed: data.incorporationConfirmed,
      started_at: nd(data.startedAt),
      outcome_at: nd(data.outcomeAt),
      outcome_reason: data.outcomeReason,
      canceled_before_start: data.canceledBeforeStart,
      documents: storedDocuments,
      reference_call: data.referenceCall,
      reference_details: data.referenceDetails,
      certification_reason: data.certificationReason,
      day1_followup: data.day1Followup,
      day1_notes: data.day1Notes,
    };
    if (data.referenceCall !== undefined) {
      patch["reference_called_by"] = context.userId;
      patch["reference_called_at"] = new Date().toISOString();
    }
    if (data.status === "CERTIFIED" && data.outcomeAt === undefined) {
      const { data: prevCert } = await ctx.db.from("training_roster").select("outcome_at").eq("application_id", app.id).maybeSingle();
      if (!prevCert?.outcome_at) patch["outcome_at"] = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
    }
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
    if (data.waveStart !== undefined) {
      const { data: prev } = await ctx.db.from("training_roster").select("wave_start").eq("application_id", app.id).maybeSingle();
      const next = data.waveStart || null;
      if (prev?.wave_start && prev.wave_start !== next)
        await ctx.db.from("training_cohort_changes").insert({ application_id: app.id, old_wave_start: prev.wave_start, new_wave_start: next, changed_by: context.userId });
    }
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

/** Compact read-only interview summary for an approved candidate. Full staff only (no Trainer/Generalista-only accounts). */
export const getTrainingProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (ctx.trainingOnly) throw new Error("Tu rol no tiene acceso al expediente de entrevista.");
    const { data: a, error } = await ctx.db
      .from("applications")
      .select("id, full_name, email, phone, country, country_code, city, status, recruitment_progress(work_modality, grammar_test_score), ai_evaluations(cefr), interview_evaluations(id, attempt_number, evaluator_id, decided_by, decided_at, final_result, live_cefr, hiring_bonus, comments, red_flags, retake_reason), manager_evaluations(attempt_number, final_decision, decided_by, manager_id, decided_at, decision_reason, internal_comments, improvement_areas, red_flags, evidence)")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("Candidato no encontrado.");
    if (ctx.allowedCountries && !ctx.allowedCountries.includes(a.country_code ?? "")) throw new Error("Este candidato está fuera de tus países.");
    const byAttempt = <T extends { attempt_number: number | null }>(l: T[] | null) => [...(l ?? [])].sort((x, y) => (x.attempt_number ?? 0) - (y.attempt_number ?? 0));
    const evals = byAttempt(a.interview_evaluations);
    const mgrs = byAttempt(a.manager_evaluations);
    const last = evals[evals.length - 1];
    const ids = [...new Set([...evals.flatMap((e) => [e.evaluator_id, e.decided_by]), ...mgrs.flatMap((m) => [m.decided_by, m.manager_id])].filter(Boolean))] as string[];
    const [{ data: staff }, { data: jobs }] = await Promise.all([
      ids.length ? ctx.db.from("staff_profiles").select("user_id, full_name").in("user_id", ids) : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
      last ? ctx.db.from("evaluation_jobs").select("slot, company, position, start_date, end_date, supervisor_name, supervisor_contact, reason_for_leaving").eq("evaluation_id", last.id).order("slot") : Promise.resolve({ data: [] }),
    ]);
    const name = (id: string | null) => (id ? (staff ?? []).find((s) => s.user_id === id)?.full_name || "—" : "—");
    const rp = (Array.isArray(a.recruitment_progress) ? a.recruitment_progress[0] : a.recruitment_progress) as { work_modality: string | null; grammar_test_score: number | null } | null;
    const ai = (Array.isArray(a.ai_evaluations) ? a.ai_evaluations[0] : a.ai_evaluations) as { cefr: string | null } | null;
    return {
      fullName: a.full_name, email: a.email, phone: a.phone, country: a.country, city: a.city,
      modality: rp?.work_modality ?? null, grammarScore: rp?.grammar_test_score ?? null, aiLevel: ai?.cefr ?? null,
      interviews: evals.map((e) => ({ attempt: e.attempt_number, openedBy: name(e.evaluator_id), decidedBy: name(e.decided_by ?? e.evaluator_id), decidedAt: e.decided_at, result: e.final_result, level: e.live_cefr, hiringBonus: e.hiring_bonus, comments: e.comments, redFlags: e.red_flags, retakeReason: e.retake_reason })),
      jobs: jobs ?? [],
      managers: mgrs.map((m) => {
        const ev = (m.evidence as Record<string, string> | null) ?? {};
        return { attempt: m.attempt_number, manager: name(m.decided_by ?? m.manager_id), decidedAt: m.decided_at, decision: m.final_decision, reason: m.decision_reason, comments: m.internal_comments, improvement: m.improvement_areas, redFlags: m.red_flags, lob: ev[AGREEMENT_KEYS.lob] ?? "", schedule: ev[TRAINING_KEYS.schedule] ?? "", startDate: ev[TRAINING_KEYS.startDate] ?? "" };
      }),
    };
  });

/** Recruitment can correct or add the candidate's work references from Training. */
export const saveTrainingReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      references: z.array(z.object({
        source: z.enum(["app", "rec"]),
        id: z.string().uuid().nullable(),
        slot: z.number().int().min(1).max(20),
        company: z.string().trim().max(200),
        position: z.string().trim().max(200),
        supervisor: z.string().trim().max(200),
        phone: z.string().trim().max(60),
        email: z.string().trim().max(200),
        comment: z.string().trim().max(2000).default(""),
      })).max(20),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (!ctx.canEditReferences) throw new Error("No tienes permiso para editar referencias.");
    const { data: app } = await ctx.db.from("applications").select("id, country_code, status").eq("id", data.applicationId).maybeSingle();
    if (!app || app.status !== "Approved for Training") throw new Error("Candidate not found in Training.");
    if (ctx.allowedCountries && !ctx.allowedCountries.includes(app.country_code ?? "")) throw new Error("You do not have access to this candidate.");
    const rows = data.references.filter((r) => r.company || r.supervisor || r.phone || r.email || r.comment);
    const appRows = rows.filter((r) => r.source === "app");
    if (appRows.length) {
      const { error } = await ctx.db.from("work_references").upsert(
        appRows.map((r) => ({ application_id: app.id, slot: Math.min(r.slot, 5), company: r.company, position: r.position, supervisor_name: r.supervisor, supervisor_phone: r.phone, supervisor_email: r.email, verification_notes: r.comment })),
        { onConflict: "application_id,slot" },
      );
      if (error) throw new Error(error.message);
    }
    const recRows = rows.filter((r) => r.source === "rec");
    if (recRows.length) {
      const { data: ev } = await ctx.db.from("interview_evaluations").select("id").eq("application_id", app.id).order("attempt_number", { ascending: false }).limit(1).maybeSingle();
      if (!ev) throw new Error("Este candidato no tiene entrevista donde guardar referencias.");
      for (const r of recRows) {
        const fields = { company: r.company, position: r.position, supervisor_name: r.supervisor, supervisor_contact: r.phone, reference_comment: r.comment } as Record<string, string>;
        const { error } = r.id
          ? await ctx.db.from("evaluation_jobs").update(fields as never).eq("id", r.id).eq("evaluation_id", ev.id)
          : await ctx.db.from("evaluation_jobs").insert({ evaluation_id: ev.id, slot: r.slot, ...fields } as never);
        if (error) throw new Error(error.message);
      }
    }
    await writeAudit(ctx.db, { actorId: context.userId, action: "training_references_updated", entityType: "application", entityId: app.id, details: { count: rows.length } } as never).catch(() => undefined);
    return { ok: true };
  });

/** Corrects name / email / Training start date and re-sends the welcome email with a regenerated agreement PDF. */
export const resendAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      applicationId: z.string().uuid(),
      fullName: z.string().trim().min(3).max(200),
      email: z.string().trim().toLowerCase().email().max(200),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      modality: z.enum(["online", "onsite"]),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (!ctx.canEditTraining) throw new Error("No tienes permiso para reenviar convenios.");
    const db = ctx.db as any;
    const { data: app } = await db.from("applications").select("id, full_name, email, country_code, status, manager_evaluations(id, attempt_number, final_decision, evidence)").eq("id", data.applicationId).maybeSingle();
    if (!app || app.status !== "Approved for Training") throw new Error("Candidate not found in Training.");
    if (ctx.allowedCountries && !ctx.allowedCountries.includes(app.country_code ?? "")) throw new Error("This candidate is outside your countries.");
    const ev = [...(app.manager_evaluations ?? [])].filter((e: any) => e.final_decision === "Approved for Training").sort((x: any, y: any) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0];
    if (!ev) throw new Error("No hay aprobación de Training para este candidato.");
    const evidence: Record<string, string> = { ...((ev.evidence ?? {}) as Record<string, string>), [TRAINING_KEYS.startDate]: data.startDate, [AGREEMENT_KEYS.modality]: data.modality };
    const t = (k: string) => (evidence[k] ?? "").trim();
    const { confirmedModality } = await import("./manager-scorecard");
    const confirmed = confirmedModality(evidence);
    const kind = data.modality;
    const isOnline = kind === "online";

    await db.from("applications").update({ full_name: data.fullName, email: data.email }).eq("id", app.id);
    await db.from("manager_evaluations").update({ evidence }).eq("id", ev.id);
    const { data: prevRoster } = await db.from("training_roster").select("wave_start").eq("application_id", app.id).maybeSingle();
    if (prevRoster?.wave_start && prevRoster.wave_start !== data.startDate)
      await db.from("training_cohort_changes").insert({ application_id: app.id, old_wave_start: prevRoster.wave_start, new_wave_start: data.startDate, changed_by: context.userId });
    await db.from("training_roster").upsert({ application_id: app.id, wave_start: data.startDate, updated_by: context.userId }, { onConflict: "application_id" });

    const { sendEmail } = await import("./notify.server");
    const { buildTrainingWelcomeEmail } = await import("./candidate-emails");
    const { emailRowStatus } = await import("./email-status");
    const { subject, html } = buildTrainingWelcomeEmail({
      fullName: data.fullName,
      countryCode: app.country_code,
      isOnline,
      startDate: data.startDate,
      schedule: isOnline ? (t(TRAINING_KEYS.schedule) || "Lunes a viernes: 5:00 PM–9:00 PM (UTC-6)") : t(TRAINING_KEYS.schedule),
      trainer: t(TRAINING_KEYS.trainer),
      trainerContact: t(TRAINING_KEYS.trainerContact),
      branch: t(TRAINING_KEYS.branch),
      zoom: t(TRAINING_KEYS.zoom),
    } as never);
    const ag = await import("./agreements/agreements.server");
    const sameBranch = t(AGREEMENT_KEYS.classSameBranch) === "yes";
    const prepared = await ag.prepareAgreement({
      applicationId: app.id,
      managerEvaluationId: ev.id,
      kind,
      expectedKind: confirmed,
      actorId: context.userId,
      data: {
        fullName: data.fullName,
        startDate: data.startDate,
        trainer: t(TRAINING_KEYS.trainer),
        ...(kind === "onsite"
          ? { trainingSchedule: t(TRAINING_KEYS.schedule), lob: t(AGREEMENT_KEYS.lob), trainingBranch: t(TRAINING_KEYS.branch), classBranch: sameBranch ? t(TRAINING_KEYS.branch) : t(AGREEMENT_KEYS.classBranch), classSchedule: t(AGREEMENT_KEYS.classSchedule) }
          : {}),
      },
    });
    let r: { ok: boolean; status: "sent" | "accepted" | "skipped" | "failed"; detail: string; httpStatus?: number | null };
    if (!prepared.ok) r = { ok: false, status: "failed", detail: `Pending agreement: ${prepared.reason}`, httpStatus: null };
    else {
      r = await sendEmail({ to: data.email, subject, html, candidateName: data.fullName, result: "training_welcome", attachment: { url: prepared.url, name: prepared.name } });
      await ag.markAgreementEmail(prepared.agreementId, r.status === "sent" ? "sent" : r.status === "accepted" ? "uncertain" : "failed", r.detail);
    }
    await db.from("candidate_emails").insert({
      application_id: app.id, manager_evaluation_id: ev.id, kind: "training_welcome", to_email: data.email,
      subject, body: html, status: emailRowStatus(r), error_message: r.ok ? null : r.detail,
      http_status: r.httpStatus ?? null, response_message: r.detail, sent_by: context.userId,
    });
    await writeAudit(ctx.db as never, {
      actorId: context.userId, actorEmail: ctx.email, action: "application.agreement_resent",
      entityType: "application", entityId: app.id, applicationId: app.id,
      oldValue: { full_name: app.full_name, email: app.email, start_date: prevRoster?.wave_start ?? null },
      newValue: { full_name: data.fullName, email: data.email, start_date: data.startDate, result: r.detail },
    });
    if (!r.ok) throw new Error(r.detail);
    return { ok: true, detail: r.detail };
  });

/** Candidates approved by Recruitment that still wait for the Manager's second filter (shown as a forecast in Training). */
export const listPendingSecondFilter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await ctxFor(context.userId, context.supabase);
    if (ctx.trainingOnly) return { rows: [] };
    let q = ctx.db
      .from("applications")
      .select("id, full_name, email, country, country_code, interview_evaluations(attempt_number, sections, is_test), recruitment_progress(work_modality)")
      .eq("status", "Pending Second Filter")
      .is("archived_at", null);
    if (ctx.allowedCountries) q = q.in("country_code", ctx.allowedCountries.length ? ctx.allowedCountries : ["__none__"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).flatMap((a) => {
      const ev = [...((a.interview_evaluations ?? []) as { attempt_number: number | null; sections: unknown; is_test: boolean | null }[])].sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0];
      if (ev?.is_test || /^TEST PHASE/i.test(a.full_name ?? "")) return [];
      const cand = ((ev?.sections as Record<string, Record<string, unknown>> | null)?.["candidate"]) ?? {};
      const schedule = String(cand["schedule"] ?? "");
      const rp = (Array.isArray(a.recruitment_progress) ? a.recruitment_progress[0] : a.recruitment_progress) as { work_modality: string | null } | null;
      const modality = /online/i.test(schedule) ? "online" : normalizeModality(rp?.work_modality) ?? (["SV", "NI", "GT"].includes(a.country_code ?? "") ? "onsite" : "online");
      return [{ id: a.id, fullName: a.full_name, email: a.email, country: a.country, schedule, branch: String(cand["branch"] ?? "") || (modality === "online" ? "Online" : ""), group: trainingGroupOf(modality, a.country_code) }];
    });
    return { rows };
  });
