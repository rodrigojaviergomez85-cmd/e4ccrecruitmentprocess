import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { listRequisitions, listTrainingRoster } from "@/lib/training.functions";
import { getRecruitmentMetrics } from "@/lib/metrics.functions";
import { openSpots, weeklyMinimum } from "@/lib/training";
import { quotaFor, recruiterBoard } from "@/lib/recruiter-quota";

/** Monthly hiring goal from requisitions, split per recruiter (Morena/Kennia). */
export function RecruitmentGoal({ group }: { group?: string | undefined } = {}) {
  const listReq = useServerFn(listRequisitions);
  const listRoster = useServerFn(listTrainingRoster);
  const metricsFn = useServerFn(getRecruitmentMetrics);
  const { data: req } = useQuery({ queryKey: ["requisitions"], queryFn: () => listReq() });
  const { data: roster } = useQuery({ queryKey: ["training-roster"], queryFn: () => listRoster() });
  const { data: metrics } = useQuery({ queryKey: ["recruitment-metrics"], queryFn: () => metricsFn(), retry: false });
  if (!req || !roster) return null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" });
  const monthStart = `${today.slice(0, 7)}-01`;
  // Week starts Monday (El Salvador date).
  const weekStart = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
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
  const board = metrics ? recruiterBoard(metrics.rows, monthStart) : null;
  return (
    <section className="border-2 border-destructive bg-destructive/5 p-4 text-destructive">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase"><Target className="h-4 w-4" />Meta de reclutamiento</div>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <div><p className="text-4xl font-bold">{online}</p><p className="text-sm font-medium">por reclutar ONLINE</p></div>
        <div><p className="text-4xl font-bold">{onsite}</p><p className="text-sm font-medium">por reclutar ONSITE</p></div>
        <div><p className="text-4xl font-bold">{weekly}</p><p className="text-sm font-medium">contrataciones mínimas por semana</p></div>
      </div>
      {list.length > 0 && <p className="mt-3 text-xs">{list.map((w) => `${w.group} · wave ${w.waveStart ?? "sin fecha"}: ${w.open} cupos (${weeklyMinimum(w.open, w.waveStart, today)}/semana)`).join("  ·  ")}</p>}
      {board && (
        <div className="mt-4 grid gap-3 border-t border-destructive/30 pt-3 sm:grid-cols-2">
          {board.map((r) => {
            const allSpots = req.spots.filter((s) => !s.waveStart || s.waveStart >= today);
            const goal = quotaFor(allSpots.length, r.share);
            const mine = roster.rows.filter((x) => x.recruiter.toLowerCase().includes(r.match));
            const allOpen = openSpots(allSpots, roster.rows);
            const byLob = new Map<string, { spots: number; wave: string }>();
            for (const s of allSpots) {
              const cur = byLob.get(s.group);
              const w = s.waveStart ?? "9999";
              byLob.set(s.group, { spots: (cur?.spots ?? 0) + 1, wave: cur && cur.wave < w ? cur.wave : w });
            }
            const lobs = [...byLob.entries()].sort((a, b) => a[1].wave.localeCompare(b[1].wave) || a[0].localeCompare(b[0]));
            const weeklyAll = (() => {
              const m = new Map<string, { open: number; wave: string | null }>();
              for (const o of allOpen) { const k = `${o.group}|${o.waveStart}`; m.set(k, { open: (m.get(k)?.open ?? 0) + 1, wave: o.waveStart }); }
              return [...m.values()].reduce((n, w) => n + weeklyMinimum(w.open, w.wave, today), 0);
            })();
            return (
              <div key={r.name} className="rounded border border-destructive/30 bg-background p-3">
                <p className="text-sm font-semibold">{r.name} · {Math.round(r.share * 100)}%</p>
                <p className="mt-1 text-3xl font-bold">{mine.length}/{goal}<span className="text-base font-medium"> aprobados a Training</span></p>
                <p className="mt-1 text-xs">
                  {lobs.map(([lob, v]) => `${lob} ${mine.filter((x) => x.group === lob).length}/${quotaFor(v.spots, r.share)}`).join("  ·  ")}
                </p>
                <p className="mt-1 text-sm font-semibold">Esta semana: {mine.filter((x) => (x.recruitmentApprovedAt ?? "") >= weekStart).length}/{quotaFor(weeklyAll, r.share)} <span className="font-normal">mínimo por semana</span></p>
                <p className="mt-1 text-xs text-foreground">Enviados a 2º Filtro este mes: <b>{r.sent}</b> · % CR: <b>{r.quality == null ? "—" : `${r.quality}%`}</b></p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
