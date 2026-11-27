import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ExternalLink, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listAdmon, reopenAdmonStage, saveAdmonReferenceCalls, saveAdmonStage, type AdmonCandidate } from "@/lib/admon.functions";
import {
  REFERENCE_CALL_RESULTS, ADMON_EVALUATORS, JOB_FIELDS, MAX_JOBS, MAX_REFERENCES, OPERATIONS_CLOSE, OPERATIONS_SECTIONS, REFERENCE_FIELDS,
  SCREENING_CLOSE, SCREENING_SECTIONS, STAGE_LABELS, TECHNICAL_SECTIONS, isSalesPosition, type Field, type Section,
} from "@/lib/admon";
import { cn } from "@/lib/utils";
import { EditAdmonBasics } from "@/components/admon/EditBasics";
import { admonQuery, selectCls, stageTone } from "./admon.index";

export const Route = createFileRoute("/_authenticated/admon/$id")({
  head: () => ({
    meta: [
      { title: "E4CC — Candidato ADMON" },
      { name: "description", content: "Screening, entrevista del Gerente de Operaciones y entrevista técnica del candidato." },
      { property: "og:title", content: "E4CC — Candidato ADMON" },
      { property: "og:description", content: "Ficha del candidato ADMON con sus tres entrevistas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdmonDetail,
});

type Stage = "screening" | "operations" | "technical";
type Answers = Record<string, unknown>;
const STEPS: Stage[] = ["screening", "operations", "technical"];
const ORDER = { screening: 0, operations: 1, technical: 2, hired: 3, rejected: 3 } as const;

function AdmonDetail() {
  const { id } = Route.useParams();
  const list = useServerFn(listAdmon);
  const { data, isPending } = useQuery({ ...admonQuery, queryFn: () => list() });
  const c = data?.candidates.find((x) => x.id === id);
  const names = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s.name])), [data]);
  const current: Stage | null = c && (c.stage === "screening" || c.stage === "operations" || c.stage === "technical") ? c.stage : null;
  const [view, setView] = useState<Stage>("screening");
  useEffect(() => { if (c) setView(current ?? (c.technical_at ? "technical" : c.operations_at ? "operations" : "screening")); }, [c?.id, c?.stage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) return <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!c || !data) return <main className="p-10 text-center">Candidato no encontrado. <Link to="/admon" className="underline">Volver</Link></main>;

  const reached = (s: Stage) => ORDER[s] <= ORDER[c.stage] && !(c.stage === "rejected" && !c[`${s}_at`] && s !== "screening");

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-5 py-8">
      <Link to="/admon" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-navy"><ArrowLeft className="h-4 w-4" /> Contratación ADMON</Link>
      <header className="rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{c.full_name}</h1>
            <p className="text-sm text-muted-foreground">{c.position} · {c.country || "Sin país"}{c.branch ? ` · ${c.branch}` : ""}</p>
            <p className="mt-1 text-sm">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={cn("rounded-full px-3 py-1 text-xs font-medium", stageTone[c.stage])}>{STAGE_LABELS[c.stage]}</span>
            {c.cv_link && <a href={c.cv_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline">Ver CV <ExternalLink className="h-3.5 w-3.5" /></a>}
            {!data.operationsOnly && <EditAdmonBasics candidate={c} />}
          </div>
        </div>
        <nav className="mt-5 grid grid-cols-3 gap-2" aria-label="Etapas">
          {STEPS.map((s, i) => {
            const decision = c[`${s}_decision`];
            const who = s === "operations" ? names.get(c.operations_interviewer ?? "") : s === "technical" ? names.get(c.technical_interviewer ?? "") : names.get(c.screening_by ?? "");
            return (
              <button key={s} disabled={!reached(s)} onClick={() => setView(s)}
                className={cn("rounded-md border p-3 text-left text-sm transition disabled:opacity-40", view === s ? "border-navy ring-2 ring-navy/20" : "hover:bg-secondary")}>
                <span className="flex items-center gap-2 font-medium">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-xs", decision === "Pasa" ? "bg-emerald-600 text-primary-foreground" : decision ? "bg-destructive text-destructive-foreground" : "bg-secondary")}>
                    {decision === "Pasa" ? <Check className="h-3 w-3" /> : decision ? <X className="h-3 w-3" /> : i + 1}
                  </span>
                  {STAGE_LABELS[s].slice(3)}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{decision ?? (current === s ? "En curso" : "Pendiente")}{who ? ` · ${who}` : ""}</span>
              </button>
            );
          })}
        </nav>
      </header>

      {view !== "screening" && reached(view) && <PreviousNotes c={c} upTo={view} />}
      {!data.operationsOnly && c.screening_decision === "Pasa" && <ReferenceCalls c={c} names={names} />}
      <StageForm key={`${c.id}-${view}-${c.stage}`} c={c} stage={view} editable={current === view && (!data.operationsOnly || (view !== "screening" && data.myStages.includes(view) && c[`${view}_interviewer`] === data.me))} staff={view === "screening" ? data.operationsInterviewers : data.technicalInterviewers} />
    </main>
  );
}

/** Quick summary of earlier stages so the next interviewer never has to ask. */
function PreviousNotes({ c, upTo }: { c: AdmonCandidate; upTo: Stage }) {
  const s = c.screening as Answers;
  const refs = (s["references"] as Answers[] | undefined) ?? [];
  const o = c.operations as Answers;
  return (
    <details className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm" open>
      <summary className="cursor-pointer font-medium">Resumen de entrevistas anteriores</summary>
      <div className="mt-3 space-y-2">
        <p><b>Screening ({c.screening_decision ?? "—"}):</b> {String(s["flags"] ?? "") || String(s["comments"] ?? "") || "Sin comentarios."}</p>
        {refs.length > 0 && <p><b>Referencias:</b> {refs.map((r) => `${r["company"] || "Empresa"} (${r["score"] ?? "–"}/10)`).join(" · ")}</p>}
        {upTo === "technical" && <p><b>Gerente de Operaciones ({c.operations_decision ?? "—"}):</b> {String(o["expectations"] ?? "") || String(o["fail_reason"] ?? "") || "Sin comentarios."}</p>}
      </div>
    </details>
  );
}

function StageForm({ c, stage, editable, staff }: { c: AdmonCandidate; stage: Stage; editable: boolean; staff: { id: string; name: string }[] }) {
  const save = useServerFn(saveAdmonStage);
  const reopen = useServerFn(reopenAdmonStage);
  const qc = useQueryClient();
  const [a, setA] = useState<Answers>(() => ({ ...(c[stage] as Answers) }));
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setA((p) => ({ ...p, [k]: v }));
  const sales = isSalesPosition(c.position);

  async function run(kind: "draft" | "pass" | "fail") {
    if (kind === "pass" && stage !== "technical" && !next) { toast.error("Elige quién hará la siguiente entrevista."); return; }
    if (kind !== "draft" && !confirm(kind === "pass" ? (stage === "technical" ? "¿Aprobar para contratación?" : "¿Pasa a la siguiente entrevista?") : "¿Confirmas que NO continúa?")) return;
    setBusy(kind);
    try {
      await save({ data: { id: c.id, stage, answers: a, ...(kind !== "draft" ? { finish: kind } : {}), ...(kind === "pass" && next ? { nextInterviewer: next } : {}) } });
      await qc.invalidateQueries({ queryKey: admonQuery.queryKey });
      toast.success(kind === "draft" ? "Guardado" : kind === "pass" ? "Listo, avanzó de etapa" : "Proceso cerrado");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  async function doReopen() {
    if (!confirm("¿Reabrir esta entrevista para corregirla?")) return;
    try { await reopen({ data: { id: c.id, stage } }); await qc.invalidateQueries({ queryKey: admonQuery.queryKey }); }
    catch (e) { toast.error((e as Error).message); }
  }

  const closedHere = Boolean(c[`${stage}_decision`]);
  const canReopen = closedHere && (ORDER[c.stage] === ORDER[stage] + 1);

  return (
    <div className="space-y-4">
      <fieldset disabled={!editable} className="space-y-4">
        {stage === "screening" && (
          <Card title="Evaluador(a)">
            <select className={cn(selectCls, "max-w-xs")} value={String(a["evaluator"] ?? "")} onChange={(e) => set("evaluator", e.target.value)}>
              <option value="">Elegir…</option>{ADMON_EVALUATORS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Card>
        )}
        {stage === "screening" && SCREENING_SECTIONS.filter((s) => !s.salesOnly || sales).map((s) => <SectionCard key={s.title} s={s} a={a} set={set} />)}
        {stage === "screening" && <Repeat title="Referencias laborales" item="Referencia" max={MAX_REFERENCES} k="references" fields={REFERENCE_FIELDS} a={a} set={set} editable={editable} />}
        {stage === "screening" && <SectionCard s={{ title: "Cierre", fields: SCREENING_CLOSE }} a={a} set={set} />}

        {stage === "operations" && OPERATIONS_SECTIONS.map((s) => <SectionCard key={s.title} s={s} a={a} set={set} />)}
        {stage === "operations" && <Repeat title="Parte 3 — Recorrido cronológico" item="Empleo" max={MAX_JOBS} k="jobs" fields={JOB_FIELDS} a={a} set={set} editable={editable}
          intro="Del primer trabajo al más reciente. Agrega un empleo a la vez." />}
        {stage === "operations" && OPERATIONS_CLOSE.map((s) => <SectionCard key={s.title} s={s} a={a} set={set} />)}

        {stage === "technical" && TECHNICAL_SECTIONS.map((s) => <SectionCard key={s.title} s={s} a={a} set={set} />)}
      </fieldset>

      {editable ? (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 shadow-lg">
          <Button variant="outline" onClick={() => void run("draft")} disabled={!!busy}>{busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />} Guardar</Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {stage !== "technical" && (
              <select className={cn(selectCls, "w-56")} value={next} onChange={(e) => setNext(e.target.value)} aria-label="Siguiente entrevistador">
                <option value="">{stage === "screening" ? "Gerente de Operaciones…" : "Entrevistador técnico…"}</option>
                {staff.length === 0 && <option value="" disabled>{stage === "screening" ? "No hay Gerentes de Operaciones creados" : "No hay Entrevistadores Técnicos creados"}</option>}
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <Button variant="outline" className="border-destructive text-destructive" onClick={() => void run("fail")} disabled={!!busy}><X /> No pasa</Button>
            <Button onClick={() => void run("pass")} disabled={!!busy}><Check /> {stage === "technical" ? "Aprobar contratación" : "Pasa"}</Button>
          </div>
        </div>
      ) : closedHere ? (
        <div className="flex items-center justify-between rounded-lg border bg-secondary/40 p-3 text-sm">
          <span>Decisión: <b>{String(c[`${stage}_decision`])}</b>{c[`${stage}_at`] ? ` · ${new Date(String(c[`${stage}_at`])).toLocaleString("es")}` : ""}</span>
          {canReopen && <Button size="sm" variant="ghost" onClick={() => void doReopen()}><RotateCcw /> Reabrir</Button>}
        </div>
      ) : null}
    </div>
  );
}

function Card({ title, intro, children }: { title: string; intro?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {intro && <p className="mt-1 rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">{intro}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function SectionCard({ s, a, set }: { s: Section; a: Answers; set: (k: string, v: unknown) => void }) {
  return <Card title={s.title} intro={s.intro}>{s.fields.map((f) => <FieldInput key={f.key} f={f} value={a[f.key]} onChange={(v) => set(f.key, v)} />)}</Card>;
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const v = value == null ? "" : String(value);
  return (
    <div>
      {f.type !== "done" && <Label className="text-sm font-medium">{f.label}</Label>}
      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
      <div className="mt-1.5">
        {f.type === "long" && <Textarea rows={3} value={v} onChange={(e) => onChange(e.target.value)} />}
        {f.type === "text" && <Input value={v} onChange={(e) => onChange(e.target.value)} />}
        {f.type === "done" && (
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>
        )}
        {f.type === "yesno" && (
          <div className="flex gap-2">{["SI", "NO"].map((o) => (
            <button type="button" key={o} onClick={() => onChange(v === o ? "" : o)}
              className={cn("rounded-md border px-4 py-1.5 text-sm", v === o ? (o === "SI" ? "border-emerald-600 bg-emerald-600 text-primary-foreground" : "border-destructive bg-destructive text-destructive-foreground") : "hover:bg-secondary")}>{o}</button>
          ))}</div>
        )}
        {f.type === "score" && (
          <div className="flex flex-wrap gap-1">{Array.from({ length: 10 }, (_, i) => String(i + 1)).map((o) => (
            <button type="button" key={o} onClick={() => onChange(v === o ? "" : o)}
              className={cn("h-8 w-8 rounded-md border text-sm", v === o ? "border-navy bg-navy text-navy-foreground" : "hover:bg-secondary")}>{o}</button>
          ))}</div>
        )}
      </div>
    </div>
  );
}

function Repeat({ title, intro, item, max, k, fields, a, set, editable }: {
  title: string; intro?: string | undefined; item: string; max: number; k: string; fields: Field[]; a: Answers; set: (k: string, v: unknown) => void; editable: boolean;
}) {
  const rows = (a[k] as Answers[] | undefined) ?? [];
  const list = rows.length ? rows : editable ? [{}] : [];
  const update = (i: number, key: string, v: unknown) => set(k, list.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <Card title={title} intro={intro}>
      {list.length === 0 && <p className="text-sm text-muted-foreground">Sin registros.</p>}
      {list.map((r, i) => (
        <div key={i} className="rounded-md border p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">{item} {i + 1}</span>
            {editable && list.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => set(k, list.filter((_, j) => j !== i))}><Trash2 /> Quitar</Button>}
          </div>
          <div className="space-y-4">{fields.map((f) => <FieldInput key={f.key} f={f} value={r[f.key]} onChange={(v) => update(i, f.key, v)} />)}</div>
        </div>
      ))}
      {editable && list.length < max && (
        <Button type="button" variant="outline" size="sm" onClick={() => set(k, [...list, {}])}><Plus /> Tiene más experiencia — agregar {item.toLowerCase()}</Button>
      )}
    </Card>
  );
}

function ReferenceCalls({ c, names }: { c: AdmonCandidate; names: Map<string, string> }) {
  const refs = ((c.screening as Answers)["references"] as Answers[] | undefined) ?? [];
  const save = useServerFn(saveAdmonReferenceCalls);
  const qc = useQueryClient();
  const [calls, setCalls] = useState(() => refs.map((_, i) => ({ result: c.reference_calls?.[i]?.result ?? "Pendiente", comment: c.reference_calls?.[i]?.comment ?? "" })));
  const [busy, setBusy] = useState(false);
  const done = calls.filter((x) => x.result !== "Pendiente").length;
  const submit = async () => {
    setBusy(true);
    try { await save({ data: { id: c.id, calls } }); await qc.invalidateQueries({ queryKey: admonQuery.queryKey }); toast.success("Llamadas de referencias guardadas"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  };
  return (
    <details className="rounded-lg border bg-card p-4" open>
      <summary className="cursor-pointer font-medium">Llamadas de referencias <span className="text-sm font-normal text-muted-foreground">({done}/{refs.length} realizadas)</span></summary>
      {refs.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No se registraron referencias en el Screening.</p> : (
        <div className="mt-3 space-y-3">
          {refs.map((r, i) => {
            const meta = c.reference_calls?.[i];
            return (
              <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_12rem]">
                <div className="text-sm">
                  <p className="font-medium">{String(r["company"] || `Referencia ${i + 1}`)}</p>
                  <p className="text-muted-foreground">{String(r["boss"] || "Sin contacto")}{r["score"] ? ` · Nota ${String(r["score"])}/10` : ""}</p>
                  {meta?.at && <p className="text-xs text-muted-foreground">Actualizado por {names.get(meta.by ?? "") ?? "—"} · {new Date(meta.at).toLocaleString("es")}</p>}
                </div>
                <select className={selectCls} aria-label={`Resultado referencia ${i + 1}`} value={calls[i]?.result ?? "Pendiente"}
                  onChange={(e) => setCalls((p) => p.map((x, j) => (j === i ? { ...x, result: e.target.value } : x)))}>
                  {REFERENCE_CALL_RESULTS.map((o) => <option key={o}>{o}</option>)}
                </select>
                <Textarea className="sm:col-span-2" rows={2} placeholder="Comentarios de la llamada" value={calls[i]?.comment ?? ""}
                  onChange={(e) => setCalls((p) => p.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} />
              </div>
            );
          })}
          <Button onClick={() => void submit()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar llamadas</Button>
        </div>
      )}
    </details>
  );
}
