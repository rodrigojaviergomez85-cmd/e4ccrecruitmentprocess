import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  getManagerReview,
  reopenManagerEvaluation,
  retryManagerEmail,
  saveManagerEvaluation,
  startManagerEvaluation,
} from "@/lib/manager.functions";
import {
  MANAGER_DECISIONS,
  MANAGER_SECTIONS,
  MANAGER_VERIFICATION_STATES,
  VERIFICATION_CHECKS,
  clampScores,
  scoreManager,
  type ManagerDecision,
  type ManagerVerificationState,
} from "@/lib/manager-scorecard";
import { resultLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/second-filter/$applicationId")({
  head: () => ({
    meta: [
      { title: "Manager Final Filter — E4CC" },
      { name: "description", content: "Review the candidate and complete the Manager second filter scorecard." },
      { property: "og:title", content: "Manager Final Filter — E4CC" },
      { property: "og:description", content: "Internal E4CC Manager scorecard." },
    ],
  }),
  component: ReviewPage,
});

const AREAS = ["English level", "Grammar", "Pronunciation", "Technical Requirements"] as const;
type Area = (typeof AREAS)[number];

type Form = {
  demoTopic: string;
  scores: Record<string, string>;
  evidence: Record<string, string>;
  checks: Record<string, boolean>;
  verifications: Record<string, ManagerVerificationState>;
  criticalRedFlag: boolean;
  redFlags: string;
  internalComments: string;
  improvementAreas: Area[];
  improvementNote: string;
  decisionReason: string;
  eligibleAgainDate: string;
  appointmentAt: string;
  finalDecision: ManagerDecision | "";
};

/** Fixed section order of the sheet. The same labels drive the sticky navigation. */
/** Read-only shell before the Manager starts: the file can already be reviewed. */
const EMPTY_FORM: Form = {
  demoTopic: "",
  scores: {},
  evidence: {},
  checks: {},
  verifications: {},
  criticalRedFlag: false,
  redFlags: "",
  internalComments: "",
  improvementAreas: [],
  improvementNote: "",
  decisionReason: "",
  eligibleAgainDate: "",
  appointmentAt: "",
  finalDecision: "",
};

const NAV: [string, string][] = [
  ["perfil", "1 · Profile"],
  ["expectativas", "2 · Expectations"],
  ["metas", "3 · Goals"],
  ["ingles", "4 · English"],
  ["experiencia", "5 · Experience"],
  ["valores", "6 · Values"],
  ["decision", "7 · Decision"],
];

/** Every item the Manager is expected to verify. Job items are added per candidate. */
const VERIFY_KEYS = [
  "perfil.modality",
  "perfil.branch",
  "perfil.schedule",
  "perfil.training_start",
  "perfil.payment",
  "perfil.availability",
  "perfil.main_schedule",
  "expect.teaching",
  "expect.callcenter",
  "expect.training",
  "expect.class_schedule",
  "expect.current_job",
  "expect.modality",
  "expect.equipment",
  "expect.references",
  "goals.career",
  "goals.why_e4cc",
  "goals.teaching_interest",
  "goals.plans",
  "goals.evidence",
  "english.grammar_test",
  "english.verbs",
  "english.spoken",
  "english.explanations",
  "english.error_correction",
  "english.writing",
  "english.reading",
  "english.demo",
  "english.coachability",
  "experience.studies",
  "experience.gaps",
  "experience.references",
  "values.motivation",
  "values.development",
  "values.consistency",
  "values.behaviour",
];

const EMPTY_ANSWERS = new Set(["-", "--", "---", "n/a", "na", "none", "null", "nil"]);

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const human = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** A blank is never shown as an empty cell: missing data is always named. */
function shown(value: unknown): string {
  if (value === null || value === undefined) return "Not recorded";
  const text = String(value).trim();
  if (!text) return "Not recorded";
  if (EMPTY_ANSWERS.has(text.toLowerCase())) return "N/A";
  return text;
}

function jobStatus(start: string | null, end: string | null) {
  const text = String(end ?? "").trim().toLowerCase();
  if (!text || ["present", "current", "actual", "now", "today"].includes(text)) return "Current";
  return "Finished";
}

const CRITERIA = Object.fromEntries(MANAGER_SECTIONS.flatMap((s) => s.criteria.map((c) => [c.key, c])));

function ReviewPage() {
  const { applicationId } = Route.useParams();
  const load = useServerFn(getManagerReview);
  const start = useServerFn(startManagerEvaluation);
  const save = useServerFn(saveManagerEvaluation);
  const reopen = useServerFn(reopenManagerEvaluation);
  const retry = useServerFn(retryManagerEmail);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["manager-review", applicationId], queryFn: () => load({ data: { applicationId } }) });
  const d = q.data;
  const current = d?.current ?? null;
  const locked = Boolean(current?.submitted_at && current.status !== "Reopened");
  const editable = Boolean(d?.access.canDecide && current && !locked);

  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [confirm, setConfirm] = useState(false);
  const [active, setActive] = useState<string>("perfil");
  const dirty = useRef(false);

  useEffect(() => {
    if (!current) return setForm(EMPTY_FORM);
    const areas = AREAS.filter((a) => (current.improvement_areas ?? "").includes(a));
    setForm({
      demoTopic: current.demo_topic ?? "",
      scores: Object.fromEntries(
        Object.entries((current.scores as Record<string, number>) ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      evidence: (current.evidence as Record<string, string>) ?? {},
      checks: (current.checks as Record<string, boolean>) ?? {},
      verifications: (current.verifications as Record<string, ManagerVerificationState> | null) ?? {},
      criticalRedFlag: current.critical_red_flag,
      redFlags: current.red_flags ?? "",
      internalComments: current.internal_comments ?? "",
      improvementAreas: areas,
      improvementNote: areas.length ? "" : (current.improvement_areas ?? ""),
      decisionReason: current.decision_reason ?? "",
      eligibleAgainDate: current.eligible_again_date ?? "",
      appointmentAt: current.appointment_at ? current.appointment_at.slice(0, 16) : "",
      finalDecision: (current.final_decision as ManagerDecision) ?? "",
    });
    dirty.current = false;
  }, [current?.id, current?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keeps the section the Manager is reading visible in the sticky navigation.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-160px 0px -60% 0px", threshold: 0 },
    );
    for (const [id] of NAV) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [q.isLoading, Boolean(current)]); // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo(
    () => (form ? scoreManager(clampScores(form.scores), form.criticalRedFlag) : null),
    [form],
  );

  const payload = (submit: boolean) => ({
    evaluationId: current!.id,
    demoTopic: form!.demoTopic || null,
    scores: form!.scores,
    evidence: form!.evidence,
    checks: form!.checks,
    verifications: form!.verifications,
    criticalRedFlag: form!.criticalRedFlag,
    redFlags: form!.redFlags || null,
    internalComments: form!.internalComments || null,
    improvementAreas: form!.improvementAreas,
    improvementNote: form!.improvementNote || null,
    decisionReason: form!.decisionReason || null,
    eligibleAgainDate: form!.eligibleAgainDate || null,
    appointmentAt: form!.appointmentAt || null,
    finalDecision: form!.finalDecision || null,
    submit,
  });

  // Autosave. It never emails; only the confirmed submit sends anything.
  useEffect(() => {
    if (!form || !editable || !dirty.current) return;
    const t = setTimeout(async () => {
      setSaving("saving");
      try {
        await save({ data: payload(false) });
        setSaving("saved");
      } catch (e) {
        setSaving("idle");
        toast.error(e instanceof Error ? e.message : "Autosave failed");
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<Form>) => {
    dirty.current = true;
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["manager-review", applicationId] });
  }
  async function onStart() {
    try {
      await start({ data: { applicationId } });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start");
    }
  }
  async function onSubmit() {
    setConfirm(false);
    try {
      const r = await save({ data: payload(true) });
      if (!r.ok) {
        toast.error(`Missing: ${r.missing.join(", ")}`);
        return;
      }
      if (r.email && !r.email.ok) toast.error(`Decision saved, but the email failed: ${r.email.detail}`);
      else toast.success("Decision submitted");
      dirty.current = false;
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    }
  }

  if (q.isLoading) return <Skeleton className="m-6 h-96 rounded-2xl" />;
  if (q.error || !d)
    return (
      <p className="m-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Not available"}
      </p>
    );

  const app = d.app;
  const p = d.progress;
  const isOnline = (p?.work_modality ?? "").toLowerCase() === "online";
  const interview = d.interviews.find((i) => i.final_result === "Approved for last step") ?? d.interviews[0];
  const S = (interview?.sections ?? {}) as Record<string, Record<string, unknown>>;
  const answer = (section: string, key: string) => shown(S[section]?.[key]);
  const jobs = [...(interview?.evaluation_jobs ?? [])].sort((a, b) => a.slot - b.slot);
  const verbs = [...(interview?.evaluation_verbs ?? [])].sort((a, b) => a.position - b.position);
  const verbsOk = verbs.filter((v) => v.correct).length;
  const grammarScore = shown(S["grammar_test"]?.["score"]);
  const recruiterName = d.evaluators.find((e) => e.id === interview?.evaluator_id)?.name ?? "Not recorded";
  const managerName = d.managers.find((m) => m.id === current?.manager_id)?.name ?? d.access.name;
  const managerEmails = d.emails.filter((e) => e.manager_evaluation_id && e.manager_evaluation_id === current?.id);
  const lastEmail = managerEmails[0];
  const allVerifyKeys = [...VERIFY_KEYS, ...jobs.map((j) => `experience.job.${j.slot}`)];
  const verified = allVerifyKeys.filter((k) => form?.verifications[k] === "confirmed").length;
  const flagged = allVerifyKeys.filter(
    (k) => form?.verifications[k] === "discrepancy" || form?.verifications[k] === "clarification",
  ).length;
  const recruitmentFlags = String(interview?.red_flags ?? "").trim();

  const vState = (key: string): ManagerVerificationState => form?.verifications[key] ?? "not_reviewed";
  const vNote = (key: string) => form?.evidence[`v:${key}`] ?? "";
  const setVerify = (key: string, state: ManagerVerificationState) =>
    set({ verifications: { ...(form?.verifications ?? {}), [key]: state } });
  const setVNote = (key: string, text: string) =>
    set({ evidence: { ...(form?.evidence ?? {}), [`v:${key}`]: text } });

  const item = (
    key: string,
    label: string,
    recruitment: string,
    extra?: { hint?: string; wide?: boolean },
  ) => (
    <Item
      key={key}
      label={label}
      recruitment={recruitment}
      hint={extra?.hint}
      state={vState(key)}
      onState={(s) => setVerify(key, s)}
      note={vNote(key)}
      onNote={(t) => setVNote(key, t)}
      disabled={!editable}
    />
  );

  const criteriaBlock = (keys: string[], emptyLabel?: string) => (
    <div className="px-5 py-2">
      {emptyLabel && <p className="text-xs font-semibold uppercase text-muted-foreground">{emptyLabel}</p>}
      {keys.map((k) => (
        <ScoreRow
          key={k}
          criterion={CRITERIA[k]!}
          score={form?.scores[k] ?? ""}
          evidence={form?.evidence[k] ?? ""}
          onScore={(v) => set({ scores: { ...(form?.scores ?? {}), [k]: v } })}
          onEvidence={(v) => set({ evidence: { ...(form?.evidence ?? {}), [k]: v } })}
        />
      ))}
    </div>
  );

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-[1500px] px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <BrandMark className="h-6 shrink-0" />
                <h1 className="truncate text-lg font-bold">{app.full_name}</h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {app.status}
                </span>
                {app.withdrawn_at && (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    Withdrawn by applicant
                  </span>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>{app.country} · {shown(p?.work_modality)} · {shown(app.city)}</span>
                <span>{app.email}</span>
                <span>{app.phone_e164 ?? app.phone}</span>
                <span>Grammar Test: <strong className="text-foreground">{grammarScore}</strong></span>
                <span>English level (AI): <strong className="text-foreground">{(app.ai_evaluations as { cefr: string | null }[] | null)?.[0]?.cefr ?? "Not evaluated"}</strong></span>
                <span>Recruitment: <strong className="text-foreground">{recruiterName}</strong></span>
                <span>Manager: <strong className="text-foreground">{managerName}</strong></span>
                <span>First interview: {fmt(interview?.submitted_at)}</span>
                <span>Recruitment result: <strong className="text-foreground">{resultLabel(interview?.final_result) || "Not recorded"}</strong></span>
                <span>Approved by Recruitment: {fmt(app.recruitment_approved_at)}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {d.resumeUrl ? (
                <Button asChild variant="outline" size="sm">
                  <a href={d.resumeUrl} target="_blank" rel="noreferrer">Open CV <ExternalLink className="ml-2 h-4 w-4" /></a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">CV not uploaded</span>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link to="/second-filter"><ArrowLeft className="mr-2 h-4 w-4" /> Queue</Link>
              </Button>
            </div>
          </div>
          <nav className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {label}
              </a>
            ))}
            <span className="ml-auto hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span>{verified}/{allVerifyKeys.length} confirmed</span>
              {flagged > 0 && <span className="font-semibold text-destructive">{flagged} to review</span>}
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {app.withdrawn_at && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-semibold">Withdrawn by Applicant · {fmt(app.withdrawn_at)} · Stage: manager_final_filter</p>
              {app.withdrawn_reason && <p className="mt-1 italic">“{app.withdrawn_reason}”</p>}
            </div>
          )}

          {!current &&
            (d.access.canDecide ? (
              <Button onClick={() => void onStart()}>Start evaluation</Button>
            ) : (
              <p className="text-sm text-muted-foreground">The Manager has not started the evaluation yet.</p>
            ))}

          {form && result && (
            <fieldset disabled={!editable} className="min-w-0 space-y-4">
              {locked && (
                <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
                  <Lock className="h-4 w-4" /> Submitted {fmt(current?.submitted_at)} — locked. Only Admin can reopen it.
                </p>
              )}

              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                  {current ? (
                    <p className="text-2xl font-bold">{result.total}<span className="text-sm text-muted-foreground">/100</span></p>
                  ) : (
                    <p className="text-sm font-semibold text-muted-foreground">Evaluation not started — the file below is read-only until you start it.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Recommendation: <strong className="text-foreground">{result.recommendation ?? "Complete all criteria to see the recommendation"}</strong></p>
                  <p className="text-xs text-muted-foreground">Verification: <strong className="text-foreground">{verified} confirmed · {flagged} to review · {allVerifyKeys.length - verified - flagged} not reviewed</strong></p>
                  <span className="ml-auto text-xs text-muted-foreground">{saving === "saving" ? "Saving…" : saving === "saved" ? "All changes saved" : ""}</span>
                </div>
                {recruitmentFlags && (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <p className="font-semibold">Red flags reported by Recruitment</p>
                    <p className="mt-1 whitespace-pre-wrap">{recruitmentFlags}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.checks["red_flags"] ? "Checked by the Manager." : "Pending verification — confirm it in section 7 with evidence."}
                    </p>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Internal reminder: dig into results, achievements and concrete evidence, and verify the references.
                  Nothing in this sheet is shared with the candidate.
                </p>
              </section>

              <Part id="perfil" n={1} title="Profile and information confirmation">
                {item("perfil.modality", "Work modality", shown(p?.work_modality ?? S["candidate"]?.["lob"]))}
                {item("perfil.branch", "Branch / location", shown(app.city))}
                {item("perfil.schedule", "Class schedule requested", answer("candidate", "schedule"))}
                {item("perfil.training_start", "Training start date", answer("profile", "training_start"))}
                {item("perfil.payment", "Payment conditions accepted", answer("profile", "agrees_payment"))}
                {item("perfil.availability", "Availability required", answer("profile", "availability_required"))}
                {item("perfil.main_schedule", "Schedule type", answer("profile", "main_schedule"))}
                {criteriaBlock(["p1", "p2", "p3"], "Manager scoring — Profile and Information Confirmation")}
              </Part>

              <Part id="expectativas" n={2} title="Expectations of position">
                {item(
                  "expect.teaching",
                  "Teaching or training experience",
                  `${answer("profile", "teaching_experience")} · ${shown(app.teaching_experience)}`,
                )}
                {item(
                  "expect.callcenter",
                  "Call center experience",
                  `${answer("profile", "callcenter_experience")} · ${shown(app.callcenter_experience_level)}`,
                )}
                {item(
                  "expect.training",
                  "Availability for training",
                  `Required: ${answer("profile", "availability_required")} · Start ${answer("profile", "training_start")}`,
                )}
                {item(
                  "expect.class_schedule",
                  "Class schedule and compatibility",
                  `${answer("candidate", "schedule")} · ${answer("profile", "main_schedule")}`,
                )}
                {item(
                  "expect.current_job",
                  "Current routine and energy",
                  `Routine: ${answer("profile", "routine_answer")} · Energy: ${answer("profile", "energy_answer")}`,
                  { hint: "Confirm the current job or studies do not clash with the class schedule." },
                )}
                {item(
                  "expect.modality",
                  "Modality and branch",
                  `${shown(p?.work_modality ?? S["candidate"]?.["lob"])} · ${shown(app.city)} · ${shown(app.country)}`,
                )}
                {isOnline &&
                  item(
                    "expect.equipment",
                    "Equipment and internet",
                    [
                      `Download: ${p?.internet_download_mbps != null ? `${p.internet_download_mbps} Mbps` : "Not evaluated"}`,
                      `Upload: ${p?.internet_upload_mbps != null ? `${p.internet_upload_mbps} Mbps` : "Not evaluated"}`,
                      `Ping: ${p?.internet_ping_ms != null ? `${p.internet_ping_ms} ms` : "Not evaluated"}`,
                      `Result: ${p?.internet_test_passed ? "Passed" : p?.internet_override ? "Override approved" : "Not evaluated"}`,
                      `Tested: ${fmt(p?.internet_tested_at)}`,
                      `Device: ${answer("equipment", "os")} · ${answer("equipment", "processor")} · ${answer("equipment", "ram")}`,
                    ].join(" · "),
                  )}
                {item(
                  "expect.references",
                  "Work references",
                  d.references.length
                    ? d.references
                        .map(
                          (r) =>
                            `${r.company} · ${r.position} · ${r.supervisor_name} ${r.supervisor_phone}${
                              r.reason_for_leaving ? ` · leaving: ${r.reason_for_leaving}` : ""
                            } · verification: ${shown(r.verification_status)}`,
                        )
                        .join("\n")
                    : "No references recorded",
                )}
              </Part>

              <Part id="metas" n={3} title="Goals and aspirations">
                {item("goals.career", "Professional goals", answer("values", "goals"))}
                {item("goals.why_e4cc", "Why they applied to E4CC", answer("values", "why_e4cc"))}
                {item("goals.teaching_interest", "Interest in teaching", answer("values", "learning"))}
                {item("goals.plans", "How the role fits their plans", answer("values", "looking"))}
                <div className="px-5 py-3">
                  <Label className="text-xs">Manager — go deeper and record the evidence heard</Label>
                  <Textarea
                    className="mt-1"
                    placeholder="Concrete answers, examples and numbers the candidate gave."
                    value={vNote("goals.evidence")}
                    onChange={(e) => setVNote("goals.evidence", e.target.value)}
                  />
                </div>
              </Part>

              <Part id="ingles" n={4} title="English level and roleplay">
                {item(
                  "english.grammar_test",
                  "Grammar Test",
                  `Score ${grammarScore} · completed ${answer("grammar_test", "completed")}`,
                  { hint: "The test is taken during the interview; the score is only shown here for confirmation." },
                )}
                <div className="px-5 py-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Irregular verbs</p>
                      <p className="mt-1 text-sm">{verbs.length ? `${verbsOk}/${verbs.length} correct` : "Not recorded"}</p>
                      {verbs.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {verbs.map((v) => (
                            <span
                              key={`${v.verb}-${v.position}`}
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-xs",
                                v.correct ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive",
                              )}
                            >
                              {v.verb}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Verify value={vState("english.verbs")} onChange={(s) => setVerify("english.verbs", s)} />
                  </div>
                  <Input
                    className="mt-2"
                    placeholder="Manager note on the verbs"
                    value={vNote("english.verbs")}
                    onChange={(e) => setVNote("english.verbs", e.target.value)}
                  />
                </div>
                {item("english.spoken", "Spoken English and pronunciation", `${answer("english", "meets_level")} · ${answer("english", "notes")}`)}
                {item("english.explanations", "Grammar explanations given in the interview", answer("english", "tenses"))}
                {item(
                  "english.error_correction",
                  "Error correction and WH questions",
                  `${answer("english", "mistakes_wh")} · ${answer("english", "past_question")}`,
                )}
                {item(
                  "english.writing",
                  "Writing test",
                  `Topic: ${answer("english", "writing_topic")} · ${answer("english", "writing_text")} · Notes: ${answer("english", "writing_notes")}`,
                )}
                {item("english.reading", "Reading (B2 past-tense passage)", answer("english", "reading_observations"))}
                {criteriaBlock(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"], "Manager scoring — Grammar and English Knowledge")}
                <div className="px-5 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Teaching demo</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{answer("english", "roleplay_notes")}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">Demo topic</Label>
                      <Input value={form.demoTopic} onChange={(e) => set({ demoTopic: e.target.value })} placeholder="e.g. Simple Present" />
                    </div>
                    <div>
                      <Label className="text-xs">Kudos</Label>
                      <Input value={vNote("english.demo_kudos")} onChange={(e) => setVNote("english.demo_kudos", e.target.value)} placeholder="What worked well" />
                    </div>
                    <div>
                      <Label className="text-xs">Areas for improvement</Label>
                      <Input value={vNote("english.demo_areas")} onChange={(e) => setVNote("english.demo_areas", e.target.value)} placeholder="What must change" />
                    </div>
                    <Verify value={vState("english.demo")} onChange={(s) => setVerify("english.demo", s)} />
                  </div>
                </div>
                {criteriaBlock(["d1", "d2", "d3", "d4", "d5", "d6"], "Manager scoring — Teaching Demo")}
                <div className="px-5 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Coachability</p>
                  <p className="mt-1 text-sm">Feedback was given during the demo; score how it was received and applied.</p>
                  <Verify className="mt-2" value={vState("english.coachability")} onChange={(s) => setVerify("english.coachability", s)} />
                </div>
                {criteriaBlock(["c1", "c2", "c3", "c4", "c5"], "Manager scoring — Coachability")}
                {criteriaBlock(["e1"], "Manager scoring — English communication")}
              </Part>

              <Part id="experiencia" n={5} title="Studies and job experience · Method A">
                {item(
                  "experience.studies",
                  "Studies and certifications",
                  [
                    `Institution: ${answer("studies", "school")}`,
                    `Program: ${answer("studies", "major")}`,
                    `Period: ${answer("studies", "start_year")} – ${answer("studies", "end_year")}`,
                    `Notes: ${answer("studies", "notes")}`,
                    `Additional: ${answer("studies", "additional")}`,
                    `Certifications: ${answer("studies", "certifications")}`,
                  ].join("\n"),
                )}
                {item(
                  "experience.gaps",
                  "Employment gaps",
                  jobs.some((j) => String(j.gap_explanation ?? "").trim())
                    ? jobs.filter((j) => String(j.gap_explanation ?? "").trim()).map((j) => `${j.company}: ${j.gap_explanation}`).join("\n")
                    : "Not recorded",
                  { hint: "Clarify the period; do not classify a gap as a red flag by itself." },
                )}
                {item(
                  "experience.references",
                  "Reference verification",
                  d.references.length
                    ? d.references.map((r) => `${r.company}: ${shown(r.verification_status)}`).join("\n")
                    : "No references recorded",
                )}
                {jobs.length === 0 && <p className="px-5 py-3 text-sm text-muted-foreground">No job history recorded.</p>}
                {jobs.map((j) => {
                  const key = `experience.job.${j.slot}`;
                  const ref = d.references.find(
                    (r) => (r.company ?? "").trim().toLowerCase() === (j.company ?? "").trim().toLowerCase(),
                  );
                  return (
                    <details key={j.id} className="group px-5 py-3" open={jobs.length <= 2}>
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        <span>{shown(j.company)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{shown(j.position)}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{shown(j.start_date)} – {shown(j.end_date)}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {jobStatus(j.start_date, j.end_date)}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                            vState(key) === "confirmed"
                              ? "bg-success/15 text-success"
                              : vState(key) === "discrepancy"
                                ? "bg-destructive/10 text-destructive"
                                : vState(key) === "clarification"
                                  ? "bg-warning/20 text-foreground"
                                  : "bg-secondary text-muted-foreground",
                          )}
                        >
                          {MANAGER_VERIFICATION_STATES.find(([k]) => k === vState(key))?.[1]}
                        </span>
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <ol className="space-y-2 text-sm">
                          {[
                            ["What were you hired to do?", j.hired_to_do],
                            ["What was your biggest accomplishment?", j.accomplishment],
                            ["What results or numbers demonstrate that accomplishment?", null],
                            ["What was your lowest moment or biggest challenge?", j.biggest_mistake],
                            ["Who was your supervisor?", j.supervisor_name],
                            ["What score would your supervisor give you from 1 to 10?", j.supervisor_rating],
                            ["Why would they give you that score?", j.rating_reason],
                            ["Why did you leave?", j.reason_for_leaving],
                            ["Were there gaps between jobs? What were you doing?", j.gap_explanation],
                          ].map(([label, value], idx) => (
                            <li key={idx}>
                              <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                              <p className="whitespace-pre-wrap">{shown(value)}</p>
                            </li>
                          ))}
                        </ol>
                        <div className="space-y-3">
                          <div className="rounded-lg border border-border p-3 text-sm">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Reference</p>
                            {ref ? (
                              <p className="mt-1">
                                {shown(ref.supervisor_name)} · {shown(ref.supervisor_phone)} ·{" "}
                                {shown(ref.supervisor_email)} · verification: {shown(ref.verification_status)}
                              </p>
                            ) : (
                              <p className="mt-1">No reference recorded for this job.</p>
                            )}
                            {ref && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Differences detected: {shown(ref.verification_notes ?? ref.verification_status)}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Manager verification</p>
                            <Verify className="mt-1" value={vState(key)} onChange={(s) => setVerify(key, s)} />
                            <Textarea
                              className="mt-2"
                              placeholder="Corrections, evidence or observations for this job"
                              value={vNote(key)}
                              onChange={(e) => setVNote(key, e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </Part>

              <Part id="valores" n={6} title="Values and motivation">
                {item("values.motivation", "What they are looking for", answer("values", "looking"))}
                {item("values.development", "Learning and development", answer("values", "learning"))}
                {item("values.consistency", "Commitment and consistency", `${answer("candidate", "referred")} referred · source ${answer("candidate", "referral_source")}`)}
                {item("values.behaviour", "Behaviour and interests shared", answer("values", "energy"))}
                {item("values.anything_else", "Anything else the candidate shared", answer("values", "anything_else"))}
                {criteriaBlock(["e2", "e3"], "Manager scoring — Instructions and Professionalism")}
              </Part>

              <Part id="decision" n={7} title="Questions and final decision">
                {item("decision.questions", "Candidate questions", answer("values", "questions"))}
                <div className="px-5 py-3">
                  <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">Recruitment final comments (read only)</p>
                    <p className="whitespace-pre-wrap">{shown(interview?.comments)}</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Manager final comments</Label>
                      <Textarea value={form.internalComments} onChange={(e) => set({ internalComments: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Red flags (internal)</Label>
                      <Textarea value={form.redFlags} onChange={(e) => set({ redFlags: e.target.value })} />
                    </div>
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <Checkbox checked={form.criticalRedFlag} onCheckedChange={(v) => set({ criticalRedFlag: v === true })} />
                    Critical job-related red flag (mark only with concrete evidence)
                  </label>
                </div>
                <div className="px-5 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Double-check before deciding</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {VERIFICATION_CHECKS.map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={Boolean(form.checks[k])}
                          onCheckedChange={(v) => set({ checks: { ...form.checks, [k]: v === true } })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="space-y-1.5">
                    <Label>Final decision</Label>
                    <Select value={form.finalDecision} onValueChange={(v) => set({ finalDecision: v as ManagerDecision })}>
                      <SelectTrigger><SelectValue placeholder="Select the final decision" /></SelectTrigger>
                      <SelectContent>{MANAGER_DECISIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">The recommendation never decides for you.</p>
                  </div>
                  {form.finalDecision === "Retake" && (
                    <>
                      <div>
                        <Label>Areas to improve (shared with the candidate)</Label>
                        <div className="mt-1 flex flex-wrap gap-3">
                          {AREAS.map((a) => (
                            <label key={a} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={form.improvementAreas.includes(a)}
                                onCheckedChange={(v) =>
                                  set({
                                    improvementAreas: v === true ? [...form.improvementAreas, a] : form.improvementAreas.filter((x) => x !== a),
                                  })
                                }
                              />
                              {a}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Short feedback for the candidate (only English/Grammar/Pronunciation/Technical)</Label>
                        <Textarea value={form.improvementNote} onChange={(e) => set({ improvementNote: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Eligible to apply again on</Label>
                        <Input type="date" value={form.eligibleAgainDate} onChange={(e) => set({ eligibleAgainDate: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.finalDecision === "Not Approved" && (
                    <div className="space-y-1.5">
                      <Label>Internal reason (never emailed)</Label>
                      <Textarea value={form.decisionReason} onChange={(e) => set({ decisionReason: e.target.value })} />
                    </div>
                  )}
                  {form.finalDecision === "Approved for Training" && (
                    <p className="text-xs text-muted-foreground">
                      The welcome email stays pending until a cohort is assigned. The recommendation and the gates do not
                      replace this decision.
                    </p>
                  )}
                  {form.finalDecision === "No Show" && (
                    <div className="space-y-1.5">
                      <Label>Appointment the candidate missed</Label>
                      <Input type="datetime-local" value={form.appointmentAt} onChange={(e) => set({ appointmentAt: e.target.value })} />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" onClick={() => setConfirm(true)}>Submit decision</Button>
                    <span className="text-xs text-muted-foreground">
                      {result.complete ? "All criteria captured." : "Complete every criterion before submitting."}
                    </span>
                  </div>
                </div>
              </Part>
            </fieldset>
          )}

          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Application, retake and decision history</summary>
            <ul className="mt-3 space-y-1 text-sm">
              {d.interviews.map((i) => (
                <li key={i.id}>Recruitment attempt {i.attempt_number}: {resultLabel(i.final_result) || i.status} · {fmt(i.submitted_at)}</li>
              ))}
              {d.managerEvaluations.map((m) => (
                <li key={m.id}>Manager attempt {m.attempt_number}: {m.final_decision ?? m.status} · {m.total_score ?? "—"}/100 · {fmt(m.decided_at)}</li>
              ))}
            </ul>
            <ul className="mt-3 max-h-64 space-y-1 overflow-auto text-xs text-muted-foreground">
              {d.history.map((h) => (
                <li key={h.id}>{fmt(h.created_at)} · {h.action} · {h.actor_email ?? "system"}{h.actor_role ? ` (${h.actor_role})` : ""}</li>
              ))}
            </ul>
          </details>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-40 xl:self-start">
          {result && current && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="text-3xl font-bold">{result.total}<span className="text-base text-muted-foreground">/100</span></p>
              {MANAGER_SECTIONS.map((s) => {
                const sec = result.sections.find((x) => x.key === s.key)!;
                return (
                  <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{s.title}</span>
                    <span className={cn("shrink-0 font-semibold", sec.passed ? "text-success" : "text-destructive")}>
                      {sec.points}/{s.max}{s.gate != null ? ` · gate ≥ ${s.gate}` : ""}
                    </span>
                  </div>
                );
              })}
              <p className="rounded-lg bg-secondary p-2 font-semibold">{result.recommendation ?? "Complete all criteria to see the recommendation"}</p>
              <p>Final decision: <strong>{current.final_decision ?? "—"}</strong></p>
              <p className="text-xs text-muted-foreground">Manager: {managerName} · {fmt(current.decided_at ?? current.updated_at)}</p>
              {d.access.isAdmin && locked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await reopen({ data: { evaluationId: current.id, reason: "" } });
                    toast.success("Reopened");
                    await refresh();
                  }}
                >
                  Reopen (Admin)
                </Button>
              )}
            </div>
          )}
          {lastEmail && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="font-semibold">Result email</p>
              {managerEmails.map((e) => (
                <p key={e.id} className="text-xs">
                  {fmt(e.created_at)} · {e.kind} · <span className={e.status === "sent" ? "text-success" : e.status === "failed" ? "text-destructive" : ""}>{e.status}</span>
                  {e.http_status != null ? ` · HTTP ${e.http_status}` : ""}{e.response_message ? ` · ${e.response_message}` : ""}
                </p>
              ))}
              {locked && d.access.canDecide && current?.final_decision !== "Approved for Training" && (
                <Button
                  size="sm"
                  variant={lastEmail.status === "failed" ? "default" : "outline"}
                  onClick={async () => {
                    const r = await retry({ data: { evaluationId: current!.id } });
                    if (r.ok) toast.success("Email sent");
                    else toast.error(r.detail);
                    await refresh();
                  }}
                >
                  {lastEmail.status === "failed" ? "Retry email" : "Resend email"}
                </Button>
              )}
            </div>
          )}
        </aside>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit "{form?.finalDecision}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The evaluation will be locked.{" "}
              {form?.finalDecision === "Approved for Training"
                ? "The Training welcome email stays pending until a cohort is assigned."
                : "The candidate email will be sent now through the recruitment mailbox."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onSubmit()}>Confirm and submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Part({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-40 rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Item({
  label,
  recruitment,
  hint,
  state,
  onState,
  note,
  onNote,
  disabled,
}: {
  label: string;
  recruitment: string;
  hint?: string | undefined;
  state: ManagerVerificationState;
  onState: (state: ManagerVerificationState) => void;
  note: string;
  onNote: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3 px-5 py-3 md:grid-cols-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{recruitment}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-2">
        <Verify value={state} onChange={onState} />
        <Input
          placeholder="Manager note or correction"
          value={note}
          onChange={(e) => onNote(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function Verify({
  value,
  onChange,
  className,
}: {
  value: ManagerVerificationState;
  onChange: (state: ManagerVerificationState) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {MANAGER_VERIFICATION_STATES.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === key ? verificationClass(key) : "border-border text-muted-foreground hover:bg-secondary",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function verificationClass(key: ManagerVerificationState) {
  switch (key) {
    case "confirmed":
      return "border-success/50 bg-success/15 text-success";
    case "clarification":
      return "border-warning/60 bg-warning/20 text-foreground";
    case "discrepancy":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    default:
      return "border-border bg-secondary text-muted-foreground";
  }
}

function ScoreRow({
  criterion,
  score,
  evidence,
  onScore,
  onEvidence,
}: {
  criterion: (typeof MANAGER_SECTIONS)[number]["criteria"][number];
  score: string;
  evidence: string;
  onScore: (value: string) => void;
  onEvidence: (value: string) => void;
}) {
  return (
    <div className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_86px]">
      <div className="min-w-0">
        <p className="text-sm font-medium">{criterion.label}</p>
        <p className="text-xs text-muted-foreground">{criterion.expected ? `Expected: ${criterion.expected}` : criterion.hint}</p>
        <Input className="mt-1" placeholder="Evidence observed" value={evidence} onChange={(e) => onEvidence(e.target.value)} />
      </div>
      <div>
        <Label className="text-xs">0–{criterion.max}</Label>
        <Input type="number" min={0} max={criterion.max} value={score} onChange={(e) => onScore(e.target.value)} />
      </div>
    </div>
  );
}
