import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REFERENCES, REFERENCE_CALL_RESULTS } from "@/lib/admon";
import { referenceProgress } from "@/lib/admon-training";
import { saveAdmonReferenceCalls, type AdmonCandidate } from "@/lib/admon.functions";

export function AdmonReferenceCalls({ candidate, onSaved }: { candidate: AdmonCandidate; onSaved?: () => void }) {
  const refs = Array.isArray(candidate.screening["references"]) ? candidate.screening["references"] as Record<string, unknown>[] : [];
  const [rows, setRows] = useState(() => refs.map((r, i) => ({ company: String(r["company"] ?? ""), boss: String(r["boss"] ?? ""), phone: String(r["phone"] ?? ""), result: candidate.reference_calls[i]?.result ?? "Pendiente", comment: candidate.reference_calls[i]?.comment ?? "" })));
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveAdmonReferenceCalls);
  const qc = useQueryClient();
  const progress = referenceProgress(rows, rows);
  const change = (i: number, key: keyof (typeof rows)[number], value: string) => setRows((p) => p.map((r, n) => n === i ? { ...r, [key]: value } : r));
  async function submit() {
    setBusy(true);
    try {
      await save({ data: { id: candidate.id, references: rows.map(({ company, boss, phone }) => ({ company, boss, phone })), calls: rows.map(({ result, comment }) => ({ result: result as (typeof REFERENCE_CALL_RESULTS)[number], comment })) } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["admon"] }), qc.invalidateQueries({ queryKey: ["admon-training"] })]);
      toast.success("Referencias y llamadas guardadas"); onSaved?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Referencias completas: {progress.done}/{progress.total}</p>
    <fieldset disabled={busy} className="space-y-4">
      {rows.map((r, i) => <div key={i} className="space-y-3 border-b pb-4">
        <h3 className="text-sm font-semibold">Referencia {i + 1}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Nombre del contacto<Input aria-label={`Contacto referencia ${i + 1}`} value={r.boss} onChange={(e) => change(i, "boss", e.target.value)} /></label>
          <label className="space-y-1 text-sm">Teléfono<div className="flex gap-2"><Input aria-label={`Teléfono referencia ${i + 1}`} type="tel" value={r.phone} onChange={(e) => change(i, "phone", e.target.value)} />{r.phone && <Button variant="outline" size="icon" title="Llamar referencia" asChild><a href={`tel:${r.phone.replace(/[^+\d]/g, "")}`}><Phone /></a></Button>}</div></label>
          <label className="space-y-1 text-sm">Empresa y tiempo trabajado<Input aria-label={`Empresa referencia ${i + 1}`} value={r.company} onChange={(e) => change(i, "company", e.target.value)} /></label>
          <label className="space-y-1 text-sm">Resultado<select aria-label={`Resultado referencia ${i + 1}`} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={r.result} onChange={(e) => change(i, "result", e.target.value)}>{REFERENCE_CALL_RESULTS.map((v) => <option key={v}>{v}</option>)}</select></label>
        </div>
        <label className="block space-y-1 text-sm">Comentarios de la llamada<Textarea aria-label={`Comentarios referencia ${i + 1}`} rows={2} value={r.comment} onChange={(e) => change(i, "comment", e.target.value)} /></label>
      </div>)}
      {rows.length < MAX_REFERENCES && <Button variant="outline" size="sm" onClick={() => setRows((p) => [...p, { company: "", boss: "", phone: "", result: "Pendiente", comment: "" }])}><Plus /> Agregar referencia</Button>}
      <div><Button disabled={busy || rows.length === 0} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar referencias</Button></div>
    </fieldset>
  </div>;
}