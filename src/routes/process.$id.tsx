import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  Monitor,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  createResumeUploadTarget,
  createSystemInfoUploadTarget,
  getRecruitmentProcess,
  markSchedulingOpened,
  saveRecruitmentProgress,
  saveResume,
  saveSystemInfo,
  saveWorkReference,
} from "@/lib/process.functions";
import { cn } from "@/lib/utils";

const GRAMMAR_TEST_URL = "https://app.testgorilla.com/s/bnm9wczd";
const GRAMMAR_TOPICS_URL =
  "https://drive.google.com/file/d/1307-D5PsWy6crpyXyUCBXQM59w4aBs9P/view?usp=sharing";
const CALENDLY_URL = "https://calendly.com/teachingjobs4callcenters/schedule";

export const Route = createFileRoute("/process/$id")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "E4CC Recruitment Process" },
      {
        name: "description",
        content:
          "Complete the E4CC coach recruitment requirements and schedule your live Zoom interview.",
      },
      { property: "og:title", content: "E4CC Recruitment Process" },
      {
        property: "og:description",
        content: "Requirements checklist and interview scheduling for E4CC coach candidates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProcessPage,
});

type State = Extract<Awaited<ReturnType<typeof getRecruitmentProcess>>, { invalid: null }>;

function ProcessPage() {
  const { id } = Route.useParams();
  const { t } = Route.useSearch();
  const token = t ?? "";
  const queryClient = useQueryClient();
  const load = useServerFn(getRecruitmentProcess);

  const { data, isLoading, error } = useQuery({
    queryKey: ["process", id],
    queryFn: () => load({ data: { applicationId: id, token } }),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) return <Denied />;
  if (isLoading) {
    return (
      <Shell>
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </Shell>
    );
  }
  if (error || !data)
    return <Denied message={error instanceof Error ? error.message : undefined} />;
  if (data.invalid != null) return <Denied message={data.invalid} />;



  return (
    <Shell>
      <Content
        state={data}
        id={id}
        token={token}
        onState={(next) =>
          queryClient.setQueryData(["process", id], (prev: State | undefined) => ({
            ...(prev ?? {}),
            ...next,
          }))
        }
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <header className="border-b border-border bg-background">
        <div className="mx-auto max-w-3xl px-5 py-4">
          <BrandMark className="h-8" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 px-5 py-7">{children}</div>
    </main>
  );
}

function Denied({ message }: { message?: string | undefined }) {
  return (
    <Shell>
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">This page is not available</h1>
        <p className="mt-3 text-muted-foreground">
          {message ?? "This stage is not available for your application."}
        </p>
        <Button asChild variant="outline" className="mt-8 rounded-2xl">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </Shell>
  );
}

function Content({
  state,
  id,
  token,
  onState,
}: {
  state: State;
  id: string;
  token: string;
  onState: (next: State) => void;
}) {
  const save = useServerFn(saveRecruitmentProgress);
  const openScheduling = useServerFn(markSchedulingOpened);
  const progress = state.progress;
  const done = state.requirements.filter((r) => r.done).length;
  const pct = Math.round((done / state.requirements.length) * 100);

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, boolean | string | number>) =>
      save({ data: { applicationId: id, token, ...patch } }),
    onSuccess: (next) => onState(next as State),
    onError: (e: Error) => toast.error(e.message),
  });

  const openedRef = useRef(false);
  useEffect(() => {
    if (!state.unlocked || openedRef.current) return;
    if (progress.scheduling_status === "Scheduling opened") return;
    openedRef.current = true;
    void openScheduling({ data: { applicationId: id, token } }).catch(() => undefined);
  }, [state.unlocked, progress.scheduling_status, id, token, openScheduling]);

  return (
    <>
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Welcome to E4CC&apos;s Coach Recruitment Process</h1>
        <p className="mt-3 text-muted-foreground">
          Congratulations! You have been selected to continue to the next stage. Complete the
          following requirements to schedule your LIVE ZOOM INTERVIEW with the E4CC Recruitment
          Team.
        </p>
        <div className="mt-6 space-y-2">
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {done} of {state.requirements.length} requirements completed
          </p>
        </div>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {state.requirements.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-sm">
              {r.done ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-muted-foreground/40" />
              )}
              <span className={r.done ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <DeviceCard state={state} id={id} token={token} onState={onState} saveMutation={saveMutation} />

      <Card icon={<FileText className="h-5 w-5" />} title="2. Grammar Test">
        <p className="text-sm text-muted-foreground">
          Complete the mandatory Grammar Test before your interview.
        </p>
        <p className="text-xs text-muted-foreground">Estimated time: 12 minutes.</p>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => {
            window.open(GRAMMAR_TEST_URL, "_blank", "noopener,noreferrer");
            saveMutation.mutate({ grammar_test_opened: true });
          }}
        >
          Take the Grammar Test <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
        <p className="text-xs text-muted-foreground">Status: {progress.grammar_test_status}</p>
        <Confirm
          checked={progress.grammar_test_confirmed}
          onChange={(v) => saveMutation.mutate({ grammar_test_confirmed: v })}
          label="I confirm that I completed the Grammar Test."
        />
      </Card>

      <Card icon={<FileText className="h-5 w-5" />} title="3. Review Grammar Topics">
        <p className="text-sm text-muted-foreground">
          During the interview, you will be asked to explain grammar tenses and verbs clearly, as if
          you were teaching a class.
        </p>
        <Button
          variant="outline"
          className="rounded-2xl"
          onClick={() => window.open(GRAMMAR_TOPICS_URL, "_blank", "noopener,noreferrer")}
        >
          Review Grammar Topics <ExternalLink className="ml-2 h-4 w-4" />
        </Button>
        <Confirm
          checked={progress.grammar_topics_confirmed}
          onChange={(v) => saveMutation.mutate({ grammar_topics_confirmed: v })}
          label="I reviewed the grammar material and understand that I may be asked to explain these topics during my interview."
        />
      </Card>

      <ResumeCard state={state} id={id} token={token} onState={onState} />

      <ReferencesCard state={state} id={id} token={token} onState={onState} />

      <SchedulingCard state={state} />
    </>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Confirm({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-secondary/40 p-3 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}

function ResumeCard({
  state,
  id,
  token,
  onState,
}: {
  state: State;
  id: string;
  token: string;
  onState: (next: State) => void;
}) {
  const createTarget = useServerFn(createResumeUploadTarget);
  const commit = useServerFn(saveResume);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["pdf", "doc", "docx"].includes(ext)) {
      toast.error("Please upload a PDF, DOC or DOCX file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("The file must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const target = await createTarget({
        data: { applicationId: id, token, ext: ext as "pdf" | "doc" | "docx", size: file.size },
      });
      const { error } = await supabase.storage
        .from("candidate-media")
        .uploadToSignedUrl(target.path, target.token, file);
      if (error) throw new Error(error.message);
      const next = await commit({
        data: { applicationId: id, token, path: target.path, filename: file.name },
      });
      onState(next as State);
      toast.success("Resume uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card icon={<Upload className="h-5 w-5" />} title="4. Resume and Work References">
      <p className="text-sm text-muted-foreground">
        Upload your updated resume. It must include your most recent teaching, training and
        professional experience. PDF, DOC or DOCX · max 10 MB.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="rounded-2xl"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {state.progress.resume_path ? "Replace resume" : "Upload resume"}
        </Button>
        {state.progress.resume_filename && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" /> {state.progress.resume_filename}
          </span>
        )}
      </div>
    </Card>
  );
}

async function measureInternetSpeedMbps(): Promise<number> {
  // Prefer the browser's own estimate when available.
  const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  const hint = typeof conn?.downlink === "number" && conn.downlink > 0 ? conn.downlink : null;
  // Timed downloads of a same-origin asset as a fallback / complement.
  let measured: number | null = null;
  try {
    let bytes = 0;
    const start = performance.now();
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`/favicon.png?sb=${Date.now()}-${i}`, { cache: "no-store" });
      const blob = await res.blob();
      bytes += blob.size;
    }
    const seconds = (performance.now() - start) / 1000;
    if (seconds > 0.05 && bytes > 0) measured = (bytes * 8) / seconds / 1_000_000;
  } catch {
    measured = null;
  }
  const best = Math.max(hint ?? 0, measured ?? 0);
  return Math.round(best * 10) / 10;
}

function DeviceCard({
  state,
  id,
  token,
  onState,
  saveMutation,
}: {
  state: State;
  id: string;
  token: string;
  onState: (next: State) => void;
  saveMutation: {
    mutate: (fields: {
      device_confirmed?: boolean;
      work_modality?: "online" | "onsite";
      internet_speed_mbps?: number;
    }) => void;
    isPending: boolean;
  };
}) {
  const createTarget = useServerFn(createSystemInfoUploadTarget);
  const commit = useServerFn(saveSystemInfo);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const progress = state.progress;
  const modality = progress.work_modality;
  const isOnline = modality === "online";

  async function runSpeedTest() {
    setTesting(true);
    try {
      const mbps = await measureInternetSpeedMbps();
      const next = await saveRecruitmentProgress({
        data: { applicationId: id, token, internet_speed_mbps: mbps },
      });
      onState(next as State);
      toast.success(`Estimated speed: ${mbps} Mbps`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not measure your internet speed");
    } finally {
      setTesting(false);
    }
  }

  async function uploadScreenshot(file: File) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!["jpg", "jpeg", "png"].includes(ext)) {
      toast.error("Please upload a JPG or PNG screenshot.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("The file must be 10 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const target = await createTarget({
        data: { applicationId: id, token, ext: ext as "jpg" | "jpeg" | "png", size: file.size },
      });
      const { error } = await supabase.storage
        .from("candidate-media")
        .uploadToSignedUrl(target.path, target.token, file);
      if (error) throw new Error(error.message);
      const next = await commit({
        data: { applicationId: id, token, path: target.path, filename: file.name },
      });
      onState(next as State);
      toast.success("System information uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card icon={<Monitor className="h-5 w-5" />} title="1. Device Requirement">
      <p className="text-sm text-muted-foreground">
        Online coaches must attend their interview using a laptop or desktop computer with a working
        camera and microphone, and a stable internet connection. This does not apply to onsite
        coaches.
      </p>
      <div className="space-y-1.5">
        <Label className="text-xs">How will you work with E4CC?</Label>
        <div className="flex gap-2">
          {(["online", "onsite"] as const).map((m) => (
            <Button
              key={m}
              type="button"
              variant={modality === m ? "default" : "outline"}
              className="rounded-2xl capitalize"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate({ work_modality: m })}
            >
              {m === "online" ? "Online coach" : "Onsite coach"}
            </Button>
          ))}
        </div>
      </div>

      {isOnline && (
        <div className="space-y-3 rounded-2xl bg-secondary/40 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Internet speed</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                disabled={testing || saveMutation.isPending}
                onClick={() => void runSpeedTest()}
              >
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {progress.internet_speed_mbps != null ? "Run speed test again" : "Run speed test"}
              </Button>
              {progress.internet_speed_mbps != null && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {progress.internet_speed_mbps} Mbps
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Computer processor and RAM</Label>
            <p className="text-xs text-muted-foreground">
              Open your computer's System Information (on Windows: press Windows key, type "System
              Information"; on Mac: Apple menu → About This Mac), take a screenshot showing your
              processor and RAM memory, and upload it here. JPG or PNG · max 10 MB.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadScreenshot(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {progress.system_info_path ? "Replace screenshot" : "Upload screenshot"}
              </Button>
              {progress.system_info_filename && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" /> {progress.system_info_filename}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <Confirm
        checked={progress.device_confirmed}
        onChange={(v) => saveMutation.mutate({ device_confirmed: v })}
        label="I confirm that I have access to a laptop or desktop computer with a working camera and microphone."
      />
    </Card>
  );
}

const REFERENCE_TITLES = [
  "Work Reference 1 — Most Recent Position",
  "Work Reference 2 — Previous Position",
  "Work Reference 3 — Previous Position",
  "Work Reference 4 — Previous Position",
];

function ReferencesCard({
  state,
  id,
  token,
  onState,
}: {
  state: State;
  id: string;
  token: string;
  onState: (next: State) => void;
}) {
  const save = useServerFn(saveWorkReference);
  const saveProgress = useServerFn(saveRecruitmentProgress);
  

  return (
    <section className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">Work references</h2>
      <p className="text-sm text-muted-foreground">
        Provide two work references for your two most recent positions.
      </p>
      {[1, 2].map((slot) => (
        <ReferenceForm
          key={slot}
          title={REFERENCE_TITLES[slot - 1]!}
          
          initial={state.references.find((r) => r.slot === slot)}
          onSave={async (values) => {
            const next = (await save({
              data: { applicationId: id, token, slot, ...values },
            })) as State & { error?: string };
            onState(next as State);
            if (next.error) toast.error(next.error);
            else toast.success("Reference saved");
          }}
        />
      ))}
      <Confirm
        checked={state.progress.references_declaration}
        onChange={(v) => {
          void saveProgress({
            data: { applicationId: id, token, references_declaration: v },
          }).then((next) => onState(next as State));
        }}
        label="I confirm that the information and work references provided are accurate, recent and may be verified by E4CC."
      />
    </section>
  );
}

type ReferenceValues = {
  company: string;
  position: string;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  supervisor_name: string;
  supervisor_phone: string;
  supervisor_email: string;
  reason_for_leaving: string;
  may_contact: boolean;
};

function ReferenceForm({
  title,
  initial,
  onSave,
}: {
  title: string;
  initial: State["references"][number] | undefined;
  onSave: (values: ReferenceValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ReferenceValues>(() => ({
    company: initial?.company ?? "",
    position: initial?.position ?? "",
    start_date: initial?.start_date ?? "",
    end_date: initial?.end_date ?? "",
    currently_working: initial?.currently_working ?? false,
    supervisor_name: initial?.supervisor_name ?? "",
    supervisor_phone: initial?.supervisor_phone ?? "",
    supervisor_email: initial?.supervisor_email ?? "",
    reason_for_leaving: initial?.reason_for_leaving ?? "",
    may_contact: initial?.may_contact ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ReferenceValues>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Company name">
          <Input
            value={values.company}
            maxLength={120}
            onChange={(e) => set({ company: e.target.value })}
          />
        </Row>
        <Row label="Your position">
          <Input
            value={values.position}
            maxLength={120}
            onChange={(e) => set({ position: e.target.value })}
          />
        </Row>
        <Row label="Start date">
          <Input
            type="date"
            value={values.start_date ?? ""}
            onChange={(e) => set({ start_date: e.target.value })}
          />
        </Row>
        <Row label="End date">
          <Input
            type="date"
            disabled={values.currently_working}
            value={values.end_date ?? ""}
            onChange={(e) => set({ end_date: e.target.value })}
          />
        </Row>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={values.currently_working}
          onCheckedChange={(v) => set({ currently_working: v === true, end_date: "" })}
        />
        Currently working here
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Supervisor's full name">
          <Input
            value={values.supervisor_name}
            maxLength={120}
            onChange={(e) => set({ supervisor_name: e.target.value })}
          />
        </Row>
        <Row label="Supervisor's phone / WhatsApp (international format)">
          <Input
            value={values.supervisor_phone}
            maxLength={40}
            placeholder="+503 7777 7777"
            onChange={(e) => set({ supervisor_phone: e.target.value })}
          />
        </Row>
        <Row label="Supervisor's email">
          <Input
            type="email"
            value={values.supervisor_email}
            maxLength={255}
            onChange={(e) => set({ supervisor_email: e.target.value })}
          />
        </Row>
      </div>
      <Row label="Reason for leaving">
        <Textarea
          value={values.reason_for_leaving}
          maxLength={500}
          onChange={(e) => set({ reason_for_leaving: e.target.value })}
        />
      </Row>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={values.may_contact}
          onCheckedChange={(v) => set({ may_contact: v === true })}
        />
        May E4CC contact this person?
      </label>
      <Button
        className="rounded-2xl"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({
              ...values,
              supervisor_phone: values.supervisor_phone.trim(),
              start_date: values.start_date || null,
              end_date: values.end_date || null,
            });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save this reference");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save reference
      </Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SchedulingCard({ state }: { state: State }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const url = useMemo(() => {
    const u = new URL(CALENDLY_URL);
    if (state.candidate?.fullName) u.searchParams.set("name", state.candidate.fullName);
    if (state.candidate?.email) u.searchParams.set("email", state.candidate.email);
    u.searchParams.set("hide_gdpr_banner", "1");
    return u.toString();
  }, [state.candidate]);

  useEffect(() => {
    if (!state.unlocked) return;
    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onerror = () => setEmbedFailed(true);
    document.body.appendChild(script);
    const timer = setTimeout(() => {
      const widget = document.querySelector(".calendly-inline-widget iframe");
      if (!widget) setEmbedFailed(true);
    }, 6000);
    return () => {
      clearTimeout(timer);
      script.remove();
    };
  }, [state.unlocked]);

  if (!state.unlocked) {
    const missing = state.requirements.filter((r) => !r.done);
    return (
      <section className="space-y-3 rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Lock className="h-5 w-5" />
          <h2 className="text-lg font-bold text-foreground">5. Schedule Your Interview</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Scheduling unlocks once every requirement above is complete. Still missing:
        </p>
        <ul className="space-y-1 text-sm">
          {missing.map((r) => (
            <li key={r.key} className={cn("text-destructive")}>
              • {r.label}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-3xl border border-success/40 bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 className="h-5 w-5" />
        <h2 className="text-lg font-bold text-foreground">5. Schedule Your Interview</h2>
      </div>
      <p className="text-sm">
        Excellent! You have completed all the requirements. You may now select the date and time for
        your LIVE ZOOM INTERVIEW.
      </p>
      {!embedFailed && (
        <div
          className="calendly-inline-widget rounded-2xl"
          data-url={url}
          style={{ minWidth: "320px", height: "760px" }}
        />
      )}
      {embedFailed && (
        <Button asChild size="lg" className="rounded-2xl">
          <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
            Schedule Your Interview <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      )}
    </section>
  );
}
