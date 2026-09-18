import { useState } from "react";
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
import {
  getCandidate,
  rerunAnalysis,
  updateCandidateStatus,
  updateGrammarTest,
  updateReferenceVerification,
} from "@/lib/recruiter.functions";
import { overrideEligibility, sendSchedulingLink } from "@/lib/interviews.functions";
import { getEvaluatorAccess } from "@/lib/evaluations.functions";
import {
  archiveCandidate,
  createRetakeInterview,
  listCandidateEmails,
  listInterviewAttempts,
  sendFollowUpEmail,
} from "@/lib/candidate-admin.functions";
import { isSchedulingEligible } from "@/lib/interviews";
import { buildFollowUpEmail } from "@/lib/candidate-emails";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cefrBand, cefrInternalLabel, scoreBand, SCORE_CATEGORIES, STATUS_OPTIONS } from "@/lib/recruitment";
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
  const loadEvaluatorAccess = useServerFn(getEvaluatorAccess);

  const evaluatorAccess = useQuery({
    queryKey: ["evaluator-access"],
    queryFn: () => loadEvaluatorAccess(),
  });

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
    callcenter_experience_level?: string | null;
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
          <div className="flex items-center gap-2">
          {evaluatorAccess.data?.canEvaluate && (
            <Button asChild size="sm">
              <Link to="/evaluations/$applicationId" params={{ applicationId: id }}>
                Start interview
              </Link>
            </Button>
          )}
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
                {app.city}, {app.country} · Teaching/training: {app.teaching_experience} · Call
                center: {app.callcenter_experience_level ??
                  (app.callcenter_experience ? "Yes" : "No experience")}
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

        {cefrInternalLabel(evaluation?.cefr) && (
          <p className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning-foreground">
            {cefrInternalLabel(evaluation?.cefr)}
          </p>
        )}

        <RecruitmentProcessPanel
          applicationId={id}
          progress={data.progress}
          references={data.references}
          resumeUrl={data.resumeUrl}
          systemInfoUrl={data.systemInfoUrl}
        />

        <CandidateManagementPanel
          applicationId={id}
          fullName={app.full_name}
          archivedAt={(app as { archived_at?: string | null }).archived_at ?? null}
          canEvaluate={Boolean(evaluatorAccess.data?.canEvaluate)}
        />

        <InterviewPanel applicationId={id} cefr={evaluation?.cefr ?? null} />


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

function CandidateManagementPanel({
  applicationId,
  archivedAt,
  canEvaluate,
}: {
  applicationId: string;
  archivedAt: string | null;
  canEvaluate: boolean;
}) {
  const queryClient = useQueryClient();
  const archive = useServerFn(archiveCandidate);
  const retake = useServerFn(createRetakeInterview);
  const sendEmail = useServerFn(sendFollowUpEmail);
  const loadAttempts = useServerFn(listInterviewAttempts);
  const loadEmails = useServerFn(listCandidateEmails);

  const [reason, setReason] = useState("");
  const [areas, setAreas] = useState("");
  const [emailKind, setEmailKind] = useState<"retake" | "not_approved">("retake");

  const attempts = useQuery({
    queryKey: ["attempts", applicationId],
    queryFn: () => loadAttempts({ data: { applicationId } }),
  });
  const emails = useQuery({
    queryKey: ["candidate-emails", applicationId],
    queryFn: () => loadEmails({ data: { applicationId } }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["candidate", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["attempts", applicationId] });
    queryClient.invalidateQueries({ queryKey: ["candidate-emails", applicationId] });
  };

  const archiveMutation = useMutation({
    mutationFn: () =>
      archive({ data: { applicationId, reason, restore: Boolean(archivedAt) } }),
    onSuccess: (r) => {
      toast.success(r.archived ? "Candidate archived." : "Candidate restored.");
      setReason("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retakeMutation = useMutation({
    mutationFn: () => retake({ data: { applicationId, note: reason } }),
    onSuccess: (r) => {
      toast.success(`Retake interview created (attempt ${r.attempt}). It starts at the Grammar Test.`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => sendEmail({ data: { applicationId, kind: emailKind, areas } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Follow-up email sent.");
      else toast.error(`Email not sent: ${r.detail}`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Candidate management</h2>
        {archivedAt && (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            Archived {new Date(archivedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs">Interview history</Label>
          {attempts.isLoading ? (
            <Skeleton className="h-16 w-full rounded-2xl" />
          ) : attempts.data?.length ? (
            <ul className="space-y-1.5 text-sm">
              {attempts.data.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-2xl border border-border px-3 py-2"
                >
                  <span>
                    Attempt {a.attempt_number ?? 1} · {a.status}
                    {a.final_result ? ` · ${a.final_result}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.interview_date ?? (a.created_at ? new Date(a.created_at).toLocaleDateString() : "")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No interviews yet.</p>
          )}
          {canEvaluate && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm" variant="outline" className="rounded-2xl">
                <Link to="/evaluations/$applicationId" params={{ applicationId }}>
                  {attempts.data?.length ? "Continue interview" : "Start interview"}
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-2xl"
                disabled={retakeMutation.isPending || !attempts.data?.length}
                onClick={() => retakeMutation.mutate()}
              >
                Create retake interview
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Follow-up email</Label>
          <Select value={emailKind} onValueChange={(v) => setEmailKind(v as "retake" | "not_approved")}>
            <SelectTrigger className="rounded-2xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retake">Retake — includes scheduling link</SelectItem>
              <SelectItem value="not_approved">Not approved — no link</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={areas}
            onChange={(e) => setAreas(e.target.value)}
            placeholder="Area of opportunity to include in the email"
            className="min-h-20 rounded-2xl"
          />
          <Button
            size="sm"
            className="rounded-2xl"
            disabled={emailMutation.isPending || !areas.trim()}
            onClick={() => emailMutation.mutate()}
          >
            Send follow-up email
          </Button>
          {emails.data?.length ? (
            <ul className="space-y-1 pt-1 text-xs text-muted-foreground">
              {emails.data.slice(0, 5).map((e) => (
                <li key={e.id}>
                  {new Date(e.created_at).toLocaleString()} · {e.kind} · {e.status}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <Label className="text-xs">{archivedAt ? "Restore candidate" : "Archive candidate"}</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="max-w-sm rounded-2xl"
          />
          <Button
            size="sm"
            variant={archivedAt ? "default" : "outline"}
            className="rounded-2xl"
            disabled={archiveMutation.isPending}
            onClick={() => archiveMutation.mutate()}
          >
            {archivedAt ? "Restore" : "Archive"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Archiving hides the candidate from the main list. Videos, resume, references, interviews
          and appointments are kept.
        </p>
      </div>
    </section>
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

/** Scheduling eligibility, manual override (note required) and secure link. */
function InterviewPanel({ applicationId, cefr }: { applicationId: string; cefr: string | null }) {
  const sendLink = useServerFn(sendSchedulingLink);
  const override = useServerFn(overrideEligibility);
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const eligible = isSchedulingEligible(cefr);

  const linkMutation = useMutation({
    mutationFn: () => sendLink({ data: { applicationId } }),
    onSuccess: (r) => {
      setLink(r.url ?? null);
      toast.success(r.sent ? "Scheduling link sent." : (r.email ?? "Not sent."));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const overrideMutation = useMutation({
    mutationFn: (approve: boolean) => override({ data: { applicationId, approve, note } }),
    onSuccess: () => {
      setNote("");
      toast.success("Eligibility override recorded in the audit log.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold">Interview</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {eligible
          ? `CEFR ${cefr} qualifies for an interview (B1 and above).`
          : `CEFR ${cefr ?? "pending"} is below B1 — not eligible unless a recruiter approves manually.`}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="rounded-2xl"
          disabled={linkMutation.isPending}
          onClick={() => linkMutation.mutate()}
        >
          Send scheduling link
        </Button>
        {link && (
          <a className="text-xs text-primary underline" href={link}>
            {link}
          </a>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs">Manual override note (required)</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are you approving or rejecting this candidate?"
          className="rounded-2xl"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="rounded-2xl"
            disabled={note.trim().length < 5 || overrideMutation.isPending}
            onClick={() => overrideMutation.mutate(true)}
          >
            Approve for interview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-2xl"
            disabled={note.trim().length < 5 || overrideMutation.isPending}
            onClick={() => overrideMutation.mutate(false)}
          >
            Reject
          </Button>
        </div>
      </div>
    </section>
  );
}

const GRAMMAR_STATUS_LABELS = [
  "Not started",
  "Link opened",
  "Candidate marked as completed",
  "Verified by recruiter",
] as const;

const REFERENCE_STATUS_LABELS = [
  "Pending verification",
  "Contacted",
  "Verified",
  "Unable to verify",
  "Invalid reference",
] as const;

/** Recruitment requirements: checklist progress, grammar test, resume, references. */
function RecruitmentProcessPanel({
  applicationId,
  progress,
  references,
  resumeUrl,
  systemInfoUrl,
}: {
  applicationId: string;
  progress: NonNullable<Awaited<ReturnType<typeof getCandidate>>["progress"]> | null;
  references: Awaited<ReturnType<typeof getCandidate>>["references"];
  resumeUrl: string | null;
  systemInfoUrl: string | null;
}) {
  const queryClient = useQueryClient();
  const saveGrammar = useServerFn(updateGrammarTest);
  const saveReference = useServerFn(updateReferenceVerification);
  const [score, setScore] = useState(progress?.grammar_test_score?.toString() ?? "");
  const [notes, setNotes] = useState(progress?.grammar_test_notes ?? "");

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["candidate", applicationId] });

  const grammarMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      saveGrammar({ data: { applicationId, ...patch } }),
    onSuccess: () => {
      toast.success("Grammar test updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refMutation = useMutation({
    mutationFn: (patch: { slot: number; verification_status?: string; verification_notes?: string }) =>
      saveReference({ data: { applicationId, ...patch } as never }),
    onSuccess: () => {
      toast.success("Reference updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onlineDevice =
    progress?.work_modality !== "online" ||
    (progress?.internet_speed_mbps != null && Boolean(progress?.system_info_path));
  const checklist = [
    {
      label: `Device confirmed (${progress?.work_modality === "onsite" ? "Onsite" : progress?.work_modality === "online" ? "Online" : "modality not selected"})`,
      done: Boolean(progress?.device_confirmed) && Boolean(progress?.work_modality),
    },
    { label: "Internet speed + system info (online only)", done: onlineDevice },
    { label: "Grammar Test completed", done: Boolean(progress?.grammar_test_confirmed) },
    { label: "Grammar topics reviewed", done: Boolean(progress?.grammar_topics_confirmed) },
    { label: "Resume uploaded", done: Boolean(progress?.resume_path) },
    { label: "Reference declaration", done: Boolean(progress?.references_declaration) },
  ];

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold">Recruitment requirements</h2>
      {!progress ? (
        <p className="text-sm text-muted-foreground">
          The candidate has not started the recruitment process yet.
        </p>
      ) : (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.map((item) => (
              <li key={item.label} className="text-sm">
                <span className={item.done ? "text-success" : "text-muted-foreground"}>
                  {item.done ? "✓" : "○"}
                </span>{" "}
                {item.label}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Scheduling status: <span className="font-medium text-foreground">{progress.scheduling_status}</span>
          </p>

          <div className="rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold">Device &amp; internet</h3>
            <div className="mt-1 space-y-1 text-sm text-muted-foreground">
              <p>
                Work modality:{" "}
                <span className="font-medium text-foreground">
                  {progress.work_modality === "online"
                    ? "Online coach"
                    : progress.work_modality === "onsite"
                      ? "Onsite coach"
                      : "Not selected"}
                </span>
              </p>
              {progress.work_modality === "online" && (
                <>
                  <p>
                    Internet speed:{" "}
                    <span className="font-medium text-foreground">
                      {progress.internet_speed_mbps != null
                        ? `${progress.internet_speed_mbps} Mbps (measured in the candidate's browser)`
                        : "Not measured yet"}
                    </span>
                  </p>
                  {progress.system_info_path && systemInfoUrl ? (
                    <p>
                      System info (processor / RAM):{" "}
                      <a
                        href={systemInfoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline"
                      >
                        {progress.system_info_filename ?? "Open screenshot"}
                      </a>{" "}
                      <span className="text-xs">(secure link, expires shortly)</span>
                    </p>
                  ) : (
                    <p>No system information screenshot uploaded yet.</p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold">Grammar Test</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Status: {progress.grammar_test_status}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={progress.grammar_test_status}
                  onValueChange={(value) => grammarMutation.mutate({ grammar_test_status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRAMMAR_STATUS_LABELS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full rounded-2xl"
                  disabled={grammarMutation.isPending}
                  onClick={() => grammarMutation.mutate({ grammar_test_verified: true })}
                >
                  Mark verified
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label className="text-xs">Internal note</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>
            <Button
              className="mt-3 rounded-2xl"
              disabled={grammarMutation.isPending}
              onClick={() =>
                grammarMutation.mutate({
                  grammar_test_score: score === "" ? null : Number(score),
                  grammar_test_notes: notes,
                })
              }
            >
              Save grammar test
            </Button>
          </div>

          <div className="rounded-2xl border border-border p-4">
            <h3 className="text-sm font-semibold">Resume</h3>
            {progress.resume_path && resumeUrl ? (
              <p className="mt-1 text-sm">
                <a
                  href={resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline"
                >
                  {progress.resume_filename ?? "Open resume"}
                </a>{" "}
                <span className="text-xs text-muted-foreground">(secure link, expires shortly)</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No resume uploaded yet.</p>
            )}
          </div>

          {[1, 2].map((slot) => {
            const reference = references.find((r) => r.slot === slot);
            return (
              <div key={slot} className="rounded-2xl border border-border p-4">
                <h3 className="text-sm font-semibold">
                  Work Reference {slot} — {slot === 1 ? "Most recent position" : "Previous position"}
                </h3>
                {!reference || !reference.company ? (
                  <p className="mt-1 text-sm text-muted-foreground">Not provided yet.</p>
                ) : (
                  <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                    <p className="text-foreground">
                      {reference.position} · {reference.company}
                    </p>
                    <p>
                      {reference.start_date ?? "—"} →{" "}
                      {reference.currently_working ? "Currently working" : (reference.end_date ?? "—")}
                    </p>
                    <p>
                      Supervisor: {reference.supervisor_name} · {reference.supervisor_phone} ·{" "}
                      {reference.supervisor_email}
                    </p>
                    <p>
                      Country: {reference.country_code ?? "—"} · May contact:{" "}
                      {reference.may_contact ? "Yes" : "No"}
                    </p>
                    <p>Reason for leaving: {reference.reason_for_leaving}</p>
                  </div>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Verification status</Label>
                    <Select
                      value={reference?.verification_status ?? "Pending verification"}
                      onValueChange={(value) =>
                        refMutation.mutate({ slot, verification_status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {REFERENCE_STATUS_LABELS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ReferenceNotes
                    initial={reference?.verification_notes ?? ""}
                    onSave={(value) => refMutation.mutate({ slot, verification_notes: value })}
                  />
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

function ReferenceNotes({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Private verification notes</Label>
      <Textarea value={value} maxLength={2000} onChange={(e) => setValue(e.target.value)} />
      <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => onSave(value)}>
        Save note
      </Button>
    </div>
  );
}
