import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Circle, Play, RefreshCw, Square, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  MAX_ATTEMPTS,
  MAX_RECORD_SECONDS,
  MIN_RECORD_SECONDS,
  PREP_SECONDS,
} from "@/lib/recruitment";
import { formatTime, pickVideoType, type Recording } from "./media";
import { useMediaStream } from "./useMediaStream";

type Phase = "prep" | "ready" | "recording" | "review";

export function VideoRecorder({
  slot,
  question,
  busy,
  onContinue,
}: {
  slot: number;
  question: string;
  busy?: boolean;
  onContinue: (recording: Recording) => void;
}) {
  const { state, error, request, stop, streamRef } = useMediaStream();
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<HTMLVideoElement | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("prep");
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);

  useEffect(() => {
    void request();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  useEffect(() => {
    if (state === "ready" && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      void liveVideoRef.current.play().catch(() => {});
    }
  }, [state, phase, streamRef]);

  useEffect(() => {
    if (phase !== "prep") return;
    const id = setInterval(() => {
      setPrepLeft((v) => {
        if (v <= 1) {
          clearInterval(id);
          setPhase("ready");
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const stopRecording = useCallback(() => {
    videoRecorderRef.current?.state === "recording" && videoRecorderRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    const stream = streamRef.current ?? (await request());
    if (!stream) return;

    const videoType = pickVideoType();
    const videoChunks: Blob[] = [];

    const videoRecorder = new MediaRecorder(
      stream,
      videoType.mimeType ? { mimeType: videoType.mimeType, videoBitsPerSecond: 1_500_000 } : {},
    );

    videoRecorder.ondataavailable = (e) => e.data.size && videoChunks.push(e.data);

    videoRecorder.onstop = () => {
      const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
      const videoBlob = new Blob(videoChunks, { type: videoType.mimeType ?? "video/mp4" });
      setRecording({
        videoBlob,
        videoExt: videoType.ext,
        durationSeconds,
        previewUrl: URL.createObjectURL(videoBlob),
      });
      setAttempts((a) => a + 1);
      setPhase("review");
    };

    videoRecorderRef.current = videoRecorder;
    startedAtRef.current = Date.now();
    setElapsed(0);
    videoRecorder.start(1000);
    setPhase("recording");

    timerRef.current = setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_RECORD_SECONDS) stopRecording();
    }, 250);
  }, [request, stopRecording, streamRef]);

  const recordAgain = () => {
    if (recording) URL.revokeObjectURL(recording.previewUrl);
    setRecording(null);
    setElapsed(0);
    setPhase("ready");
  };

  const tooShort = recording ? recording.durationSeconds < MIN_RECORD_SECONDS : false;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          Video {slot} of 2
        </p>
        <h2 className="mt-2 text-xl font-bold sm:text-2xl">{question}</h2>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-foreground/95 shadow-sm">
        <div className="relative aspect-[3/4] w-full sm:aspect-video">
          {phase === "review" && recording ? (
            <video
              ref={playbackRef}
              src={recording.previewUrl}
              controls
              playsInline
              className="h-full w-full bg-black object-contain"
            />
          ) : (
            <video
              ref={liveVideoRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full scale-x-[-1] bg-black object-cover"
            />
          )}

          {phase === "recording" && (
            <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground">
              <Circle className="h-3 w-3 animate-pulse fill-current" />
              REC {formatTime(elapsed)}
            </div>
          )}

          {phase === "prep" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-foreground/70 p-6 text-center text-background">
              <p className="text-sm font-medium opacity-90">
                You have 30 seconds to think about your answer.
              </p>
              <p className="font-display text-6xl font-extrabold tabular-nums">{prepLeft}</p>
              <Button variant="secondary" size="sm" onClick={() => setPhase("ready")}>
                I&apos;m ready now
              </Button>
            </div>
          )}
        </div>

        {phase === "recording" && (
          <div className="space-y-2 bg-card p-4">
            <Progress value={(elapsed / MAX_RECORD_SECONDS) * 100} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Recommended minimum {formatTime(MIN_RECORD_SECONDS)}</span>
              <span>Maximum {formatTime(MAX_RECORD_SECONDS)}</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase === "ready" && (
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base"
          onClick={() => void startRecording()}
          disabled={state !== "ready"}
        >
          <Video className="mr-2 h-5 w-5" /> Start Recording
        </Button>
      )}

      {phase === "prep" && (
        <Button size="lg" className="h-14 w-full rounded-2xl text-base" disabled>
          Start Recording available in {prepLeft}s
        </Button>
      )}

      {phase === "recording" && (
        <Button
          size="lg"
          variant="destructive"
          className="h-14 w-full rounded-2xl text-base"
          onClick={stopRecording}
        >
          <Square className="mr-2 h-5 w-5" /> Stop Recording
        </Button>
      )}

      {phase === "review" && recording && (
        <div className="space-y-3">
          {tooShort && (
            <p className="rounded-2xl bg-accent p-3 text-sm text-accent-foreground">
              Your answer was {formatTime(recording.durationSeconds)}. We recommend at least 1
              minute — you can record again if you&apos;d like.
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            <Play className="mr-1 inline h-4 w-4" />
            Watch your recording above. Attempt {attempts} of {MAX_ATTEMPTS}.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {attempts < MAX_ATTEMPTS && (
              <Button
                variant="outline"
                size="lg"
                className="h-14 flex-1 rounded-2xl"
                onClick={recordAgain}
                disabled={busy}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Record again
              </Button>
            )}
            <Button
              size="lg"
              className="h-14 flex-1 rounded-2xl text-base"
              onClick={() => onContinue(recording)}
              disabled={busy}
            >
              {busy ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
