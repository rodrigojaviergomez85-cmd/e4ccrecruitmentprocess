import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, Info } from "lucide-react";

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
  isClosedManager,
  isClosedRecruitment,
  pendingSecondFilterBucket,
  ratio,
  ratioLabel,
  trainingBucket,
  trainingExpected,
  trainingStarted,
  type Ratio,
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

type Drill = { title: string; rows: MetricRow[] } | null;
type Open = (title: string, rows: MetricRow[]) => void;

function inRange(date: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!date) return false;
  const d = date.length > 10 ? sv(new Date(date)) : date;
  return (!from || d >= from) && (!to || d <= to);
}

function Num({ rows, title, open, className }: { rows: MetricRow[]; title: string; open: Open; className?: string }) {
  return (
    <button type="button" onClick={() => open(title, rows)} className={`font-semibold text-primary underline-offset-2 hover:underline ${className ?? ""}`}>
      {rows.length}
    </button>
  );
}

function Pct({ r, formula, unit }: { r: Ratio; formula: string; unit?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help flex-col">
            <span className="font-semibold">{r.pct === null ? "—" : `${r.pct}%`}</span>
            <span className="text-[11px] text-muted-foreground">{ratioLabel(r, unit)}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{formula}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function Card({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint && (
          <TooltipProvider><Tooltip><TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger><TooltipContent>{hint}</TooltipContent></Tooltip></TooltipProvider>
        )}
      </p>
      <div className="mt-1 text-xl">{children}</div>
    </div>
  );
}

function Section({ title, dateNote, children }: { title: string; dateNote: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{dateNote}</p>
      </div>
      {children}
    </section>
  );
}

const th = "border-b border-border px-2 py-2 text-left text-xs font-semibold text-muted-foreground";
const td = "border-b border-border px-2 py-2 align-top";

function toCsv(rows: MetricRow[]) {
  const cols: Array<[string, (r: MetricRow) => string | number]> = [
    ["Candidato", (r) => r.candidate], ["Email", (r) => r.email], ["LOB", (r) => r.lob], ["País", (r) => r.country],
    ["Sucursal", (r) => r.branch], ["Origen", (r) => r.source], ["Cita", (r) => r.appointmentAt ?? ""],
    ["Estado cita", (r) => r.appointmentStatus ?? ""], ["Conectado", (r) => (r.connected ? "Sí" : "No")],
    ["Realizada", (r) => (r.completed ? "Sí" : "No")], ["Reclutador", (r) => r.recruiter], ["Decisión Recruitment", (r) => r.recruitment],
    ["Country manager", (r) => r.manager], ["Decisión manager", (r) => r.managerDecision],
    ["Cohorte", (r) => r.training?.waveStart ?? ""], ["Training", (r) => r.training?.status ?? ""],
  ];
  const cell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return [cols.map((c) => c[0]).join(","), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(","))].join("\n");
}
function download(name: string, rows: MetricRow[]) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

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
  const [recruiter, setRecruiter] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [cohort, setCohort] = useState(ALL);
  const [drill, setDrill] = useState<Drill>(null);
  const open: Open = (title, rows) => setDrill({ title, rows });
  const { from, to } = preset === "custom" ? custom : presetRange(preset);
  const today = sv(new Date());

  const all = data?.rows ?? [];
  const opts = useMemo(() => {
    const u = (f: (r: MetricRow) => string | null | undefined) => [...new Set(all.map(f).filter(Boolean) as string[])].sort();
    return { recruiters: u((r) => r.recruiter), managers: u((r) => r.manager), branches: u((r) => r.branch), cohorts: u((r) => r.training?.waveStart) };
  }, [all]);

  // Non-date filters apply everywhere; each section then applies its own date.
  const base = all.filter((r) =>
    (lob === ALL || r.lob === lob) &&
    (recruiter === ALL || r.recruiter === recruiter) &&
    (manager === ALL || r.manager === manager) &&
    (branch === ALL || r.branch === branch) &&
    (source === ALL || (source === "Calendly" ? r.source === "Calendly" : r.source !== "Calendly")) &&
    (cohort === ALL || r.training?.waveStart === cohort),
  );
  const interviews = base.filter((r) => inRange(r.interviewDate, from, to));
  const mgrRows = base.filter((r) => r.sentToSecondFilter && inRange(r.managerAppointmentAt ?? r.managerDecidedAt ?? r.interviewDate, from, to));
  const pending = base
    .filter((r) => r.sentToSecondFilter && (r.managerDecision === "Pendiente" || r.managerDecision === "No show"))
    .sort((a, b) => (a.recruitmentDecidedAt ?? "").localeCompare(b.recruitmentDecidedAt ?? ""));
  const trainingRows = base.filter((r) => r.training && inRange(r.training.waveStart, from, to));
  const tb = (r: MetricRow): TrainingBucket => trainingBucket(r.training!, today);

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  const sel = (label: string, value: string, set: (v: string) => void, items: string[], allLabel = "Todos") => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={set}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {items.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  const connection = (rows: MetricRow[]) => {
    const el = rows.filter((r) => r.eligible);
    return { el, conn: el.filter((r) => r.connected), r: ratio(el.filter((r) => r.connected).length, el.length) };
  };
  const recRatio = (rows: MetricRow[]) => {
    const closed = rows.filter((r) => isClosedRecruitment(r.recruitment));
    return ratio(closed.filter((r) => r.recruitment === "Aprobado").length, closed.length);
  };
  const mgrRatio = (rows: MetricRow[]) => {
    const closed = rows.filter((r) => isClosedManager(r.managerDecision));
    return ratio(closed.filter((r) => r.managerDecision === "Aprobado").length, closed.length);
  };
  const groupBy = (rows: MetricRow[], key: (r: MetricRow) => string) => {
    const m = new Map<string, MetricRow[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  };
  const lobsIn = (rows: MetricRow[]) => [...LOBS, ...new Set(rows.map((r) => r.lob).filter((l) => !(LOBS as readonly string[]).includes(l)))];

  const cal = interviews.filter((r) => r.source === "Calendly");
  const man = interviews.filter((r) => r.source !== "Calendly");
  const scheduled = interviews.filter((r) => r.hasAppointment || r.source === "Manual");
  const cAll = connection(interviews), cCal = connection(cal), cMan = connection(man);

  const F = { conn: "Conectados ÷ citas elegibles (ya pasaron, sin canceladas ni reprogramadas) × 100", rec: "Aprobados por Recruitment ÷ decisiones cerradas (aprobado, no aprobado, retake) × 100", mgr: "Aprobados por manager ÷ decisiones cerradas del manager × 100" };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Recruitment → Training</h2>
          <p className="text-xs text-muted-foreground">
            Resultados al {fmt(new Date().toISOString())} (hora de El Salvador) · actualizado {dataUpdatedAt ? fmt(new Date(dataUpdatedAt).toISOString()) : "—"} · {all.length} candidatos con entrevista
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => download("metricas-filtradas.csv", interviews)} disabled={!data}>
          <Download className="mr-2 h-4 w-4" /> CSV filtrado
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-7">
        <div className="space-y-1">
          <Label className="text-xs">Fecha</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mes</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
              <SelectItem value="custom">Rango personalizado</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <div className="flex gap-1">
              <Input type="date" className="h-8" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Desde" />
              <Input type="date" className="h-8" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Hasta" />
            </div>
          )}
        </div>
        {sel("LOB", lob, setLob, [...LOBS])}
        {sel("Reclutador", recruiter, setRecruiter, opts.recruiters)}
        {sel("Country manager", manager, setManager, opts.managers)}
        {sel("Sucursal", branch, setBranch, opts.branches)}
        {sel("Origen", source, setSource, ["Calendly", "Manual"])}
        {sel("Cohorte", cohort, setCohort, opts.cohorts, "Todas")}
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Resumen</TabsTrigger>
            <TabsTrigger value="recruiters">Reclutadores</TabsTrigger>
            <TabsTrigger value="managers">Country Managers</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <Section title="Entrevistas y conexión" dateNote="Fecha: fecha programada de la entrevista (manuales sin cita: fecha de entrevista)">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Card label="Agendados por Calendly"><Num rows={cal} title="Agendados por Calendly" open={open} /></Card>
                <Card label="Agregados manualmente"><Num rows={man} title="Agregados manualmente" open={open} /></Card>
                <Card label="Total programadas" hint="Calendly + manuales, una sola cita vigente por candidato"><Num rows={scheduled} title="Total programadas" open={open} /></Card>
                <Card label="Citas futuras" hint="No cuentan para la conexión"><Num rows={interviews.filter((r) => r.future)} title="Citas futuras" open={open} /></Card>
                <Card label="Conectados"><Num rows={interviews.filter((r) => r.connected)} title="Conectados" open={open} /></Card>
                <Card label="Entrevistas realizadas" hint="Entrevista finalizada"><Num rows={interviews.filter((r) => r.completed)} title="Entrevistas realizadas" open={open} /></Card>
                <Card label="Conectados sin finalizar"><Num rows={interviews.filter((r) => r.connected && !r.completed)} title="Conectados sin finalizar" open={open} /></Card>
                <Card label="No show de entrevista" hint="Solo los marcados como No Show"><Num rows={interviews.filter((r) => r.noShow)} title="No show" open={open} /></Card>
                <Card label="% conexión general"><Pct r={cAll.r} formula={F.conn} unit="citas elegibles" /></Card>
                <Card label="% conexión Calendly"><Pct r={cCal.r} formula={F.conn} unit="citas elegibles" /></Card>
                <Card label="% conexión manual"><Pct r={cMan.r} formula={F.conn} unit="citas elegibles" /></Card>
                <Card label="% aprobación Recruitment"><Pct r={recRatio(interviews)} formula={F.rec} /></Card>
                <Card label="Pendientes de segundo filtro"><Num rows={pending} title="Pendientes de segundo filtro" open={open} /></Card>
                <Card label="% aprobación manager"><Pct r={mgrRatio(mgrRows)} formula={F.mgr} /></Card>
                <Card label="Reclutados para training"><Num rows={trainingRows.filter((r) => tb(r) !== "No reclutado" && tb(r) !== "Cancelado antes de iniciar")} title="Reclutados para training" open={open} /></Card>
              </div>
            </Section>

            <Section title="Aprobación por LOB" dateNote="Recruitment: fecha de entrevista · Manager: fecha del segundo filtro">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["LOB", "Calendly", "Manuales", "Conectados", "% conexión", "Realizadas", "Aprob. Recruitment", "No aprob.", "Pend. decisión", "% aprob. Recruitment", "Pend. 2º filtro", "2º filtro agendado", "Aprob. manager", "No aprob. manager", "% aprob. manager"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lobsIn(interviews).map((l) => {
                      const rs = interviews.filter((r) => r.lob === l);
                      const ms = mgrRows.filter((r) => r.lob === l);
                      const ps = pending.filter((r) => r.lob === l);
                      return (
                        <tr key={l}>
                          <td className={`${td} font-medium`}>{l}</td>
                          <td className={td}><Num rows={rs.filter((r) => r.source === "Calendly")} title={`${l} · Calendly`} open={open} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.source !== "Calendly")} title={`${l} · Manuales`} open={open} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.connected)} title={`${l} · Conectados`} open={open} /></td>
                          <td className={td}><Pct r={connection(rs).r} formula={F.conn} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.completed)} title={`${l} · Realizadas`} open={open} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.recruitment === "Aprobado")} title={`${l} · Aprobados Recruitment`} open={open} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.recruitment === "No aprobado" || r.recruitment === "Retake")} title={`${l} · No aprobados / Retake`} open={open} /></td>
                          <td className={td}><Num rows={rs.filter((r) => r.connected && r.recruitment === "Pendiente")} title={`${l} · Pendientes de decisión`} open={open} /></td>
                          <td className={td}><Pct r={recRatio(rs)} formula={F.rec} /></td>
                          <td className={td}><Num rows={ps} title={`${l} · Pendientes 2º filtro`} open={open} /></td>
                          <td className={td}><Num rows={ps.filter((r) => r.managerAppointmentAt)} title={`${l} · 2º filtro agendado`} open={open} /></td>
                          <td className={td}><Num rows={ms.filter((r) => r.managerDecision === "Aprobado")} title={`${l} · Aprobados manager`} open={open} /></td>
                          <td className={td}><Num rows={ms.filter((r) => r.managerDecision === "No aprobado" || r.managerDecision === "Retake")} title={`${l} · No aprobados manager`} open={open} /></td>
                          <td className={td}><Pct r={mgrRatio(ms)} formula={F.mgr} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Pendientes de segundo filtro" dateNote="Pendientes al día de hoy, ordenados por mayor espera">
              <div className="grid gap-3 sm:grid-cols-4">
                {(["Sin manager asignado", "Pendiente de agendar", "Agendado", "Realizado, pendiente de decisión"] as const).map((b) => (
                  <Card key={b} label={b}><Num rows={pending.filter((r) => pendingSecondFilterBucket({ managerId: r.managerId, appointmentAt: r.managerAppointmentAt, started: r.managerStarted }) === b)} title={b} open={open} /></Card>
                ))}
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["Candidato", "LOB", "Reclutador", "Country manager", "Aprobado Recruitment", "Días esperando", "Estado", "Fecha 2º filtro", "Último seguimiento", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.applicationId}>
                        <td className={`${td} font-medium`}>{r.candidate}</td><td className={td}>{r.lob}</td><td className={td}>{r.recruiter}</td><td className={td}>{r.manager}</td>
                        <td className={td}>{fmt(r.recruitmentDecidedAt)}</td>
                        <td className={td}>{r.recruitmentDecidedAt ? Math.floor((Date.now() - new Date(r.recruitmentDecidedAt).getTime()) / 86400000) : "Sin registrar"}</td>
                        <td className={td}>{r.managerDecision === "No show" ? "No show (reagendar)" : pendingSecondFilterBucket({ managerId: r.managerId, appointmentAt: r.managerAppointmentAt, started: r.managerStarted })}</td>
                        <td className={td}>{fmt(r.managerAppointmentAt)}</td><td className={td}>{fmt(r.lastContactAt)}</td>
                        <td className={td}><Link to="/second-filter/$applicationId" params={{ applicationId: r.applicationId }} className="text-primary underline">Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="recruiters">
            <Section title="Desempeño por reclutador (LOB → reclutador)" dateNote="Fecha: entrevista de Recruitment · el reclutador es quien hizo la entrevista">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["LOB / Reclutador", "Realizadas", "Aprobados", "No aprob. / Retake", "Pend. decisión", "% aprob. Recruitment", "Enviados 2º filtro", "Pend. 2º filtro", "Aprob. manager", "No aprob. manager", "% aprob. manager", "Reclutados training", "Evaluado por"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lobsIn(interviews).flatMap((l) => {
                      const groups = groupBy(interviews.filter((r) => r.lob === l && r.connected), (r) => r.recruiter);
                      if (!groups.length) return [];
                      return [
                        <tr key={l}><td colSpan={13} className="bg-muted px-2 py-1 text-xs font-semibold">{l}</td></tr>,
                        ...groups.map(([name, rs]) => {
                          const sent = rs.filter((r) => r.sentToSecondFilter);
                          return (
                            <tr key={`${l}-${name}`}>
                              <td className={`${td} font-medium`}>{name}</td>
                              <td className={td}><Num rows={rs.filter((r) => r.completed)} title={`${name} · Realizadas`} open={open} /></td>
                              <td className={td}><Num rows={rs.filter((r) => r.recruitment === "Aprobado")} title={`${name} · Aprobados`} open={open} /></td>
                              <td className={td}><Num rows={rs.filter((r) => r.recruitment === "No aprobado" || r.recruitment === "Retake")} title={`${name} · No aprobados`} open={open} /></td>
                              <td className={td}><Num rows={rs.filter((r) => r.recruitment === "Pendiente")} title={`${name} · Pendientes`} open={open} /></td>
                              <td className={td}><Pct r={recRatio(rs)} formula={F.rec} /></td>
                              <td className={td}><Num rows={sent} title={`${name} · Enviados a 2º filtro`} open={open} /></td>
                              <td className={td}><Num rows={sent.filter((r) => r.managerDecision === "Pendiente" || r.managerDecision === "No show")} title={`${name} · Pend. 2º filtro`} open={open} /></td>
                              <td className={td}><Num rows={sent.filter((r) => r.managerDecision === "Aprobado")} title={`${name} · Aprob. manager`} open={open} /></td>
                              <td className={td}><Num rows={sent.filter((r) => r.managerDecision === "No aprobado" || r.managerDecision === "Retake")} title={`${name} · No aprob. manager`} open={open} /></td>
                              <td className={td}><Pct r={mgrRatio(sent)} formula="Candidatos del reclutador aprobados por manager ÷ sus candidatos con decisión cerrada del manager × 100" /></td>
                              <td className={td}><Num rows={sent.filter((r) => r.training?.incorporationConfirmed)} title={`${name} · Reclutados training`} open={open} /></td>
                              <td className={`${td} text-xs`}>{groupBy(sent.filter((r) => r.managerDecision !== "Pendiente"), (r) => r.manager).map(([m, x]) => `${m}: ${x.length}`).join(" · ") || "—"}</td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="managers">
            <Section title="Desempeño por country manager (LOB → manager)" dateNote="Fecha: segundo filtro (cita o decisión) · cada decisión es del manager que la tomó">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr>{["LOB / Manager", "Recibidos", "Realizados", "Aprobados", "No aprobados / Retake", "No show", "Pend. 2º filtro", "Pend. decisión", "% aprobación"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {lobsIn(mgrRows).flatMap((l) => {
                      const groups = groupBy(mgrRows.filter((r) => r.lob === l), (r) => r.manager);
                      if (!groups.length) return [];
                      return [
                        <tr key={l}><td colSpan={9} className="bg-muted px-2 py-1 text-xs font-semibold">{l}</td></tr>,
                        ...groups.map(([name, rs]) => (
                          <tr key={`${l}-${name}`}>
                            <td className={`${td} font-medium`}>{name}</td>
                            <td className={td}><Num rows={rs} title={`${name} · Recibidos`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => isClosedManager(r.managerDecision) || r.managerStarted)} title={`${name} · Realizados`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "Aprobado")} title={`${name} · Aprobados`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "No aprobado" || r.managerDecision === "Retake")} title={`${name} · No aprobados`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "No show")} title={`${name} · No show`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "Pendiente" && !r.managerStarted)} title={`${name} · Pend. 2º filtro`} open={open} /></td>
                            <td className={td}><Num rows={rs.filter((r) => r.managerDecision === "Pendiente" && r.managerStarted)} title={`${name} · Pend. decisión`} open={open} /></td>
                            <td className={td}><Pct r={mgrRatio(rs)} formula={F.mgr} /></td>
                          </tr>
                        )),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="training">
            <TrainingTab rows={trainingRows} tb={tb} today={today} open={open} />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{drill?.title} · {drill?.rows.length}</DialogTitle></DialogHeader>
          <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => drill && download("listado.csv", drill.rows)}><Download className="mr-2 h-4 w-4" />CSV</Button></div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead><tr>{["Candidato", "LOB", "Origen", "Cita", "Reclutador", "Recruitment", "Manager", "Training", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {drill?.rows.map((r) => (
                  <tr key={r.applicationId}>
                    <td className={td}><p className="font-medium">{r.candidate}</p><p className="text-xs text-muted-foreground">{r.email}</p></td>
                    <td className={td}>{r.lob}</td><td className={td}>{r.source}</td>
                    <td className={td}>{fmt(r.appointmentAt)}<p className="text-xs text-muted-foreground">{r.appointmentStatus ?? ""}</p></td>
                    <td className={td}>{r.recruiter}</td><td className={td}>{r.recruitment}</td>
                    <td className={td}>{r.manager}<p className="text-xs text-muted-foreground">{r.managerDecision}</p></td>
                    <td className={td}>{r.training ? `${r.training.waveStart ?? "Sin cohorte"} · ${r.training.status ?? ""}` : "—"}</td>
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

function TrainingTab({ rows, tb, today, open }: { rows: MetricRow[]; tb: (r: MetricRow) => TrainingBucket; today: string; open: Open }) {
  const recruited = rows.filter((r) => tb(r) !== "No reclutado" && tb(r) !== "Cancelado antes de iniciar");
  const calc = (list: MetricRow[]) => {
    const rec = list.filter((r) => recruited.includes(r));
    const expected = rec.filter((r) => trainingExpected(tb(r)));
    const started = rec.filter((r) => trainingStarted(tb(r)));
    const by = (b: TrainingBucket) => rec.filter((r) => tb(r) === b);
    return {
      rec, expected, started, pendingStart: by("Pendiente de iniciar"), active: by("Activo"), dropout: by("Dropout"),
      noShow: by("No show"), done: by("Completó"), unknown: by("Sin registrar"),
      canceled: list.filter((r) => tb(r) === "Cancelado antes de iniciar"),
      notConfirmed: list.filter((r) => tb(r) === "No reclutado"),
      changed: list.filter((r) => (r.training?.cohortChanges ?? 0) > 0),
    };
  };
  const t = calc(rows);
  const P = {
    start: "Iniciaron ÷ esperados para iniciar (incorporación confirmada y fecha de inicio ya llegó) × 100",
    noShow: "No shows confirmados ÷ esperados para iniciar × 100",
    drop: "Dropouts ÷ personas que iniciaron × 100",
    done: "Completaron ÷ personas que iniciaron × 100",
  };
  const cohorts = new Map<string, MetricRow[]>();
  for (const r of rows) {
    const k = `${r.lob}|${r.training?.waveStart ?? "Sin cohorte"}`;
    cohorts.set(k, [...(cohorts.get(k) ?? []), r]);
  }
  return (
    <div className="space-y-4">
      <Section title="Training Results" dateNote="Fecha: inicio de la cohorte">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Card label="Reclutados para training" hint="Incorporación confirmada y cohorte asignada"><Num rows={t.rec} title="Reclutados" open={open} /></Card>
          <Card label="Pendientes de iniciar"><Num rows={t.pendingStart} title="Pendientes de iniciar" open={open} /></Card>
          <Card label="Iniciaron"><Num rows={t.started} title="Iniciaron" open={open} /></Card>
          <Card label="Activos en training"><Num rows={t.active} title="Activos" open={open} /></Card>
          <Card label="Dropouts"><Num rows={t.dropout} title="Dropouts" open={open} /></Card>
          <Card label="No show de training"><Num rows={t.noShow} title="No show training" open={open} /></Card>
          <Card label="Completaron"><Num rows={t.done} title="Completaron" open={open} /></Card>
          <Card label="% inicio"><Pct r={ratio(t.started.length, t.expected.length)} formula={P.start} /></Card>
          <Card label="% no show"><Pct r={ratio(t.noShow.length, t.expected.length)} formula={P.noShow} /></Card>
          <Card label="% dropout"><Pct r={ratio(t.dropout.length, t.started.length)} formula={P.drop} /></Card>
          <Card label="% finalización"><Pct r={ratio(t.done.length, t.started.length)} formula={P.done} /></Card>
          <Card label="Sin registrar" hint="Fecha de inicio pasó pero no hay asistencia registrada"><Num rows={t.unknown} title="Sin registrar" open={open} /></Card>
          <Card label="Cancelados antes de iniciar"><Num rows={t.canceled} title="Cancelados antes de iniciar" open={open} /></Card>
          <Card label="Incorporación sin confirmar" hint="Aprobados en el tracker que aún no cuentan como reclutados"><Num rows={t.notConfirmed} title="Incorporación sin confirmar" open={open} /></Card>
          <Card label="Cambios de cohorte"><Num rows={t.changed} title="Cambiaron de cohorte" open={open} /></Card>
        </div>
      </Section>
      <Section title="Por LOB y cohorte" dateNote="Las cohortes en curso no son resultados definitivos">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr>{["LOB", "Cohorte", "Reclutados", "Pend. iniciar", "Iniciaron", "Activos", "Dropout", "No show", "Completaron", "% inicio", "% dropout", "% no show", "% finalización", "Motivos"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {[...cohorts].sort((a, b) => a[0].localeCompare(b[0])).map(([k, list]) => {
                const [l, w] = k.split("|");
                const c = calc(list);
                const ongoing = c.active.length > 0 || (w !== "Sin cohorte" && w! > today);
                const reasons = [...c.dropout, ...c.noShow].map((r) => r.training?.outcomeReason || "Sin motivo registrado");
                return (
                  <tr key={k}>
                    <td className={td}>{l}</td>
                    <td className={td}>{w}{ongoing && <span className="ml-1 rounded bg-accent px-1 text-[10px]">En curso</span>}</td>
                    <td className={td}><Num rows={c.rec} title={`${k} · Reclutados`} open={open} /></td>
                    <td className={td}><Num rows={c.pendingStart} title={`${k} · Pendientes`} open={open} /></td>
                    <td className={td}><Num rows={c.started} title={`${k} · Iniciaron`} open={open} /></td>
                    <td className={td}><Num rows={c.active} title={`${k} · Activos`} open={open} /></td>
                    <td className={td}><Num rows={c.dropout} title={`${k} · Dropout`} open={open} /></td>
                    <td className={td}><Num rows={c.noShow} title={`${k} · No show`} open={open} /></td>
                    <td className={td}><Num rows={c.done} title={`${k} · Completaron`} open={open} /></td>
                    <td className={td}><Pct r={ratio(c.started.length, c.expected.length)} formula={P.start} /></td>
                    <td className={td}><Pct r={ratio(c.dropout.length, c.started.length)} formula={P.drop} /></td>
                    <td className={td}><Pct r={ratio(c.noShow.length, c.expected.length)} formula={P.noShow} /></td>
                    <td className={td}><Pct r={ratio(c.done.length, c.started.length)} formula={P.done} /></td>
                    <td className={`${td} text-xs`}>{reasons.join(" · ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
