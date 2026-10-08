import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Timer } from "lucide-react";

import { pauseInterviewTimer, startInterviewTimer } from "@/lib/aht.functions";

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live clock that starts automatically when the interview is opened. It pauses when the page is left or the tab is hidden, resumes on return, and stops for good when the interview is finished. */
export function InterviewTimer(props: {
  kind: "recruitment" | "manager";
  evaluationId: string | null | undefined;
  startedAt: string | null | undefined;
  endedAt: string | null | undefined;
  handleSeconds: number | null | undefined;
  canStart: boolean;
}) {
  const start = useServerFn(startInterviewTimer);
  const pause = useServerFn(pauseInterviewTimer);
  const [startedAt, setStartedAt] = useState<string | null>(props.startedAt ?? null);
  const [accumulated, setAccumulated] = useState<number>(props.handleSeconds ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const autoStarted = useRef(false);
  useEffect(() => {
    setStartedAt(props.startedAt ?? null);
    setAccumulated(props.handleSeconds ?? 0);
  }, [props.startedAt, props.handleSeconds]);

  const finished = props.endedAt != null;
  const running = Boolean(startedAt) && !finished;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Auto-start / resume: opening an unfinished interview starts the clock, no button needed.
  useEffect(() => {
    if (autoStarted.current || startedAt || finished) return;
    if (!props.canStart || !props.evaluationId) return;
    autoStarted.current = true;
    start({ data: { kind: props.kind, evaluationId: props.evaluationId } })
      .then((r) => {
        setStartedAt(r.startedAt);
        setNow(Date.now());
      })
      .catch(() => {
        autoStarted.current = false;
      });
  }, [start, startedAt, finished, props.canStart, props.evaluationId, props.kind]);

  // Pause when leaving the page or hiding the tab so the AHT is not inflated.
  useEffect(() => {
    if (!props.evaluationId || finished) return;
    const id = props.evaluationId;
    const kind = props.kind;
    const doPause = () => {
      if (!startedAt) return;
      const elapsed = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
      setAccumulated((a) => a + elapsed);
      setStartedAt(null);
      autoStarted.current = false;
      pause({ data: { kind, evaluationId: id } }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") doPause();
    };
    window.addEventListener("pagehide", doPause);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", doPause);
      document.removeEventListener("visibilitychange", onVisibility);
      doPause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.evaluationId, props.kind, finished, startedAt != null]);

  if (finished) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
        <Timer className="h-3.5 w-3.5" /> Duration {formatDuration(props.handleSeconds ?? 0)}
      </span>
    );
  }
  const elapsed = startedAt ? Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000)) : 0;
  const total = accumulated + elapsed;
  if (startedAt || total > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 font-mono text-sm font-semibold text-primary">
        <Timer className="h-4 w-4" /> {formatDuration(total)}
      </span>
    );
  }
  return null;
}
