import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRecruiterAgenda } from "@/lib/recruiter-agenda.functions";
import { hoursLabel, localDay, summarizeAgenda, weekRange } from "@/lib/recruiter-agenda";
import * as XLSX from "xlsx";
export function RecruiterWorkSummary() {
  const [day, setDay] = useState(localDay);
  const dates = weekRange(day);
  const load = useServerFn(getRecruiterAgenda);
  const q = useQuery({
    queryKey: ["agenda", dates.from, dates.to],
    queryFn: () => load({ data: dates }),
  });
  const rows = (q.data?.staff ?? []).map((s) => ({
    name: s.full_name,
    ...summarizeAgenda(
      (q.data?.entries ?? []).filter((e) => e.user_id === s.user_id),
      dates.from,
      dates.to,
    ),
  }));
  function shift(n: number) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    setDay(d.toISOString().slice(0, 10));
  }
  function download() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Reclutadora: r.name,
          "Semana desde": dates.from,
          Hasta: dates.to,
          "Horas trabajadas": Number((r.workedSeconds / 3600).toFixed(2)),
          "Horas planeadas": Number((r.plannedSeconds / 3600).toFixed(2)),
          "Horas entrevistas": Number(
            ((r.byCategory["interview_coach"] ?? 0) + (r.byCategory["interview_admon"] ?? 0)) /
              3600,
          ).toFixed(2),
          "Entrevistas trabajadas": r.interviews,
          "Llamadas Coaches": r.callsCoach,
          "Llamadas ADMON": r.callsAdmon,
          Referencias: r.referenceCalls,
          Conexiones: r.connected,
          "Prioridades cubiertas": r.covered,
          Prioridades: r.priorities,
          "Cobertura %": r.coverage ?? "",
        })),
      ),
      "Resumen semanal",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        (q.data?.entries ?? []).map((e) => ({
          Reclutadora: q.data?.staff.find((s) => s.user_id === e.user_id)?.full_name ?? "",
          Actividad: e.title,
          Area: e.category,
          Inicio: e.starts_at,
          Fin: e.ends_at,
          Estado: e.status,
          Llamadas: e.actual_count,
          Conectadas: e.connected_count,
          Origen: e.source_key ? "Cronómetro" : "Registro manual",
          Notas: e.notes,
        })),
      ),
      "Detalle",
    );
    XLSX.writeFile(wb, `e4cc-jornada-${dates.from}.xlsx`);
  }
  return (
    <section className="space-y-4 border-y border-border py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-navy">Jornada de Reclutamiento</h2>
          <p className="text-sm text-muted-foreground">
            Semana {dates.from} — {dates.to} · UTC−6
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title="Semana anterior" onClick={() => shift(-7)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" title="Semana siguiente" onClick={() => shift(7)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={download} disabled={!q.data}>
            <Download className="mr-2 h-4 w-4" />
            Excel semanal
          </Button>
        </div>
      </div>
      {q.error ? (
        <p role="alert" className="text-destructive">
          {q.error.message}
        </p>
      ) : q.isPending ? (
        <p>Cargando jornada…</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {rows.map((r) => (
            <article key={r.name} className="rounded-md border border-border bg-card p-4">
              <h3 className="font-semibold">{r.name}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                {[
                  ["Trabajo registrado", hoursLabel(r.workedSeconds)],
                  ["Planeado", hoursLabel(r.plannedSeconds)],
                  [
                    "Entrevistas",
                    `${r.interviews} · ${hoursLabel((r.byCategory["interview_coach"] ?? 0) + (r.byCategory["interview_admon"] ?? 0))}`,
                  ],
                  [
                    "Llamadas Coaches",
                    `${r.callsCoach} · ${hoursLabel(r.byCategory["calls_coach"] ?? 0)}`,
                  ],
                  [
                    "Llamadas ADMON",
                    `${r.callsAdmon} · ${hoursLabel(r.byCategory["calls_admon"] ?? 0)}`,
                  ],
                  ["Referencias", r.referenceCalls],
                  ["Conexiones", r.connected],
                  ["Prioridades cubiertas", `${r.covered}/${r.priorities}`],
                ].map(([l, v]) => (
                  <div key={String(l)}>
                    <dt className="text-xs text-muted-foreground">{l}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
