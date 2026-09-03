import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

/** Candidate-facing context for a scheduling link. Reveals nothing about others. */
export const getSchedulingContext = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const {
      resolveToken,
      candidateContext,
      getSettings,
      timezoneForCountry,
      appointmentDetails,
    } = await import("./scheduling.server");
    const { applicationId, client } = await resolveToken(data.token);
    const ctx = await candidateContext(applicationId);
    const settings = await getSettings();

    const { data: existing } = await client
      .from("appointments")
      .select("id")
      .eq("application_id", applicationId)
      .in("status", ["Scheduled", "Confirmed"])
      .maybeSingle();

    const appointment = existing ? await appointmentDetails(existing.id) : null;

    return {
      firstName: ctx.application.full_name.split(" ")[0] ?? ctx.application.full_name,
      eligible: ctx.eligible,
      organizationTimezone: settings.timezone,
      suggestedTimezone: timezoneForCountry(ctx.application.country_code),
      durationMinutes: settings.duration_minutes,
      allowReapplyDays: settings.allow_reapply_days,
      appointment: appointment
        ? {
            id: appointment.id,
            startsAt: appointment.starts_at,
            endsAt: appointment.ends_at,
            status: appointment.status,
            meetingLink: appointment.meeting_link,
            interviewer: appointment.interviewer?.full_name ?? null,
            candidateTimezone: appointment.candidate_timezone,
          }
        : null,
    };
  });

export const listSchedulingSlots = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveToken, candidateContext, availableSlots } = await import("./scheduling.server");
    const { applicationId } = await resolveToken(data.token);
    const ctx = await candidateContext(applicationId);
    // Eligibility is enforced on the server, never only hidden in the UI.
    if (!ctx.eligible) throw new Error("This account is not eligible to schedule an interview.");
    return availableSlots(ctx.application.country_code);
  });

export const bookInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    tokenSchema
      .extend({ startIso: z.string().min(10), timezone: z.string().min(3).max(60) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { resolveToken, candidateContext, bookSlot } = await import("./scheduling.server");
    const { applicationId } = await resolveToken(data.token);
    const ctx = await candidateContext(applicationId);
    if (!ctx.eligible) throw new Error("This account is not eligible to schedule an interview.");
    return bookSlot({
      applicationId,
      startIso: data.startIso,
      candidateTimezone: data.timezone,
      countryCode: ctx.application.country_code,
    });
  });

export const cancelInterview = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.extend({ reason: z.string().max(400).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { resolveToken, notifyBooking } = await import("./scheduling.server");
    const { applicationId, client } = await resolveToken(data.token);
    const { data: appt } = await client
      .from("appointments")
      .select("id")
      .eq("application_id", applicationId)
      .in("status", ["Scheduled", "Confirmed"])
      .maybeSingle();
    if (!appt) throw new Error("There is no active interview to cancel.");
    await client
      .from("appointments")
      .update({
        status: "Canceled",
        canceled_at: new Date().toISOString(),
        notes: data.reason ?? null,
      })
      .eq("id", appt.id);
    await client
      .from("reminder_logs")
      .update({ status: "skipped", provider_response: "appointment canceled" })
      .eq("appointment_id", appt.id)
      .eq("status", "pending");
    await notifyBooking(appt.id, "canceled");
    return { ok: true };
  });
