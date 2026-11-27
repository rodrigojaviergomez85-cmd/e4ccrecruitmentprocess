import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ChevronDown, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createAdmon, listAdmon, type AdmonCandidate } from "@/lib/admon.functions";
import { ADMON_BRANCHES, ADMON_COUNTRIES, ADMON_POSITIONS, STAGE_LABELS, matchesResult, type AdmonResultFilter, type AdmonStage } from "@/lib/admon";
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
type ProcessStage = "screening" | "operations" | "technical";
type ListView = "mine" | "all" | "rejected";
const STAGES: ProcessStage[] = ["screening", "operations", "technical"];
const VIEWS: { key: ListView; label: string }[] = [
  { key: "mine", label: "Mis pendientes" },
  { key: "all", label: "Todos" },
  { key: "rejected", label: "No continúan" },
];
const RESULTS: { key: AdmonResultFilter; label: string; approved: boolean }[] = [
  { key: "interviewed", label: "Entrevistados", approved: false },
  { key: "passed_screening", label: "Aprobados al segundo filtro", approved: true },
  { key: "passed_operations", label: "Aprobados al tercer filtro", approved: true },
  { key: "approved_training", label: "Aprobados para Training", approved: true },
];
export const stageTone: Record<AdmonStage, string> = {
  screening: "bg-secondary text-secondary-foreground",
  operations: "bg-secondary text-navy",
  technical: "bg-accent text-accent-foreground",
  hired: "bg-success/10 text-success",
  rejected: "bg-muted text-muted-foreground",
};

export const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function AdmonList() {
  const list = useServerFn(listAdmon);
  const { data, isPending } = useQuery({ ...admonQuery, queryFn: () => list() });
  const [view, setView] = useState<ListView>("mine");
  const [stageFilter, setStageFilter] = useState<ProcessStage | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const candidates = data?.candidates ?? [];
  const names = useMemo(() => new Map((data?.staff ?? []).map((s) => [s.id, s.name])), [data]);
  const mine = (c: AdmonCandidate) =>
    c.stage === "screening" || (c.stage === "operations" && c.operations_interviewer === data?.me) || (c.stage === "technical" && c.technical_interviewer === data?.me);
  const inView = (c: AdmonCandidate, selected: ListView) =>
    selected === "all" ? true : selected === "mine" ? mine(c) : c.stage === "rejected";
  const viewCount = (selected: ListView) => candidates.filter((c) => inView(c, selected)).length;
  const stageCount = (selected: ProcessStage) => candidates.filter((c) => c.stage === selected).length;
  const resultCount = (selected: AdmonResultFilter) => candidates.filter((c) => matchesResult(c, selected)).length;
  const rows = candidates.filter((c) => {
    if (!inView(c, view) || (stageFilter && c.stage !== stageFilter)) return false;
    const term = q.trim().toLowerCase();
    return !term || `${c.full_name} ${c.email} ${c.position}`.toLowerCase().includes(term);
  });

  const who = (c: AdmonCandidate) => {
    if (c.stage === "screening") return names.get(c.screening_by ?? "") ?? "Reclutamiento";
    if (c.stage === "operations") return names.get(c.operations_interviewer ?? "") ?? "Sin asignar";
    const technical = names.get(c.technical_interviewer ?? "");
    if (technical) return technical;
    if (c.stage === "technical") return "Sin asignar";
    return names.get(c.operations_interviewer ?? "") ?? names.get(c.screening_by ?? "") ?? "—";
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-navy sm:text-3xl">Contratación ADMON</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Personal administrativo y ventas</p>
        </div>
        {data?.operationsOnly === false && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" asChild className="flex-1 sm:flex-none">
              <Link to="/admon/leads"><Search /> Leads ADMON</Link>
            </Button>
            <Button variant="outline" asChild className="flex-1 sm:flex-none"><Link to="/admon/training">Training ADMON <ArrowRight /></Link></Button>
            <Button onClick={() => setOpen(true)} className="flex-1 sm:flex-none"><Plus /> Nuevo candidato</Button>
          </div>
        )}
      </header>

      <section aria-label="Filtrar por etapa" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STAGES.map((stage, index) => {
          const selected = stageFilter === stage;
          return (
            <button
              key={stage}
              type="button"
              aria-pressed={selected}
              onClick={() => setStageFilter(selected ? null : stage)}
              className={cn(
                "rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-navy/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-navy bg-secondary ring-1 ring-navy",
              )}
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className={cn("block text-sm font-semibold", selected ? "text-navy" : "text-foreground")}>{STAGE_LABELS[stage].slice(3)}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">Etapa {index + 1} de 3</span>
                </span>
                <span className={cn("text-2xl font-semibold tabular-nums", selected ? "text-navy" : "text-foreground")}>{stageCount(stage)}</span>
              </span>
            </button>
          );
        })}
      </section>

      <details className="group rounded-lg border bg-card shadow-sm" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-navy [&::-webkit-details-marker]:hidden">
          Resultados del proceso
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 border-t lg:grid-cols-4">
          {RESULTS.map((result) => (
            <div key={result.key} className="border-r border-t px-4 py-3 last:border-r-0 lg:border-t-0">
              <p className={cn("text-2xl font-semibold tabular-nums", result.approved ? "text-success" : "text-foreground")}>{resultCount(result.key)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{result.label}</p>
            </div>
          ))}
        </div>
      </details>

      <section aria-label="Herramientas de candidatos" className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:flex">
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={view === item.key}
                onClick={() => setView(item.key)}
                className={cn(
                  "h-9 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
                  view === item.key ? "bg-navy text-navy-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground",
                )}
              >
                {item.label} <span className="tabular-nums opacity-75">{viewCount(item.key)}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Buscar candidatos" placeholder="Buscar nombre, correo o puesto" value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-sm">
          <span aria-live="polite" className="font-medium text-foreground">{rows.length} {rows.length === 1 ? "resultado visible" : "resultados visibles"}</span>
          {stageFilter && (
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-navy">
              Etapa: {STAGE_LABELS[stageFilter].slice(3)}
              <button type="button" onClick={() => setStageFilter(null)} className="rounded p-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Quitar filtro de etapa">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      </section>

      <section aria-label="Lista de candidatos" className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {isPending ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {q || stageFilter ? "No hay candidatos con estos filtros." : data?.operationsOnly ? "No tienes entrevistas asignadas aquí." : "No hay candidatos aquí. Usa “Nuevo candidato” para empezar un screening."}
          </p>
        ) : (
          <>
            <div className="hidden md:block">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-[29%] px-4">Candidato y puesto</TableHead>
                    <TableHead className="w-[20%] px-4">País o sucursal</TableHead>
                    <TableHead className="w-[17%] px-4">Etapa actual</TableHead>
                    <TableHead className="w-[19%] px-4">Responsable</TableHead>
                    <TableHead className="w-[15%] px-4 text-right">Expediente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="px-4 py-3">
                        <p className="break-words text-sm font-semibold text-navy">{c.full_name}</p>
                        <p className="mt-0.5 break-words text-sm text-muted-foreground">{c.position}</p>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        <p className={cn("break-words", !c.country && "text-muted-foreground")}>{c.country || "País pendiente"}</p>
                        {c.branch && <p className="mt-0.5 break-words text-sm text-muted-foreground">{c.branch}</p>}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", stageTone[c.stage])}>{STAGE_LABELS[c.stage]}</span>
                        <ReferenceProgress candidate={c} />
                      </TableCell>
                      <TableCell className="px-4 py-3 break-words text-sm">{who(c)}</TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/admon/$id" params={{ id: c.id }}>Ver expediente <ArrowRight /></Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y md:hidden">
              {rows.map((c) => (
                <article key={c.id} className="space-y-3 p-4">
                  <div>
                    <h2 className="break-words text-base font-semibold text-navy">{c.full_name}</h2>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">{c.position}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">País o sucursal</dt>
                      <dd className="mt-1 break-words">{c.country || "País pendiente"}</dd>
                      {c.branch && <dd className="break-words text-muted-foreground">{c.branch}</dd>}
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Etapa actual</dt>
                      <dd className="mt-1"><span className={cn("inline-flex rounded-md px-2 py-1 text-xs font-medium", stageTone[c.stage])}>{STAGE_LABELS[c.stage]}</span></dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Responsable</dt>
                      <dd className="mt-1 break-words">{who(c)}</dd>
                    </div>
                    <div><ReferenceProgress candidate={c} /></div>
                  </dl>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/admon/$id" params={{ id: c.id }}>Ver expediente <ArrowRight /></Link>
                  </Button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      <NewCandidate open={open} onOpenChange={setOpen} />
    </main>
  );
}

function ReferenceProgress({ candidate }: { candidate: AdmonCandidate }) {
  const total = ((candidate.screening as { references?: unknown[] })?.references ?? []).length;
  const done = (candidate.reference_calls ?? []).filter((r) => r.result && r.result !== "Pendiente").length;
  if (total === 0 || candidate.screening_decision !== "Pasa") return null;
  return (
    <span className={cn("mt-2 block w-fit rounded-md border px-2 py-1 text-xs", done >= total ? "border-success/30 text-success" : "border-warning/40 text-warning-foreground")}>
      Referencias {done}/{total}
    </span>
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
