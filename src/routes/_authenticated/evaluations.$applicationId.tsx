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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { resultLabel } from "@/lib/roles";
import {
  B2_PAST_READING,
  ENGLISH_ACTIVITIES,
  FINAL_RESULTS,
  HIRING_BONUS_OPTIONS,
  NOT_APPROVED_REASONS,
  SECTIONS,
  ENGLISH_INTRO,
  ONLINE_MINIMUM_SPECS,
  REFERRAL_SOURCES,
  SCHEDULE_OPTIONS,
  VARIABLE_SCHEDULE_WARNING,
  VERB_BANK,
  WRITING_TOPICS,
  complianceItems,
  isLockedStatus,
  complianceScore,
  missingEarlyFinish,
  missingRequired,
  verbStats,
} from "@/lib/evaluations";
import {
  openEvaluation,
  reopenEvaluation,
  saveEvaluation,
  sendResultEmail,
} from "@/lib/evaluations.functions";

export const Route = createFileRoute("/_authenticated/evaluations/$applicationId")({
  head: () => ({
    meta: [
      { title: "E4CC Interview — Live evaluation" },
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
  const sendResultFn = useServerFn(sendResultEmail);

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
  const [finishOpen, setFinishOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailState, setEmailState] = useState<"idle" | "sent" | "duplicate" | "failed">("idle");
  const [emailDetail, setEmailDetail] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const evaluation = data?.evaluation ?? null;
  const candidate = data?.candidate ?? null;
  const locked = isLockedStatus(evaluation?.status) || !data?.access.canEvaluate;

  useEffect(() => {
    if (!evaluation || hydrated) return;
    setSections((evaluation.sections as Sections) ?? {});
    setVerbs(evaluation.verbs?.length ? evaluation.verbs : Array.from({ length: 5 }, () => ({ verb: "", correct: false })));
    // Prefill the job history from the references the candidate submitted; the
    // evaluator can edit every field afterwards.
    const fromReferences = (candidate?.references ?? [])
      .filter((r) => (r.company ?? "").trim() || (r.position ?? "").trim())
      .map((r, i) => ({
        ...emptyJob(i + 1),
        company: r.company ?? "",
        position: r.position ?? "",
        start_date: r.startDate ?? "",
        end_date: r.endDate ?? "",
        supervisor_name: r.supervisorName ?? "",
        supervisor_contact: [r.supervisorPhone, r.supervisorEmail].filter(Boolean).join(" · "),
        reason_for_leaving: r.reasonForLeaving ?? "",
      }));
    setJobs(
      evaluation.jobs?.length
        ? (evaluation.jobs as unknown as JobRow[])
        : fromReferences.length
          ? fromReferences
          : [emptyJob(1)],
    );
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

  // Fill the equipment block with what the candidate already submitted.
  useEffect(() => {
    if (!hydrated || !candidate) return;
    const dl = candidate.internetDownloadMbps ?? candidate.internetSpeed;
    if (!dl && !candidate.internetUploadMbps) return;
    setSections((prev) => {
      const eq = { ...(prev["equipment"] ?? {}) };
      if (!String(eq["download"] ?? "").trim() && dl != null)
        eq["download"] = String(dl);
      if (!String(eq["upload"] ?? "").trim() && candidate.internetUploadMbps != null)
        eq["upload"] = String(candidate.internetUploadMbps);
      return { ...prev, equipment: eq };
    });
  }, [hydrated, candidate]);

  const lobRaw = String(sections["candidate"]?.["lob"] ?? candidate?.lob ?? "");
  const isOnline = lobRaw.toLowerCase() === "online";

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !("onlineOnly" in s && s.onlineOnly) || isOnline),
    [isOnline],
  );

  const stats = verbStats(verbs);
  const complianceInput = {
    sections: lobRaw
      ? { ...sections, candidate: { ...(sections["candidate"] ?? {}), lob: lobRaw } }
      : sections,
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

  const payload = useCallback(
    (submit: boolean, earlyFinish = false) => ({
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
      earlyFinish,
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

  async function submit(earlyFinish = false) {
    const required = earlyFinish ? missingEarlyFinish(complianceInput) : missing;
    if (required.length) {
      toast.error(`Missing required information: ${required.join(", ")}`);
      return;
    }
    setSaveState("saving");
    try {
      const res = await saveFn({ data: payload(true, earlyFinish) });
      if (!res.ok) {
        setSaveState("error");
        toast.error(`Missing required information: ${res.missing.join(", ")}`);
        return;
      }
      setSaveState("saved");
      setFinishOpen(false);
      const email = res.email;
      if (email) {
        setEmailState(email.ok ? (email.status === "duplicate" ? "duplicate" : "sent") : "failed");
        setEmailDetail(email.detail);
        if (email.ok && email.status !== "duplicate") {
          toast.success("Evaluation submitted and the result email was sent to the candidate.");
        } else if (email.ok) {
          toast.success("Evaluation submitted. The result email was already sent.");
        } else {
          toast.error("Evaluation submitted, but the result email failed. Use Retry email.");
        }
      } else {
        toast.success("Evaluation submitted. It is now read-only.");
      }
      await refetch();

    } catch (e) {
      setSaveState("error");
      toast.error(e instanceof Error ? e.message : "Could not submit the evaluation.");
    }
  }

  async function sendResult(force = false) {
    setSendingEmail(true);
    try {
      const res = await sendResultFn({ data: { evaluationId: evaluation!.id, force } });
      setEmailState(res.ok ? (res.status === "duplicate" ? "duplicate" : "sent") : "failed");
      setEmailDetail(res.detail);
      if (res.ok && res.status === "duplicate") {
        toast.info("This result email was already sent. Use Resend email to send it again.");
      } else if (res.ok) {
        toast.success("Result email sent to the candidate.");
      } else {
        toast.error("The email could not be sent. You can retry.");
      }
      setSendOpen(false);
    } catch (e) {
      setEmailState("failed");
      setEmailDetail(e instanceof Error ? e.message : "Could not send the email.");
      toast.error(e instanceof Error ? e.message : "Could not send the email.");
    } finally {
      setSendingEmail(false);
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
            <Link to="/evaluations">Back to E4CC Interviews</Link>
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
            <Link to="/evaluations">Back to E4CC Interviews</Link>
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
            <p className="text-xs text-muted-foreground">E4CC Interview — live evaluation</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isLockedStatus(evaluation.status) ? "default" : "secondary"}>
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
            {data.access.isAdmin && isLockedStatus(evaluation.status) && (
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

      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 lg:col-start-2 lg:row-start-1">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">
                {candidate.fullName}
                {(evaluation.attempt_number ?? 1) > 1 && (
                  <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning-foreground">
                    Retake · attempt {evaluation.attempt_number} · starts at Grammar Test
                  </span>
                )}
              </h1>
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
                Compliance: <strong>{compliance}%</strong>
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
              <Field label="Candidate phone">
                <Input value={candidate.phone} readOnly />
              </Field>
              <Field label="Candidate email">
                <Input value={candidate.email} readOnly />
              </Field>
              <Field label="Was this person referred?">
                <Select
                  value={str("candidate", "referred")}
                  onValueChange={(v) => set("candidate", "referred", v)}
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
              {str("candidate", "referred") === "Yes" ? (
                <Field label="Name of the person who referred the applicant">
                  <Input
                    value={str("candidate", "referrer_name")}
                    maxLength={80}
                    onChange={(e) => set("candidate", "referrer_name", e.target.value)}
                  />
                </Field>
              ) : (
                <Field label="External source">
                  <Select
                    value={str("candidate", "referral_source")}
                    onValueChange={(v) => set("candidate", "referral_source", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_SOURCES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
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
                <Select
                  value={str("candidate", "schedule")}
                  onValueChange={(v) => set("candidate", "schedule", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_OPTIONS.map((v) => (
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
              <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground sm:col-span-2">
                <p className="font-medium text-foreground">Minimum recommendation</p>
                <ul className="mt-1 list-disc pl-4">
                  {ONLINE_MINIMUM_SPECS.map((spec) => (
                    <li key={spec}>{spec}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  {candidate.internetTestedAt != null
                    ? `Speed test: ${candidate.internetDownloadMbps ?? 0} Mbps down / ${candidate.internetUploadMbps ?? 0} Mbps up / ${candidate.internetPingMs ?? 0} ms ping — ${candidate.internetTestPassed ? "Passed" : "Below minimum"} (tested ${new Date(candidate.internetTestedAt).toLocaleString()})`
                    : `Candidate self-reported speed: ${candidate.internetSpeed ?? "—"} Mbps.`}
                </p>
              </div>
              {str("equipment", "meets_requirements") === "No" && (
                <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive sm:col-span-2">
                  The candidate does not meet the PC or internet requirements. Document it here and
                  continue the interview — this does not reject the candidate automatically.
                </p>
              )}
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
              {str("profile", "main_schedule") === "Variable" && (
                <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive sm:col-span-2">
                  {VARIABLE_SCHEDULE_WARNING}
                </p>
              )}
              <Field label="Is the current work schedule fixed every week or variable (business needs / on-call)?">
                <Select
                  value={str("profile", "main_schedule")}
                  onValueChange={(v) => set("profile", "main_schedule", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed schedule</SelectItem>
                    <SelectItem value="Variable">Variable main-job schedule</SelectItem>
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
              <Field label="It is 7:30 p.m., they are tired after their main job — what would they do to be ready to teach with positive energy at 8:05 p.m.?">
                <Textarea
                  value={str("profile", "energy_answer")}
                  onChange={(e) => set("profile", "energy_answer", e.target.value)}
                />
              </Field>
              <Field label="Daily routine from leaving the other job until teaching at 8:05 p.m. (place, dinner, late/tired/sick)">
                <Textarea
                  value={str("profile", "routine_answer")}
                  onChange={(e) => set("profile", "routine_answer", e.target.value)}
                />
              </Field>
            </div>
          )}

          {current.key === "english" && (
            <div className="space-y-5">
              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Grammar Test</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Completed">
                    <Select
                      value={str("grammar_test", "completed")}
                      onValueChange={(v) => set("grammar_test", "completed", v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {YES_NO.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Score">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={str("grammar_test", "score")}
                      onChange={(e) => set("grammar_test", "score", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
              <p className="rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
                Read to the candidate: “{ENGLISH_INTRO}”
              </p>
               <div className="space-y-3 rounded-xl border border-border p-4">
                 <h3 className="text-sm font-semibold">B2 past-tense reading</h3>
                 <p className="text-sm leading-6 text-foreground">{B2_PAST_READING}</p>
                 <Field
                   label="Reading observations"
                   hint="Note pronunciation, fluency, reading comprehension and use of past-tense structures."
                 >
                   <Textarea
                     rows={4}
                     value={str("english", "reading_observations")}
                     onChange={(e) => set("english", "reading_observations", e.target.value)}
                   />
                 </Field>
               </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Irregular verbs (5 to 10)</h3>
                <p className="text-xs text-muted-foreground">
                  Evaluated: {stats.evaluated} · Correct: {stats.correct} · Incorrect:{" "}
                  {stats.incorrect} · Accuracy: {stats.accuracy}%
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {verbs.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={v.verb}
                        onValueChange={(val) =>
                          setVerbs((prev) =>
                            prev.map((row, idx) => (idx === i ? { ...row, verb: val } : row)),
                          )
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder={`Verb ${i + 1}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {VERB_BANK.map((verb) => (
                            <SelectItem key={verb} value={verb}>
                              {verb}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

              <div className="space-y-3 rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Class roleplay</h3>
                <Field
                  label="Observations"
                  hint="Topic assigned, teaching clarity, confidence, grammar accuracy and coach profile."
                >
                  <Textarea
                    rows={6}
                    value={str("english", "roleplay_notes")}
                    onChange={(e) => set("english", "roleplay_notes", e.target.value)}
                  />
                </Field>
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
                <Field
                  label="Candidate's writing (8–10 lines, three-minute limit)"
                  hint="Paste or type exactly what the candidate wrote."
                >
                  <Textarea
                    rows={6}
                    value={str("english", "writing_text")}
                    onChange={(e) => set("english", "writing_text", e.target.value)}
                  />
                </Field>
                <Field label="Evaluator notes">
                  <Textarea
                    value={str("english", "notes")}
                    onChange={(e) => set("english", "notes", e.target.value)}
                  />
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
               <Field label="End year / Finished">
                <Input
                  value={str("studies", "end_year")}
                  onChange={(e) => set("studies", "end_year", e.target.value)}
                />
              </Field>
              <Field label="Additional studies, courses or certifications">
                <Textarea
                  value={str("studies", "additional")}
                  onChange={(e) => set("studies", "additional", e.target.value)}
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
                        ["start_date", "Start date", false],
                        ["end_date", "End date", false],
                        ["hired_to_do", "What was the candidate hired to do", true],
                        ["accomplishment", "Most important accomplishment (measurable)", true],
                        ["biggest_mistake", "Biggest mistake or failure and what they did after", true],
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
                     <Field label="Direct supervisor's name">
                       <Input
                         value={job.supervisor_name}
                         onChange={(e) =>
                           setJobs((prev) =>
                             prev.map((j, idx) =>
                               idx === i ? { ...j, supervisor_name: e.target.value } : j,
                             ),
                           )
                         }
                       />
                     </Field>
                     <Field label="Supervisor phone number">
                       <Input
                         value={job.supervisor_contact}
                         onChange={(e) =>
                           setJobs((prev) =>
                             prev.map((j, idx) =>
                               idx === i ? { ...j, supervisor_contact: e.target.value } : j,
                             ),
                           )
                         }
                       />
                     </Field>
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
                                      ? Math.min(10, Math.max(1, Math.round(Number(e.target.value))))
                                      : null,
                                  }
                                : j,
                            ),
                          )
                        }
                      />
                    </Field>
                     <Field label="Why would the supervisor give that rating">
                       <Textarea
                         value={job.rating_reason}
                         onChange={(e) =>
                           setJobs((prev) =>
                             prev.map((j, idx) =>
                               idx === i ? { ...j, rating_reason: e.target.value } : j,
                             ),
                           )
                         }
                       />
                     </Field>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Does the candidate have additional job experience? Add another position (up to 5).
              </p>
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
                    [
                      "goals",
                      "Career goals for the next two to five years and how teaching fits into them",
                    ],
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
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="General evaluator comments (private)">
                  <Textarea
                    value={str("values", "private_notes")}
                    onChange={(e) => set("values", "private_notes", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}

          {current.key === "result" && (
            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">
                <div>
                  Compliance score: <strong>{compliance}%</strong>
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
                        {resultLabel(r)}
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
                  <Field label="Areas the candidate must improve">
                    <Textarea
                      value={str("result", "retake_improvements")}
                      onChange={(e) => set("result", "retake_improvements", e.target.value)}
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Final interview comments">
                      <Textarea value={comments} onChange={(e) => setComments(e.target.value)} />
                    </Field>
                    <Field label="When can this candidate apply again?">
                      <Input
                        type="date"
                        value={str("result", "eligible_again_date")}
                        onChange={(e) => set("result", "eligible_again_date", e.target.value)}
                      />
                    </Field>
                  </div>
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
        {current.key === "result" && (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold">Candidate result email</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The result email goes out automatically when you confirm and finish the interview,
          with the final filter details you entered. Use this button only to send it again.
        </p>
        {emailState === "sent" && (
          <p className="mt-2 text-xs text-emerald-600">Result email sent successfully.</p>
        )}
        {emailState === "duplicate" && (
          <p className="mt-2 text-xs text-muted-foreground">
            This result email was already sent for this interview.
          </p>
        )}
        {emailState === "failed" && (
          <p className="mt-2 text-xs text-destructive">
            The email could not be sent. {emailDetail}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => setSendOpen(true)}
            disabled={!finalResult || sendingEmail}
          >
            {sendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send Result
          </Button>
          {emailState === "failed" && (
            <Button variant="outline" disabled={sendingEmail} onClick={() => void sendResult(true)}>
              Retry email
            </Button>
          )}
          {(emailState === "sent" || emailState === "duplicate") && (
            <Button variant="outline" disabled={sendingEmail} onClick={() => void sendResult(true)}>
              Resend email
            </Button>
          )}
        </div>
      </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Previous
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {!locked && (
              <Button variant="destructive" onClick={() => setFinishOpen(true)}>
                Finish interview
              </Button>
            )}
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
                <Button onClick={() => void submit(false)} disabled={missing.length > 0}>
                  Submit evaluation
                </Button>
              )
            )}
          </div>
        </div>
        </div>

        <aside className="space-y-4 lg:col-start-1 lg:row-start-1 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <Field
              label="Red Flags comments"
              hint="Available throughout the interview. Enter “No red flags identified” when applicable."
            >
              <Textarea
                rows={7}
                value={redFlags}
                disabled={locked}
                onChange={(e) => setRedFlags(e.target.value)}
              />
            </Field>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">Candidate</h2>
            <p className="mt-1 font-medium">{candidate.fullName}</p>
            <p className="text-xs text-muted-foreground">{candidate.email}</p>
            <p className="text-xs text-muted-foreground">{candidate.phone}</p>
            <p className="text-xs text-muted-foreground">
              {candidate.country} / {candidate.city} · {candidate.lob ?? "LOB not set"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Pipeline: {candidate.pipelineStatus}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">Interview</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {candidate.appointmentAt
                ? new Date(candidate.appointmentAt).toLocaleString()
                : "Not scheduled"}
              {candidate.candidateTimezone ? ` · ${candidate.candidateTimezone}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Interviewer: {candidate.interviewer ?? "—"} · {candidate.appointmentStatus ?? "—"}
            </p>
            {candidate.meetingLink && (
              <Button asChild size="sm" className="mt-3 w-full rounded-2xl">
                <a href={candidate.meetingLink} target="_blank" rel="noreferrer">
                  Join meeting
                </a>
              </Button>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">English and Grammar Test</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Previous level: <strong>{candidate.previousCefr ?? "—"}</strong>
              {candidate.previousScore != null ? ` · ${candidate.previousScore}/100` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Live level: <strong>{liveCefr || "—"}</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Grammar Test: {candidate.grammarTestStatus ?? "—"}
              {candidate.grammarTestScore != null ? ` · ${candidate.grammarTestScore}` : ""}
              {candidate.grammarTestVerified ? " · verified" : ""}
            </p>
            {candidate.internetTestedAt != null ? (
              <p className="text-xs text-muted-foreground">
                Internet: {candidate.internetDownloadMbps ?? 0}↓ / {candidate.internetUploadMbps ?? 0}↑ Mbps · {candidate.internetPingMs ?? 0}ms {candidate.internetTestPassed ? "✓" : "✗"}
              </p>
            ) : candidate.internetSpeed != null ? (
              <p className="text-xs text-muted-foreground">
                Internet: {candidate.internetSpeed} Mbps
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 text-sm">
            <h2 className="text-sm font-semibold">Resume and references</h2>
            {candidate.resumeUrl ? (
              <Button asChild size="sm" variant="outline" className="mt-2 w-full rounded-2xl">
                <a href={candidate.resumeUrl} target="_blank" rel="noreferrer">
                  Open resume
                </a>
              </Button>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {candidate.resumeFilename ?? "No resume uploaded"}
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {candidate.references.length === 0 && (
                <li className="text-xs text-muted-foreground">No work references submitted.</li>
              )}
              {candidate.references.map((r) => (
                <li key={r.slot} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{r.company || "—"}</span>
                  {r.position ? ` · ${r.position}` : ""}
                  <br />
                  {r.supervisorName || "—"}
                  {r.supervisorPhone ? ` · ${r.supervisorPhone}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Finish interview</DialogTitle>
            <DialogDescription>
              Choose the result and complete only the information required for that decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Final result">
              <Select value={finalResult} onValueChange={setFinalResult}>
                <SelectTrigger><SelectValue placeholder="Select the final result" /></SelectTrigger>
                <SelectContent>
                  {FINAL_RESULTS.map((result) => <SelectItem key={result} value={result}>{resultLabel(result)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {finalResult === "Approved for last step" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Interview comments"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
                <Field label="Last roleplay interview date"><Input type="date" value={lastRoleplayDate} onChange={(e) => setLastRoleplayDate(e.target.value)} /></Field>
                <Field label="Hiring bonus recommendation">
                  <Select value={hiringBonus} onValueChange={setHiringBonus}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{HIRING_BONUS_OPTIONS.map((bonus) => <SelectItem key={bonus} value={bonus}>{bonus}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            )}
            {finalResult === "Approved for last step" && (
              <div className="space-y-3 rounded-2xl border border-border p-3">
                <Label className="text-sm font-semibold">Do you already have the final filter date, time and interviewer?</Label>
                <div className="flex gap-2">
                  {["yes", "no"].map((v) => (
                    <Button key={v} type="button" size="sm" variant={str("result", "ff_known") === v ? "default" : "outline"} onClick={() => set("result", "ff_known", v)}>
                      {v === "yes" ? "Yes" : "Not yet"}
                    </Button>
                  ))}
                </div>
                {str("result", "ff_known") === "yes" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Final filter date"><Input type="date" value={str("result", "ff_date")} onChange={(e) => set("result", "ff_date", e.target.value)} /></Field>
                    <Field label="Final filter time (candidate's local time)"><Input type="time" value={str("result", "ff_time")} onChange={(e) => set("result", "ff_time", e.target.value)} /></Field>
                    <Field label="Interviewer name"><Input value={str("result", "ff_interviewer")} onChange={(e) => set("result", "ff_interviewer", e.target.value)} /></Field>
                    {!isOnline && (
                      <Field label="Place (onsite address)"><Input value={str("result", "ff_place")} onChange={(e) => set("result", "ff_place", e.target.value)} /></Field>
                    )}
                  </div>
                )}
                {str("result", "ff_known") === "yes" && (!str("result", "ff_date") || !str("result", "ff_time") || !str("result", "ff_interviewer") || (!isOnline && !str("result", "ff_place"))) && (
                  <p className="text-xs text-destructive">Complete date, time, interviewer{isOnline ? "" : " and place"} to include them in the approval email.</p>
                )}
              </div>
            )}
            {finalResult === "Retake required" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Retake reason"><Textarea value={str("result", "retake_reason")} onChange={(e) => set("result", "retake_reason", e.target.value)} /></Field>
                <Field label="Areas the candidate must improve"><Textarea value={str("result", "retake_improvements")} onChange={(e) => set("result", "retake_improvements", e.target.value)} /></Field>
                <Field label="Retake date"><Input type="date" value={retakeDate} onChange={(e) => setRetakeDate(e.target.value)} /></Field>
                <Field label="Evaluator comments"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
              </div>
            )}
            {finalResult === "Not approved" && (
              <div className="space-y-3">
                <Label className="text-xs">Reasons</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {NOT_APPROVED_REASONS.map((reason) => (
                    <label key={reason} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={notApprovedReasons.includes(reason)} onCheckedChange={(checked) => {
                        const next = checked ? [...notApprovedReasons, reason] : notApprovedReasons.filter((item) => item !== reason);
                        setNotApprovedReasons(next);
                        set("result", "not_approved_reasons", next);
                      }} />
                      {reason}
                    </label>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Final interview comments"><Textarea value={comments} onChange={(e) => setComments(e.target.value)} /></Field>
                </div>
              </div>
            )}
            {missingEarlyFinish(complianceInput).length > 0 && (
              <p className="text-xs text-destructive">Required to finish: {missingEarlyFinish(complianceInput).join(", ")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit(true)} disabled={missingEarlyFinish(complianceInput).length > 0 || saveState === "saving"}>
              Confirm and finish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send the result to the candidate?</DialogTitle>
            <DialogDescription>
              {candidate.fullName} will receive the “{finalResult}” email at {candidate.email}. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>
              Cancel
            </Button>
            <Button disabled={sendingEmail} onClick={() => void sendResult(false)}>
              {sendingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm and send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
