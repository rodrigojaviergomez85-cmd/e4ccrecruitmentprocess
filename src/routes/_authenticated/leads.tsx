import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOG, LEAD_LOBS, LOB_LABEL, canonicalRecruiter, valueGroup, type LeadField, type LeadLob } from "@/lib/leads";
import { importLeadsFromSheet, listLeads, updateLead } from "@/lib/leads.functions";
import { resultLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — E4CC Recruitment" },
      { name: "description", content: "Leads por país con filtro, mensaje, llamada y entrevista, y métricas semanales por reclutador." },
      { property: "og:title", content: "Leads — E4CC Recruitment" },
      { property: "og:description", content: "Embudo semanal de leads de E4CC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
});

type Data = Awaited<ReturnType<typeof listLeads>>;
type Row = Data["rows"][number];
const WEEK = 7 * 86400_000;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("es-SV", { timeZone: "America/El_Salvador", day: "numeric", month: "short" });
const fmtDt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-SV", { timeZone: "America/El_Salvador", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

function LeadsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listLeads);
  const doImport = useServerFn(importLeadsFromSheet);
  const [lob, setLob] = useState<"ALL" | LeadLob>("ONLINE");
  const [weekOf, setWeekOf] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [onlyWeek, setOnlyWeek] = useState(true);
  const [importing, setImporting] = useState(false);
  const key = ["leads", lob, weekOf, search, onlyWeek];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => list({ data: { lob, weekOf, search, onlyWeek } }) });

  async function runImport() {
    setImporting(true);
    try {
      const r = await doImport();
      toast.success(`Hoja leída: ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const m = data?.metrics;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Leads</h1>
        <span className="text-xs text-muted-foreground">{data?.lastImport ? `Última lectura de la hoja: ${fmtDt(data.lastImport)}` : "Aún no se ha leído la hoja"}</span>
        <Button size="sm" variant="outline" onClick={runImport} disabled={importing}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar desde la hoja
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", ...LEAD_LOBS] as const).map((l) => (
          <Button key={l} size="sm" variant={lob === l ? "default" : "outline"} onClick={() => setLob(l)}>
            {l === "ALL" ? "TODOS" : LOB_LABEL[l]}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Semana anterior" onClick={() => setWeekOf((w) => w - WEEK)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-36 text-center text-sm">{data ? `Semana ${fmtDay(data.weekFrom)} – ${fmtDay(data.weekFrom + WEEK - 1)}` : "…"}</span>
          <Button size="icon" variant="ghost" aria-label="Semana siguiente" onClick={() => setWeekOf((w) => w + WEEK)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Kpi label="Leads recibidas" value={m.received} />
          <Kpi label="Aprobadas en filtro" value={m.filterApproved} sub={pct(m.filterApproved, m.received)} />
          <Kpi label="Mensajes enviados" value={m.messages} />
          <Kpi label="Llamadas realizadas" value={m.calls} sub={`${m.openHouse} Open House aparte`} />
          <Kpi label="Llamadas conectadas" value={m.connected} sub={pct(m.connected, m.calls)} />
          <Kpi label="Aprobadas en llamada" value={m.callApproved} sub={pct(m.callApproved, m.connected)} />
          <Kpi label="Agendadas (Calendly)" value={m.calendly} sub="agendó, no asistencia" />
          <Kpi label="Entrevistas" value={m.interviews} sub={`${m.interviewApproved} aprob. hoja · ${m.lastStep} a último filtro · ${m.retake} retake`} />
        </div>
      )}

      {m && Object.keys(m.byRecruiter).length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Reclutador</th><th className="p-2">Mensajes</th><th className="p-2">Llamadas</th><th className="p-2">Conectadas</th><th className="p-2">Aprobadas en llamada</th></tr>
            </thead>
            <tbody>
              {Object.entries(m.byRecruiter).sort((a, b) => b[1].calls - a[1].calls).map(([n, v]) => (
                <tr key={n} className="border-t border-border"><td className="p-2 font-medium">{n}</td><td className="p-2">{v.messages}</td><td className="p-2">{v.calls}</td><td className="p-2">{v.connected}</td><td className="p-2">{v.callApproved}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-xs" placeholder="Buscar nombre, correo o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyWeek} onChange={(e) => setOnlyWeek(e.target.checked)} /> Solo actividad de esta semana
        </label>
        <span className="text-xs text-muted-foreground">{data ? `${data.total} leads${data.total > 300 ? " (mostrando 300)" : ""}` : ""}</span>
      </div>

      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {isPending ? (
        <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Lead</th><th className="p-2">Filtro lead</th><th className="p-2">Mensaje enviado</th>
                <th className="p-2">Resultado de llamada</th><th className="p-2">Resultado de entrevista</th><th className="p-2">Lovable (en vivo)</th><th className="p-2">Comentario</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => <LeadRow key={r.id} row={r} />)}
              {data?.rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin leads para esta vista.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub && <div className="text-[10px] leading-tight text-muted-foreground">{sub}</div>}
    </div>
  );
}

function LeadRow({ row }: { row: Row }) {
  const qc = useQueryClient();
  const update = useServerFn(updateLead);
  const [comment, setComment] = useState(row.comment);
  const [saving, setSaving] = useState(false);
  const lob = row.lob as LeadLob;

  async function save(patch: Partial<Record<LeadField | "comment", string>>) {
    setSaving(true);
    try {
      await update({ data: { id: row.id, ...patch } });
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pick = (field: LeadField, stamp?: { rec: string; date: string; time: string }) => {
    const value = row[field] as string;
    const options = CATALOG[lob][field].includes(value) || !value ? CATALOG[lob][field] : [value, ...CATALOG[lob][field]];
    return (
      <td className="p-2 align-top">
        <select
          className="w-44 rounded border border-input bg-background px-1 py-1 text-xs"
          value={value}
          disabled={saving}
          onChange={(e) => save({ [field]: e.target.value })}
        >
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {value && valueGroup(value) !== "Otro" && <div className="mt-0.5 text-[10px] text-muted-foreground">{valueGroup(value)}</div>}
        {stamp && (stamp.rec || stamp.date) && (
          <div className="text-[10px] text-muted-foreground">{canonicalRecruiter(stamp.rec)} {stamp.date} {stamp.time}</div>
        )}
      </td>
    );
  };

  const lov = row.lovable;
  return (
    <tr className="border-t border-border">
      <td className="p-2 align-top">
        <div className="font-medium">{row.full_name || "(sin nombre)"}</div>
        <div className="text-xs text-muted-foreground">{row.email}</div>
        <div className="text-xs text-muted-foreground">{row.phone}</div>
        <div className="text-[10px] text-muted-foreground">
          {LOB_LABEL[lob]}{row.lead_country && row.lob === "ONLINE" ? ` · ${row.lead_country}` : ""} · {fmtDt(row.lead_created_at)}
          {row.edited_in_app_at ? " · editado en plataforma" : ""}
        </div>
      </td>
      {pick("filtro_lead")}
      {pick("mensaje", { rec: row.msg_recruiter, date: row.msg_date, time: row.msg_time })}
      {pick("llamada", { rec: row.call_recruiter, date: row.call_date, time: row.call_time })}
      <td className="p-2 align-top">
        <div className="text-[10px] font-medium text-muted-foreground">Histórico hoja</div>
        <table><tbody>{/* keeps cell compact */}</tbody></table>
        {pick("interview_result").props.children}
        {row.interview_date && <div className="text-[10px] text-muted-foreground">Fecha hoja: {row.interview_date}</div>}
      </td>
      <td className="p-2 align-top text-xs">
        {lov ? (
          <div className={cn("space-y-0.5")}>
            {lov.appointment_at && <div>Cita: {fmtDt(lov.appointment_at)} ({lov.appointment_status})</div>}
            {lov.interviewed_at ? (
              <div>
                Entrevista: {fmtDt(lov.interviewed_at)} · <span className="font-medium">{lov.result === "Approved for last step" ? "Avanzó a último filtro" : resultLabel(lov.result)}</span>
                {lov.interviewer && <> · {lov.interviewer}</>}
              </div>
            ) : <div className="text-muted-foreground">Sin entrevista en plataforma</div>}
            <div className="text-[10px] text-muted-foreground">Estado: {lov.status}</div>
          </div>
        ) : <span className="text-muted-foreground">No está en plataforma</span>}
      </td>
      <td className="p-2 align-top">
        <textarea
          className="h-14 w-48 rounded border border-input bg-background p-1 text-xs"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => comment !== row.comment && save({ comment })}
        />
      </td>
    </tr>
  );
}
