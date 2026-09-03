import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCandidate, rerunAnalysis, updateCandidateStatus } from "@/lib/recruiter.functions";
import { cefrBand, scoreBand, SCORE_CATEGORIES, STATUS_OPTIONS } from "@/lib/recruitment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/candidates/$id")({
  head: () => ({
    meta: [
      { title: "Candidate Review — E4CC" },
      {
        name: "description",
        content: "Watch candidate video answers, read transcripts and review the AI English level.",
      },
      { property: "og:title", content: "Candidate Review — E4CC" },
      { property: "og:description", content: "Detailed candidate review for E4CC staff." },
    ],
  }),
  component: CandidateDetail,
});

type Scores = Record<string, number>;

function CandidateDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchCandidate = useServerFn(getCandidate);
  const setStatus = useServerFn(updateCandidateStatus);
  const rerun = useServerFn(rerunAnalysis);

  const { data, isLoading, error } = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => fetchCandidate({ data: { id } }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: (typeof STATUS_OPTIONS)[number]) => setStatus({ data: { id, status } }),
    onSuccess: () => {
      toast.success("Status updated");
      void queryClient.invalidateQueries({ queryKey: ["candidate", id] });
      void queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not update status"),
  });

  const rerunMutation = useMutation({
    mutationFn: () => rerun({ data: { id } }),
    onSuccess: () => {
      toast.success("Analysis finished");
      void queryClient.invalidateQueries({ queryKey: ["candidate", id] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Analysis failed"),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-5">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Candidate not found."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const app = data.application as Record<string, unknown> & {
    full_name: string;
    email: string;
    phone: string;
    country: string;
    city: string;
    teaching_experience: string;
    taught_children: boolean;
    callcenter_experience: boolean;
    status: (typeof STATUS_OPTIONS)[number];
    submitted_at: string | null;
  };
  const evaluation = data.evaluation;
  const band = cefrBand(evaluation?.cefr ?? null);
  const scores = (evaluation?.scores ?? {}) as Scores;
  const rawEvidence = evaluation?.grammar_evidence;
  const detail = (
    rawEvidence && !Array.isArray(rawEvidence) ? rawEvidence : {}
  ) as {
    assessment_status?: string;
    audio_used?: boolean;
    audio_quality?: { usable?: boolean; issues?: string[]; recommended_status?: string } | null;
    errors?: Array<{
      category: string;
      example: string;
      severity: string;
      frequency: string;
    }>;
    justifications?: Record<string, string>;
    applied_caps?: string[];
    weighted_score?: number;
  };
  const legacyEvidence = Array.isArray(rawEvidence)
    ? (rawEvidence as Array<Record<string, string>>)
    : [];
  const assessmentStatus = detail.assessment_status ?? "Scored";
  const scored = assessmentStatus === "Scored";
  const recommendation = scoreBand(evaluation?.overall_score ?? null);


  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All candidates
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rerunMutation.mutate()}
            disabled={rerunMutation.isPending}
          >
            {rerunMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Re-run AI analysis
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{app.full_name}</h1>
              <p className="text-sm text-muted-foreground">
                {app.email} · {app.phone}
              </p>
              <p className="text-sm text-muted-foreground">
                {app.city}, {app.country} · {app.teaching_experience}
                {app.callcenter_experience ? " · Call center experience" : ""}
                {app.taught_children ? " · Has taught children" : ""}
              </p>
              {app.submitted_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {new Date(app.submitted_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label className="text-xs">Application status</Label>
              <Select
                value={app.status}
                onValueChange={(value) =>
                  statusMutation.mutate(value as (typeof STATUS_OPTIONS)[number])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-bold">AI English assessment</h2>
          {!evaluation || evaluation.state !== "done" ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {evaluation?.state === "error"
                ? `Analysis failed: ${evaluation.error_message ?? "unknown error"}`
                : "Analysis is still running. Refresh in a moment."}
            </p>
          ) : (
            <>
              {!scored && (
                <div className="mt-4 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
                  <p className="font-semibold">{assessmentStatus}</p>
                  <p className="mt-1 text-muted-foreground">
                    {(detail.audio_quality?.issues ?? []).join(" · ") ||
                      "Audio quality was not reliable enough to judge pronunciation. The score below is not final."}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "rounded-2xl px-4 py-2 text-lg font-extrabold",
                    band.tone === "success" && "bg-success/15 text-success",
                    band.tone === "warning" && "bg-warning/20 text-warning-foreground",
                    band.tone === "danger" && "bg-destructive/10 text-destructive",
                  )}
                >
                  {band.emoji} {evaluation.cefr}
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Estimated CEFR · {band.label}
                  </p>
                  <p className="font-semibold">
                    E4CC Proficiency Score:{" "}
                    {scored ? `${evaluation.overall_score}/100` : assessmentStatus}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Recommendation: {scored ? recommendation.label : "Pending manual review"}
                  </p>
                </div>
              </div>

              {(detail.applied_caps ?? []).length > 0 && (
                <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                  <h3 className="text-sm font-semibold text-destructive">Score adjustments</h3>
                  <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                    {(detail.applied_caps ?? []).map((cap, i) => (
                      <li key={i}>• {cap}</li>
                    ))}
                  </ul>
                  {detail.weighted_score != null && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Weighted average before caps: {detail.weighted_score}/100
                    </p>
                  )}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {SCORE_CATEGORIES.map((category) => {
                  const value = Number(scores[category.key] ?? 0);
                  const why = detail.justifications?.[category.key];
                  return (
                    <div key={category.key}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {category.label}{" "}
                          <span className="text-muted-foreground">({category.weight}%)</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{value}/100</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-primary"
                          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                        />
                      </div>
                      {why && <p className="mt-1 text-xs text-muted-foreground">{why}</p>}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <EvidenceList title="Strengths" items={evaluation.strengths as string[] | null} />
                <EvidenceList
                  title="Areas to review"
                  items={evaluation.areas_to_review as string[] | null}
                />
              </div>

              {(detail.errors ?? []).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold">Observed errors</h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3">Category</th>
                          <th className="py-1 pr-3">Example</th>
                          <th className="py-1 pr-3">Severity</th>
                          <th className="py-1">Frequency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.errors ?? []).map((item, i) => (
                          <tr key={i} className="border-t border-border align-top">
                            <td className="py-2 pr-3 font-medium">{item.category}</td>
                            <td className="py-2 pr-3 italic text-muted-foreground">
                              “{item.example}”
                            </td>
                            <td className="py-2 pr-3">{item.severity}</td>
                            <td className="py-2">{item.frequency}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {legacyEvidence.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold">Grammar evidence (previous rubric)</h3>
                  <ul className="mt-2 space-y-2">
                    {legacyEvidence.map((item, i) => (
                      <li
                        key={i}
                        className="rounded-2xl border border-border bg-secondary/40 p-3 text-sm"
                      >
                        <p className="italic text-muted-foreground">“{item['quote']}”</p>
                        <p className="mt-1">{item['issue']}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </>
          )}
        </section>

        {data.videos.map((video) => (
          <section
            key={video.slot}
            className="space-y-3 rounded-3xl border border-border bg-card p-5 shadow-sm"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Video {video.slot}
                {video.duration_seconds ? ` · ${Math.round(video.duration_seconds)}s` : ""}
              </p>
              <h2 className="mt-1 font-semibold">{video.question}</h2>
            </div>
            {video.url ? (
              <video
                src={video.url}
                controls
                playsInline
                className="w-full rounded-2xl border border-border bg-black"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Video unavailable.</p>
            )}
            <details className="rounded-2xl bg-secondary/40 p-4">
              <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {video.transcript ?? "Transcript not available yet."}
              </p>
            </details>
          </section>
        ))}
      </div>
    </main>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] | null }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {(items ?? []).length === 0 ? (
          <li>Not provided.</li>
        ) : (
          (items ?? []).map((item, i) => <li key={i}>• {item}</li>)
        )}
      </ul>
    </div>
  );
}
