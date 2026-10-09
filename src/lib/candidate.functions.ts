import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { EXPERIENCE_OPTIONS, isEligible, questionForSlot } from "./recruitment";

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(40),
  phone_e164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Invalid phone number"),
  phone_country_code: z.string().trim().min(2).max(8),
  country: z.string().trim().min(2).max(80),
  country_code: z.string().trim().min(2).max(8),
  city: z.string().trim().min(1).max(80),
  city_id: z.string().uuid().nullable(),
  city_other: z.string().trim().max(80).nullable(),
  teaching_experience: z.enum(EXPERIENCE_OPTIONS),
  callcenter_experience_level: z.enum(EXPERIENCE_OPTIONS),
  contact_consent: z.literal(true),
});


const ownerSchema = z.object({
  applicationId: z.string().uuid(),
  token: z.string().uuid(),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertOwner(applicationId: string, token: string) {
  const db = await admin();
  const { data, error } = await db
    .from("applications")
    .select("id, full_name, teaching_experience, submitted_at, submit_token, screening_attempts")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.submit_token !== token) throw new Error("Application not found");
  return data;
}

export const createApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => profileSchema.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const eligible = isEligible(data.teaching_experience, data.callcenter_experience_level);
    const { data: row, error } = await db
      .from("applications")
      .insert({
        ...data,
        callcenter_experience: data.callcenter_experience_level !== "No experience",
        taught_children: false,
        consent_at: new Date().toISOString(),
        ...(eligible ? {} : { status: "Not eligible" }),
      })
      .select("id, submit_token")
      .single();
    if (error) throw new Error(error.message);
    return { applicationId: row.id, token: row.submit_token, eligible };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.extend(profileSchema.shape).parse(d))
  .handler(async ({ data }) => {
    const { applicationId, token, ...profile } = data;
    await assertOwner(applicationId, token);
    const db = await admin();
    const { error } = await db.from("applications").update(profile).eq("id", applicationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getApplicationState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    const app = await assertOwner(data.applicationId, data.token);
    const db = await admin();
    const { data: videos } = await db
      .from("videos")
      .select("slot")
      .eq("application_id", data.applicationId);
    return {
      fullName: app.full_name,
      teachingExperience: app.teaching_experience,
      submitted: Boolean(app.submitted_at),
      screeningAttempts: app.screening_attempts,
      recordedSlots: (videos ?? []).map((v) => v.slot),
    };
  });

export const createUploadTargets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema
      .extend({
        slot: z.number().int().min(1).max(2),
        videoExt: z.enum(["webm", "mp4"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await assertOwner(data.applicationId, data.token);
    const db = await admin();
    const stamp = Date.now();
    const videoPath = `${data.applicationId}/video-${data.slot}-${stamp}.${data.videoExt}`;
    const video = await db.storage.from("candidate-media").createSignedUploadUrl(videoPath);
    if (video.error) throw new Error(video.error.message);
    return {
      video: { path: videoPath, token: video.data.token },
    };
  });

export const saveVideo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema
      .extend({
        slot: z.number().int().min(1).max(2),
        videoPath: z.string().min(3),
        audioPath: z.string().min(3).optional(),
        duration: z.number().min(0).max(60),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const app = await assertOwner(data.applicationId, data.token);
    if (app.submitted_at) throw new Error("This application was already submitted");
    const db = await admin();
    const { error } = await db.from("videos").upsert(
      {
        application_id: data.applicationId,
        slot: data.slot,
        question: questionForSlot(data.slot, app.teaching_experience),
        video_path: data.videoPath,
        audio_path: data.audioPath ?? null,
        duration_seconds: data.duration,
      },
      { onConflict: "application_id,slot" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getReviewData = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    const app = await assertOwner(data.applicationId, data.token);
    const db = await admin();
    const { data: videos, error } = await db
      .from("videos")
      .select("slot, question, video_path")
      .eq("application_id", data.applicationId)
      .order("slot");
    if (error) throw new Error(error.message);
    const signed = await Promise.all(
      (videos ?? []).map(async (v) => {
        const { data: url } = await db.storage
          .from("candidate-media")
          .createSignedUrl(v.video_path, 3600);
        return { slot: v.slot, question: v.question, url: url?.signedUrl ?? null };
      }),
    );
    return { fullName: app.full_name, videos: signed };
  });

export const submitApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    const app = await assertOwner(data.applicationId, data.token);
    // Re-submitting (double click, reload, second tab) is a no-op, never a new attempt.
    if (app.submitted_at) return { ok: true, duplicate: true };
    const db = await admin();
    const { data: videos } = await db
      .from("videos")
      .select("slot")
      .eq("application_id", data.applicationId);
    if ((videos ?? []).length < 2) throw new Error("Both videos are required before submitting");
    const { data: attempt, error } = await db.rpc("submit_screening", {
      _application_id: data.applicationId,
    });
    if (error) throw new Error(error.message);
    if (!attempt) return { ok: true, duplicate: true };
    await db
      .from("ai_evaluations")
      .upsert({ application_id: data.applicationId, state: "pending", error_message: null }, {
        onConflict: "application_id",
      });
    return { ok: true, duplicate: false };
  });

/** Runs transcription + AI evaluation for a submitted application. Idempotent. */
export async function runAnalysisForApplication(applicationId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { transcribeAudio, evaluateSpeech } = await import("./ai.server");
  const { computeProficiencyScore } = await import("./recruitment");
  type MediaInput = { base64: string; ext: string; mime: string };

  // Claim the job so the same submission is never evaluated (or billed) twice.
  const { data: claimed } = await db
    .from("ai_evaluations")
    .update({ state: "running", error_message: null })
    .eq("application_id", applicationId)
    .in("state", ["pending", "error"])
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: true, skipped: true };

  try {
    const { data: videos, error } = await db
      .from("videos")
      .select("id, slot, question, audio_path, video_path")
      .eq("application_id", applicationId)
      .order("slot");
    if (error) throw new Error(error.message);
    if (!videos || videos.length < 2) throw new Error("Both videos are required");

    const transcripts: Record<number, string> = {};
    const mediaBySlot: Record<number, MediaInput | null> = {};

    for (const video of videos) {
      // The video file always carries the audio track, so prefer it. Older
      // submissions also stored a separate audio file, which was often 0 bytes.
      const sources = [video.video_path, video.audio_path].filter(Boolean) as string[];
      let media: Blob | null = null;
      let mediaPath = "";
      for (const path of sources) {
        const { data: file, error: dlError } = await db.storage
          .from("candidate-media")
          .download(path);
        if (dlError || !file || file.size === 0) continue;
        media = file;
        mediaPath = path;
        break;
      }
      if (!media) {
        throw new Error(
          `No usable audio was recorded for video ${video.slot}. The candidate needs to record again.`,
        );
      }
      const ext = (mediaPath.split(".").pop() ?? "webm").toLowerCase();
      const bytes = new Uint8Array(await media.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      mediaBySlot[video.slot] = {
        base64: btoa(binary),
        ext,
        mime: ext === "mp4" || ext === "m4a" ? "video/mp4" : "video/webm",
      };

      const { data: existing } = await db
        .from("transcripts")
        .select("content")
        .eq("video_id", video.id)
        .maybeSingle();
      if (existing?.content) {
        transcripts[video.slot] = existing.content;
        continue;
      }
      const text = await transcribeAudio(media, `answer-${video.slot}.${ext}`);
      transcripts[video.slot] = text;
      await db.from("transcripts").upsert(
        {
          application_id: applicationId,
          video_id: video.id,
          slot: video.slot,
          content: text,
        },
        { onConflict: "video_id" },
      );
    }

    const { evaluation, audioUsed } = await evaluateSpeech({
      question1: videos[0]?.question ?? "",
      transcript1: transcripts[1] ?? "",
      media1: mediaBySlot[1] ?? null,
      question2: videos[1]?.question ?? "",
      transcript2: transcripts[2] ?? "",
      media2: mediaBySlot[2] ?? null,
    });

    const result = computeProficiencyScore(
      evaluation.dimensions as never,
      evaluation.errors ?? [],
      evaluation.flags ?? {},
    );

    const audioUsable = audioUsed && evaluation.audio_quality?.usable !== false;
    const assessmentStatus = audioUsable
      ? "Scored"
      : (evaluation.audio_quality?.recommended_status ?? "Manual Review") === "Scored"
        ? "Manual Review"
        : (evaluation.audio_quality?.recommended_status ?? "Manual Review");

    await db.from("ai_evaluations").upsert(
      {
        application_id: applicationId,
        state: "done",
        error_message: null,
        cefr: evaluation.cefr,
        overall_score: result.score,
        scores: result.dimensions,
        strengths: evaluation.strengths ?? [],
        areas_to_review: evaluation.areas_to_review ?? [],
        grammar_evidence: {
          version: 2,
          assessment_status: assessmentStatus,
          audio_used: audioUsed,
          audio_quality: evaluation.audio_quality ?? null,
          errors: evaluation.errors ?? [],
          justifications: evaluation.justifications ?? {},
          flags: evaluation.flags ?? {},
          applied_caps: result.appliedCaps,
          weighted_score: result.weighted,
        },
      },
      { onConflict: "application_id" },
    );

    // B1+ candidates qualify automatically and receive a secure scheduling link.
    const { isSchedulingEligible } = await import("./interviews");
    if (isSchedulingEligible(evaluation.cefr)) {
      await db.from("applications").update({ status: "Qualified" }).eq("id", applicationId);
      try {
        const { sendSchedulingInvite } = await import("./scheduling.server");
        await sendSchedulingInvite(applicationId);
      } catch {
        // Never fail the evaluation because a notification provider is down.
      }
    }
    return { ok: true };

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.from("ai_evaluations").upsert(
      { application_id: applicationId, state: "error", error_message: message },
      { onConflict: "application_id" },
    );
    throw err;
  }
}

export const runAnalysis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    await assertOwner(data.applicationId, data.token);
    try {
      return await runAnalysisForApplication(data.applicationId);
    } catch {
      // One automatic retry (only re-runs if the first try ended in "error") so a transient gateway hiccup does not leave a
      // candidate without a score.
      await new Promise((r) => setTimeout(r, 2000));
      return runAnalysisForApplication(data.applicationId);
    }

  });

/** Max technical redos (unusable audio) that never count as a screening attempt. */
const MAX_TECHNICAL_RESETS = 2;

/**
 * Candidate outcome after the AI evaluation. Distinguishes technical problems
 * from level results and tells the candidate whether a final attempt remains.
 */
export const getOutcome = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    await assertOwner(data.applicationId, data.token);
    const db = await admin();
    const { data: evaluation } = await db
      .from("ai_evaluations")
      .select("state, cefr, areas_to_review, grammar_evidence")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    const { data: app } = await db
      .from("applications")
      .select("eligibility_override, screening_attempts, screening_technical_resets")
      .eq("id", data.applicationId)
      .maybeSingle();
    const base = { areas: [] as string[], attempt: app?.screening_attempts ?? 1, processUrl: null as string | null };

    if (evaluation?.state === "error") return { ...base, state: "error", result: null };
    if (evaluation?.state !== "done") return { ...base, state: evaluation?.state ?? "pending", result: null };

    const evidence = (evaluation.grammar_evidence ?? {}) as { assessment_status?: string };
    const scored = !evidence.assessment_status || evidence.assessment_status === "Scored";
    const { isSchedulingEligible } = await import("./interviews");
    const eligible =
      app?.eligibility_override === true
        ? true
        : app?.eligibility_override === false
          ? false
          : isSchedulingEligible(evaluation.cefr);

    if (eligible) {
      return { ...base, state: "done", result: "eligible", processUrl: `/process/${data.applicationId}?t=${data.token}` };
    }
    if (!scored && app?.eligibility_override == null) {
      return {
        ...base,
        state: "done",
        result: (app?.screening_technical_resets ?? 0) < MAX_TECHNICAL_RESETS ? "audio_issue" : "manual_review",
      };
    }
    const areas = scored
      ? ((evaluation.areas_to_review ?? []) as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 2)
      : [];
    return {
      ...base,
      areas,
      state: "done",
      result: (app?.screening_attempts ?? 1) < 2 ? "retake_available" : "final_not_approved",
    };
  });

/**
 * Starts the single screening retake (kind "level") or a technical redo after
 * unusable audio (kind "technical", does not consume an attempt). The first
 * result and recordings stay in screening_attempts as history.
 */
export const startScreeningRetry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.extend({ kind: z.enum(["level", "technical"]) }).parse(d))
  .handler(async ({ data }) => {
    await assertOwner(data.applicationId, data.token);
    const db = await admin();
    const { data: app } = await db
      .from("applications")
      .select("submitted_at, screening_attempts, screening_technical_resets, eligibility_override")
      .eq("id", data.applicationId)
      .single();
    if (!app?.submitted_at) return { ok: true }; // already reset (other tab / reload)
    const { data: evaluation } = await db
      .from("ai_evaluations")
      .select("*")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (evaluation?.state !== "done") throw new Error("Your screening result is not ready yet.");
    const evidence = (evaluation.grammar_evidence ?? {}) as { assessment_status?: string };
    const scored = !evidence.assessment_status || evidence.assessment_status === "Scored";
    const { isSchedulingEligible } = await import("./interviews");
    if (app.eligibility_override === true || isSchedulingEligible(evaluation.cefr)) {
      throw new Error("Your screening was approved; no new attempt is needed.");
    }
    if (data.kind === "level") {
      if (!scored) throw new Error("This result needs a technical re-recording instead.");
      if (app.screening_attempts >= 2) throw new Error("There are no additional screening attempts available for this application.");
    } else {
      if (scored) throw new Error("A technical re-recording is not available for this result.");
      if (app.screening_technical_resets >= MAX_TECHNICAL_RESETS) throw new Error("Our team will review your recordings manually.");
    }

    const [{ data: videos }, { data: transcripts }] = await Promise.all([
      db.from("videos").select("*").eq("application_id", data.applicationId),
      db.from("transcripts").select("*").eq("application_id", data.applicationId),
    ]);
    const kind = data.kind === "level" ? "level" : `technical-${app.screening_technical_resets + 1}`;
    const { error: histErr } = await db.from("screening_attempts").upsert(
      {
        application_id: data.applicationId,
        attempt_number: app.screening_attempts,
        kind,
        ai_result: evaluation as never,
        videos: (videos ?? []) as never,
        transcripts: (transcripts ?? []) as never,
      },
      { onConflict: "application_id,attempt_number,kind" },
    );
    if (histErr) throw new Error(histErr.message);

    // Conditional reset: only one tab/request can win it.
    const reset =
      data.kind === "level"
        ? { submitted_at: null }
        : {
            submitted_at: null,
            screening_attempts: Math.max(0, app.screening_attempts - 1),
            screening_technical_resets: app.screening_technical_resets + 1,
          };
    const { data: won } = await db
      .from("applications")
      .update(reset)
      .eq("id", data.applicationId)
      .eq("screening_attempts", app.screening_attempts)
      .not("submitted_at", "is", null)
      .select("id");
    if (!won || won.length === 0) return { ok: true };
    await db.from("transcripts").delete().eq("application_id", data.applicationId);
    await db.from("videos").delete().eq("application_id", data.applicationId);
    await db.from("ai_evaluations").delete().eq("application_id", data.applicationId);
    return { ok: true };
  });
