/** Structured Training / Class schedules picked by the Manager (no free text). */

export type DayPattern = "weekdays" | "weekdays_sat" | "weekdays_sun" | "weekends";
export type TimeBlock = { start: string; end: string };
export type ScheduleStruct = { pattern: DayPattern | ""; weekday?: TimeBlock; sat?: TimeBlock; sun?: TimeBlock };

export const DAY_PATTERNS: { value: DayPattern; label: string }[] = [
  { value: "weekdays", label: "Lunes a viernes" },
  { value: "weekdays_sat", label: "Lunes a viernes + sábado" },
  { value: "weekdays_sun", label: "Lunes a viernes + domingo" },
  { value: "weekends", label: "Weekends: sábado y domingo" },
];

export const BLOCK_LABEL = { weekday: "Lunes a viernes", sat: "Sábado", sun: "Domingo" } as const;
export type BlockKey = keyof typeof BLOCK_LABEL;

export function blocksFor(p: DayPattern | ""): BlockKey[] {
  switch (p) {
    case "weekdays": return ["weekday"];
    case "weekdays_sat": return ["weekday", "sat"];
    case "weekdays_sun": return ["weekday", "sun"];
    case "weekends": return ["sat", "sun"];
    default: return [];
  }
}

/** 7:00 AM – 10:00 PM inclusive, every 5 minutes, as "HH:MM". */
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 7 * 60; m <= 22 * 60; m += 5) out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return out;
})();

export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function parseSchedule(raw: string | undefined | null): ScheduleStruct | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as ScheduleStruct;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Returns a list of problems; empty means valid. */
export function scheduleProblems(s: ScheduleStruct | null): string[] {
  if (!s || !s.pattern) return ["select the days"];
  const out: string[] = [];
  for (const k of blocksFor(s.pattern)) {
    const b = s[k];
    if (!b?.start || !b?.end) out.push(`${BLOCK_LABEL[k]}: select start and end`);
    else if (!TIME_OPTIONS.includes(b.start) || !TIME_OPTIONS.includes(b.end)) out.push(`${BLOCK_LABEL[k]}: time out of range`);
    else if (b.end <= b.start) out.push(`${BLOCK_LABEL[k]}: end must be after start`);
  }
  return out;
}

/** e.g. "Lunes a viernes: 1:40 PM–7:50 PM / Domingo: 8:00 AM–12:00 PM (El Salvador time (GMT-6))" */
export function formatSchedule(s: ScheduleStruct | null, tz: string): string {
  if (scheduleProblems(s).length) return "";
  const parts = blocksFor(s!.pattern).map((k) => `${BLOCK_LABEL[k]}: ${fmt12(s![k]!.start)}–${fmt12(s![k]!.end)}`);
  return `${parts.join(" / ")}${tz ? ` (${tz})` : ""}`;
}
