import { segmentSeconds } from "./aht-rules";

/** Stops a running interview timer when the interview is finished. */
export async function stopInterviewTimer(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  table: "interview_evaluations" | "manager_evaluations",
  id: string,
) {
  const { data } = await db
    .from(table)
    .select("timer_started_at, timer_ended_at, timer_last_seen_at, handle_seconds")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.timer_ended_at) return;
  // A paused timer (no timer_started_at) still finishes with its accumulated time.
  if (!data.timer_started_at && data.handle_seconds == null) return;
  const end = new Date();
  const elapsed = data.timer_started_at ? segmentSeconds(data.timer_started_at, data.timer_last_seen_at, end.getTime()) : 0;
  const seconds = (data.handle_seconds ?? 0) + elapsed;
  await db.from(table).update({ timer_ended_at: end.toISOString(), handle_seconds: seconds }).eq("id", id);
}
