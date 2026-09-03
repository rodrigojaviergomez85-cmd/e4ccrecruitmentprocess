import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled reminder dispatcher. Idempotent: each reminder row is unique per
 * appointment/channel/kind and is only sent once. Canceled and completed
 * interviews are never reminded.
 */
export const Route = createFileRoute("/api/public/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { db, notifyBooking } = await import("@/lib/scheduling.server");
        const { sendWhatsApp, whatsappConfigured } = await import("@/lib/notify.server");
        const client = await db();

        const { data: due } = await client
          .from("reminder_logs")
          .select(
            "id, appointment_id, channel, kind, attempts, appointments(status, starts_at, candidate_timezone, meeting_link, applications(full_name, phone_e164, contact_consent))",
          )
          .eq("status", "pending")
          .lte("scheduled_for", new Date().toISOString())
          .lt("attempts", 5)
          .limit(100);

        let sent = 0;
        let skipped = 0;
        let failed = 0;

        for (const row of due ?? []) {
          const appt = Array.isArray(row.appointments) ? row.appointments[0] : row.appointments;
          if (!appt || appt.status === "Canceled" || appt.status === "Completed") {
            await client
              .from("reminder_logs")
              .update({ status: "skipped", provider_response: "appointment not active" })
              .eq("id", row.id);
            skipped += 1;
            continue;
          }
          if (new Date(appt.starts_at).getTime() < Date.now()) {
            await client
              .from("reminder_logs")
              .update({ status: "skipped", provider_response: "interview already started" })
              .eq("id", row.id);
            skipped += 1;
            continue;
          }

          if (row.channel === "email") {
            const result = await notifyBooking(row.appointment_id, "reminder", row.kind);
            if (result.email?.status === "sent") sent += 1;
            else failed += 1;
            continue;
          }

          if (!whatsappConfigured()) {
            await client
              .from("reminder_logs")
              .update({ status: "skipped", provider_response: "WhatsApp not configured" })
              .eq("id", row.id);
            skipped += 1;
            continue;
          }

          const application = Array.isArray(appt.applications)
            ? appt.applications[0]
            : appt.applications;
          if (!application?.contact_consent || !application.phone_e164) {
            await client
              .from("reminder_logs")
              .update({ status: "skipped", provider_response: "no consent or phone" })
              .eq("id", row.id);
            skipped += 1;
            continue;
          }

          const when = new Intl.DateTimeFormat("en-US", {
            timeZone: appt.candidate_timezone,
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(appt.starts_at));
          const result = await sendWhatsApp({
            to: application.phone_e164,
            body: `Reminder: your E4CC interview is on ${when}.${appt.meeting_link ? ` Link: ${appt.meeting_link}` : ""}`,
          });
          await client
            .from("reminder_logs")
            .update({
              status: result.status === "sent" ? "sent" : "failed",
              sent_at: result.ok ? new Date().toISOString() : null,
              attempts: (row.attempts ?? 0) + 1,
              provider_response: result.detail,
            })
            .eq("id", row.id);
          if (result.ok) sent += 1;
          else failed += 1;
        }

        return Response.json({ processed: (due ?? []).length, sent, skipped, failed });
      },
    },
  },
});
