/**
 * Calendly sync (server only).
 *
 * Candidates book their live interview through Calendly (group event types, so
 * one event can hold up to 10 invitees). This module pulls EVERY invitee of every
 * event back into `appointments` — one row per invitee, keyed by the Calendly
 * invitee URI — so recruiters see each person in Interviews. Invitees are matched
 * to applications by normalized email; when none exists a minimal record is
 * created (no screening required).
 */

const API = "https://api.calendly.com";

type CalendlyEvent = {
  uri: string;
  name?: string | null;
  status: string;
  start_time: string;
  end_time: string;
  event_type?: string | null;
  location?: { join_url?: string | null; location?: string | null; type?: string | null } | null;
  event_memberships?: { user_name?: string | null; user_email?: string | null }[] | null;
  invitees_counter?: { active?: number; total?: number; limit?: number } | null;
};

type CalendlyInvitee = {
  uri: string;
  email: string;
  name?: string | null;
  timezone?: string | null;
  status: string;
  rescheduled?: boolean | null;
};

function token() {
  const value = process.env["CALENDLY_API_TOKEN"];
  if (!value) throw new Error("Calendly is not connected (the Calendly token is missing).");
  return value;
}

async function call<T>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${API}${path}`;
  // Calendly rate-limits bursts (429): respect Retry-After and back off; retry 5xx too.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    });
    if (response.ok) return (await response.json()) as T;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 5) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : Math.min(1000 * 2 ** attempt, 10000);
      await response.body?.cancel();
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const body = await response.text();
    throw new Error(`Calendly request failed [${response.status}]: ${body.slice(0, 300) || response.statusText}`);
  }
}

export function calendlyConfigured() {
  return Boolean(process.env["CALENDLY_API_TOKEN"]);
}

/** Meeting link for a Calendly event, falling back to the physical location. */
function meetingLink(event: CalendlyEvent) {
  return event.location?.join_url ?? event.location?.location ?? "See Calendly confirmation email";
}

/** All invitees of one event (active and canceled), following pagination. */
async function inviteesFor(eventUri: string) {
  const all: CalendlyInvitee[] = [];
  let next: string | null = `${eventUri}/invitees?count=100`;
  while (next) {
    const page: { collection: CalendlyInvitee[]; pagination?: { next_page: string | null } } = await call(next);
    all.push(...(page.collection ?? []));
    next = page.pagination?.next_page ?? null;
  }
  return all;
}

/** Runs async work over items with a small concurrency cap. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const i = index++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

type SyncOptions = {
  /** Only sync bookings for this application. */
  applicationId?: string;
  /** How far back to look for events. Defaults to 30 days. Future events are always included. */
  sinceDays?: number;
  /** Send the preparation email for new bookings (webhook only). Defaults to false. */
  sendEmails?: boolean;
  /** Create a minimal candidate record when no application matches the email. Defaults to true. */
  createMissing?: boolean;
};

export type CalendlySyncResult = {
  account: string;
  eventTypes: string[];
  rangeFrom: string;
  scanned: number;
  invitees: number;
  activeInvitees: number;
  created: number;
  updated: number;
  candidatesCreated: number;
  unmatched: string[];
};

export async function syncCalendly(options: SyncOptions = {}): Promise<CalendlySyncResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const attemptAt = new Date().toISOString();
  // Candidate-scoped syncs do not overwrite the global sync status shown to staff.
  if (options.applicationId) return runSync(db, options);
  try {
    const result = await runSync(db, options);
    await db
      .from("interview_settings")
      .update({
        calendly_last_synced_at: new Date().toISOString(),
        calendly_last_attempt_at: attemptAt,
        calendly_last_sync_result: result as never,
        calendly_last_sync_error: null,
      })
      .eq("id", true);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("interview_settings")
      .update({ calendly_last_attempt_at: attemptAt, calendly_last_sync_error: message })
      .eq("id", true);
    throw e;
  }
}

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function runSync(db: Db, options: SyncOptions): Promise<CalendlySyncResult> {
  const me = await call<{ resource: { uri: string; name?: string | null; current_organization: string } }>("/users/me");
  const user = me.resource;
  const since = new Date(Date.now() - (options.sinceDays ?? 30) * 86400000).toISOString();

  const types = await call<{ collection: { name: string; active: boolean }[] }>(
    `/event_types?user=${encodeURIComponent(user.uri)}&count=100`,
  ).catch(() => ({ collection: [] }));

  const events: CalendlyEvent[] = [];
  let next: string | null =
    `/scheduled_events?user=${encodeURIComponent(user.uri)}&count=100&min_start_time=${since}&sort=start_time:asc`;
  while (next && events.length < 1000) {
    const page: { collection: CalendlyEvent[]; pagination: { next_page: string | null } } = await call(next);
    events.push(...(page.collection ?? []));
    next = page.pagination?.next_page ?? null;
  }

  const result: CalendlySyncResult = {
    account: user.name ?? "Calendly account",
    eventTypes: (types.collection ?? []).filter((t) => t.active).map((t) => t.name),
    rangeFrom: since,
    scanned: events.length,
    invitees: 0,
    activeInvitees: 0,
    created: 0,
    updated: 0,
    candidatesCreated: 0,
    unmatched: [],
  };

  // Calendly API: fetch invitees in parallel (one request per event).
  const perEvent = await mapLimit(events, 4, async (event) => ({ event, invitees: await inviteesFor(event.uri) }));

  // Existing appointments for these invitees, in one pass.
  const inviteeUris = perEvent.flatMap((p) => p.invitees.map((i) => i.uri));
  const existingByUri = new Map<
    string,
    { id: string; application_id: string; status: string; starts_at: string; notes: string | null; meeting_link: string; calendly_event_name: string | null }
  >();
  for (let i = 0; i < inviteeUris.length; i += 100) {
    const chunk = inviteeUris.slice(i, i + 100);
    const { data, error } = await db
      .from("appointments")
      .select("id, application_id, status, starts_at, notes, meeting_link, calendly_event_name, calendly_invitee_uri")
      .in("calendly_invitee_uri", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.calendly_invitee_uri) existingByUri.set(row.calendly_invitee_uri, row);
  }

  for (const { event, invitees } of perEvent) {
    for (const invitee of invitees) {
      const email = (invitee.email ?? "").trim().toLowerCase();
      if (!email) continue;
      result.invitees += 1;
      const canceled = event.status === "canceled" || invitee.status === "canceled";
      if (!canceled) result.activeInvitees += 1;

      const existing = existingByUri.get(invitee.uri);
      const marker = `calendly:${event.uri}`;
      const payloadBase = {
        starts_at: event.start_time,
        ends_at: event.end_time,
        status: canceled ? (invitee.rescheduled ? "Rescheduled" : "Canceled") : "Scheduled",
        candidate_timezone: invitee.timezone ?? "UTC",
        meeting_link: meetingLink(event),
        calendly_event_uri: event.uri,
        calendly_invitee_uri: invitee.uri,
        calendly_event_name: event.name ?? null,
        calendly_host_name:
          (event.event_memberships ?? []).map((m) => m.user_name || m.user_email).filter(Boolean).join(", ") || null,
      };

      if (existing) {
        if (options.applicationId && existing.application_id !== options.applicationId) continue;
        // Staff outcomes (No-show, Completed…) are kept unless Calendly canceled the booking.
        const syncable = ["Scheduled", "Confirmed", "Canceled", "Rescheduled"].includes(existing.status);
        const status = syncable || canceled ? payloadBase.status : existing.status;
        // "Confirmed" set by staff stays while the booking is still active.
        const finalStatus = existing.status === "Confirmed" && status === "Scheduled" ? "Confirmed" : status;
        const changed =
          new Date(existing.starts_at).getTime() !== new Date(payloadBase.starts_at).getTime() ||
          existing.status !== finalStatus ||
          existing.meeting_link !== payloadBase.meeting_link ||
          existing.calendly_event_name !== payloadBase.calendly_event_name;
        if (changed) {
          const { error } = await db
            .from("appointments")
            .update({
              ...payloadBase,
              status: finalStatus,
              notes: existing.notes ?? marker,
              canceled_at: canceled ? new Date().toISOString() : null,
            })
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          result.updated += 1;
        }
        continue;
      }

      // New invitee: link by normalized email, or create a minimal record.
      const { data: found } = await db
        .from("applications")
        .select("id, status")
        .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let application = found;
      let createdFromCalendly = false;
      if (!application) {
        if (options.applicationId || options.createMissing === false) {
          if (!result.unmatched.includes(email)) result.unmatched.push(email);
          continue;
        }
        const { data: created, error: createError } = await db
          .from("applications")
          .insert({
            full_name: (invitee.name ?? "").trim() || email,
            email,
            phone: "",
            country: "",
            city: "",
            teaching_experience: "",
            taught_children: null,
            source: "calendly",
          })
          .select("id, status")
          .single();
        if (createError) throw new Error(createError.message);
        application = created;
        createdFromCalendly = true;
        result.candidatesCreated += 1;
      }
      if (options.applicationId && application.id !== options.applicationId) continue;

      // Candidates approved for (or returning to) the Manager final filter book that stage.
      const currentStatus = application.status ?? "";
      const managerStage = [
        "Pending Second Filter",
        "No Show – Manager Final Filter",
        "Manager Retake – Email Sent",
      ].includes(currentStatus);
      const { data: appointment, error } = await db
        .from("appointments")
        .insert({
          ...payloadBase,
          application_id: application.id,
          notes: marker,
          canceled_at: canceled ? new Date().toISOString() : null,
          stage: managerStage ? "manager_final_filter" : "recruitment",
        })
        .select("id")
        .single();
      // Another sync inserted this invitee a moment ago: never duplicate it.
      if (error?.code === "23505") continue;
      if (error) throw new Error(error.message);
      result.created += 1;
      existingByUri.set(invitee.uri, {
        id: appointment.id,
        application_id: application.id,
        status: payloadBase.status,
        starts_at: payloadBase.starts_at,
        notes: marker,
        meeting_link: payloadBase.meeting_link,
        calendly_event_name: payloadBase.calendly_event_name,
      });
      if (createdFromCalendly || canceled) continue;

      if (!managerStage) {
        await db
          .from("recruitment_progress")
          .update({ scheduling_status: "Interview scheduled" })
          .eq("application_id", application.id);
      }

      // Pipeline changes and emails only happen for webhook-driven syncs.
      if (!options.sendEmails) continue;
      if (managerStage) {
        if (currentStatus !== "Pending Second Filter") {
          await db.from("applications").update({ status: "Pending Second Filter", last_contact_at: new Date().toISOString() }).eq("id", application.id);
          const { writeAudit } = await import("./audit.server");
          await writeAudit(db as never, {
            actorId: null,
            actorEmail: "calendly",
            action: "application.manager_interview_rescheduled",
            entityType: "appointment",
            entityId: appointment.id,
            applicationId: application.id,
            oldValue: { status: currentStatus },
            newValue: { status: "Pending Second Filter", stage: "manager_final_filter", starts_at: event.start_time },
          });
        }
        continue;
      }
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
      if (candidate && (candidate.status ?? "").startsWith("Retake")) {
        await db.from("applications").update({ status: "Scheduled – Retake" }).eq("id", application.id);
      }
      if (candidate) {
        const formatter = (o: Intl.DateTimeFormatOptions) =>
          new Intl.DateTimeFormat("en-US", { timeZone: invitee.timezone ?? "UTC", ...o }).format(new Date(event.start_time));
        const { buildPreparationEmail } = await import("./candidate-emails");
        const { sendEmail } = await import("./notify.server");
        const message = buildPreparationEmail({
          fullName: candidate.full_name,
          interviewDate: formatter({ weekday: "long", year: "numeric", month: "long", day: "numeric" }),
          interviewTime: formatter({ hour: "numeric", minute: "2-digit" }),
          timezone: invitee.timezone ?? "UTC",
          modality: progress?.work_modality === "onsite" ? "onsite" : "online",
        });
        const delivery = await sendEmail({ to: candidate.email, ...message, candidateName: candidate.full_name, result: "preparation" });
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

  return result;
}
