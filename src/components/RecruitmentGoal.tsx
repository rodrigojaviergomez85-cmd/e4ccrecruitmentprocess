import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { listRequisitions, listTrainingRoster } from "@/lib/training.functions";
import { openSpots, weeklyMinimum } from "@/lib/training";

/** Monthly hiring goal from requisitions: open spots by Online/Onsite and weekly minimum until each wave starts. */
export function RecruitmentGoal({ group }: { group?: string | undefined } = {}) {
  const listReq = useServerFn(listRequisitions);
  const listRoster = useServerFn(listTrainingRoster);
  const { data: req } = useQuery({ queryKey: ["requisitions"], queryFn: () => listReq() });
  const { data: roster } = useQuery({ queryKey: ["training-roster"], queryFn: () => listRoster() });
  if (!req || !roster) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const upcoming = req.spots.filter((s) => (!s.waveStart || s.waveStart >= today) && (!group || s.group === group));
  const open = openSpots(upcoming, roster.rows);
  if (!upcoming.length) return null;
  const waves = new Map<string, { group: string; waveStart: string | null; open: number }>();
  for (const o of open) {
    const k = `${o.group}|${o.waveStart}`;
    waves.set(k, { group: o.group, waveStart: o.waveStart, open: (waves.get(k)?.open ?? 0) + 1 });
  }
  const list = [...waves.values()].sort((a, b) => (a.waveStart ?? "").localeCompare(b.waveStart ?? ""));
  const online = open.filter((o) => o.group === "ONLINE").length;
  const onsite = open.length - online;
  const weekly = list.reduce((n, w) => n + weeklyMinimum(w.open, w.waveStart, today), 0);
  return (
    <section className="border-2 border-destructive bg-destructive/5 p-4 text-destructive">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase"><Target className="h-4 w-4" />Meta de reclutamiento</div>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <div><p className="text-4xl font-bold">{online}</p><p className="text-sm font-medium">por reclutar ONLINE</p></div>
        <div><p className="text-4xl font-bold">{onsite}</p><p className="text-sm font-medium">por reclutar ONSITE</p></div>
        <div><p className="text-4xl font-bold">{weekly}</p><p className="text-sm font-medium">contrataciones mínimas por semana</p></div>
      </div>
      {list.length > 0 && <p className="mt-3 text-xs">{list.map((w) => `${w.group} · wave ${w.waveStart ?? "sin fecha"}: ${w.open} cupos (${weeklyMinimum(w.open, w.waveStart, today)}/semana)`).join("  ·  ")}</p>}
    </section>
  );
}
