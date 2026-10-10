import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  UserX,
} from "lucide-react";
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
import {
  getEvaluatorAccess,
  listInterviewAgenda,
  markInterviewNoShow,
  markInterviewWaitingList,
  searchApplicantsForEvaluation,
  syncCalendlyNow,
} from "@/lib/evaluations.functions";
import { DEFAULT_WEIGHTS, EVALUATION_STATUSES } from "@/lib/evaluations";

export const Route = createFileRoute("/_authenticated/evaluations/")({
  head: () => ({
    meta: [
      { title: "Interviews — E4CC" },
      {
        name: "description",
        content: "E4CC interview agenda from Calendly and manual evaluations for Recruitment staff.",
      },
      { property: "og:title", content: "Interviews — E4CC" },
      {
        property: "og:description",
        content: "Today's, upcoming and past E4CC interviews with their evaluations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewsPage,
});

const ALL = "all";
const PAGE_SIZE = 25;
const OPS_TZ = "America/El_Salvador";
const OPS_TZ_LABEL = "El Salvador time (UTC-6)";
const MAX_SCORE = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
const AUTO_SYNC_MS = 5 * 60000;

type Agenda = Awaited<ReturnType<typeof listInterviewAgenda>>;
type Row = Agenda["rows"][number] | Agenda["unscheduled"][number];

function opsDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPS_TZ }).format(new Date(iso));
}
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: OPS_TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: OPS_TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const EVAL_TONE: Record<string, string> = {
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
const APPT_TONE: Record<string, string> = {
  Scheduled: "border-info/30 bg-info/10 text-info",
  Confirmed: "border-success/30 bg-success/10 text-success",
  Completed: "border-border bg-secondary text-secondary-foreground",
  Canceled: "border-destructive/30 bg-destructive/10 text-destructive",
  "No-show": "border-destructive/30 bg-destructive/10 text-destructive",
};

function Tag({ label, tone }: { label: string; tone?: string | undefined }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone ?? "border-border bg-secondary text-secondary-foreground"}`}>
      {label}
    </span>
  );
}

function ScoreCell({ r }: { r: Row }) {
  if (r.totalScore === null || r.totalScore === 0) return <span className="text-xs text-muted-foreground">Pending</span>;
  return (
    <span className="text-sm font-semibold tabular-nums">
      {r.totalScore}
      <span className="text-xs font-normal text-muted-foreground"> / {MAX_SCORE}</span>
    </span>
  );
}

function SyncPanel({
  sync,
  canSync,
  busy,
  onSync,
}: {
  sync: Agenda["sync"] | undefined;
  canSync: boolean;
  busy: boolean;
  onSync: () => void;
}) {
  const r = sync?.lastResult;
  const failedLast =
    Boolean(sync?.lastError) &&
    (!sync?.lastSyncedAt || (sync?.lastAttemptAt ?? "") > (sync?.lastSyncedAt ?? ""));
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">Calendly</h2>
          <p className="text-xs text-muted-foreground">
            Last sync: {sync?.lastSyncedAt ? fmtStamp(sync.lastSyncedAt) : "never"}
            {r ? ` · ${r.scanned ?? 0} events · ${r.activeInvitees ?? 0} active invitees (${r.invitees ?? 0} total)` : ""}
            {r && (r.created || r.candidatesCreated) ? ` · ${r.created ?? 0} new bookings, ${r.candidatesCreated ?? 0} new applicants` : ""}
          </p>
          {r?.account ? (
            <p className="text-[11px] text-muted-foreground">
              Account: {r.account}
              {r.eventTypes?.length ? ` · Event types: ${r.eventTypes.join(", ")}` : ""}
              {r.rangeFrom ? ` · From ${fmtStamp(r.rangeFrom)} onward` : ""}
            </p>
          ) : null}
        </div>
        {canSync && (
          <Button size="sm" variant="outline" disabled={busy || !sync?.configured} onClick={onSync}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Sync Calendly
          </Button>
        )}
      </div>
      {!sync?.configured ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Calendly is not connected. Bookings cannot be loaded.
        </p>
      ) : failedLast ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            The last Calendly sync failed{sync?.lastAttemptAt ? ` (${fmtStamp(sync.lastAttemptAt)})` : ""}: {sync?.lastError}. The list below may be incomplete.
          </span>
        </p>
      ) : null}
    </section>
  );
}

function ManualStart({ onOpen }: { onOpen: (applicationId: string) => void }) {
  const searchFn = useServerFn(searchApplicantsForEvaluation);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);
  const { data, isFetching } = useQuery({
    queryKey: ["manual-eval-search", debounced],
    queryFn: () => searchFn({ data: { term: debounced } }),
    enabled: debounced.length >= 2,
  });
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <Label className="text-xs">Start a manual evaluation (no booking or screening required)</Label>
      <div className="relative mt-1.5">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search applicant by name, email or phone" value={term} maxLength={120} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {debounced.length >= 2 && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {isFetching && !data ? (
            <li className="p-3 text-xs text-muted-foreground">Searching…</li>
          ) : (data ?? []).length === 0 ? (
            <li className="p-3 text-xs text-muted-foreground">No applicants found.</li>
          ) : (
            (data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{a.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.email}{a.country ? ` · ${a.country}` : ""} · {a.status}</div>
                </div>
                <Button size="sm" className="h-8" onClick={() => onOpen(a.id)}>Open evaluation</Button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function InterviewsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessFn = useServerFn(getEvaluatorAccess);
  const agendaFn = useServerFn(listInterviewAgenda);
  const syncFn = useServerFn(syncCalendlyNow);
  const noShowFn = useServerFn(markInterviewNoShow);
  const waitFn = useServerFn(markInterviewWaitingList);
  const { data: countries = [] } = useCountries();
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [action, setAction] = useState<Record<string, string>>({});

  const { data: access, isPending: accessPending } = useQuery({
    queryKey: ["evaluator-access"],
    queryFn: () => accessFn(),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["interview-agenda"],
    queryFn: () => agendaFn(),
    enabled: Boolean(access?.canView),
    refetchInterval: 60000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["interview-agenda"] });

  const syncMutation = useMutation({
    mutationFn: (mode: "auto" | "manual") => syncFn({ data: { mode } }),
    onSuccess: (r, mode) => {
      if (mode === "manual" && !r.skipped) {
        toast.success(`Calendly synced: ${r.scanned} events, ${r.activeInvitees} active invitees · ${r.created} new, ${r.updated} updated`);
      }
      void refresh();
    },
    onError: (e: Error, mode) => {
      if (mode === "manual") toast.error(e.message);
      void refresh();
    },
  });

  // Keeps bookings current without relying on Calendly webhooks.
  const canEvaluate = Boolean(access?.canEvaluate);
  const syncRef = useRef(syncMutation.mutate);
  syncRef.current = syncMutation.mutate;
  useEffect(() => {
    if (!canEvaluate) return;
    syncRef.current("auto");
    const t = setInterval(() => syncRef.current("auto"), AUTO_SYNC_MS);
    return () => clearInterval(t);
  }, [canEvaluate]);

  async function onSend(r: Row) {
    const a = action[r.key];
    if (a === "noshow") {
      if (!window.confirm(`Mark ${r.fullName} as No Show and send the reschedule email?`)) return;
      setBusyRow(r.key);
      try {
        const res = await noShowFn({ data: { applicationId: r.applicationId } });
        if (res.email === "sent") toast.success(`${r.fullName} marked as No Show — email sent`);
        else toast.warning(`No Show saved, but the email was not sent: ${res.detail}`);
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not mark No Show");
      } finally {
        setBusyRow(null);
      }
      return;
    }
    if (a !== "waiting") return;
    if (!window.confirm(`Move ${r.fullName} to the Waiting List?`)) return;
    setBusyRow(r.key);
    try {
      await waitFn({ data: { applicationId: r.applicationId } });
      toast.success(`${r.fullName} moved to Waiting List`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusyRow(null);
    }
  }

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState(ALL);
  const [lob, setLob] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [evaluator, setEvaluator] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState("today");
  const [page, setPage] = useState(1);
  const activeFilters = [country, lob, source, status, evaluator].filter((v) => v !== ALL).length + (from ? 1 : 0) + (to ? 1 : 0);
  useEffect(() => setPage(1), [search, country, lob, source, status, evaluator, from, to, tab]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const keep = (r: Row) => {
      if (term && ![r.fullName, r.email, r.phone].some((v) => (v ?? "").toLowerCase().includes(term))) return false;
      if (country !== ALL && r.countryCode !== country) return false;
      if (lob !== ALL && (r.lob ?? "") !== lob) return false;
      if (source !== ALL && r.source !== source) return false;
      if (status !== ALL && r.evaluationStatus !== status) return false;
      if (evaluator !== ALL && r.evaluatorId !== evaluator) return false;
      if (r.startsAt) {
        const day = opsDay(r.startsAt);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      return true;
    };
    const today = opsDay(new Date());
    const rows = (data?.rows ?? []).filter(keep);
    const asc = (a: Row, b: Row) => ((a.startsAt ?? "") < (b.startsAt ?? "") ? -1 : 1);
    return [
      { key: "today", title: "Today", empty: "No interviews booked for today.", items: rows.filter((r) => r.startsAt && opsDay(r.startsAt) === today).sort(asc) },
      { key: "upcoming", title: "Upcoming", empty: "No upcoming interviews.", items: rows.filter((r) => r.startsAt && opsDay(r.startsAt) > today).sort(asc) },
      { key: "past", title: "Past", empty: "No past interviews.", items: rows.filter((r) => r.startsAt && opsDay(r.startsAt) < today).sort((a, b) => -asc(a, b)) },
      { key: "unscheduled", title: "Unscheduled evaluations", empty: "No evaluations without a booking.", items: (data?.unscheduled ?? []).filter(keep) as Row[] },
    ];
  }, [data, search, country, lob, source, status, evaluator, from, to]);

  const active = groups.find((g) => g.key === tab) ?? groups[0]!;
  const totalPages = Math.max(1, Math.ceil(active.items.length / PAGE_SIZE));
  const pageItems = active.items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sync = data?.sync;
  const syncFailed =
    Boolean(sync?.lastError) && (!sync?.lastSyncedAt || (sync?.lastAttemptAt ?? "") > (sync?.lastSyncedAt ?? ""));

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
          <h1 className="text-lg font-semibold">Interviews</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your account does not have permission to open interview evaluations.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/dashboard">Back to Applicants</Link>
          </Button>
        </div>
      </main>
    );
  }

  const open = (applicationId: string) =>
    void navigate({ to: "/evaluations/$applicationId", params: { applicationId } });

  const quickActions = (r: Row) =>
    active.key === "today" && canEvaluate && (r.appointmentStatus === "Scheduled" || r.appointmentStatus === "Confirmed") ? (
      <>
        <Select value={action[r.key] ?? ""} onValueChange={(v) => setAction({ ...action, [r.key]: v })}>
          <SelectTrigger className="h-8 w-32 text-xs" aria-label={`Action for ${r.fullName}`}><SelectValue placeholder="Action…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="noshow">No Show</SelectItem>
            <SelectItem value="waiting">Waiting List</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="destructive" className="h-8" disabled={!action[r.key] || busyRow === r.key} onClick={() => void onSend(r)}>
          <UserX className="mr-1 h-3.5 w-3.5" /> Send
        </Button>
      </>
    ) : null;

  const evalButton = (r: Row) => {
    const canceled = r.appointmentStatus === "Canceled";
    if (!r.evaluationId && (!canEvaluate || canceled)) return null;
    const label =
      r.evaluationStatus === "Not started"
        ? "Start evaluation"
        : r.evaluationStatus === "In progress" || r.evaluationStatus === "Reopened"
          ? "Continue evaluation"
          : "View evaluation";
    return (
      <Button size="sm" className="h-8" variant={label === "View evaluation" ? "outline" : "default"} onClick={() => open(r.applicationId)}>
        {label}
      </Button>
    );
  };

  const whenCell = (r: Row) =>
    r.startsAt ? (
      <div>
        <div className="font-semibold tabular-nums">{fmtTime(r.startsAt)}</div>
        {active.key !== "today" && <div className="text-xs text-muted-foreground">{fmtDate(r.startsAt)}</div>}
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">No booking</span>
    );

  const candidateCell = (r: Row) => {
    const canceled = r.appointmentStatus === "Canceled";
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to="/candidates/$id" params={{ id: r.applicationId }} className={`truncate font-semibold text-foreground hover:underline ${canceled ? "line-through" : ""}`} title={r.fullName}>
            {r.fullName}
          </Link>
          {r.cefr ? <Badge variant="secondary">{r.cefr}</Badge> : null}
          {!r.screeningCompleted && <Tag label="No screening" />}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={r.email}>{r.email}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[r.country, r.city, r.lob ? (r.lob === "online" ? "Online" : "Onsite") : null].filter(Boolean).join(" · ") || "Location pending"}
        </div>
      </div>
    );
  };

  const sourceCell = (r: Row) => (
    <div className="space-y-1">
      <Tag label={r.source} tone={r.source === "Calendly" ? "border-primary/30 bg-primary/10 text-primary" : undefined} />
      {r.host ? <div className="truncate text-[11px] text-muted-foreground" title={r.host}>{r.host}</div> : null}
      {r.meetingLink ? (
        <a href={r.meetingLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary underline">
          Meeting <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );

  const statusCell = (r: Row) => (
    <div className="flex flex-col items-start gap-1">
      {r.appointmentStatus ? (
        <span className="text-[11px] text-muted-foreground">Booking: <Tag label={r.appointmentStatus} tone={APPT_TONE[r.appointmentStatus]} /></span>
      ) : null}
      <span className="text-[11px] text-muted-foreground">Evaluation: <Tag label={r.evaluationStatus} tone={EVAL_TONE[r.evaluationStatus]} /></span>
      {r.finalResult ? <Tag label={r.finalResult} tone={RESULT_TONE[r.finalResult]} /> : null}
      {r.evaluatorName ? <span className="text-[11px] text-muted-foreground">By {r.evaluatorName}</span> : null}
    </div>
  );

  const emptyMessage =
    search.trim() || activeFilters
      ? "No results match your search or filters."
      : syncFailed && active.key !== "unscheduled"
        ? "No bookings to show because the last Calendly sync failed. Check the message above and try Sync Calendly again."
        : active.empty;

  return (
    <main className="min-h-screen bg-secondary/40">
      <div className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Interviews</h1>
            <p className="text-sm text-muted-foreground">Calendly agenda and manual evaluations</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Times shown in {OPS_TZ_LABEL}
            </p>
            {access.isAdmin && (
              <Button asChild size="sm" variant="ghost">
                <Link to="/interviews"><Settings2 className="mr-1.5 h-3.5 w-3.5" /> Scheduling settings</Link>
              </Button>
            )}
          </div>
        </div>

        <SyncPanel sync={sync} canSync={canEvaluate} busy={syncMutation.isPending} onSync={() => syncMutation.mutate("manual")} />

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
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
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
              <Label className="text-xs">Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  <SelectItem value="Calendly">Calendly</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Evaluation status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="Not started">Not started</SelectItem>
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

        {active.key === "unscheduled" && canEvaluate && <ManualStart onOpen={open} />}

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            Could not load interviews: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        ) : active.items.length === 0 ? (
          <div className={`rounded-xl border border-dashed p-10 text-center text-sm ${syncFailed && active.key !== "unscheduled" && !search.trim() && !activeFilters ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-card text-muted-foreground"}`}>
            {emptyMessage}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="hidden max-h-[70vh] overflow-auto rounded-t-xl lg:block">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[11%]" /><col className="w-[29%]" /><col className="w-[14%]" />
                  <col className="w-[18%]" /><col className="w-[8%]" /><col className="w-[20%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-secondary text-left text-xs font-semibold text-secondary-foreground">
                  <tr>
                    <th className="px-4 py-3">{active.key === "unscheduled" ? "Booking" : "Time"}</th>
                    <th className="px-3 py-3">Candidate</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Score</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => (
                    <tr key={r.key} className={`border-t border-border align-top transition-colors hover:bg-muted/40 ${r.appointmentStatus === "Canceled" ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">{whenCell(r)}</td>
                      <td className="px-3 py-3">{candidateCell(r)}</td>
                      <td className="px-3 py-3">{sourceCell(r)}</td>
                      <td className="px-3 py-3">{statusCell(r)}</td>
                      <td className="px-3 py-3"><ScoreCell r={r} /></td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {quickActions(r)}
                          {evalButton(r)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-border lg:hidden">
              {pageItems.map((r) => (
                <li key={r.key} className={`space-y-2 p-4 ${r.appointmentStatus === "Canceled" ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-20 shrink-0 text-sm">{whenCell(r)}</div>
                    {candidateCell(r)}
                  </div>
                  <div className="flex flex-wrap items-start gap-4">
                    {sourceCell(r)}
                    {statusCell(r)}
                    <ScoreCell r={r} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {quickActions(r)}
                    {evalButton(r)}
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, active.items.length)} of {active.items.length}
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
