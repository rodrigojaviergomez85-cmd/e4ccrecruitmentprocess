import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCalendlyToday, refreshCalendlyToday } from "@/lib/evaluations.functions";

const OPS_TZ = "America/El_Salvador";
const time = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const stamp = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export function CalendlyToday({ canEvaluate }: { canEvaluate: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCalendlyToday);
  const refreshFn = useServerFn(refreshCalendlyToday);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["calendly-today"],
    queryFn: () => listFn(),
    refetchInterval: 60000,
  });

  async function refresh() {
    setBusy(true);
    try {
      const r = await refreshFn();
      toast.success(`Calendly synced — ${r.created} new, ${r.updated} updated`);
      await queryClient.invalidateQueries({ queryKey: ["calendly-today"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync Calendly");
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Today's Calendly interviews</h2>
          <Badge variant="secondary">{rows.filter((r) => r.status !== "Canceled").length}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Last sync: {data?.lastSyncedAt ? stamp(data.lastSyncedAt) : "never"}
          </span>
          {canEvaluate && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
            </Button>
          )}
        </div>
      </div>
      {isLoading ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="px-4 py-6 text-sm text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No Calendly interviews for today.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const canceled = r.status === "Canceled";
            const label =
              r.evaluationStatus === "Not started"
                ? "Start evaluation"
                : r.evaluationStatus === "In progress" || r.evaluationStatus === "Reopened"
                  ? "Continue evaluation"
                  : "View evaluation";
            return (
              <li key={r.appointmentId} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${canceled ? "opacity-60" : ""}`}>
                <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">{time(r.startsAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`font-medium ${canceled ? "line-through" : ""}`}>{r.fullName}</span>
                    <Badge variant="outline">Calendly</Badge>
                    {canceled && <Badge variant="destructive">Canceled</Badge>}
                    {r.status !== "Scheduled" && r.status !== "Confirmed" && !canceled && <Badge variant="secondary">{r.status}</Badge>}
                    {!r.screeningCompleted && <Badge variant="secondary">Screening not completed</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.email}
                    {r.eventName ? ` · ${r.eventName}` : ""}
                    {r.host ? ` · ${r.host}` : ""}
                  </p>
                </div>
                {r.meetingLink && (
                  <Button asChild size="sm" variant="ghost" className="h-8">
                    <a href={r.meetingLink} target="_blank" rel="noreferrer">
                      Meeting <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </Button>
                )}
                {!canceled && (canEvaluate || r.evaluationId) && (
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={() => void navigate({ to: "/evaluations/$applicationId", params: { applicationId: r.applicationId } })}
                  >
                    {label}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
