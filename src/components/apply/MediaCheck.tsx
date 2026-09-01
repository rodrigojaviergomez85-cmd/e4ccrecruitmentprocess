import { useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Mic, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMediaStream } from "./useMediaStream";

export function MediaCheck({ onReady }: { onReady: () => void }) {
  const { state, error, level, request, stop, streamRef } = useMediaStream();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void request();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === "ready" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [state, streamRef]);

  const ready = state === "ready";
  const micActive = level > 0.06;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Camera & microphone check</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Allow access so you can record your answers here in the browser. Uploading a
          pre-recorded video is not possible — every answer is recorded live.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-sm">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="aspect-[3/4] w-full scale-x-[-1] object-cover sm:aspect-video"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Video className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">Camera</span>
          {ready ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Ready
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Waiting…</span>
          )}
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Mic className="h-5 w-5 text-primary" />
          <span className="flex-1 text-sm font-medium">Microphone</span>
          {ready ? (
            <span className="flex items-center gap-1 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Ready
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Waiting…</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-medium">
          Test your microphone — say &quot;Hello, my name is…&quot;
        </p>
        <div className="mt-3 flex h-8 items-end gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-full transition-all duration-100",
                level * 24 > i ? "bg-primary" : "bg-muted",
              )}
              style={{ height: `${20 + i * 1.5}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {micActive ? "We can hear you clearly 🎉" : "Speak to see the bars move."}
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={() => void request()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      <Button
        size="lg"
        className="h-14 w-full rounded-2xl text-base"
        disabled={!ready}
        onClick={onReady}
      >
        I&apos;m Ready
      </Button>
    </div>
  );
}
