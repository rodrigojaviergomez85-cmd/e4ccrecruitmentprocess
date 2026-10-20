import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Download, Info, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getRecruitmentMetrics, type MetricRow } from "@/lib/metrics.functions";
import {
  LOBS,
  attentionPoints,
  certificationRate,
  conversionToTraining,
  isClosedManager,
  ratio,
  sumRatio,
  tierDistribution,
  trainingBucket,
  trainingExpected,
  trainingStarted,
  type Ratio,
  type Tier,
  type TrainingBucket,
} from "@/lib/scorecard-metrics";

const TZ = "America/El_Salvador";
const ALL = "all";
const sv = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-SV", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "—";

function presetRange(kind: string): { from: string; to: string } {
  const today = sv(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  if (kind === "today") return { from: today, to: today };
  if (kind === "week") {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return { from: d.toISOString().slice(0, 10), to: today };
  }
  if (kind === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: "", to: "" };
}

function inRange(date: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.length > 10 ? sv(new Date(date)) : date;
  return (!from || d >= from) && (!to || d <= to);
}

type Open = (title: string, rows: MetricRow[]) => void;
const TIERS: Tier[] = ["A", "B", "C"];

/* ---------- presentation atoms ---------- */

function Tip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><Info className="h-3 w-3 cursor-help text-muted-foreground" /></TooltipTrigger>
        <TooltipContent className="max-w-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Num({ rows, title, open, className }: { rows: MetricRow[]; title: string; open: Open; className?: string }) {
  return (
    <button type="button" onClick={() => open(title, rows)} className={`font-semibold tabular-nums underline-offset-2 hover:text-primary hover:underline ${className ?? ""}`}>
      {rows.length}
    </button>
  );
}

/** "80% · 4/5" — or "Sin base" when there is no denominator. */
function Pct({ r, formula }: { r: Ratio; formula: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help whitespace-nowrap tabular-nums">
            {r.pct === null ? <span className="text-muted-foreground">Sin base</span> : (
              <><span className="font-semibold">{r.pct}%</span><span className="text-xs text-muted-foreground"> · {r.num}/{r.den}</span></>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{formula}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Kpi({ label, tip, rows, title, open, children }: { label: string; tip: string; rows: MetricRow[]; title: string; open: Open; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label} <Tip text={tip} /></p>
      <Num rows={rows} title={title} open={open} className="mt-1 block text-4xl" />
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

const th = "border-b border-border px-2 py-2 text-left text-xs font-semibold text-muted-foreground";
const td = "border-b border-border px-2 py-2 align-top text-sm";

/* ---------- export ---------- */

function toCsv(rows: MetricRow[]) {
  const cols: Array<[string, (r: MetricRow) => string | number]> = [
    ["Candidato", (r) => r.candidate], ["Email", (r) => r.email], ["LOB", (r) => r.lob], ["País", (r) => r.country],
    ["Sucursal", (r) => r.branch], ["Origen", (r) => r.source], ["Cita", (r) => r.appointmentAt ?? ""],
    ["Estado cita", (r) => r.appointmentStatus ?? ""], ["Conectado", (r) => (r.connected ? "Sí" : "No")],
    ["Realizada", (r) => (r.completed ? "Sí" : "No")], ["Reclutador", (r) => r.recruiter], ["Decisión Recruitment", (r) => r.recruitment],
    ["Country manager", (r) => r.manager], ["Decisión manager", (r) => r.managerDecision],
    ["Perfil Recruitment", (r) => r.recruitmentTier ?? ""], ["Perfil manager", (r) => r.managerTier ?? ""], ["Perfil final", (r) => r.finalTier ?? "Sin clasificar"],
    ["Cohorte", (r) => r.training?.waveStart ?? ""], ["Training", (r) => r.training?.status ?? ""], ["Certificación", (r) => r.training?.certification ?? ""], ["Motivo", (r) => r.training?.outcomeReason ?? ""],
  ];
  const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [cols.map((c) => c[0]).join(","), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(","))].join("\n");
}
function download(name: string, rows: MetricRow[]) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

/* ---------- main ---------- */

export function RecruitmentMetrics() {
  const fetchMetrics = useServerFn(getRecruitmentMetrics);
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ["recruitment-metrics"],
    queryFn: () => fetchMetrics(),
    staleTime: 60_000,
  });
  const [preset, setPreset] = useState("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [lob, setLob] = useState(ALL);
  const [more, setMore] = useState(false);
  const [recruiter, setRecruiter] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [cohort, setCohort] = useState(ALL);
  const [tierFilter, setTierFilter] = useState(ALL);
  const [drill, setDrill] = useState<{ title: string; rows: MetricRow[] } | null>(null);
  const open: Open = (title, rows) => setDrill({ title, rows });
  const { from, to } = preset === "custom" ? custom : presetRange(preset);
  const today = sv(new Date());

  const all = data?.rows ?? [];
  const opts = useMemo(() => {
    const u = (f: (r: MetricRow) => string | null | undefined) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
    return { recruiters: u((r) => r.recruiter), managers: u((r) => r.manager), branches: u((r) => r.branch), cohorts: u((r) => r.training?.waveStart) };
  }, [all]);

  const base = all.filter((r) =>
    (lob === ALL || r.lob === lob) &&
    (recruiter === ALL || r.recruiter === recruiter) &&
    (manager === ALL || r.manager === manager) &&
    (branch === ALL || r.branch === branch) &&
    (source === ALL || (source === "Calendly" ? r.source === "Calendly" : r.source !== "Calendly")) &&
    (cohort === ALL || r.training?.waveStart === cohort) &&
    (tierFilter === ALL || (tierFilter === "none" ? !r.finalTier : r.finalTier === tierFilter)),
  );
  // One population for Resultados and Equipo: candidates whose initial interview falls in the period.
  const pop = base.filter((r) => inRange(r.interviewDate, from, to) && (r.appointmentStatus !== "Canceled" || r.connected));
  const tb = (r: MetricRow): TrainingBucket | null => (r.training ? trainingBucket(r.training, today) : null);
  const started = (r: MetricRow) => { const b = tb(r); return b ? trainingStarted(b) : false; };
  const isPending2 = (r: MetricRow) => r.sentToSecondFilter && (r.managerDecision === "Pendiente" || r.managerDecision === "No show");

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  const sel = (label: string, value: string, set: (v: string) => void, items: { v: string; l: string }[], allLabel = "Todos") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {items.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const plain = (xs: string[]) => xs.map((x) => ({ v: x, l: x }));
  const lobLabel: Record<string, string> = { ONLINE: "Online", "EL SALVADOR": "El Salvador", NICARAGUA: "Nicaragua", GUATEMALA: "Guatemala" };
  const moreActive = [recruiter, manager, branch, source, cohort, tierFilter].filter((v) => v !== ALL).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Periodo</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoy</SelectItem>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mes</SelectItem>
                <SelectItem value="all">Todo</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <div className="flex gap-1">
              <Input type="date" className="h-9" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Desde" />
              <Input type="date" className="h-9" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Hasta" />
            </div>
          )}
          <div className="w-44">{sel("LOB", lob, setLob, LOBS.map((l) => ({ v: l, l: lobLabel[l] ?? l })))}</div>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setMore((m) => !m)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" /> Más filtros{moreActive ? ` (${moreActive})` : ""}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[11px] text-muted-foreground">
            Corte {fmt(new Date().toISOString())} · actualizado {dataUpdatedAt ? fmt(new Date(dataUpdatedAt).toISOString()) : "—"}
          </p>
          <Button size="sm" variant="outline" onClick={() => download("scorecard-filtrado.csv", pop)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {more && (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
          {sel("Reclutador", recruiter, setRecruiter, plain(opts.recruiters))}
          {sel("Country manager", manager, setManager, plain(opts.managers))}
          {sel("Sucursal", branch, setBranch, plain(opts.branches))}
          {sel("Origen", source, setSource, plain(["Calendly", "Manual"]))}
          {sel("Cohorte", cohort, setCohort, plain(opts.cohorts), "Todas")}
          {sel("Perfil", tierFilter, setTierFilter, [...TIERS.map((t) => ({ v: t, l: `Perfil ${t}` })), { v: "none", l: "Sin clasificar" }])}
        </div>
      )}

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <Tabs defaultValue="results">
          <TabsList>
            <TabsTrigger value="results">Resultados</TabsTrigger>
            <TabsTrigger value="team">Equipo</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="space-y-4">
            <Results pop={pop} open={open} tb={tb} started={started} isPending2={isPending2} lobLabel={lobLabel} />
          </TabsContent>
          <TabsContent value="team">
            <Team pop={pop} open={open} started={started} isPending2={isPending2} />
          </TabsContent>
          <TabsContent value="training">
            <TrainingTab rows={base.filter((r) => r.training && inRange(r.training.waveStart, from, to))} tb={tb} today={today} open={open} lobLabel={lobLabel} />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{drill?.title} · {drill?.rows.length}</DialogTitle></DialogHeader>
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => drill && download("listado.csv", drill.rows)}><Download className="mr-2 h-4 w-4" />CSV</Button></div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full">
              <thead><tr>{["Candidato", "LOB", "Origen", "Cita", "Reclutador", "Recruitment", "Manager", "Perfil", "Training", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {drill?.rows.map((r) => (
                  <tr key={r.applicationId}>
                    <td className={td}><p className="font-medium">{r.candidate}</p><p className="text-xs text-muted-foreground">{r.email}</p></td>
                    <td className={td}>{r.lob}</td><td className={td}>{r.source}</td>
                    <td className={td}>{fmt(r.appointmentAt)}<p className="text-xs text-muted-foreground">{r.appointmentStatus ?? ""}</p></td>
                    <td className={td}>{r.recruiter}</td><td className={td}>{r.recruitment}</td>
                    <td className={td}>{r.manager}<p className="text-xs text-muted-foreground">{r.managerDecision}</p></td>
                    <td className={td}>{r.finalTier ?? <span className="text-muted-foreground">Sin clasificar</span>}</td>
                    <td className={td}>
                      {r.training ? `${r.training.waveStart ?? "Sin cohorte"} · ${r.training.status ?? ""}` : "—"}
                      {r.training?.outcomeReason && <p className="text-xs text-muted-foreground">Motivo: {r.training.outcomeReason}</p>}
                    </td>
                    <td className={td}><Link to="/candidates/$id" params={{ id: r.applicationId }} className="text-primary underline">Perfil</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Resultados ---------- */

function Results({ pop, open, tb, started, isPending2, lobLabel }: {
  pop: MetricRow[]; open: Open; tb: (r: MetricRow) => TrainingBucket | null; started: (r: MetricRow) => boolean;
  isPending2: (r: MetricRow) => boolean; lobLabel: Record<string, string>;
}) {
  const completed = pop.filter((r) => r.completed);
  const eligible = pop.filter((r) => r.eligible);
  const conn = eligible.filter((r) => r.connected);
  const elCal = eligible.filter((r) => r.source === "Calendly");
  const elMan = eligible.filter((r) => r.source !== "Calendly");
  const finalApproved = pop.filter((r) => r.managerDecision === "Aprobado");
  const mgrClosed = pop.filter((r) => isClosedManager(r.managerDecision));
  const startedRows = finalApproved.filter(started);
  const upcoming = finalApproved.filter((r) => tb(r) === "Pendiente de iniciar");
  const pending2 = pop.filter(isPending2);
  const noShows = pop.filter((r) => tb(r) === "No show");
  const dropouts = pop.filter((r) => tb(r) === "Dropout");
  const conv = conversionToTraining(pop.map((r) => ({ finalApproved: r.managerDecision === "Aprobado", started: started(r) })));
  const dist = tierDistribution(completed.map((r) => r.finalTier));

  const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0);
  const points = attentionPoints({
    pendingDays: pending2.map((r) => days(r.recruitmentDecidedAt)),
    finalApproved: finalApproved.length,
    started: startedRows.length,
    upcomingStart: upcoming.length,
    lossReasons: [...noShows, ...dropouts].map((r) => r.training?.outcomeReason ?? ""),
  });

  const lobs = [...LOBS, ...new Set(pop.map((r) => r.lob).filter((l) => !(LOBS as readonly string[]).includes(l)))];
  const rowFor = (rs: MetricRow[]) => {
    const fa = rs.filter((r) => r.managerDecision === "Aprobado");
    const done = rs.filter((r) => r.completed);
    const tiers = tierDistribution(done.map((r) => r.finalTier));
    return {
      done, fa, st: fa.filter(started), up: fa.filter((r) => tb(r) === "Pendiente de iniciar"),
      conv: ratio(fa.filter(started).length, fa.length), p2: rs.filter(isPending2), tierA: tiers.A,
    };
  };
  const lobRows = lobs.map((l) => ({ l, ...rowFor(pop.filter((r) => r.lob === l)) })).filter((x) => x.done.length || x.fa.length || x.p2.length);
  const total = rowFor(pop);
  const totalConv = sumRatio(lobRows.map((x) => x.conv));
  const totalA = sumRatio(lobRows.map((x) => x.tierA));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi label="Entrevistas realizadas" tip="Entrevistas iniciales de Recruitment finalizadas en el periodo." rows={completed} title="Entrevistas realizadas" open={open}>
          {pop.filter((r) => r.connected && !r.completed).length} conectadas sin finalizar
        </Kpi>
        <Kpi label="Conexión" tip="Conectados ÷ citas elegibles (ya pasaron; sin futuras, canceladas ni reprogramadas) × 100." rows={conn} title="Conectados" open={open}>
          <Pct r={ratio(conn.length, eligible.length)} formula="Conectados ÷ citas elegibles × 100" /> · {conn.length} conectados de {eligible.length} citas elegibles
          <p className="mt-1">
            Calendly <Pct r={ratio(elCal.filter((r) => r.connected).length, elCal.length)} formula="Conexión de citas de Calendly" /> · Manual <Pct r={ratio(elMan.filter((r) => r.connected).length, elMan.length)} formula="Conexión de entrevistas manuales" />
          </p>
        </Kpi>
        <Kpi label="Aprobados finales" tip="Aprobados por el Country Manager. % sobre decisiones cerradas del segundo filtro (aprobado, no aprobado, retake); los pendientes no cuentan." rows={finalApproved} title="Aprobados finales" open={open}>
          <Pct r={ratio(finalApproved.length, mgrClosed.length)} formula="Aprobados ÷ decisiones cerradas del manager × 100" /> de decisiones cerradas
        </Kpi>
        <Kpi label="Iniciaron training" tip="Aprobados finales con asistencia confirmada a training. Conversión = iniciaron ÷ aprobados finales de la misma población." rows={startedRows} title="Iniciaron training" open={open}>
          Conversión <Pct r={conv} formula="Iniciaron ÷ aprobados finales × 100" />{upcoming.length ? ` · ${upcoming.length} con inicio próximo` : ""}
        </Kpi>
        <Kpi label="Pendientes de 2.º filtro" tip="Aprobados por Recruitment sin decisión final del manager (incluye No show por reagendar)." rows={pending2} title="Pendientes de 2.º filtro" open={open}>
          {pending2.filter((r) => !r.managerId).length} sin manager asignado
        </Kpi>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pérdidas de training <Tip text="No show: nunca inició. Dropout: inició y después abandonó." /></p>
          <Num rows={[...noShows, ...dropouts]} title="Pérdidas de training" open={open} className="mt-1 block text-4xl" />
          <p className="mt-1 text-xs text-muted-foreground">
            No show <Num rows={noShows} title="No show de training" open={open} /> · Dropout <Num rows={dropouts} title="Dropouts" open={open} />
          </p>
        </div>
      </div>

      {points.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">Puntos de atención</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{points.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Resultados por LOB</p>
        <table className="w-full table-fixed">
          <thead><tr>
            {["LOB", "Entrevistados", "Aprobados finales", "Iniciaron training", "Conversión a training", "Pendientes 2.º filtro", "% Perfil A"].map((h) => <th key={h} className={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {lobRows.map((x) => (
              <tr key={x.l}>
                <td className={`${td} font-medium`}>{lobLabel[x.l] ?? x.l}</td>
                <td className={td}><Num rows={x.done} title={`${x.l} · Entrevistados`} open={open} /></td>
                <td className={td}><Num rows={x.fa} title={`${x.l} · Aprobados finales`} open={open} /></td>
                <td className={td}><Num rows={x.st} title={`${x.l} · Iniciaron`} open={open} />{x.up.length > 0 && <span className="ml-1 text-xs text-muted-foreground">+{x.up.length} próximos</span>}</td>
                <td className={td}><Pct r={x.conv} formula="Iniciaron ÷ aprobados finales del LOB × 100" /></td>
                <td className={td}><Num rows={x.p2} title={`${x.l} · Pendientes 2.º filtro`} open={open} /></td>
                <td className={td}><Pct r={x.tierA} formula="Perfil A ÷ entrevistados clasificados × 100" /></td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-semibold">
              <td className={td}>TOTAL</td>
              <td className={td}><Num rows={total.done} title="Total · Entrevistados" open={open} /></td>
              <td className={td}><Num rows={total.fa} title="Total · Aprobados finales" open={open} /></td>
              <td className={td}><Num rows={total.st} title="Total · Iniciaron" open={open} />{total.up.length > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">+{total.up.length} próximos</span>}</td>
              <td className={td}><Pct r={totalConv} formula="Suma de iniciaron ÷ suma de aprobados finales × 100 (no es promedio)" /></td>
              <td className={td}><Num rows={total.p2} title="Total · Pendientes 2.º filtro" open={open} /></td>
              <td className={td}><Pct r={totalA} formula="Suma de perfiles A ÷ suma de clasificados × 100" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-1 text-sm font-semibold">Calidad de candidatos evaluados <Tip text="Clasificación final: la del manager cuando existe; si no, la de Recruitment. % sobre clasificados." /></p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {TIERS.map((t) => (
            <div key={t} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Perfil {t}</p>
              <Num rows={completed.filter((r) => r.finalTier === t)} title={`Perfil ${t}`} open={open} className="text-2xl" />
              <p className="text-xs text-muted-foreground">{dist[t].pct === null ? "Sin base" : `${dist[t].pct}%`}</p>
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">Sin clasificar</p>
            <Num rows={completed.filter((r) => !r.finalTier)} title="Sin clasificar" open={open} className="text-2xl" />
            <p className="text-xs text-muted-foreground">{dist.coverage.num} de {dist.coverage.den} entrevistados clasificados</p>
          </div>
        </div>
        <TierBreakdown rows={completed} open={open} by={(r) => lobLabel[r.lob] ?? r.lob} label="LOB" />
        <TierBreakdown rows={completed} open={open} by={(r) => r.recruiter} label="Reclutador" />
      </div>
    </>
  );
}

function TierBreakdown({ rows, open, by, label }: { rows: MetricRow[]; open: Open; by: (r: MetricRow) => string; label: string }) {
  const groups = new Map<string, MetricRow[]>();
  for (const r of rows) groups.set(by(r), [...(groups.get(by(r)) ?? []), r]);
  if (!groups.size) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver por {label.toLowerCase()}</summary>
      <table className="mt-2 w-full table-fixed">
        <thead><tr>{[label, "A", "B", "C", "Sin clasificar"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {[...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([k, rs]) => {
            const d = tierDistribution(rs.map((r) => r.finalTier));
            return (
              <tr key={k}>
                <td className={td}>{k}</td>
                {TIERS.map((t) => <td key={t} className={td}><Num rows={rs.filter((r) => r.finalTier === t)} title={`${k} · Perfil ${t}`} open={open} />{d[t].pct !== null && <span className="ml-1 text-xs text-muted-foreground">{d[t].pct}%</span>}</td>)}
                <td className={td}><Num rows={rs.filter((r) => !r.finalTier)} title={`${k} · Sin clasificar`} open={open} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

/* ---------- Equipo ---------- */

function Team({ pop, open, started, isPending2 }: { pop: MetricRow[]; open: Open; started: (r: MetricRow) => boolean; isPending2: (r: MetricRow) => boolean }) {
  const [view, setView] = useState<"rec" | "mgr">("rec");
  const [expanded, setExpanded] = useState<string | null>(null);
  const mgrRatio = (rs: MetricRow[]) => {
    const closed = rs.filter((r) => isClosedManager(r.managerDecision));
    return ratio(closed.filter((r) => r.managerDecision === "Aprobado").length, closed.length);
  };
  const grouped = (rows: MetricRow[], key: (r: MetricRow) => string) => {
    const out = new Map<string, Map<string, MetricRow[]>>();
    for (const r of rows) {
      const l = out.get(r.lob) ?? new Map<string, MetricRow[]>();
      l.set(key(r), [...(l.get(key(r)) ?? []), r]);
      out.set(r.lob, l);
    }
    return [...out].sort((a, b) => a[0].localeCompare(b[0]));
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {([["rec", "Reclutadores"], ["mgr", "Country Managers"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1 text-sm ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
        ))}
      </div>

      {view === "rec" ? (
        <table className="w-full table-fixed">
          <thead><tr>{["Reclutador / LOB", "Entrevistas", "Aprobados Recruitment", "Aprobados manager", "% aprobación manager", "Iniciaron training", "Certified", "Not certified / dropout", "% certificación"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {grouped(pop.filter((r) => r.completed), (r) => r.recruiter).map(([l, m]) => (
              <Fragment key={l}>
                <tr><td colSpan={9} className="bg-muted px-2 py-1 text-xs font-semibold">{l}</td></tr>
                {[...m].sort((a, b) => b[1].length - a[1].length).map(([name, rs]) => {
                  const id = `${l}|${name}`;
                  const sent = rs.filter((r) => r.sentToSecondFilter);
                  const d = tierDistribution(rs.map((r) => r.finalTier));
                  return (
                    <Fragment key={id}>
                      <tr>
                        <td className={`${td} font-medium`}>
                          <button type="button" className="inline-flex items-center gap-1" onClick={() => setExpanded(expanded === id ? null : id)}>
                            {expanded === id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{name}
                          </button>
                        </td>
                        <td className={td}><Num rows={rs} title={`${name} · Entrevistas`} open={open} /></td>
                        <td className={td}><Num rows={sent} title={`${name} · Aprobados Recruitment`} open={open} /></td>
                        <td className={td}><Num rows={sent.filter((r) => r.managerDecision === "Aprobado")} title={`${name} · Aprobados manager`} open={open} /></td>
                        <td className={td}><Pct r={mgrRatio(sent)} formula="Candidatos del reclutador aprobados por manager ÷ sus candidatos con decisión cerrada del manager × 100" /></td>
                        <td className={td}><Num rows={sent.filter(started)} title={`${name} · Iniciaron training`} open={open} /></td>
                        <td className={td}><Num rows={sent.filter((r) => r.training?.certification === "CERTIFIED")} title={`${name} · Certified`} open={open} /></td>
                        <td className={td}><Num rows={sent.filter((r) => r.training?.certification === "NOT CERTIFIED" || tb(r) === "Dropout")} title={`${name} · Not certified / dropout`} open={open} /></td>
                        <td className={td}><Pct r={certificationRate(sent.map((r) => ({ started: started(r), certification: r.training?.certification })))} formula="Candidatos del reclutador con CERTIFIED ÷ sus candidatos que iniciaron training × 100" /></td>
                      </tr>
                      {expanded === id && (
                        <tr><td colSpan={9} className="border-b border-border bg-muted/30 px-6 py-2 text-xs">
                          Pendientes 2.º filtro: <Num rows={sent.filter(isPending2)} title={`${name} · Pendientes 2.º filtro`} open={open} /> ·
                          {TIERS.map((t) => <span key={t}> Perfil {t}: <Num rows={rs.filter((r) => r.finalTier === t)} title={`${name} · Perfil ${t}`} open={open} />{d[t].pct !== null ? ` (${d[t].pct}%)` : ""} ·</span>)}
                          {" "}Sin clasificar: {d.unclassified}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full table-fixed">
          <thead><tr>{["Manager / LOB", "Evaluados", "Aprobados", "% aprobación", "Pendientes", "Iniciaron training"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {grouped(pop.filter((r) => r.sentToSecondFilter), (r) => r.manager).map(([l, m]) => (
              <Fragment key={l}>
                <tr><td colSpan={9} className="bg-muted px-2 py-1 text-xs font-semibold">{l}</td></tr>
                {[...m].sort((a, b) => a[0].localeCompare(b[0])).map(([name, rs]) => (
                  <tr key={`${l}|${name}`}>
                    <td className={`${td} font-medium`}>{name}</td>
                    <td className={td}><Num rows={rs.filter((r) => isClosedManager(r.managerDecision))} title={`${name} · Evaluados (decisión cerrada)`} open={open} /></td>
                    <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "Aprobado")} title={`${name} · Aprobados`} open={open} /></td>
                    <td className={td}><Pct r={mgrRatio(rs)} formula="Aprobados ÷ decisiones cerradas del manager × 100" /></td>
                    <td className={td}><Num rows={rs.filter(isPending2)} title={`${name} · Pendientes`} open={open} /></td>
                    <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "Aprobado" && started(r))} title={`${name} · Iniciaron training`} open={open} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-muted-foreground">Cada decisión se atribuye a quien la tomó. Periodo según la fecha de la entrevista inicial.</p>
    </div>
  );
}

/* ---------- Training ---------- */

function TrainingTab({ rows, tb, today, open, lobLabel }: { rows: MetricRow[]; tb: (r: MetricRow) => TrainingBucket | null; today: string; open: Open; lobLabel: Record<string, string> }) {
  const confirmedOf = (list: MetricRow[]) => list.filter((r) => { const b = tb(r); return b && b !== "No reclutado" && b !== "Cancelado antes de iniciar"; });
  const calc = (list: MetricRow[]) => {
    const conf = confirmedOf(list);
    const by = (b: TrainingBucket) => conf.filter((r) => tb(r) === b);
    return {
      conf, started: conf.filter((r) => trainingStarted(tb(r)!)), expected: conf.filter((r) => trainingExpected(tb(r)!)),
      active: by("Activo"), done: by("Completó"), noShow: by("No show"), dropout: by("Dropout"), upcoming: by("Pendiente de iniciar"), unknown: by("Sin registrar"),
    };
  };
  const t = calc(rows);
  const groups = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const k = `${r.lob}|${r.training?.waveStart ?? "Sin cohorte"}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const cell = (list: MetricRow[], title: string, hasData: boolean) =>
    hasData ? <Num rows={list} title={title} open={open} /> : <span className="text-xs text-muted-foreground">Sin datos</span>;

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      {!t.conf.length ? (
        <p className="text-sm text-muted-foreground">Sin datos registrados: nadie tiene la incorporación confirmada en este periodo. Márcala en el Training Tracker.</p>
      ) : null}
      <table className="w-full table-fixed">
        <thead><tr>{["LOB / Cohorte", "Confirmados", "Iniciaron", "Activos", "Completaron", "No show", "Dropout"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {[...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => {
            const [l = "", w = ""] = k.split("|");
            const c = calc(list);
            const has = c.conf.length > 0;
            return (
              <tr key={k}>
                <td className={td}>
                  <span className="font-medium">{lobLabel[l] ?? l}</span> · {w}
                  {w !== "Sin cohorte" && w > today && <span className="ml-1 rounded bg-accent px-1 text-[10px]">Inicio próximo</span>}
                  {c.active.length > 0 && <span className="ml-1 rounded bg-accent px-1 text-[10px]">En curso</span>}
                </td>
                <td className={td}>{cell(c.conf, `${k} · Confirmados`, true)}</td>
                <td className={td}>{cell(c.started, `${k} · Iniciaron`, has)}</td>
                <td className={td}>{cell(c.active, `${k} · Activos`, has)}</td>
                <td className={td}>{cell(c.done, `${k} · Completaron`, has)}</td>
                <td className={td}>{cell(c.noShow, `${k} · No show`, has)}</td>
                <td className={td}>{cell(c.dropout, `${k} · Dropout`, has)}</td>
              </tr>
            );
          })}
          <tr className="bg-muted/50 font-semibold">
            <td className={td}>TOTAL</td>
            <td className={td}><Num rows={t.conf} title="Confirmados" open={open} /></td>
            <td className={td}><Num rows={t.started} title="Iniciaron" open={open} /></td>
            <td className={td}><Num rows={t.active} title="Activos" open={open} /></td>
            <td className={td}><Num rows={t.done} title="Completaron" open={open} /></td>
            <td className={td}><Num rows={t.noShow} title="No show de training" open={open} /></td>
            <td className={td}><Num rows={t.dropout} title="Dropouts" open={open} /></td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap gap-6 text-sm">
        <span className="flex items-center gap-2">% no show <Pct r={ratio(t.noShow.length, t.expected.length)} formula="No shows confirmados ÷ incorporaciones esperadas cuya fecha de inicio ya llegó × 100" /></span>
        <span className="flex items-center gap-2">% dropout <Pct r={ratio(t.dropout.length, t.started.length)} formula="Abandonos después de iniciar ÷ personas que iniciaron × 100" /></span>
        {t.unknown.length > 0 && <span className="text-xs text-muted-foreground">Asistencia sin registrar: <Num rows={t.unknown} title="Asistencia sin registrar" open={open} /></span>}
        {t.upcoming.length > 0 && <span className="text-xs text-muted-foreground">Inicio próximo (no es no show): <Num rows={t.upcoming} title="Inicio próximo" open={open} /></span>}
      </div>
      <p className="text-[11px] text-muted-foreground">Periodo según la fecha de inicio de la cohorte. Confirmado no significa que inició; aprobado final no significa incorporación confirmada.</p>
    </div>
  );
}
