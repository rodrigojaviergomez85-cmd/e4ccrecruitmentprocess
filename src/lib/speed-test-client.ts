// Browser-only internet speed measurement. One call = one complete attempt.
// Throws when any phase fails — callers must never save made-up numbers.
export type SpeedResult = { download: number; upload: number; ping: number };

const CF = "https://speed.cloudflare.com";
const r1 = (n: number) => Math.round(n * 10) / 10;
const mbps = (bytes: number, ms: number) => (bytes * 8) / (ms / 1000) / 1e6;

export async function measureSpeed(onLive: (text: string) => void): Promise<SpeedResult> {
  // Ping: median of small uncached requests.
  onLive("Measuring ping…");
  const pings: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = performance.now();
    const r = await fetch(`${CF}/__down?bytes=0&r=${Math.random()}`, { cache: "no-store" });
    if (!r.ok) throw new Error("ping failed");
    await r.arrayBuffer();
    pings.push(performance.now() - t);
  }
  const sorted = pings.slice(1).sort((a, b) => a - b);
  const ping = sorted[Math.floor(sorted.length / 2)] ?? 0;

  // Download: 6 parallel streams for ~8 s. Bytes and time are counted only
  // between the first chunk after a 1 s warm-up and the last chunk received.
  onLive("Measuring download…");
  const start = performance.now();
  const endAt = start + 8000;
  let bytes = 0, fromAt = 0, fromBytes = 0, lastAt = 0;
  const dlWorker = async () => {
    let size = 1_000_000;
    while (performance.now() < endAt) {
      const r = await fetch(`${CF}/__down?bytes=${size}&r=${Math.random()}`, { cache: "no-store" });
      if (!r.ok || !r.body) throw new Error("download failed");
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        if (now > endAt) { void reader.cancel(); break; }
        bytes += value.byteLength;
        lastAt = now;
        if (now - start > 1000) {
          if (!fromAt) { fromAt = now; fromBytes = bytes; }
          else if (now - fromAt > 200) onLive(`Measuring download… ${mbps(bytes - fromBytes, now - fromAt).toFixed(0)} Mbps (provisional)`);
        }
      }
      size = Math.min(size * 2, 25_000_000);
    }
  };
  await Promise.all(Array.from({ length: 6 }, dlWorker));
  if (!fromAt || lastAt - fromAt < 500) throw new Error("download incomplete");
  const download = mbps(bytes - fromBytes, lastAt - fromAt);

  // Upload: 4 parallel posts for ~6 s, counting completed transfers until the last completion.
  onLive("Measuring upload…");
  const uStart = performance.now();
  const uEnd = uStart + 6000;
  let sent = 0, uLast = 0;
  const blob = new Uint8Array(5_000_000);
  const upWorker = async () => {
    while (performance.now() < uEnd) {
      const r = await fetch(`${CF}/__up?r=${Math.random()}`, { method: "POST", body: blob, cache: "no-store" });
      if (!r.ok) throw new Error("upload failed");
      await r.arrayBuffer();
      sent += blob.byteLength;
      uLast = performance.now();
      onLive(`Measuring upload… ${mbps(sent, uLast - uStart).toFixed(0)} Mbps (provisional)`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, upWorker));
  if (!sent) throw new Error("upload incomplete");
  const upload = mbps(sent, uLast - uStart);

  return { download: r1(download), upload: r1(upload), ping: Math.round(ping) };
}

export const meetsMinimum = (r: { download: number; upload: number }) => r.download >= 10 && r.upload >= 10;
