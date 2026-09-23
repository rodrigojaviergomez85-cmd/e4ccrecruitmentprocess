import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cancelInterview,
  getSchedulingContext,
  recordCalendlySchedule,
} from "@/lib/scheduling.functions";
import { buildIcs, formatInTz, googleCalendarUrl } from "@/lib/interviews";

const CALENDLY_URL = "https://calendly.com/teachingjobs4callcenters/schedule";

export const Route = createFileRoute("/schedule/$token")({
  head: () => ({
    meta: [
      { title: "Schedule your E4CC interview" },
      {
        name: "description",
        content: "Pick a time for your E4CC English coaching interview using your secure link.",
      },
      { property: "og:title", content: "Schedule your E4CC interview" },
      {
        property: "og:description",
        content: "Pick a time for your E4CC interview using your secure link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const loadContext = useServerFn(getSchedulingContext);
  const cancel = useServerFn(cancelInterview);
  const syncCalendly = useServerFn(recordCalendlySchedule);

  const [confirming, setConfirming] = useState(false);

  const contextQuery = useQuery({
    queryKey: ["schedule-context", token],
    queryFn: () => loadContext({ data: { token } }),
    retry: false,
  });

  const invalidMessage = contextQuery.data?.invalid ?? null;
  const context =
    contextQuery.data && contextQuery.data.invalid === null ? contextQuery.data : null;

  const eligible = context?.eligible === true;
  const tz =
    context?.appointment?.candidateTimezone ??
    context?.suggestedTimezone ??
    "America/El_Salvador";

  const calendlyUrl = useMemo(() => {
    const url = new URL(CALENDLY_URL);
    if (context) {
      url.searchParams.set("name", context.fullName);
      url.searchParams.set("email", context.email);
    }
    return url.toString();
  }, [context]);

  // Calendly's embed posts a message once the candidate confirms a booking.
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const payload = event.data as { event?: string } | null;
      if (payload?.event !== "calendly.event_scheduled") return;
      setConfirming(true);
      setTimeout(async () => {
        await syncCalendly({ data: { token } });
        await queryClient.invalidateQueries({ queryKey: ["schedule-context", token] });
        setConfirming(false);
      }, 3000);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [token, syncCalendly, queryClient]);

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { token } }),
    onSuccess: async () => {
      toast.success("Your interview was canceled.");
      await queryClient.invalidateQueries({ queryKey: ["schedule-context", token] });
      await queryClient.invalidateQueries({ queryKey: ["schedule-slots", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const appointment = context?.appointment ?? null;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <BrandMark className="mx-auto" />

        {contextQuery.isLoading && <Skeleton className="mt-10 h-72 w-full rounded-3xl" />}

        {(contextQuery.isError || invalidMessage) && (
          <section className="mt-10 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold">This link is not available</h1>
            <p className="mt-3 text-muted-foreground">
              {invalidMessage ?? (contextQuery.error as Error).message}
            </p>
            <Button asChild variant="outline" className="mt-8 rounded-2xl">
              <Link to="/">Back to home</Link>
            </Button>
          </section>
        )}

        {context && !eligible && (
          <section className="mt-10 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold">Thank you for your application</h1>
            <p className="mt-3 text-muted-foreground">
              After reviewing your English assessment we are not moving forward with an interview
              at this time. We truly appreciate the time you invested with us.
            </p>
            {context.allowReapplyDays > 0 && (
              <p className="mt-3 text-muted-foreground">
                You are welcome to apply again in {context.allowReapplyDays} days.
              </p>
            )}
            <Button asChild variant="outline" className="mt-8 rounded-2xl">
              <Link to="/">Back to home</Link>
            </Button>
          </section>
        )}

        {context && eligible && appointment && (
          <section className="mt-10 rounded-3xl border border-border bg-card p-8 shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <CalendarCheck className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-center text-2xl font-bold">Your interview is confirmed</h1>
            <dl className="mx-auto mt-6 max-w-md space-y-2 text-sm">
              <Row label="Your time">{formatInTz(appointment.startsAt, tz)}</Row>
              <Row label="E4CC time">
                {formatInTz(appointment.startsAt, context.organizationTimezone)}
              </Row>
              <Row label="Interviewer">{appointment.interviewer ?? "To be assigned"}</Row>
              <Row label="Status">{appointment.status}</Row>
              {appointment.meetingLink && (
                <Row label="Meeting link">
                  <a className="text-primary underline" href={appointment.meetingLink}>
                    {appointment.meetingLink}
                  </a>
                </Row>
              )}
            </dl>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild variant="outline" className="rounded-2xl">
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={googleCalendarUrl({
                    title: "E4CC interview",
                    startIso: appointment.startsAt,
                    endIso: appointment.endsAt,
                    details: "Interview with E4CC recruitment.",
                    location: appointment.meetingLink || "Online",
                  })}
                >
                  Add to Google Calendar
                </a>
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => {
                  const ics = buildIcs({
                    uid: appointment.id,
                    title: "E4CC interview",
                    startIso: appointment.startsAt,
                    endIso: appointment.endsAt,
                    description: "Interview with E4CC recruitment.",
                    location: appointment.meetingLink || "Online",
                  });
                  const url = URL.createObjectURL(
                    new Blob([ics], { type: "text/calendar;charset=utf-8" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "e4cc-interview.ics";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download .ics
              </Button>
              <Button
                variant="ghost"
                className="rounded-2xl"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cancel interview
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Need another time? Cancel here and book a new slot with this same link.
            </p>
          </section>
        )}

        {context && eligible && !appointment && (
          <section className="mt-10 rounded-3xl border border-border bg-card p-8 shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-center text-2xl font-bold">
              Congratulations, {context.firstName}!
            </h1>
            <p className="mt-2 text-center text-muted-foreground">
              Your English level qualifies you for an interview. Pick a time that works for you —
              it takes about {context.durationMinutes} minutes.
            </p>

            {confirming && (
              <p className="mt-4 rounded-2xl bg-secondary p-3 text-sm">
                Confirming your booking… this page will update in a moment.
              </p>
            )}

            <div
              className="calendly-inline-widget mt-6 min-w-[280px]"
              data-url={calendlyUrl}
              style={{ height: 720 }}
            />
            <script async src="https://assets.calendly.com/assets/external/widget.js" />

            <div className="mt-3 text-center">
              <Button asChild variant="outline" className="rounded-2xl">
                <a href={calendlyUrl} target="_blank" rel="noreferrer">
                  Open Calendly
                </a>
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
