import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createAdmon, listAdmon } from "@/lib/admon.functions";
import { ADMON_BRANCHES, ADMON_COUNTRIES, ADMON_POSITIONS, STAGE_LABELS, type AdmonStage } from "@/lib/admon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admon/")({
  head: () => ({
    meta: [
      { title: "E4CC — Contratación ADMON" },
      { name: "description", content: "Candidatos administrativos y de ventas: screening, Gerente de Operaciones y entrevista técnica." },
      { property: "og:title", content: "E4CC — Contratación ADMON" },
      { property: "og:description", content: "Proceso de contratación ADMON en tres entrevistas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdmonList,
});

export const admonQuery = { queryKey: ["admon"] as const };
const TABS: { key: AdmonStage | "mine" | "all"; label: string }[] = [
  { key: "mine", label: "Mis pendientes" },
  { key: "screening", label: STAGE_LABELS.screening },
  { key: "operations", label: STAGE_LABELS.operations },
  { key: "technical", label: STAGE_LABELS.technical },
  { key: "hired", label: "Contratados" },
  { key: "rejected", label: "No continúan" },
  { key: "all", label: "Todos" },
];
export const stageTone: Record<AdmonStage, string> = {
  screening: "bg-secondary text-navy",
  operations: "bg-primary/15 text-primary",
  technical: "bg-accent text-accent-foreground",
  hired: "bg-emerald-100 text-emerald-800",
  rejected: "bg-muted text-muted-foreground",
};

export const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function AdmonList() {
  const list = useServerFn(listAdmon);
  const { data, isPending } = useQuery({ ...admonQuery, queryFn: () => list() });
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("mine");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const names = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s.name])), [data]);
  const mine = (c: NonNullable<typeof data>["candidates"][number]) =>
    c.stage === "screening" || (c.stage === "operations" && c.operations_interviewer === data?.me) || (c.stage === "technical" && c.technical_interviewer === data?.me);
  const count = (k: string) => (data?.candidates ?? []).filter((c) => (k === "all" ? true : k === "mine" ? mine(c) : c.stage === k)).length;
  const rows = (data?.candidates ?? []).filter((c) => {
    if (tab === "mine" ? !mine(c) : tab !== "all" && c.stage !== tab) return false;
    const t = q.trim().toLowerCase();
    return !t || `${c.full_name} ${c.email} ${c.position}`.toLowerCase().includes(t);
  });

  const who = (c: (typeof rows)[number]) =>
    c.stage === "operations" ? names.get(c.operations_interviewer ?? "") : c.stage === "technical" ? names.get(c.technical_interviewer ?? "") : c.stage === "screening" ? "Reclutamiento" : "—";

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contratación ADMON</h1>
          <p className="text-sm text-muted-foreground">Personal administrativo y de ventas. Separado de los coaches académicos.</p>
        </div>
        {data?.operationsOnly === false && <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/admon/leads"><Search /> Leads ADMON</Link></Button><Button onClick={() => setOpen(true)}><Plus /> Nuevo candidato</Button></div>}
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {(["screening", "operations", "technical"] as const).map((s) => (
          <li key={s} className="rounded-lg border bg-card p-3"><b>{STAGE_LABELS[s]}</b><span className="float-right text-muted-foreground">{count(s)}</span></li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("rounded-full border px-3 py-1 text-sm", tab === t.key ? "border-navy bg-navy text-navy-foreground" : "bg-card hover:bg-secondary")}>
            {t.label} <span className="opacity-70">{count(t.key)}</span>
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nombre, correo o puesto" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 pl-8" />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {isPending ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{data?.operationsOnly ? "No tienes entrevistas de Operaciones asignadas aquí." : "No hay candidatos aquí. Usa “Nuevo candidato” para empezar un screening."}</p>
          : <ul className="divide-y">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link to="/admon/$id" params={{ id: c.id }} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.position} · {c.country || "Sin país"}{c.branch ? ` · ${c.branch}` : ""}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{who(c) ?? "Sin asignar"}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", stageTone[c.stage])}>{STAGE_LABELS[c.stage]}</span>
                  </Link>
                </li>
              ))}
            </ul>}
      </div>
      <NewCandidate open={open} onOpenChange={setOpen} />
    </main>
  );
}

function NewCandidate({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useServerFn(createAdmon);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const empty = { full_name: "", email: "", phone: "", cv_link: "", country: "", branch: "", position: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    if (!f.full_name.trim() || !f.position) { toast.error("Nombre y puesto son obligatorios."); return; }
    setBusy(true);
    try {
      const { id } = await create({ data: f });
      await qc.invalidateQueries({ queryKey: admonQuery.queryKey });
      setF(empty); onOpenChange(false);
      await navigate({ to: "/admon/$id", params: { id } });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nuevo candidato ADMON</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label>Nombre completo *</Label><Input value={f.full_name} onChange={set("full_name")} /></div>
          <div><Label>Correo</Label><Input type="email" value={f.email} onChange={set("email")} /></div>
          <div><Label>Teléfono</Label><Input value={f.phone} onChange={set("phone")} /></div>
          <div className="sm:col-span-2"><Label>Link del CV</Label><Input value={f.cv_link} onChange={set("cv_link")} placeholder="https://" /></div>
          <div className="sm:col-span-2"><Label>Puesto *</Label>
            <select className={selectCls} value={f.position} onChange={set("position")}><option value="">Elegir…</option>{ADMON_POSITIONS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><Label>País</Label>
            <select className={selectCls} value={f.country} onChange={set("country")}><option value="">Elegir…</option>{ADMON_COUNTRIES.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><Label>Sucursal</Label>
            <select className={selectCls} value={f.branch} onChange={set("branch")}><option value="">Elegir…</option>{ADMON_BRANCHES.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <DialogFooter><Button onClick={() => void submit()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Crear y empezar screening</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
