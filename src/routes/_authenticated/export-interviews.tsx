import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportInterviewRows } from "@/lib/evaluations.functions";
import { COUNTRY_NAMES_ES, toCsv, type ExportRow } from "@/lib/interview-export";

export const Route = createFileRoute("/_authenticated/export-interviews")({
  head: () => ({
    meta: [
      { title: "E4CC — Exportar entrevistas" },
      { name: "description", content: "Descarga un CSV completo de las entrevistas de reclutamiento." },
      { property: "og:title", content: "E4CC — Exportar entrevistas" },
      { property: "og:description", content: "Descarga un CSV completo de las entrevistas de reclutamiento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExportInterviews,
});

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function ExportInterviews() {
  const fetchRows = useServerFn(exportInterviewRows);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [country, setCountry] = useState("all");
  const [modality, setModality] = useState("all");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState<{ rows: ExportRow[]; incomplete: number } | null>(null);

  async function generate() {
    setLoading(true); setReady(null);
    try {
      const r = await fetchRows({ data: { from, to, country: country === "all" ? "" : country, modality: modality === "all" ? "" : (modality as "ONLINE" | "PRESENCIAL") } });
      setReady(r as { rows: ExportRow[]; incomplete: number });
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }

  function download() {
    if (!ready) return;
    const name = `entrevistas_${from || "inicio"}_${to || "hoy"}.csv`;
    downloadBlob(new Blob([toCsv(ready.rows)], { type: "text/csv;charset=utf-8" }), name);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Exportar entrevistas</h1>
        <p className="text-sm text-muted-foreground">Una fila por evaluación. Sin filtros descarga todo.</p>
      </div>
      <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="from">Desde</Label><Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="to">Hasta</Label><Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>País</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger aria-label="País"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(COUNTRY_NAMES_ES).map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Modalidad</Label>
          <Select value={modality} onValueChange={setModality}>
            <SelectTrigger aria-label="Modalidad"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="ONLINE">Online</SelectItem>
              <SelectItem value="PRESENCIAL">Presencial</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void generate()} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Preparar archivo
        </Button>
        {ready && (
          <Button variant="outline" onClick={download}>
            <Download className="mr-2 h-4 w-4" /> Descargar CSV ({ready.rows.length})
          </Button>
        )}
      </div>
      {ready && ready.incomplete > 0 && (
        <p className="text-sm text-destructive">{ready.incomplete} entrevistas están incompletas (sin país, modalidad o sucursal). Complétalas desde la evaluación.</p>
      )}
    </div>
  );
}
