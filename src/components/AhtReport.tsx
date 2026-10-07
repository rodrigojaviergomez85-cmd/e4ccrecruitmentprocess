import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Timer } from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatDuration } from "@/components/InterviewTimer";
import { getAhtReport } from "@/lib/aht.functions";

type Row = { id: string; name: string; count: number; avgSeconds: number; minSeconds: number; maxSeconds: number };

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No timed interviews yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1">Name</th><th>Interviews</th><th>AHT</th><th>Min</th><th>Max</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="py-1.5 font-medium">{r.name}</td>
                <td>{r.count}</td>
                <td className="font-mono font-semibold text-primary">{formatDuration(r.avgSeconds)}</td>
                <td className="font-mono">{formatDuration(r.minSeconds)}</td>
                <td className="font-mono">{formatDuration(r.maxSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Admin-only AHT per Recruitment interviewer and per Manager. */
export function AhtReport() {
  const fetchReport = useServerFn(getAhtReport);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["aht", from, to],
    queryFn: () => fetchReport({ data: { from: from || undefined, to: to || undefined } }),
  });
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Timer className="h-4 w-4" /> AHT per interviewer</h2>
        <div className="flex items-center gap-2 text-xs">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" aria-label="From" />
          <span>–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" aria-label="To" />
        </div>
      </div>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-xs text-destructive">Could not load AHT.</p>
      ) : (
        <div className="flex flex-col gap-6 md:flex-row">
          <Table title="Recruitment" rows={data?.recruitment ?? []} />
          <Table title="Manager" rows={data?.manager ?? []} />
        </div>
      )}
    </section>
  );
}
