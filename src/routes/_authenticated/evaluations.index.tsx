import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Search, SlidersHorizontal, UserX } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCountries } from "@/hooks/useLocations";
import { getEvaluatorAccess, listEvaluationQueue, markInterviewNoShow, markInterviewWaitingList } from "@/lib/evaluations.functions";
import { DEFAULT_WEIGHTS, EVALUATION_STATUSES } from "@/lib/evaluations";

export const Route = createFileRoute("/_authenticated/evaluations/")({
  head: () => ({
    meta: [
      { title: "Interview Evaluations — E4CC" },
      {
        name: "description",
        content: "Internal E4CC page to run live interview evaluations for scheduled candidates.",
      },
      { property: "og:title", content: "Interview Evaluations — E4CC" },
      {
        property: "og:description",
        content: "Evaluator workspace for live E4CC interviews and scoring.",
      },
    ],
  }),
  component: EvaluationsPage,
});

const ALL = "all";
const PAGE_SIZE = 25;
const OPS_TZ = "America/El_Salvador";
const OPS_TZ_LABEL = "El Salvador time (UTC-6)";
const MAX_SCORE = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);

type QueueRow = Awaited<ReturnType<typeof listEvaluationQueue>>["rows"][number];

function opsDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPS_TZ }).format(new Date(iso));
}
function isToday(iso: string | null) {
  if (!iso) return false;
  return opsDay(iso) === opsDay(new Date());
}
function formatInterview(iso: string) {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: OPS_TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return `${date} · ${time}`;
}

const STATUS_TONE: Record<string, string> = {
  "Not started": "border-border bg-muted text-muted-foreground",
  "In progress": "border-info/30 bg-info/10 text-info",
  Reopened: "border-info/30 bg-info/10 text-info",
  Submitted: "border-border bg-secondary text-secondary-foreground",
  "Retake pending": "border-warning/40 bg-warning/15 text-warning-foreground",
};
const RESULT_TONE: Record<string, string> = {
  "Approved for last step": "border-success/30 bg-success/10 text-success",
  "Not approved": "border-destructive/30 bg-destructive/10 text-destructive",
  "Retake required": "border-warning/40 bg-warning/15 text-warning-foreground",
};

function Tag({ label, tone }: { label: string; tone?: string | undefined }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone ?? "border-border bg-secondary text-secondary-foreground"}`}>
      {label}
    </span>
  );
}

function ScoreCell({ r }: { r: QueueRow }) {
  // total_score is 0 when no category scores were entered (the current interview format does not score categories).
  if (r.totalScore === null || r.totalScore === 0) return <span className="text-xs text-muted-foreground">Pending</span>;
  return (
    <span className="text-sm font-semibold tabular-nums">
      {r.totalScore}
      <span className="text-xs font-normal text-muted-foreground"> / {MAX_SCORE}</span>
    </span>
  );
}

function ProgressCell({ r }: { r: QueueRow }) {
  if (r.complianceScore === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.max(0, Math.min(100, r.complianceScore));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

function EvaluationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessFn = useServerFn(getEvaluatorAccess);
  const queueFn = useServerFn(listEvaluationQueue);
  const noShowFn = useServerFn(markInterviewNoShow);
  const [noShowBusy, setNoShowBusy] = useState<string | null>(null);
  const waitFn = useServerFn(markInterviewWaitingList);
  const [action, setAction] = useState<Record<string, string>>({});

  async function onSend(r: { applicationId: string; fullName: string }) {
    const a = action[r.applicationId];
    if (a === "noshow") return onNoShow(r);
    if (a !== "waiting") return;
    if (!window.confirm(`Move ${r.fullName} to the Waiting List?`)) return;
    setNoShowBusy(r.applicationId);
    try {
      await waitFn({ data: { applicationId: r.applicationId } });
      toast.success(`${r.fullName} moved to Waiting List`);
      await queryClient.invalidateQueries({ queryKey: ["evaluation-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setNoShowBusy(null);
    }
  }
  const { data: countries = [] } = useCountries();

  async function onNoShow(r: { applicationId: string; fullName: string }) {
    if (!window.confirm(`Mark ${r.fullName} as No Show and send the reschedule email?`)) return;
    setNoShowBusy(r.applicationId);
    try {
      const res = await noShowFn({ data: { applicationId: r.applicationId } });
      if (res.email === "sent") toast.success(`${r.fullName} marked as No Show — email sent`);
      else toast.warning(`No Show saved, but the email was not sent: ${res.detail}`);
      await queryClient.invalidateQueries({ queryKey: ["evaluation-queue"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark No Show");
    } finally {
      setNoShowBusy(null);
    }
  }

  const { data: access, isPending: accessPending } = useQuery({
    queryKey: ["evaluator-access"],
    queryFn: () => accessFn(),
  });

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState(ALL);
  const [lob, setLob] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [evaluator, setEvaluator] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState("today");
  const [page, setPage] = useState(1);

  const filters = useMemo(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(country !== ALL ? { country } : {}),
      ...(lob !== ALL ? { lob } : {}),
      ...(status !== ALL ? { status } : {}),
      ...(evaluator !== ALL ? { evaluator } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [search, country, lob, status, evaluator, from, to],
  );
  useEffect(() => setPage(1), [filters, tab]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["evaluation-queue", filters],
    queryFn: () => queueFn({ data: filters }),
    enabled: Boolean(access?.canView),
  });

  const rows = data?.rows ?? [];
  const groups = useMemo(() => {
    const now = new Date().toISOString();
    return [
      { key: "today", title: "Today's interviews", empty: "No interviews scheduled for today", items: rows.filter((r) => isToday(r.appointmentAt)) },
      { key: "upcoming", title: "Upcoming", empty: "No upcoming interviews scheduled", items: rows.filter((r) => r.appointmentAt && !isToday(r.appointmentAt) && r.appointmentAt > now) },
      { key: "progress", title: "In progress", empty: "No evaluations in progress", items: rows.filter((r) => r.evaluationStatus === "In progress" || r.evaluationStatus === "Reopened") },
      { key: "submitted", title: "Submitted", empty: "No submitted evaluations", items: rows.filter((r) => r.evaluationStatus === "Submitted") },
      { key: "retakes", title: "Retakes pending", empty: "No retakes pending", items: rows.filter((r) => r.finalResult === "Retake required" || r.evaluationStatus === "Retake pending") },
      { key: "approved", title: "Approved — Pending Second Filter", empty: "No candidates pending second filter", items: rows.filter((r) => r.finalResult === "Approved for last step") },
      { key: "notstarted", title: "Not started", empty: "No evaluations waiting to start", items: rows.filter((r) => r.evaluationStatus === "Not started" && (!r.appointmentAt || r.appointmentAt < now) && !isToday(r.appointmentAt)) },
    ];
  }, [rows]);

  const active = groups.find((g) => g.key === tab) ?? groups[0]!;
  const totalPages = Math.max(1, Math.ceil(active.items.length / PAGE_SIZE));
  const pageItems = active.items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = Object.keys(filters).filter((k) => k !== "search").length;

  if (accessPending) {
    return (
      <main className="min-h-screen bg-secondary/40 p-6">
        <Skeleton className="mx-auto h-32 w-full max-w-6xl" />
      </main>
    );
  }

  if (!access?.canView) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-5">
        <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Interview Evaluations</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account does not have permission to open interview evaluations.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  const quickActions = (r: QueueRow) =>
    active.key === "today" &&
    access.canEvaluate &&
    (r.appointmentStatus === "Scheduled" || r.appointmentStatus === "Confirmed") ? (
      <>
        <Select value={action[r.applicationId] ?? ""} onValueChange={(v) => setAction({ ...action, [r.applicationId]: v })}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Action…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="noshow">No Show</SelectItem>
            <SelectItem value="waiting">Waiting List</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="destructive" className="h-8" disabled={!action[r.applicationId] || noShowBusy === r.applicationId} onClick={() => void onSend(r)}>
          <UserX className="mr-1 h-3.5 w-3.5" /> Send
        </Button>
      </>
    ) : null;

  const viewButton = (r: QueueRow) => (
    <Button
      size="sm"
      className="h-8"
      onClick={() => void navigate({ to: "/evaluations/$applicationId", params: { applicationId: r.applicationId } })}
    >
      View evaluation
    </Button>
  );

  const statusCell = (r: QueueRow) => (
    <div className="flex flex-col items-start gap-1">
      <Tag label={r.evaluationStatus} tone={STATUS_TONE[r.evaluationStatus]} />
      {r.finalResult ? <Tag label={r.finalResult} tone={RESULT_TONE[r.finalResult]} /> : null}
    </div>
  );

  return (
    <main className="min-h-screen bg-secondary/40">
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Interview Evaluations</h1>
            <p className="text-sm text-muted-foreground">Manage interviews, evaluations and follow-ups</p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Times shown in {OPS_TZ_LABEL}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="bg-card pl-9" placeholder="Search by name, email or phone" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button variant={showFilters ? "default" : "outline"} className={showFilters ? "" : "bg-card"} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters{activeFilters ? ` (${activeFilters})` : ""}
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All countries</SelectItem>
                  {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">LOB</Label>
              <Select value={lob} onValueChange={setLob}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Evaluation status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {EVALUATION_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Evaluator</Label>
              <Select value={evaluator} onValueChange={setEvaluator}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All evaluators</SelectItem>
                  {(data?.evaluators ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="-mx-5 overflow-x-auto px-5">
          <div role="tablist" className="flex min-w-max gap-1 border-b border-border">
            {groups.map((g) => {
              const on = g.key === active.key;
              return (
                <button
                  key={g.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(g.key)}
                  className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${on ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {g.title}
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {isLoading ? "…" : g.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            Could not load interviews: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : active.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {search.trim() || activeFilters ? "No results match your search or filters." : active.empty}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            {/* Desktop table */}
            <div className="hidden max-h-[70vh] overflow-auto rounded-t-xl lg:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[22%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[7%]" />
                  <col className="w-[14%]" /><col className="w-[7%]" /><col className="w-[10%]" /><col className="w-[15%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-secondary text-left text-xs font-semibold text-secondary-foreground">
                  <tr>
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-3 py-3">Country / City</th>
                    <th className="px-3 py-3">Interview</th>
                    <th className="px-3 py-3">English Level</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Score</th>
                    <th className="px-3 py-3">Progress</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr key={r.applicationId} className="border-t border-border align-top transition-colors hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="truncate font-semibold text-foreground" title={r.fullName}>{r.fullName}</div>
                        <div className="truncate text-xs text-muted-foreground" title={r.email}>{r.email}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="truncate">{r.country}</div>
                        <div className="truncate text-muted-foreground">{r.city}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.appointmentAt ? formatInterview(r.appointmentAt) : <span className="text-muted-foreground">Not scheduled</span>}
                      </td>
                      <td className="px-3 py-3"><Badge variant="secondary">{r.previousCefr ?? "—"}</Badge></td>
                      <td className="px-3 py-3">{statusCell(r)}</td>
                      <td className="px-3 py-3"><ScoreCell r={r} /></td>
                      <td className="px-3 py-3"><ProgressCell r={r} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {quickActions(r)}
                          {viewButton(r)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-border lg:hidden">
              {pageItems.map((r) => (
                <li key={r.applicationId} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                    </div>
                    <Badge variant="secondary">{r.previousCefr ?? "—"}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.country}{r.city ? ` · ${r.city}` : ""} · {r.appointmentAt ? formatInterview(r.appointmentAt) : "Not scheduled"}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {statusCell(r)}
                    <ScoreCell r={r} />
                    <ProgressCell r={r} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickActions(r)}
                    {viewButton(r)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, active.items.length)} of {active.items.length} results
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="tabular-nums">Page {page} of {totalPages}</span>
                <Button size="sm" variant="outline" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
