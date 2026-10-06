import { ONLINE_FIXED, ONSITE_TRAINING_HOURS } from "@/lib/agreements/constants";
import { readFinalFilter } from "@/lib/evaluations";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { defaultFfTimezone } from "@/lib/evaluations";
import { BLOCK_LABEL, DAY_PATTERNS, TIME_OPTIONS, blocksFor, fmt12, formatSchedule, parseSchedule, scheduleProblems, type BlockKey, type DayPattern, type ScheduleStruct } from "@/lib/schedule";
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
  MANAGER_STAGES,
  MANAGER_TOTAL_TIME,
  RECONFIRM_CHECKS,
  STAGE_NOTE_KEYS,
  TRAINING_KEYS,
  AGREEMENT_KEYS,
  missingTraining,
  SCHEDULE_STRUCT_KEYS,
  confirmedModality,
  normalizeModality,
  type ManagerDecision,
  type ManagerVerificationState,
} from "@/lib/manager-scorecard";
import { resultLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/second-filter/$applicationId")({
  head: () => ({
    meta: [
      { title: "Manager Final Interview — E4CC" },
      { name: "description", content: "Six-stage Manager final interview for E4CC candidates." },
      { property: "og:title", content: "Manager Final Interview — E4CC" },
      { property: "og:description", content: "Internal E4CC Manager final interview." },
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

const NAV: [string, string][] = MANAGER_STAGES.map((st) => [st.id, `${st.n} · ${st.title}`]);

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

function jobDuration(start: string | null, end: string | null) {
  const from = new Date(start ?? "");
  const to = end ? new Date(end) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return "Not recorded";
  const months = Math.max(0, Math.round((to.getTime() - from.getTime()) / 2_629_746_000));
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  return [years ? `${years} yr${years === 1 ? "" : "s"}` : "", remaining ? `${remaining} mo` : ""].filter(Boolean).join(" ") || "< 1 mo";
}

function ordinal(slot: number) {
  if (slot === 1) return "1st";
  if (slot === 2) return "2nd";
  if (slot === 3) return "3rd";
  return `${slot}th`;
}

/** Adds today + period (days/weeks/months) and returns yyyy-mm-dd. */
function addPeriod(amount: number, unit: "days" | "weeks" | "months") {
  const dt = new Date();
  if (unit === "months") dt.setMonth(dt.getMonth() + amount);
  else dt.setDate(dt.getDate() + amount * (unit === "weeks" ? 7 : 1));
  return dt.toISOString().slice(0, 10);
}

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
  const [reviewed, setReviewed] = useState(false);
  const [showFull, setShowFull] = useState(false);
  // Any change to the form after reviewing requires a new review.
  useEffect(() => { setReviewed(false); }, [form]); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState<string>("reconfirmation");
  const [period, setPeriod] = useState<{ amount: string; unit: "days" | "weeks" | "months" }>({ amount: "", unit: "months" });
  const [submitting, setSubmitting] = useState(false);
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

  // Training defaults come from the Recruitment file; the Manager confirms or corrects them.
  const trainingDefaults = useMemo(() => {
    if (!d) return {} as Record<string, string>;
    const iv = d.interviews.find((i) => i.final_result === "Approved for last step") ?? d.interviews[0];
    const sec = (iv?.sections ?? {}) as Record<string, Record<string, unknown>>;
    const start = String(sec["profile"]?.["training_start"] ?? sec["candidate"]?.["training_start"] ?? "").trim();
    // Suggested modality from the Recruitment file; the Manager must confirm it in the closing step.
    return { [TRAINING_KEYS.startDate]: start } as Record<string, string>;
  }, [d]);
  const withDefaults = (ev: Record<string, string>) => {
    const out = { ...ev };
    for (const [k, v] of Object.entries(trainingDefaults)) if (!(k in out) && v) out[k] = v;
    return out;
  };

  const payload = (submit: boolean) => ({
    evaluationId: current!.id,
    demoTopic: form!.demoTopic || null,
    scores: {},
    evidence: withDefaults(form!.evidence),
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
    if (submitting) return;
    setConfirm(false);
    setSubmitting(true);
    try {
      const r = await save({ data: payload(true) });
      if (!r.ok) {
        toast.error(`Missing: ${r.missing.join(", ")}`);
        return;
      }
      if (r.duplicate) toast.info("This interview was already finished.");
      else if (r.email && !r.email.ok) toast.error(`Interview finished, but the email failed: ${r.email.detail}`);
      else toast.success("Interview finished");
      dirty.current = false;
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not finish");
    } finally {
      setSubmitting(false);
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
  const confirmedMod = confirmedModality(form?.evidence);
  const suggestedMod = normalizeModality(p?.work_modality) ?? normalizeModality((d.interviews[0]?.sections as Record<string, Record<string, unknown>> | null)?.["candidate"]?.["lob"]);
  const isOnline = (confirmedMod ?? suggestedMod) === "online";
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
  const recruitmentFlags = String(interview?.red_flags ?? "").trim();

  const vNote = (key: string) => form?.evidence[`v:${key}`] ?? "";
  const setVNote = (key: string, text: string) =>
    set({ evidence: { ...(form?.evidence ?? {}), [`v:${key}`]: text } });
  const note = (key: string) => form?.evidence[key] ?? "";
  const setNote = (key: string, text: string) => set({ evidence: { ...(form?.evidence ?? {}), [key]: text } });
  const tv = (key: string) => form?.evidence[key] ?? trainingDefaults[key] ?? "";
  const setT = setNote;
  const tz = defaultFfTimezone((app as { country_code?: string | null }).country_code);
  const setSchedule = (structKey: string, textKey: string, v: ScheduleStruct) =>
    set({ evidence: { ...(form?.evidence ?? {}), [structKey]: JSON.stringify(v), [textKey]: formatSchedule(v, tz) } });
  const trainingMissing = [
    ...(confirmedMod ? [] : ["Position modality (Online / Onsite)"]),
    ...missingTraining(withDefaults(form?.evidence ?? {}), isOnline),
  ];
  async function saveDraft() {
    if (!current || !editable) return;
    try {
      await save({ data: payload(false) });
      dirty.current = false;
      setSaving("saved");
      toast.success("Draft saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

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
    />
  );

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-[1500px] px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <BrandMark className="h-6 shrink-0" />
                <h1 className="truncate text-2xl font-bold">{app.full_name}</h1>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {app.status}
                </span>
                {app.withdrawn_at && (
                  <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    Withdrawn by applicant
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-5 gap-y-2">
                <Fact label="Country" value={shown(app.country)} />
                <Fact label="Modality" value={shown(p?.work_modality)} />
                <Fact label="Branch / city" value={shown(app.city)} />
                <Fact label="Email" value={shown(app.email)} />
                <Fact label="Phone" value={shown(app.phone_e164 ?? app.phone)} />
                <Fact label="Recruiter" value={recruiterName} />
                <Fact label="Manager" value={shown(managerName)} />
                <Fact label="Grammar Test" value={grammarScore} />
                <Fact label="English level (AI)" value={(app.ai_evaluations as { cefr: string | null }[] | null)?.[0]?.cefr ?? "Not evaluated"} />
                <Fact label="Recruitment result" value={resultLabel(interview?.final_result) || "Not recorded"} />
                <Fact label="First interview" value={fmt(interview?.submitted_at)} />
                {(() => { const ff = readFinalFilter(S["result"]); return ff.state === "complete" ? (
                  <Fact label="Final interview" value={`${ff.details.date} · ${ff.details.time} · ${ff.details.interviewer}${ff.details.location ? ` · ${ff.details.location}` : ""}`} />
                ) : null; })()}
              </dl>
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
        </div>
      </header>
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
          <nav className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-5 py-2">
            {NAV.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  active === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {label}
              </a>
            ))}
          </nav>
      </div>

      <div className="mx-auto grid max-w-[1200px] gap-5 px-5 py-5">
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

              <section id="recruitment-file" className="scroll-mt-16 space-y-4 rounded-2xl border-2 border-primary/30 bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">Recruitment interview and candidate file</h2>
                  {d.resumeUrl ? (
                    <Button asChild variant="outline"><a href={d.resumeUrl} target="_blank" rel="noreferrer">Open CV <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
                  ) : <span className="text-sm text-muted-foreground">CV not uploaded</span>}
                </div>
                <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                  <QA label="Availability" value={`${answer("profile", "availability_required")} · ${answer("profile", "main_schedule")}`} />
                  <QA label="Class schedule requested" value={answer("candidate", "schedule")} />
                  <QA label="Training start (Recruitment)" value={answer("profile", "training_start")} />
                  <QA label="Teaching experience" value={`${answer("profile", "teaching_experience")} · ${shown(app.teaching_experience)}`} />
                  <QA label="Call center experience" value={`${answer("profile", "callcenter_experience")} · ${shown(app.callcenter_experience_level)}`} />
                  <QA label="Recruitment result" value={resultLabel(interview?.final_result) || "Not recorded"} />
                  <QA label="Jobs / references" value={`${jobs.length} jobs · ${d.references.length} references`} />
                  <QA label="Pending verification" value={[
                    ...d.references.filter((r) => !/verified/i.test(String(r.verification_status ?? ""))).map((r) => `Reference: ${shown(r.company)}`),
                    ...jobs.filter((j) => String(j.gap_explanation ?? "").trim()).map((j) => `Gap: ${shown(j.company)}`),
                  ].join("\n") || "Nothing pending"} />
                </dl>
                <div className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4">
                  <p className="flex items-center gap-2 text-base font-semibold text-destructive"><AlertTriangle className="h-5 w-5 shrink-0" /> Red flags from Recruitment — internal, never sent to the candidate</p>
                  <p className="mt-1 whitespace-pre-wrap text-base">{recruitmentFlags || "None reported"}</p>
                </div>
                <Button type="button" size="lg" variant={showFull ? "outline" : "default"} className="w-full sm:w-auto" onClick={() => setShowFull((v) => !v)}>
                  {showFull ? "Hide full Recruitment interview" : "View full Recruitment interview"}
                </Button>
                {showFull && (
                  <fieldset disabled className="min-w-0 space-y-4">
              <Part id="perfil" n={1} title="Profile, modality and availability">
                {item("perfil.modality", "Work modality", shown(p?.work_modality ?? S["candidate"]?.["lob"]))}
                {item("perfil.branch", "Branch / location", shown(app.city))}
                {item("perfil.schedule", "Class schedule requested", answer("candidate", "schedule"))}
                {item("perfil.training_start", "Training start date", answer("profile", "training_start"))}
                {item("perfil.payment", "Payment conditions accepted", answer("profile", "agrees_payment"))}
                {item("perfil.availability", "Availability required", answer("profile", "availability_required"))}
                {item("perfil.main_schedule", "Schedule type", answer("profile", "main_schedule"))}
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

              <Part id="metas" n={3} title="Goals and motivation">
                {item("goals.career", "Professional goals", answer("values", "goals"))}
                {item("goals.why_e4cc", "Why they applied to E4CC", answer("values", "why_e4cc"))}
                {item("goals.teaching_interest", "Interest in teaching", answer("values", "learning"))}
                {item("goals.plans", "How the role fits their plans", answer("values", "looking"))}
                <div className="px-5 py-3">
                  <Label className="text-sm font-semibold">Manager — go deeper and record the evidence heard</Label>
                  <Textarea
                    className="mt-1"
                    placeholder="Concrete answers, examples and numbers the candidate gave."
                    value={vNote("goals.evidence")}
                    onChange={(e) => setVNote("goals.evidence", e.target.value)}
                  />
                </div>
              </Part>

              <Part id="ingles" n={4} title="English, grammar, verbs and demo">
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
                  </div>
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
                {item("english.demo", "Teaching demo (Recruitment)", answer("english", "roleplay_notes"))}
              </Part>

              <Part id="experiencia" n={5} title="Studies and job history · Method A">
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
                {jobs.length === 0 ? (
                  <p className="px-5 py-3 text-base text-muted-foreground">No job history recorded.</p>
                ) : (
                  <div className="space-y-4 px-5 py-4">
                    {jobs.map((j) => {
                      const ref = d.references.find((r) => (r.company ?? "").trim().toLowerCase() === (j.company ?? "").trim().toLowerCase());
                      return (
                        <article key={j.id} className="rounded-xl border border-border bg-background p-4">
                          <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">{ordinal(j.slot)} Job</span>
                            <h3 className="text-lg font-semibold">{shown(j.company)}</h3>
                            <span className="text-base text-muted-foreground">{shown(j.position)}</span>
                          </header>
                          <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                            <QA label="Dates" value={`${shown(j.start_date)} – ${shown(j.end_date)} · ${jobDuration(j.start_date, j.end_date)}`} />
                            <QA label="Supervisor and declared score" value={`${shown(j.supervisor_name)} · ${shown(j.supervisor_rating)}/10`} />
                            <QA label="Responsibilities (hired to do)" value={shown(j.hired_to_do)} />
                            <QA label="Accomplishments and results" value={shown(j.accomplishment)} />
                            <QA label="Difficulties / lowest moment" value={shown(j.biggest_mistake)} />
                            <QA label="Score reason" value={shown(j.rating_reason)} />
                            <QA label="Reason for leaving" value={shown(j.reason_for_leaving)} />
                            <QA label="Periods without employment" value={shown(j.gap_explanation)} />
                            <QA label="Reference" value={ref ? `${shown(ref.supervisor_name)} · ${shown(ref.supervisor_phone)} · ${shown(ref.verification_status)}` : "Not recorded"} />
                          </dl>
                        </article>
                      );
                    })}
                  </div>
                )}
              </Part>

              <Part id="valores" n={6} title="Values and candidate questions">
                {item("values.motivation", "What they are looking for", answer("values", "looking"))}
                {item("values.development", "Learning and development", answer("values", "learning"))}
                {item("values.consistency", "Commitment and consistency", `${answer("candidate", "referred")} referred · source ${answer("candidate", "referral_source")}`)}
                {item("values.behaviour", "Behaviour and interests shared", answer("values", "energy"))}
                {item("values.anything_else", "Anything else the candidate shared", answer("values", "anything_else"))}
                {item("values.questions", "Candidate questions", answer("values", "questions"))}
              </Part>

              <Part id="referencias" n={7} title="References">
                {d.references.length === 0 ? (
                  <p className="px-5 py-3 text-base text-muted-foreground">No references recorded.</p>
                ) : (
                  <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
                    {d.references.map((r, i) => (
                      <div key={i} className="rounded-xl border border-border bg-background p-4">
                        <p className="text-base font-semibold">{shown(r.company)} · {shown(r.position)}</p>
                        <dl className="mt-2 space-y-2">
                          <QA label="Supervisor" value={`${shown(r.supervisor_name)} · ${shown(r.supervisor_phone)}`} />
                          <QA label="Reason for leaving" value={shown(r.reason_for_leaving)} />
                          <QA label="Verification" value={shown(r.verification_status)} />
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </Part>

              <Part id="resultado" n={8} title="Result, comments and internal red flags">
                {item("result.final", "Recruitment result", resultLabel(interview?.final_result) || "Not recorded")}
                {item("result.comments", "Recruitment final comments", shown(interview?.comments))}
                <div className="bg-destructive/5 px-5 py-3">
                  <p className="text-sm font-semibold uppercase text-destructive">Red flags — internal only, never sent to the candidate</p>
                  <p className="mt-1 whitespace-pre-wrap text-base">{recruitmentFlags || "Not recorded"}</p>
                </div>
              </Part>
                  </fieldset>
                )}
              </section>

          {form && (
            <fieldset disabled={!editable} className="min-w-0 space-y-4">
              {locked && (
                <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
                  <Lock className="h-4 w-4" /> Finished {fmt(current?.submitted_at)} — locked. Only Admin can reopen it.
                </p>
              )}
              {!current && (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Interview not started — the file below is read-only until you start it.</p>
              )}

              <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
                <span className="text-sm font-semibold text-foreground">Manager Final Interview</span>
                <span>Estimated duration: <strong className="text-foreground">{MANAGER_TOTAL_TIME}</strong> · guide only</span>
                <span>Recruitment record: <strong className="text-foreground">read only · one reconfirmation checklist</strong></span>
                <span className="ml-auto">{saving === "saving" ? "Saving…" : saving === "saved" ? "All changes saved" : ""}</span>
              </section>
              <Stage id="reconfirmation">
                <p className="text-xs text-muted-foreground">Focus on changes, availability and inconsistencies from the first interview. Do not repeat it.</p>
                <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <Fact label="Class schedule" value={answer("candidate", "schedule")} />
                  <Fact label="Availability" value={`${answer("profile", "availability_required")} · ${answer("profile", "main_schedule")}`} />
                  <Fact label="Training start (Recruitment)" value={shown(trainingDefaults[TRAINING_KEYS.startDate])} />
                  <Fact label="Modality / branch" value={`${shown(p?.work_modality ?? S["candidate"]?.["lob"])} · ${shown(app.city)}`} />
                  <Fact label="Current job / routine" value={answer("profile", "routine_answer")} />
                  <Fact label="Jobs / references" value={`${jobs.length} jobs · ${d.references.length} references`} />
                  {isOnline && (
                    <Fact
                      label="Internet"
                      value={p?.internet_download_mbps != null ? `${p.internet_download_mbps}↓ / ${p.internet_upload_mbps ?? "—"}↑ Mbps · ${p.internet_test_passed ? "Passed" : p.internet_override ? "Override" : "Below minimum"}` : "Not evaluated"}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {RECONFIRM_CHECKS.filter(([k]) => k !== "equipment" || isOnline).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={Boolean(form.checks[k])} onCheckedChange={(v) => set({ checks: { ...form.checks, [k]: v === true } })} />
                      {label}
                    </label>
                  ))}
                  {!isOnline && <span className="text-xs text-muted-foreground">Equipment and internet: N/A (Onsite)</span>}
                </div>
                <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <Label className="text-sm font-semibold">Training start date (confirm or correct)</Label>
                    <Input value={tv(TRAINING_KEYS.startDate)} onChange={(e) => setT(TRAINING_KEYS.startDate, e.target.value)} placeholder="e.g. 2026-10-05" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Reconfirmation Comments</Label>
                    <Textarea rows={2} value={note(STAGE_NOTE_KEYS.reconfirmation)} onChange={(e) => setNote(STAGE_NOTE_KEYS.reconfirmation, e.target.value)} />
                  </div>
                </div>
              </Stage>

              <Stage id="grammar">
                <Guide>Evaluate Simple Present, Present Progressive, Simple Past and Past Progressive: use, structure and an example. Then ask the candidate to identify, correct and explain intermediate-level errors.</Guide>
                <div>
                  <Label className="text-sm font-semibold">Comments (grammar, comprehension, fluency, pronunciation)</Label>
                  <Textarea rows={4} value={note(STAGE_NOTE_KEYS.grammar)} onChange={(e) => setNote(STAGE_NOTE_KEYS.grammar, e.target.value)} />
                </div>
              </Stage>

              <Stage id="demo">
                <Guide>Assign a topic. Observe without interrupting or completing the candidate’s ideas. Look at accuracy, clarity, interaction, checking questions, correction, energy and time management.</Guide>
                <div className="space-y-3">
                  <div className="max-w-md">
                    <Label className="text-sm font-semibold">Demo Topic</Label>
                    <Input value={form.demoTopic} onChange={(e) => set({ demoTopic: e.target.value })} placeholder="e.g. Simple Present" />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Teaching Demo Comments</Label>
                    <Textarea rows={3} value={note(STAGE_NOTE_KEYS.demo)} onChange={(e) => setNote(STAGE_NOTE_KEYS.demo, e.target.value)} />
                  </div>
                </div>
              </Stage>

              <Stage id="feedback">
                <Guide>Identify 1–2 areas for improvement. Ask permission to provide open and honest feedback.</Guide>
                <div>
                  <Label className="text-sm font-semibold">Feedback Given (and the action to apply in the retake)</Label>
                  <Textarea rows={3} value={note(STAGE_NOTE_KEYS.feedback)} onChange={(e) => setNote(STAGE_NOTE_KEYS.feedback, e.target.value)} />
                </div>
              </Stage>

              <Stage id="retake">
                <Guide>Look for visible, specific improvement in the repeated demonstration. This is part of the interview — it does not change the candidate status or send emails.</Guide>
                <div>
                  <Label className="text-sm font-semibold">Observed Improvement / Coachability Comments</Label>
                  <Textarea rows={3} value={note(STAGE_NOTE_KEYS.retake)} onChange={(e) => setNote(STAGE_NOTE_KEYS.retake, e.target.value)} />
                </div>
              </Stage>

              <Stage id="closing">
                <div className="rounded-lg bg-secondary/50 p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">Recruitment final comments (read only)</p>
                  <p className="whitespace-pre-wrap">{shown(interview?.comments)}</p>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">Candidate questions</p>
                  <p className="whitespace-pre-wrap">{answer("values", "questions")}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-sm font-semibold">Final Internal Comments</Label>
                    <Textarea rows={3} value={form.internalComments} onChange={(e) => set({ internalComments: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">Red Flags — Internal Only</Label>
                    <Textarea rows={3} value={form.redFlags} onChange={(e) => set({ redFlags: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <div className="max-w-sm">
                    <Label className="text-sm font-semibold">Final Decision</Label>
                    <Select value={form.finalDecision} onValueChange={(v) => set({ finalDecision: v as ManagerDecision })}>
                      <SelectTrigger><SelectValue placeholder="Select the final decision" /></SelectTrigger>
                      <SelectContent>{MANAGER_DECISIONS.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  {form.finalDecision === "Approved for Training" && (
                    <div role="alert" className="flex gap-3 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">Revisa cuidadosamente antes de confirmar</p>
                        <p>Esta información aparecerá en el convenio de entrenamiento y en el correo de bienvenida del candidato. Verifica nombre completo, modalidad, fecha de inicio, días, horarios (AM/PM), sucursal y entrenador antes de finalizar.</p>
                      </div>
                    </div>
                  )}
                  {form.finalDecision === "Approved for Training" && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <TField label="Training start date" value={tv(TRAINING_KEYS.startDate)} onChange={(v) => setT(TRAINING_KEYS.startDate, v)} type="date" />
                      {isOnline ? (
                        <>
                          <Fact label="Training schedule (fixed)" value={ONLINE_FIXED.training} />
                          <Fact label="Classes (fixed)" value={`${ONLINE_FIXED.classes} · ${ONLINE_FIXED.fixedClass}; ${ONLINE_FIXED.extraClass}`} />
                        </>
                      ) : (
                        <>
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ScheduleField label="Training days and schedule" tz={tz} raw={tv(SCHEDULE_STRUCT_KEYS.training)} legacy={tv(TRAINING_KEYS.schedule)} onChange={(v) => setSchedule(SCHEDULE_STRUCT_KEYS.training, TRAINING_KEYS.schedule, v)} />
                          </div>
                        </>
                      )}
                      <div className="space-y-1">
                        <Label className="text-sm font-semibold">Position modality (confirm)</Label>
                        <Select value={confirmedMod ?? ""} onValueChange={(v) => setT(AGREEMENT_KEYS.modality, v)}>
                          <SelectTrigger><SelectValue placeholder={suggestedMod ? `Confirm (Recruitment: ${suggestedMod})` : "Select Online / Onsite"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="online">Online</SelectItem>
                            <SelectItem value="onsite">Onsite</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <TField label="Trainer name" value={tv(TRAINING_KEYS.trainer)} onChange={(v) => setT(TRAINING_KEYS.trainer, v)} />
                      <TField label="Trainer contact" value={tv(TRAINING_KEYS.trainerContact)} onChange={(v) => setT(TRAINING_KEYS.trainerContact, v)} placeholder="Email or WhatsApp" />
                      {isOnline ? (
                        <TField label="Zoom link" value={tv(TRAINING_KEYS.zoom)} onChange={(v) => setT(TRAINING_KEYS.zoom, v)} placeholder="https://zoom.us/j/…" />
                      ) : (
                        <>
                          <TField label="LOB / position type" value={tv(AGREEMENT_KEYS.lob)} onChange={(v) => setT(AGREEMENT_KEYS.lob, v)} placeholder="Onsite Full-Time" />
                          <TField label="Training branch" value={tv(TRAINING_KEYS.branch)} onChange={(v) => setT(TRAINING_KEYS.branch, v)} />
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox checked={tv(AGREEMENT_KEYS.classSameBranch) === "yes"} onCheckedChange={(v) => setT(AGREEMENT_KEYS.classSameBranch, v === true ? "yes" : "")} />
                            Class branch is the same as the training branch
                          </label>
                          {tv(AGREEMENT_KEYS.classSameBranch) !== "yes" && (
                            <TField label="Assigned class branch" value={tv(AGREEMENT_KEYS.classBranch)} onChange={(v) => setT(AGREEMENT_KEYS.classBranch, v)} />
                          )}
                          <div className="sm:col-span-2 xl:col-span-4">
                            <ScheduleField label="Class days and schedule" tz={tz} raw={tv(SCHEDULE_STRUCT_KEYS.classes)} legacy={tv(AGREEMENT_KEYS.classSchedule)} onChange={(v) => setSchedule(SCHEDULE_STRUCT_KEYS.classes, AGREEMENT_KEYS.classSchedule, v)} />
                          </div>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">
                        {trainingMissing.length ? `Still missing: ${trainingMissing.join(", ")}.` : "Training details complete."} On confirm, the {isOnline ? "Online" : "Onsite"} agreement PDF is generated and attached to the single welcome email.
                        {!isOnline && ONSITE_TRAINING_HOURS === null && " Onsite sending is on hold until the training hours clause (40 or 50) is confirmed."}
                      </p>
                    </div>
                  )}

                  {(form.finalDecision === "Retake" || form.finalDecision === "Not Approved") && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {form.finalDecision === "Retake" ? (
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Areas to improve (shared with the candidate)</Label>
                          <div className="flex flex-wrap gap-3">
                            {AREAS.map((a) => (
                              <label key={a} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={form.improvementAreas.includes(a)}
                                  onCheckedChange={(v) => set({ improvementAreas: v === true ? [...form.improvementAreas, a] : form.improvementAreas.filter((x) => x !== a) })}
                                />
                                {a}
                              </label>
                            ))}
                          </div>
                          <Textarea rows={2} placeholder="Short, safe feedback for the candidate" value={form.improvementNote} onChange={(e) => set({ improvementNote: e.target.value })} />
                        </div>
                      ) : (
                        <div>
                          <Label className="text-sm font-semibold">Internal reason (never emailed)</Label>
                          <Textarea rows={3} value={form.decisionReason} onChange={(e) => set({ decisionReason: e.target.value })} />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">{form.finalDecision === "Retake" ? "Eligible date to return" : "Can apply again from"}</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input className="w-20" type="number" min={1} placeholder="Qty" value={period.amount} onChange={(e) => setPeriod({ ...period, amount: e.target.value })} />
                          <Select value={period.unit} onValueChange={(v) => setPeriod({ ...period, unit: v as typeof period.unit })}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">days</SelectItem>
                              <SelectItem value="weeks">weeks</SelectItem>
                              <SelectItem value="months">months</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="outline" size="sm" disabled={!Number(period.amount)} onClick={() => set({ eligibleAgainDate: addPeriod(Number(period.amount), period.unit) })}>
                            Calculate
                          </Button>
                          <span className="text-xs text-muted-foreground">or pick</span>
                          <Input className="w-40" type="date" value={form.eligibleAgainDate} onChange={(e) => set({ eligibleAgainDate: e.target.value })} />
                        </div>
                        {form.eligibleAgainDate && <p className="text-xs">Date shown in the email: <strong>{form.eligibleAgainDate}</strong></p>}
                      </div>
                    </div>
                  )}

                  {form.finalDecision === "No Show" && (
                    <div className="max-w-xs">
                      <Label className="text-sm font-semibold">Appointment the candidate missed</Label>
                      <Input type="datetime-local" value={form.appointmentAt} onChange={(e) => set({ appointmentAt: e.target.value })} />
                      <p className="mt-1 text-xs text-muted-foreground">The interview stages are not required for a No Show.</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" onClick={() => void saveDraft()}>Save draft</Button>
                    <Button type="button" disabled={submitting || !form.finalDecision} onClick={() => setConfirm(true)}>Finish interview</Button>
                  </div>
                </div>
              </Stage>
            </fieldset>
          )}

          <div className="grid gap-4 md:grid-cols-2">
          {current && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
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
              <p className="font-semibold">Notification</p>
              {managerEmails.map((e) => (
                <p key={e.id} className="text-xs">
                  {fmt(e.created_at)} · {e.kind} · {e.to_email} · <span className={e.status === "sent" ? "text-success" : e.status === "failed" ? "text-destructive" : ""}>{e.status}</span>
                  {e.http_status != null ? ` · HTTP ${e.http_status}` : ""}{e.response_message ? ` · ${e.response_message}` : ""}
                </p>
              ))}
              {locked && d.access.canDecide && lastEmail.status === "failed" && !managerEmails.some((e) => e.status === "sent") && (
                <Button
                  size="sm"
                  onClick={async () => {
                    const r = await retry({ data: { evaluationId: current!.id } });
                    if (r.ok) toast.success("Email sent");
                    else toast.error(r.detail);
                    await refresh();
                  }}
                >
                  Retry failed email
                </Button>
              )}
            </div>
          )}
          </div>
          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-base font-semibold">Application, retake and decision history</summary>
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

      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish interview — "{form?.finalDecision}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The decision is saved, the status is updated and the interview is locked. One email is sent to the
              candidate{form?.finalDecision === "Approved for Training" ? " (Welcome to Training)" : ""}
              {form?.eligibleAgainDate && (form.finalDecision === "Retake" || form.finalDecision === "Not Approved") ? ` with the date ${form.eligibleAgainDate}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {form?.finalDecision === "Approved for Training" && (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3">
                {([
                  ["Full name", app.full_name],
                  ["Modality", confirmedMod === "online" ? "Online" : confirmedMod === "onsite" ? "Onsite" : "Not confirmed"],
                  ["Start date", tv(TRAINING_KEYS.startDate)],
                  ["Training schedule", isOnline ? ONLINE_FIXED.training : tv(TRAINING_KEYS.schedule)],
                  ...(isOnline
                    ? [["Classes", `${ONLINE_FIXED.classes} · ${ONLINE_FIXED.fixedClass}; ${ONLINE_FIXED.extraClass}`], ["Zoom", tv(TRAINING_KEYS.zoom)]]
                    : [
                        ["Training branch", tv(TRAINING_KEYS.branch)],
                        ["Class branch", tv(AGREEMENT_KEYS.classSameBranch) === "yes" ? tv(TRAINING_KEYS.branch) : tv(AGREEMENT_KEYS.classBranch)],
                        ["Class schedule", tv(AGREEMENT_KEYS.classSchedule)],
                        ["LOB", tv(AGREEMENT_KEYS.lob)],
                      ]),
                  ["Trainer", `${tv(TRAINING_KEYS.trainer)} — ${tv(TRAINING_KEYS.trainerContact)}`],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v?.trim() || "—"}</dd>
                  </div>
                ))}
              </dl>
              {trainingMissing.length > 0 && <p className="text-destructive">Still missing: {trainingMissing.join(", ")}.</p>}
              <label className="flex items-start gap-2">
                <Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} className="mt-0.5" />
                He revisado los datos y confirmo que son correctos para el convenio y el correo de bienvenida.
              </label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={submitting || (form?.finalDecision === "Approved for Training" && !reviewed)} onClick={() => void onSubmit()}>Confirm and finish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Part({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 rounded-2xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </header>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function Item({
  label,
  recruitment,
  hint,
}: {
  label: string;
  recruitment: string;
  hint?: string | undefined;
}) {
  return (
    <div className="px-5 py-3">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">{recruitment}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Stage({ id, children }: { id: (typeof MANAGER_STAGES)[number]["id"]; children: React.ReactNode }) {
  const st = MANAGER_STAGES.find((x) => x.id === id)!;
  return (
    <section id={id} className="scroll-mt-16 rounded-xl border border-border bg-card">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{st.n}</span>
        <h2 className="text-lg font-semibold">{st.title}</h2>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium text-muted-foreground">{st.time}</span>
      </header>
      <div className="space-y-4 px-5 py-4 text-base">{children}</div>
    </section>
  );
}

function QA({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-base leading-relaxed">{value}</dd>
    </div>
  );
}

function Guide({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border-l-4 border-primary bg-primary/5 px-3 py-2 text-sm">{children}</p>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-sm font-semibold text-muted-foreground">{label}</span>
      <span className="break-words text-base">{value}</span>
    </div>
  );
}

function TField({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <Label className="text-sm font-semibold">{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ScheduleField({ label, tz, raw, legacy, onChange }: { label: string; tz: string; raw: string; legacy: string; onChange: (v: ScheduleStruct) => void }) {
  const v: ScheduleStruct = parseSchedule(raw) ?? { pattern: "" };
  const problems = v.pattern ? scheduleProblems(v) : [];
  const setBlock = (k: BlockKey, part: "start" | "end", val: string) =>
    onChange({ ...v, [k]: { start: "", end: "", ...v[k], [part]: val } });
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label className="text-sm font-semibold">{label} <span className="text-muted-foreground">· {tz}</span></Label>
      {!raw && legacy.trim() && (
        <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">Previous value (not converted): “{legacy}”. Please review and select the days and times again.</p>
      )}
      <Select value={v.pattern} onValueChange={(p) => onChange({ ...v, pattern: p as DayPattern })}>
        <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select the days" /></SelectTrigger>
        <SelectContent>{DAY_PATTERNS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
      </Select>
      {blocksFor(v.pattern).map((k) => {
        const b = v[k];
        return (
          <div key={k} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-32 font-medium">{BLOCK_LABEL[k]}</span>
            <Select value={b?.start ?? ""} onValueChange={(x) => setBlock(k, "start", x)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Hora de inicio" /></SelectTrigger>
              <SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{fmt12(t)}</SelectItem>)}</SelectContent>
            </Select>
            <span>–</span>
            <Select value={b?.end ?? ""} onValueChange={(x) => setBlock(k, "end", x)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Hora de finalización" /></SelectTrigger>
              <SelectContent>{TIME_OPTIONS.filter((t) => !b?.start || t > b.start).map((t) => <SelectItem key={t} value={t}>{fmt12(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        );
      })}
      {problems.length > 0 ? (
        <p className="text-xs text-destructive">{problems.join(" · ")}</p>
      ) : v.pattern ? (
        <p className="text-xs">Shown in the email and agreement: <strong>{formatSchedule(v, tz)}</strong></p>
      ) : null}
    </div>
  );
}
