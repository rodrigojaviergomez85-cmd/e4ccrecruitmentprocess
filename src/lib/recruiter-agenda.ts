import { z } from "zod";
export const AGENDA_CATEGORIES = {
  interview_coach: "Entrevistas Coaches",
  interview_admon: "Entrevistas ADMON",
  calls_coach: "Llamadas Coaches",
  calls_admon: "Llamadas ADMON",
  references: "Llamadas de referencias",
  admin: "Gestión y seguimiento",
  break: "Descanso",
} as const;
export type AgendaCategory = keyof typeof AGENDA_CATEGORIES;
export const agendaInput = z
  .object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    category: z.enum([
      "interview_coach",
      "interview_admon",
      "calls_coach",
      "calls_admon",
      "references",
      "admin",
      "break",
    ]),
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
    status: z.enum(["planned", "done", "canceled"]),
    target_count: z.number().int().min(0).max(1000),
    actual_count: z.number().int().min(0).max(1000),
    connected_count: z.number().int().min(0).max(1000),
    notes: z.string().max(2000),
  })
  .superRefine((v, c) => {
    const minutes = (Date.parse(v.ends_at) - Date.parse(v.starts_at)) / 60000;
    if (minutes <= 0 || minutes > 960)
      c.addIssue({ code: "custom", message: "El bloque debe durar entre 1 minuto y 16 horas." });
    if ([v.starts_at, v.ends_at].some((t) => Date.parse(t) % 1800000 !== 0))
      c.addIssue({ code: "custom", message: "Usa horas en punto o y media (bloques de 30 minutos)." });
    if (v.connected_count > v.actual_count)
      c.addIssue({ code: "custom", message: "Las conexiones no pueden superar las llamadas." });
    if (v.status === "done" && Date.parse(v.ends_at) > Date.now())
      c.addIssue({
        code: "custom",
        message: "No puedes registrar trabajo realizado en el futuro.",
      });
  });
export type AgendaInput = z.infer<typeof agendaInput>;
export const agendaPrioritiesInput = z
  .object({
    user_id: z.string().uuid(),
    agenda_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    priorities: z
      .array(
        z.object({
          slot: z.number().int().min(1).max(5),
          title: z.string().max(200),
          done: z.boolean(),
        }),
      )
      .length(5),
  })
  .superRefine((v, c) => {
    if (v.priorities.map((p) => p.slot).sort((a, b) => a - b).join(",") !== "1,2,3,4,5")
      c.addIssue({ code: "custom", message: "Debes guardar exactamente las prioridades A1 a A5." });
    for (const p of v.priorities)
      if (p.done && !p.title.trim())
        c.addIssue({ code: "custom", message: "Escribe la prioridad antes de marcarla como cubierta." });
  });
export type AgendaPriority = {
  id: string;
  user_id: string;
  agenda_date: string;
  slot: number;
  title: string;
  done: boolean;
};
export type AgendaPrioritiesInput = z.infer<typeof agendaPrioritiesInput>;
export type AgendaEntry = {
  id: string;
  user_id: string;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string;
  status: string;
  target_count: number;
  actual_count: number;
  connected_count: number;
  source_key: string | null;
  notes: string;
};
export function unionSeconds(intervals: Array<[number, number]>) {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let end = -Infinity,
    total = 0;
  for (const [s, e] of sorted) {
    total += Math.max(0, e - Math.max(s, end));
    end = Math.max(end, e);
  }
  return Math.round(total / 1000);
}
export function summarizeAgenda(
  entries: AgendaEntry[],
  from: string,
  to: string,
  dailyPriorities?: AgendaPriority[],
) {
  const lower = Date.parse(`${from}T00:00:00-06:00`),
    upper = Date.parse(`${to}T00:00:00-06:00`) + 86400000;
  const range = (e: AgendaEntry): [number, number] => [
    Math.max(lower, Date.parse(e.starts_at)),
    Math.min(upper, Date.parse(e.ends_at)),
  ];
  const relevant = entries.filter(
    (e) => Date.parse(e.starts_at) < upper && Date.parse(e.ends_at) > lower,
  );
  const actual = relevant.filter((e) => e.status === "done" && e.category !== "break");
  const byCategory = Object.fromEntries(
    Object.keys(AGENDA_CATEGORIES).map((category) => [
      category,
      unionSeconds(actual.filter((e) => e.category === category).map(range)),
    ]),
  );
  const planned = relevant.filter(
    (e) => !e.source_key && e.status !== "canceled" && e.category !== "break",
  );
  const legacyCovered = planned.filter((e) => {
    const done = actual.filter(
      (a) =>
        a.category === e.category &&
        Date.parse(a.starts_at) < Date.parse(e.ends_at) &&
        Date.parse(a.ends_at) > Date.parse(e.starts_at),
    );
    const secs = unionSeconds(
      done.map((a) => {
        const [s, t] = range(a);
        return [Math.max(s, Date.parse(e.starts_at)), Math.min(t, Date.parse(e.ends_at))] as [
          number,
          number,
        ];
      }),
    );
    const count = done.reduce((n, a) => n + a.actual_count, 0);
    return (
      secs >= Math.round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 1000) &&
      count >= e.target_count
    );
  }).length;
  const fixedPriorities = (dailyPriorities ?? []).filter(
    (p) => p.agenda_date >= from && p.agenda_date <= to && p.title.trim(),
  );
  const priorityCount = dailyPriorities ? fixedPriorities.length : planned.length;
  const covered = dailyPriorities
    ? fixedPriorities.filter((p) => p.done).length
    : legacyCovered;
  const calls = (category: string) =>
    actual.filter((e) => e.category === category).reduce((n, e) => n + e.actual_count, 0);
  const interviewKeys = new Set(
    actual.filter((e) => e.source_key).map((e) => e.source_key?.split(":").slice(0, 2).join(":")),
  );
  return {
    workedSeconds: unionSeconds(actual.map(range)),
    plannedSeconds: unionSeconds(planned.map(range)),
    byCategory,
    callsCoach: calls("calls_coach"),
    callsAdmon: calls("calls_admon"),
    referenceCalls: calls("references"),
    connected: actual
      .filter((e) => e.category.startsWith("calls_") || e.category === "references")
      .reduce((n, e) => n + e.connected_count, 0),
    interviews: interviewKeys.size + calls("interview_coach") + calls("interview_admon"),
    priorities: priorityCount,
    covered,
    coverage: priorityCount ? Math.round((covered / priorityCount) * 100) : null,
  };
}
export const hoursLabel = (seconds: number) =>
  `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
export const localDay = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/El_Salvador" }).format(new Date());
export function weekRange(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const from = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { from, to: d.toISOString().slice(0, 10) };
}
export const groupBookingInput = z.object({
  max_per_slot: z.number().int().min(5).max(20),
  duration_minutes: z.literal(30),
});

export const canUseAgenda = (roles: string[], active: boolean) =>
  active && (roles.includes("admin") || roles.includes("recruitment"));
