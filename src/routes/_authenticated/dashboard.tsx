import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Search, SlidersHorizontal } from "lucide-react";

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
import { supabase } from "@/integrations/supabase/client";
import { listCandidates } from "@/lib/recruiter.functions";
import { cefrBand, scoreBand, EXPERIENCE_OPTIONS, STATUS_OPTIONS } from "@/lib/recruitment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Candidate Dashboard — English4Kids" },
      {
        name: "description",
        content: "Review teacher applications, AI English level estimates and video answers.",
      },
      { property: "og:title", content: "Candidate Dashboard — English4Kids" },
      { property: "og:description", content: "Internal recruitment dashboard for English4Kids." },
    ],
  }),
  component: Dashboard,
});

const ALL = "all";
const CEFR_FILTERS = ["A2", "B1", "B1+", "B2", "B2+", "C1", "C2"];

function Dashboard() {
  const navigate = useNavigate();
  const list = useServerFn(listCandidates);
  const [search, setSearch] = useState("");
  const [cefr, setCefr] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [experience, setExperience] = useState(ALL);
  const [taughtChildren, setTaughtChildren] = useState(ALL);
  const [minScore, setMinScore] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const filters = useMemo(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(cefr !== ALL ? { cefr } : {}),
      ...(status !== ALL ? { status } : {}),
      ...(experience !== ALL ? { experience } : {}),
      ...(taughtChildren !== ALL ? { taughtChildren: taughtChildren as "yes" | "no" } : {}),
      ...(minScore ? { minScore: Number(minScore) } : {}),
    }),
    [search, cefr, status, experience, taughtChildren, minScore],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidates", filters],
    queryFn: () => list({ data: filters }),
  });

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <span className="font-display text-base font-extrabold">
              English<span className="text-brand">4</span>Kids
            </span>
            <p className="text-xs text-muted-foreground">Recruitment dashboard</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or email"
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
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
            <FilterSelect
              label="CEFR level"
              value={cefr}
              onChange={setCefr}
              options={CEFR_FILTERS}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[...STATUS_OPTIONS]}
            />
            <FilterSelect
              label="Experience"
              value={experience}
              onChange={setExperience}
              options={[...EXPERIENCE_OPTIONS]}
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Taught children</Label>
              <Select value={taughtChildren} onValueChange={setTaughtChildren}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Minimum score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                placeholder="0-100"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load candidates."}
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {data && data.length === 0 && (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No candidates match these filters yet.
          </p>
        )}

        <div className="space-y-3">
          {data?.map((candidate) => {
            const band = cefrBand(candidate.cefr);
            return (
              <Link
                key={candidate.id}
                to="/candidates/$id"
                params={{ id: candidate.id }}
                className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{candidate.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {candidate.email} · {candidate.country}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.teaching_experience}
                      {candidate.taught_children ? " · Has taught children" : ""}
                      {candidate.submitted_at
                        ? ` · ${new Date(candidate.submitted_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        band.tone === "success" && "bg-success/15 text-success",
                        band.tone === "warning" && "bg-warning/20 text-warning-foreground",
                        band.tone === "danger" && "bg-destructive/10 text-destructive",
                      )}
                    >
                      {band.emoji} {candidate.cefr ?? "—"}
                    </span>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                      {candidate.status}
                    </span>
                    {candidate.assessment_status !== "Scored" ? (
                      <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-warning-foreground">
                        {candidate.assessment_status}
                      </span>
                    ) : (
                      candidate.overall_score != null && (
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          {candidate.overall_score}/100 · {scoreBand(candidate.overall_score).label}
                        </span>
                      )
                    )}
                    {candidate.evaluation_state === "error" && (
                      <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                        Analysis failed
                      </span>
                    )}
                    {(candidate.evaluation_state === "pending" ||
                      candidate.evaluation_state === "running") && (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                        Analyzing…
                      </span>
                    )}

                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
