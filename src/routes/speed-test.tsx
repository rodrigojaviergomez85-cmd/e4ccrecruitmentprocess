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
    setResult(null);
    setLive("Measuring…");
    try {
      setResult(await measureSpeed(setLive));
    } catch {
      setError("We could not complete the speed test. Please try again.");
    } finally {
      setLive("");
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
