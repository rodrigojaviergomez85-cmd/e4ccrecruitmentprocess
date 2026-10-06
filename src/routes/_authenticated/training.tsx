import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { StaffGate } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { listTrainingRoster, updateTrainingRow } from "@/lib/training.functions";
import { TRAINING_STATUSES, approvalBlocked, documentsPercent } from "@/lib/training";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Training Tracker — E4CC" },
      { name: "description", content: "Candidates approved for Training, by LOB: documents, reference calls and training status." },
      { property: "og:title", content: "Training Tracker — E4CC" },
      { property: "og:description", content: "E4CC training waves by LOB for trainers and recruitment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <StaffGate>
      <TrainingPage />
    </StaffGate>
  ),
});

type Row = Awaited<ReturnType<typeof listTrainingRoster>>["rows"][number];
const ALL = "all";
const daysUntil = (d: string | null) =>
  d ? Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86400000) : null;

function TrainingPage() {
  const list = useServerFn(listTrainingRoster);
  const { data, isLoading, error } = useQuery({ queryKey: ["training-roster"], queryFn: () => list() });
  const [lob, setLob] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");

  const lobs = useMemo(() => [...new Set((data?.rows ?? []).map((r) => r.lob))].sort(), [data]);
  const filtered = (data?.rows ?? []).filter(
    (r) =>
      (lob === ALL || r.lob === lob) &&
      (status === ALL || r.status === status) &&
      (!search || r.fullName.toLowerCase().includes(search.toLowerCase())),
  );
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of filtered) m.set(r.lob, [...(m.get(r.lob) ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <BrandMark />
          <h1 className="text-xl font-semibold">Training Tracker</h1>
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap gap-3">
          <Input placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Select value={lob} onValueChange={setLob}>
            <SelectTrigger className="w-56"><SelectValue placeholder="LOB" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All LOBs</SelectItem>
              {lobs.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {error && <p className="text-destructive">{(error as Error).message}</p>}
        {data && !groups.length && <p className="text-muted-foreground">No candidates approved for Training yet.</p>}
        {groups.map(([name, rows]) => (
          <section key={name} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {name} <span className="text-sm font-normal text-muted-foreground">· {rows.length}</span>
            </h2>
            {rows.map((r) => (
              <RosterCard key={r.id} row={r} canEditReferences={data!.canEditReferences} />
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}

function RosterCard({ row, canEditReferences }: { row: Row; canEditReferences: boolean }) {
  const update = useServerFn(updateTrainingRow);
  const qc = useQueryClient();
  const [f, setF] = useState(row);
  const [saving, setSaving] = useState(false);
  const blocked = approvalBlocked(row.referenceCall);
  const pct = documentsPercent(f.documentList, f.documents);
  const missing = daysUntil(f.waveStart);

  async function save() {
    setSaving(true);
    try {
      await update({
        data: {
          applicationId: row.id,
          waveStart: f.waveStart,
          requestDate: f.requestDate,
          hiringDate: f.hiringDate,
          status: f.status as (typeof TRAINING_STATUSES)[number],
          agreedSchedule: f.agreedSchedule,
          comments: f.comments,
          documents: f.documents,
          ...(canEditReferences
            ? { referenceCall: f.referenceCall as "pending" | "done" | "not_recommended", referenceDetails: f.referenceDetails }
            : {}),
        },
      });
      toast.success("Saved");
      await qc.invalidateQueries({ queryKey: ["training-roster"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-lg border-2 bg-card p-4 ${blocked ? "border-destructive" : "border-border"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{row.fullName}</p>
          <p className="text-sm text-muted-foreground">
            {row.branch} · {row.country} · {row.phone} · {row.email}
            {row.trainer && ` · Trainer: ${row.trainer}`}
          </p>
        </div>
        {blocked ? (
          <span className="flex items-center gap-1 rounded bg-destructive px-3 py-1 text-sm font-semibold text-destructive-foreground">
            <AlertTriangle className="h-4 w-4" /> Approval pending — reference call
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
            <CheckCircle2 className="h-4 w-4" /> Approved — references called
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <L label="Wave start"><Input type="date" value={f.waveStart ?? ""} onChange={(e) => setF({ ...f, waveStart: e.target.value })} /></L>
        <L label="Missing days"><p className="py-2 font-semibold">{missing === null ? "—" : missing}</p></L>
        <L label="Request date"><Input type="date" value={f.requestDate ?? ""} onChange={(e) => setF({ ...f, requestDate: e.target.value })} /></L>
        <L label="Hiring date"><Input type="date" value={f.hiringDate ?? ""} onChange={(e) => setF({ ...f, hiringDate: e.target.value })} /></L>
        <L label="Status">
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TRAINING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </L>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <L label="Agreed schedule"><Input value={f.agreedSchedule} onChange={(e) => setF({ ...f, agreedSchedule: e.target.value })} /></L>
        <L label="Comments"><Input value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} /></L>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold">Documents received ({pct}%)</p>
          {f.documentList.length ? (
            f.documentList.map((d) => (
              <label key={d} className="flex items-center gap-2 py-1 text-sm">
                <Checkbox
                  checked={!!f.documents[d]}
                  onCheckedChange={(v) => setF({ ...f, documents: { ...f.documents, [d]: v === true } })}
                />
                {d}
              </label>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No document list for this country.</p>
          )}
        </div>
        <div className={`rounded-md p-3 ${blocked ? "bg-destructive/10" : "bg-muted"}`}>
          <p className="mb-2 text-sm font-semibold">
            Reference call (Recruitment) · {row.referencesVerified}/{row.referencesOnFile} references verified
          </p>
          <Select value={f.referenceCall} onValueChange={(v) => setF({ ...f, referenceCall: v })} disabled={!canEditReferences}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="done">Done — recommended</SelectItem>
              <SelectItem value="not_recommended">Done — not recommended</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            className="mt-2"
            placeholder="Reference details (who, company, rating, comments)"
            value={f.referenceDetails}
            disabled={!canEditReferences}
            onChange={(e) => setF({ ...f, referenceDetails: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
