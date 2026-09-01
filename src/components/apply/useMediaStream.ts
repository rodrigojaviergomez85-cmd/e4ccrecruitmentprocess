import { useCallback, useEffect, useRef, useState } from "react";

export type MediaState = "idle" | "requesting" | "ready" | "denied" | "unsupported";

export function useMediaStream() {
  const [state, setState] = useState<MediaState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState("idle");
    setLevel(0);
  }, []);

  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError("This browser does not support in-browser recording. Please try Chrome or Safari.");
      return null;
    }
    setState("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setState("ready");

      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (const v of buffer) sum += (v - 128) ** 2;
          const rms = Math.sqrt(sum / buffer.length) / 128;
          setLevel((prev) => prev * 0.6 + Math.min(1, rms * 3) * 0.4);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
      return stream;
    } catch (err) {
      setState("denied");
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Please allow access in your browser and try again."
          : "We couldn't access your camera or microphone. Check that no other app is using them.",
      );
      return null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { state, error, level, request, stop, streamRef };
}
