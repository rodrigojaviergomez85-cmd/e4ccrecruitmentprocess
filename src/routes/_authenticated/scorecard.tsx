import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

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
import { CEFR_LEVELS, FINAL_RESULTS, NOT_APPROVED_REASONS } from "@/lib/evaluations";
import { resultLabel } from "@/lib/roles";
import { exportScorecardCsv, getScorecard, updateScorecardGoals } from "@/lib/scorecard.functions";
import { goalTone, type Goals } from "@/lib/scorecard-metrics";
import { formatDuration } from "@/components/InterviewTimer";
import { buildScorecardWorkbook } from "@/lib/scorecard-excel";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/scorecard")({
  head: () => ({
    meta: [
      { title: "Recruitment Scorecard — E4CC" },
      {
        name: "description",
        content: "Weekly and monthly E4CC recruitment reporting with evaluator compliance and CSV export.",
      },
      { property: "og:title", content: "Recruitment Scorecard — E4CC" },
      {
        property: "og:description",
        content: "Interview volume, results and evaluator compliance for E4CC recruitment.",
      },
    ],
  }),
  component: ScorecardPage,
});

const ALL = "all";

function range(kind: string) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startOfWeek = (ref: Date) => {
    const d = new Date(ref);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d;
  };
  if (kind === "this_week") {
    const s = startOfWeek(now);
    return { from: iso(s), to: iso(now) };
  }
  if (kind === "last_week") {
    const s = startOfWeek(now);
    const prev = new Date(s);
    prev.setUTCDate(s.getUTCDate() - 7);
    const end = new Date(s);
    end.setUTCDate(s.getUTCDate() - 1);
    return { from: iso(prev), to: iso(end) };
  }
  if (kind === "this_month") {
    return { from: `${iso(now).slice(0, 7)}-01`, to: iso(now) };
  }
  if (kind === "last_month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: iso(first), to: iso(last) };
  }
  return { from: "", to: "" };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

const TONE = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
} as const;

function GoalStat({ label, value, goal }: { label: string; value: number; goal: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${TONE[goalTone(value, goal)]}`}>{value}%</p>
      <p className="text-xs text-muted-foreground">Goal {goal}%</p>
    </div>
  );
}

function RateTable({
  title,
  rows,
  goal,
}: {
  title: string;
  rows: Array<{ label: string; total: number; completed: number; approved: number; rate: number }>;
  goal: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2">{title}</th>
            <th className="px-4 py-2">Interviews</th>
            <th className="px-4 py-2">Finished</th>
            <th className="px-4 py-2">Approved</th>
            <th className="px-4 py-2">Approval</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-3 text-xs text-muted-foreground">No data for this range.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-4 py-2">{r.label}</td>
              <td className="px-4 py-2">{r.total}</td>
              <td className="px-4 py-2">{r.completed}</td>
              <td className="px-4 py-2">{r.approved}</td>
              <td className={`px-4 py-2 font-semibold ${r.completed ? TONE[goalTone(r.rate, goal)] : ""}`}>
                {r.completed ? `${r.rate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ReportRow = {
  evaluator: string;
  scheduled: number;
  connected: number;
  attendanceRate: number;
  completed: number;
  approved: number;
  approvalRate: number;
  retake: number;
  notApproved: number;
  avgAhtSeconds: number;
  avgScore: number;
  avgCompliance: number;
};

function ScorecardReport({ rows, goals }: { rows: ReportRow[]; goals: Goals & { isAdmin?: boolean } }) {
  const saveFn = useServerFn(updateScorecardGoals);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Goals>(goals);
  const cell = (v: number, goal: number, has: boolean) =>
    `px-3 py-2 font-semibold ${has ? TONE[goalTone(v, goal)] : ""}`;
  async function save() {
    try {
      await saveFn({ data: draft });
      toast.success("Goals saved.");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["scorecard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Only Admin can change goals.");
    }
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Recruitment Scorecard report</h3>
          <p className="text-xs text-muted-foreground">
            Goals: attendance {goals.attendance}% · approval {goals.approval}% · compliance {goals.compliance}%.
            Green = goal met, yellow = close, red = below.
          </p>
        </div>
        {editing ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["attendance", "approval", "compliance"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 capitalize">
                {k}
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 w-16"
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
                />
              </label>
            ))}
            <Button size="sm" onClick={() => void save()}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setDraft(goals); setEditing(true); }}>
            Edit goals (Admin)
          </Button>
        )}
      </div>
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Recruiter</th>
            <th className="px-3 py-2">Scheduled</th>
            <th className="px-3 py-2">Connected</th>
            <th className="px-3 py-2">Attendance</th>
            <th className="px-3 py-2">Finished</th>
            <th className="px-3 py-2">Approved</th>
            <th className="px-3 py-2">Approval</th>
            <th className="px-3 py-2">Retake</th>
            <th className="px-3 py-2">Not approved</th>
            <th className="px-3 py-2">AHT</th>
            <th className="px-3 py-2">Avg. score</th>
            <th className="px-3 py-2">Compliance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={12} className="px-4 py-3 text-xs text-muted-foreground">No interviews in this range.</td></tr>
          )}
          {rows.map((e) => (
            <tr key={e.evaluator} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{e.evaluator || "—"}</td>
              <td className="px-3 py-2">{e.scheduled}</td>
              <td className="px-3 py-2">{e.connected}</td>
              <td className={cell(e.attendanceRate, goals.attendance, e.scheduled > 0)}>
                {e.scheduled ? `${e.attendanceRate}%` : "—"}
              </td>
              <td className="px-3 py-2">{e.completed}</td>
              <td className="px-3 py-2">{e.approved}</td>
              <td className={cell(e.approvalRate, goals.approval, e.completed > 0)}>
                {e.completed ? `${e.approvalRate}%` : "—"}
              </td>
              <td className="px-3 py-2">{e.retake}</td>
              <td className="px-3 py-2">{e.notApproved}</td>
              <td className="px-3 py-2 font-mono">{e.avgAhtSeconds ? formatDuration(e.avgAhtSeconds) : "—"}</td>
              <td className="px-3 py-2">{e.avgScore || "Pending"}</td>
              <td className={cell(e.avgCompliance, goals.compliance, e.completed > 0)}>
                {e.completed ? `${e.avgCompliance}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BarList({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No data for this range.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 10).map((i) => (
            <li key={i.label} className="text-xs">
              <div className="flex justify-between">
                <span>{i.label}</span>
                <span className="text-muted-foreground">{i.value}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-secondary">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${(i.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScorecardPage() {
  const reportFn = useServerFn(getScorecard);
  const exportFn = useServerFn(exportScorecardCsv);
  const { data: countries = [] } = useCountries();

  const [preset, setPreset] = useState("this_month");
  const [custom, setCustom] = useState(range("this_month"));
  const [evaluator, setEvaluator] = useState(ALL);
  const [country, setCountry] = useState(ALL);
  const [lob, setLob] = useState(ALL);
  const [englishLevel, setEnglishLevel] = useState(ALL);
  const [finalResult, setFinalResult] = useState(ALL);
  const [rejectionReason, setRejectionReason] = useState(ALL);

  const dates = preset === "custom" ? custom : range(preset);

  const filters = useMemo(
    () => ({
      ...(dates.from ? { from: dates.from } : {}),
      ...(dates.to ? { to: dates.to } : {}),
      ...(evaluator !== ALL ? { evaluator } : {}),
      ...(country !== ALL ? { country } : {}),
      ...(lob !== ALL ? { lob } : {}),
      ...(englishLevel !== ALL ? { englishLevel } : {}),
      ...(finalResult !== ALL ? { finalResult } : {}),
      ...(rejectionReason !== ALL ? { rejectionReason } : {}),
    }),
    [dates.from, dates.to, evaluator, country, lob, englishLevel, finalResult, rejectionReason],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["scorecard", filters],
    queryFn: () => reportFn({ data: filters }),
    retry: false,
  });

  async function exportCsv() {
    try {
      const res = await exportFn({ data: filters });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `e4cc-scorecard-${dates.from || "all"}_${dates.to || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} rows.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export the report.");
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-5">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Recruitment Scorecard</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "This report is not available."}
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  const s = data?.summary;

  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void exportCsv()}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Date range</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_week">This week</SelectItem>
                <SelectItem value="last_week">Last week</SelectItem>
                <SelectItem value="this_month">This month</SelectItem>
                <SelectItem value="last_month">Last month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={custom.from}
                  onChange={(e) => setCustom((p) => ({ ...p, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom((p) => ({ ...p, to: e.target.value }))}
                />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Evaluator</Label>
            <Select value={evaluator} onValueChange={setEvaluator}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All evaluators</SelectItem>
                {(data?.evaluators ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All countries</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">LOB</Label>
            <Select value={lob} onValueChange={setLob}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Live English level</Label>
            <Select value={englishLevel} onValueChange={setEnglishLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All levels</SelectItem>
                {CEFR_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Final result</Label>
            <Select value={finalResult} onValueChange={setFinalResult}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All results</SelectItem>
                {FINAL_RESULTS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {resultLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rejection reason</Label>
            <Select value={rejectionReason} onValueChange={setRejectionReason}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All reasons</SelectItem>
                {NOT_APPROVED_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {resultLabel(r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading || !s ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          <>
            <h2 className="text-sm font-semibold">Interviews (Calendly + manual)</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Total interviews" value={s.total} />
              <Stat label="Scheduled" value={s.scheduled} />
              <Stat label="Connected" value={s.connected} />
              <GoalStat label="Attendance rate" value={s.attendanceRate} goal={data.goals.attendance} />
              <Stat label="No Show" value={s.noShows} />
              <Stat label="Waiting List" value={s.waitingList} />
              <Stat label="Canceled" value={s.canceled} />
              <Stat label="From Calendly" value={s.calendly} />
              <Stat label="Manual" value={s.manual} />
              <Stat label="Finished interviews" value={s.completed} />
            </div>

            <h2 className="text-sm font-semibold">Results</h2>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <GoalStat label="Approval rate" value={s.approvalRate} goal={data.goals.approval} />
              <Stat label="Approved" value={s.approved} />
              <Stat label="Retake" value={`${s.retakes} (${s.retakeRate}%)`} />
              <Stat label="Not approved" value={`${s.notApproved} (${s.notApprovedRate}%)`} />
              <GoalStat label="Average compliance" value={s.avgCompliance} goal={data.goals.compliance} />
              <Stat label="Average score" value={s.avgScore || "Pending"} />
              <Stat label="Average Grammar Test" value={s.avgGrammarTest} />
              <Stat label="Pending second filter" value={s.pendingFinalInterview} />
              <Stat label="Approved by Manager" value={s.managerApproved} />
              <Stat label="Approved for Training" value={s.training} />
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Recruitment funnel</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {data.funnel.map((f, i) => (
                  <div key={f.label} className="rounded-xl bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-lg font-semibold">{f.value}</p>
                    {i > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {(data.funnel[i - 1]?.value ?? 0) ? Math.round((f.value / (data.funnel[i - 1]?.value ?? 0)) * 100) : 0}% of previous
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <h2 className="text-sm font-semibold">Approval rate by</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <RateTable title="Recruiter" rows={data.approvalBy.evaluator} goal={data.goals.approval} />
              <RateTable title="Country" rows={data.approvalBy.country} goal={data.goals.approval} />
              <RateTable title="LOB" rows={data.approvalBy.lob} goal={data.goals.approval} />
              <RateTable title="Week" rows={data.approvalBy.week} goal={data.goals.approval} />
              <RateTable title="Month" rows={data.approvalBy.month} goal={data.goals.approval} />
            </div>

            <h2 className="text-sm font-semibold">Approved profile ({s.approved})</h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <BarList title="LOB" items={data.approvedProfile.lob} />
              <BarList title="Country" items={data.approvedProfile.country} />
              <BarList title="Live English level" items={data.approvedProfile.level} />
              <BarList title="Experience" items={data.approvedProfile.experience} />
              <BarList title="Taught children" items={data.approvedProfile.children} />
              <BarList title="Score range" items={data.approvedProfile.score} />
              <BarList title="Referral source" items={data.approvedProfile.referral} />
            </div>

            <ScorecardReport rows={data.evaluatorCompliance} goals={data.goals} />

            <div className="grid gap-4 lg:grid-cols-2">
              <BarList title="Interviews by source" items={data.charts.bySource} />
              <BarList title="Live English level (all)" items={data.charts.byLiveLevel} />
              <BarList title="By city or branch" items={data.charts.byCity} />
              <BarList title="Top rejection reasons" items={data.charts.topRejectionReasons} />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
                Previous level vs live interview level
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Candidate</th>
                    <th className="px-4 py-2">Previous</th>
                    <th className="px-4 py-2">Live</th>
                    <th className="px-4 py-2">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.charts.levelComparison.map((r) => (
                    <tr key={r.candidate} className="border-t border-border">
                      <td className="px-4 py-2">{r.candidate}</td>
                      <td className="px-4 py-2">{r.previous}</td>
                      <td className="px-4 py-2">{r.live}</td>
                      <td className="px-4 py-2">
                        {r.delta === null ? "—" : `${r.delta > 0 ? "+" : ""}${r.delta}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>
        )}
      </div>
    </main>
  );
}
