import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_WEIGHTS,
  isLockedStatus,
  STATUS_FOR_RESULT,
  complianceScore,
  missingEarlyFinish,
  missingRequired,
  readFinalFilter,
  totalScore,
  type Weights,
} from "./evaluations";
import { writeAudit } from "./audit.server";
import { staffTier } from "./roles";

/** Maps the evaluator's final result to the candidate-facing email kind. */
const FOLLOW_UP_KIND: Record<string, "retake" | "not_approved" | "approved" | undefined> = {
  "Retake required": "retake",
  "Not approved": "not_approved",
  "Approved for last step": "approved",
};

/**
 * Feedback text for the email. Retake shares the evaluator's improvement notes;
 * "Not approved" never shares internal comments — the template decides what may
 * be disclosed from the selected reasons only.
 */
function resultAreas(
  kind: "retake" | "not_approved" | "approved",
  sections: Record<string, Record<string, unknown>>,
  comments?: string | null,
) {
  if (kind !== "retake") return "";
  return String(
    sections["result"]?.["retake_improvements"] ??
      sections["result"]?.["retake_reason"] ??
      comments ??
      "",
  );
}

async function getAdmin() {

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof getAdmin>>;

/** Embedded Supabase relations arrive as a row or an array depending on the relationship. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Server-side permission resolution. Hiding links is never the security boundary. */
async function evaluatorContext(userId: string) {
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
  // Recruitment runs the first interview; Managers can read it (their own filter is Phase 2).
  const isEvaluator = isAdmin || tier.isRecruitment;
  const canView = tier.isStaff;
  return {
    db,
    roles: roleNames,
    isAdmin,
    isEvaluator,
    canView,
    email: profile?.email ?? null,
    fullName: profile?.full_name ?? "",
    allowedCountries: isAdmin ? null : (countries ?? []).map((c) => c.country_code),
  };
}

/** Calendly-only candidates have no country yet, so every evaluator can see them. */
function countryAllowed(
  ctx: { allowedCountries: string[] | null },
  countryCode: string | null | undefined,
  source: string | null | undefined,
) {
  if (!ctx.allowedCountries) return true;
  if (!countryCode && source === "calendly") return true;
  return ctx.allowedCountries.includes(countryCode ?? "");
}

async function audit(
  db: Db,
  entry: {
    evaluationId: string;
    actorId: string;
    actorEmail?: string | null;
    action: string;
    details?: Record<string, unknown>;
  },
) {
  await db.from("evaluation_audit").insert({
    evaluation_id: entry.evaluationId,
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    details: (entry.details ?? {}) as never,
  });
  await db.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    action: `evaluation.${entry.action}`,
    entity_type: "interview_evaluation",
    entity_id: entry.evaluationId,
    details: (entry.details ?? {}) as never,
  });
}

async function loadWeights(db: Db): Promise<Weights> {
  const { data } = await db.from("scorecard_weights").select("weights").eq("id", true).maybeSingle();
  const stored = (data?.weights as Partial<Weights>) ?? {};
  // Only keys the current category set knows about; legacy keys are ignored.
  const merged = { ...DEFAULT_WEIGHTS };
  for (const key of Object.keys(DEFAULT_WEIGHTS) as Array<keyof Weights>) {
    if (typeof stored[key] === "number") merged[key] = stored[key];
  }
  return merged;
}

export const getEvaluatorAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const ctx = await evaluatorContext(context.userId);
      return {
        canView: ctx.canView,
        canEvaluate: ctx.isEvaluator,
        isAdmin: ctx.isAdmin,
        roles: ctx.roles,
        fullName: ctx.fullName,
      };
    } catch {
      return { canView: false, canEvaluate: false, isAdmin: false, roles: [], fullName: "" };
    }
  });

/**
 * Marks today's Recruitment interview as No Show from the queue, without opening
 * the evaluation: the appointment closes as "No-show" and the candidate gets the
 * No Show email with a personal link to rebook.
 */
export const markInterviewNoShow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator) throw new Error("Only interview staff can mark a No Show.");
    const { db } = ctx;

    const { data: app, error } = await db
      .from("applications")
      .select("id, full_name, email")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Candidate not found.");

    const { data: appt } = await db
      .from("appointments")
      .select("id, starts_at, status")
      .eq("application_id", app.id)
      .in("status", ["Scheduled", "Confirmed"])
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appt) {
      const { error: upErr } = await db.from("appointments").update({ status: "No-show" }).eq("id", appt.id);
      if (upErr) throw new Error(upErr.message);
    }

    const { issueSchedulingToken, schedulingUrl } = await import("./scheduling.server");
    const { sendEmail } = await import("./notify.server");
    const { buildInterviewNoShowEmail } = await import("./candidate-emails");
    const token = await issueSchedulingToken(app.id);
    const mail = buildInterviewNoShowEmail({ fullName: app.full_name, scheduleUrl: schedulingUrl(token) });
    const sent = await sendEmail({
      to: app.email,
      subject: mail.subject,
      html: mail.html,
      candidateName: app.full_name,
      result: "no_show",
    });

    await writeAudit(db, {
      actorId: context.userId,
      action: "interview.no_show",
      entityType: "appointment",
      entityId: appt?.id ?? null,
      applicationId: app.id,
      newValue: { status: "No-show", email: sent.status, source: "queue_quick_action" },
    });

    return { ok: true, email: sent.status, detail: sent.detail };
  });

/** Quick action from today's interviews: moves the candidate to the Waiting List (no email sent). */
export const markInterviewWaitingList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator) throw new Error("Only interview staff can move a candidate to the Waiting List.");
    const { db } = ctx;
    const { data: app, error } = await db.from("applications").select("id, status").eq("id", data.applicationId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Candidate not found.");
    const { error: upErr } = await db.from("applications").update({ status: "Waiting List" }).eq("id", app.id);
    if (upErr) throw new Error(upErr.message);
    await writeAudit(db, {
      actorId: context.userId,
      action: "application.waiting_list",
      entityType: "application",
      entityId: app.id,
      applicationId: app.id,
      oldValue: { status: app.status },
      newValue: { status: "Waiting List", source: "queue_quick_action" },
    });
    return { ok: true };
  });

/** Opens (or creates) the single evaluation for an application and loads existing candidate data. */
export const openEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.canView) throw new Error("You do not have access to interview evaluations.");
    const { db } = ctx;

    const { data: app, error } = await db
      .from("applications")
      .select(
        "id, source, full_name, email, phone, phone_e164, country, country_code, city, city_other, status, assigned_manager_id, teaching_experience, callcenter_experience, callcenter_experience_level, submitted_at, cities(name), ai_evaluations(cefr, overall_score, state), appointments(id, starts_at, status, meeting_link, candidate_timezone, interviewers(full_name)), recruitment_progress(*), work_references(*)",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!app) throw new Error("Candidate not found.");
    if (!countryAllowed(ctx, app.country_code, app.source)) {
      throw new Error("This candidate is outside the countries assigned to your account.");
    }

    // Always work on the latest attempt; earlier retakes stay as history.
    let { data: evaluation } = await db
      .from("interview_evaluations")
      .select("*")
      .eq("application_id", app.id)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const appt = (app.appointments ?? [])
      .filter((x) => x.status !== "Rescheduled" && x.status !== "Canceled")
      .sort((x, y) => (x.starts_at < y.starts_at ? 1 : -1))[0];

    if (!evaluation && ctx.isEvaluator) {
      const { data: created, error: insertError } = await db
        .from("interview_evaluations")
        .insert({
          application_id: app.id,
          appointment_id: appt?.id ?? null,
          evaluator_id: context.userId,
          last_edited_by: context.userId,
          status: "In progress",
          interview_date: appt?.starts_at ? appt.starts_at.slice(0, 10) : null,
        })
        .select("*")
        .single();
      if (insertError) {
        // Another evaluator won the race: reuse their evaluation instead of duplicating.
        const { data: existing } = await db
          .from("interview_evaluations")
          .select("*")
          .eq("application_id", app.id)
          .order("attempt_number", { ascending: false })
          .limit(1)
          .maybeSingle();
        evaluation = existing ?? null;
      } else {
        evaluation = created;
        await audit(db, {
          evaluationId: created.id,
          actorId: context.userId,
          actorEmail: ctx.email,
          action: "created",
        });
      }
    }

    const [verbs, jobs, auditRows] = evaluation
      ? await Promise.all([
          db
            .from("evaluation_verbs")
            .select("verb, correct, position")
            .eq("evaluation_id", evaluation.id)
            .order("position"),
          db
            .from("evaluation_jobs")
            .select("*")
            .eq("evaluation_id", evaluation.id)
            .order("slot"),
          db
            .from("evaluation_audit")
            .select("action, actor_email, details, created_at")
            .eq("evaluation_id", evaluation.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

    const { data: staffRow } = evaluation?.evaluator_id
      ? await db
          .from("staff_profiles")
          .select("full_name, email")
          .eq("user_id", evaluation.evaluator_id)
          .maybeSingle()
      : { data: null };

    const progress = one(app.recruitment_progress);
    const ai = one(app.ai_evaluations);

    // Short-lived signed link so the evaluator can open the resume from the side panel.
    let resumeUrl: string | null = null;
    if (progress?.resume_path) {
      const { data: signed } = await db.storage
        .from("candidate-media")
        .createSignedUrl(progress.resume_path, 3600);
      resumeUrl = signed?.signedUrl ?? null;
    }

    const { data: mgrAppt } = await db
      .from("appointments")
      .select("starts_at, meeting_link, candidate_timezone, interviewers(full_name)")
      .eq("application_id", app.id)
      .eq("stage", "manager_final_filter")
      .in("status", ["Scheduled", "Confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .maybeSingle();

    const { data: mgrRoles } = await db.from("user_roles").select("user_id").eq("role", "manager");
    const mgrIds = [...new Set((mgrRoles ?? []).map((r) => r.user_id))];
    const { data: mgrProfiles } = mgrIds.length
      ? await db.from("staff_profiles").select("user_id, full_name, email, active").in("user_id", mgrIds)
      : { data: [] as { user_id: string; full_name: string; email: string; active: boolean }[] };
    const managers = (mgrProfiles ?? [])
      .filter((p) => p.active)
      .map((p) => ({ id: p.user_id, name: p.full_name || p.email }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      managers,
      assignedManagerId: app.assigned_manager_id ?? null,
      finalFilterAppointment: mgrAppt
        ? {
            startsAt: mgrAppt.starts_at,
            meetingLink: mgrAppt.meeting_link || null,
            timezone: mgrAppt.candidate_timezone,
            interviewer: one(mgrAppt.interviewers)?.full_name ?? null,
          }
        : null,
      access: { canEvaluate: ctx.isEvaluator, isAdmin: ctx.isAdmin, canView: ctx.canView },
      weights: await loadWeights(db),
      candidate: {
        id: app.id,
        fullName: app.full_name,
        email: app.email,
        phone: app.phone_e164 ?? app.phone,
        country: app.country,
        countryCode: app.country_code,
        city: app.cities?.name ?? app.city_other ?? app.city,
        pipelineStatus: app.status,
        teachingExperience: app.teaching_experience,
        callcenterExperience: app.callcenter_experience,
        callcenterExperienceLevel: app.callcenter_experience_level,
        previousCefr: ai?.cefr ?? null,
        previousScore: ai?.overall_score ?? null,
        appointmentAt: appt?.starts_at ?? null,
        appointmentStatus: appt?.status ?? null,
        interviewer: appt?.interviewers?.full_name ?? null,
        meetingLink: appt?.meeting_link ?? null,
        candidateTimezone: appt?.candidate_timezone ?? null,
        resumeUrl,
        lob: progress?.work_modality ?? null,
        internetSpeed: progress?.internet_speed_mbps ?? null,
        internetDownloadMbps: progress?.internet_download_mbps ?? null,
        internetUploadMbps: progress?.internet_upload_mbps ?? null,
        internetPingMs: progress?.internet_ping_ms ?? null,
        internetTestedAt: progress?.internet_tested_at ?? null,
        internetTestPassed: progress?.internet_test_passed ?? null,
        resumeFilename: progress?.resume_filename ?? null,
        grammarTestStatus: progress?.grammar_test_status ?? null,
        grammarTestScore: progress?.grammar_test_score ?? null,
        grammarTestVerified: progress?.grammar_test_verified ?? false,
        references: (app.work_references ?? []).map((r) => ({
          slot: r.slot,
          company: r.company,
          position: r.position,
          startDate: r.start_date,
          endDate: r.end_date,
          currentlyWorking: r.currently_working,
          reasonForLeaving: r.reason_for_leaving,
          supervisorName: r.supervisor_name,
          supervisorPhone: r.supervisor_phone,
          supervisorEmail: r.supervisor_email,
          verificationStatus: r.verification_status,
        })),
      },
      evaluation: evaluation
        ? {
            ...evaluation,
            evaluatorName: staffRow?.full_name ?? staffRow?.email ?? "",
            verbs: (verbs.data ?? []).map((v) => ({ verb: v.verb, correct: v.correct })),
            jobs: jobs.data ?? [],
            auditTrail: auditRows.data ?? [],
          }
        : null,
    };
  });

function finalFilterFrom(sections: Record<string, Record<string, unknown>>) {
  const ff = readFinalFilter(sections["result"]);
  return ff.state === "complete" ? ff.details : null;
}

/**
 * Approved delivery rule: one approval email. When the appointment is already
 * known it goes inside that email. If the general approval was sent earlier and
 * the appointment is defined later, only a single appointment confirmation is
 * sent — the approval is never repeated.
 */
async function deliverApproved(
  db: Db,
  input: { applicationId: string; evaluationId: string; sections: Record<string, Record<string, unknown>>; actorId: string; force?: boolean },
) {
  const { sendFollowUp } = await import("./candidate-admin.functions");
  const finalFilter = finalFilterFrom(input.sections);
  const { data: approvedSent } = await db
    .from("candidate_emails")
    .select("id, body")
    .eq("evaluation_id", input.evaluationId)
    .eq("kind", "approved")
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  if (!approvedSent || input.force) {
    return sendFollowUp(db, {
      applicationId: input.applicationId,
      evaluationId: input.evaluationId,
      kind: "approved",
      areas: "",
      finalFilter,
      actorId: input.actorId,
      force: input.force ?? false,
    });
  }
  const alreadyHadDetails = /final interview details/i.test(approvedSent.body ?? "");
  if (!finalFilter || alreadyHadDetails) {
    return { ok: true, status: "duplicate" as const, detail: "The result email was already sent for this interview." };
  }
  return sendFollowUp(db, {
    applicationId: input.applicationId,
    evaluationId: input.evaluationId,
    kind: "final_filter",
    areas: "",
    finalFilter,
    actorId: input.actorId,
    skipStatusUpdate: true,
  });
}

const jobSchema = z.object({
  slot: z.number().int().min(1).max(5),
  company: z.string().max(160).default(""),
  start_date: z.string().max(200).default(""),
  end_date: z.string().max(200).default(""),
  position: z.string().max(160).default(""),
  hired_to_do: z.string().max(2000).default(""),
  accomplishment: z.string().max(2000).default(""),
  biggest_mistake: z.string().max(2000).default(""),
  supervisor_name: z.string().max(160).default(""),
  supervisor_contact: z.string().max(160).default(""),
  supervisor_rating: z
    .number()
    .nullable()
    .default(null)
    .transform((v) => (v == null || Number.isNaN(v) ? null : Math.min(10, Math.max(1, Math.round(v))))),
  rating_reason: z.string().max(2000).default(""),
  reason_for_leaving: z.string().max(2000).default(""),
  gap_explanation: z.string().max(2000).default(""),
});

const savePayload = z.object({
  evaluationId: z.string().uuid(),
  sections: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  verbs: z
    .array(z.object({ verb: z.string().max(60), correct: z.boolean() }))
    .max(10)
    .default([]),
  jobs: z.array(jobSchema).max(5).default([]),
  liveCefr: z.string().max(10).nullable().default(null),
  finalResult: z.string().max(40).nullable().default(null),
  notApprovedReasons: z.array(z.string().max(80)).max(12).default([]),
  retakeDate: z.string().max(20).nullable().default(null),
  hiringBonus: z.string().max(160).nullable().default(null),
  lastRoleplayDate: z.string().max(20).nullable().default(null),
  interviewDate: z.string().max(20).nullable().default(null),
  comments: z.string().max(4000).nullable().default(null),
  redFlags: z.string().max(4000).nullable().default(null),
  categoryScores: z.record(z.string(), z.number()).default({}),
  submit: z.boolean().default(false),
  earlyFinish: z.boolean().default(false),
});

async function loadEditable(db: Db, evaluationId: string) {
  const { data: evaluation } = await db
    .from("interview_evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();
  if (!evaluation) throw new Error("Evaluation not found.");
  if (isLockedStatus(evaluation.status))
    throw new Error("This evaluation was submitted and is read-only. An admin must reopen it.");
  return evaluation;
}

export const saveEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => savePayload.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator) throw new Error("Evaluator permission is required to edit evaluations.");
    const { db } = ctx;
    const current = await loadEditable(db, data.evaluationId);

    const { data: app } = await db
      .from("applications")
      .select("id, source, country_code, status, recruitment_progress(work_modality)")
      .eq("id", current.application_id)
      .maybeSingle();
    if (app?.status === "Approved for Training" && !ctx.isAdmin) {
      throw new Error("This candidate is already approved; the interview is read-only. An admin can make changes if needed.");
    }
    if (!countryAllowed(ctx, app?.country_code, app?.source)) {
      throw new Error("This candidate is outside the countries assigned to your account.");
    }

    const sections = { ...(current.sections as Record<string, Record<string, unknown>>), ...data.sections };
    const modality = one(app?.recruitment_progress)?.work_modality ?? "";
    if (!String(sections["candidate"]?.["lob"] ?? "").trim() && modality) {
      sections["candidate"] = { ...(sections["candidate"] ?? {}), lob: modality };
    }
    const lobFromSection = String(sections["candidate"]?.["lob"] ?? "").toLowerCase();
    const isOnline =
      lobFromSection === "online" ||
      (!lobFromSection && (one(app?.recruitment_progress)?.work_modality ?? "") === "online");

    const weights = await loadWeights(db);
    const verbs = data.verbs.filter((v) => v.verb.trim().length > 0);
    const jobs = data.jobs.filter((j) => j.company.trim() || j.position.trim());

    const complianceInput = {
      sections,
      isOnline,
      verbs,
      jobsCount: jobs.length,
      finalResult: data.finalResult,
      comments: data.comments,
      redFlags: data.redFlags,
      lastRoleplayDate: data.lastRoleplayDate,
      retakeDate: data.retakeDate,
    };
    const missing = data.earlyFinish
      ? missingEarlyFinish(complianceInput)
      : missingRequired(complianceInput);
    if (data.submit && data.finalResult === "Approved for last step") {
      const ff = readFinalFilter(sections["result"]);
      if (ff.state === "incomplete") missing.push(...ff.missing.map((m) => `Final filter ${m}`));
      if (!String(sections["result"]?.["ff_manager_id"] ?? "")) missing.push("Second filter Manager");
    }
    if (data.submit && missing.length) return { ok: false as const, missing };

    const total = totalScore(data.categoryScores, weights);
    const compliance = complianceScore(complianceInput);

    const { error } = await db
      .from("interview_evaluations")
      .update({
        sections: sections as never,
        live_cefr: data.liveCefr,
        final_result: data.finalResult,
        not_approved_reasons: data.notApprovedReasons as never,
        retake_reason: (sections["result"]?.["retake_reason"] as string) ?? null,
        retake_date: data.retakeDate || null,
        hiring_bonus: data.hiringBonus,
        last_roleplay_date: data.lastRoleplayDate || null,
        interview_date: data.interviewDate || current.interview_date,
        comments: data.comments,
        red_flags: data.redFlags,
        category_scores: data.categoryScores as never,
        total_score: total,
        compliance_score: compliance,
        last_edited_by: context.userId,
        status: data.submit
          ? data.finalResult === "Retake required"
            ? "Retake pending"
            : "Submitted"
          : current.status === "Reopened"
            ? "Reopened"
            : "In progress",
        submitted_at: data.submit ? new Date().toISOString() : current.submitted_at,
        ...(data.submit
          ? {
              decision_stage: "recruitment_interview",
              decided_by: context.userId,
              decided_at: new Date().toISOString(),
              decision_reason:
                data.finalResult === "Not approved"
                  ? (data.notApprovedReasons ?? []).join("; ") || null
                  : data.finalResult === "Retake required"
                    ? ((sections["result"]?.["retake_reason"] as string) ?? null)
                    : null,
            }
          : {}),
      })
      .eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    if (data.submit && data.finalResult === "Approved for last step") {
      const managerId = String(sections["result"]?.["ff_manager_id"] ?? "");
      const { data: isMgr } = await db.from("user_roles").select("user_id").eq("user_id", managerId).eq("role", "manager").maybeSingle();
      if (isMgr) {
        await db.from("applications").update({ assigned_manager_id: managerId }).eq("id", current.application_id);
        await db.from("manager_evaluations").update({ manager_id: managerId }).eq("application_id", current.application_id).is("submitted_at", null);
      }
    }
    if (data.submit) {
      const { stopInterviewTimer } = await import("./aht.server");
      await stopInterviewTimer(db as never, "interview_evaluations", data.evaluationId);
    }

    await db.from("evaluation_verbs").delete().eq("evaluation_id", data.evaluationId);
    if (verbs.length) {
      await db.from("evaluation_verbs").insert(
        verbs.map((v, i) => ({
          evaluation_id: data.evaluationId,
          verb: v.verb.trim(),
          correct: v.correct,
          position: i + 1,
        })),
      );
    }
    await db.from("evaluation_jobs").delete().eq("evaluation_id", data.evaluationId);
    if (jobs.length) {
      await db
        .from("evaluation_jobs")
        .insert(jobs.map((j) => ({ ...j, evaluation_id: data.evaluationId })));
    }

    let emailResult: { ok: boolean; status: string; detail: string } | null = null;

    if (data.submit) {
      const nextStatus = STATUS_FOR_RESULT[data.finalResult ?? ""];
      if (nextStatus) {
        const { data: before } = await db
          .from("applications")
          .select("status")
          .eq("id", current.application_id)
          .maybeSingle();
        await db
          .from("applications")
          .update({
            status: nextStatus,
            ...(nextStatus === "Pending Second Filter" ? { recruitment_approved_at: new Date().toISOString() } : {}),
          })
          .eq("id", current.application_id);
        await writeAudit(db as never, {
          actorId: context.userId,
          actorEmail: ctx.email,
          action: "application.status_changed",
          entityType: "application",
          entityId: current.application_id,
          applicationId: current.application_id,
          oldValue: { status: before?.status ?? null },
          newValue: { status: nextStatus },
        });
      }
      await writeAudit(db as never, {
        actorId: context.userId,
        actorEmail: ctx.email,
        action: "evaluation.result_changed",
        entityType: "interview_evaluation",
        entityId: data.evaluationId,
        applicationId: current.application_id,
        oldValue: { final_result: current.final_result, status: current.status },
        newValue: {
          final_result: data.finalResult,
          decision_stage: "recruitment_interview",
        },
      });
      await audit(db, {
        evaluationId: data.evaluationId,
        actorId: context.userId,
        actorEmail: ctx.email,
        action: "submitted",
        details: { finalResult: data.finalResult, total, compliance, earlyFinish: data.earlyFinish },
      });

      // Finishing the interview sends the candidate-facing result email through
      // the mail relay and waits for its HTTP response. It is only recorded as
      // "sent" when the relay confirms delivery; otherwise the evaluator gets a
      // Retry email button. Duplicates are prevented per evaluation.
      const kind = FOLLOW_UP_KIND[data.finalResult ?? ""];
      if (kind) {
        const { sendFollowUp } = await import("./candidate-admin.functions");
        try {
          emailResult = kind === "approved"
            ? await deliverApproved(db, { applicationId: current.application_id, evaluationId: data.evaluationId, sections, actorId: context.userId })
            : await sendFollowUp(db, {
            applicationId: current.application_id,
            evaluationId: data.evaluationId,
            kind,
            areas: resultAreas(kind, sections, data.comments),
            reasons: data.notApprovedReasons ?? [],
            finalFilter: null,
            actorId: context.userId,
            eligibleAgainDate:
              kind === "not_approved"
                ? String(sections["result"]?.["eligible_again_date"] ?? data.retakeDate ?? "") || null
                : kind === "retake"
                  ? data.retakeDate || null
                  : null,
          });
        } catch (e) {
          emailResult = {
            ok: false,
            status: "failed",
            detail: e instanceof Error ? e.message : "Could not send the result email.",
          };
        }
        await audit(db, {
          evaluationId: data.evaluationId,
          actorId: context.userId,
          actorEmail: ctx.email,
          action: emailResult.ok ? "result_email_sent" : "result_email_failed",
          details: { kind, status: emailResult.status },
        });
      }
    }


    return { ok: true as const, total, compliance, missing: [] as string[], email: emailResult };
  });

export const reopenEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ evaluationId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isAdmin) throw new Error("Only an admin can reopen a submitted evaluation.");
    const { data: prior } = await ctx.db
      .from("interview_evaluations")
      .select("status, application_id, final_result")
      .eq("id", data.evaluationId)
      .maybeSingle();
    const { error } = await ctx.db
      .from("interview_evaluations")
      .update({
        status: "Reopened",
        reopened_at: new Date().toISOString(),
        last_edited_by: context.userId,
      })
      .eq("id", data.evaluationId);
    if (error) throw new Error(error.message);
    await audit(ctx.db, {
      evaluationId: data.evaluationId,
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "reopened",
      details: { reason: data.reason },
    });
    await writeAudit(ctx.db as never, {
      actorId: context.userId,
      actorEmail: ctx.email,
      action: "evaluation.reopened",
      entityType: "interview_evaluation",
      entityId: data.evaluationId,
      applicationId: prior?.application_id ?? null,
      oldValue: { status: prior?.status ?? null, final_result: prior?.final_result ?? null },
      newValue: { status: "Reopened", reason: data.reason },
    });
    return { ok: true };
  });

export const getScorecardWeights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await evaluatorContext(context.userId);
    const { data } = await ctx.db.from("scorecard_weights").select("*").eq("id", true).maybeSingle();
    return {
      weights: { ...DEFAULT_WEIGHTS, ...((data?.weights as Partial<Weights>) ?? {}) },
      thresholds: (data?.thresholds as Record<string, number>) ?? { approve: 80, retake: 65 },
      isAdmin: ctx.isAdmin,
    };
  });

export const updateScorecardWeights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        weights: z.record(z.string(), z.number().min(0).max(100)),
        thresholds: z.record(z.string(), z.number().min(0).max(100)),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isAdmin) throw new Error("Admin access required.");
    const { error } = await ctx.db
      .from("scorecard_weights")
      .update({
        weights: data.weights as never,
        thresholds: data.thresholds as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sends the candidate-facing result email. Only runs when the evaluator
 * presses and confirms "Send Result" — never during autosave or edits.
 */
export const sendResultEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ evaluationId: z.string().uuid(), force: z.boolean().optional().default(false) })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator && !ctx.isAdmin) {
      throw new Error("Evaluator permission is required to send results.");
    }
    const { db } = ctx;
    const { data: evaluation } = await db
      .from("interview_evaluations")
      .select(
        "id, application_id, status, final_result, sections, comments, not_approved_reasons, retake_date",
      )
      .eq("id", data.evaluationId)
      .maybeSingle();
    if (!evaluation) throw new Error("Evaluation not found.");

    const { data: app } = await db
      .from("applications")
      .select("id, source, country_code")
      .eq("id", evaluation.application_id)
      .maybeSingle();
    if (!countryAllowed(ctx, app?.country_code, app?.source)) {
      throw new Error("This candidate is outside the countries assigned to your account.");
    }

    const sections = (evaluation.sections ?? {}) as Record<string, Record<string, unknown>>;
    const reasons = Array.isArray(evaluation.not_approved_reasons)
      ? (evaluation.not_approved_reasons as string[])
      : [];
    const kind = FOLLOW_UP_KIND[evaluation.final_result ?? ""];
    if (!kind) throw new Error("Select a final result before sending the email.");

    const areas = resultAreas(kind, sections, evaluation.comments);

    const eligibleAgainDate =
      kind === "not_approved"
        ? String(sections["result"]?.["eligible_again_date"] ?? evaluation.retake_date ?? "")
        : kind === "retake"
          ? evaluation.retake_date
          : null;

    if (!isLockedStatus(evaluation.status)) {
      throw new Error("Finish the interview first — the result email is sent automatically when you confirm and finish.");
    }
    const { sendFollowUp } = await import("./candidate-admin.functions");
    const delivery = kind === "approved"
      ? await deliverApproved(db, { applicationId: evaluation.application_id, evaluationId: evaluation.id, sections, actorId: context.userId, force: data.force })
      : await sendFollowUp(db, {
      applicationId: evaluation.application_id,
      evaluationId: evaluation.id,
      kind,
      areas,
      reasons,
      finalFilter: null,
      actorId: context.userId,
      eligibleAgainDate: eligibleAgainDate || null,
      force: data.force,
    });

    await audit(db, {
      evaluationId: evaluation.id,
      actorId: context.userId,
      actorEmail: ctx.email,
      action: delivery.ok ? "result_email_sent" : "result_email_failed",
      details: { kind, status: delivery.status },
    });

    return delivery;
  });

/* ------------------------------ Interviews agenda ----------------------------- */

const AGENDA_DAYS_BACK = 365;

/**
 * Interviews screen: one row per Recruitment appointment (each Calendly invitee
 * is its own appointment), plus evaluations that never had a booking. Screening
 * is never required to appear here or to be evaluated.
 */
export const listInterviewAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.canView) throw new Error("You do not have access to interview evaluations.");
    const { db } = ctx;
    const since = new Date(Date.now() - AGENDA_DAYS_BACK * 86400000).toISOString();

    const appSelect =
      "id, full_name, email, phone, country, country_code, city, city_other, source, submitted_at, archived_at, cities(name), ai_evaluations(cefr), recruitment_progress(work_modality)";
    const evalSelect =
      "interview_evaluations(id, status, final_result, evaluator_id, total_score, compliance_score, appointment_id, attempt_number)";

    const [apptRes, evalRes, staffRes, settingsRes] = await Promise.all([
      db
        .from("appointments")
        .select(
          `id, application_id, starts_at, ends_at, status, meeting_link, calendly_event_uri, calendly_event_name, calendly_host_name, interviewers(full_name), applications(${appSelect}, ${evalSelect})`,
        )
        .eq("stage", "recruitment")
        .neq("status", "Rescheduled")
        .gte("starts_at", since)
        .order("starts_at", { ascending: false })
        .limit(2000),
      db
        .from("interview_evaluations")
        .select(
          `id, status, final_result, evaluator_id, total_score, compliance_score, attempt_number, started_at, applications(${appSelect}, appointments(id, status, stage))`,
        )
        .order("attempt_number", { ascending: false })
        .limit(2000),
      db.from("staff_profiles").select("user_id, full_name, email"),
      db
        .from("interview_settings")
        .select("calendly_last_synced_at, calendly_last_attempt_at, calendly_last_sync_result, calendly_last_sync_error")
        .eq("id", true)
        .maybeSingle(),
    ]);
    if (apptRes.error) throw new Error(apptRes.error.message);
    if (evalRes.error) throw new Error(evalRes.error.message);

    const staffById = new Map((staffRes.data ?? []).map((s) => [s.user_id, s.full_name || s.email]));
    type AppRow = {
      id: string;
      full_name: string;
      email: string;
      phone: string;
      country: string;
      country_code: string | null;
      city: string;
      city_other: string | null;
      source: string;
      submitted_at?: string | null;
      archived_at: string | null;
      cities: { name: string } | { name: string }[] | null;
      ai_evaluations: { cefr: string | null } | { cefr: string | null }[] | null;
      recruitment_progress: { work_modality: string | null } | { work_modality: string | null }[] | null;
    };
    const base = (app: AppRow) => ({
      applicationId: app.id,
      fullName: app.full_name,
      email: app.email,
      phone: app.phone,
      country: app.country || "",
      countryCode: app.country_code,
      city: one(app.cities)?.name ?? app.city_other ?? app.city ?? "",
      lob: one(app.recruitment_progress)?.work_modality ?? null,
      cefr: one(app.ai_evaluations)?.cefr ?? null,
    });
    type Ev = {
      id: string;
      status: string;
      final_result: string | null;
      evaluator_id: string;
      total_score: number | null;
      compliance_score: number | null;
      appointment_id?: string | null;
      attempt_number: number;
    };
    const evalFields = (e: Ev | null) => ({
      evaluationId: e?.id ?? null,
      evaluationStatus: e?.status ?? "Not started",
      finalResult: e?.final_result ?? null,
      totalScore: e?.total_score ?? null,
      complianceScore: e?.compliance_score ?? null,
      evaluatorId: e?.evaluator_id ?? null,
      evaluatorName: e?.evaluator_id ? (staffById.get(e.evaluator_id) ?? "") : "",
    });

    const appts = apptRes.data ?? [];
    // Latest appointment per application, so the latest attempt maps to it.
    const latestByApp = new Map<string, string>();
    const apptIdsByApp = new Map<string, Set<string>>();
    for (const a of appts) {
      if (!latestByApp.has(a.application_id)) latestByApp.set(a.application_id, a.id);
      const set = apptIdsByApp.get(a.application_id) ?? new Set<string>();
      set.add(a.id);
      apptIdsByApp.set(a.application_id, set);
    }

    const rows = appts.flatMap((a) => {
      const app = one(a.applications) as (AppRow & { interview_evaluations: Ev[] | null }) | null;
      if (!app || app.archived_at) return [];
      if (!countryAllowed(ctx, app.country_code, app.source)) return [];
      const evals = [...(app.interview_evaluations ?? [])].sort((x, y) => (y.attempt_number ?? 1) - (x.attempt_number ?? 1));
      const own = apptIdsByApp.get(app.id) ?? new Set<string>();
      let evaluation = evals.find((e) => e.appointment_id === a.id) ?? null;
      if (!evaluation && latestByApp.get(app.id) === a.id) {
        evaluation = evals.find((e) => !e.appointment_id || !own.has(e.appointment_id)) ?? null;
      }
      const interviewer = one(a.interviewers);
      return [
        {
          kind: "appointment" as const,
          key: a.id,
          appointmentId: a.id as string | null,
          startsAt: a.starts_at as string | null,
          appointmentStatus: a.status as string | null,
          source: (a.calendly_event_uri ? "Calendly" : "Manual") as "Calendly" | "Manual",
          eventName: a.calendly_event_name,
          host: a.calendly_host_name ?? interviewer?.full_name ?? null,
          meetingLink: a.meeting_link?.startsWith("http") ? a.meeting_link : null,
          screeningCompleted: Boolean(app.submitted_at),
          ...base(app),
          ...evalFields(evaluation),
        },
      ];
    });

    const seen = new Set<string>();
    const unscheduled = (evalRes.data ?? []).flatMap((e) => {
      const app = one(e.applications) as (AppRow & { appointments: { id: string; status: string; stage: string }[] | null }) | null;
      if (!app || app.archived_at || seen.has(app.id)) return [];
      seen.add(app.id);
      if (!countryAllowed(ctx, app.country_code, app.source)) return [];
      const booked = (app.appointments ?? []).some((x) => x.stage === "recruitment" && x.status !== "Rescheduled");
      if (booked) return [];
      return [
        {
          kind: "unscheduled" as const,
          key: `eval-${e.id}`,
          appointmentId: null as string | null,
          startsAt: null as string | null,
          appointmentStatus: null as string | null,
          source: "Manual" as "Calendly" | "Manual",
          eventName: null as string | null,
          host: null as string | null,
          meetingLink: null as string | null,
          screeningCompleted: Boolean(app.submitted_at),
          startedAt: e.started_at,
          ...base(app),
          ...evalFields(e as Ev),
        },
      ];
    });

    const settings = settingsRes.data;
    return {
      rows,
      unscheduled,
      evaluators: (staffRes.data ?? []).map((s) => ({ id: s.user_id, name: s.full_name || s.email })),
      sync: {
        configured: Boolean(process.env["CALENDLY_API_TOKEN"]),
        lastSyncedAt: settings?.calendly_last_synced_at ?? null,
        lastAttemptAt: settings?.calendly_last_attempt_at ?? null,
        lastError: settings?.calendly_last_sync_error ?? null,
        lastResult: (settings?.calendly_last_sync_result ?? null) as {
          account?: string;
          eventTypes?: string[];
          rangeFrom?: string;
          scanned?: number;
          invitees?: number;
          activeInvitees?: number;
          created?: number;
          updated?: number;
          candidatesCreated?: number;
        } | null,
      },
    };
  });

/**
 * Pulls Calendly bookings into Interviews. Never sends emails or changes the
 * pipeline. "auto" runs at most every 5 minutes (claimed atomically so two open
 * screens do not sync at once) and looks back 2 days; "manual" looks back 30 days.
 */
export const syncCalendlyNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["auto", "manual"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator) throw new Error("Evaluator permission is required to sync Calendly.");
    const { calendlyConfigured, syncCalendly } = await import("./calendly.server");
    if (!calendlyConfigured()) throw new Error("Calendly is not connected (the Calendly token is missing).");
    if (data.mode === "auto") {
      const cutoff = new Date(Date.now() - 5 * 60000).toISOString();
      const { data: claimed } = await ctx.db
        .from("interview_settings")
        .update({ calendly_last_attempt_at: new Date().toISOString() })
        .eq("id", true)
        .or(`calendly_last_attempt_at.is.null,calendly_last_attempt_at.lt.${cutoff}`)
        .select("id");
      if (!claimed?.length) return { skipped: true as const };
    }
    const result = await syncCalendly({ sinceDays: data.mode === "auto" ? 2 : 30, sendEmails: false });
    if (data.mode === "manual") {
      await writeAudit(ctx.db, {
        actorId: context.userId,
        action: "calendly.synced",
        entityType: "appointment",
        newValue: { ...result, unmatched: result.unmatched.length },
      });
    }
    return { skipped: false as const, ...result };
  });

/** Finds applicants to start a manual (unscheduled) evaluation; screening not required. */
export const searchApplicantsForEvaluation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ term: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = await evaluatorContext(context.userId);
    if (!ctx.isEvaluator) throw new Error("Evaluator permission is required.");
    const term = data.term.replace(/[%,()]/g, " ").trim();
    const { data: apps, error } = await ctx.db
      .from("applications")
      .select("id, full_name, email, country, country_code, source, status")
      .is("archived_at", null)
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return (apps ?? [])
      .filter((a) => countryAllowed(ctx, a.country_code, a.source))
      .slice(0, 10)
      .map((a) => ({ id: a.id, fullName: a.full_name, email: a.email, country: a.country, status: a.status }));
  });
