import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Candidate-facing "E4CC Recruitment Process" checklist.
 * Authorization always uses the application id + the secret submit token that
 * only the candidate's own browser holds. Eligibility (CEFR B1+ or a recruiter
 * override) is validated here on the server, never in the UI.
 */

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
    .select("id, full_name, email, submit_token, status, eligibility_override")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.submit_token !== token) throw new Error("Application not found");
  return data;
}

/** Server-side eligibility gate for the whole recruitment process page. */
async function assertEligible(applicationId: string, token: string) {
  const app = await assertOwner(applicationId, token);
  const db = await admin();
  const { data: evaluation } = await db
    .from("ai_evaluations")
    .select("state, cefr")
    .eq("application_id", applicationId)
    .maybeSingle();
  const { isSchedulingEligible } = await import("./interviews");
  const eligible =
    app.eligibility_override === true
      ? true
      : app.eligibility_override === false
        ? false
        : evaluation?.state === "done" && isSchedulingEligible(evaluation.cefr);
  if (!eligible) throw new Error("This stage is not available for your application.");
  return { app, cefr: evaluation?.cefr ?? null, db };
}

const REFERENCE_SLOTS = [1, 2] as const;

function referenceComplete(row: {
  company: string;
  position: string;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  supervisor_name: string;
  supervisor_phone: string;
  supervisor_email: string;
  reason_for_leaving: string;
}) {
  return Boolean(
    row.company.trim() &&
      row.position.trim() &&
      row.start_date &&
      (row.currently_working || row.end_date) &&
      row.supervisor_name.trim() &&
      row.supervisor_phone.trim() &&
      row.supervisor_email.trim() &&
      row.reason_for_leaving.trim(),
  );
}

/** Device requirement: onsite coaches only confirm the device; online coaches
 * also need a measured internet speed and a System Information screenshot. */
export function deviceRequirementMet(progress: {
  device_confirmed: boolean;
  work_modality: string | null;
  internet_speed_mbps: number | null;
  system_info_path: string | null;
}) {
  if (!progress.device_confirmed) return false;
  if (progress.work_modality === "onsite") return true;
  if (progress.work_modality === "online") {
    return progress.internet_speed_mbps != null && Boolean(progress.system_info_path);
  }
  return false;
}

export function requirementsFor(
  progress: {
    device_confirmed: boolean;
    work_modality: string | null;
    internet_speed_mbps: number | null;
    system_info_path: string | null;
    grammar_test_confirmed: boolean;
    grammar_topics_confirmed: boolean;
    resume_path: string | null;
    references_declaration: boolean;
  },
  referencesComplete: boolean,
) {
  const items = [
    { key: "device", label: "Device requirement confirmed", done: deviceRequirementMet(progress) },
    { key: "grammar_test", label: "Grammar Test completed", done: progress.grammar_test_confirmed },
    {
      key: "grammar_topics",
      label: "Grammar topics reviewed",
      done: progress.grammar_topics_confirmed,
    },
    { key: "resume", label: "Resume uploaded", done: Boolean(progress.resume_path) },
    { key: "references", label: "Both work references completed", done: referencesComplete },
    {
      key: "declaration",
      label: "Reference accuracy declaration accepted",
      done: progress.references_declaration,
    },
  ];
  return { items, unlocked: items.every((i) => i.done) };
}

type Db = Awaited<ReturnType<typeof admin>>;

async function loadState(db: Db, applicationId: string) {
  await db
    .from("recruitment_progress")
    .upsert({ application_id: applicationId }, { onConflict: "application_id", ignoreDuplicates: true });
  for (const slot of REFERENCE_SLOTS) {
    await db
      .from("work_references")
      .upsert(
        { application_id: applicationId, slot },
        { onConflict: "application_id,slot", ignoreDuplicates: true },
      );
  }
  const [{ data: progress }, { data: references }] = await Promise.all([
    db.from("recruitment_progress").select("*").eq("application_id", applicationId).single(),
    db
      .from("work_references")
      .select("*")
      .eq("application_id", applicationId)
      .order("slot"),
  ]);
  const refs = (references ?? []).map((r) => {
    const { verification_notes: _notes, ...safe } = r;
    return safe;
  });
  const complete = refs.length === 2 && refs.every((r) => referenceComplete(r));
  const { items, unlocked } = requirementsFor(progress!, complete);
  return { progress: progress!, references: refs, requirements: items, unlocked };
}

/** Sync the application status with the checklist state. */
async function syncStatus(db: Db, applicationId: string, unlocked: boolean, schedulingOpened: boolean) {
  const { data: app } = await db
    .from("applications")
    .select("status")
    .eq("id", applicationId)
    .maybeSingle();
  const current = app?.status;
  const protectedStatuses = [
    "Interview scheduled",
    "Interview completed",
    "No-show",
    "Canceled",
    "Interview",
    "Hired",
    "Rejected",
  ];
  if (current && protectedStatuses.includes(current)) return;
  const next = schedulingOpened ? "Scheduling opened" : unlocked ? "Ready to schedule" : null;
  if (next && next !== current) {
    await db.from("applications").update({ status: next }).eq("id", applicationId);
  }
}

export const getRecruitmentProcess = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    try {
      const { app, cefr, db } = await assertEligible(data.applicationId, data.token);
      const state = await loadState(db, data.applicationId);
      return {
        invalid: null,
        candidate: { fullName: app.full_name, email: app.email, cefr },
        ...state,
      };
    } catch (e) {
      // Never throw across the RPC boundary: an invalid/ineligible link should
      // render the "not available" screen, not a blank error page.
      return {
        invalid: e instanceof Error ? e.message : "This stage is not available for your application.",
      } as const;
    }
  });


const confirmSchema = ownerSchema.extend({
  device_confirmed: z.boolean().optional(),
  work_modality: z.enum(["online", "onsite"]).optional(),
  internet_speed_mbps: z.number().min(0).max(10000).optional(),
  grammar_test_confirmed: z.boolean().optional(),
  grammar_test_opened: z.boolean().optional(),
  grammar_topics_confirmed: z.boolean().optional(),
  references_declaration: z.boolean().optional(),
});

export const saveRecruitmentProgress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    const { applicationId, token: _t, grammar_test_opened, ...fields } = data;
    const patch: Record<string, unknown> = { ...fields };

    if (grammar_test_opened || fields.grammar_test_confirmed) {
      const { data: current } = await db
        .from("recruitment_progress")
        .select("grammar_test_verified, grammar_test_status")
        .eq("application_id", applicationId)
        .maybeSingle();
      if (!current?.grammar_test_verified) {
        patch['grammar_test_status'] = fields.grammar_test_confirmed
          ? "Candidate marked as completed"
          : current?.grammar_test_status === "Candidate marked as completed"
            ? current.grammar_test_status
            : "Link opened";
      }
    }

    await db
      .from("recruitment_progress")
      .upsert({ application_id: applicationId, ...patch }, { onConflict: "application_id" });

    const state = await loadState(db, applicationId);
    await syncStatus(
      db,
      applicationId,
      state.unlocked,
      state.progress.scheduling_status === "Scheduling opened",
    );
    return state;
  });

const referenceSchema = ownerSchema.extend({
  slot: z.number().int().min(1).max(2),
  company: z.string().trim().max(120),
  position: z.string().trim().max(120),
  start_date: z.string().trim().max(20).nullable(),
  end_date: z.string().trim().max(20).nullable(),
  currently_working: z.boolean(),
  supervisor_name: z.string().trim().max(120),
  supervisor_phone: z.string().trim().max(40),
  supervisor_email: z.string().trim().max(255),
  reason_for_leaving: z.string().trim().max(500),
  may_contact: z.boolean(),
});

export const saveWorkReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => referenceSchema.parse(d))
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    const { applicationId, token: _t, ...fields } = data;
    if (fields.supervisor_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.supervisor_email)) {
      const current = await loadState(db, applicationId);
      return { ...current, error: "Please enter a valid supervisor email." };
    }
    await db.from("work_references").upsert(
      {
        application_id: applicationId,
        ...fields,
        end_date: fields.currently_working ? null : fields.end_date || null,
        start_date: fields.start_date || null,
      },
      { onConflict: "application_id,slot" },
    );
    const state = await loadState(db, applicationId);
    await syncStatus(
      db,
      applicationId,
      state.unlocked,
      state.progress.scheduling_status === "Scheduling opened",
    );
    return state;
  });

const RESUME_TYPES = ["pdf", "doc", "docx"] as const;

export const createResumeUploadTarget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema
      .extend({ ext: z.enum(RESUME_TYPES), size: z.number().int().max(10 * 1024 * 1024) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    const path = `${data.applicationId}/resume-${Date.now()}.${data.ext}`;
    const { data: signed, error } = await db.storage
      .from("candidate-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token };
  });

export const saveResume = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema.extend({ path: z.string().min(3).max(300), filename: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    if (!data.path.startsWith(`${data.applicationId}/`)) throw new Error("Invalid file path.");

    // Only one active resume: remove the previous file.
    const { data: current } = await db
      .from("recruitment_progress")
      .select("resume_path")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (current?.resume_path && current.resume_path !== data.path) {
      await db.storage.from("candidate-media").remove([current.resume_path]);
    }

    await db.from("recruitment_progress").upsert(
      {
        application_id: data.applicationId,
        resume_path: data.path,
        resume_filename: data.filename,
        resume_uploaded_at: new Date().toISOString(),
      },
      { onConflict: "application_id" },
    );
    const state = await loadState(db, data.applicationId);
    await syncStatus(
      db,
      data.applicationId,
      state.unlocked,
      state.progress.scheduling_status === "Scheduling opened",
    );
    return state;
  });

const SYSTEM_INFO_TYPES = ["jpg", "jpeg", "png"] as const;

export const createSystemInfoUploadTarget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema
      .extend({ ext: z.enum(SYSTEM_INFO_TYPES), size: z.number().int().max(10 * 1024 * 1024) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    const path = `${data.applicationId}/system-info-${Date.now()}.${data.ext}`;
    const { data: signed, error } = await db.storage
      .from("candidate-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token };
  });

export const saveSystemInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    ownerSchema.extend({ path: z.string().min(3).max(300), filename: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    if (!data.path.startsWith(`${data.applicationId}/`)) throw new Error("Invalid file path.");

    // Only one active screenshot: remove the previous file.
    const { data: current } = await db
      .from("recruitment_progress")
      .select("system_info_path")
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (current?.system_info_path && current.system_info_path !== data.path) {
      await db.storage.from("candidate-media").remove([current.system_info_path]);
    }

    await db.from("recruitment_progress").upsert(
      {
        application_id: data.applicationId,
        system_info_path: data.path,
        system_info_filename: data.filename,
        system_info_uploaded_at: new Date().toISOString(),
      },
      { onConflict: "application_id" },
    );
    const state = await loadState(db, data.applicationId);
    await syncStatus(
      db,
      data.applicationId,
      state.unlocked,
      state.progress.scheduling_status === "Scheduling opened",
    );
    return state;
  });

/** Called when the candidate reaches the (server-unlocked) scheduling section. */
export const markSchedulingOpened = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ownerSchema.parse(d))
  .handler(async ({ data }) => {
    const { db } = await assertEligible(data.applicationId, data.token);
    const state = await loadState(db, data.applicationId);
    if (!state.unlocked) throw new Error("Requirements are not complete yet.");
    await db
      .from("recruitment_progress")
      .update({ scheduling_status: "Scheduling opened" })
      .eq("application_id", data.applicationId);
    await syncStatus(db, data.applicationId, true, true);
    return { ok: true };
  });
