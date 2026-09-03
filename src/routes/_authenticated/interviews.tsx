import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  addBlockedDate,
  getInterviewConfig,
  listAppointments,
  removeBlockedDate,
  saveInterviewSettings,
  sendManualReminder,
  updateAppointmentStatus,
  upsertInterviewer,
} from "@/lib/interviews.functions";
import { getMyAccess } from "@/lib/recruiter.functions";
import {
  APPOINTMENT_STATUSES,
  formatInTz,
  TIMEZONE_CHOICES,
  WEEKDAY_LABELS,
  type WeeklyHours,
} from "@/lib/interviews";

export const Route = createFileRoute("/_authenticated/interviews")({
  head: () => ({
    meta: [
      { title: "Interview Settings — E4CC" },
      {
        name: "description",
        content: "Configure interview availability, interviewers, reminders and booked interviews.",
      },
      { property: "og:title", content: "Interview Settings — E4CC" },
      {
        property: "og:description",
        content: "Configure E4CC interview availability, interviewers and reminders.",
      },
    ],
  }),
  component: InterviewsPage,
});

type SettingsForm = {
  timezone: string;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_booking_days: number;
  max_per_slot: number;
  default_meeting_link: string;
  token_expiry_days: number;
  allow_reapply_days: number;
  assignment_mode: "round_robin" | "country";
  reminder_offsets_minutes: number[];
  weekly_hours: WeeklyHours;
};

function InterviewsPage() {
  const queryClient = useQueryClient();
  const loadConfig = useServerFn(getInterviewConfig);
  const loadAppointments = useServerFn(listAppointments);
  const loadAccess = useServerFn(getMyAccess);
  const saveSettings = useServerFn(saveInterviewSettings);
  const saveInterviewer = useServerFn(upsertInterviewer);
  const blockDate = useServerFn(addBlockedDate);
  const unblockDate = useServerFn(removeBlockedDate);
  const setStatus = useServerFn(updateAppointmentStatus);
  const remind = useServerFn(sendManualReminder);

  const accessQuery = useQuery({ queryKey: ["my-access"], queryFn: () => loadAccess() });
  const configQuery = useQuery({ queryKey: ["interview-config"], queryFn: () => loadConfig() });
  const [statusFilter, setStatusFilter] = useState("all");
  const appointmentsQuery = useQuery({
    queryKey: ["appointments", statusFilter],
    queryFn: () =>
      loadAppointments({ data: statusFilter === "all" ? {} : { status: statusFilter } }),
  });

  const isAdmin = (accessQuery.data?.roles ?? []).includes("admin");
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [newInterviewer, setNewInterviewer] = useState({ full_name: "", email: "", meeting_link: "", country_codes: "" });
  const [newBlocked, setNewBlocked] = useState({ blocked_on: "", reason: "" });

  useEffect(() => {
    const s = configQuery.data?.settings;
    if (s && !form) {
      setForm({
        timezone: s.timezone,
        duration_minutes: s.duration_minutes,
        buffer_minutes: s.buffer_minutes,
        min_notice_hours: s.min_notice_hours,
        max_booking_days: s.max_booking_days,
        max_per_slot: s.max_per_slot,
        default_meeting_link: s.default_meeting_link,
        token_expiry_days: s.token_expiry_days,
        allow_reapply_days: s.allow_reapply_days,
        assignment_mode: s.assignment_mode as "round_robin" | "country",
        reminder_offsets_minutes: s.reminder_offsets_minutes ?? [1440, 60],
        weekly_hours: (s.weekly_hours ?? {}) as WeeklyHours,
      });
    }
  }, [configQuery.data, form]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["interview-config"] });
    void queryClient.invalidateQueries({ queryKey: ["appointments"] });
  };

  const settingsMutation = useMutation({
    mutationFn: (data: SettingsForm) => saveSettings({ data }),
    onSuccess: () => {
      toast.success("Interview settings saved.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const interviewerMutation = useMutation({
    mutationFn: (data: Parameters<typeof saveInterviewer>[0]["data"]) => saveInterviewer({ data }),
    onSuccess: () => {
      toast.success("Interviewer saved.");
      setNewInterviewer({ full_name: "", email: "", meeting_link: "", country_codes: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reminderMutation = useMutation({
    mutationFn: (id: string) => remind({ data: { id } }),
    onSuccess: (r) => toast.success(`Email: ${r.email} · WhatsApp: ${r.whatsapp}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: (typeof APPOINTMENT_STATUSES)[number] }) =>
      setStatus({ data: v }),
    onSuccess: () => {
      toast.success("Appointment updated.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const orgTz = configQuery.data?.settings?.timezone ?? "America/El_Salvador";

  return (
    <main className="min-h-screen bg-secondary/40 pb-16">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Link>
          <BrandMark className="h-8" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div>
          <h1 className="text-2xl font-bold">Interviews</h1>
          <p className="text-sm text-muted-foreground">
            Availability, interviewers and booked interviews. Times are shown in {orgTz}.
          </p>
        </div>

        {/* ------------------------------- appointments ------------------------------ */}
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-lg font-semibold">Booked interviews</h2>
            <div className="w-48">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="mt-1 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {APPOINTMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {appointmentsQuery.isLoading && <Skeleton className="mt-4 h-32 w-full rounded-2xl" />}

          {appointmentsQuery.data?.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">No interviews booked yet.</p>
          )}

          <div className="mt-4 space-y-3">
            {(appointmentsQuery.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
              >
                <div className="min-w-56">
                  <Link
                    to="/candidates/$id"
                    params={{ id: a.candidate_id }}
                    className="font-semibold hover:underline"
                  >
                    {a.candidate}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatInTz(a.starts_at, orgTz)} · {a.interviewer ?? "Unassigned"} ·{" "}
                    {a.country_code ?? "—"} {a.city ? `· ${a.city}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reminders: {a.reminder_status} · Reschedules: {a.reschedule_count}
                    {a.meeting_link ? (
                      <>
                        {" · "}
                        <a className="text-primary underline" href={a.meeting_link}>
                          Meeting link
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={a.status}
                    onValueChange={(status) =>
                      statusMutation.mutate({
                        id: a.id,
                        status: status as (typeof APPOINTMENT_STATUSES)[number],
                      })
                    }
                  >
                    <SelectTrigger className="w-40 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={reminderMutation.isPending}
                    onClick={() => reminderMutation.mutate(a.id)}
                  >
                    <BellRing className="mr-2 h-4 w-4" /> Remind
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {!isAdmin && (
          <p className="text-sm text-muted-foreground">
            Only administrators can change interview settings, interviewers and blocked dates.
          </p>
        )}

        {isAdmin && form && (
          <>
            {/* --------------------------------- settings -------------------------------- */}
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Interview settings</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label className="text-xs">Organization timezone</Label>
                  <Select
                    value={form.timezone}
                    onValueChange={(v) => setForm({ ...form, timezone: v })}
                  >
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONE_CHOICES.map((z) => (
                        <SelectItem key={z} value={z}>
                          {z.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <NumberField
                  label="Duration (minutes)"
                  value={form.duration_minutes}
                  onChange={(v) => setForm({ ...form, duration_minutes: v })}
                />
                <NumberField
                  label="Buffer between interviews (minutes)"
                  value={form.buffer_minutes}
                  onChange={(v) => setForm({ ...form, buffer_minutes: v })}
                />
                <NumberField
                  label="Minimum notice (hours)"
                  value={form.min_notice_hours}
                  onChange={(v) => setForm({ ...form, min_notice_hours: v })}
                />
                <NumberField
                  label="Booking window (days)"
                  value={form.max_booking_days}
                  onChange={(v) => setForm({ ...form, max_booking_days: v })}
                />
                <NumberField
                  label="Max interviews per slot"
                  value={form.max_per_slot}
                  onChange={(v) => setForm({ ...form, max_per_slot: v })}
                />
                <NumberField
                  label="Scheduling link expiry (days)"
                  value={form.token_expiry_days}
                  onChange={(v) => setForm({ ...form, token_expiry_days: v })}
                />
                <NumberField
                  label="Reapply after (days, 0 = never)"
                  value={form.allow_reapply_days}
                  onChange={(v) => setForm({ ...form, allow_reapply_days: v })}
                />
                <div>
                  <Label className="text-xs">Interviewer assignment</Label>
                  <Select
                    value={form.assignment_mode}
                    onValueChange={(v) =>
                      setForm({ ...form, assignment_mode: v as SettingsForm["assignment_mode"] })
                    }
                  >
                    <SelectTrigger className="mt-1 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round_robin">Round robin</SelectItem>
                      <SelectItem value="country">By country</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Default meeting link</Label>
                  <Input
                    className="mt-1 rounded-2xl"
                    value={form.default_meeting_link}
                    onChange={(e) => setForm({ ...form, default_meeting_link: e.target.value })}
                    placeholder="https://zoom.us/j/..."
                  />
                </div>
                <div>
                  <Label className="text-xs">Reminders (minutes before, comma separated)</Label>
                  <Input
                    className="mt-1 rounded-2xl"
                    value={form.reminder_offsets_minutes.join(", ")}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        reminder_offsets_minutes: e.target.value
                          .split(",")
                          .map((v) => Number(v.trim()))
                          .filter((v) => Number.isFinite(v) && v >= 0),
                      })
                    }
                  />
                </div>
              </div>

              <h3 className="mt-6 text-sm font-semibold">Weekly availability</h3>
              <div className="mt-2 space-y-2">
                {WEEKDAY_LABELS.map((label, index) => {
                  const ranges = form.weekly_hours[String(index)] ?? [];
                  const enabled = ranges.length > 0;
                  const range = ranges[0] ?? (["09:00", "17:00"] as [string, string]);
                  return (
                    <div key={label} className="flex flex-wrap items-center gap-3">
                      <Switch
                        checked={enabled}
                        onCheckedChange={(on) =>
                          setForm({
                            ...form,
                            weekly_hours: {
                              ...form.weekly_hours,
                              [String(index)]: on ? [range] : [],
                            },
                          })
                        }
                      />
                      <span className="w-24 text-sm">{label}</span>
                      <Input
                        type="time"
                        className="w-32 rounded-2xl"
                        disabled={!enabled}
                        value={range[0]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            weekly_hours: {
                              ...form.weekly_hours,
                              [String(index)]: [[e.target.value, range[1]]],
                            },
                          })
                        }
                      />
                      <Input
                        type="time"
                        className="w-32 rounded-2xl"
                        disabled={!enabled}
                        value={range[1]}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            weekly_hours: {
                              ...form.weekly_hours,
                              [String(index)]: [[range[0], e.target.value]],
                            },
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <Button
                className="mt-6 rounded-2xl"
                disabled={settingsMutation.isPending}
                onClick={() => settingsMutation.mutate(form)}
              >
                {settingsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save settings
              </Button>
            </section>

            {/* ------------------------------- interviewers ------------------------------ */}
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Interviewers</h2>
              <div className="mt-4 space-y-3">
                {(configQuery.data?.interviewers ?? []).map((i) => (
                  <div
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                  >
                    <div>
                      <p className="font-medium">{i.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.email} · {i.country_codes.length ? i.country_codes.join(", ") : "All countries"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Active</span>
                      <Switch
                        checked={i.active}
                        onCheckedChange={(active) =>
                          interviewerMutation.mutate({
                            id: i.id,
                            full_name: i.full_name,
                            email: i.email,
                            meeting_link: i.meeting_link,
                            country_codes: i.country_codes,
                            active,
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Input
                  className="rounded-2xl"
                  placeholder="Full name"
                  value={newInterviewer.full_name}
                  onChange={(e) => setNewInterviewer({ ...newInterviewer, full_name: e.target.value })}
                />
                <Input
                  className="rounded-2xl"
                  placeholder="Email"
                  value={newInterviewer.email}
                  onChange={(e) => setNewInterviewer({ ...newInterviewer, email: e.target.value })}
                />
                <Input
                  className="rounded-2xl"
                  placeholder="Meeting link"
                  value={newInterviewer.meeting_link}
                  onChange={(e) =>
                    setNewInterviewer({ ...newInterviewer, meeting_link: e.target.value })
                  }
                />
                <Input
                  className="rounded-2xl"
                  placeholder="Countries (SV, GT)"
                  value={newInterviewer.country_codes}
                  onChange={(e) =>
                    setNewInterviewer({ ...newInterviewer, country_codes: e.target.value })
                  }
                />
              </div>
              <Button
                variant="outline"
                className="mt-3 rounded-2xl"
                disabled={interviewerMutation.isPending}
                onClick={() =>
                  interviewerMutation.mutate({
                    full_name: newInterviewer.full_name,
                    email: newInterviewer.email,
                    meeting_link: newInterviewer.meeting_link,
                    active: true,
                    country_codes: newInterviewer.country_codes
                      .split(",")
                      .map((c) => c.trim().toUpperCase())
                      .filter(Boolean),
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add interviewer
              </Button>
            </section>

            {/* ------------------------------ blocked dates ------------------------------ */}
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Blocked dates and holidays</h2>
              <div className="mt-4 space-y-2">
                {(configQuery.data?.blocked ?? []).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-2xl border border-border px-4 py-2 text-sm"
                  >
                    <span>
                      {b.blocked_on} {b.reason ? `· ${b.reason}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await unblockDate({ data: { id: b.id } });
                        invalidate();
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Input
                  type="date"
                  className="w-44 rounded-2xl"
                  value={newBlocked.blocked_on}
                  onChange={(e) => setNewBlocked({ ...newBlocked, blocked_on: e.target.value })}
                />
                <Input
                  className="w-64 rounded-2xl"
                  placeholder="Reason"
                  value={newBlocked.reason}
                  onChange={(e) => setNewBlocked({ ...newBlocked, reason: e.target.value })}
                />
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={async () => {
                    if (!newBlocked.blocked_on) return;
                    try {
                      await blockDate({ data: newBlocked });
                      setNewBlocked({ blocked_on: "", reason: "" });
                      invalidate();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not block that date.");
                    }
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Block date
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        className="mt-1 rounded-2xl"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
