/** Stops a running interview timer when the interview is finished. */
export async function stopInterviewTimer(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  table: "interview_evaluations" | "manager_evaluations",
  id: string,
) {
  const { data } = await db.from(table).select("timer_started_at, timer_ended_at").eq("id", id).maybeSingle();
  if (!data?.timer_started_at || data.timer_ended_at) return;
  const end = new Date();
  const seconds = Math.max(0, Math.round((end.getTime() - new Date(data.timer_started_at).getTime()) / 1000));
  await db.from(table).update({ timer_ended_at: end.toISOString(), handle_seconds: seconds }).eq("id", id);
}

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
