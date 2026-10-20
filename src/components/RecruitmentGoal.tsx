import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { listRequisitions, listTrainingRoster } from "@/lib/training.functions";
import { getRecruitmentMetrics } from "@/lib/metrics.functions";
import { openSpots, weeklyMinimum } from "@/lib/training";
import { CERTIFICATION_OWNER, certificationBoard, quotaFor, recruiterBoard } from "@/lib/recruiter-quota";

/** Monthly hiring goal from requisitions, split per recruiter (65/35), plus trainer certification results. */
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
  const cert = metrics ? certificationBoard(metrics.rows, monthStart) : null;
  return (
    <section className="border-2 border-destructive bg-destructive/5 p-4 text-destructive">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase"><Target className="h-4 w-4" />Meta de reclutamiento</div>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <div><p className="text-4xl font-bold">{online}</p><p className="text-sm font-medium">por reclutar ONLINE</p></div>
        <div><p className="text-4xl font-bold">{onsite}</p><p className="text-sm font-medium">por reclutar ONSITE</p></div>
        <div><p className="text-4xl font-bold">{weekly}</p><p className="text-sm font-medium">contrataciones mínimas por semana</p></div>
      </div>
      {list.length > 0 && <p className="mt-3 text-xs">{list.map((w) => `${w.group} · wave ${w.waveStart ?? "sin fecha"}: ${w.open} cupos (${weeklyMinimum(w.open, w.waveStart, today)}/semana)`).join("  ·  ")}</p>}
      {board && cert && (
        <div className="mt-4 grid gap-3 border-t border-destructive/30 pt-3 sm:grid-cols-3">
          {board.map((r) => {
            const goal = quotaFor(open.length, r.share);
            return (
              <div key={r.name} className="rounded border border-destructive/30 bg-background p-3">
                <p className="text-sm font-semibold">{r.name} · {Math.round(r.share * 100)}%</p>
                <p className="mt-1 text-3xl font-bold">{r.approved}<span className="text-base font-medium"> aprobados a Training este mes</span></p>
                <p className="text-xs">Meta: {goal} por reclutar · {quotaFor(weekly, r.share)} por semana</p>
                <p className="mt-1 text-xs text-foreground">Enviados a 2º Filtro: <b>{r.sent}</b> · Calidad: <b>{r.quality == null ? "—" : `${r.quality}%`}</b></p>
              </div>
            );
          })}
          <div className="rounded border border-border bg-background p-3 text-foreground">
            <p className="text-sm font-semibold">{CERTIFICATION_OWNER.name} · Training</p>
            <p className="mt-1 text-3xl font-bold">{cert.certified}<span className="text-base font-medium"> certificados este mes</span></p>
            <p className="text-xs">Not certified: <b>{cert.notCertified}</b> · % certificación: <b>{cert.rate == null ? "—" : `${cert.rate}%`}</b> · In Training: <b>{cert.inTraining}</b></p>
          </div>
        </div>
      )}
    </section>
  );
}
