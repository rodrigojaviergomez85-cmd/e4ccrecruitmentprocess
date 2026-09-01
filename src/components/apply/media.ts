export type Recording = {
  videoBlob: Blob;
  videoExt: "webm" | "mp4";
  durationSeconds: number;
  previewUrl: string;
};

function supports(type: string) {
  return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);
}

export function pickVideoType(): { mimeType?: string; ext: "webm" | "mp4" } {
  const candidates: Array<[string, "webm" | "mp4"]> = [
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
    ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
  ];
  for (const [mimeType, ext] of candidates) {
    if (supports(mimeType)) return { mimeType, ext };
  }
  return { ext: "mp4" };
}


export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
