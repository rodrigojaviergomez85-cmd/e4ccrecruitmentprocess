import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { assignManager, listSecondFilterQueue } from "@/lib/manager.functions";

export const Route = createFileRoute("/_authenticated/second-filter/")({
  head: () => ({
    meta: [
      { title: "Pending Second Filter — E4CC" },
      { name: "description", content: "Candidates approved by Recruitment waiting for the Manager final filter." },
      { property: "og:title", content: "Pending Second Filter — E4CC" },
      { property: "og:description", content: "Manager final filter queue for E4CC recruitment." },
    ],
  }),
  component: QueuePage,
});

const ALL = "all";
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

function QueuePage() {
  const list = useServerFn(listSecondFilterQueue);
  const assign = useServerFn(assignManager);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["second-filter"], queryFn: () => list() });
  const [country, setCountry] = useState(ALL);
  const [lob, setLob] = useState(ALL);
  const [modality, setModality] = useState(ALL);
  const [manager, setManager] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [sched, setSched] = useState(ALL);
  const [from, setFrom] = useState("");

  const lobOf = (r: { modality: string | null; countryCode: string | null }) =>
    r.modality === "online" ? "online" : r.modality === "onsite" ? `onsite-${r.countryCode ?? ""}` : "";

  const rows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (r) =>
          (country === ALL || r.countryCode === country) &&
          (lob === ALL || lobOf(r) === lob) &&
          (modality === ALL || r.modality === modality) &&
          (manager === ALL || (manager === "none" ? !r.managerId : r.managerId === manager)) &&
          (type === ALL || (type === "retake") === r.isRetake) &&
          (sched === ALL || (sched === "scheduled") === Boolean(r.appointmentAt)) &&
          (!from || (r.approvedAt ?? "") >= from),
      ),
    [data, country, lob, modality, manager, type, sched, from],
  );
  const countries = [...new Map((data?.rows ?? []).map((r) => [r.countryCode ?? "", r.country])).entries()];

  async function onAssign(applicationId: string, managerId: string) {
    try {
      await assign({ data: { applicationId, managerId: managerId === "none" ? null : managerId } });
      toast.success("Manager assigned");
      await qc.invalidateQueries({ queryKey: ["second-filter"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign");
    }
  }

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">Pending Second Filter</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Dashboard</Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
        <div>
          <h1 className="text-2xl font-bold">Pending Second Filter</h1>
          <p className="text-sm text-muted-foreground">Approved by Recruitment and waiting for the Manager's final decision.</p>
        </div>
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-7">
          <F label="LOB" value={lob} onChange={setLob} options={[["online", "Online"], ["onsite-SV", "El Salvador Onsite"], ["onsite-NI", "Nicaragua Onsite"], ["onsite-GT", "Guatemala Onsite"]]} />
          <F label="Country" value={country} onChange={setCountry} options={countries.map(([c, n]) => [c, n])} />
          <F label="Modality" value={modality} onChange={setModality} options={[["online", "Online"], ["onsite", "Onsite"]]} />
          <F label="Manager" value={manager} onChange={setManager} options={[["none", "Unassigned"], ...(data?.managers ?? []).map((m) => [m.id, m.name] as [string, string])]} />
          <F label="Type" value={type} onChange={setType} options={[["first", "First-Time"], ["retake", "Retake"]]} />
          <F label="Appointment" value={sched} onChange={setSched} options={[["scheduled", "Scheduled"], ["not", "Not scheduled"]]} />
          <div className="space-y-1.5">
            <Label className="text-xs">Approved since</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>

        {error && <p className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Could not load"}</p>}
        {isLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
        {data && rows.length === 0 && (
          <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No candidates pending the second filter.</p>
        )}
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 font-semibold">
                  {r.fullName}
                  {r.isRetake && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold uppercase text-accent-foreground">Retake</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.country} · <span className="capitalize">{r.modality ?? "—"}</span> · {r.branch || "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Approved {fmt(r.approvedAt)} · {r.daysWaiting ?? "—"} days waiting · Last contact {fmt(r.lastContactAt)}
                </p>
                <p className="text-xs font-medium text-primary">
                  {r.appointmentAt ? `Scheduled ${new Date(r.appointmentAt).toLocaleString()} · ${r.appointmentStatus}` : "Not scheduled"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data?.canAssign ? (
                  <Select value={r.managerId ?? "none"} onValueChange={(v) => void onAssign(r.id, v)}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {data.managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-muted-foreground">Manager: {r.managerName ?? "Unassigned"}</span>
                )}
                <Button asChild size="sm">
                  <Link to="/second-filter/$applicationId" params={{ applicationId: r.id }}>Review Candidate</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function F({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
