import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createRequisition, listRequisitions, listTrainingRoster, updateRequisition, updateTrainingRow } from "@/lib/training.functions";
import { SPOT_TYPES, TRAINING_GROUPS, TRAINING_STATUSES, approvalBlocked, requisitionSummary, documentsPercent, trainingGroup } from "@/lib/training";

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
  if (d.includes("both sides")) return d.split(",")[0] + " · ambos lados";
  if (d.includes("diploma")) return "Título académico";
  if (d.startsWith("Agreement:")) return "Convenio firmado";
  const match = d.match(/\(([^)]+)\)/);
  return match?.[1] ?? d;
};

function TrainingPage() {
  const list = useServerFn(listTrainingRoster);
  const { data, isLoading, error } = useQuery({ queryKey: ["training-roster"], queryFn: () => list() });
  const [lob, setLob] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const rows = data?.rows ?? [];
  const filtered = rows.filter((r) => (lob === "all" || trainingGroup(r.modality, r.countryCode) === lob) && (status === "all" || r.status === status) && `${r.fullName} ${r.email} ${r.branch}`.toLowerCase().includes(search.toLowerCase()));
  const groupNames = [...TRAINING_GROUPS, ...(rows.some((r) => trainingGroup(r.modality, r.countryCode) === "OTROS") ? ["OTROS"] : [])];
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
          <BrandMark /><h1 className="text-xl font-semibold">Training Tracker</h1>
          {!data?.trainingOnly && <Button asChild variant="ghost" size="sm" className="ml-auto"><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link></Button>}
        </div>
      </header>
      <main className="space-y-5 px-4 py-5 sm:px-6">
        <Tabs value={lob} onValueChange={setLob}>
          <div className="overflow-x-auto">
            <TabsList className="h-auto justify-start rounded-none border-b bg-transparent p-0">
              {["all", ...groupNames].map((g) => <TabsTrigger key={g} value={g} className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                {g === "all" ? "TODOS" : g}<span className="text-xs text-muted-foreground">{rows.filter((r) => g === "all" || trainingGroup(r.modality, r.countryCode) === g).length}</span>
              </TabsTrigger>)}
            </TabsList>
          </div>
        </Tabs>
        <Requisitions lob={lob} candidates={rows} />
        <div className="flex flex-wrap items-center gap-3">
          <Input aria-label="Buscar candidato" placeholder="Buscar nombre, correo o sucursal" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-80" />
          <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Filtrar estado" className="w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem>{TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <span className="text-sm text-muted-foreground">{filtered.length} candidatos</span>
        </div>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {data && !filtered.length && <p className="py-8 text-muted-foreground">No hay candidatos en esta lista.</p>}
        {data && groupNames.map((group) => {
          const groupRows = filtered.filter((r) => trainingGroup(r.modality, r.countryCode) === group);
          if (!groupRows.length) return null;
          const docs = [...new Set(groupRows.flatMap((r) => r.documentList))];
          return <section key={group} className="space-y-2">
            <div className="flex items-center gap-3"><h2 className="text-base font-semibold">{group}</h2><span className="text-sm text-muted-foreground">{groupRows.length}</span></div>
            <div className="max-h-[65vh] overflow-auto border border-border">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20 bg-muted text-foreground">
                  <tr>{["Candidato", "Estado", "Sucursal", "Año / Mes", "Inicio de wave", "Días restantes", "Request date", "Día de contratación", "Horario acordado", "Trainer", "Comments", "Llamada de referencia", "Detalles de referencias", "Documentación", ...docs.map(documentLabel), "Teléfono", "Email", ""].map((h, i) => <th key={`${i}-${h}`} scope="col" className={`border-b border-r border-border px-3 py-3 text-left font-semibold ${i === 0 ? "sticky left-0 z-30 min-w-56 bg-muted" : i >= 14 && i < 14 + docs.length ? "min-w-32 max-w-40 text-center" : "min-w-36"}`} title={i >= 14 && i < 14 + docs.length ? docs[i - 14] : undefined}>{h}</th>)}</tr>
                </thead>
                <tbody>{groupRows.map((row) => <RosterRow key={row.id} row={row} docs={docs} permissions={data} />)}</tbody>
              </table>
            </div>
          </section>;
        })}
      </main>
    </div>
  );
}

function RosterRow({ row, docs, permissions: p }: { row: Row; docs: string[]; permissions: Permissions }) {
  const update = useServerFn(updateTrainingRow);
  const qc = useQueryClient();
  const [f, setF] = useState(row);
  const [baseline, setBaseline] = useState(row);
  const [saving, setSaving] = useState(false);
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
    <td className={`${cell} sticky left-0 z-10 bg-card`}><p className="max-w-56 font-semibold">{row.fullName}</p><p className="mt-1 text-xs text-muted-foreground">{row.country}</p></td>
    <td className={cell}><Select value={f.status} disabled={!p.canEditTraining} onValueChange={(status) => setF({ ...f, status })}><SelectTrigger aria-label={`Estado — ${row.fullName}`} className="w-56"><SelectValue /></SelectTrigger><SelectContent>{TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></td>
    <td className={cell}>{row.branch || "—"}</td>
    <td className={cell}>{f.waveStart ? `${f.waveStart.slice(0, 4)} / ${f.waveStart.slice(5, 7)}` : "—"}</td>
    <td className={cell}>{dateInput("waveStart", "Inicio de wave")}</td>
    <td className={cell}>{daysUntil(f.waveStart) ?? "—"}</td>
    <td className={cell}>{dateInput("requestDate", "Request date")}</td>
    <td className={cell}>{dateInput("hiringDate", "Día de contratación")}</td>
    <td className={cell}>{textInput("agreedSchedule", "Horario", p.canEditTraining)}</td>
    <td className={cell}>{row.trainer || "—"}</td>
    <td className={cell}>{textInput("comments", "Comments", p.canEditTraining)}</td>
    <td className={`${cell} ${blocked ? "bg-destructive/10 text-destructive" : "bg-card text-foreground"}`}><Select value={f.referenceCall} disabled={!p.canEditReferences} onValueChange={(referenceCall) => setF({ ...f, referenceCall })}><SelectTrigger aria-label={`Llamada de referencia — ${row.fullName}`} className="w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendiente · Recruitment</SelectItem><SelectItem value="done">Realizada · recomendado</SelectItem><SelectItem value="not_recommended">Realizada · no recomendado</SelectItem></SelectContent></Select><p className="mt-2 text-xs">{blocked ? "Aprobación pendiente" : "Referencias aprobadas"} · {row.referencesVerified}/{row.referencesOnFile}</p></td>
    <td className={cell}>{textInput("referenceDetails", "Detalles de referencias", p.canEditReferences)}</td>
    <td className={`${cell} ${pct < 100 && f.documentList.length ? "bg-destructive/10 text-destructive" : "bg-card text-foreground"}`}><span className="flex items-center gap-1 font-medium">{pct === 100 && <Check className="h-4 w-4" />}{!f.documentList.length ? "Sin lista" : pct === 100 ? "Completa" : `${f.documentList.filter((d) => f.documents[d]).length}/${f.documentList.length} entregados`}</span></td>
    {docs.map((d) => {
      const required = f.documentList.includes(d);
      const received = f.documents[d] === true;
      return <td key={d} className={`${cell} text-center ${required && !received ? "bg-destructive/10" : "bg-card text-foreground"}`}>{required ? <Checkbox aria-label={`${d} — ${row.fullName}`} title={`${d}: ${received ? "Entregado" : "Pendiente"}`} checked={received} disabled={!p.canEditDocuments} onCheckedChange={(v) => setF({ ...f, documents: { ...f.documents, [d]: v === true } })} className="rounded-sm border-foreground/50 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background disabled:opacity-100" /> : <span className="text-muted-foreground">—</span>}</td>;
    })}
    <td className={`${cell} whitespace-nowrap`}>{row.phone}</td><td className={cell}><span className="whitespace-nowrap">{row.email}</span></td>
    <td className={cell}><Button variant={dirty ? "default" : "ghost"} size="icon" aria-label={`Guardar — ${row.fullName}`} title="Guardar" onClick={() => void save()} disabled={!dirty || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button></td>
  </tr>;
}

const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

function Requisitions({ lob, candidates }: { lob: string; candidates: Row[] }) {
  const list = useServerFn(listRequisitions);
  const create = useServerFn(createRequisition);
  const update = useServerFn(updateRequisition);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["requisitions"], queryFn: () => list() });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const empty = { group: lob !== "all" && lob !== "OTROS" ? lob : "ONLINE", branch: "", waveStart: "", requestDate: new Date().toISOString().slice(0, 10), spotType: "NEEDED" as (typeof SPOT_TYPES)[number], agreedSchedule: "", comments: "", quantity: 1 };
  const [form, setForm] = useState(empty);
  const spots = (data?.spots ?? []).filter((s) => lob === "all" || s.group === lob);
  const sum = requisitionSummary(spots);
  const taken = new Set((data?.spots ?? []).map((s) => s.filledApplicationId).filter(Boolean));
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["requisitions"] }), qc.invalidateQueries({ queryKey: ["training-roster"] })]);
  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  if (!data) return null;
  const cell = "border-b border-r border-border px-3 py-2 align-middle";
  return <section className="space-y-3 border border-border bg-card p-4">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-base font-semibold">Requisiciones</h2>
      <span className="text-sm text-muted-foreground">{sum.total} spots · {sum.filled} contratados · <span className={sum.open ? "font-medium text-destructive" : ""}>{sum.open} abiertos</span></span>
      {data.canManage && <Button size="sm" variant={open ? "ghost" : "default"} className="ml-auto" onClick={() => { setForm(empty); setOpen(!open); }}>{open ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{open ? "Cancelar" : "Nueva requisición"}</Button>}
    </div>
    {open && <form className="grid gap-3 border border-border bg-muted/40 p-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void run("new", () => create({ data: { ...form, waveStart: form.waveStart || null, requestDate: form.requestDate || null } }), "Requisición agregada").then(() => setOpen(false)); }}>
      <label className="space-y-1 text-sm">LOB<Select value={form.group} onValueChange={(group) => setForm({ ...form, group })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRAINING_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1 text-sm">Sucursal<Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} placeholder="San José Pinula" /></label>
      <label className="space-y-1 text-sm">Inicio de wave<Input type="date" value={form.waveStart} onChange={(e) => setForm({ ...form, waveStart: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Request date<Input type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} /></label>
      <label className="space-y-1 text-sm">Tipo<Select value={form.spotType} onValueChange={(v) => setForm({ ...form, spotType: v as typeof form.spotType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SPOT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></label>
      <label className="space-y-1 text-sm">Cantidad de spots<Input type="number" min={1} max={50} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
      <label className="space-y-1 text-sm">Horario acordado<Input value={form.agreedSchedule} onChange={(e) => setForm({ ...form, agreedSchedule: e.target.value })} placeholder="PM + WKNDS" /></label>
      <label className="space-y-1 text-sm lg:col-span-1">Comments<Input value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></label>
      <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={busy === "new"}>{busy === "new" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agregar {form.quantity} spot{form.quantity > 1 ? "s" : ""}</Button></div>
    </form>}
    {spots.length ? <div className="max-h-96 overflow-auto border border-border"><table className="w-full border-separate border-spacing-0 text-sm">
      <thead className="sticky top-0 z-10 bg-muted"><tr>{["LOB", "Sucursal", "Inicio de wave", "Request date", "Tipo", "Horario", "Comments", "Candidato contratado", ""].map((h) => <th key={h} className="border-b border-r border-border px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
      <tbody>{spots.map((s) => {
        const options = candidates.filter((c) => !taken.has(c.id) && (s.group === trainingGroup(c.modality, c.countryCode)));
        return <tr key={s.id} className={s.filledApplicationId ? "bg-card" : "bg-destructive/5"}>
          <td className={cell}>{s.group}</td><td className={cell}>{s.branch || "—"}</td><td className={cell}>{fmtDate(s.waveStart)}</td><td className={cell}>{fmtDate(s.requestDate)}</td>
          <td className={cell}><span className={`px-2 py-0.5 text-xs font-medium ${s.spotType === "BACKUP" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{s.spotType}</span></td>
          <td className={cell}>{s.agreedSchedule || "—"}</td><td className={`${cell} max-w-64`}><span className="line-clamp-2" title={s.comments}>{s.comments || "—"}</span></td>
          <td className={cell}>{s.filledApplicationId ? <span className="flex items-center gap-1 font-medium"><Check className="h-4 w-4" />{s.filledName}</span> : data.canManage ? <Select value="" disabled={busy === s.id} onValueChange={(applicationId) => void run(s.id, () => update({ data: { id: s.id, action: "fill", applicationId } }), "Spot llenado")}><SelectTrigger aria-label="Asignar candidato" className="w-56"><SelectValue placeholder={options.length ? "Spot abierto · asignar" : "Sin candidatos disponibles"} /></SelectTrigger><SelectContent>{options.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}</SelectContent></Select> : <span className="text-destructive">Spot abierto</span>}</td>
          <td className={cell}>{data.canManage && (s.filledApplicationId
            ? <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => void run(s.id, () => update({ data: { id: s.id, action: "release" } }), "Spot liberado")}>Liberar</Button>
            : <Button size="icon" variant="ghost" aria-label="Eliminar spot" disabled={busy === s.id} onClick={() => { if (confirm("¿Eliminar este spot?")) void run(s.id, () => update({ data: { id: s.id, action: "delete" } }), "Spot eliminado"); }}><Trash2 className="h-4 w-4" /></Button>)}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p className="text-sm text-muted-foreground">No hay requisiciones{lob !== "all" ? ` para ${lob}` : ""}.</p>}
  </section>;
}
