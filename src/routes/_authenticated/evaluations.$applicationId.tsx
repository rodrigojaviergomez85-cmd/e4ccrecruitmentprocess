import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Loader2, Lock, Save, Unlock } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CEFR_LEVELS,
  DEFAULT_WEIGHTS,
  E4CC_VALUES,
  ENGLISH_ACTIVITIES,
  FINAL_RESULTS,
  HIRING_BONUS_OPTIONS,
  NOT_APPROVED_REASONS,
  SCORE_CATEGORY_LABELS,
  SECTIONS,
  WRITING_TOPICS,
  complianceItems,
  complianceScore,
  levelDifference,
  missingRequired,
  totalScore,
  verbStats,
  type Weights,
} from "@/lib/evaluations";
import { openEvaluation, reopenEvaluation, saveEvaluation } from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/evaluations/$applicationId")({
  head: () => ({
    meta: [
      { title: "Live Interview Evaluation — E4CC" },
      {
        name: "description",
        content: "Guided E4CC live interview evaluation form with scoring and compliance tracking.",
      },
      { property: "og:title", content: "Live Interview Evaluation — E4CC" },
      {
        property: "og:description",
        content: "Section-by-section evaluation of an E4CC candidate interview.",
      },
    ],
  }),
  component: EvaluationForm,
});

type Sections = Record<string, Record<string, unknown>>;
type JobRow = {
  slot: number;
  company: string;
  start_date: string;
  end_date: string;
  position: string;
  hired_to_do: string;
  accomplishment: string;
  biggest_mistake: string;
  supervisor_name: string;
  supervisor_contact: string;
  supervisor_rating: number | null;
  rating_reason: string;
  reason_for_leaving: string;
  gap_explanation: string;
};

const emptyJob = (slot: number): JobRow => ({
  slot,
  company: "",
  start_date: "",
  end_date: "",
  position: "",
  hired_to_do: "",
  accomplishment: "",
  biggest_mistake: "",
  supervisor_name: "",
  supervisor_contact: "",
  supervisor_rating: null,
  rating_reason: "",
  reason_for_leaving: "",
  gap_explanation: "",
});

const YES_NO = ["Yes", "No"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function EvaluationForm() {
  const { applicationId } = useParams({ from: "/_authenticated/evaluations/$applicationId" });
  const openFn = useServerFn(openEvaluation);
  const saveFn = useServerFn(saveEvaluation);
  const reopenFn = useServerFn(reopenEvaluation);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["evaluation", applicationId],
    queryFn: () => openFn({ data: { applicationId } }),
    retry: false,
  });

  const [sections, setSections] = useState<Sections>({});
  const [verbs, setVerbs] = useState<Array<{ verb: string; correct: boolean }>>([]);
  const [jobs, setJobs] = useState<JobRow[]>([emptyJob(1)]);
  const [liveCefr, setLiveCefr] = useState<string>("");
  const [finalResult, setFinalResult] = useState<string>("");
  const [notApprovedReasons, setNotApprovedReasons] = useState<string[]>([]);
  const [retakeDate, setRetakeDate] = useState("");
  const [hiringBonus, setHiringBonus] = useState("");
  const [lastRoleplayDate, setLastRoleplayDate] = useState("");
  const [interviewDate, setInterviewDate] = useState("");
  const [comments, setComments] = useState("");
  const [redFlags, setRedFlags] = useState("");
  const [categoryScores, setCategoryScores] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evaluation = data?.evaluation ?? null;
  const candidate = data?.candidate ?? null;
  const weights: Weights = (data?.weights as Weights) ?? DEFAULT_WEIGHTS;
  const locked = evaluation?.status === "Submitted" || !data?.access.canEvaluate;

  useEffect(() => {
    if (!evaluation || hydrated) return;
    setSections((evaluation.sections as Sections) ?? {});
    setVerbs(evaluation.verbs?.length ? evaluation.verbs : Array.from({ length: 5 }, () => ({ verb: "", correct: false })));
    setJobs(evaluation.jobs?.length ? (evaluation.jobs as unknown as JobRow[]) : [emptyJob(1)]);
    setLiveCefr(evaluation.live_cefr ?? "");
    setFinalResult(evaluation.final_result ?? "");
    setNotApprovedReasons((evaluation.not_approved_reasons as string[]) ?? []);
    setRetakeDate(evaluation.retake_date ?? "");
    setHiringBonus(evaluation.hiring_bonus ?? "");
    setLastRoleplayDate(evaluation.last_roleplay_date ?? "");
    setInterviewDate(
      evaluation.interview_date ??
        (candidate?.appointmentAt ? candidate.appointmentAt.slice(0, 10) : ""),
    );
    setComments(evaluation.comments ?? "");
    setRedFlags(evaluation.red_flags ?? "");
    setCategoryScores((evaluation.category_scores as Record<string, number>) ?? {});
    setHydrated(true);
  }, [evaluation, candidate, hydrated]);

  const lobRaw = String(sections["candidate"]?.["lob"] ?? candidate?.lob ?? "");
  const isOnline = lobRaw.toLowerCase() === "online";

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !("onlineOnly" in s && s.onlineOnly) || isOnline),
    [isOnline],
  );

  const stats = verbStats(verbs);
  const complianceInput = {
    sections,
    isOnline,
    verbs,
    jobsCount: jobs.filter((j) => j.company.trim() || j.position.trim()).length,
    finalResult,
    comments,
    redFlags,
    lastRoleplayDate,
    retakeDate,
  };
  const compliance = complianceScore(complianceInput);
  const items = complianceItems(complianceInput);
  const missing = missingRequired(complianceInput);
  const total = totalScore(categoryScores, weights);
  const delta = levelDifference(candidate?.previousCefr, liveCefr);

  const payload = useCallback(
    (submit: boolean) => ({
      evaluationId: evaluation?.id ?? "",
      sections,
      verbs,
      jobs,
      liveCefr: liveCefr || null,
      finalResult: finalResult || null,
      notApprovedReasons,
      retakeDate: retakeDate || null,
      hiringBonus: hiringBonus || null,
      lastRoleplayDate: lastRoleplayDate || null,
      interviewDate: interviewDate || null,
      comments: comments || null,
      redFlags: redFlags || null,
      categoryScores,
      submit,
    }),
    [
      evaluation?.id,
      sections,
      verbs,
      jobs,
      liveCefr,
      finalResult,
      notApprovedReasons,
      retakeDate,
      hiringBonus,
      lastRoleplayDate,
      interviewDate,
      comments,
      redFlags,
      categoryScores,
    ],
  );

  // Autosave drafts a moment after the evaluator stops typing.
  useEffect(() => {
    if (!hydrated || locked || !evaluation?.id) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSaveState("saving");
      void saveFn({ data: payload(false) })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [payload, hydrated, locked, evaluation?.id, saveFn]);

  async function submit() {
    if (missing.length) {
      toast.error(`Missing required information: ${missing.join(", ")}`);
      return;
    }
    setSaveState("saving");
    try {
      const res = await saveFn({ data: payload(true) });
      if (!res.ok) {
        setSaveState("error");
        toast.error(`Missing required information: ${res.missing.join(", ")}`);
        return;
      }
      setSaveState("saved");
      toast.success("Evaluation submitted. It is now read-only.");
      await refetch();
    } catch (e) {
      setSaveState("error");
      toast.error(e instanceof Error ? e.message : "Could not submit the evaluation.");
    }
  }

  async function reopen() {
    const reason = window.prompt("Reason for reopening this evaluation:");
    if (!reason || reason.trim().length < 5) return;
    try {
      await reopenFn({ data: { evaluationId: evaluation!.id, reason: reason.trim() } });
      toast.success("Evaluation reopened.");
      setHydrated(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reopen the evaluation.");
    }
  }

  const set = (section: string, key: string, value: unknown) =>
    setSections((prev) => ({ ...prev, [section]: { ...(prev[section] ?? {}), [key]: value } }));
  const get = (section: string, key: string) => sections[section]?.[key];
  const str = (section: string, key: string) => String(get(section, key) ?? "");

  if (isPending) {
    return (
      <main className="min-h-screen bg-secondary/30 p-6">
        <Skeleton className="h-64 w-full max-w-4xl rounded-2xl" />
      </main>
    );
  }

  if (error || !candidate) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-5">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Evaluation not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "This candidate could not be loaded."}
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/evaluations">Back to evaluations</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!evaluation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-5">
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">No evaluation yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This candidate has no evaluation and your account cannot create one.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link to="/evaluations">Back to evaluations</Link>
          </Button>
        </div>
      </main>
    );
  }

  const current = visibleSections[Math.min(step, visibleSections.length - 1)]!;
  const progress = Math.round(((step + 1) / visibleSections.length) * 100);

  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">Live interview evaluation</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={evaluation.status === "Submitted" ? "default" : "secondary"}>
              {evaluation.status}
            </Badge>
            {locked ? (
              <span className="flex items-center text-xs text-muted-foreground">
                <Lock className="mr-1 h-3 w-3" /> Read-only
              </span>
            ) : (
              <span className="flex items-center text-xs text-muted-foreground">
                {saveState === "saving" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                {saveState === "saved" && <Check className="mr-1 h-3 w-3" />}
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "saved"
                    ? "Draft saved"
                    : saveState === "error"
                      ? "Could not save"
                      : "Autosave on"}
              </span>
            )}
            {data.access.isAdmin && evaluation.status === "Submitted" && (
              <Button size="sm" variant="outline" onClick={() => void reopen()}>
                <Unlock className="mr-2 h-4 w-4" /> Reopen
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link to="/evaluations">Close</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-5 py-6">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{candidate.fullName}</h1>
              <p className="text-xs text-muted-foreground">
                {candidate.email} · {candidate.phone} · {candidate.country} / {candidate.city}
              </p>
              <p className="text-xs text-muted-foreground">
                Interview:{" "}
                {candidate.appointmentAt
                  ? new Date(candidate.appointmentAt).toLocaleString()
                  : "not scheduled"}{" "}
                · Evaluator: {evaluation.evaluatorName || "—"}
              </p>
            </div>
            <div className="text-right text-xs">
              <div>
                Previous level: <strong>{candidate.previousCefr ?? "—"}</strong>
              </div>
              <div>
                Live level: <strong>{liveCefr || "—"}</strong>{" "}
                {delta !== null ? `(${delta > 0 ? "+" : ""}${delta} steps)` : ""}
              </div>
              <div>
                Score: <strong>{total}</strong>/100 · Compliance: <strong>{compliance}%</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Progress value={progress} />
          <div className="flex flex-wrap gap-1">
            {visibleSections.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStep(i)}
                className={`rounded-full px-3 py-1 text-xs ${
                  i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset
          disabled={locked}
          className="space-y-4 rounded-2xl border border-border bg-card p-5 disabled:opacity-90"
        >
          <h2 className="text-base font-semibold">{current.label}</h2>

          {current.key === "candidate" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Interview date">
                <Input
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </Field>
              <Field label="Evaluator">
                <Input value={evaluation.evaluatorName || ""} readOnly />
              </Field>
              <Field label="Candidate">
                <Input value={candidate.fullName} readOnly />
              </Field>
              <Field label="Referral or external lead source">
                <Input
                  value={str("candidate", "referral_source")}
                  maxLength={80}
                  onChange={(e) => set("candidate", "referral_source", e.target.value)}
                />
              </Field>
              <Field label="Country">
                <Input value={candidate.country} readOnly />
              </Field>
              <Field label="City or assigned branch">
                <Input
                  value={str("candidate", "branch") || candidate.city || ""}
                  onChange={(e) => set("candidate", "branch", e.target.value)}
                />
              </Field>
              <Field label="LOB">
                <Select
                  value={lobRaw}
                  onValueChange={(v) => set("candidate", "lob", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="onsite">Onsite</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Schedule selected">
                <Input
                  value={str("candidate", "schedule")}
                  onChange={(e) => set("candidate", "schedule", e.target.value)}
                />
              </Field>
              <Field label="Training start date">
                <Input
                  type="date"
                  value={str("candidate", "training_start")}
                  onChange={(e) => set("candidate", "training_start", e.target.value)}
                />
              </Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                  checked={Boolean(get("candidate", "reviewed"))}
                  onCheckedChange={(v) => set("candidate", "reviewed", Boolean(v))}
                />
                <span className="text-sm">
                  Applicant information reviewed (resume: {candidate.resumeFilename ?? "not uploaded"},{" "}
                  {candidate.references.length} work references)
                </span>
              </div>
            </div>
          )}

          {current.key === "equipment" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Minimum recommendation: Intel i3 8th gen or newer (or AMD Ryzen 3 equivalent), 8 GB
                RAM, stable camera and microphone, and the internet speed configured by E4CC.
                Candidate self-reported speed: {candidate.internetSpeed ?? "—"} Mbps.
              </p>
              <Field label="Download speed (Mbps)">
                <Input
                  value={str("equipment", "download")}
                  onChange={(e) => set("equipment", "download", e.target.value)}
                />
              </Field>
              <Field label="Upload speed (Mbps)">
                <Input
                  value={str("equipment", "upload")}
                  onChange={(e) => set("equipment", "upload", e.target.value)}
                />
              </Field>
              <Field label="Processor">
                <Input
                  value={str("equipment", "processor")}
                  onChange={(e) => set("equipment", "processor", e.target.value)}
                />
              </Field>
              <Field label="RAM">
                <Input
                  value={str("equipment", "ram")}
                  onChange={(e) => set("equipment", "ram", e.target.value)}
                />
              </Field>
              <Field label="Operating system">
                <Input
                  value={str("equipment", "os")}
                  onChange={(e) => set("equipment", "os", e.target.value)}
                />
              </Field>
              <Field label="Meets PC / internet requirements">
                <Select
                  value={str("equipment", "meets_requirements")}
                  onValueChange={(v) => set("equipment", "meets_requirements", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Evaluator notes">
                <Textarea
                  className="sm:col-span-2"
                  value={str("equipment", "notes")}
                  onChange={(e) => set("equipment", "notes", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "grammar_test" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <p className="text-xs text-muted-foreground sm:col-span-2">
                From the candidate profile — status: {candidate.grammarTestStatus ?? "—"}, score:{" "}
                {candidate.grammarTestScore ?? "—"}, verified:{" "}
                {candidate.grammarTestVerified ? "Yes" : "No"}. Results are entered manually; there
                is no automatic TestGorilla verification.
              </p>
              <Field label="Completed">
                <Select
                  value={str("grammar_test", "completed")}
                  onValueChange={(v) => set("grammar_test", "completed", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Score">
                <Input
                  value={str("grammar_test", "score")}
                  onChange={(e) => set("grammar_test", "score", e.target.value)}
                />
              </Field>
              <Field label="Verified by evaluator">
                <Select
                  value={str("grammar_test", "verified")}
                  onValueChange={(v) => set("grammar_test", "verified", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Internal notes">
                <Textarea
                  value={str("grammar_test", "notes")}
                  onChange={(e) => set("grammar_test", "notes", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "profile" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Professional English teaching experience">
                <Select
                  value={str("profile", "teaching_experience")}
                  onValueChange={(v) => set("profile", "teaching_experience", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Call center experience">
                <Select
                  value={str("profile", "callcenter_experience")}
                  onValueChange={(v) => set("profile", "callcenter_experience", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Main job schedule">
                <Select
                  value={str("profile", "main_schedule")}
                  onValueChange={(v) => set("profile", "main_schedule", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Availability required">
                <Select
                  value={str("profile", "availability_required")}
                  onValueChange={(v) => set("profile", "availability_required", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Agrees with payment and agreement">
                <Select
                  value={str("profile", "agrees_payment")}
                  onValueChange={(v) => set("profile", "agrees_payment", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {YES_NO.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Training start date">
                <Input
                  type="date"
                  value={str("profile", "training_start")}
                  onChange={(e) => set("profile", "training_start", e.target.value)}
                />
              </Field>
              <Field label="Teaching with positive energy after a difficult day">
                <Textarea
                  value={str("profile", "energy_answer")}
                  onChange={(e) => set("profile", "energy_answer", e.target.value)}
                />
              </Field>
              <Field label="Routine before teaching">
                <Textarea
                  value={str("profile", "routine_answer")}
                  onChange={(e) => set("profile", "routine_answer", e.target.value)}
                />
              </Field>
              <Field label="Commitment sustainability for at least six months (1–10)">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={str("profile", "commitment_score")}
                  onChange={(e) => set("profile", "commitment_score", e.target.value)}
                />
              </Field>
              <Field label="Explanation">
                <Textarea
                  value={str("profile", "commitment_reason")}
                  onChange={(e) => set("profile", "commitment_reason", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "english" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Irregular verbs (5 to 10)</h3>
                <p className="text-xs text-muted-foreground">
                  Evaluated: {stats.evaluated} · Correct: {stats.correct} · Incorrect:{" "}
                  {stats.incorrect} · Accuracy: {stats.accuracy}%
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {verbs.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder={`Verb ${i + 1}`}
                        value={v.verb}
                        maxLength={60}
                        onChange={(e) =>
                          setVerbs((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, verb: e.target.value } : row,
                            ),
                          )
                        }
                      />
                      <Select
                        value={v.correct ? "Correct" : "Incorrect"}
                        onValueChange={(val) =>
                          setVerbs((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, correct: val === "Correct" } : row,
                            ),
                          )
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Correct">Correct</SelectItem>
                          <SelectItem value="Incorrect">Incorrect</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {verbs.length < 10 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setVerbs((prev) => [...prev, { verb: "", correct: false }])}
                  >
                    Add verb
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {ENGLISH_ACTIVITIES.map((a) => (
                  <Field key={a.key} label={a.label}>
                    <Textarea
                      value={str("english", a.key)}
                      onChange={(e) => set("english", a.key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Three-minute writing test — topic">
                  <Select
                    value={str("english", "writing_topic")}
                    onValueChange={(v) => set("english", "writing_topic", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {WRITING_TOPICS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Writing test notes">
                  <Textarea
                    value={str("english", "writing_notes")}
                    onChange={(e) => set("english", "writing_notes", e.target.value)}
                  />
                </Field>
                <Field label="Evaluator notes">
                  <Textarea
                    value={str("english", "notes")}
                    onChange={(e) => set("english", "notes", e.target.value)}
                  />
                </Field>
                <Field
                  label="Final English level (live interview)"
                  hint={`Recorded-video level: ${candidate.previousCefr ?? "—"}. Both results are kept for comparison.`}
                >
                  <Select
                    value={liveCefr}
                    onValueChange={(v) => {
                      setLiveCefr(v);
                      set("english", "level", v);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {CEFR_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Meets the required English level">
                  <Select
                    value={str("english", "meets_level")}
                    onValueChange={(v) => set("english", "meets_level", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {YES_NO.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {current.key === "studies" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="School or university">
                <Input
                  value={str("studies", "school")}
                  onChange={(e) => set("studies", "school", e.target.value)}
                />
              </Field>
              <Field label="Major or area of study">
                <Input
                  value={str("studies", "major")}
                  onChange={(e) => set("studies", "major", e.target.value)}
                />
              </Field>
              <Field label="Years attended">
                <Input
                  value={str("studies", "years")}
                  onChange={(e) => set("studies", "years", e.target.value)}
                />
              </Field>
              <Field label="Additional studies, courses or certifications">
                <Textarea
                  value={str("studies", "additional")}
                  onChange={(e) => set("studies", "additional", e.target.value)}
                />
              </Field>
              <Field label="TESOL / CELTA or other relevant certifications">
                <Textarea
                  value={str("studies", "certifications")}
                  onChange={(e) => set("studies", "certifications", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "jobs" && (
            <div className="space-y-4">
              {jobs.map((job, i) => (
                <div key={job.slot} className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Position {i + 1}</h3>
                    {jobs.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setJobs((prev) =>
                            prev
                              .filter((_, idx) => idx !== i)
                              .map((j, idx) => ({ ...j, slot: idx + 1 })),
                          )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(
                      [
                        ["company", "Company", false],
                        ["position", "Position", false],
                        ["start_date", "Start date", false],
                        ["end_date", "End date", false],
                        ["hired_to_do", "What was the candidate hired to do", true],
                        ["accomplishment", "Most important accomplishment (measurable)", true],
                        ["biggest_mistake", "Biggest mistake or failure and what they did after", true],
                        ["supervisor_name", "Direct supervisor's name", false],
                        ["supervisor_contact", "Supervisor's contact information", false],
                        ["rating_reason", "Why would the supervisor give that rating", true],
                        ["reason_for_leaving", "Reason for leaving", true],
                        ["gap_explanation", "Employment gaps and explanation", true],
                      ] as Array<[keyof JobRow, string, boolean]>
                    ).map(([key, label, isArea]) => (
                      <Field key={String(key)} label={label}>
                        {isArea ? (
                          <Textarea
                            value={String(job[key] ?? "")}
                            onChange={(e) =>
                              setJobs((prev) =>
                                prev.map((j, idx) =>
                                  idx === i ? { ...j, [key]: e.target.value } : j,
                                ),
                              )
                            }
                          />
                        ) : (
                          <Input
                            value={String(job[key] ?? "")}
                            onChange={(e) =>
                              setJobs((prev) =>
                                prev.map((j, idx) =>
                                  idx === i ? { ...j, [key]: e.target.value } : j,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                    ))}
                    <Field label="Expected supervisor rating (1–10)">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={job.supervisor_rating ?? ""}
                        onChange={(e) =>
                          setJobs((prev) =>
                            prev.map((j, idx) =>
                              idx === i
                                ? {
                                    ...j,
                                    supervisor_rating: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  }
                                : j,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
              {jobs.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setJobs((prev) => [...prev, emptyJob(prev.length + 1)])}
                >
                  Add another position
                </Button>
              )}
            </div>
          )}

          {current.key === "values" && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["looking", "Why is the candidate currently looking for a job"],
                    ["why_e4cc", "Why did they apply specifically to E4CC"],
                    ["attracted", "What attracted them to this role"],
                    ["goals", "Career goals for the next two to five years"],
                    ["teaching_fit", "How does teaching fit into those goals"],
                    ["energy", "How do they manage energy and work-life balance"],
                    ["learning", "Last book, course or resource and what they learned"],
                    ["anything_else", "Anything else E4CC should know"],
                    ["questions", "Questions from the candidate"],
                  ] as Array<[string, string]>
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Textarea
                      value={str("values", key)}
                      onChange={(e) => set("values", key, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {E4CC_VALUES.map((v) => (
                  <Field key={v.key} label={`${v.label} (1–5)`}>
                    <Select
                      value={str("values", v.key)}
                      onValueChange={(val) => set("values", v.key, val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Rate" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
              <Field label="Private evaluator notes">
                <Textarea
                  value={str("values", "private_notes")}
                  onChange={(e) => set("values", "private_notes", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "result" && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {(Object.keys(weights) as Array<keyof Weights>).map((key) => (
                  <Field key={key} label={`${SCORE_CATEGORY_LABELS[key]} (0–${weights[key]})`}>
                    <Input
                      type="number"
                      min={0}
                      max={weights[key]}
                      value={categoryScores[key] ?? ""}
                      onChange={(e) =>
                        setCategoryScores((prev) => ({
                          ...prev,
                          [key]: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </Field>
                ))}
              </div>
              <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                <div>
                  Total score: <strong>{total}</strong>/100
                </div>
                <div>
                  Compliance score: <strong>{compliance}%</strong>
                </div>
                <div>
                  Previous level {candidate.previousCefr ?? "—"} → live level {liveCefr || "—"}
                  {delta !== null ? ` (${delta > 0 ? "+" : ""}${delta} steps)` : ""}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {items
                    .filter((i) => i.applies)
                    .map((i) => (
                      <li key={i.label}>
                        {i.done ? "✓" : "○"} {i.label}
                      </li>
                    ))}
                </ul>
              </div>

              <Field label="Final result">
                <Select value={finalResult} onValueChange={setFinalResult}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select the final result" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINAL_RESULTS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {finalResult === "Approved for last step" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Interview comments">
                    <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
                  </Field>
                  <Field label="Red flags (or 'No red flags identified')">
                    <Textarea value={redFlags} onChange={(e) => setRedFlags(e.target.value)} />
                  </Field>
                  <Field label="Last roleplay interview date">
                    <Input
                      type="date"
                      value={lastRoleplayDate}
                      onChange={(e) => setLastRoleplayDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Hiring bonus recommendation">
                    <Select value={hiringBonus} onValueChange={setHiringBonus}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {HIRING_BONUS_OPTIONS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}

              {finalResult === "Retake required" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Retake reason">
                    <Textarea
                      value={str("result", "retake_reason")}
                      onChange={(e) => set("result", "retake_reason", e.target.value)}
                    />
                  </Field>
                  <Field label="Retake date">
                    <Input
                      type="date"
                      value={retakeDate}
                      onChange={(e) => setRetakeDate(e.target.value)}
                    />
                  </Field>
                  <Field label="Evaluator comments">
                    <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
                  </Field>
                </div>
              )}

              {finalResult === "Not approved" && (
                <div className="space-y-3">
                  <Label className="text-xs">Reasons</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {NOT_APPROVED_REASONS.map((reason) => (
                      <label key={reason} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={notApprovedReasons.includes(reason)}
                          onCheckedChange={(v) => {
                            const next = v
                              ? [...notApprovedReasons, reason]
                              : notApprovedReasons.filter((r) => r !== reason);
                            setNotApprovedReasons(next);
                            set("result", "not_approved_reasons", next);
                          }}
                        />
                        {reason}
                      </label>
                    ))}
                  </div>
                  <Field label="Comments">
                    <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
                  </Field>
                </div>
              )}

              {missing.length > 0 && !locked && (
                <p className="text-xs text-destructive">
                  Missing before submission: {missing.join(", ")}
                </p>
              )}
            </div>
          )}
        </fieldset>

        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          <div className="flex gap-2">
            {!locked && (
              <Button
                variant="outline"
                onClick={() => {
                  setSaveState("saving");
                  void saveFn({ data: payload(false) })
                    .then(() => setSaveState("saved"))
                    .catch(() => setSaveState("error"));
                }}
              >
                <Save className="mr-2 h-4 w-4" /> Save draft
              </Button>
            )}
            {step < visibleSections.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              !locked && (
                <Button onClick={() => void submit()} disabled={missing.length > 0}>
                  Submit evaluation
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
