import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw, Wifi } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/speed-test")({
  head: () => ({
    meta: [
      { title: "E4CC Internet Speed Test" },
      { name: "description", content: "Test your internet connection speed for E4CC online positions." },
      { property: "og:title", content: "E4CC Internet Speed Test" },
      { property: "og:description", content: "Test your internet connection speed for E4CC online positions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpeedTestPage,
});

type Result = { download: number; upload: number; ping: number };

function SpeedTestPage() {
  const [testing, setTesting] = useState(false);
  const [live, setLive] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function runTest() {
    setTesting(true);
    setError("");
    setLive("Starting…");
    try {
      const CF = "https://speed.cloudflare.com";
      const median = (a: number[]) => {
        const s = [...a].sort((x, y) => x - y);
        return s[Math.floor(s.length / 2)] ?? 0;
      };
      let ping = 0,
        dl = 0,
        ul = 0;
      try {
        setLive("Measuring ping…");
        const pings: number[] = [];
        for (let i = 0; i < 8; i++) {
          const t = performance.now();
          const r = await fetch(`${CF}/__down?bytes=0&r=${Math.random()}`, { cache: "no-store" });
          await r.arrayBuffer();
          pings.push(performance.now() - t);
        }
        ping = median(pings.slice(1));

        const start = performance.now();
        const endAt = start + 8000;
        let bytes = 0;
        let measuredFrom = 0;
        let measuredBytes = 0;
        const worker = async () => {
          let size = 1_000_000;
          while (performance.now() < endAt) {
            const r = await fetch(`${CF}/__down?bytes=${size}&r=${Math.random()}`, { cache: "no-store" });
            const reader = r.body!.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              bytes += value.byteLength;
              const now = performance.now();
              if (now - start > 1000) {
                if (!measuredFrom) {
                  measuredFrom = now;
                  measuredBytes = bytes;
                } else {
                  const mbps = ((bytes - measuredBytes) * 8) / ((now - measuredFrom) / 1000) / 1e6;
                  setLive(`Testing download… ${mbps.toFixed(0)} Mbps`);
                }
              }
              if (now > endAt) {
                void reader.cancel();
                break;
              }
            }
            size = Math.min(size * 2, 25_000_000);
          }
        };
        setLive("Testing download…");
        await Promise.all(Array.from({ length: 6 }, worker));
        dl = measuredFrom
          ? ((bytes - measuredBytes) * 8) / ((performance.now() - measuredFrom) / 1000) / 1e6
          : 0;

        setLive("Testing upload…");
        const uStart = performance.now();
        const uEnd = uStart + 6000;
        let sent = 0;
        const blob = new Uint8Array(5_000_000);
        const upWorker = async () => {
          while (performance.now() < uEnd) {
            const r = await fetch(`${CF}/__up?r=${Math.random()}`, {
              method: "POST",
              body: blob,
              cache: "no-store",
            });
            await r.arrayBuffer();
            sent += blob.byteLength;
            setLive(
              `Testing upload… ${((sent * 8) / ((performance.now() - uStart) / 1000) / 1e6).toFixed(0)} Mbps`,
            );
          }
        };
        await Promise.all(Array.from({ length: 4 }, upWorker));
        ul = (sent * 8) / ((performance.now() - uStart) / 1000) / 1e6;
        if (!dl || !ul) throw new Error("empty");
      } catch {
        // Fallback: our own endpoint so the user is never blocked.
        setLive("Testing…");
        const t0 = performance.now();
        await fetch(`/api/public/speed-test?ping=${Date.now()}`, {
          method: "POST",
          body: "x",
          cache: "no-store",
        });
        ping = performance.now() - t0;
        const t1 = performance.now();
        const sizes = await Promise.all(
          Array.from({ length: 4 }, (_, i) =>
            fetch(`/api/public/speed-test?d=${Date.now()}-${i}`, { cache: "no-store" })
              .then((r) => r.arrayBuffer())
              .then((b) => b.byteLength),
          ),
        );
        dl =
          (sizes.reduce((a, b) => a + b, 0) * 8) /
          Math.max((performance.now() - t1) / 1000, 0.05) /
          1e6;
        const chunk = new Uint8Array(2 * 1024 * 1024);
        const t2 = performance.now();
        await Promise.all(
          Array.from({ length: 4 }, () =>
            fetch("/api/public/speed-test", { method: "POST", body: chunk, cache: "no-store" }),
          ),
        );
        ul = (chunk.byteLength * 4 * 8) / Math.max((performance.now() - t2) / 1000, 0.05) / 1e6;
      }
      const r1 = (n: number) => Math.round(n * 10) / 10;
      setResult({ download: r1(dl), upload: r1(ul), ping: Math.round(ping) });
      setLive("");
    } catch {
      setError("We could not complete the speed test. Please try again.");
      setLive("");
    } finally {
      setTesting(false);
    }
  }

  const passed =
    result ? result.download >= 10 && result.upload >= 10 : false;

  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <BrandMark className="h-8" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-4 px-5 py-7">
        <section className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Internet Speed Test</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Online positions require at least 10 Mbps download and 10 Mbps upload. This test
            measures against servers near you and takes about 15 seconds.
          </p>

          <Button className="mt-4" disabled={testing} onClick={() => void runTest()}>
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {testing ? "Testing…" : result ? "Test again" : "Start test"}
          </Button>

          {testing && live && <p className="mt-2 text-sm text-muted-foreground">{live}</p>}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          {result && !testing && (
            <div className="mt-5">
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Download" value={`${result.download} Mbps`} />
                <Metric label="Upload" value={`${result.upload} Mbps`} />
                <Metric label="Ping" value={`${result.ping} ms`} />
              </div>
              <div
                className={`mt-4 rounded-md p-3 text-center text-sm font-medium ${
                  passed
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {passed
                  ? "✓ Your connection meets the minimum requirements for online positions."
                  : "Your connection is below the minimum (10 Mbps download / 10 Mbps upload). Try again or apply for an Onsite position."}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <span className="block text-lg font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
