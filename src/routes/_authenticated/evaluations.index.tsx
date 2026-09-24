import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, ClipboardList, Search, SlidersHorizontal } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
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
import { getEvaluatorAccess, listEvaluationQueue } from "@/lib/evaluations.functions";
import { EVALUATION_STATUSES } from "@/lib/evaluations";

export const Route = createFileRoute("/_authenticated/evaluations/")({
  head: () => ({
    meta: [
      { title: "E4CC Interviews — Evaluator workspace" },
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

function isToday(iso: string | null) {
  if (!iso) return false;
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function EvaluationsPage() {
  const navigate = useNavigate();
  const accessFn = useServerFn(getEvaluatorAccess);
  const queueFn = useServerFn(listEvaluationQueue);
  const { data: countries = [] } = useCountries();

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

  const { data, isLoading } = useQuery({
    queryKey: ["evaluation-queue", filters],
    queryFn: () => queueFn({ data: filters }),
    enabled: Boolean(access?.canView),
  });

  const rows = data?.rows ?? [];
  const groups = useMemo(
    () => [
      {
        title: "Today's interviews",
        items: rows.filter((r) => isToday(r.appointmentAt)),
      },
      {
        title: "Upcoming",
        items: rows.filter(
          (r) => r.appointmentAt && !isToday(r.appointmentAt) && r.appointmentAt > new Date().toISOString(),
        ),
      },
      { title: "In progress", items: rows.filter((r) => r.evaluationStatus === "In progress" || r.evaluationStatus === "Reopened") },
      { title: "Submitted", items: rows.filter((r) => r.evaluationStatus === "Submitted") },
      {
        title: "Retakes pending",
        items: rows.filter(
          (r) => r.finalResult === "Retake required" || r.evaluationStatus === "Retake pending",
        ),
      },
      {
        title: "Approved — Pending Second Filter",
        items: rows.filter((r) => r.finalResult === "Approved for last step"),
      },
      {
        title: "Not started",
        items: rows.filter(
          (r) =>
            r.evaluationStatus === "Not started" &&
            (!r.appointmentAt || r.appointmentAt < new Date().toISOString()) &&
            !isToday(r.appointmentAt),
        ),
      },
    ],
    [rows],
  );

  if (accessPending) {
    return (
      <main className="min-h-screen bg-secondary/30 p-6">
        <Skeleton className="h-32 w-full max-w-4xl" />
      </main>
    );
  }

  if (!access?.canView) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-5">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">E4CC Interviews</h1>
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

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">E4CC Interviews</p>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link to="/dashboard">
                <ClipboardList className="mr-2 h-4 w-4" /> Candidates
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/scorecard">
                <BarChart3 className="mr-2 h-4 w-4" /> Scorecard
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email or phone"
              value={search}
              maxLength={120}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Filters
          </Button>
        </div>

        {showFilters && (
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Label className="text-xs">Evaluation status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {EVALUATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : (
          groups.map((group) => (
            <section key={group.title} className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                {group.title}{" "}
                <span className="text-muted-foreground">({group.items.length})</span>
              </h2>
              {group.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
                  Nothing here yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2">Candidate</th>
                        <th className="px-4 py-2">Country / City</th>
                        <th className="px-4 py-2">Interview</th>
                        <th className="px-4 py-2">Level</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2 text-right">Score</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((r) => (
                        <tr key={`${group.title}-${r.applicationId}`} className="border-t border-border">
                          <td className="px-4 py-2">
                            <div className="font-medium">{r.fullName}</div>
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {r.country}
                            <div className="text-muted-foreground">{r.city}</div>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {r.appointmentAt
                              ? new Date(r.appointmentAt).toLocaleString()
                              : "Not scheduled"}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <Badge variant="secondary">{r.previousCefr ?? "—"}</Badge>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {r.evaluationStatus}
                            {r.finalResult ? (
                              <div className="text-muted-foreground">{r.finalResult}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-right text-xs">
                            {r.totalScore ?? "—"}
                            <div className="text-muted-foreground">
                              {r.complianceScore !== null ? `${r.complianceScore}% compl.` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void navigate({
                                  to: "/evaluations/$applicationId",
                                  params: { applicationId: r.applicationId },
                                })
                              }
                            >
                              {access.canEvaluate ? "Open" : "View"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </main>
  );
}
