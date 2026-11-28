import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  saveRecruiterAgendaPriorities,
  deleteRecruiterAgenda,
} from "@/lib/recruiter-agenda.functions";
import {
  AGENDA_CATEGORIES,
  hoursLabel,
  localDay,
  summarizeAgenda,
  type AgendaInput,
  type AgendaEntry,
  type AgendaPrioritiesInput,
  type AgendaPriority,
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

function minutesAtHalfHour(value: string) {
  const match = /(\d{2}):(\d{2})/.exec(time(value));
  const hours = Number(match?.[1] ?? 0);
  const minutes = Number(match?.[2] ?? 0);
  return hours * 60 + (minutes >= 30 ? 30 : 0);
}

function slotLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function addThirty(value: string) {
  const match = /(\d{2}):(\d{2})/.exec(value);
  return slotLabel(Number(match?.[1] ?? 9) * 60 + Number(match?.[2] ?? 0) + 30);
}

function AgendaPage() {
  const [day, setDay] = useState(localDay),
    [person, setPerson] = useState(""),
    [editing, setEditing] = useState<AgendaEntry | null>(),
    [draftStart, setDraftStart] = useState("09:00"),
    [busy, setBusy] = useState(false),
    [savingPriorities, setSavingPriorities] = useState(false);
  const load = useServerFn(getRecruiterAgenda),
    save = useServerFn(saveRecruiterAgenda),
    savePriorities = useServerFn(saveRecruiterAgendaPriorities),
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
  const priorities = (data?.priorities ?? []).filter((p) => p.user_id === selected);
  const summary = summarizeAgenda(entries, day, day, priorities);
  const canEdit = Boolean(data?.isAdmin || data?.userId === selected);
  const entriesBySlot = new Map<number, AgendaEntry[]>();
  for (const entry of entries) {
    const slot = minutesAtHalfHour(entry.starts_at);
    entriesBySlot.set(slot, [...(entriesBySlot.get(slot) ?? []), entry]);
  }
  const occupiedSlots = [...entriesBySlot.keys()];
  const firstSlot = Math.min(8 * 60, ...occupiedSlots);
  const lastSlot = Math.max(18 * 60, ...occupiedSlots.map((slot) => slot + 30));
  const notebookSlots: number[] = [];
  for (let slot = firstSlot; slot < lastSlot; slot += 30) notebookSlots.push(slot);

  async function reload() {
    await qc.invalidateQueries({ queryKey: ["agenda"] });
  }
  function openNew(start = "09:00") {
    setDraftStart(start);
    setEditing(null);
  }
  async function submit(v: AgendaInput) {
    setBusy(true);
    try {
      await save({ data: v });
      setEditing(undefined);
      await reload();
      toast.success("Actividad guardada en el cuaderno.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  async function submitPriorities(items: AgendaPrioritiesInput["priorities"]) {
    setSavingPriorities(true);
    try {
      await savePriorities({
        data: { user_id: selected, agenda_date: day, priorities: items },
      });
      await reload();
      toast.success("Prioridades A1–A5 guardadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar las prioridades.");
    } finally {
      setSavingPriorities(false);
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
          <Button disabled={!canEdit} onClick={() => openNew()}>
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
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold text-navy">{value}</p>
              </div>
            ))}
          </div>

          <PriorityBoard
            key={`${selected}-${day}`}
            initial={priorities}
            canEdit={canEdit}
            busy={savingPriorities}
            onSave={submitPriorities}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-4 sm:px-5">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-navy">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Cuaderno del día
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Un renglón por cada 30 minutos. Toca un horario para escribir.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">UTC−6</span>
              </div>
              <ol>
                {notebookSlots.map((slot) => {
                  const slotEntries = entriesBySlot.get(slot) ?? [];
                  return (
                    <li
                      key={slot}
                      className="grid min-h-24 grid-cols-[3.75rem_minmax(0,1fr)] border-b border-border last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
                    >
                      <button
                        type="button"
                        className="border-r border-border px-2 pt-4 text-left align-top text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-default"
                        onClick={() => openNew(slotLabel(slot))}
                        disabled={!canEdit}
                        aria-label={`Agregar actividad a las ${slotLabel(slot)}`}
                      >
                        {slotLabel(slot)}
                      </button>
                      <div className="border-l-2 border-l-primary/25 px-3 py-3 sm:px-4">
                        <div className="space-y-2">
                          {slotEntries.map((entry) => (
                            <article key={entry.id} className="rounded-md bg-background px-3 py-2">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-medium">{entry.title}</p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {time(entry.starts_at)}–{time(entry.ends_at)} ·{" "}
                                    {AGENDA_CATEGORIES[
                                      entry.category as keyof typeof AGENDA_CATEGORIES
                                    ]}{" "}
                                    ·{" "}
                                    {entry.status === "done"
                                      ? "Realizado"
                                      : entry.status === "canceled"
                                        ? "Cancelado"
                                        : "Planeado"}
                                    {entry.source_key ? " · Cronómetro" : ""}
                                  </p>
                                  {entry.target_count > 0 || entry.actual_count > 0 ? (
                                    <p className="mt-1 text-xs">
                                      Meta {entry.target_count} · Realizadas {entry.actual_count} ·
                                      Conectadas {entry.connected_count}
                                    </p>
                                  ) : null}
                                  {entry.notes && (
                                    <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                                      {entry.notes}
                                    </p>
                                  )}
                                </div>
                                {canEdit && !entry.source_key && (
                                  <div className="flex shrink-0">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="Editar actividad"
                                      onClick={() => setEditing(entry)}
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
                                          await remove({ data: { id: entry.id } });
                                          await reload();
                                          toast.success("Actividad eliminada.");
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
                              </div>
                            </article>
                          ))}
                        </div>
                        {canEdit && !slotEntries.length && (
                          <button
                            type="button"
                            onClick={() => openNew(slotLabel(slot))}
                            className="flex min-h-12 w-full items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Escribir en este renglón
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <aside className="space-y-5">
              <section className="border-b border-border pb-4">
                <h2 className="font-semibold">Cobertura por área</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  {Object.entries(AGENDA_CATEGORIES)
                    .filter(([key]) => key !== "break")
                    .map(([key, label]) => (
                      <div key={key} className="flex justify-between gap-2">
                        <dt>{label}</dt>
                        <dd className="shrink-0 font-medium">
                          {hoursLabel(summary.byCategory[key] ?? 0)}
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
                  {data.appointments.map((appointment) => (
                    <li key={appointment.id} className="text-sm">
                      <Link
                        className="font-medium text-primary hover:underline"
                        to="/evaluations/$applicationId"
                        params={{ applicationId: appointment.applicationId }}
                      >
                        {time(appointment.starts_at)} · {appointment.candidate}
                      </Link>
                      <p className="text-xs text-muted-foreground">{appointment.host}</p>
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
          key={editing?.id ?? `${selected}-${day}-${draftStart}`}
          entry={editing}
          day={day}
          userId={selected}
          initialStart={draftStart}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSave={submit}
        />
      )}
    </main>
  );
}

function PriorityBoard({
  initial,
  canEdit,
  busy,
  onSave,
}: {
  initial: AgendaPriority[];
  canEdit: boolean;
  busy: boolean;
  onSave: (items: AgendaPrioritiesInput["priorities"]) => Promise<void>;
}) {
  const [items, setItems] = useState<AgendaPrioritiesInput["priorities"]>(() =>
    [1, 2, 3, 4, 5].map((slot) => {
      const saved = initial.find((item) => item.slot === slot);
      return { slot, title: saved?.title ?? "", done: saved?.done ?? false };
    }),
  );

  function update(slot: number, patch: Partial<{ title: string; done: boolean }>) {
    setItems((current) =>
      current.map((item) => (item.slot === slot ? { ...item, ...patch } : item)),
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-navy">Las 5 prioridades del día</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Define lo más importante y marca cada prioridad cuando esté cubierta.
          </p>
        </div>
        <Button onClick={() => void onSave(items)} disabled={!canEdit || busy}>
          <Save className="mr-2 h-4 w-4" />
          {busy ? "Guardando…" : "Guardar prioridades"}
        </Button>
      </div>
      <ol className="space-y-2">
        {items.map((item) => (
          <li
            key={item.slot}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 border-b border-border py-2 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)_2rem] sm:gap-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
              A{item.slot}
            </span>
            <Input
              aria-label={`Prioridad A${item.slot}`}
              placeholder={`Escribe la prioridad A${item.slot}`}
              maxLength={200}
              value={item.title}
              disabled={!canEdit}
              onChange={(event) =>
                update(item.slot, {
                  title: event.target.value,
                  done: event.target.value.trim() ? item.done : false,
                })
              }
              className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-1"
            />
            <div className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:justify-end">
              <Checkbox
                aria-label={`Marcar A${item.slot} como cubierta`}
                checked={item.done}
                disabled={!canEdit || !item.title.trim()}
                onCheckedChange={(checked) => update(item.slot, { done: checked === true })}
              />
              <span className="text-xs text-muted-foreground sm:hidden">Cubierta</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActivityEditor({
  entry,
  day,
  userId,
  initialStart,
  busy,
  onClose,
  onSave,
}: {
  entry: AgendaEntry | null;
  day: string;
  userId: string;
  initialStart: string;
  busy: boolean;
  onClose: () => void;
  onSave: (v: AgendaInput) => Promise<void>;
}) {
  const [title, setTitle] = useState(entry?.title ?? ""),
    [category, setCategory] = useState(entry?.category ?? "calls_coach"),
    [start, setStart] = useState(entry ? time(entry.starts_at) : initialStart),
    [end, setEnd] = useState(entry ? time(entry.ends_at) : addThirty(initialStart)),
    [status, setStatus] = useState(entry?.status ?? "planned"),
    [target, setTarget] = useState(entry?.target_count ?? 0),
    [count, setCount] = useState(entry?.actual_count ?? 0),
    [connected, setConnected] = useState(entry?.connected_count ?? 0),
    [notes, setNotes] = useState(entry?.notes ?? "");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Editar actividad" : `Escribir a las ${initialStart}`}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
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
            <Label htmlFor="activity-title">Actividad</Label>
            <Input
              id="activity-title"
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label>Área</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Área de actividad">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(AGENDA_CATEGORIES).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
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
                onChange={(event) => setStart(event.target.value)}
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
                onChange={(event) => setEnd(event.target.value)}
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
            ].map(([label, value, setValue]) => (
              <div key={String(label)}>
                <Label>{String(label)}</Label>
                <Input
                  aria-label={String(label)}
                  type="number"
                  min={0}
                  max={1000}
                  value={Number(value)}
                  onChange={(event) => {
                    if (typeof setValue === "function") setValue(Number(event.target.value));
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
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {busy ? "Guardando…" : "Guardar en el cuaderno"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
