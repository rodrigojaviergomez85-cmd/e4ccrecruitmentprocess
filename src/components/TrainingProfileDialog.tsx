import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getTrainingProfile } from "@/lib/training.functions";

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : "—");

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="font-medium">{value || "—"}</dd></div>;
}

/** Read-only, compact interview file shown from the Training Tracker. */
export function TrainingProfileDialog({ applicationId, open, onOpenChange }: { applicationId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const get = useServerFn(getTrainingProfile);
  const { data, isLoading, error } = useQuery({ queryKey: ["training-profile", applicationId], queryFn: () => get({ data: { applicationId } }), enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.fullName ?? "Expediente"}</DialogTitle></DialogHeader>
        {isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && <div className="space-y-5 text-sm">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Item label="País" value={data.country} /><Item label="Ciudad" value={data.city} /><Item label="Modalidad" value={data.modality} />
            <Item label="Teléfono" value={data.phone} /><Item label="Correo" value={data.email} /><Item label="Grammar test" value={data.grammarScore ?? "—"} />
            <Item label="English level AI" value={data.aiLevel} />
          </dl>
          <section className="space-y-2">
            <h3 className="font-semibold">Entrevista de Recruitment</h3>
            {data.interviews.map((e) => <div key={e.attempt} className="rounded-md border p-3">
              <p className="font-medium">Intento {e.attempt}: {e.result || "Sin resultado"} · decidido por {e.decidedBy} · {day(e.decidedAt)}</p>
              {e.openedBy !== e.decidedBy && <p className="text-xs text-muted-foreground">Iniciada por {e.openedBy}</p>}
              <dl className="mt-2 grid grid-cols-2 gap-2"><Item label="Nivel" value={e.level} /><Item label="Hiring bonus" value={e.hiringBonus} /></dl>
              {e.retakeReason && <p className="mt-2"><span className="text-muted-foreground">Retake: </span>{e.retakeReason}</p>}
              {e.comments && <p className="mt-2 whitespace-pre-wrap"><span className="text-muted-foreground">Comentarios: </span>{e.comments}</p>}
              {e.redFlags && <p className="mt-2 rounded bg-destructive/10 p-2 text-destructive">Red flags: {e.redFlags}</p>}
            </div>)}
          </section>
          {data.jobs.length > 0 && <section className="space-y-2">
            <h3 className="font-semibold">Trabajos</h3>
            {data.jobs.map((j) => <div key={j.slot} className="rounded-md border p-3">
              <p className="font-medium">{j.company} · {j.position} <span className="text-muted-foreground">({j.start_date || "?"} – {j.end_date || "?"})</span></p>
              <p>Jefe: {j.supervisor_name || "—"} · {j.supervisor_contact || "—"}</p>
              {j.reason_for_leaving && <p className="text-muted-foreground">Salida: {j.reason_for_leaving}</p>}
            </div>)}
          </section>}
          <section className="space-y-2">
            <h3 className="font-semibold">Segundo filtro (Manager)</h3>
            {data.managers.length === 0 && <p className="text-muted-foreground">Sin registro.</p>}
            {data.managers.map((m) => <div key={m.attempt} className="rounded-md border p-3">
              <p className="font-medium">{m.decision || "Sin decisión"} · {m.manager} · {day(m.decidedAt)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"><Item label="LOB" value={m.lob} /><Item label="Horario" value={m.schedule} /><Item label="Inicio training" value={m.startDate} /></dl>
              {m.reason && <p className="mt-2">{m.reason}</p>}
              {m.comments && <p className="mt-2 whitespace-pre-wrap"><span className="text-muted-foreground">Comentarios: </span>{m.comments}</p>}
              {m.redFlags && <p className="mt-2 rounded bg-destructive/10 p-2 text-destructive">Red flags: {m.redFlags}</p>}
            </div>)}
          </section>
        </div>}
      </DialogContent>
    </Dialog>
  );
}
