import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STATUS_OPTIONS } from "./recruitment";

async function assertStaff(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("You do not have recruiter access.");
  return supabaseAdmin;
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
  taughtChildren: z.enum(["yes", "no"]).optional(),
  minScore: z.number().min(0).max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ context, data }) => {
    const db = await assertStaff(context.userId);
    let query = db
      .from("applications")
      .select(
        "id, full_name, email, country, city, teaching_experience, taught_children, status, submitted_at, created_at, ai_evaluations(cefr, overall_score, state, grammar_evidence)",
      )
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(500);

    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      query = query.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (data.country) query = query.eq("country", data.country);
    if (data.status) query = query.eq("status", data.status);
    if (data.experience) query = query.eq("teaching_experience", data.experience);
    if (data.taughtChildren) query = query.eq("taught_children", data.taughtChildren === "yes");
    if (data.from) query = query.gte("submitted_at", data.from);
    if (data.to) query = query.lte("submitted_at", data.to);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return (rows ?? [])
      .map((row) => {
        const evaluation = Array.isArray(row.ai_evaluations)
          ? row.ai_evaluations[0]
          : row.ai_evaluations;
        return {
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          country: row.country,
          teaching_experience: row.teaching_experience,
          taught_children: row.taught_children,
          status: row.status,
          submitted_at: row.submitted_at,
          cefr: evaluation?.cefr ?? null,
          overall_score: evaluation?.overall_score ?? null,
          evaluation_state: evaluation?.state ?? "pending",
          assessment_status:
            evaluation?.grammar_evidence && !Array.isArray(evaluation.grammar_evidence)
              ? ((evaluation.grammar_evidence as { assessment_status?: string })
                  .assessment_status ?? "Scored")
              : "Scored",
        };
      })
      .filter((r) => (data.cefr ? r.cefr === data.cefr : true))
      .filter((r) => (data.minScore != null ? (r.overall_score ?? -1) >= data.minScore : true));
  });

export const getCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = await assertStaff(context.userId);
    const { data: app, error } = await db
      .from("applications")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const [{ data: videos }, { data: transcripts }, { data: evaluation }] = await Promise.all([
      db.from("videos").select("*").eq("application_id", data.id).order("slot"),
      db.from("transcripts").select("slot, content").eq("application_id", data.id),
      db.from("ai_evaluations").select("*").eq("application_id", data.id).maybeSingle(),
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

    const { submit_token: _token, ...safeApp } = app;
    return { application: safeApp, videos: withUrls, evaluation };
  });

export const updateCandidateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(STATUS_OPTIONS) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await assertStaff(context.userId);
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
