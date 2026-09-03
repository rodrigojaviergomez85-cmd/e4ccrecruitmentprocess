/** Server-only scheduling core: settings, slots, tokens, booking, notifications. */
import {
  ACTIVE_APPOINTMENT_STATUSES,
  COUNTRY_TIMEZONES,
  formatInTz,
  isSchedulingEligible,
  parseHm,
  zonedDateKey,
  zonedToUtcMs,
  zonedWeekday,
  type InterviewSettings,
  type WeeklyHours,
} from "./interviews";
import { baseUrl, sendEmail, sendWhatsApp, whatsappConfigured } from "./notify.server";

export async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getSettings(): Promise<InterviewSettings> {
  const client = await db();
  const { data } = await client.from("interview_settings").select("*").eq("id", true).maybeSingle();
  if (!data) throw new Error("Interview settings are not configured yet.");
  return {
    timezone: data.timezone,
    duration_minutes: data.duration_minutes,
    buffer_minutes: data.buffer_minutes,
    min_notice_hours: data.min_notice_hours,
    max_booking_days: data.max_booking_days,
    max_per_slot: data.max_per_slot,
    weekly_hours: (data.weekly_hours ?? {}) as WeeklyHours,
    default_meeting_link: data.default_meeting_link,
    reminder_offsets_minutes: data.reminder_offsets_minutes ?? [1440, 60],
    token_expiry_days: data.token_expiry_days,
    allow_reapply_days: data.allow_reapply_days,
    assignment_mode: data.assignment_mode as InterviewSettings["assignment_mode"],
    templates: (data.templates ?? {}) as Record<string, unknown>,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function randomToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("base64url");
}

/** Issues a fresh scheduling token; only its hash is stored. */
export async function issueSchedulingToken(applicationId: string): Promise<string> {
  const client = await db();
  const settings = await getSettings();
  const token = await randomToken();
  const hash = await sha256Hex(token);
  const expires = new Date(Date.now() + settings.token_expiry_days * 86400000).toISOString();
  const { error } = await client
    .from("scheduling_tokens")
    .insert({ application_id: applicationId, token_hash: hash, expires_at: expires });
  if (error) throw new Error(error.message);
  return token;
}

export function schedulingUrl(token: string): string {
  return `${baseUrl()}/schedule/${token}`;
}

/** Resolves a raw token to its application, or throws. Reveals nothing else. */
export async function resolveToken(token: string) {
  const client = await db();
  const hash = await sha256Hex(token);
  const { data } = await client
    .from("scheduling_tokens")
    .select("id, application_id, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) throw new Error("This scheduling link is not valid.");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("This scheduling link has expired. Please contact our recruitment team.");
  }
  return { client, applicationId: data.application_id, tokenId: data.id };
}

export type CandidateContext = {
  application: {
    id: string;
    full_name: string;
    email: string;
    phone_e164: string | null;
    country_code: string | null;
    contact_consent: boolean;
    status: string;
  };
  cefr: string | null;
  eligible: boolean;
};

export async function candidateContext(applicationId: string): Promise<CandidateContext> {
  const client = await db();
  const { data: app, error } = await client
    .from("applications")
    .select(
      "id, full_name, email, phone_e164, phone, country_code, contact_consent, status, eligibility_override, ai_evaluations(cefr)",
    )
    .eq("id", applicationId)
    .single();
  if (error || !app) throw new Error("Application not found.");
  const evaluation = Array.isArray(app.ai_evaluations) ? app.ai_evaluations[0] : app.ai_evaluations;
  const cefr = evaluation?.cefr ?? null;
  const eligible =
    app.eligibility_override === true
      ? true
      : app.eligibility_override === false
        ? false
        : isSchedulingEligible(cefr);
  return {
    application: {
      id: app.id,
      full_name: app.full_name,
      email: app.email,
      phone_e164: app.phone_e164 ?? app.phone ?? null,
      country_code: app.country_code,
      contact_consent: app.contact_consent,
      status: app.status,
    },
    cefr,
    eligible,
  };
}

export type Slot = { startIso: string; endIso: string };

/** Available slots, computed in the organization timezone and returned in UTC. */
export async function availableSlots(countryCode: string | null): Promise<Slot[]> {
  const client = await db();
  const settings = await getSettings();
  const tz = settings.timezone;
  const step = settings.duration_minutes + settings.buffer_minutes;
  const now = Date.now();
  const earliest = now + settings.min_notice_hours * 3600000;
  const latest = now + settings.max_booking_days * 86400000;

  const [{ data: interviewers }, { data: availability }, { data: blocked }, { data: booked }] =
    await Promise.all([
      client.from("interviewers").select("id, country_codes").eq("active", true),
      client.from("interviewer_availability").select("interviewer_id, weekday, start_time, end_time"),
      client.from("blocked_dates").select("interviewer_id, blocked_on"),
      client
        .from("appointments")
        .select("interviewer_id, starts_at")
        .in("status", ACTIVE_APPOINTMENT_STATUSES)
        .gte("starts_at", new Date(now).toISOString()),
    ]);

  const pool = (interviewers ?? []).filter((i) =>
    settings.assignment_mode === "country" && countryCode
      ? i.country_codes.length === 0 || i.country_codes.includes(countryCode)
      : true,
  );
  if (pool.length === 0) return [];

  const blockedAll = new Set(
    (blocked ?? []).filter((b) => !b.interviewer_id).map((b) => b.blocked_on),
  );
  const bookedCount = new Map<string, number>();
  for (const b of booked ?? []) {
    const key = new Date(b.starts_at).toISOString();
    bookedCount.set(key, (bookedCount.get(key) ?? 0) + 1);
  }

  const slots: Slot[] = [];
  for (let dayOffset = 0; dayOffset <= settings.max_booking_days; dayOffset += 1) {
    const dayAnchor = now + dayOffset * 86400000;
    const dateKey = zonedDateKey(tz, dayAnchor);
    if (blockedAll.has(dateKey)) continue;
    const weekday = zonedWeekday(tz, dayAnchor);
    const ranges = settings.weekly_hours[String(weekday)] ?? [];
    const [y, m, d] = dateKey.split("-").map(Number);

    for (const [from, to] of ranges) {
      const [fh, fm] = parseHm(from);
      const [th, tm] = parseHm(to);
      const startMs = zonedToUtcMs(tz, y!, m!, d!, fh, fm);
      const endMs = zonedToUtcMs(tz, y!, m!, d!, th, tm);
      for (let t = startMs; t + settings.duration_minutes * 60000 <= endMs; t += step * 60000) {
        if (t < earliest || t > latest) continue;
        const iso = new Date(t).toISOString();
        const capacity = Math.min(pool.length, Math.max(1, settings.max_per_slot) * pool.length);
        const freeInterviewers = pool.filter((i) =>
          interviewerFree(i.id, t, availability ?? [], blocked ?? [], booked ?? [], tz, settings),
        ).length;
        if (freeInterviewers === 0) continue;
        if ((bookedCount.get(iso) ?? 0) >= capacity) continue;
        slots.push({
          startIso: iso,
          endIso: new Date(t + settings.duration_minutes * 60000).toISOString(),
        });
      }
    }
  }
  return slots.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

type AvailabilityRow = {
  interviewer_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};
type BlockedRow = { interviewer_id: string | null; blocked_on: string };
type BookedRow = { interviewer_id: string | null; starts_at: string };

function interviewerFree(
  interviewerId: string,
  startMs: number,
  availability: AvailabilityRow[],
  blocked: BlockedRow[],
  booked: BookedRow[],
  tz: string,
  settings: InterviewSettings,
): boolean {
  const dateKey = zonedDateKey(tz, startMs);
  if (blocked.some((b) => b.interviewer_id === interviewerId && b.blocked_on === dateKey))
    return false;

  const own = availability.filter((a) => a.interviewer_id === interviewerId);
  if (own.length > 0) {
    const weekday = zonedWeekday(tz, startMs);
    const [y, m, d] = dateKey.split("-").map(Number);
    const fits = own.some((a) => {
      if (a.weekday !== weekday) return false;
      const [sh, sm] = parseHm(a.start_time);
      const [eh, em] = parseHm(a.end_time);
      return (
        startMs >= zonedToUtcMs(tz, y!, m!, d!, sh, sm) &&
        startMs + settings.duration_minutes * 60000 <= zonedToUtcMs(tz, y!, m!, d!, eh, em)
      );
    });
    if (!fits) return false;
  }

  const iso = new Date(startMs).toISOString();
  const taken = booked.filter(
    (b) => b.interviewer_id === interviewerId && new Date(b.starts_at).toISOString() === iso,
  ).length;
  return taken < Math.max(1, settings.max_per_slot);
}

/** Picks an interviewer for a slot: country rules first, then fewest upcoming interviews. */
export async function pickInterviewer(startIso: string, countryCode: string | null) {
  const client = await db();
  const settings = await getSettings();
  const [{ data: interviewers }, { data: availability }, { data: blocked }, { data: booked }] =
    await Promise.all([
      client.from("interviewers").select("id, full_name, email, meeting_link, country_codes").eq("active", true),
      client.from("interviewer_availability").select("interviewer_id, weekday, start_time, end_time"),
      client.from("blocked_dates").select("interviewer_id, blocked_on"),
      client
        .from("appointments")
        .select("interviewer_id, starts_at")
        .in("status", ACTIVE_APPOINTMENT_STATUSES),
    ]);

  const startMs = new Date(startIso).getTime();
  const candidates = (interviewers ?? [])
    .filter((i) =>
      settings.assignment_mode === "country" && countryCode
        ? i.country_codes.length === 0 || i.country_codes.includes(countryCode)
        : true,
    )
    .filter((i) =>
      interviewerFree(
        i.id,
        startMs,
        availability ?? [],
        blocked ?? [],
        booked ?? [],
        settings.timezone,
        settings,
      ),
    );
  if (candidates.length === 0) return null;

  const load = new Map<string, number>();
  for (const b of booked ?? []) {
    if (b.interviewer_id) load.set(b.interviewer_id, (load.get(b.interviewer_id) ?? 0) + 1);
  }
  const preferred = candidates.filter(
    (i) => countryCode && i.country_codes.includes(countryCode),
  );
  const list = preferred.length > 0 ? preferred : candidates;
  return list.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!;
}

export function timezoneForCountry(countryCode: string | null | undefined): string {
  return COUNTRY_TIMEZONES[countryCode ?? ""] ?? "America/El_Salvador";
}

/** Books a slot transactionally; the DB unique index decides the winner. */
export async function bookSlot(opts: {
  applicationId: string;
  startIso: string;
  candidateTimezone: string;
  countryCode: string | null;
}) {
  const client = await db();
  const settings = await getSettings();
  const start = new Date(opts.startIso);
  const slots = await availableSlots(opts.countryCode);
  if (!slots.some((s) => s.startIso === start.toISOString())) {
    throw new Error("That time is no longer available. Please pick another slot.");
  }
  const interviewer = await pickInterviewer(start.toISOString(), opts.countryCode);
  if (!interviewer) throw new Error("That time is no longer available. Please pick another slot.");
  const endIso = new Date(start.getTime() + settings.duration_minutes * 60000).toISOString();
  const meetingLink = interviewer.meeting_link || settings.default_meeting_link;

  const { data: previous } = await client
    .from("appointments")
    .select("id, reschedule_count")
    .eq("application_id", opts.applicationId)
    .in("status", ACTIVE_APPOINTMENT_STATUSES)
    .maybeSingle();

  const { data: newId, error } = await client.rpc("book_appointment", {
    _application_id: opts.applicationId,
    _interviewer_id: interviewer.id,
    _starts_at: start.toISOString(),
    _ends_at: endIso,
    _candidate_timezone: opts.candidateTimezone,
    _meeting_link: meetingLink,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error("Someone just booked that time. Please pick another slot.");
    }
    throw new Error(error.message);
  }

  if (previous) {
    await client
      .from("appointments")
      .update({ reschedule_count: (previous.reschedule_count ?? 0) + 1 })
      .eq("id", newId as string);
  }

  await client
    .from("applications")
    .update({ status: "Interview" })
    .eq("id", opts.applicationId);

  await scheduleReminders(newId as string);
  await notifyBooking(newId as string, "booked");
  return { appointmentId: newId as string };
}

/** Creates the pending reminder rows (idempotent through a unique index). */
export async function scheduleReminders(appointmentId: string) {
  const client = await db();
  const settings = await getSettings();
  const { data: appt } = await client
    .from("appointments")
    .select("starts_at")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return;
  const start = new Date(appt.starts_at).getTime();
  const rows = settings.reminder_offsets_minutes.map((offset) => ({
    appointment_id: appointmentId,
    channel: "email",
    kind: `t-${offset}`,
    scheduled_for: new Date(start - offset * 60000).toISOString(),
    status: "pending",
  }));
  if (whatsappConfigured()) {
    rows.push(
      ...settings.reminder_offsets_minutes.map((offset) => ({
        appointment_id: appointmentId,
        channel: "whatsapp",
        kind: `t-${offset}`,
        scheduled_for: new Date(start - offset * 60000).toISOString(),
        status: "pending",
      })),
    );
  }
  if (rows.length) {
    await client
      .from("reminder_logs")
      .upsert(rows, { onConflict: "appointment_id,channel,kind", ignoreDuplicates: true });
  }
}

export async function appointmentDetails(appointmentId: string) {
  const client = await db();
  const { data } = await client
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, candidate_timezone, meeting_link, reschedule_count, application_id, interviewers(full_name, email), applications(full_name, email, phone_e164, contact_consent, country_code)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (!data) return null;
  const interviewer = Array.isArray(data.interviewers) ? data.interviewers[0] : data.interviewers;
  const application = Array.isArray(data.applications) ? data.applications[0] : data.applications;
  return { ...data, interviewer, application };
}

export type NotifyKind = "booked" | "rescheduled" | "canceled" | "reminder";

export async function notifyBooking(appointmentId: string, kind: NotifyKind, reminderKind?: string) {
  const client = await db();
  const settings = await getSettings();
  const details = await appointmentDetails(appointmentId);
  if (!details?.application) return { email: null, whatsapp: null };

  const orgTime = formatInTz(details.starts_at, settings.timezone);
  const localTime = formatInTz(details.starts_at, details.candidate_timezone);
  const heading =
    kind === "canceled"
      ? "Your E4CC interview was canceled"
      : kind === "rescheduled"
        ? "Your E4CC interview was rescheduled"
        : kind === "reminder"
          ? "Reminder: your E4CC interview"
          : "Your E4CC interview is confirmed";

  const body = `
    <p>Hi ${escapeHtml(details.application.full_name)},</p>
    <p>${escapeHtml(heading)}.</p>
    <ul>
      <li><strong>Your time:</strong> ${escapeHtml(localTime)}</li>
      <li><strong>Our time:</strong> ${escapeHtml(orgTime)}</li>
      <li><strong>Interviewer:</strong> ${escapeHtml(details.interviewer?.full_name ?? "To be assigned")}</li>
      ${details.meeting_link ? `<li><strong>Meeting link:</strong> <a href="${escapeHtml(details.meeting_link)}">${escapeHtml(details.meeting_link)}</a></li>` : ""}
    </ul>
    <p>E4CC Recruitment</p>`;

  const emailResult = await sendEmail({
    to: details.application.email,
    subject: heading,
    html: body,
  });

  let whatsappResult = null;
  if (details.application.contact_consent && details.application.phone_e164) {
    whatsappResult = await sendWhatsApp({
      to: details.application.phone_e164,
      body: `${heading}. ${localTime} (your time) / ${orgTime} (E4CC time).${details.meeting_link ? ` Link: ${details.meeting_link}` : ""}`,
    });
  }

  // Notify the assigned interviewer / recruiting inbox.
  if (details.interviewer?.email) {
    await sendEmail({
      to: details.interviewer.email,
      subject: `${heading} — ${details.application.full_name}`,
      html: body,
    });
  }

  if (kind === "reminder" && reminderKind) {
    await client
      .from("reminder_logs")
      .update({
        status: emailResult.status === "sent" ? "sent" : emailResult.status,
        sent_at: new Date().toISOString(),
        provider_response: emailResult.detail,
      })
      .eq("appointment_id", appointmentId)
      .eq("channel", "email")
      .eq("kind", reminderKind);
  }

  return { email: emailResult, whatsapp: whatsappResult };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sends the qualification email with a fresh scheduling link. */
export async function sendSchedulingInvite(applicationId: string) {
  const ctx = await candidateContext(applicationId);
  if (!ctx.eligible) return { sent: false, reason: "Candidate is not eligible to schedule." };
  const token = await issueSchedulingToken(applicationId);
  const url = schedulingUrl(token);
  const html = `
    <p>Hi ${escapeHtml(ctx.application.full_name)},</p>
    <p>Congratulations! Your English assessment qualifies you for an interview with E4CC.</p>
    <p><a href="${url}">Schedule your interview</a></p>
    <p>E4CC Recruitment</p>`;
  const email = await sendEmail({
    to: ctx.application.email,
    subject: "Congratulations — schedule your E4CC interview",
    html,
  });
  let whatsapp = null;
  if (ctx.application.contact_consent && ctx.application.phone_e164) {
    whatsapp = await sendWhatsApp({
      to: ctx.application.phone_e164,
      body: `Congratulations! Schedule your E4CC interview here: ${url}`,
    });
  }
  return { sent: true, url, email, whatsapp };
}
