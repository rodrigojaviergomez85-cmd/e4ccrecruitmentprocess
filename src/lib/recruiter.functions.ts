import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STATUS_OPTIONS } from "./recruitment";

async function assertStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data, error }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("staff_profiles").select("active").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("You do not have recruiter access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  return supabaseAdmin;
}

/** Staff context: role flags plus the countries the user may see (null = all countries). */
async function staffContext(userId: string) {
  const db = await assertStaff(userId);
  const [{ data: roleRows }, { data: countryRows }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isAdmin = roles.includes("admin");
  const assigned = (countryRows ?? []).map((r) => r.country_code);
  return {
    db,
    roles,
    isAdmin,
    allowedCountries: isAdmin ? null : assigned,
  };
}


export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    return { isStaff: Boolean(data?.length), roles: (data ?? []).map((r) => r.role) };
  });

const filterSchema = z.object({
  search: z.string().max(120).optional(),
  country: z.string().max(80).optional(),
  cefr: z.string().max(10).optional(),
  status: z.string().max(40).optional(),
  experience: z.string().max(40).optional(),
  callcenterExperience: z.string().max(40).optional(),
  minScore: z.number().min(0).max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  archived: z.boolean().optional(),
});

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const { db, allowedCountries } = await staffContext(context.userId);
    let query = db
      .from("applications")
      .select(
        "id, full_name, email, country, country_code, city, city_other, city_id, teaching_experience, callcenter_experience, callcenter_experience_level, taught_children, status, submitted_at, created_at, archived_at, source, cities(name), ai_evaluations(cefr, overall_score, state, grammar_evidence), appointments(starts_at, status, interviewers(full_name)), recruitment_progress(work_modality, internet_test_passed, internet_override, grammar_test_verified, resume_path), candidate_emails(kind, status)",
      )
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(500);

    // Archived candidates are hidden unless the Archived filter is on.
    query = data.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

    // Country scoping is enforced server-side, never in the UI only.
    if (allowedCountries) {
      if (allowedCountries.length === 0) return [];
      query = query.in("country_code", allowedCountries);
    }

    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (data.country) {
      if (allowedCountries && !allowedCountries.includes(data.country)) return [];
      query = query.eq("country_code", data.country);
    }
    if (data.status) query = query.eq("status", data.status);
    if (data.experience) query = query.eq("teaching_experience", data.experience);
    if (data.callcenterExperience)
      query = query.eq("callcenter_experience_level", data.callcenterExperience);
    if (data.from) query = query.gte("submitted_at", data.from);
    if (data.to) query = query.lte("submitted_at", data.to);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? [])
      .map((row) => {
        const evaluation = Array.isArray(row.ai_evaluations)
          ? row.ai_evaluations[0]
          : row.ai_evaluations;
        const cityRel = Array.isArray(row.cities) ? row.cities[0] : row.cities;
        const appointment = (row.appointments ?? [])
          .filter((a) => a.status === "Scheduled" || a.status === "Confirmed")
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
        const appointmentInterviewer = appointment
          ? Array.isArray(appointment.interviewers)
            ? appointment.interviewers[0]
            : appointment.interviewers
          : null;
        const progress = Array.isArray(row.recruitment_progress) ? row.recruitment_progress[0] : row.recruitment_progress;
        const preparationEmail = (row.candidate_emails ?? []).filter((email) => email.kind === "preparation").at(-1);
        return {
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          country: row.country,
          country_code: row.country_code,
          city: cityRel?.name ?? row.city_other ?? row.city,
          teaching_experience: row.teaching_experience,
          callcenter_experience: row.callcenter_experience,
          callcenter_experience_level: row.callcenter_experience_level,
          taught_children: row.taught_children,
          status: row.status,
          submitted_at: row.submitted_at,
          archived_at: row.archived_at,
          source: row.source,
          appointment_at: appointment?.starts_at ?? null,
          appointment_status: appointment?.status ?? null,
          interviewer: appointmentInterviewer?.full_name ?? null,
          cefr: evaluation?.cefr ?? null,
          overall_score: evaluation?.overall_score ?? null,
          evaluation_state: evaluation?.state ?? "pending",
          assessment_status:
            evaluation?.grammar_evidence && !Array.isArray(evaluation.grammar_evidence)
              ? ((evaluation.grammar_evidence as { assessment_status?: string })
                  .assessment_status ?? "Scored")
              : "Scored",
          work_modality: progress?.work_modality ?? null,
          internet_ready: Boolean(progress?.internet_test_passed || progress?.internet_override),
          grammar_pending: !progress?.grammar_test_verified,
          resume_uploaded: Boolean(progress?.resume_path),
          preparation_email_status: preparationEmail?.status ?? null,
        };
      })

      .filter((r) => (data.cefr ? r.cefr === data.cefr : true))
      .filter((r) => (data.minScore != null ? (r.overall_score ?? -1) >= data.minScore : true));
  });

export const getCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, allowedCountries } = await staffContext(context.userId);
    const { data: app, error } = await db
      .from("applications")
      .select("*, cities(name), countries(name)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    if (allowedCountries && !allowedCountries.includes(app.country_code ?? "")) {
      throw new Error("You do not have access to this candidate.");
    }


    const [{ data: videos }, { data: transcripts }, { data: evaluation }, { data: progress }, { data: references }] =
      await Promise.all([
        db.from("videos").select("*").eq("application_id", data.id).order("slot"),
        db.from("transcripts").select("slot, content").eq("application_id", data.id),
        db.from("ai_evaluations").select("*").eq("application_id", data.id).maybeSingle(),
        db.from("recruitment_progress").select("*").eq("application_id", data.id).maybeSingle(),
        db.from("work_references").select("*").eq("application_id", data.id).order("slot"),
      ]);

    const withUrls = await Promise.all(
      (videos ?? []).map(async (v) => {
        const { data: signed } = await db.storage
          .from("candidate-media")
          .createSignedUrl(v.video_path, 3600);
        return {
          slot: v.slot,
          question: v.question,
          duration_seconds: v.duration_seconds,
          url: signed?.signedUrl ?? null,
          transcript: (transcripts ?? []).find((t) => t.slot === v.slot)?.content ?? null,
        };
      }),
    );

    // Short-lived signed URL only — resumes never get a public URL.
    let resumeUrl: string | null = null;
    if (progress?.resume_path) {
      const { data: signed } = await db.storage
        .from("candidate-media")
        .createSignedUrl(progress.resume_path, 600);
      resumeUrl = signed?.signedUrl ?? null;
    }
    let systemInfoUrl: string | null = null;
    if (progress?.system_info_path) {
      const { data: signed } = await db.storage
        .from("candidate-media")
        .createSignedUrl(progress.system_info_path, 600);
      systemInfoUrl = signed?.signedUrl ?? null;
    }

    const { submit_token: _token, ...safeApp } = app;
    return {
      application: safeApp,
      videos: withUrls,
      evaluation,
      progress: progress ?? null,
      references: references ?? [],
      resumeUrl,
      systemInfoUrl,
    };
  });

const GRAMMAR_STATUSES = [
  "Not started",
  "Link opened",
  "Candidate marked as completed",
  "Verified by recruiter",
] as const;

export const updateGrammarTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        grammar_test_score: z.number().int().min(0).max(100).nullable().optional(),
        grammar_test_verified: z.boolean().optional(),
        grammar_test_status: z.enum(GRAMMAR_STATUSES).optional(),
        grammar_test_notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await staffContext(context.userId);
    const { applicationId, ...rest } = data;
    const patch = JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
    const { error } = await db
      .from("recruitment_progress")
      .upsert(
        {
          application_id: applicationId,
          ...patch,
          ...(patch['grammar_test_verified'] ? { grammar_test_status: "Verified by recruiter" } : {}),
        },
        { onConflict: "application_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const REFERENCE_STATUSES = [
  "Pending verification",
  "Contacted",
  "Verified",
  "Unable to verify",
  "Invalid reference",
] as const;

export const updateReferenceVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        slot: z.number().int().min(1).max(5),
        verification_status: z.enum(REFERENCE_STATUSES).optional(),
        verification_notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await staffContext(context.userId);
    const { applicationId, slot, ...rest } = data;
    const patch = JSON.parse(JSON.stringify(rest)) as {
      verification_status?: string;
      verification_notes?: string;
    };
    const { error } = await db
      .from("work_references")
      .update(patch)
      .eq("application_id", applicationId)
      .eq("slot", slot);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const updateCandidateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUS_OPTIONS) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, allowedCountries } = await staffContext(context.userId);
    if (allowedCountries) {
      const { data: app } = await db
        .from("applications")
        .select("country_code")
        .eq("id", data.id)
        .single();
      if (!app || !allowedCountries.includes(app.country_code ?? "")) {
        throw new Error("You do not have access to this candidate.");
      }
    }
    const { error } = await db
      .from("applications")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const rerunAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { runAnalysisForApplication } = await import("./candidate.functions");
    return runAnalysisForApplication(data.id);
  });
