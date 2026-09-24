import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { getCandidateResponse, submitCandidateResponse } from "@/lib/manager.functions";

const WITHDRAW_TEXT = "Thank you for the opportunity. I do not wish to continue with the recruitment process.";

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
  const [action] = useState<"reschedule" | "withdraw" | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { kind: "withdraw" } | { kind: "reschedule"; url: string }>(null);
  const [err, setErr] = useState("");
  const autoOpened = useRef(false);

  // "Reschedule My Interview" from the email opens Calendly directly. Opening it
  // changes nothing; the booking is recorded only when Calendly confirms it.
  useEffect(() => {
    if (autoOpened.current || action !== "reschedule" || !q.data?.valid || !q.data.canScheduleNow) return;
    autoOpened.current = true;
    void go("reschedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, action]);

  async function go(kind: "reschedule" | "withdraw") {
    setBusy(true);
    setErr("");
    try {
      const r = await submit({ data: { token, action: kind, reason: kind === "withdraw" ? WITHDRAW_TEXT : "", confirmWithdraw: kind === "withdraw" } });
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
            <h1 className="text-xl font-bold">Thank you for letting us know. We appreciate your interest in E4CC.</h1>
          </div>
        )}
        {q.data?.valid && done?.kind === "reschedule" && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">Choose a new time</h1>
            <iframe title="Schedule with Calendly" className="w-full rounded-md border-0" style={{ height: 700 }} src={done.url} />
            <Button asChild variant="outline"><a href={done.url} target="_blank" rel="noreferrer">Open Calendly</a></Button>
          </div>
        )}
        {q.data?.valid && !done && action === "withdraw" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Hi {q.data.firstName}</h1>
            <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm">{WITHDRAW_TEXT}</p>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button disabled={busy} onClick={() => void go("withdraw")}>Send Response</Button>
          </div>
        )}
        {q.data?.valid && !done && action !== "withdraw" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">
              {q.data.purpose === "retake" ? `Hi ${q.data.firstName}, schedule your final interview` : `Hi ${q.data.firstName}, reschedule your final interview`}
            </h1>
            {q.data.eligibleDate && !q.data.canScheduleNow && (
              <p className="text-sm text-muted-foreground">You can schedule starting {q.data.eligibleDate}.</p>
            )}
            {err && <p className="text-sm text-destructive">{err}</p>}
            {busy && <p className="text-sm text-muted-foreground">Opening calendar…</p>}
            {!busy && q.data.canScheduleNow && (
              <Button onClick={() => void go("reschedule")}>Reschedule My Interview</Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
