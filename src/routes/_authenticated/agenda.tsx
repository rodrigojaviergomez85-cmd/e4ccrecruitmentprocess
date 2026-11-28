import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Pencil, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  getRecruiterAgenda,
  saveRecruiterAgenda,
  deleteRecruiterAgenda,
} from "@/lib/recruiter-agenda.functions";
import {
  AGENDA_CATEGORIES,
  hoursLabel,
  localDay,
  summarizeAgenda,
  type AgendaInput,
  type AgendaEntry,
} from "@/lib/recruiter-agenda";
export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda diaria de Reclutamiento — E4CC" },
      {
        name: "description",
        content:
          "Prioridades diarias, entrevistas y llamadas Coaches y ADMON del equipo de Reclutamiento E4CC.",
      },
      { property: "og:title", content: "Agenda diaria de Reclutamiento — E4CC" },
      {
        property: "og:description",
        content: "Jornada y cobertura diaria de actividades de Reclutamiento E4CC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendaPage,
});
const time = (v: string) =>
  new Intl.DateTimeFormat("es", {
    timeZone: "America/El_Salvador",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(v));
function AgendaPage() {
  const [day, setDay] = useState(localDay),
    [person, setPerson] = useState(""),
    [editing, setEditing] = useState<AgendaEntry | null>(),
    [busy, setBusy] = useState(false);
  const load = useServerFn(getRecruiterAgenda),
    save = useServerFn(saveRecruiterAgenda),
    remove = useServerFn(deleteRecruiterAgenda),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["agenda", day, day],
    queryFn: () => load({ data: { from: day, to: day } }),
    refetchInterval: 60000,
  });
  const data = q.data;
  const selected =
    person ||
    data?.staff.find((s) => s.user_id === data.userId)?.user_id ||
    data?.staff[0]?.user_id ||
    "";
  const entries = (data?.entries ?? []).filter((e) => e.user_id === selected);
  const summary = summarizeAgenda(entries, day, day);
  const canEdit = Boolean(data?.isAdmin || data?.userId === selected);
  async function reload() {
    await qc.invalidateQueries({ queryKey: ["agenda"] });
  }
  async function submit(v: AgendaInput) {
    setBusy(true);
    try {
      await save({ data: v });
      setEditing(undefined);
      await reload();
      toast.success("Actividad guardada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Agenda diaria</h1>
          <p className="text-sm text-muted-foreground">Reclutamiento · Coaches y ADMON · UTC−6</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/scorecard">Resumen semanal</Link>
          </Button>
          {data?.isAdmin && (
            <Button asChild variant="outline">
              <Link to="/interviews">
                <CalendarDays className="mr-2 h-4 w-4" />
                Horarios y cupos
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap gap-2">
          {data?.staff.map((s) => (
            <Button
              key={s.user_id}
              variant={selected === s.user_id ? "default" : "outline"}
              onClick={() => setPerson(s.user_id)}
            >
              {s.full_name}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            aria-label="Fecha de agenda"
            className="w-40"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <Button disabled={!canEdit} onClick={() => setEditing(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Actividad
          </Button>
        </div>
      </div>
      {q.error ? (
        <p role="alert" className="text-destructive">
          {q.error.message}
        </p>
      ) : !data ? (
        <p>Cargando agenda…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 border-b border-border pb-4 sm:grid-cols-4">
            {[
              ["Trabajo registrado", hoursLabel(summary.workedSeconds)],
              ["Planeado", hoursLabel(summary.plannedSeconds)],
              ["Entrevistas trabajadas", summary.interviews],
              ["Prioridades cubiertas", `${summary.covered}/${summary.priorities}`],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="text-lg font-semibold text-navy">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section>
              <h2 className="mb-3 font-semibold">Prioridades y trabajo del día</h2>
              {!entries.length ? (
                <p className="py-8 text-sm text-muted-foreground">
                  Sin actividades registradas para este día.
                </p>
              ) : (
                <ol className="divide-y divide-border">
                  {entries.map((e) => (
                    <li key={e.id} className="flex gap-3 py-4">
                      <div className="w-14 shrink-0 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground">{time(e.starts_at)}</p>
                        <p>{time(e.ends_at)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {AGENDA_CATEGORIES[e.category as keyof typeof AGENDA_CATEGORIES]} ·{" "}
                          {e.status === "done"
                            ? "Realizado"
                            : e.status === "canceled"
                              ? "Cancelado"
                              : "Planeado"}
                          {e.source_key ? " · Cronómetro" : ""}
                        </p>
                        {e.target_count > 0 || e.actual_count > 0 ? (
                          <p className="mt-1 text-xs">
                            Meta {e.target_count} · Realizadas {e.actual_count} · Conectadas{" "}
                            {e.connected_count}
                          </p>
                        ) : null}
                        {e.notes && (
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {e.notes}
                          </p>
                        )}
                      </div>
                      {canEdit && !e.source_key && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar actividad"
                            onClick={() => setEditing(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Eliminar actividad"
                            onClick={async () => {
                              if (!window.confirm("¿Eliminar esta actividad?")) return;
                              try {
                                await remove({ data: { id: e.id } });
                                await reload();
                              } catch (e) {
                                toast.error(
                                  e instanceof Error ? e.message : "No se pudo eliminar.",
                                );
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <aside className="space-y-5">
              <section className="border-b border-border pb-4">
                <h2 className="font-semibold">Cobertura por área</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  {Object.entries(AGENDA_CATEGORIES)
                    .filter(([k]) => k !== "break")
                    .map(([k, l]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt>{l}</dt>
                        <dd className="shrink-0 font-medium">
                          {hoursLabel(summary.byCategory[k] ?? 0)}
                        </dd>
                      </div>
                    ))}
                </dl>
                <p className="mt-4 text-sm">
                  Llamadas Coaches: <b>{summary.callsCoach}</b> · ADMON: <b>{summary.callsAdmon}</b>
                </p>
                <p className="text-sm">
                  Referencias: <b>{summary.referenceCalls}</b> · Conexiones:{" "}
                  <b>{summary.connected}</b>
                </p>
              </section>
              <section>
                <h2 className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4" />
                  Citas del equipo
                </h2>
                <ul className="mt-3 max-h-96 space-y-3 overflow-y-auto">
                  {data.appointments.map((a) => (
                    <li key={a.id} className="text-sm">
                      <Link
                        className="font-medium text-primary hover:underline"
                        to="/evaluations/$applicationId"
                        params={{ applicationId: a.applicationId }}
                      >
                        {time(a.starts_at)} · {a.candidate}
                      </Link>
                      <p className="text-xs text-muted-foreground">{a.host}</p>
                    </li>
                  ))}
                </ul>
                {!data.appointments.length && (
                  <p className="mt-3 text-sm text-muted-foreground">Sin citas programadas.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
      {editing !== undefined && (
        <ActivityEditor
          key={editing?.id ?? `${selected}-${day}`}
          entry={editing}
          day={day}
          userId={selected}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={submit}
        />
      )}
    </main>
  );
}
function ActivityEditor({
  entry,
  day,
  userId,
  busy,
  onClose,
  onSave,
}: {
  entry: AgendaEntry | null;
  day: string;
  userId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (v: AgendaInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(entry?.title ?? ""),
    [category, setCategory] = useState(entry?.category ?? "calls_coach"),
    [start, setStart] = useState(entry ? time(entry.starts_at) : "09:00"),
    [end, setEnd] = useState(entry ? time(entry.ends_at) : "10:00"),
    [status, setStatus] = useState(entry?.status ?? "planned"),
    [target, setTarget] = useState(entry?.target_count ?? 0),
    [count, setCount] = useState(entry?.actual_count ?? 0),
    [connected, setConnected] = useState(entry?.connected_count ?? 0),
    [notes, setNotes] = useState(entry?.notes ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar actividad" : "Actividad del día"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave({
              ...(entry ? { id: entry.id } : {}),
              user_id: userId,
              title,
              category: category as keyof typeof AGENDA_CATEGORIES,
              starts_at: `${day}T${start}:00-06:00`,
              ends_at: `${day}T${end}:00-06:00`,
              status: status as "planned" | "done" | "canceled",
              target_count: target,
              actual_count: count,
              connected_count: connected,
              notes,
            });
          }}
        >
          <div>
            <Label htmlFor="activity-title">Prioridad / actividad</Label>
            <Input
              id="activity-title"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label>Área</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Área de actividad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AGENDA_CATEGORIES).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="activity-start">Inicio (UTC−6)</Label>
              <Input
                id="activity-start"
                required
                type="time"
                step={1800}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="activity-end">Fin (UTC−6)</Label>
              <Input
                id="activity-end"
                required
                type="time"
                step={1800}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Estado de actividad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Planeado</SelectItem>
                <SelectItem value="done">Realizado</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Meta", target, setTarget],
              ["Realizadas", count, setCount],
              ["Conectadas", connected, setConnected],
            ].map(([l, v, set]) => (
              <div key={String(l)}>
                <Label>{String(l)}</Label>
                <Input
                  aria-label={String(l)}
                  type="number"
                  min={0}
                  max={1000}
                  value={Number(v)}
                  onChange={(e) => {
                    if (typeof set === "function") set(Number(e.target.value));
                  }}
                />
              </div>
            ))}
          </div>
          <div>
            <Label htmlFor="activity-notes">Notas</Label>
            <Textarea
              id="activity-notes"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {busy ? "Guardando…" : "Guardar actividad"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
