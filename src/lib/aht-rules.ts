/** Max seconds a single timer segment (open/resume → pause/finish) may add. */
export const MAX_SEGMENT_SECONDS = 90 * 60;
/** Without a heartbeat for this long, the segment ends at the last heartbeat. */
export const HEARTBEAT_STALE_SECONDS = 3 * 60;
/** Interview durations above this are treated as broken data and excluded from AHT. */
export const MAX_VALID_HANDLE_SECONDS = 3 * 60 * 60;

/** Seconds a running segment contributes, capped and cut at the last heartbeat if stale. */
export function segmentSeconds(startedAt: string, lastSeenAt: string | null, nowMs: number): number {
  const start = new Date(startedAt).getTime();
  let end = nowMs;
  if (lastSeenAt) {
    const seen = new Date(lastSeenAt).getTime();
    if (nowMs - seen > HEARTBEAT_STALE_SECONDS * 1000) end = seen;
  }
  return Math.min(MAX_SEGMENT_SECONDS, Math.max(0, Math.round((end - start) / 1000)));
}

export function validHandleSeconds(v: number | null | undefined): v is number {
  return typeof v === "number" && v > 0 && v <= MAX_VALID_HANDLE_SECONDS;
}
