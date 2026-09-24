import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "./audit.server";
import {
  COHORT_PENDING,
  MANAGER_DECISIONS,
  clampScores,
  scoreManager,
  type ManagerDecision,
} from "./manager-scorecard";
import { PENDING_SECOND_FILTER, staffTier } from "./roles";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Db = Awaited<ReturnType<typeof getAdmin>>;

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Server-side permissions for the Manager final filter. */
async function managerCtx(userId: string) {
  const db = await getAdmin();
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active, email, full_name").eq("user_id", userId).maybeSingle(),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const tier = staffTier((roles ?? []).map((r) => r.role as string));
  if (!tier.isStaff) throw new Error("You do not have staff access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  return {
    db,
    tier,
    isAdmin: tier.isAdmin,
    canDecide: tier.isAdmin || tier.isManager,
    email: profile?.email ?? null,
    fullName: profile?.full_name ?? "",
    allowedCountries: tier.isAdmin ? null : (countries ?? []).map((c) => c.country_code),
  };
}
type Ctx = Awaited<ReturnType<typeof managerCtx>>;

async function assertAccess(ctx: Ctx, applicationId: string) {
  const { data: app } = await ctx.db
    .from("applications")
    .select("id, full_name, email, country_code, status, assigned_manager_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) throw new Error("Candidate not found.");
  if (ctx.allowedCountries && !ctx.allowedCountries.includes(app.country_code ?? ""))
    throw new Error("This candidate is outside the countries assigned to your account.");
  return app;
}

async function managerNames(db: Db) {
  const { data: roles } = await db.from("user_roles").select("user_id, role").in("role", ["manager", "admin"]);
  const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
  if (!ids.length) return [] as { id: string; name: string; isManager: boolean }[];
  const { data: profiles } = await db
    .from("staff_profiles")
    .select("user_id, full_name, email, active")
    .in("user_id", ids);
  return (profiles ?? [])
    .filter((p) => p.active)
    .map((p) => ({
      id: p.user_id,
      name: p.full_name || p.email,
      isManager: (roles ?? []).some((r) => r.user_id === p.user_id && r.role === "manager"),
    }));
}

// ---------------------------------------------------------------- Queue

export const listSecondFilterQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await managerCtx(context.userId);
    let query = ctx.db
      .from("applications")
      .select(
        "id, full_name, country, country_code, city, status, assigned_manager_id, recruitment_approved_at, last_contact_at, recruitment_progress(work_modality), appointments(starts_at, status, created_at), interview_evaluations(attempt_number, final_result, decided_at, submitted_at), candidate_emails(created_at)",
      )
      .eq("status", PENDING_SECOND_FILTER)
      .is("archived_at", null)
      .is("withdrawn_at", null);
    if (ctx.allowedCountries) query = query.in("country_code", ctx.allowedCountries.length ? ctx.allowedCountries : ["__none__"]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const managers = await managerNames(ctx.db);
    const now = Date.now();
    const rows = (data ?? []).map((a) => {
      const evals = a.interview_evaluations ?? [];
      const approvedEval = evals
        .filter((e) => e.final_result === "Approved for last step")
        .sort((x, y) => (y.attempt_number ?? 0) - (x.attempt_number ?? 0))[0];
      const approvedAt = a.recruitment_approved_at ?? approvedEval?.decided_at ?? approvedEval?.submitted_at ?? null;
      const appt = [...(a.appointments ?? [])]
        .filter((x) => x.status !== "Rescheduled")
        .sort((x, y) => y.starts_at.localeCompare(x.starts_at))[0];
      const scheduled = Boolean(
        appt && approvedAt && appt.starts_at > approvedAt && appt.status !== "Canceled",
      );
      const lastEmail = [...(a.candidate_emails ?? [])].sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
      return {
        id: a.id,
        fullName: a.full_name,
        country: a.country,
        countryCode: a.country_code,
        branch: a.city,
        modality: one(a.recruitment_progress)?.work_modality ?? null,
        approvedAt,
        daysWaiting: approvedAt ? Math.max(0, Math.floor((now - new Date(approvedAt).getTime()) / 86400000)) : null,
        lastContactAt: a.last_contact_at ?? lastEmail?.created_at ?? null,
        managerId: a.assigned_manager_id,
        managerName: managers.find((m) => m.id === a.assigned_manager_id)?.name ?? null,
        appointmentAt: scheduled ? appt!.starts_at : null,
        appointmentStatus: scheduled ? appt!.status : "Not scheduled",
        isRetake: evals.length > 1,
      };
    });
    rows.sort((x, y) => (y.daysWaiting ?? 0) - (x.daysWaiting ?? 0));
    return { rows, managers, canAssign: ctx.isAdmin, canDecide: ctx.canDecide };
  });

export const assignManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ applicationId: z.string().uuid(), managerId: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    if (!ctx.isAdmin) throw new Error("Only Admin can assign or reassign a Manager.");
    const app = await assertAccess(ctx, data.applicationId);
    if (data.managerId) {
      const managers = await managerNames(ctx.db);
      if (!managers.some((m) => m.id === data.managerId)) throw new Error("Select an active Manager.");
    }
    await ctx.db.from("applications").update({ assigned_manager_id: data.managerId }).eq("id", app.id);
    await ctx.db
      .from("manager_evaluations")
      .update({ manager_id: data.managerId })
      .eq("application_id", app.id)
      .is("submitted_at", null);
    await writeAudit(ctx.db as never, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "manager.assigned",
      entityType: "application",
      entityId: app.id,
      applicationId: app.id,
      oldValue: { manager_id: app.assigned_manager_id },
      newValue: { manager_id: data.managerId },
    });
    return { ok: true };
  });

// ---------------------------------------------------------------- Review

export const getManagerReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    await assertAccess(ctx, data.applicationId);
    const db = ctx.db;
    const { data: app, error } = await db
      .from("applications")
      .select(
        "id, full_name, email, phone_e164, phone, country, country_code, city, status, source, teaching_experience, callcenter_experience_level, submitted_at, created_at, assigned_manager_id, recruitment_approved_at, withdrawn_at, withdrawn_reason, archived_at, ai_evaluations(cefr, overall_score), recruitment_progress(*), work_references(*), appointments(id, starts_at, status, meeting_link)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error || !app) throw new Error(error?.message ?? "Candidate not found.");

    const [{ data: interviews }, { data: managerEvals }, { data: emails }, { data: history }] = await Promise.all([
      db
        .from("interview_evaluations")
        .select("*, evaluation_jobs(*), evaluation_verbs(verb, correct, position)")
        .eq("application_id", app.id)
        .order("attempt_number", { ascending: false }),
      db.from("manager_evaluations").select("*").eq("application_id", app.id).order("attempt_number", { ascending: false }),
      db
        .from("candidate_emails")
        .select("id, kind, subject, status, http_status, response_message, error_message, to_email, created_at, manager_evaluation_id")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("audit_logs")
        .select("id, action, actor_email, actor_role, old_value, new_value, created_at")
        .eq("application_id", app.id)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    const progress = one(app.recruitment_progress);
    let resumeUrl: string | null = null;
    if (progress?.resume_path) {
      const { data: signed } = await db.storage.from("candidate-media").createSignedUrl(progress.resume_path, 600);
      resumeUrl = signed?.signedUrl ?? null;
    }
    const managers = await managerNames(db);
    const latest = managerEvals?.[0] ?? null;
    return {
      app: { ...app, recruitment_progress: undefined, work_references: undefined },
      progress,
      references: [...(app.work_references ?? [])].sort((a, b) => a.slot - b.slot),
      resumeUrl,
      interviews: interviews ?? [],
      managerEvaluations: managerEvals ?? [],
      current: latest,
      emails: emails ?? [],
      history: history ?? [],
      managers,
      access: {
        canDecide: ctx.canDecide,
        isAdmin: ctx.isAdmin,
        role: ctx.tier.primary,
        name: ctx.fullName || ctx.email,
      },
    };
  });

/** Opens (or continues) the Manager evaluation for the latest attempt. Never duplicates the candidate. */
export const startManagerEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    if (!ctx.canDecide) throw new Error("Only a Manager or Admin can run the final filter.");
    const app = await assertAccess(ctx, data.applicationId);
    const { data: latest } = await ctx.db
      .from("manager_evaluations")
      .select("id, submitted_at, status, attempt_number")
      .eq("application_id", app.id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && (!latest.submitted_at || latest.status === "Reopened")) return { id: latest.id };
    if (latest && app.status !== PENDING_SECOND_FILTER)
      throw new Error("This candidate already has a final Manager decision.");
    const { data: created, error } = await ctx.db
      .from("manager_evaluations")
      .insert({
        application_id: app.id,
        attempt_number: (latest?.attempt_number ?? 0) + 1,
        manager_id: app.assigned_manager_id ?? context.userId,
        evaluator_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeAudit(ctx.db as never, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "manager_evaluation.started",
      entityType: "manager_evaluation",
      entityId: created.id,
      applicationId: app.id,
      newValue: { attempt: (latest?.attempt_number ?? 0) + 1 },
    });
    return { id: created.id };
  });

const savePayload = z.object({
  evaluationId: z.string().uuid(),
  demoTopic: z.string().max(200).nullable().default(null),
  scores: z.record(z.string(), z.unknown()).default({}),
  evidence: z.record(z.string(), z.string().max(2000)).default({}),
  checks: z.record(z.string(), z.boolean()).default({}),
  criticalRedFlag: z.boolean().default(false),
  redFlags: z.string().max(4000).nullable().default(null),
  internalComments: z.string().max(4000).nullable().default(null),
  improvementAreas: z.array(z.enum(["English level", "Grammar", "Pronunciation", "Technical Requirements"])).max(4).default([]),
  improvementNote: z.string().max(1000).nullable().default(null),
  decisionReason: z.string().max(1000).nullable().default(null),
  eligibleAgainDate: z.string().max(20).nullable().default(null),
  appointmentAt: z.string().max(40).nullable().default(null),
  finalDecision: z.enum(MANAGER_DECISIONS).nullable().default(null),
  submit: z.boolean().default(false),
});

/** Candidate-safe feedback for a Manager Retake: only the approved areas plus a short note. */
function retakeFeedback(areas: string[], note: string | null) {
  const list = areas.length ? `Areas to improve: ${areas.join(", ")}.` : "";
  return [list, (note ?? "").trim()].filter(Boolean).join(" ");
}

export const saveManagerEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => savePayload.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    if (!ctx.canDecide) throw new Error("Only a Manager or Admin can edit the final filter.");
    const { data: current } = await ctx.db
      .from("manager_evaluations")
      .select("*")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!current) throw new Error("Evaluation not found.");
    const app = await assertAccess(ctx, current.application_id);
    if (current.submitted_at && current.status !== "Reopened")
      throw new Error("This evaluation was submitted and is locked. Only Admin can reopen it.");

    const scores = clampScores(data.scores);
    const result = scoreManager(scores, data.criticalRedFlag);
    const decision = data.finalDecision as ManagerDecision | null;

    if (data.submit) {
      const missing: string[] = [];
      if (!decision) missing.push("Final decision");
      if (decision && decision !== "No Show" && decision !== "Not Approved" && !result.complete)
        missing.push("All scorecard criteria");
      // Gates only drive the recommendation. The Manager keeps the final manual
      // decision; overriding a failed gate just requires a written reason (audited).
      if (decision === "Approved for Training" && !result.gatesPassed && !data.decisionReason?.trim())
        missing.push("Reason for approving although a gate was not met");
      if (decision === "Retake") {
        if (!data.improvementAreas.length) missing.push("At least one area to improve");
        if (!data.eligibleAgainDate) missing.push("Eligible date to apply again");
      }
      if (decision === "Not Approved" && !data.decisionReason?.trim()) missing.push("Internal reason");
      if (decision === "No Show" && !data.appointmentAt) missing.push("Appointment date");
      if (missing.length) return { ok: false as const, missing };
    }

    const nowIso = new Date().toISOString();
    const patch = {
      demo_topic: data.demoTopic,
      scores: scores as never,
      evidence: data.evidence as never,
      checks: data.checks as never,
      critical_red_flag: data.criticalRedFlag,
      red_flags: data.redFlags,
      internal_comments: data.internalComments,
      improvement_areas: data.improvementAreas.length
        ? retakeFeedback(data.improvementAreas, data.improvementNote)
        : data.improvementNote,
      total_score: result.total,
      gates: result.gates as never,
      recommendation: result.recommendation,
      final_decision: decision,
      decision_reason: data.decisionReason,
      eligible_again_date: data.eligibleAgainDate || null,
      appointment_at: data.appointmentAt ? new Date(data.appointmentAt).toISOString() : null,
      evaluator_id: context.userId,
      ...(data.submit
        ? {
            status: "Submitted",
            submitted_at: nowIso,
            decided_by: context.userId,
            decided_at: nowIso,
            decision_stage: "manager_final_filter",
            no_show_marked_at: decision === "No Show" ? nowIso : null,
          }
        : {}),
    };
    const { error } = await ctx.db.from("manager_evaluations").update(patch).eq("id", current.id);
    if (error) throw new Error(error.message);

    const audit = (action: string, oldValue: unknown, newValue: unknown) =>
      writeAudit(ctx.db as never, {
        actorId: context.userId,
        actorEmail: ctx.email,
        action,
        entityType: "manager_evaluation",
        entityId: current.id,
        applicationId: app.id,
        oldValue,
        newValue,
      });
    if ((current.total_score ?? null) !== result.total)
      await audit("manager_evaluation.score_changed", { total: current.total_score }, { total: result.total });
    if ((current.recommendation ?? null) !== result.recommendation)
      await audit(
        "manager_evaluation.recommendation_changed",
        { recommendation: current.recommendation },
        { recommendation: result.recommendation },
      );

    let email: { ok: boolean; status: string; detail: string } | null = null;
    if (data.submit && decision) {
      await audit(
        decision === "No Show" ? "manager_evaluation.no_show" : "manager_evaluation.final_decision",
        { final_decision: current.final_decision, status: current.status },
        { final_decision: decision, decision_stage: "manager_final_filter", total: result.total },
      );
      email = await applyDecision(ctx, context.userId, {
        applicationId: app.id,
        applicantName: app.full_name,
        applicantEmail: app.email,
        previousStatus: app.status,
        evaluationId: current.id,
        decision,
        retakeFeedbackText: retakeFeedback(data.improvementAreas, data.improvementNote),
        eligibleAgainDate: data.eligibleAgainDate || null,
      });
    }
    return { ok: true as const, missing: [] as string[], total: result.total, recommendation: result.recommendation, email };
  });

const DECISION_STATUS: Record<ManagerDecision, string> = {
  "Approved for Training": COHORT_PENDING,
  // Distinct from the first-interview "Retake – …" labels so the public Retake
  // flow never sends this candidate back to the first interview.
  Retake: "Manager Retake – Email Sent",
  "Not Approved": "Not Approved – Manager Final Filter",
  "No Show": "No Show – Manager Final Filter",
};

async function setStatus(ctx: Ctx, actorId: string, applicationId: string, from: string, to: string) {
  if (from === to) return;
  await ctx.db.from("applications").update({ status: to }).eq("id", applicationId);
  await writeAudit(ctx.db as never, {
    actorId,
    actorEmail: ctx.email,
    action: "application.status_changed",
    entityType: "application",
    entityId: applicationId,
    applicationId,
    oldValue: { status: from },
    newValue: { status: to },
  });
}

async function applyDecision(
  ctx: Ctx,
  actorId: string,
  d: {
    applicationId: string;
    applicantName: string;
    applicantEmail: string;
    previousStatus: string;
    evaluationId: string;
    decision: ManagerDecision;
    retakeFeedbackText: string;
    eligibleAgainDate: string | null;
    force?: boolean;
  },
) {
  const db = ctx.db;
  await setStatus(ctx, actorId, d.applicationId, d.previousStatus, DECISION_STATUS[d.decision]);

  if (d.decision === "Approved for Training") {
    // The full Training welcome email needs cohort, schedule, trainer and venue (Phase 3).
    const { data: existing } = await db
      .from("candidate_emails")
      .select("id")
      .eq("manager_evaluation_id", d.evaluationId)
      .eq("kind", "training_welcome")
      .limit(1)
      .maybeSingle();
    if (!existing)
      await db.from("candidate_emails").insert({
        application_id: d.applicationId,
        manager_evaluation_id: d.evaluationId,
        kind: "training_welcome",
        to_email: d.applicantEmail,
        subject: "Welcome to E4CC Training",
        body: "",
        status: "Pending Cohort Assignment",
        sent_by: actorId,
      });
    return { ok: true, status: "pending_cohort", detail: "Welcome email waits for cohort assignment." };
  }

  let result: { ok: boolean; status: string; detail: string };
  if (d.decision === "Not Approved") {
    const kind = "not_approved";
    if (!d.force) {
      const { data: already } = await db
        .from("candidate_emails")
        .select("id")
        .eq("manager_evaluation_id", d.evaluationId)
        .eq("kind", kind)
        .eq("status", "sent")
        .limit(1)
        .maybeSingle();
      if (already) return { ok: true, status: "duplicate", detail: "The result email was already sent." };
    }
    const { sendFollowUp } = await import("./candidate-admin.functions");
    try {
      result = await sendFollowUp(db, {
        applicationId: d.applicationId,
        kind,
        // Never pass internal reasons, red flags, scores or comments.
        areas: "",
        reasons: [],
        actorId,
        eligibleAgainDate: null,
        managerEvaluationId: d.evaluationId,
        skipStatusUpdate: true,
        force: true,
      });
    } catch (e) {
      result = { ok: false, status: "failed", detail: e instanceof Error ? e.message : "Send failed" };
    }
  } else {
    // Retake and No Show both return the candidate to the Manager final filter
    // through a secure token link, never to the first Recruitment interview.
    result = await sendTokenEmail(ctx, actorId, {
      ...d,
      kind: d.decision === "Retake" ? "manager_retake" : "no_show",
    });
  }
  if (result.ok) await db.from("applications").update({ last_contact_at: new Date().toISOString() }).eq("id", d.applicationId);
  await writeAudit(db as never, {
    actorId,
    actorEmail: ctx.email,
    action: result.ok ? "manager_email.sent" : "manager_email.failed",
    entityType: "manager_evaluation",
    entityId: d.evaluationId,
    applicationId: d.applicationId,
    newValue: { decision: d.decision, status: result.status, detail: result.detail },
  });
  return result;
}

async function sendTokenEmail(
  ctx: Ctx,
  actorId: string,
  d: {
    applicationId: string;
    applicantName: string;
    applicantEmail: string;
    evaluationId: string;
    kind: "no_show" | "manager_retake";
    retakeFeedbackText: string;
    eligibleAgainDate: string | null;
  },
) {
  const { randomToken, sha256Hex } = await import("./scheduling.server");
  const { baseUrl, sendEmail } = await import("./notify.server");
  const { buildNoShowEmail, buildManagerRetakeEmail } = await import("./candidate-emails");
  const token = await randomToken();
  const isRetake = d.kind === "manager_retake";
  const eligibleMs = d.eligibleAgainDate ? new Date(`${d.eligibleAgainDate}T00:00:00Z`).getTime() : Date.now();
  await ctx.db.from("candidate_action_tokens").insert({
    application_id: d.applicationId,
    token_hash: await sha256Hex(token),
    purpose: isRetake ? "manager_retake" : "no_show_response",
    expires_at: new Date((isRetake ? Math.max(eligibleMs, Date.now()) + 60 * 86400000 : Date.now() + 14 * 86400000)).toISOString(),
  });
  const responseUrl = `${baseUrl()}/respond/${token}`;
  const { subject, html } = isRetake
    ? buildManagerRetakeEmail({
        fullName: d.applicantName,
        areas: d.retakeFeedbackText,
        eligibleAgainDate: d.eligibleAgainDate,
        responseUrl,
      })
    : buildNoShowEmail({ fullName: d.applicantName, responseUrl });
  const result = await sendEmail({
    to: d.applicantEmail,
    subject,
    html,
    candidateName: d.applicantName,
    result: isRetake ? "retake" : "no_show",
  });
  await ctx.db.from("candidate_emails").insert({
    application_id: d.applicationId,
    manager_evaluation_id: d.evaluationId,
    kind: isRetake ? "retake" : "no_show",
    to_email: d.applicantEmail,
    subject,
    body: html,
    status: result.status === "sent" ? "sent" : "failed",
    error_message: result.ok ? null : result.detail,
    http_status: result.httpStatus ?? null,
    response_message: result.detail,
    sent_by: actorId,
  });
  return result;
}

export const retryManagerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ evaluationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    if (!ctx.canDecide) throw new Error("Only a Manager or Admin can resend this email.");
    const { data: ev } = await ctx.db
      .from("manager_evaluations")
      .select("id, application_id, final_decision, improvement_areas, eligible_again_date, submitted_at")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!ev?.submitted_at || !ev.final_decision) throw new Error("Submit the decision first.");
    const app = await assertAccess(ctx, ev.application_id);
    return applyDecision(ctx, context.userId, {
      applicationId: app.id,
      applicantName: app.full_name,
      applicantEmail: app.email,
      previousStatus: app.status,
      evaluationId: ev.id,
      decision: ev.final_decision as ManagerDecision,
      retakeFeedbackText: ev.improvement_areas ?? "",
      eligibleAgainDate: ev.eligible_again_date,
      force: true,
    });
  });

export const reopenManagerEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ evaluationId: z.string().uuid(), reason: z.string().max(500).default("") }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await managerCtx(context.userId);
    if (!ctx.isAdmin) throw new Error("Only Admin can reopen a Manager evaluation.");
    const { data: ev } = await ctx.db
      .from("manager_evaluations")
      .select("id, application_id, status, final_decision")
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!ev) throw new Error("Evaluation not found.");
    await ctx.db
      .from("manager_evaluations")
      .update({ status: "Reopened", reopened_at: new Date().toISOString() })
      .eq("id", ev.id);
    await writeAudit(ctx.db as never, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "manager_evaluation.reopened",
      entityType: "manager_evaluation",
      entityId: ev.id,
      applicationId: ev.application_id,
      oldValue: { status: ev.status, final_decision: ev.final_decision },
      newValue: { status: "Reopened", reason: data.reason },
    });
    return { ok: true };
  });

// ---------------------------------------------------------------- Applicant response (public, token-based)

async function resolveActionToken(token: string) {
  const db = await getAdmin();
  const { sha256Hex } = await import("./scheduling.server");
  const { data: row } = await db
    .from("candidate_action_tokens")
    .select("id, application_id, expires_at, used_at, purpose")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!row || row.purpose !== "no_show_response" || row.used_at || new Date(row.expires_at).getTime() < Date.now())
    return { db, row: null };
  return { db, row };
}

export const getCandidateResponse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { db, row } = await resolveActionToken(data.token);
    if (!row) return { valid: false as const };
    const { data: app } = await db
      .from("applications")
      .select("full_name, withdrawn_at")
      .eq("id", row.application_id)
      .maybeSingle();
    if (!app || app.withdrawn_at) return { valid: false as const };
    // Only the first name is shared; nothing internal leaves the server.
    return { valid: true as const, firstName: app.full_name.trim().split(/\s+/)[0] ?? "" };
  });

export const submitCandidateResponse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().min(20).max(100),
        action: z.enum(["reschedule", "withdraw"]),
        reason: z.string().trim().max(500).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db, row } = await resolveActionToken(data.token);
    if (!row) return { ok: false as const, error: "This link is no longer available." };
    const { data: app } = await db
      .from("applications")
      .select("id, full_name, email, status")
      .eq("id", row.application_id)
      .maybeSingle();
    if (!app) return { ok: false as const, error: "This link is no longer available." };
    const now = new Date().toISOString();
    if (data.action === "withdraw") {
      await db
        .from("applications")
        .update({
          withdrawn_at: now,
          withdrawn_stage: "manager_final_filter",
          withdrawn_reason: data.reason || null,
          status: "Withdrawn by Applicant",
        })
        .eq("id", app.id);
      await db.from("candidate_action_tokens").update({ used_at: now }).eq("id", row.id);
      await writeAudit(db as never, {
        actorId: null,
        actorEmail: "applicant",
        action: "application.withdrawn_by_applicant",
        entityType: "application",
        entityId: app.id,
        applicationId: app.id,
        oldValue: { status: app.status },
        newValue: { status: "Withdrawn by Applicant", stage: "manager_final_filter", reason: data.reason || null },
      });
      return { ok: true as const, action: "withdraw" as const };
    }
    // Reschedule: back to the Manager queue and reuse the existing Calendly event.
    await db.from("applications").update({ status: PENDING_SECOND_FILTER, last_contact_at: now }).eq("id", app.id);
    await writeAudit(db as never, {
      actorId: null,
      actorEmail: "applicant",
      action: "application.reschedule_requested",
      entityType: "application",
      entityId: app.id,
      applicationId: app.id,
      oldValue: { status: app.status },
      newValue: { status: PENDING_SECOND_FILTER, reason: data.reason || null },
    });
    const { CALENDLY_SCHEDULE_URL } = await import("./candidate-emails");
    const url = new URL(CALENDLY_SCHEDULE_URL);
    url.searchParams.set("name", app.full_name);
    url.searchParams.set("email", app.email);
    return { ok: true as const, action: "reschedule" as const, calendlyUrl: url.toString() };
  });
