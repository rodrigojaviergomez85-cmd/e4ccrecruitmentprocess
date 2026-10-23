import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createRequisition, listRequisitions, listTrainingRoster, saveTrainingReferences, updateRequisition, updateTrainingRow } from "@/lib/training.functions";
import { TrainingProfileDialog } from "@/components/TrainingProfileDialog";
import { RecruitmentGoal } from "@/components/RecruitmentGoal";
import { publishTrainingLob } from "@/lib/training-lob";
import { useNavCollapsed } from "@/lib/nav-collapsed";
import { PENDING_SPOT, SPOT_TYPES, openSpots, statusSummary, TRAINING_GROUPS, TRAINING_STATUSES, approvalBlocked, documentsPercent, trainingGroup } from "@/lib/training";
import { ONSITE_BRANCHES } from "@/lib/branches";
import { DAY_PATTERNS, TIME_OPTIONS, fmt12, type DayPattern } from "@/lib/schedule";

const GROUP_CODE: Record<string, string> = { "EL SALVADOR": "SV", NICARAGUA: "NI", GUATEMALA: "GT" };
function branchOptions(group: string) {
  return group === "ONLINE" ? ["Online"] : ONSITE_BRANCHES[GROUP_CODE[group] ?? ""] ?? [];
}

/** Days + start/end dropdowns; stored as readable text like "Lunes a viernes: 5:00 PM–9:00 PM". */
function SchedulePicker({ value, onChange, disabled = false }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const parsed = DAY_PATTERNS.find((d) => value.startsWith(`${d.label}: `));
  const times = parsed ? value.slice(parsed.label.length + 2).split("–") : [];
  const toHhmm = (t: string | undefined) => TIME_OPTIONS.find((o) => fmt12(o) === t?.trim()) ?? "";
  const [p, setP] = useState<DayPattern | "">(parsed?.value ?? "");
  const [s, setS] = useState(toHhmm(times[0]));
  const [e, setE] = useState(toHhmm(times[1]));
  const emit = (np: DayPattern | "", ns: string, ne: string) => {
    setP(np); setS(ns); setE(ne);
    const label = DAY_PATTERNS.find((d) => d.value === np)?.label;
    if (label && ns && ne && ne > ns) onChange(`${label}: ${fmt12(ns)}–${fmt12(ne)}`);
  };
  return <div className="mt-1 flex items-center gap-1" title={value}>
    <Select value={p} disabled={disabled} onValueChange={(v) => emit(v as DayPattern, s, e)}><SelectTrigger className="w-44"><SelectValue placeholder={!parsed && value ? value : "Días"} /></SelectTrigger><SelectContent>{DAY_PATTERNS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent></Select>
    <Select value={s} disabled={disabled} onValueChange={(v) => emit(p, v, e && e > v ? e : "")}><SelectTrigger className="w-28"><SelectValue placeholder="Inicio" /></SelectTrigger><SelectContent>{TIME_OPTIONS.map((t) => <SelectItem key={t} value={t}>{fmt12(t)}</SelectItem>)}</SelectContent></Select>
    <Select value={e} disabled={disabled} onValueChange={(v) => emit(p, s, v)}><SelectTrigger className="w-28"><SelectValue placeholder="Fin" /></SelectTrigger><SelectContent>{TIME_OPTIONS.filter((t) => !s || t > s).map((t) => <SelectItem key={t} value={t}>{fmt12(t)}</SelectItem>)}</SelectContent></Select>
  </div>;
}

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({ meta: [
    { title: "Training Tracker — E4CC" },
    { name: "description", content: "E4CC training roster by Online and country, documentation verified by Generalistas and reference calls by Recruitment." },
    { property: "og:title", content: "Training Tracker — E4CC" },
    { property: "og:description", content: "Training waves, candidate documentation and reference calls for E4CC." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TrainingPage,
});

type Data = Awaited<ReturnType<typeof listTrainingRoster>>;
type Row = Data["rows"][number];
type Permissions = Omit<Data, "rows">;
const daysUntil = (d: string | null) => d ? Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86400000) : null;
const documentLabel = (d: string) => {
  if (d.length <= 30) return d;
  if (d.includes("both sides")) return d.split(",")[0] + " · ambos lados";
  if (d.includes("diploma")) return "Título académico";
  if (d.startsWith("Agreement:")) return "Convenio firmado";
  const match = d.match(/\(([^)]+)\)/);
  return match?.[1] ?? d;
};

function TrainingPage() {
  const list = useServerFn(listTrainingRoster);
  const { data, isLoading, error } = useQuery({ queryKey: ["training-roster"], queryFn: () => list() });
  const listReq = useServerFn(listRequisitions);
  const { data: req } = useQuery({ queryKey: ["requisitions"], queryFn: () => listReq() });
  const [lob, setLob] = useState("ONLINE");
  // The goal summary now lives in the sidebar: keep it on the tab being viewed.
  useEffect(() => { publishTrainingLob(lob); }, [lob]);
  const [periodMode, setPeriodMode] = useState<"wave" | "month">("wave");
  const [period, setPeriod] = useState("all");
  const periodOf = (w: string | null) => (w ? (periodMode === "wave" ? w : w.slice(0, 7)) : "Sin fecha");
  const inPeriod = (w: string | null) => period === "all" || periodOf(w) === period;
  const periods = [...new Set([...(data?.rows ?? []).map((r) => r.waveStart), ...(req?.spots ?? []).map((x) => x.waveStart)].map(periodOf))].sort();
  const open = openSpots(req?.spots ?? [], data?.rows ?? []).filter((o) => inPeriod(o.waveStart));
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const rows = data?.rows ?? [];
  const periodRows = rows.filter((r) => inPeriod(r.waveStart));
  const filtered = periodRows.filter((r) => (lob === "all" || trainingGroup(r.modality, r.countryCode) === lob) && (status === "all" || r.status === status) && `${r.fullName} ${r.email} ${r.branch}`.toLowerCase().includes(search.toLowerCase()));
  const groupNames = [...TRAINING_GROUPS, ...(rows.some((r) => trainingGroup(r.modality, r.countryCode) === "OTROS") ? ["OTROS"] : [])];
  return (
    <div className="min-h-screen bg-background">
      <main className="space-y-5 px-4 py-5 sm:px-6">
        <h1 className="text-xl font-semibold">Training Tracker</h1>
        <Tabs value={lob} onValueChange={setLob}>
          <div className="overflow-x-auto">
            <TabsList className="h-auto justify-start rounded-none border-b bg-transparent p-0">
              {[...groupNames, "all"].map((g) => <TabsTrigger key={g} value={g} className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                {g === "all" ? "TODOS" : g}<span className="text-xs text-muted-foreground">{periodRows.filter((r) => g === "all" || trainingGroup(r.modality, r.countryCode) === g).length}</span>
              </TabsTrigger>)}
            </TabsList>
          </div>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={periodMode} onValueChange={(v) => { setPeriodMode(v as "wave" | "month"); setPeriod("all"); }}><SelectTrigger aria-label="Agrupar por" className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wave">Por wave</SelectItem><SelectItem value="month">Por mes</SelectItem></SelectContent></Select>
          <Select value={period} onValueChange={setPeriod}><SelectTrigger aria-label="Periodo" className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{periods.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        </div>
        {data && <StatusSummary groups={lob === "all" ? groupNames : [lob]} rows={periodRows} open={open} />}
        {/* On phones/tablets the sidebar is hidden; on desktop the goal moves into the page only when the sidebar is collapsed. */}
        <div className={navCollapsed ? undefined : "lg:hidden"}><RecruitmentGoal group={lob === "all" ? undefined : lob} /></div>
        <div className="-mt-2 flex flex-wrap items-center gap-3">
          <Input aria-label="Buscar candidato" placeholder="Buscar nombre, correo o sucursal" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-80" />
          <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filtrar estado" className="w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value={PENDING_SPOT}>{PENDING_SPOT}</SelectItem>{TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <span className="text-sm text-muted-foreground">{filtered.length} candidatos</span>
          {req?.canManage && <div className="ml-auto"><AddRequisition /></div>}
        </div>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {data && !filtered.length && <p className="py-8 text-muted-foreground">No hay candidatos en esta lista.</p>}
        {data && groupNames.map((group) => {
          const groupRows = filtered.filter((r) => trainingGroup(r.modality, r.countryCode) === group);
          const pending = (status === "all" || status === PENDING_SPOT) && !search && (lob === "all" || lob === group) ? open.filter((o) => o.group === group) : [];
          if (!groupRows.length && !pending.length) return null;
          const docs = [...new Set(groupRows.flatMap((r) => r.documentList))];
          return <section key={group} className="space-y-2">
            <div className="flex items-center gap-3"><h2 className="text-base font-semibold">{group}</h2><span className="text-sm text-muted-foreground">{groupRows.length}</span>{pending.length > 0 && <span className="text-sm font-semibold text-destructive">{pending.length} cupos pendientes de reclutar</span>}</div>
            <div className="max-h-[65vh] overflow-auto border border-border">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-muted text-foreground">
                  <tr>{["Candidato", "Reclutador", "Estado en training", "Sucursal", "Año / Mes", "Inicio de wave", "Días restantes", "Request date", "Aprobado por Reclutamiento", "Horario acordado", "Trainer", "Comments", "Llamada de referencia", "Detalles de referencias", "Documentación", ...docs.map(documentLabel), "Teléfono", "Email"].map((h, i) => <th key={`${i}-${h}`} scope="col" className={`border-b border-r border-border px-3 py-3 text-left font-semibold ${i === 0 ? "sticky left-0 z-30 min-w-72 bg-muted" : i >= 15 && i < 15 + docs.length ? "min-w-32 max-w-40 text-center" : "min-w-36"}`} title={i >= 15 && i < 15 + docs.length ? docs[i - 15] : undefined}>{h}</th>)}</tr>
                </thead>
                <tbody>{groupRows.map((row) => <RosterRow key={row.id} row={row} docs={docs} permissions={data} />)}{pending.map((o) => <tr key={o.id} className="bg-destructive/5">
                  <td className="sticky left-0 z-10 min-w-72 border-b border-r border-border bg-card px-3 py-3 font-semibold text-destructive">Cupo {o.spotType}</td><td className="border-b border-r border-border px-3 py-3">—</td>
                  <td className="border-b border-r border-border px-3 py-3"><span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">{PENDING_SPOT}</span></td>
                  <td className="border-b border-r border-border px-3 py-3">{o.branch || "—"}</td><td className="border-b border-r border-border px-3 py-3">{o.waveStart ? `${o.waveStart.slice(0, 4)} / ${o.waveStart.slice(5, 7)}` : "—"}</td><td className="border-b border-r border-border px-3 py-3">{o.waveStart ?? "—"}</td><td className="border-b border-r border-border px-3 py-3">{daysUntil(o.waveStart) ?? "—"}</td><td className="border-b border-r border-border px-3 py-3">{o.requestDate ?? "—"}</td><td className="border-b border-r border-border px-3 py-3">—</td><td className="border-b border-r border-border px-3 py-3">{o.agreedSchedule || "—"}</td><td className="border-b border-r border-border px-3 py-3">—</td><td className="border-b border-r border-border px-3 py-3" colSpan={5 + docs.length}>{o.comments || ""}</td><td className="border-b border-r border-border px-3 py-3">{req?.canManage && <DeleteSpot id={o.id} />}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>;
        })}
      </main>
    </div>
  );
}

function DeleteSpot({ id }: { id: string }) {
  const update = useServerFn(updateRequisition);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return <Button size="sm" variant="ghost" className="text-destructive" aria-label="Eliminar cupo" disabled={busy} onClick={async () => {
    if (!confirm("¿Eliminar este cupo de la requisición?")) return;
    setBusy(true);
    try { await update({ data: { id, action: "delete" } }); await qc.invalidateQueries({ queryKey: ["requisitions"] }); toast.success("Cupo eliminado"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo eliminar"); }
    finally { setBusy(false); }
  }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>;
}

function RosterRow({ row, docs, permissions: p }: { row: Row; docs: string[]; permissions: Permissions }) {
  const update = useServerFn(updateTrainingRow);
  const qc = useQueryClient();
  const [f, setF] = useState(row);
  const [baseline, setBaseline] = useState(row);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(baseline);
  const pct = documentsPercent(f.documentList, f.documents);
  const blocked = approvalBlocked(f.referenceCall);
  async function save() {
    setSaving(true);
    try {
      const changed = <K extends keyof Row>(key: K) => f[key] !== baseline[key] ? f[key] : undefined;
      await update({ data: {
        applicationId: row.id,
        ...(p.canEditTraining ? { waveStart: changed("waveStart"), requestDate: changed("requestDate"), hiringDate: changed("hiringDate"), status: changed("status") as (typeof TRAINING_STATUSES)[number] | undefined, agreedSchedule: changed("agreedSchedule"), comments: changed("comments") } : {}),
        ...(p.canEditDocuments && JSON.stringify(f.documents) !== JSON.stringify(baseline.documents) ? { documents: f.documents } : {}),
        ...(p.canEditReferences ? { referenceCall: changed("referenceCall") as "pending" | "done" | "not_recommended" | undefined, referenceDetails: changed("referenceDetails") } : {}),
      } });
      setBaseline(f);
      toast.success("Guardado");
      await qc.invalidateQueries({ queryKey: ["training-roster"] });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  const cell = "border-b border-r border-border px-3 py-3 align-top";
  const dateInput = (key: "waveStart" | "requestDate" | "hiringDate", label: string) => <Input type="date" aria-label={`${label} — ${row.fullName}`} value={f[key] ?? ""} disabled={!p.canEditTraining} onChange={(e) => setF({ ...f, [key]: e.target.value || null })} className="w-40" />;
  const textInput = (key: "agreedSchedule" | "comments" | "referenceDetails", label: string, enabled: boolean) => <Input aria-label={`${label} — ${row.fullName}`} title={f[key]} value={f[key]} disabled={!enabled} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="w-64" />;
  return <tr className="bg-card">
    <td className={`${cell} sticky left-0 z-10 min-w-72 bg-card`}><div className="flex items-start justify-between gap-2"><div className="min-w-0">{p.trainingOnly ? <p className="max-w-56 font-semibold">{row.fullName}</p> : <><button type="button" className="max-w-56 text-left font-semibold text-primary underline-offset-2 hover:underline" onClick={() => setProfileOpen(true)}>{row.fullName}</button><TrainingProfileDialog applicationId={row.id} open={profileOpen} onOpenChange={setProfileOpen} /></>}<p className="mt-1 text-xs text-muted-foreground">{row.country}</p></div><Button variant={dirty ? "default" : "outline"} size="sm" className="shrink-0" aria-label={`Guardar — ${row.fullName}`} title={dirty ? "Hay cambios sin guardar" : "Sin cambios"} onClick={() => void save()} disabled={!dirty || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{dirty ? "Guardar" : ""}</Button></div></td>
    <td className={cell}>{row.recruiter}</td>
    <td className={cell}><Select value={f.status} disabled={!p.canEditTraining} onValueChange={(status) => setF({ ...f, status })}><SelectTrigger aria-label={`Estado — ${row.fullName}`} className={`w-56 ${f.status === "CERTIFIED" ? "bg-success/10" : f.status === "NOT CERTIFIED" || f.status.startsWith("DROP OUT") ? "bg-destructive/10" : ""}`}><SelectValue /></SelectTrigger><SelectContent>{TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></td>
    <td className={cell}>{row.branch || "—"}</td>
    <td className={cell}>{f.waveStart ? `${f.waveStart.slice(0, 4)} / ${f.waveStart.slice(5, 7)}` : "—"}</td>
    <td className={cell}>{dateInput("waveStart", "Inicio de wave")}</td>
    <td className={cell}>{daysUntil(f.waveStart) ?? "—"}</td>
    <td className={cell}>{dateInput("requestDate", "Request date")}</td>
    <td className={cell}>{row.recruitmentApprovedAt ?? "—"}</td>
    <td className={cell}><SchedulePicker value={f.agreedSchedule} disabled={!p.canEditTraining} onChange={(agreedSchedule) => setF({ ...f, agreedSchedule })} /></td>
    <td className={cell}>{row.trainer || "—"}</td>
    <td className={cell}><Input aria-label={`Comments — ${row.fullName}`} title={f.comments} placeholder={f.status.startsWith("DROP OUT") ? "Motivo del drop out" : ""} value={f.comments} disabled={!p.canEditTraining} onChange={(e) => setF({ ...f, comments: e.target.value })} className={`w-64 ${f.status.startsWith("DROP OUT") && !f.comments ? "border-destructive" : ""}`} /></td>
    <td className={`${cell} ${blocked ? "bg-destructive/10 text-destructive" : "bg-card text-foreground"}`}><Select value={f.referenceCall} disabled={!p.canEditReferences} onValueChange={(referenceCall) => setF({ ...f, referenceCall })}><SelectTrigger aria-label={`Llamada de referencia — ${row.fullName}`} className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendiente · Recruitment</SelectItem><SelectItem value="done">Realizada · recomendado</SelectItem><SelectItem value="not_recommended">Realizada · no recomendado</SelectItem></SelectContent></Select><p className="mt-2 text-xs">{blocked ? "Aprobación pendiente" : "Referencias aprobadas"} · {row.referencesVerified}/{row.referencesOnFile}</p></td>
    <td className={cell}>{!p.canEditReferences && row.referenceContacts.length > 0 && <details className="group relative mb-1 text-xs"><summary className="cursor-pointer list-none rounded border border-border bg-card px-2 py-1 font-medium hover:bg-muted">Contactos ({row.referenceContacts.length}) ▾</summary><ul className="absolute left-0 z-40 mt-1 max-h-72 w-72 space-y-1 overflow-auto rounded border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">{row.referenceContacts.map((c, i) => <li key={i} className="rounded border border-border p-1.5"><p className="font-semibold">{c.supervisor || "Sin nombre"} <span className="font-normal text-muted-foreground">· {c.source}</span></p><p>{c.company}{c.position ? ` · ${c.position}` : ""}</p>{c.contact ? <p className="select-all font-medium">{c.contact}</p> : <p className="text-muted-foreground">Sin contacto</p>}{c.comment && <p className="mt-1 italic text-muted-foreground">{c.comment}</p>}</li>)}</ul></details>}{p.canEditReferences && <ReferencesEditor applicationId={row.id} name={row.fullName} initial={row.applicantRefs} />}</td>
    <td className={`${cell} ${pct < 100 && f.documentList.length ? "bg-destructive/10 text-destructive" : "bg-card text-foreground"}`}><span className="flex items-center gap-1 font-medium">{pct === 100 && <Check className="h-4 w-4" />}{!f.documentList.length ? "Sin lista" : pct === 100 ? "Completa" : `${f.documentList.filter((d) => f.documents[d]).length}/${f.documentList.length} entregados`}</span></td>
    {docs.map((d) => {
      const required = f.documentList.includes(d);
      const received = f.documents[d] === true;
      return <td key={d} className={`${cell} text-center ${required && !received ? "bg-destructive/10" : "bg-card text-foreground"}`}>{required ? <Checkbox aria-label={`${d} — ${row.fullName}`} title={`${d}: ${received ? "Entregado" : "Pendiente"}`} checked={received} disabled={!p.canEditDocuments} onCheckedChange={(v) => setF({ ...f, documents: { ...f.documents, [d]: v === true } })} className="rounded-sm border-foreground/50 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background disabled:opacity-100" /> : <span className="text-muted-foreground">—</span>}</td>;
    })}
    <td className={`${cell} whitespace-nowrap`}>{row.phone}</td><td className={cell}><span className="whitespace-nowrap">{row.email}</span></td>
  </tr>;
}


type Ref = { source: "app" | "rec"; id: string | null; slot: number; company: string; position: string; supervisor: string; phone: string; email: string; comment: string };
function ReferencesEditor({ applicationId, name, initial }: { applicationId: string; name: string; initial: Ref[] }) {
  const saveRefs = useServerFn(saveTrainingReferences);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<Ref[]>(initial);
  const [busy, setBusy] = useState(false);
  const recSlots = refs.filter((r) => r.source === "rec").map((r) => r.slot);
  const nextSlot = recSlots.length < 10 ? Math.max(0, ...recSlots) + 1 : null;
  const blank = (slot: number): Ref => ({ source: "rec", id: null, slot, company: "", position: "", supervisor: "", phone: "", email: "", comment: "" });
  const set = (i: number, k: keyof Ref, v: string) => setRefs(refs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return <>
    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setRefs(initial.length ? initial : [blank(1)]); setOpen(true); }}><Pencil className="h-3 w-3" />Referencias ({initial.length})</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Referencias — {name}</DialogTitle></DialogHeader>
        <div className="space-y-3">{refs.map((r, i) => <div key={`${r.source}-${r.slot}`} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
          <p className="col-span-2 text-xs font-semibold text-muted-foreground">Referencia {i + 1} · {r.source === "app" ? "Aplicante" : "Reclutador"}{r.id === null && r.source === "rec" ? " (nueva)" : ""}</p>
          <Input placeholder="Nombre del jefe / referencia" aria-label={`Nombre referencia ${i + 1}`} value={r.supervisor} onChange={(e) => set(i, "supervisor", e.target.value)} />
          <Input placeholder="Empresa" aria-label={`Empresa referencia ${r.slot}`} value={r.company} onChange={(e) => set(i, "company", e.target.value)} />
          <Input placeholder="Puesto" aria-label={`Puesto referencia ${r.slot}`} value={r.position} onChange={(e) => set(i, "position", e.target.value)} />
          <Input placeholder={r.source === "rec" ? "Teléfono / contacto" : "Teléfono"} aria-label={`Teléfono referencia ${i + 1}`} value={r.phone} onChange={(e) => set(i, "phone", e.target.value)} />
          {r.source === "app" && <Input className="col-span-2" placeholder="Correo" aria-label={`Correo referencia ${i + 1}`} value={r.email} onChange={(e) => set(i, "email", e.target.value)} />}
          <Textarea className="col-span-2" rows={2} placeholder="Comments de esta referencia" aria-label={`Comments referencia ${i + 1}`} value={r.comment} onChange={(e) => set(i, "comment", e.target.value)} />
        </div>)}</div>
        {nextSlot !== null && <Button type="button" variant="outline" size="sm" onClick={() => setRefs([...refs, blank(nextSlot)])}><Plus className="h-4 w-4" />Agregar referencia</Button>}
        <DialogFooter><Button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await saveRefs({ data: { applicationId, references: refs } }); toast.success("Referencias guardadas"); setOpen(false); await qc.invalidateQueries({ queryKey: ["training-roster"] }); }
          catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
        }}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Guardar referencias</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function AddRequisition() {
  const create = useServerFn(createRequisition);
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ group: "ONLINE" as (typeof TRAINING_GROUPS)[number], branch: "Online", waveStart: "", requestDate: new Date().toISOString().slice(0, 10), spotType: "NEEDED" as (typeof SPOT_TYPES)[number], agreedSchedule: "", comments: "", quantity: 1 });
  const [saving, setSaving] = useState(false);
  if (!show) return <Button onClick={() => setShow(true)}>Agregar requisición</Button>;
  async function save() {
    if (!f.waveStart) { toast.error("Elige el inicio de wave."); return; }
    setSaving(true);
    try {
      await create({ data: { ...f, waveStart: f.waveStart, requestDate: f.requestDate || null } });
      toast.success(`${f.quantity} cupos agregados`);
      setShow(false);
      await qc.invalidateQueries({ queryKey: ["requisitions"] });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return <div className="flex w-full flex-wrap items-end gap-3 border border-border bg-card p-3">
    <label className="text-xs">LOB<Select value={f.group} onValueChange={(group) => setF({ ...f, group: group as typeof f.group, branch: branchOptions(group)[0] ?? "" })}><SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger><SelectContent>{TRAINING_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></label>
    <label className="text-xs">Sucursal<Select value={f.branch} onValueChange={(branch) => setF({ ...f, branch })}><SelectTrigger className="mt-1 w-48"><SelectValue placeholder="Elige sucursal" /></SelectTrigger><SelectContent>{branchOptions(f.group).map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></label>
    <label className="text-xs">Inicio de wave<Input type="date" className="mt-1 w-40" value={f.waveStart} onChange={(e) => setF({ ...f, waveStart: e.target.value })} /></label>
    <label className="text-xs">Request date<Input type="date" className="mt-1 w-40" value={f.requestDate} onChange={(e) => setF({ ...f, requestDate: e.target.value })} /></label>
    <label className="text-xs">Tipo<Select value={f.spotType} onValueChange={(spotType) => setF({ ...f, spotType: spotType as typeof f.spotType })}><SelectTrigger className="mt-1 w-32"><SelectValue /></SelectTrigger><SelectContent>{SPOT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></label>
    <label className="text-xs">Cupos<Input type="number" min={1} max={50} className="mt-1 w-20" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
    <div className="text-xs">Horario acordado<SchedulePicker value={f.agreedSchedule} onChange={(agreedSchedule) => setF({ ...f, agreedSchedule })} /></div>
    <label className="text-xs">Comments<Input className="mt-1 w-48" value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} /></label>
    <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}Guardar</Button>
    <Button variant="ghost" onClick={() => setShow(false)}>Cancelar</Button>
  </div>;
}

function StatusSummary({ groups, rows, open }: { groups: string[]; rows: { status: string; modality: string | null; countryCode: string | null }[]; open: { group: string }[] }) {
  const lines = groups.map((g) => ({ g, s: statusSummary(rows.filter((r) => trainingGroup(r.modality, r.countryCode) === g), open.filter((o) => o.group === g).length) }));
  if (groups.length > 1) lines.push({ g: "TOTAL", s: statusSummary(rows.filter((r) => groups.includes(trainingGroup(r.modality, r.countryCode))), open.filter((o) => groups.includes(o.group)).length) });
  const cols = lines[0]?.s.items ?? [];
  return <div className="overflow-x-auto border border-border bg-card"><table className="w-full text-sm"><thead><tr className="bg-muted/50 text-left text-xs"><th className="px-3 py-2">LOB</th><th className="px-3 py-2">Total</th>{cols.map((c) => <th key={c.status} className="px-3 py-2">{c.status}</th>)}</tr></thead>
    <tbody>{lines.map(({ g, s }) => <tr key={g} className={`border-t border-border ${g === "TOTAL" ? "font-semibold" : ""}`}><td className="px-3 py-2">{g}</td><td className="px-3 py-2">{s.total}</td>{s.items.map((i) => <td key={i.status} className="px-3 py-2"><span className="text-base font-semibold">{i.count}</span> <span className="text-xs text-muted-foreground">· {i.pct}%</span></td>)}</tr>)}</tbody></table></div>;
}
