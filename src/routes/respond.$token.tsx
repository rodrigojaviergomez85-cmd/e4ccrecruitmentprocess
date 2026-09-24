import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCandidateResponse, submitCandidateResponse } from "@/lib/manager.functions";

type Search = { action?: "reschedule" | "withdraw" };

export const Route = createFileRoute("/respond/$token")({
  validateSearch: (s: Record<string, unknown>): Search =>
    s["action"] === "reschedule" || s["action"] === "withdraw" ? { action: s["action"] } : {},
  head: () => ({
    meta: [
      { title: "Your E4CC Interview — Respond" },
      { name: "description", content: "Reschedule your E4CC final interview or withdraw your application." },
      { property: "og:title", content: "Your E4CC Interview — Respond" },
      { property: "og:description", content: "Reschedule your E4CC final interview or withdraw your application." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RespondPage,
});

function RespondPage() {
  const { token } = Route.useParams();
  const { action: initial } = Route.useSearch();
  const get = useServerFn(getCandidateResponse);
  const submit = useServerFn(submitCandidateResponse);
  const q = useQuery({ queryKey: ["respond", token], queryFn: () => get({ data: { token } }) });
  const [action, setAction] = useState<"reschedule" | "withdraw" | undefined>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { kind: "withdraw" } | { kind: "reschedule"; url: string }>(null);
  const [err, setErr] = useState("");

  async function go(kind: "reschedule" | "withdraw") {
    setBusy(true);
    setErr("");
    try {
      const r = await submit({ data: { token, action: kind, reason, confirmWithdraw: kind === "withdraw" } });
      if (!r.ok) setErr(r.error);
      else if (r.action === "reschedule") setDone({ kind: "reschedule", url: r.calendlyUrl });
      else setDone({ kind: "withdraw" });
    } catch {
      setErr("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4 py-10">
      <div className="w-full max-w-lg space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <BrandMark className="h-10" />
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {q.data && !q.data.valid && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">This link is no longer available</h1>
            <p className="text-sm text-muted-foreground">It may have expired or already been used. Please contact the E4CC Recruitment Team.</p>
            <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
          </div>
        )}
        {q.data?.valid && done?.kind === "withdraw" && (
          <div className="space-y-2">
            <h1 className="text-xl font-bold">Your application was withdrawn</h1>
            <p className="text-sm text-muted-foreground">Thank you for letting us know. We wish you success in your professional journey.</p>
          </div>
        )}
        {q.data?.valid && done?.kind === "reschedule" && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">Choose a new time</h1>
            <iframe title="Schedule with Calendly" className="w-full rounded-md border-0" style={{ height: 700 }} src={done.url} />
            <Button asChild variant="outline"><a href={done.url} target="_blank" rel="noreferrer">Open Calendly</a></Button>
          </div>
        )}
        {q.data?.valid && !done && (
          <div className="space-y-4">
            {q.data.purpose === "retake" ? (
              <>
                <h1 className="text-xl font-bold">Hi {q.data.firstName}, schedule your final interview</h1>
                <p className="text-sm text-muted-foreground">
                  Choose a new time for your final interview with our Country Manager.
                  {q.data.eligibleDate && !q.data.canScheduleNow && ` You can schedule starting ${q.data.eligibleDate}.`}
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">Hi {q.data.firstName}, we missed you</h1>
                <p className="text-sm text-muted-foreground">We were not able to connect at your final interview. Please tell us why and choose how you would like to continue.</p>
                <div className="space-y-1.5">
                  <Label>Why were you unable to attend? (optional)</Label>
                  <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
                </div>
              </>
            )}
            {err && <p className="text-sm text-destructive">{err}</p>}
            {action === "withdraw" ? (
              <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-medium">Are you sure you want to withdraw your application? This cannot be undone.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" disabled={busy} onClick={() => void go("withdraw")}>Yes, withdraw my application</Button>
                  <Button variant="outline" onClick={() => setAction(undefined)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !q.data.canScheduleNow} onClick={() => void go("reschedule")}>
                  {q.data.purpose === "retake" ? "Schedule My Final Interview" : "Reschedule My Interview"}
                </Button>
                <Button variant="outline" onClick={() => setAction("withdraw")}>Withdraw My Application</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
