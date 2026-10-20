import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { AhtReport } from "@/components/AhtReport";
import { RecruitmentGoal } from "@/components/RecruitmentGoal";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCountries } from "@/hooks/useLocations";
import { getApplicantActivity, getMyAccess, listCandidates } from "@/lib/recruiter.functions";
import { EXPERIENCE_OPTIONS, STATUS_OPTIONS } from "@/lib/recruitment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Applicants — E4CC" },
      { name: "description", content: "Manage E4CC applications and candidate follow-up." },
      { property: "og:title", content: "Applicants — E4CC" },
      { property: "og:description", content: "Internal recruitment dashboard for E4CC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const ALL = "all";
const CEFR_FILTERS = ["A2", "B1", "B1+", "B2", "B2+", "C1", "C2"];
const TZ = "America/El_Salvador";
const ACTIVE_APPT = ["Scheduled", "Confirmed"];

type Candidate = Awaited<ReturnType<typeof listCandidates>>[number];
type Tone = "blue" | "amber" | "green" | "red" | "gray";
type Kpi = "new" | "pending" | "scheduled" | null;
type SortKey = "name" | "applied" | "english" | "interview";

const TONE: Record<Tone, string> = {
  blue: "border-navy/20 bg-navy/5 text-navy",
  amber: "border-warning/40 bg-warning/15 text-warning-foreground",
  green: "border-success/30 bg-success/10 text-success",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
  gray: "border-border bg-muted text-muted-foreground",
};

function Tag({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium", TONE[tone], className)}>
      {children}
    </span>
  );
}

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "Not available";
const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function stageTone(status: string | null): Tone {
  const s = (status ?? "").toLowerCase();
  if (!s || s === "new") return "gray";
  if (s.includes("approved for training") || s === "qualified" || s === "english approved") return "green";
  if (s.includes("not approved") || s.includes("no-show") || s.includes("no show") || s.includes("withdrawn")) return "red";
  if (s.includes("retake") || s.includes("waiting") || s.includes("pending")) return "amber";
  return "blue";
}

function pendingRequirements(c: Candidate) {
  const out: string[] = [];
  if (!c.resume_uploaded) out.push("Resume");
  if (c.grammar_pending) out.push("Grammar test");
  if (c.work_modality === "online" && !c.internet_ready) out.push("Internet test");
  return out;
}

function upcomingInterview(c: Candidate) {
  const now = Date.now();
  return [...c.appointments]
    .filter((a) => ACTIVE_APPT.includes(a.status) && new Date(a.starts_at).getTime() >= now - 2 * 3600_000)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null;
}

function nextStep(c: Candidate): { label: string; tone: Tone } {
  const s = (c.status ?? "").toLowerCase();
  if (s.includes("not approved") || s.includes("withdrawn")) return { label: "Closed", tone: "gray" };
  if (s.includes("approved for training")) return { label: "Training", tone: "green" };
  if (upcomingInterview(c)) return { label: "Attend interview", tone: "blue" };
  if (s.includes("second filter")) return { label: "Manager second filter", tone: "amber" };
  const pending = pendingRequirements(c);
  if (pending.length) return { label: `Pending: ${pending.join(", ")}`, tone: "amber" };
  return { label: "Schedule interview", tone: "amber" };
}

function screeningLabel(c: Candidate): { text: string; tone: Tone } {
  if (c.evaluation_state === "error") return { text: "Analysis failed", tone: "red" };
  if (c.evaluation_state === "pending" || c.evaluation_state === "running") return { text: "Pending", tone: "gray" };
  if (c.assessment_status !== "Scored") return { text: c.assessment_status, tone: "amber" };
  if (c.overall_score == null) return { text: "Not available", tone: "gray" };
  return { text: `${c.overall_score}/100`, tone: c.overall_score >= 80 ? "green" : c.overall_score >= 70 ? "amber" : "red" };
}

function Dashboard() {
  const list = useServerFn(listCandidates);
  const { data: countries = [] } = useCountries();
  const access = useServerFn(getMyAccess);
  const { data: myAccess } = useQuery({ queryKey: ["my-access"], queryFn: () => access() });
  const isAdmin = Boolean(myAccess?.roles.includes("admin"));
  const canEvaluate = Boolean(myAccess?.canEvaluate);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [country, setCountry] = useState(ALL);
  const [modality, setModality] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [cefr, setCefr] = useState(ALL);
  const [experience, setExperience] = useState(ALL);
  const [callcenterExp, setCallcenterExp] = useState(ALL);
  const [minScore, setMinScore] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [owner, setOwner] = useState(ALL);
  const [requirement, setRequirement] = useState(ALL);
  const [archived, setArchived] = useState(false);
  const [kpi, setKpi] = useState<Kpi>(null);
  const [showMore, setShowMore] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "applied", dir: "desc" });
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const serverFilters = useMemo(
    () => ({
      ...(debounced ? { search: debounced } : {}),
      ...(cefr !== ALL ? { cefr } : {}),
      ...(country !== ALL ? { country } : {}),
      ...(status !== ALL ? { status } : {}),
      ...(experience !== ALL ? { experience } : {}),
      ...(callcenterExp !== ALL ? { callcenterExperience: callcenterExp } : {}),
      ...(minScore ? { minScore: Number(minScore) } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to: `${to}T23:59:59` } : {}),
      ...(archived ? { archived: true } : {}),
    }),
    [debounced, cefr, country, status, experience, callcenterExp, minScore, from, to, archived],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["candidates", serverFilters],
    queryFn: () => list({ data: serverFilters }),
  });

  // Client-side filters on fields the list already carries.
  const base = useMemo(
    () =>
      (data ?? []).filter((c) => {
        if (modality !== ALL && (c.work_modality ?? "none") !== modality) return false;
        if (owner !== ALL && (c.owner ?? "__unassigned") !== owner) return false;
        if (requirement !== ALL && !pendingRequirements(c).includes(requirement)) return false;
        return true;
      }),
    [data, modality, owner, requirement],
  );

  const counts = useMemo(
    () => ({
      total: base.length,
      new: base.filter((c) => c.status === "New").length,
      pending: base.filter((c) => pendingRequirements(c).length > 0).length,
      scheduled: base.filter((c) => upcomingInterview(c)).length,
    }),
    [base],
  );

  const rows = useMemo(() => {
    const filtered = base.filter((c) =>
      kpi === "new" ? c.status === "New" : kpi === "pending" ? pendingRequirements(c).length > 0 : kpi === "scheduled" ? Boolean(upcomingInterview(c)) : true,
    );
    const val = (c: Candidate): string | number => {
      if (sort.key === "name") return c.full_name.toLowerCase();
      if (sort.key === "english") return c.overall_score ?? -1;
      if (sort.key === "interview") return upcomingInterview(c)?.starts_at ?? "";
      return c.submitted_at ?? "";
    };
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
  }, [base, kpi, sort]);

  useEffect(() => setPage(0), [serverFilters, modality, owner, requirement, kpi, pageSize, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const owners = useMemo(() => [...new Set((data ?? []).map((c) => c.owner).filter(Boolean) as string[])].sort(), [data]);
  const selected = (data ?? []).find((c) => c.id === selectedId) ?? null;

  const countryName = countries.find((c) => c.code === country)?.name ?? country;
  const chips: Array<{ label: string; clear: () => void }> = [
    ...(debounced ? [{ label: `Search: ${debounced}`, clear: () => setSearch("") }] : []),
    ...(country !== ALL ? [{ label: `Country: ${countryName}`, clear: () => setCountry(ALL) }] : []),
    ...(modality !== ALL ? [{ label: `Modality: ${modality === "none" ? "Not set" : modality}`, clear: () => setModality(ALL) }] : []),
    ...(status !== ALL ? [{ label: `Stage: ${status}`, clear: () => setStatus(ALL) }] : []),
    ...(cefr !== ALL ? [{ label: `English: ${cefr}`, clear: () => setCefr(ALL) }] : []),
    ...(experience !== ALL ? [{ label: `Teaching: ${experience}`, clear: () => setExperience(ALL) }] : []),
    ...(callcenterExp !== ALL ? [{ label: `Call center: ${callcenterExp}`, clear: () => setCallcenterExp(ALL) }] : []),
    ...(minScore ? [{ label: `Screening ≥ ${minScore}`, clear: () => setMinScore("") }] : []),
    ...(from ? [{ label: `Applied from ${from}`, clear: () => setFrom("") }] : []),
    ...(to ? [{ label: `Applied to ${to}`, clear: () => setTo("") }] : []),
    ...(owner !== ALL ? [{ label: `Owner: ${owner === "__unassigned" ? "Unassigned" : owner}`, clear: () => setOwner(ALL) }] : []),
    ...(requirement !== ALL ? [{ label: `Pending: ${requirement}`, clear: () => setRequirement(ALL) }] : []),
    ...(kpi ? [{ label: kpi === "new" ? "New applicants" : kpi === "pending" ? "Pending follow-up" : "Interviews scheduled", clear: () => setKpi(null) }] : []),
  ];
  const clearAll = () => chips.forEach((c) => c.clear());

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        <RecruitmentGoal />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-navy">Applicants</h1>
            <p className="text-sm text-muted-foreground">Manage applications and candidate follow-up.</p>
          </div>
          <Button asChild>
            <Link to="/candidates/new"><Plus className="mr-1.5 h-4 w-4" /> Add candidate</Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total applicants" value={counts.total} active={kpi === null && chips.length === 0} onClick={() => setKpi(null)} loading={isLoading} />
          <KpiCard label="New applicants" hint='Stage "New"' value={counts.new} active={kpi === "new"} onClick={() => setKpi(kpi === "new" ? null : "new")} loading={isLoading} />
          <KpiCard label="Pending follow-up" hint="Resume, grammar or internet pending" value={counts.pending} active={kpi === "pending"} onClick={() => setKpi(kpi === "pending" ? null : "pending")} loading={isLoading} />
          <KpiCard label="Interviews scheduled" hint="Upcoming, active bookings" value={counts.scheduled} active={kpi === "scheduled"} onClick={() => setKpi(kpi === "scheduled" ? null : "scheduled")} loading={isLoading} />
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="space-y-3 border-b border-border p-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search by name, email or phone" value={search} maxLength={120} onChange={(e) => setSearch(e.target.value)} aria-label="Search applicants" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger className="sm:w-40" aria-label="Country"><SelectValue placeholder="Country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All countries</SelectItem>
                    {countries.map((c) => <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={modality} onValueChange={setModality}>
                  <SelectTrigger className="sm:w-36" aria-label="Modality"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All modalities</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="onsite">Onsite</SelectItem>
                    <SelectItem value="none">Not set</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="col-span-2 sm:w-48" aria-label="Stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All stages</SelectItem>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" /> More filters
                </Button>
                <Button variant={archived ? "secondary" : "outline"} onClick={() => setArchived((v) => !v)} aria-pressed={archived}>
                  {archived ? "Viewing archived" : "Archived"}
                </Button>
              </div>
            </div>

            {showMore && (
              <div className="grid gap-3 rounded-md border border-border bg-secondary/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterSelect label="English level" value={cefr} onChange={setCefr} options={CEFR_FILTERS} />
                <FilterSelect label="Teaching experience" value={experience} onChange={setExperience} options={[...EXPERIENCE_OPTIONS]} />
                <FilterSelect label="Call center experience" value={callcenterExp} onChange={setCallcenterExp} options={[...EXPERIENCE_OPTIONS]} />
                <div className="space-y-1">
                  <Label className="text-xs">Minimum screening score</Label>
                  <Input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} placeholder="0–100" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Applied from</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Applied to</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Owner</Label>
                  <Select value={owner} onValueChange={setOwner}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any owner</SelectItem>
                      <SelectItem value="__unassigned">Unassigned</SelectItem>
                      {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <FilterSelect label="Pending requirement" value={requirement} onChange={setRequirement} options={["Resume", "Grammar test", "Internet test"]} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-navy">{isLoading ? "Loading…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}</span>
              {chips.map((c) => (
                <button key={c.label} type="button" onClick={c.clear} className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-2 py-0.5 text-xs hover:bg-muted" aria-label={`Remove filter ${c.label}`}>
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
              {chips.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearAll}>Clear filters</Button>
              )}
            </div>
          </div>

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-6 text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load candidates."}
              <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {chips.length ? "No applicants match these filters." : archived ? "No archived applicants." : "No applicants yet."}
              {chips.length > 0 && <div className="mt-3"><Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button></div>}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full text-sm md:table">
                <thead className="sticky top-14 z-10 bg-card text-left text-xs uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_var(--border)] lg:top-0">
                  <tr>
                    <SortTh label="Candidate" k="name" sort={sort} onSort={toggleSort} />
                    <SortTh label="Applied" k="applied" sort={sort} onSort={toggleSort} />
                    <th className="px-3 py-2 font-medium">Modality</th>
                    <SortTh label="English" k="english" sort={sort} onSort={toggleSort} />
                    <th className="px-3 py-2 font-medium">Stage</th>
                    <th className="px-3 py-2 font-medium">Next step</th>
                    <SortTh label="Interview" k="interview" sort={sort} onSort={toggleSort} />
                    <th className="hidden px-3 py-2 font-medium xl:table-cell">Owner</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => {
                    const sc = screeningLabel(c);
                    const step = nextStep(c);
                    const appt = upcomingInterview(c);
                    return (
                      <tr key={c.id} onClick={() => setSelectedId(c.id)} className={cn("cursor-pointer border-t border-border align-top transition-colors hover:bg-secondary/50", selectedId === c.id && "bg-secondary/60")}>
                        <td className="max-w-[260px] px-3 py-2.5">
                          <p className="truncate font-semibold text-navy">{c.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                          <p className="truncate text-xs text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ") || "Location not available"}</p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">{fmtDate(c.submitted_at)}</td>
                        <td className="px-3 py-2.5 text-xs capitalize">{c.work_modality ?? <span className="text-muted-foreground">Not set</span>}</td>
                        <td className="px-3 py-2.5">
                          <p className="text-xs"><span className="text-muted-foreground">Level </span><span className="font-semibold">{c.cefr ?? "Pending"}</span></p>
                          <p className="text-xs"><span className="text-muted-foreground">Screening </span><Tag tone={sc.tone} className="px-1 py-0">{sc.text}</Tag></p>
                        </td>
                        <td className="px-3 py-2.5"><Tag tone={stageTone(c.status)}>{c.status || "Not available"}</Tag></td>
                        <td className="px-3 py-2.5"><Tag tone={step.tone} className="whitespace-normal">{step.label}</Tag></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                          {appt ? <><p className="font-medium text-navy">{fmtDateTime(appt.starts_at)}</p><p className="text-muted-foreground">El Salvador time</p></> : <span className="text-muted-foreground">None</span>}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs xl:table-cell">{c.owner ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedId(c.id)}>View profile</Button>
                          <RowMenu c={c} canEvaluate={canEvaluate} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile cards */}
              <ul className="divide-y divide-border md:hidden">
                {visible.map((c) => {
                  const step = nextStep(c);
                  const appt = upcomingInterview(c);
                  return (
                    <li key={c.id} className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-navy">{c.full_name}</p>
                        <Tag tone={stageTone(c.status)}>{c.status || "Not available"}</Tag>
                      </div>
                      <p className="text-xs"><span className="text-muted-foreground">English level </span><span className="font-semibold">{c.cefr ?? "Pending"}</span></p>
                      <Tag tone={step.tone} className="whitespace-normal">{step.label}</Tag>
                      {appt && <p className="flex items-center gap-1 text-xs text-navy"><CalendarClock className="h-3.5 w-3.5" /> {fmtDateTime(appt.starts_at)} (El Salvador)</p>}
                      <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedId(c.id)}>View profile</Button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-sm">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  Rows per page
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span>{page * pageSize + 1}–{Math.min(rows.length, (page + 1) * pageSize)} of {rows.length}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </section>
        {data && data.length >= 500 && (
          <p className="text-xs text-muted-foreground">Showing the 500 most recent applications for these filters. Narrow the search to find older ones.</p>
        )}

        {isAdmin && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button type="button" className="group flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-navy shadow-sm hover:bg-secondary/40">
                Interviewer performance
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3"><AhtReport /></CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {selected && <ApplicantPanel c={selected} canEvaluate={canEvaluate} />}
        </SheetContent>
      </Sheet>
    </main>
  );
}

function KpiCard({ label, value, hint, active, onClick, loading }: { label: string; value: number; hint?: string; active: boolean; onClick: () => void; loading: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:border-navy/40", active ? "border-navy ring-1 ring-navy" : "border-border")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold text-navy">{loading ? "…" : value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
    </button>
  );
}

function SortTh({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2 font-medium" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase hover:text-navy", active && "text-navy")}>
        {label} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function interviewLink(a: Candidate["appointments"][number], applicationId: string) {
  return a.stage === "manager_final_filter"
    ? ({ to: "/second-filter/$applicationId", params: { applicationId } } as const)
    : ({ to: "/evaluations/$applicationId", params: { applicationId } } as const);
}

function RowMenu({ c, canEvaluate }: { c: Candidate; canEvaluate: boolean }) {
  const appt = upcomingInterview(c) ?? c.appointments[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More actions for ${c.full_name}`}><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link to="/candidates/$id" params={{ id: c.id }}>Open full profile</Link></DropdownMenuItem>
        {canEvaluate && appt && <DropdownMenuItem asChild><Link {...interviewLink(appt, c.id)}>View interview</Link></DropdownMenuItem>}
        {canEvaluate && <DropdownMenuItem asChild><Link to="/evaluations/$applicationId" params={{ applicationId: c.id }}>Open recruitment evaluation</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  );
}

function ApplicantPanel({ c, canEvaluate }: { c: Candidate; canEvaluate: boolean }) {
  const fetchActivity = useServerFn(getApplicantActivity);
  const activity = useQuery({ queryKey: ["applicant-activity", c.id], queryFn: () => fetchActivity({ data: { id: c.id } }) });
  const sc = screeningLabel(c);
  const step = nextStep(c);
  const pending = pendingRequirements(c);
  const appt = upcomingInterview(c);
  const missing = <span className="text-muted-foreground">Not available</span>;

  return (
    <div className="space-y-4">
      <SheetHeader className="space-y-2 text-left">
        <SheetTitle className="font-display text-xl text-navy">{c.full_name}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone={stageTone(c.status)}>{c.status || "Not available"}</Tag>
            <Tag tone="gray">{c.country || "Country not set"}</Tag>
            <Tag tone="gray">{c.work_modality ? c.work_modality[0]!.toUpperCase() + c.work_modality.slice(1) : "Modality not set"}</Tag>
            <Tag tone="gray">Owner: {c.owner ?? "Unassigned"}</Tag>
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
        <div>
          <p className="text-xs text-muted-foreground">Next step</p>
          <p className="text-sm font-semibold text-navy">{step.label}</p>
        </div>
        {canEvaluate && appt ? (
          <Button asChild size="sm"><Link {...interviewLink(appt, c.id)}>View interview</Link></Button>
        ) : (
          <Button asChild size="sm"><Link to="/candidates/$id" params={{ id: c.id }}>Open full profile</Link></Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="screening">Screening</TabsTrigger>
          <TabsTrigger value="interviews">Interviews</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-3 pt-3 sm:grid-cols-2">
          <Field label="Email">{c.email || missing}</Field>
          <Field label="Phone">{c.phone || missing}</Field>
          <Field label="Location">{[c.city, c.country].filter(Boolean).join(", ") || missing}</Field>
          <Field label="Applied">{fmtDate(c.submitted_at)}</Field>
          <Field label="Teaching / training experience">{c.teaching_experience || missing}</Field>
          <Field label="Call center experience">{c.callcenter_experience_level ?? (c.callcenter_experience ? "Yes" : "No experience")}</Field>
          <Field label="Has taught children">{c.taught_children == null ? missing : c.taught_children ? "Yes" : "No"}</Field>
          <Field label="Source">{c.source || missing}</Field>
        </TabsContent>

        <TabsContent value="screening" className="space-y-3 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="English level (AI screening)">{c.cefr ?? <span className="text-muted-foreground">Pending</span>}</Field>
            <Field label="Screening score (not a hiring decision)"><Tag tone={sc.tone}>{sc.text}</Tag></Field>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Requirements</p>
            <div className="flex flex-wrap gap-1.5">
              <Tag tone={c.resume_uploaded ? "green" : "amber"}>Resume: {c.resume_uploaded ? "Uploaded" : "Pending"}</Tag>
              <Tag tone={c.grammar_pending ? "amber" : "green"}>Grammar test: {c.grammar_pending ? "Pending" : "Verified"}</Tag>
              {c.work_modality === "online" && <Tag tone={c.internet_ready ? "green" : "amber"}>Internet: {c.internet_ready ? "Passed" : "Review needed"}</Tag>}
              {c.preparation_email_status && <Tag tone={c.preparation_email_status === "failed" ? "red" : "green"}>Preparation email: {c.preparation_email_status}</Tag>}
            </div>
            {pending.length === 0 && <p className="text-xs text-success">No pending requirements.</p>}
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/candidates/$id" params={{ id: c.id }}>Open CV, videos and full screening <ExternalLink className="ml-1 h-3.5 w-3.5" /></Link></Button>
        </TabsContent>

        <TabsContent value="interviews" className="space-y-2 pt-3">
          <p className="text-xs text-muted-foreground">Times shown in El Salvador time (UTC−6).</p>
          {c.appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interviews linked to this candidate.</p>
          ) : (
            c.appointments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5">
                <div>
                  <p className="text-sm font-medium text-navy">{fmtDateTime(a.starts_at)}</p>
                  <p className="text-xs text-muted-foreground">{a.stage === "manager_final_filter" ? "Manager final interview" : "Recruitment interview"} · {a.host ?? "Interviewer not set"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Tag tone={ACTIVE_APPT.includes(a.status) ? "blue" : a.status === "Completed" ? "green" : a.status.toLowerCase().includes("no") || a.status === "Canceled" ? "red" : "gray"}>{a.status}</Tag>
                  {canEvaluate && <Button asChild variant="outline" size="sm"><Link {...interviewLink(a, c.id)}>View interview</Link></Button>}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="activity" className="pt-3">
          {activity.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : activity.error ? (
            <p className="text-sm text-destructive">Could not load activity.</p>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
          ) : (
            <ol className="space-y-2 border-l border-border pl-4">
              {activity.data!.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-navy" />
                  <p className="text-sm font-medium">{e.action.replace(/[._]/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)} · {e.actor_email ?? "System"}</p>
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
