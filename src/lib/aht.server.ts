/** Stops a running interview timer when the interview is finished. */
export async function stopInterviewTimer(
  db: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  table: "interview_evaluations" | "manager_evaluations",
  id: string,
) {
  const { data } = await db.from(table).select("timer_started_at, timer_ended_at, handle_seconds").eq("id", id).maybeSingle();
  if (!data?.timer_started_at || data.timer_ended_at) return;
  const end = new Date();
  const elapsed = Math.max(0, Math.round((end.getTime() - new Date(data.timer_started_at).getTime()) / 1000));
  const seconds = (data.handle_seconds ?? 0) + elapsed;
  await db.from(table).update({ timer_ended_at: end.toISOString(), handle_seconds: seconds }).eq("id", id);
}

