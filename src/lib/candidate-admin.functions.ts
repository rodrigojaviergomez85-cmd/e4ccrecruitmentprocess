import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildFollowUpEmail, type FollowUpKind } from "./candidate-emails";
import { staffTier } from "./roles";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof getAdmin>>;

/** Server-side permission resolution for candidate management actions. */
async function staffCtx(userId: string) {
  const db = await getAdmin();
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_profiles").select("active, email, full_name").eq("user_id", userId).maybeSingle(),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const tier = staffTier(roleNames);
  if (!tier.isStaff) throw new Error("You do not have staff access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  const isAdmin = tier.isAdmin;
  return {
    db,
    isAdmin,
    canManage: isAdmin || tier.isRecruitment || tier.isManager,
    email: profile?.email ?? null,
    allowedCountries: isAdmin ? null : (countries ?? []).map((c) => c.country_code),
  };
}

async function assertCandidateAccess(
  db: Db,
  allowedCountries: string[] | null,
  applicationId: string,
) {
  const { data: app } = await db
    .from("applications")
    .select("id, full_name, email, country_code, archived_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) throw new Error("Candidate not found.");
  if (allowedCountries && !allowedCountries.includes(app.country_code ?? "")) {
    throw new Error("This candidate is outside the countries assigned to your account.");
  }
  return app;
}

async function log(
  db: Db,
  entry: {
    actorId: string;
    actorEmail?: string | null;
    action: string;
    entityId: string;
    details?: Record<string, unknown>;
  },
) {
  await db.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    entity_type: "application",
    entity_id: entry.entityId,
    details: (entry.details ?? {}) as never,
  });
}

export const archiveCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        reason: z.string().max(500).optional().default(""),
        restore: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    if (!ctx.canManage) throw new Error("You do not have permission to archive candidates.");
    await assertCandidateAccess(ctx.db, ctx.allowedCountries, data.applicationId);

    const patch = data.restore
      ? { archived_at: null, archived_by: null, archive_reason: null }
      : {
          archived_at: new Date().toISOString(),
          archived_by: context.userId,
          archive_reason: data.reason || null,
        };
    const { error } = await ctx.db.from("applications").update(patch).eq("id", data.applicationId);
    if (error) throw new Error(error.message);

    await log(ctx.db, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: data.restore ? "application.restored" : "application.archived",
      entityId: data.applicationId,
      details: { reason: data.reason },
    });
    return { ok: true, archived: !data.restore };
  });

const manualSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Enter a valid international phone number, e.g. +50370000000"),
  countryCode: z.string().trim().min(2).max(3),
  cityId: z.string().uuid().nullable().optional().default(null),
  cityOther: z.string().trim().max(120).optional().default(""),
  modality: z.enum(["online", "onsite"]),
  teachingExperience: z.string().max(60).optional().default("Not specified"),
  force: z.boolean().optional().default(false),
});

export const createManualCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => manualSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    if (!ctx.canManage) throw new Error("You do not have permission to add candidates.");
    if (ctx.allowedCountries && !ctx.allowedCountries.includes(data.countryCode)) {
      throw new Error("This country is outside the countries assigned to your account.");
    }

    const { data: country } = await ctx.db
      .from("countries")
      .select("code, name")
      .eq("code", data.countryCode)
      .maybeSingle();
    if (!country) throw new Error("Select a valid country.");

    let cityName = data.cityOther.trim();
    if (data.cityId) {
      const { data: city } = await ctx.db
        .from("cities")
        .select("id, name")
        .eq("id", data.cityId)
        .maybeSingle();
      if (!city) throw new Error("Select a valid city.");
      cityName = city.name;
    }
    if (!cityName) throw new Error("Enter the candidate's city.");

    // Warn about an existing record before creating a second one.
    const { data: duplicates } = await ctx.db
      .from("applications")
      .select("id, full_name, email, phone_e164, created_at")
      .or(`email.eq.${data.email.toLowerCase()},phone_e164.eq.${data.phone}`)
      .limit(5);
    if (!data.force && duplicates?.length) {
      return {
        ok: false as const,
        duplicates: duplicates.map((d) => ({
          id: d.id,
          fullName: d.full_name,
          email: d.email,
          createdAt: d.created_at,
        })),
      };
    }

    const now = new Date().toISOString();
    const { data: created, error } = await ctx.db
      .from("applications")
      .insert({
        full_name: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        phone_e164: data.phone,
        country: country.name,
        country_code: country.code,
        city: cityName,
        city_id: data.cityId ?? null,
        city_other: data.cityId ? null : cityName,
        teaching_experience: data.teachingExperience || "Not specified",
        taught_children: false,
        callcenter_experience: false,
        callcenter_experience_level: "Not specified",
        contact_consent: true,
        consent_at: now,
        status: "Reviewing",
        submitted_at: now,
        source: "manual",
        created_by: context.userId,
        eligibility_override: true,
        eligibility_note: "Added manually by the recruitment team.",
        eligibility_override_by: context.userId,
        eligibility_override_at: now,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await ctx.db
      .from("recruitment_progress")
      .upsert({ application_id: created.id, work_modality: data.modality }, {
        onConflict: "application_id",
      });

    await log(ctx.db, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "application.created_manually",
      entityId: created.id,
      details: { modality: data.modality, country: country.code },
    });

    return { ok: true as const, id: created.id, duplicates: [] };
  });

/** Starts a new interview attempt. Previous attempts stay untouched and read-only. */
export const createRetakeInterview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        note: z.string().max(500).optional().default(""),
        interviewDate: z.string().max(20).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    if (!ctx.canManage) throw new Error("You do not have permission to create retakes.");
    await assertCandidateAccess(ctx.db, ctx.allowedCountries, data.applicationId);

    const { data: previous } = await ctx.db
      .from("interview_evaluations")
      .select("*")
      .eq("application_id", data.applicationId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const attempt = (previous?.attempt_number ?? 0) + 1;

    // A retake keeps the candidate background and restarts at the Grammar Test.
    const carried = (previous?.sections as Record<string, Record<string, unknown>>) ?? {};
    const sections: Record<string, Record<string, unknown>> = {};
    for (const key of ["candidate", "equipment", "profile", "studies", "values"]) {
      if (carried[key]) sections[key] = carried[key];
    }

    const { data: created, error } = await ctx.db
      .from("interview_evaluations")
      .insert({
        application_id: data.applicationId,
        evaluator_id: context.userId,
        last_edited_by: context.userId,
        status: "In progress",
        attempt_number: attempt,
        start_section: "english",
        sections: sections as never,
        interview_date: data.interviewDate || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (previous) {
      const { data: jobs } = await ctx.db
        .from("evaluation_jobs")
        .select("*")
        .eq("evaluation_id", previous.id)
        .order("slot");
      if (jobs?.length) {
        await ctx.db.from("evaluation_jobs").insert(
          jobs.map(({ id: _id, created_at: _c, evaluation_id: _e, ...rest }) => ({
            ...rest,
            evaluation_id: created.id,
          })),
        );
      }
    }

    await ctx.db
      .from("applications")
      .update({ status: "Reviewing" })
      .eq("id", data.applicationId);

    await ctx.db.from("evaluation_audit").insert({
      evaluation_id: created.id,
      actor_id: context.userId,
      actor_email: ctx.email,
      action: "retake_created",
      details: { attempt, note: data.note } as never,
    });
    await log(ctx.db, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "application.retake_created",
      entityId: data.applicationId,
      details: { attempt, evaluationId: created.id },
    });

    return { ok: true, evaluationId: created.id, attempt };
  });

export const listCandidateEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    await assertCandidateAccess(ctx.db, ctx.allowedCountries, data.applicationId);
    const { data: rows } = await ctx.db
      .from("candidate_emails")
      .select("id, kind, subject, status, error_message, manager_evaluation_id, http_status, response_message, to_email, created_at")
      .eq("application_id", data.applicationId)
      .order("created_at", { ascending: false })
      .limit(20);
    return rows ?? [];
  });

/** Sends (and records) the follow-up email for a Retake or Not approved result. */
/** Internal pipeline status stored on the application after a result email. */
export function statusForResult(kind: FollowUpKind, eligibleAgainDate?: string | null) {
  if (kind === "retake") return "Retake – Email Sent";
  if (kind === "approved") return "Pending Second Filter";
  return kind === "not_approved" && eligibleAgainDate
    ? `Not Approved – Eligible Again: ${eligibleAgainDate}`
    : "Not Approved";
}

export async function sendFollowUp(
  db: Db,
  input: {
    applicationId: string;
    evaluationId?: string | null;
    kind: FollowUpKind;
    areas: string;
    reasons?: string[];
    actorId?: string | null;
    eligibleAgainDate?: string | null;
    force?: boolean;
    managerEvaluationId?: string | null;
    skipStatusUpdate?: boolean;
  },
) {
  const { data: app } = await db
    .from("applications")
    .select("id, full_name, email")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!app) throw new Error("Candidate not found.");

  // One result email per evaluation, unless the evaluator explicitly retries.
  if (!input.force && input.evaluationId) {
    const { data: already } = await db
      .from("candidate_emails")
      .select("id")
      .eq("evaluation_id", input.evaluationId)
      .eq("kind", input.kind)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) {
      return {
        ok: true,
        status: "duplicate" as const,
        detail: "The result email was already sent for this interview.",
      };
    }
  }

  const { subject, html } = buildFollowUpEmail({
    kind: input.kind,
    fullName: app.full_name,
    areas: input.areas,
    reasons: input.reasons ?? [],
    eligibleAgainDate: input.eligibleAgainDate ?? null,
  });


  const { sendEmail } = await import("./notify.server");
  const result = await sendEmail({
    to: app.email,
    subject,
    html,
    candidateName: app.full_name,
    result: input.kind,
  });

  await db.from("candidate_emails").insert({
    application_id: app.id,
    evaluation_id: input.evaluationId ?? null,
    kind: input.kind,
    to_email: app.email,
    subject,
    body: html,
    status: result.status === "sent" ? "sent" : result.status === "skipped" ? "skipped" : "failed",
    error_message: result.ok ? null : result.detail,
    http_status: result.httpStatus ?? null,
    manager_evaluation_id: input.managerEvaluationId ?? null,
    response_message: result.detail,
    sent_by: input.actorId ?? null,
  });

  if (result.ok && !input.skipStatusUpdate) {
    await db
      .from("applications")
      .update({ status: statusForResult(input.kind, input.eligibleAgainDate) })
      .eq("id", app.id);
  }

  return { ok: result.ok, status: result.status, detail: result.detail };
}

export const sendFollowUpEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        evaluationId: z.string().uuid().nullable().optional().default(null),
        kind: z.enum(["retake", "not_approved", "approved"]),
        areas: z.string().max(2000).optional().default(""),
        reasons: z.array(z.string().max(120)).optional().default([]),
        eligibleAgainDate: z.string().max(40).nullable().optional().default(null),
        force: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    if (!ctx.canManage) throw new Error("You do not have permission to email candidates.");
    await assertCandidateAccess(ctx.db, ctx.allowedCountries, data.applicationId);
    return sendFollowUp(ctx.db, {
      applicationId: data.applicationId,
      evaluationId: data.evaluationId ?? null,
      kind: data.kind as FollowUpKind,
      areas: data.areas,
      reasons: data.reasons,
      actorId: context.userId,
      eligibleAgainDate: data.eligibleAgainDate,
      force: data.force,
    });
  });

export const listInterviewAttempts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await staffCtx(context.userId);
    await assertCandidateAccess(ctx.db, ctx.allowedCountries, data.applicationId);
    const { data: rows } = await ctx.db
      .from("interview_evaluations")
      .select("id, attempt_number, status, final_result, interview_date, submitted_at, created_at")
      .eq("application_id", data.applicationId)
      .order("attempt_number", { ascending: false });
    return rows ?? [];
  });
