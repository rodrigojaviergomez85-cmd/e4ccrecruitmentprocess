import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Download, Users } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
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
import { exportScorecardCsv, getScorecard } from "@/lib/scorecard.functions";

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
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">Recruitment scorecard</p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/evaluations">
                <Users className="mr-2 h-4 w-4" /> Evaluations
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">
                <ClipboardList className="mr-2 h-4 w-4" /> Candidates
              </Link>
            </Button>
            <Button size="sm" onClick={() => void exportCsv()}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
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
                    {r}
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
                    {r}
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
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Interviews scheduled" value={s.scheduled} />
              <Stat label="Interviews completed" value={s.completed} />
              <Stat label="Completion rate" value={`${s.completionRate}%`} />
              <Stat label="Approved" value={s.approved} />
              <Stat label="Retakes" value={s.retakes} />
              <Stat label="Not approved" value={s.notApproved} />
              <Stat label="Approval rate" value={`${s.approvalRate}%`} />
              <Stat label="Average candidate score" value={s.avgScore} />
              <Stat label="Average compliance" value={`${s.avgCompliance}%`} />
              <Stat label="Average Grammar Test" value={s.avgGrammarTest} />
              <Stat label="Pending final interview" value={s.pendingFinalInterview} />
              <Stat label="Pending retake" value={s.pendingRetake} />
              <Stat label="Teaching experience" value={`${s.teachingExperienceRate}%`} />
              <Stat label="Call center experience" value={`${s.callcenterExperienceRate}%`} />
              <Stat label="Equipment compliance (online)" value={`${s.equipmentComplianceRate}%`} />
              <Stat label="Grammar Test completion" value={`${s.grammarTestCompletionRate}%`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BarList title="Interviews by week" items={data.charts.byWeek} />
              <BarList title="Interviews by month" items={data.charts.byMonth} />
              <BarList title="Results by evaluator" items={data.charts.byEvaluator} />
              <BarList title="By country" items={data.charts.byCountry} />
              <BarList title="By city or branch" items={data.charts.byCity} />
              <BarList title="By LOB" items={data.charts.byLob} />
              <BarList title="Live English level distribution" items={data.charts.byLiveLevel} />
              <BarList title="Referral source performance" items={data.charts.byReferral} />
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

            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
                Evaluator compliance
              </h3>
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Evaluator</th>
                    <th className="px-4 py-2">Assigned</th>
                    <th className="px-4 py-2">Completed</th>
                    <th className="px-4 py-2">On interview date</th>
                    <th className="px-4 py-2">Avg. minutes</th>
                    <th className="px-4 py-2">Avg. compliance</th>
                    <th className="px-4 py-2">Missing docs</th>
                    <th className="px-4 py-2">Approved</th>
                    <th className="px-4 py-2">Retake</th>
                    <th className="px-4 py-2">Not approved</th>
                  </tr>
                </thead>
                <tbody>
                  {data.evaluatorCompliance.map((e) => (
                    <tr key={e.evaluator} className="border-t border-border">
                      <td className="px-4 py-2">{e.evaluator}</td>
                      <td className="px-4 py-2">{e.assigned}</td>
                      <td className="px-4 py-2">{e.completed}</td>
                      <td className="px-4 py-2">{e.onInterviewDate}</td>
                      <td className="px-4 py-2">{e.avgCompletionMinutes}</td>
                      <td className="px-4 py-2">{e.avgCompliance}%</td>
                      <td className="px-4 py-2">{e.missingDocumentation}</td>
                      <td className="px-4 py-2">{e.approved}</td>
                      <td className="px-4 py-2">{e.retake}</td>
                      <td className="px-4 py-2">{e.notApproved}</td>
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
