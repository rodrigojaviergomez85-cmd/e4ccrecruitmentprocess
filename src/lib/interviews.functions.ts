import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APPOINTMENT_STATUSES } from "./interviews";

async function staffCtx(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: roles }, { data: profile }, { data: countries }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("staff_profiles").select("active, email").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("staff_countries").select("country_code").eq("user_id", userId),
  ]);
  if (!roles?.length) throw new Error("You do not have staff access.");
  if (profile && profile.active === false) throw new Error("Your account is deactivated.");
  const roleNames = roles.map((r) => r.role as string);
  const isAdmin = roleNames.includes("admin");
  return {
    db: supabaseAdmin,
    isAdmin,
    isViewer: !isAdmin && roleNames.includes("viewer") && !roleNames.includes("recruiter"),
    email: profile?.email ?? null,
    allowedCountries: isAdmin ? null : (countries ?? []).map((c) => c.country_code),
  };
}

async function requireAdmin(userId: string) {
  const ctx = await staffCtx(userId);
  if (!ctx.isAdmin) throw new Error("Admin access required.");
  return ctx;
}

async function audit(
  db: Awaited<ReturnType<typeof staffCtx>>["db"],
  entry: {
    actorId: string;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await db.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_email: entry.actorEmail ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    details: (entry.details ?? {}) as never,
  });
}

/* ---------------------------------- settings --------------------------------- */

export const getInterviewConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db } = await staffCtx(context.userId);
    const [{ data: settings }, { data: interviewers }, { data: availability }, { data: blocked }] =
      await Promise.all([
        db.from("interview_settings").select("*").eq("id", true).maybeSingle(),
        db.from("interviewers").select("*").order("sort_order"),
        db.from("interviewer_availability").select("*").order("weekday"),
        db.from("blocked_dates").select("*").order("blocked_on"),
      ]);
    return {
      settings,
      interviewers: interviewers ?? [],
      availability: availability ?? [],
      blocked: blocked ?? [],
    };
  });

const settingsSchema = z.object({
  timezone: z.string().min(3).max(60),
  duration_minutes: z.number().int().min(5).max(240),
  buffer_minutes: z.number().int().min(0).max(120),
  min_notice_hours: z.number().int().min(0).max(720),
  max_booking_days: z.number().int().min(1).max(180),
  max_per_slot: z.number().int().min(1).max(20),
  default_meeting_link: z.string().max(500),
  token_expiry_days: z.number().int().min(1).max(365),
  allow_reapply_days: z.number().int().min(0).max(730),
  assignment_mode: z.enum(["round_robin", "country"]),
  reminder_offsets_minutes: z.array(z.number().int().min(0).max(20160)).max(10),
  weekly_hours: z.record(z.string(), z.array(z.tuple([z.string(), z.string()]))),
  templates: z.record(z.string(), z.string()).optional(),
});

export const saveInterviewSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { db, email } = await requireAdmin(context.userId);
    const { error } = await db
      .from("interview_settings")
      .update({ ...data, templates: (data.templates ?? {}) as never })
      .eq("id", true);
    if (error) throw new Error(error.message);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "interview_settings_updated",
      entityType: "interview_settings",
      details: { timezone: data.timezone, duration_minutes: data.duration_minutes },
    });
    return { ok: true };
  });

/* -------------------------------- interviewers ------------------------------- */

export const upsertInterviewer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        full_name: z.string().min(2).max(120),
        email: z.string().email(),
        meeting_link: z.string().max(500).default(""),
        country_codes: z.array(z.string().max(4)).max(50).default([]),
        active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, email } = await requireAdmin(context.userId);
    const payload = data.id ? { ...data, id: data.id } : { ...data, id: undefined };
    const { error } = data.id
      ? await db.from("interviewers").update({ ...data, id: data.id }).eq("id", data.id)
      : await db.from("interviewers").insert({
          full_name: payload.full_name,
          email: payload.email,
          meeting_link: payload.meeting_link,
          country_codes: payload.country_codes,
          active: payload.active,
        });
    if (error) throw new Error(error.message);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: data.id ? "interviewer_updated" : "interviewer_created",
      entityType: "interviewer",
      entityId: data.id ?? null,
      details: { email: data.email, active: data.active },
    });
    return { ok: true };
  });

export const setInterviewerAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        interviewerId: z.string().uuid(),
        slots: z
          .array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              start_time: z.string().regex(/^\d{2}:\d{2}$/),
              end_time: z.string().regex(/^\d{2}:\d{2}$/),
            }),
          )
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireAdmin(context.userId);
    await db.from("interviewer_availability").delete().eq("interviewer_id", data.interviewerId);
    if (data.slots.length) {
      const { error } = await db
        .from("interviewer_availability")
        .insert(data.slots.map((s) => ({ ...s, interviewer_id: data.interviewerId })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const addBlockedDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        blocked_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reason: z.string().max(200).default(""),
        interviewer_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireAdmin(context.userId);
    const { error } = await db.from("blocked_dates").insert({
      blocked_on: data.blocked_on,
      reason: data.reason,
      interviewer_id: data.interviewer_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBlockedDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db } = await requireAdmin(context.userId);
    await db.from("blocked_dates").delete().eq("id", data.id);
    return { ok: true };
  });

/* -------------------------------- appointments ------------------------------- */

export const listAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.string().max(20).optional(),
        interviewerId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { db, allowedCountries } = await staffCtx(context.userId);
    let query = db
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, meeting_link, reschedule_count, candidate_timezone, interviewers(id, full_name), applications(id, full_name, email, country_code, city, city_other, status, interview_evaluations(id, status))",
      )
      .order("starts_at", { ascending: true })
      .limit(500);
    if (data.status) query = query.eq("status", data.status);
    if (data.interviewerId) query = query.eq("interviewer_id", data.interviewerId);
    if (data.from) query = query.gte("starts_at", data.from);
    if (data.to) query = query.lte("starts_at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.id);
    const { data: reminders } = ids.length
      ? await db.from("reminder_logs").select("appointment_id, status").in("appointment_id", ids)
      : { data: [] as Array<{ appointment_id: string; status: string }> };

    return (rows ?? [])
      .map((row) => {
        const interviewer = Array.isArray(row.interviewers) ? row.interviewers[0] : row.interviewers;
        const application = Array.isArray(row.applications) ? row.applications[0] : row.applications;
        const own = (reminders ?? []).filter((r) => r.appointment_id === row.id);
        return {
          id: row.id,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          status: row.status,
          meeting_link: row.meeting_link,
          reschedule_count: row.reschedule_count,
          candidate_timezone: row.candidate_timezone,
          interviewer: interviewer?.full_name ?? null,
          interviewer_id: interviewer?.id ?? null,
          candidate: application?.full_name ?? "",
          candidate_id: application?.id ?? "",
          country_code: application?.country_code ?? null,
          evaluation_status:
            ((application?.interview_evaluations ?? [])[0]?.status as string | undefined) ?? null,
          city: application?.city_other ?? application?.city ?? null,
          reminder_status: own.length
            ? `${own.filter((r) => r.status === "sent").length}/${own.length} sent`
            : "none",
        };
      })
      .filter((r) =>
        allowedCountries ? allowedCountries.includes(r.country_code ?? "") : true,
      );
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(APPOINTMENT_STATUSES) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, email, isViewer } = await staffCtx(context.userId);
    if (isViewer) throw new Error("Read-only access.");
    const { error } = await db
      .from("appointments")
      .update({
        status: data.status,
        ...(data.status === "Canceled" ? { canceled_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.status === "Canceled" || data.status === "Completed") {
      await db
        .from("reminder_logs")
        .update({ status: "skipped", provider_response: `appointment ${data.status}` })
        .eq("appointment_id", data.id)
        .eq("status", "pending");
    }
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "appointment_status_changed",
      entityType: "appointment",
      entityId: data.id,
      details: { status: data.status },
    });
    return { ok: true };
  });

export const sendManualReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, email, isViewer } = await staffCtx(context.userId);
    if (isViewer) throw new Error("Read-only access.");
    const { notifyBooking } = await import("./scheduling.server");
    const { data: appt } = await db
      .from("appointments")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!appt) throw new Error("Appointment not found.");
    if (appt.status === "Canceled" || appt.status === "Completed") {
      throw new Error("Canceled or completed interviews are never reminded.");
    }
    const result = await notifyBooking(data.id, "reminder");
    await db.from("reminder_logs").upsert(
      {
        appointment_id: data.id,
        channel: "email",
        kind: `manual-${Date.now()}`,
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        status: result.email?.status === "sent" ? "sent" : (result.email?.status ?? "failed"),
        provider_response: result.email?.detail ?? "",
        attempts: 1,
      },
      { onConflict: "appointment_id,channel,kind" },
    );
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "manual_reminder_sent",
      entityType: "appointment",
      entityId: data.id,
      details: { email: result.email?.status, whatsapp: result.whatsapp?.status ?? "not configured" },
    });
    return {
      email: result.email?.detail ?? "not sent",
      whatsapp: result.whatsapp?.detail ?? "WhatsApp not configured",
    };
  });

/* ------------------------------- eligibility --------------------------------- */

export const overrideEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().min(5).max(600),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { db, email, isViewer, allowedCountries } = await staffCtx(context.userId);
    if (isViewer) throw new Error("Read-only access.");
    const { data: app } = await db
      .from("applications")
      .select("country_code")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found.");
    if (allowedCountries && !allowedCountries.includes(app.country_code ?? "")) {
      throw new Error("You do not have access to this candidate.");
    }
    const { error } = await db
      .from("applications")
      .update({
        eligibility_override: data.approve,
        eligibility_note: data.note,
        eligibility_override_by: context.userId,
        eligibility_override_at: new Date().toISOString(),
        ...(data.approve ? { status: "Qualified" } : {}),
      })
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "eligibility_override",
      entityType: "application",
      entityId: data.applicationId,
      details: { approve: data.approve, note: data.note },
    });
    return { ok: true };
  });

/** Issues (or re-issues) the candidate's secure scheduling link and emails it. */
export const sendSchedulingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { db, email, isViewer, allowedCountries } = await staffCtx(context.userId);
    if (isViewer) throw new Error("Read-only access.");
    const { data: app } = await db
      .from("applications")
      .select("country_code")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("Application not found.");
    if (allowedCountries && !allowedCountries.includes(app.country_code ?? "")) {
      throw new Error("You do not have access to this candidate.");
    }
    const { sendSchedulingInvite } = await import("./scheduling.server");
    const result = await sendSchedulingInvite(data.applicationId);
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "scheduling_link_sent",
      entityType: "application",
      entityId: data.applicationId,
      details: { sent: result.sent },
    });
    return {
      sent: result.sent,
      url: "url" in result ? result.url : null,
      email: "email" in result ? result.email.detail : (result as { reason?: string }).reason,
    };
  });

/* --------------------------------- calendly ---------------------------------- */

/** Pulls Calendly bookings into the appointments list. Admin/recruiter only. */
export const syncCalendlyAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, email, isViewer } = await staffCtx(context.userId);
    if (isViewer) throw new Error("Read-only access.");
    const { calendlyConfigured, syncCalendly } = await import("./calendly.server");
    if (!calendlyConfigured()) throw new Error("Calendly is not connected yet.");
    const result = await syncCalendly({ sinceDays: 60 });
    await audit(db, {
      actorId: context.userId,
      actorEmail: email,
      action: "calendly_synced",
      entityType: "appointment",
      details: { ...result },
    });
    return result;
  });
