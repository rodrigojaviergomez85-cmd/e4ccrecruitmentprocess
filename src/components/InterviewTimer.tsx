import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, Timer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startInterviewTimer } from "@/lib/aht.functions";

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Iniciar button + live clock. The timer stops on the server when the interview is finished. */
export function InterviewTimer(props: {
  kind: "recruitment" | "manager";
  evaluationId: string | null | undefined;
  startedAt: string | null | undefined;
  handleSeconds: number | null | undefined;
  canStart: boolean;
}) {
  const start = useServerFn(startInterviewTimer);
  const [startedAt, setStartedAt] = useState<string | null>(props.startedAt ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => setStartedAt(props.startedAt ?? null), [props.startedAt]);
  const running = Boolean(startedAt) && props.handleSeconds == null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (props.handleSeconds != null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
        <Timer className="h-3.5 w-3.5" /> Duration {formatDuration(props.handleSeconds)}
      </span>
    );
  }
  if (startedAt) {
    const secs = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-semibold text-primary">
        <Timer className="h-4 w-4" /> {formatDuration(secs)}
      </span>
    );
  }
  if (!props.canStart || !props.evaluationId) return null;
  return (
    <Button
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await start({ data: { kind: props.kind, evaluationId: props.evaluationId! } });
          setStartedAt(r.startedAt);
          setNow(Date.now());
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not start the timer.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Play className="mr-1 h-4 w-4" /> Iniciar
    </Button>
  );
}
