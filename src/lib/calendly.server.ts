/**
 * Calendly sync (server only).
 *
 * Candidates book their live interview through the Calendly embed on the
 * recruitment-process page. This module pulls those bookings back into the
 * `appointments` table so recruiters see them in the interviews list and in the
 * evaluation queue. Bookings are matched to applications by invitee email.
 */

const API = "https://api.calendly.com";

type CalendlyEvent = {
  uri: string;
  name?: string | null;
  status: string;
  start_time: string;
  end_time: string;
  location?: { join_url?: string | null; location?: string | null; type?: string | null } | null;
};

type CalendlyInvitee = {
  uri: string;
  email: string;
  name?: string | null;
  timezone?: string | null;
  status: string;
  cancel_url?: string | null;
  reschedule_url?: string | null;
};

function token() {
  const value = process.env["CALENDLY_API_TOKEN"];
  if (!value) throw new Error("Calendly is not connected yet.");
  return value;
}

async function call<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Calendly request failed [${response.status}]: ${body}`);
  }
  return (await response.json()) as T;
}

export function calendlyConfigured() {
  return Boolean(process.env["CALENDLY_API_TOKEN"]);
}

async function currentUser() {
  const me = await call<{ resource: { uri: string; current_organization: string } }>("/users/me");
  return me.resource;
}

/** Meeting link for a Calendly event, falling back to the physical location. */
function meetingLink(event: CalendlyEvent) {
  return event.location?.join_url ?? event.location?.location ?? "See Calendly confirmation email";
}

async function inviteesFor(eventUri: string) {
  const result = await call<{ collection: CalendlyInvitee[] }>(
    `${eventUri}/invitees?count=100`,
  );
  return result.collection ?? [];
}

type SyncOptions = {
  /** Only sync bookings for this application (candidate-side, right after booking). */
  applicationId?: string;
  /** How far back to look for events. Defaults to 30 days. */
  sinceDays?: number;
};

export type CalendlySyncResult = {
  scanned: number;
  created: number;
  updated: number;
  unmatched: string[];
};

export async function syncCalendly(options: SyncOptions = {}): Promise<CalendlySyncResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const user = await currentUser();
  const since = new Date(Date.now() - (options.sinceDays ?? 30) * 86400000).toISOString();

  const events: CalendlyEvent[] = [];
  let next: string | null =
    `/scheduled_events?user=${encodeURIComponent(user.uri)}&count=100&min_start_time=${since}&sort=start_time:asc`;
  while (next && events.length < 500) {
    const page: { collection: CalendlyEvent[]; pagination: { next_page: string | null } } =
      await call(next);
    events.push(...(page.collection ?? []));
    next = page.pagination?.next_page ?? null;
  }

  const result: CalendlySyncResult = { scanned: events.length, created: 0, updated: 0, unmatched: [] };

  for (const event of events) {
    const invitees = await inviteesFor(event.uri);
    for (const invitee of invitees) {
      const email = (invitee.email ?? "").trim().toLowerCase();
      if (!email) continue;

      const { data: application } = await db
        .from("applications")
        .select("id, country_code")
        .ilike("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!application) {
        if (!result.unmatched.includes(email)) result.unmatched.push(email);
        continue;
      }
      if (options.applicationId && application.id !== options.applicationId) continue;

      const canceled = event.status === "canceled" || invitee.status === "canceled";
      const marker = `calendly:${event.uri}`;
      const { data: existing } = await db
        .from("appointments")
        .select("id, status, starts_at, notes")
        .eq("calendly_invitee_uri", invitee.uri)
        .maybeSingle();

      const payload = {
        application_id: application.id,
        starts_at: event.start_time,
        ends_at: event.end_time,
        status: canceled ? "Canceled" : "Scheduled",
        candidate_timezone: invitee.timezone ?? "UTC",
        meeting_link: meetingLink(event),
        notes: marker,
        calendly_event_uri: event.uri,
        calendly_invitee_uri: invitee.uri,
        canceled_at: canceled ? new Date().toISOString() : (null as string | null),
      };

      if (existing) {
        const changed =
          existing.starts_at !== payload.starts_at || existing.status !== payload.status;
        if (changed) {
          await db.from("appointments").update(payload).eq("id", existing.id);
          result.updated += 1;
        }
      } else {
        const { data: appointment, error } = await db.from("appointments").insert(payload).select("id").single();
        if (error) throw new Error(error.message);
        result.created += 1;
        await db
          .from("recruitment_progress")
          .update({ scheduling_status: "Interview scheduled" })
          .eq("application_id", application.id);
        if (!canceled) {
          const { data: progress } = await db
            .from("recruitment_progress")
            .select("work_modality")
            .eq("application_id", application.id)
            .maybeSingle();
          const { data: candidate } = await db
            .from("applications")
            .select("full_name, email, status")
            .eq("id", application.id)
            .single();
          // A retake booking keeps its own pipeline label in the dashboard.
          if (candidate && (candidate.status ?? "").startsWith("Retake")) {
            await db
              .from("applications")
              .update({ status: "Scheduled – Retake" })
              .eq("id", application.id);
          }
          if (candidate) {
            const formatter = (options: Intl.DateTimeFormatOptions) =>
              new Intl.DateTimeFormat("en-US", { timeZone: invitee.timezone ?? "UTC", ...options }).format(new Date(event.start_time));
            const { buildPreparationEmail } = await import("./candidate-emails");
            const { sendEmail } = await import("./notify.server");
            const message = buildPreparationEmail({
              fullName: candidate.full_name,
              interviewDate: formatter({ weekday: "long", year: "numeric", month: "long", day: "numeric" }),
              interviewTime: formatter({ hour: "numeric", minute: "2-digit" }),
              timezone: invitee.timezone ?? "UTC",
              modality: progress?.work_modality === "onsite" ? "onsite" : "online",
            });
            const delivery = await sendEmail({
              to: candidate.email,
              ...message,
              candidateName: candidate.full_name,
              result: "preparation",
            });
            await db.from("candidate_emails").insert({
              application_id: application.id,
              kind: "preparation",
              to_email: candidate.email,
              subject: message.subject,
              body: message.html,
              status: delivery.ok ? "sent" : "failed",
              error_message: delivery.ok ? null : delivery.detail,
              http_status: delivery.httpStatus ?? null,
              response_message: delivery.detail,
            });
            if (!delivery.ok) console.error(`Preparation email failed for appointment ${appointment.id}: ${delivery.detail}`);
          }
        }
      }
    }
  }

  return result;
}
