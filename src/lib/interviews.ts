/** Shared, framework-free helpers for interview scheduling. */

/** Ranked CEFR mapping — never compare CEFR levels alphabetically. */
export const CEFR_RANK: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  "B1+": 4,
  B2: 5,
  "B2+": 6,
  C1: 7,
  C2: 8,
};

export const MIN_SCHEDULING_RANK = CEFR_RANK["B1"]!;

/** B1 and above may schedule. A1 and A2 may not. */
export function isSchedulingEligible(cefr: string | null | undefined): boolean {
  if (!cefr) return false;
  const rank = CEFR_RANK[cefr.toUpperCase()];
  return rank != null && rank >= MIN_SCHEDULING_RANK;
}

export const APPOINTMENT_STATUSES = [
  "Scheduled",
  "Confirmed",
  "Completed",
  "No-show",
  "Rescheduled",
  "Canceled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = ["Scheduled", "Confirmed"];

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type WeeklyHours = Record<string, Array<[string, string]>>;

export type InterviewSettings = {
  timezone: string;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_booking_days: number;
  max_per_slot: number;
  weekly_hours: WeeklyHours;
  default_meeting_link: string;
  reminder_offsets_minutes: number[];
  token_expiry_days: number;
  allow_reapply_days: number;
  assignment_mode: "round_robin" | "country";
  templates: Record<string, unknown>;
};

/** Offset (ms) of a timezone at a given instant: localWallClock - utc. */
export function tzOffsetMs(timeZone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts["year"]!,
    (parts["month"] ?? 1) - 1,
    parts["day"]!,
    (parts["hour"] ?? 0) % 24,
    parts["minute"] ?? 0,
    parts["second"] ?? 0,
  );
  return asUtc - utcMs;
}

/** Convert a wall-clock time in a timezone into a UTC timestamp (ms). */
export function zonedToUtcMs(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let utc = naive;
  for (let i = 0; i < 2; i += 1) utc = naive - tzOffsetMs(timeZone, utc);
  return utc;
}

/** yyyy-mm-dd of an instant inside a timezone. */
export function zonedDateKey(timeZone: string, utcMs: number): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(new Date(utcMs));
}

export function zonedWeekday(timeZone: string, utcMs: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    new Date(utcMs),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function formatInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatTimeInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const COUNTRY_TIMEZONES: Record<string, string> = {
  SV: "America/El_Salvador",
  GT: "America/Guatemala",
  NI: "America/Managua",
  HN: "America/Tegucigalpa",
  MX: "America/Mexico_City",
  CO: "America/Bogota",
  US: "America/New_York",
  ES: "Europe/Madrid",
  CR: "America/Costa_Rica",
  PA: "America/Panama",
};

export const TIMEZONE_CHOICES = [
  "America/El_Salvador",
  "America/Guatemala",
  "America/Managua",
  "America/Tegucigalpa",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Panama",
  "America/Costa_Rica",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

export function parseHm(value: string): [number, number] {
  const [h, m] = value.split(":");
  return [Number(h ?? 0), Number(m ?? 0)];
}

/** Google Calendar template link for an appointment. */
export function googleCalendarUrl(opts: {
  title: string;
  startIso: string;
  endIso: string;
  details: string;
  location: string;
}): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${stamp(opts.startIso)}/${stamp(opts.endIso)}`,
    details: opts.details,
    location: opts.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(opts: {
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  description: string;
  location: string;
}): string {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//E4CC//Interviews//EN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(opts.startIso)}`,
    `DTEND:${stamp(opts.endIso)}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
