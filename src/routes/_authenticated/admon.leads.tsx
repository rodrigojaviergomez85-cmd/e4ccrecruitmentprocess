import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { admonLeadCatalogs, listAdmonLeads, startAdmonLeadScreening, syncAdmonLeads, type AdmonLead } from "@/lib/admon-leads.functions";
import { safeLink } from "@/lib/admon-leads";

const initial = { search: "", country: "", branch: "", position: "", cvFilter: "", recent: true, page: 0 };
const leadsOptions = (filters: typeof initial) => queryOptions({ queryKey: ["admon-leads", filters], queryFn: () => listAdmonLeads({ data: filters }), staleTime: 5 * 60000 });
const catalogOptions = queryOptions({ queryKey: ["admon-lead-catalogs"], queryFn: () => admonLeadCatalogs(), staleTime: 15 * 60000 });
const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";

export const Route = createFileRoute("/_authenticated/admon/leads")({
  head: () => ({ meta: [
    { title: "E4CC — Leads ADMON" },
    { name: "description", content: "Leads administrativos y de ventas, CV, experiencia y seguimiento de Screening E4CC." },
    { property: "og:title", content: "E4CC — Leads ADMON" },
    { property: "og:description", content: "Postulaciones ADMON separadas por puesto, país y sucursal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(leadsOptions(initial)), context.queryClient.ensureQueryData(catalogOptions)]),
  component: AdmonLeads,
  errorComponent: ({ error, reset }) => <main className="space-y-4 p-8"><h1 className="text-2xl font-semibold">Leads ADMON</h1><p role="alert">{error instanceof Error ? error.message : "No se pudo cargar Leads ADMON."}</p><Button onClick={reset}><RefreshCw /> Reintentar</Button><Link to="/admon" className="ml-4 underline">Volver a ADMON</Link></main>,
});

function AdmonLeads() {
  useSuspenseQuery(leadsOptions(initial));
  const { data: catalogs } = useSuspenseQuery(catalogOptions);
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdmonLead | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const list = useServerFn(listAdmonLeads), sync = useServerFn(syncAdmonLeads), start = useServerFn(startAdmonLeadScreening);
  const qc = useQueryClient(), navigate = useNavigate();
  useEffect(() => { const timer = setTimeout(() => setFilters((f) => ({ ...f, search, page: 0 })), 350); return () => clearTimeout(timer); }, [search]);
  const { data, isFetching, error } = useQuery({ ...leadsOptions(filters), queryFn: () => list({ data: filters }) });
  const setFilter = (key: "country" | "branch" | "position" | "cvFilter", value: string) => setFilters((f) => ({ ...f, [key]: value, page: 0 }));
  async function refresh() {
    setSyncing(true);
    try { const result = await sync(); await Promise.all([qc.invalidateQueries({ queryKey: ["admon-leads"] }), qc.invalidateQueries({ queryKey: ["admon-lead-catalogs"] })]); toast.success(`${result.count.toLocaleString("es")} leads sincronizados.`); }
    catch (e) { toast.error((e as Error).message); } finally { setSyncing(false); }
  }
  async function screening(lead: AdmonLead) {
    setStarting(lead.id);
    try { const { id } = await start({ data: { id: lead.id } }); await Promise.all([qc.invalidateQueries({ queryKey: ["admon"] }), qc.invalidateQueries({ queryKey: ["admon-leads"] })]); await navigate({ to: "/admon/$id", params: { id } }); }
    catch (e) { toast.error((e as Error).message); } finally { setStarting(null); }
  }
  const total = data?.total ?? 0;
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-5">
    <Link to="/admon" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Contratación ADMON</Link>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Leads ADMON</h1><p className="text-sm text-muted-foreground">{data?.importedAt ? `Última sincronización: ${new Date(data.importedAt).toLocaleString("es", { timeZone: "America/El_Salvador" })}` : "Sin sincronización"}</p></div>
      <Button onClick={() => void refresh()} disabled={syncing}>{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} {syncing ? "Sincronizando…" : "Sincronizar hoja"}</Button>
    </header>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label htmlFor="admon-position">Puesto</Label><select id="admon-position" className={selectClass} value={filters.position} onChange={(e) => setFilter("position", e.target.value)}><option value="">Todos los puestos</option>{catalogs.position.map((v) => <option key={v}>{v}</option>)}</select></div>
      <div><Label htmlFor="admon-country">País</Label><select id="admon-country" className={selectClass} value={filters.country} onChange={(e) => setFilter("country", e.target.value)}><option value="">Todos los países</option>{catalogs.country.map((v) => <option key={v}>{v}</option>)}</select></div>
      <div><Label htmlFor="admon-branch">Sucursal</Label><select id="admon-branch" className={selectClass} value={filters.branch} onChange={(e) => setFilter("branch", e.target.value)}><option value="">Todas las sucursales</option>{catalogs.branch.map((v) => <option key={v}>{v}</option>)}</select></div>
      <div><Label htmlFor="admon-filter">Filtro CV</Label><select id="admon-filter" className={selectClass} value={filters.cvFilter} onChange={(e) => setFilter("cvFilter", e.target.value)}><option value="">Todos los resultados</option><option value="__empty">Sin resultado</option>{catalogs.cvFilter.map((v) => <option key={v}>{v}</option>)}</select></div>
      <div><Label htmlFor="admon-period">Fecha de ingreso</Label><select id="admon-period" className={selectClass} value={filters.recent ? "recent" : "all"} onChange={(e) => setFilters((f) => ({ ...f, recent: e.target.value === "recent", page: 0 }))}><option value="recent">Últimos 45 días</option><option value="all">Todo el historial</option></select></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar lead por nombre o correo" placeholder="Buscar nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">{isFetching && <Loader2 className="h-4 w-4 animate-spin" />}{total.toLocaleString("es")} leads</p>
    </div>
    {error && <p role="alert" className="text-destructive">{error.message}</p>}
    {!data && isFetching ? <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div> : !data?.rows.length ? <div className="space-y-3 py-12 text-center"><p className="text-muted-foreground">{data?.importedAt ? "No hay leads con estos filtros." : "Todavía no hay leads sincronizados."}</p>{!data?.importedAt && <Button onClick={() => void refresh()} disabled={syncing}><RefreshCw /> Sincronizar hoja</Button>}</div> : <ul className="divide-y border-y">
      {data.rows.map((lead) => <li key={lead.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0"><p className="break-words font-semibold">{lead.full_name}</p><p className="break-words text-sm text-muted-foreground">{lead.email || "Sin correo"}</p><p className="text-sm">{lead.phone}</p><p className="mt-1 text-xs text-muted-foreground">{lead.submitted_at ? new Date(lead.submitted_at).toLocaleString("es", { timeZone: "America/El_Salvador" }) : "Sin fecha de ingreso"}</p></div>
        <div className="min-w-0 text-sm"><p className="break-words">{lead.position}</p><p className="break-words text-muted-foreground">{lead.country} · {lead.branch || "Sin sucursal"}</p><p className="mt-1">Edad: {lead.age || "—"}</p><p className="break-words">Experiencia: {lead.experience_time || "—"}</p></div>
        <div className="min-w-0 space-y-1 text-sm"><p className="break-words"><span className="text-muted-foreground">Filtro CV: </span>{lead.cv_filter || "Sin resultado"}</p><p className="break-words"><span className="text-muted-foreground">Estado hoja: </span>{lead.contact_status || "Sin resultado"}</p><div className="flex flex-wrap gap-3 pt-1"><LeadLink href={lead.cv_link} label="CV" /><LeadLink href={lead.video_link} label="Video de ventas" /></div></div>
        <div className="flex items-center gap-2 lg:flex-col lg:items-stretch"><Button size="sm" variant="outline" onClick={() => setSelected(lead)}><FileText /> Ver información</Button><Button size="sm" disabled={starting !== null} onClick={() => void screening(lead)}>{starting === lead.id ? <Loader2 className="animate-spin" /> : <ArrowRight />}{lead.candidate_id ? "Abrir candidato" : "Iniciar Screening"}</Button></div>
      </li>)}
    </ul>}
    <footer className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{total ? `${filters.page * 50 + 1}–${Math.min((filters.page + 1) * 50, total)} de ${total.toLocaleString("es")}` : "0 leads"}</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" title="Página anterior" aria-label="Página anterior" disabled={filters.page === 0 || isFetching} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft /></Button><Button variant="outline" size="icon" title="Página siguiente" aria-label="Página siguiente" disabled={(filters.page + 1) * 50 >= total || isFetching} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}><ChevronRight /></Button></div></footer>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{selected?.full_name}</DialogTitle></DialogHeader>{selected && <div className="space-y-4 text-sm"><p>{selected.position} · {selected.country} · {selected.branch}</p><p className="break-words">{selected.email} · {selected.phone}</p><div className="grid grid-cols-2 gap-3"><p><b>Edad</b><br />{selected.age || "—"}</p><p><b>Tiempo de experiencia</b><br />{selected.experience_time || "—"}</p></div><div><b>Experiencia en ventas</b><p className="mt-1 whitespace-pre-wrap break-words">{selected.experience || "Sin información"}</p></div><div><b>Comentarios de la hoja</b><p className="mt-1 whitespace-pre-wrap break-words">{selected.comments || "Sin comentarios"}</p></div><div className="flex flex-wrap gap-4"><LeadLink href={selected.cv_link} label="CV actualizado" /><LeadLink href={selected.video_link} label="Video de ventas" /><LeadLink href={selected.presentation_link} label="Video de presentación" /></div></div>}<DialogFooter><Button disabled={starting !== null} onClick={() => { if (selected) void screening(selected); }}><ArrowRight />{selected?.candidate_id ? "Abrir candidato" : "Iniciar Screening"}</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}

function LeadLink({ href, label }: { href: string; label: string }) { const url = safeLink(href); return url ? <a className="inline-flex items-center gap-1 text-primary underline" href={url} target="_blank" rel="noreferrer">{label}<ExternalLink className="h-3 w-3" /></a> : null; }