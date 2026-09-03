import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  bookInterview,
  cancelInterview,
  getSchedulingContext,
  listSchedulingSlots,
} from "@/lib/scheduling.functions";
import {
  buildIcs,
  formatInTz,
  formatTimeInTz,
  googleCalendarUrl,
  TIMEZONE_CHOICES,
} from "@/lib/interviews";

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
  const loadSlots = useServerFn(listSchedulingSlots);
  const book = useServerFn(bookInterview);
  const cancel = useServerFn(cancelInterview);

  const [timezone, setTimezone] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
    timezone ??
    context?.appointment?.candidateTimezone ??
    context?.suggestedTimezone ??
    "America/El_Salvador";

  const slotsQuery = useQuery({
    queryKey: ["schedule-slots", token],
    queryFn: () => loadSlots({ data: { token } }),
    enabled: eligible && !context?.appointment,
    retry: false,
  });


  const days = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const slot of slotsQuery.data ?? []) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(slot.startIso));
      grouped.set(key, [...(grouped.get(key) ?? []), slot.startIso]);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [slotsQuery.data, tz]);

  const activeDay = selectedDay ?? days[0]?.[0] ?? null;
  const daySlots = days.find(([d]) => d === activeDay)?.[1] ?? [];

  const bookMutation = useMutation({
    mutationFn: (startIso: string) => book({ data: { token, startIso, timezone: tz } }),
    onSuccess: async () => {
      toast.success("Your interview is confirmed.");
      await queryClient.invalidateQueries({ queryKey: ["schedule-context", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

            <div className="mt-6 max-w-xs">
              <Label className="text-sm font-medium">Your timezone</Label>
              <Select value={tz} onValueChange={setTimezone}>
                <SelectTrigger className="mt-1.5 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([tz, ...TIMEZONE_CHOICES])].map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {slotsQuery.isLoading && <Skeleton className="mt-6 h-40 w-full rounded-2xl" />}

            {slotsQuery.data && days.length === 0 && (
              <p className="mt-6 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
                There are no interview times available right now. Please check back soon — we add
                new availability regularly.
              </p>
            )}

            {days.length > 0 && (
              <div className="mt-6 grid gap-6 md:grid-cols-[220px_1fr]">
                <div className="space-y-2">
                  {days.map(([day, items]) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition ${
                        activeDay === day
                          ? "border-primary bg-primary/10 font-semibold"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {new Intl.DateTimeFormat("en-US", {
                        timeZone: tz,
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      }).format(new Date(items[0]!))}
                      <span className="block text-xs text-muted-foreground">
                        {items.length} times
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {daySlots.map((startIso) => (
                    <Button
                      key={startIso}
                      variant="outline"
                      className="rounded-2xl"
                      disabled={bookMutation.isPending}
                      onClick={() => bookMutation.mutate(startIso)}
                    >
                      {formatTimeInTz(startIso, tz)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
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
