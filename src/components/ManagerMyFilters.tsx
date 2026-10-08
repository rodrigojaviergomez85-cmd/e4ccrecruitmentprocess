import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { markSecondFilterNoShow } from "@/lib/manager.functions";

type Row = { id: string; fullName: string; country: string; modality: string | null; managerId: string | null; agendaAt: string | null };
type Me = { id: string; name: string; isManager: boolean; isAdmin: boolean };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export function ManagerMyFilters({ rows, me, canDecide }: { rows: Row[]; me: Me; canDecide: boolean }) {
  if (!me.isManager && !me.isAdmin) return null;
  const mine = rows.filter((r) => r.agendaAt && (me.isManager ? r.managerId === me.id : true));
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const sorted = [...mine].sort((a, b) => a.agendaAt!.localeCompare(b.agendaAt!));
  const isToday = (r: Row) => new Date(r.agendaAt!).toDateString() === todayKey;
  const today = sorted.filter(isToday);
  const upcoming = sorted.filter((r) => !isToday(r) && new Date(r.agendaAt!).getTime() > now);
  const missed = sorted.filter((r) => !isToday(r) && new Date(r.agendaAt!).getTime() <= now);
  const first = (me.name || "").split(" ")[0];
  return (
    <section className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5">
      <div>
        <h2 className="text-xl font-bold">{greeting()}{first ? `, ${first}` : ""}</h2>
        <p className="text-sm text-muted-foreground">
          {me.isManager ? "Estos son tus filtros pendientes para hoy." : "Estos son los filtros pendientes de hoy."}
        </p>
      </div>
      <MyList title="Hoy" rows={today} canDecide={canDecide} timeOnly />
      <MyList title="Próximos" rows={upcoming} canDecide={false} />
      <MyList title="No se presentaron / pendientes de cerrar" rows={missed} canDecide={canDecide} danger />
    </section>
  );
}

function MyList({ title, rows, canDecide, timeOnly, danger }: { title: string; rows: Row[]; canDecide: boolean; timeOnly?: boolean; danger?: boolean }) {
  const qc = useQueryClient();
  const noShow = useServerFn(markSecondFilterNoShow);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const when = (iso: string) =>
    timeOnly
      ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function send(r: Row) {
    if (choice[r.id] !== "noshow") return;
    if (!window.confirm(`¿Marcar a ${r.fullName} como No Show y enviarle el correo?`)) return;
    setBusy(r.id);
    try {
      await noShow({ data: { applicationId: r.id, appointmentAt: r.agendaAt! } });
      toast.success(`${r.fullName} marcado como No Show`);
      await qc.invalidateQueries({ queryKey: ["second-filter"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className={`text-xs font-bold uppercase ${danger ? "text-destructive" : "text-primary"}`}>{title} ({rows.length})</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <div className="mt-1 divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span className="font-medium tabular-nums">{when(r.agendaAt!)}</span>{" "}
                <span className="font-semibold">{r.fullName}</span>{" "}
                <span className="text-xs capitalize text-muted-foreground">· {r.modality ?? r.country}</span>
              </div>
              <div className="flex items-center gap-2">
                {canDecide && (
                  <>
                    <Select value={choice[r.id] ?? ""} onValueChange={(v) => setChoice({ ...choice, [r.id]: v })}>
                      <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Acción…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="noshow">No Show</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="destructive" disabled={choice[r.id] !== "noshow" || busy === r.id} onClick={() => void send(r)}>
                      Enviar
                    </Button>
                  </>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link to="/second-filter/$applicationId" params={{ applicationId: r.id }}>Abrir evaluación</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
