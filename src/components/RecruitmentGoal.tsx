import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { listRequisitions, listTrainingRoster } from "@/lib/training.functions";
import { getRecruitmentMetrics } from "@/lib/metrics.functions";
import { openSpots, weeklyMinimum } from "@/lib/training";
import { quotaFor, recruiterBoard } from "@/lib/recruiter-quota";

type RecruiterCard = {
  name: string;
  sharePct: number;
  approved: number;
  goal: number;
  lobText: string;
  weekText: string;
  sent: number;
  quality: number | null;
};

/** Monthly hiring goal from requisitions, split per recruiter (Morena/Kennia). */
export function RecruitmentGoal({
  group,
  compact = false,
}: {
  group?: string | undefined;
  compact?: boolean;
} = {}) {
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
  const waveLines = list.map((w) => `${w.group} · wave ${w.waveStart ?? "sin fecha"}: ${w.open} cupos (${weeklyMinimum(w.open, w.waveStart, today)}/semana)`);

  // Recruiter goals always cover every open spot, whichever LOB tab is open.
  const allSpots = req.spots.filter((s) => !s.waveStart || s.waveStart >= today);
  const allOpen = openSpots(allSpots, roster.rows);
  const weeklyAll = (() => {
    const m = new Map<string, { open: number; wave: string | null }>();
    for (const o of allOpen) { const k = `${o.group}|${o.waveStart}`; m.set(k, { open: (m.get(k)?.open ?? 0) + 1, wave: o.waveStart }); }
    return [...m.values()].reduce((n, w) => n + weeklyMinimum(w.open, w.wave, today), 0);
  })();

  const cards: RecruiterCard[] | null = board
    ? board.map((r) => {
        const goal = quotaFor(allSpots.length, r.share);
        const mine = roster.rows.filter((x) => x.recruiter.toLowerCase().includes(r.match));
        const byLob = new Map<string, { spots: number; wave: string }>();
        for (const s of allSpots) {
          const cur = byLob.get(s.group);
          const w = s.waveStart ?? "9999";
          byLob.set(s.group, { spots: (cur?.spots ?? 0) + 1, wave: cur && cur.wave < w ? cur.wave : w });
        }
        const lobs = [...byLob.entries()].sort((a, b) => a[1].wave.localeCompare(b[1].wave) || a[0].localeCompare(b[0]));
        // Weekly minimum broken down per LOB, plus this week's approvals per LOB.
        const weeklyByLob = (() => {
          const m = new Map<string, { open: number; wave: string | null }>();
          for (const o of allOpen) { const k = `${o.group}|${o.waveStart}`; m.set(k, { open: (m.get(k)?.open ?? 0) + 1, wave: o.waveStart }); }
          const out = new Map<string, { mine: number; min: number; wave: string }>();
          for (const [k, w] of m) {
            const [lob = ""] = k.split("|");
            const wave = w.wave ?? "9999";
            const cur = out.get(lob) ?? { mine: 0, min: 0, wave };
            cur.min += weeklyMinimum(w.open, w.wave, today);
            if (wave < cur.wave) cur.wave = wave;
            out.set(lob, cur);
          }
          const approvedThisWeek = mine.filter((x) => (x.recruitmentApprovedAt ?? "") >= weekStart);
          for (const [lob, v] of out) v.mine = approvedThisWeek.filter((x) => x.group === lob).length;
          return [...out.entries()].sort((a, b) => a[1].wave.localeCompare(b[1].wave) || a[0].localeCompare(b[0]));
        })();
        const weekText = weeklyByLob.length
          ? weeklyByLob.map(([lob, v]) => `${lob} ${v.mine}/${v.min}`).join("  ·  ")
          : `0/${quotaFor(weeklyAll, r.share)}`;
        return {
          name: r.name,
          sharePct: Math.round(r.share * 100),
          approved: mine.length,
          goal,
          lobText: lobs.map(([lob, v]) => `${lob} ${mine.filter((x) => x.group === lob).length}/${quotaFor(v.spots, r.share)}`).join("  ·  "),
          weekText,
          sent: r.sent,
          quality: r.quality,
        };
      })
    : null;

  if (compact) {
    return (
      <section className="border-2 border-destructive bg-destructive/5 p-2 text-destructive">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
          <Target className="h-3.5 w-3.5 shrink-0" /> Meta de reclutamiento
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <div><p className="text-xl font-bold leading-none">{online}</p><p className="mt-1 text-[10px] leading-tight">ONLINE</p></div>
          <div><p className="text-xl font-bold leading-none">{onsite}</p><p className="mt-1 text-[10px] leading-tight">ONSITE</p></div>
          <div><p className="text-xl font-bold leading-none">{weekly}</p><p className="mt-1 text-[10px] leading-tight">mín. sem.</p></div>
        </div>
        {waveLines.length > 0 && (
          <div className="mt-2 space-y-0.5 border-t border-destructive/30 pt-1.5 text-[10px] leading-tight">
            {waveLines.map((w) => <p key={w}>{w}</p>)}
          </div>
        )}
        {cards && (
          <div className="mt-2 space-y-1.5 border-t border-destructive/30 pt-1.5">
            {cards.map((c) => (
              <div key={c.name} className="rounded border border-destructive/30 bg-background p-2">
                <p className="text-[11px] font-semibold">{c.name} · {c.sharePct}%</p>
                <p className="text-lg font-bold leading-tight">{c.approved}/{c.goal}<span className="ml-1 text-[10px] font-medium">aprobados a Training</span></p>
                <p className="text-[10px] leading-tight">{c.lobText}</p>
                <p className="mt-0.5 text-[10px] font-semibold leading-tight">Esta semana: {c.weekText}<span className="font-normal"> mínimo</span></p>
                <p className="mt-0.5 text-[10px] leading-tight text-foreground">2º Filtro: <b>{c.sent}</b> · % CR: <b>{c.quality == null ? "—" : `${c.quality}%`}</b></p>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="border-2 border-destructive bg-destructive/5 p-4 text-destructive">
      <div className="flex items-center gap-2 text-sm font-semibold uppercase"><Target className="h-4 w-4" />Meta de reclutamiento</div>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <div><p className="text-4xl font-bold">{online}</p><p className="text-sm font-medium">por reclutar ONLINE</p></div>
        <div><p className="text-4xl font-bold">{onsite}</p><p className="text-sm font-medium">por reclutar ONSITE</p></div>
        <div><p className="text-4xl font-bold">{weekly}</p><p className="text-sm font-medium">contrataciones mínimas por semana</p></div>
      </div>
      {waveLines.length > 0 && <p className="mt-3 text-xs">{waveLines.join("  ·  ")}</p>}
      {cards && (
        <div className="mt-4 grid gap-3 border-t border-destructive/30 pt-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.name} className="rounded border border-destructive/30 bg-background p-3">
              <p className="text-sm font-semibold">{c.name} · {c.sharePct}%</p>
              <p className="mt-1 text-3xl font-bold">{c.approved}/{c.goal}<span className="text-base font-medium"> aprobados a Training</span></p>
              <p className="mt-1 text-xs">{c.lobText}</p>
              <p className="mt-1 text-sm font-semibold">Esta semana: {c.weekText} <span className="font-normal">mínimo por semana</span></p>
              <p className="mt-1 text-xs text-foreground">Enviados a 2º Filtro este mes: <b>{c.sent}</b> · % CR: <b>{c.quality == null ? "—" : `${c.quality}%`}</b></p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
