export const BOOKING_WINDOW_HOURS = 72;
export const GROUP_DURATION_MINUTES = 30;
export const DEFAULT_GROUP_CAPACITY = 10;
export function withinBookingWindow(startMs: number, nowMs: number, noticeHours: number) {
  return (
    Number.isFinite(startMs) &&
    startMs >= nowMs + noticeHours * 3600000 &&
    startMs <= nowMs + BOOKING_WINDOW_HOURS * 3600000
  );
}
export function validWeeklyHours(hours: Record<string, Array<[string, string]>>) {
  return Object.entries(hours).every(
    ([day, ranges]) =>
      Number(day) >= 0 &&
      Number(day) <= 6 &&
      (day !== "0" || ranges.length === 0) &&
      ranges.every(
        ([a, b]) =>
          /^([01]\d|2[0-3]):[0-5]\d$/.test(a) && /^([01]\d|2[0-3]):[0-5]\d$/.test(b) && a < b,
      ),
  );
}
