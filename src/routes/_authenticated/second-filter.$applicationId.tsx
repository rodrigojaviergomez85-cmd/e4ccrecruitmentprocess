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
  VERIFICATION_CHECKS,
  clampScores,
  scoreManager,
  type ManagerDecision,
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

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const human = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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
  const dirty = useRef(false);

  useEffect(() => {
    if (!current) return setForm(null);
    const areas = AREAS.filter((a) => (current.improvement_areas ?? "").includes(a));
    setForm({
      demoTopic: current.demo_topic ?? "",
      scores: Object.fromEntries(Object.entries((current.scores as Record<string, number>) ?? {}).map(([k, v]) => [k, String(v)])),
      evidence: (current.evidence as Record<string, string>) ?? {},
      checks: (current.checks as Record<string, boolean>) ?? {},
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

  // Autosave (never sends email; only the confirmed Submit does).
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
  if (q.error || !d) return <p className="m-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Not available"}</p>;

  const app = d.app;
  const p = d.progress;
  const approvedInterview = d.interviews.find((i) => i.final_result === "Approved for last step") ?? d.interviews[0];
  const managerEmails = d.emails.filter((e) => e.manager_evaluation_id && e.manager_evaluation_id === current?.id);
  const lastEmail = managerEmails[0];

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">Manager final filter</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/second-filter"><ArrowLeft className="mr-2 h-4 w-4" /> Pending Second Filter</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card title="General information">
            <h1 className="text-xl font-bold">{app.full_name}</h1>
            {app.withdrawn_at && (
              <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-semibold">Withdrawn by Applicant · {fmt(app.withdrawn_at)} · Stage: manager_final_filter</p>
                {app.withdrawn_reason && <p className="mt-1 italic">“{app.withdrawn_reason}”</p>}
              </div>
            )}
            <Grid items={[
              ["Email", app.email], ["Phone", app.phone_e164 ?? app.phone], ["Country", app.country],
              ["Modality", p?.work_modality ?? "—"], ["Branch / location", app.city], ["Status", app.status],
              ["English level (AI)", (app.ai_evaluations as { cefr: string | null }[] | null)?.[0]?.cefr ?? "—"],
              ["Teaching experience", app.teaching_experience], ["Call center experience", app.callcenter_experience_level],
              ["Approved by Recruitment", fmt(app.recruitment_approved_at)],
            ]} />
            {d.resumeUrl ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <a href={d.resumeUrl} target="_blank" rel="noreferrer">Open CV <ExternalLink className="ml-2 h-4 w-4" /></a>
              </Button>
            ) : <p className="mt-3 text-xs text-muted-foreground">No CV uploaded.</p>}
          </Card>

          {p?.work_modality === "online" && (
            <Card title="Technical requirements · Internet speed test">
              <Grid items={[
                ["Download", p.internet_download_mbps != null ? `${p.internet_download_mbps} Mbps` : "—"],
                ["Upload", p.internet_upload_mbps != null ? `${p.internet_upload_mbps} Mbps` : "—"],
                ["Ping", p.internet_ping_ms != null ? `${p.internet_ping_ms} ms` : "—"],
                ["Result", p.internet_test_passed ? "Passed" : p.internet_override ? "Override approved" : "Not passed"],
                ["Tested", fmt(p.internet_tested_at)],
              ]} />
            </Card>
          )}

          <Card title="Work references">
            {d.references.length === 0 && <p className="text-sm text-muted-foreground">No references.</p>}
            <div className="space-y-2">
              {d.references.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{r.company} · {r.position}</p>
                  <p className="text-muted-foreground">Supervisor: {r.supervisor_name} · {r.supervisor_phone} {r.supervisor_email}</p>
                  <p className="text-muted-foreground">Reason for leaving: {r.reason_for_leaving || "—"} · Verification: {r.verification_status}</p>
                </div>
              ))}
            </div>
          </Card>

          {approvedInterview && (
            <Card title={`Recruitment interview · Attempt ${approvedInterview.attempt_number} · ${resultLabel(approvedInterview.final_result)}`}>
              <Grid items={[
                ["Interview date", approvedInterview.interview_date ?? "—"], ["Live level", approvedInterview.live_cefr ?? "—"],
                ["Compliance", approvedInterview.compliance_score != null ? `${approvedInterview.compliance_score}%` : "—"],
                ["Irregular verbs", `${(approvedInterview.evaluation_verbs ?? []).filter((v) => v.correct).length}/${(approvedInterview.evaluation_verbs ?? []).length} correct`],
              ]} />
              <div className="mt-3 space-y-3">
                {Object.entries((approvedInterview.sections as Record<string, Record<string, unknown>>) ?? {}).map(([sec, vals]) => {
                  const entries = Object.entries(vals ?? {}).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length));
                  if (!entries.length) return null;
                  return (
                    <div key={sec}>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{human(sec)}</p>
                      <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        {entries.map(([k, v]) => (
                          <div key={k}><dt className="inline text-muted-foreground">{human(k)}: </dt><dd className="inline">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
              {(approvedInterview.evaluation_jobs ?? []).length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Previous jobs</p>
                  {[...(approvedInterview.evaluation_jobs ?? [])].sort((a, b) => a.slot - b.slot).map((j) => (
                    <div key={j.id} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-medium">{j.company} · {j.position} ({j.start_date} – {j.end_date})</p>
                      <p className="text-muted-foreground">Reason for leaving: {j.reason_for_leaving || "—"}{j.gap_explanation ? ` · Gap: ${j.gap_explanation}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Note label="Internal comments" text={approvedInterview.comments} />
                <Note label="Internal red flags" text={approvedInterview.red_flags} />
              </div>
            </Card>
          )}

          {/* Scorecard */}
          <Card title="Manager scorecard">
            {!current && (
              d.access.canDecide ? <Button onClick={() => void onStart()}>Start evaluation</Button>
                : <p className="text-sm text-muted-foreground">The Manager has not started the evaluation yet.</p>
            )}
            {current && form && result && (
              <fieldset disabled={!editable} className="space-y-5">
                {locked && <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm"><Lock className="h-4 w-4" /> Submitted {fmt(current.submitted_at)} — locked. Only Admin can reopen it.</p>}
                <div className="space-y-1.5">
                  <Label>Demo topic</Label>
                  <Input value={form.demoTopic} onChange={(e) => set({ demoTopic: e.target.value })} placeholder="e.g. Simple Present" />
                </div>
                {MANAGER_SECTIONS.map((s) => {
                  const sec = result.sections.find((x) => x.key === s.key)!;
                  return (
                    <div key={s.key} className="rounded-xl border border-border p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-semibold">{s.title}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", sec.passed ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>
                          {sec.points}/{s.max}{s.gate != null ? ` · gate ≥ ${s.gate}` : ""}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {s.criteria.map((c) => (
                          <div key={c.key} className="grid gap-2 sm:grid-cols-[1fr_90px]">
                            <div>
                              <p className="text-sm font-medium">{c.label}</p>
                              <p className="text-xs text-muted-foreground">{c.expected ? `Expected: ${c.expected}` : c.hint}</p>
                              <Input className="mt-1" placeholder="Evidence / notes" value={form.evidence[c.key] ?? ""} onChange={(e) => set({ evidence: { ...form.evidence, [c.key]: e.target.value } })} />
                            </div>
                            <div>
                              <Label className="text-xs">Score (0–{c.max})</Label>
                              <Input type="number" min={0} max={c.max} value={form.scores[c.key] ?? ""} onChange={(e) => set({ scores: { ...form.scores, [c.key]: e.target.value } })} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="rounded-xl border border-border p-4">
                  <h3 className="mb-2 font-semibold">Double-check</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {VERIFICATION_CHECKS.map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={Boolean(form.checks[k])} onCheckedChange={(v) => set({ checks: { ...form.checks, [k]: v === true } })} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Checkbox checked={form.criticalRedFlag} onCheckedChange={(v) => set({ criticalRedFlag: v === true })} />
                    Critical job-related red flag (mark only with concrete evidence)
                  </label>
                  <div className="space-y-1.5"><Label>Red flags (internal)</Label><Textarea value={form.redFlags} onChange={(e) => set({ redFlags: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Internal comments</Label><Textarea value={form.internalComments} onChange={(e) => set({ internalComments: e.target.value })} /></div>
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
                              <Checkbox checked={form.improvementAreas.includes(a)} onCheckedChange={(v) => set({ improvementAreas: v === true ? [...form.improvementAreas, a] : form.improvementAreas.filter((x) => x !== a) })} />
                              {a}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5"><Label>Short feedback for the candidate (optional, English/Grammar/Pronunciation/Technical only)</Label><Textarea value={form.improvementNote} onChange={(e) => set({ improvementNote: e.target.value })} /></div>
                      <div className="space-y-1.5"><Label>Eligible to apply again on</Label><Input type="date" value={form.eligibleAgainDate} onChange={(e) => set({ eligibleAgainDate: e.target.value })} /></div>
                    </>
                  )}
                  {form.finalDecision === "Not Approved" && (
                    <div className="space-y-1.5"><Label>Internal reason (never emailed)</Label><Textarea value={form.decisionReason} onChange={(e) => set({ decisionReason: e.target.value })} /></div>
                  )}
                  {form.finalDecision === "No Show" && (
                    <div className="space-y-1.5"><Label>Appointment date and time</Label><Input type="datetime-local" value={form.appointmentAt} onChange={(e) => set({ appointmentAt: e.target.value })} /></div>
                  )}
                  {editable && (
                    <div className="flex items-center gap-3">
                      <Button type="button" disabled={!form.finalDecision} onClick={() => setConfirm(true)}>Submit decision</Button>
                      <span className="text-xs text-muted-foreground">{saving === "saving" ? "Saving…" : saving === "saved" ? "All changes saved" : ""}</span>
                    </div>
                  )}
                </div>
              </fieldset>
            )}
          </Card>

          <Card title="Application, retake and decision history">
            <ul className="space-y-1 text-sm">
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
          </Card>
        </div>

        {/* Summary */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {result && current && (
            <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="text-3xl font-bold">{result.total}<span className="text-base text-muted-foreground">/100</span></p>
              <p>Grammar gate: <Gate ok={result.gates.grammar} /></p>
              <p>Teaching Demo gate: <Gate ok={result.gates.demo} /></p>
              <p>Coachability gate: <Gate ok={result.gates.coachability} /></p>
              <p>No critical red flag: <Gate ok={result.gates.noCriticalRedFlag} /></p>
              <p className="rounded-lg bg-secondary p-2 font-semibold">{result.recommendation ?? "Complete all criteria to see the recommendation"}</p>
              <p>Final decision: <strong>{current.final_decision ?? "—"}</strong></p>
              <p className="text-xs text-muted-foreground">Manager: {d.managers.find((m) => m.id === current.manager_id)?.name ?? d.access.name} · {fmt(current.decided_at ?? current.updated_at)}</p>
              {d.access.isAdmin && locked && (
                <Button variant="outline" size="sm" onClick={async () => { await reopen({ data: { evaluationId: current.id, reason: "" } }); toast.success("Reopened"); await refresh(); }}>Reopen (Admin)</Button>
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
                <Button size="sm" variant={lastEmail.status === "failed" ? "default" : "outline"} onClick={async () => {
                  const r = await retry({ data: { evaluationId: current!.id } });
                  if (r.ok) toast.success("Email sent"); else toast.error(r.detail);
                  await refresh();
                }}>{lastEmail.status === "failed" ? "Retry email" : "Resend email"}</Button>
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
              The evaluation will be locked. {form?.finalDecision === "Approved for Training" ? "The Training welcome email stays pending until a cohort is assigned." : "The candidate email will be sent now through the recruitment mailbox."}
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v || "—"}</dd></div>)}
    </dl>
  );
}
function Note({ label, text }: { label: string; text: string | null }) {
  return <div className="rounded-lg bg-secondary/50 p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="whitespace-pre-wrap">{text || "—"}</p></div>;
}
function Gate({ ok }: { ok: boolean }) {
  return <span className={ok ? "font-semibold text-success" : "font-semibold text-destructive"}>{ok ? "Passed" : "Failed"}</span>;
}
