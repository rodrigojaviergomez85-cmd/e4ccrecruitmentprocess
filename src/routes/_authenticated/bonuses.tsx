import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listBonuses, setCertificationDate, type BonusRow } from "@/lib/bonuses.functions";
import { nextCutoff } from "@/lib/bonuses";

export const Route = createFileRoute("/_authenticated/bonuses")({
  head: () => ({
    meta: [
      { title: "E4CC — Bonos por pagar" },
      { name: "description", content: "Hiring bonus y bonos de referidos con cuotas y fechas de pago por corte." },
      { property: "og:title", content: "E4CC — Bonos por pagar" },
      { property: "og:description", content: "Cuotas de bonos y fechas de corte 14 y 28." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BonusesPage,
});

const todaySv = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
const fmt = (d: string) => { const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; };
const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function BonusesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listBonuses);
  const saveDate = useServerFn(setCertificationDate);
  const { data, isPending } = useQuery({ queryKey: ["bonuses"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const today = todaySv();
  const cutoff = nextCutoff(today);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => !t || `${r.beneficiary} ${r.candidate}`.toLowerCase().includes(t));
  }, [data, q]);
  const due = (data ?? []).flatMap((r) => r.installments.filter((i) => i.payOn === cutoff).map((i) => ({ r, i })));
  const missing = (data ?? []).filter((r) => !r.certifiedOn);

  function exportCsv() {
    const head = ["Tipo", "Beneficiario", "Candidato", "País", "Modalidad", "Certificó", "Total", "Cuota", "Mes", "Monto", "Fecha de pago", "Estado"];
    const lines = rows.flatMap((r) => (r.installments.length ? r.installments : [null]).map((i, n) =>
      [r.kind, r.beneficiary, r.candidate, r.country, r.modality, r.certifiedOn ?? "Falta fecha", r.total, i ? n + 1 : "", i?.month ?? "", i?.amount ?? "", i?.payOn ?? "", r.status].map(cell).join(",")));
    const blob = new Blob(["\ufeff" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `bonos_${today}.csv`; a.click();
  }

  async function setDate(r: BonusRow, date: string) {
    try { await saveDate({ data: { applicationId: r.applicationId, date } }); toast.success("Fecha de certificación guardada"); await qc.invalidateQueries({ queryKey: ["bonuses"] }); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bonos por pagar</h1>
          <p className="text-sm text-muted-foreground">Solo candidatos certificados. Certificó del 1 al 15 → pago el 14; del 16 al 31 → pago el 28.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar nombre" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download /> Descargar Excel (CSV)</Button>
        </div>
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="flex items-center gap-2 font-medium"><BellRing className="h-4 w-4 text-primary" /> Próximo corte: {fmt(cutoff)} — {due.length} cuota(s), ${due.reduce((s, d) => s + d.i.amount, 0)}</p>
        {due.length > 0 && <ul className="mt-2 text-sm">{due.map(({ r, i }) => <li key={r.key + i.month}>{r.kind}: <b>{r.beneficiary}</b>{r.kind === "Referido" ? ` (referido ${r.candidate})` : ""} — Mes {i.month}, ${i.amount}</li>)}</ul>}
        {missing.length > 0 && <p className="mt-2 text-sm text-destructive">{missing.length} certificado(s) sin fecha de certificación: ponla abajo para calcular sus pagos.</p>}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        {isPending ? <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          : rows.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">No hay bonos de candidatos certificados.</p>
          : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Tipo</th><th className="p-3">Beneficiario</th><th className="p-3">Candidato</th><th className="p-3">Certificó</th><th className="p-3">Total</th><th className="p-3">Cuotas</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="p-3">{r.kind}</td>
                  <td className="p-3 font-medium">{r.beneficiary}</td>
                  <td className="p-3">{r.candidate}<p className="text-xs text-muted-foreground">{r.country} · {r.modality || "—"}</p></td>
                  <td className="p-3"><Input type="date" className="h-8 w-40" defaultValue={r.certifiedOn ?? ""} onBlur={(e) => e.target.value && e.target.value !== r.certifiedOn && setDate(r, e.target.value)} /></td>
                  <td className="p-3 font-medium">${r.total}</td>
                  <td className="p-3">
                    {r.installments.length === 0 ? <span className="text-destructive">Falta fecha</span> : r.installments.map((i) => (
                      <p key={i.month} className={i.payOn === cutoff ? "font-semibold text-primary" : i.payOn < today ? "text-muted-foreground line-through" : ""}>Mes {i.month}: ${i.amount} — {fmt(i.payOn)}</p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
