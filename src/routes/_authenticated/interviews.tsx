import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
      { title: "Scheduling Settings — E4CC" },
      {
        name: "description",
        content: "Configure interview availability, interviewers, reminders and booked interviews.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Scheduling Settings — E4CC" },
      {
        property: "og:description",
        content: "Configure E4CC interview availability, interviewers and reminders.",
      },
    ],
  }),
  component: InterviewsPage,
});

type SettingsForm = {
  native_booking_enabled: boolean;
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
  const loadAccess = useServerFn(getMyAccess);
  const saveSettings = useServerFn(saveInterviewSettings);
  const saveInterviewer = useServerFn(upsertInterviewer);
  const blockDate = useServerFn(addBlockedDate);
  const unblockDate = useServerFn(removeBlockedDate);
  const setStatus = useServerFn(updateAppointmentStatus);
  const remind = useServerFn(sendManualReminder);

  const accessQuery = useQuery({ queryKey: ["my-access"], queryFn: () => loadAccess() });
  const configQuery = useQuery({ queryKey: ["interview-config"], queryFn: () => loadConfig() });

  const isAdmin = (accessQuery.data?.roles ?? []).includes("admin");
  const canEvaluate = Boolean(accessQuery.data?.canEvaluate);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [newInterviewer, setNewInterviewer] = useState({
    full_name: "",
    email: "",
    meeting_link: "",
    country_codes: "",
  });
  const [newBlocked, setNewBlocked] = useState({ blocked_on: "", reason: "" });

  useEffect(() => {
    const s = configQuery.data?.settings;
    if (s && !form) {
      setForm({
        native_booking_enabled: s.native_booking_enabled,
        timezone: s.timezone,
        duration_minutes: 30,
        buffer_minutes: 0,
        min_notice_hours: s.min_notice_hours,
        max_booking_days: 3,
        max_per_slot: Math.max(5, s.max_per_slot),
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
    mutationFn: (data: {
      id?: string;
      full_name: string;
      email: string;
      meeting_link: string;
      country_codes: string[];
      active: boolean;
    }) => saveInterviewer({ data }),
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
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
        <div>
          <h1 className="text-2xl font-bold">Scheduling settings</h1>
          <p className="text-sm text-muted-foreground">
            Availability, interviewers and blocked dates for internal reschedule links. Booked
            interviews live in Interviews. Times are shown in {orgTz}.
          </p>
        </div>

        {accessQuery.data && !isAdmin && <Navigate to="/evaluations" replace />}

        {isAdmin && form && (
          <>
            {/* --------------------------------- settings -------------------------------- */}
            <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Interview settings</h2>
              <label className="mt-4 flex items-center gap-3 text-sm">
                <Switch
                  checked={form.native_booking_enabled}
                  onCheckedChange={(v) => setForm({ ...form, native_booking_enabled: v })}
                />
                Agendamiento directo en E4CC
              </label>
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
                <div>
                  <Label className="text-xs">Duración del grupo</Label>
                  <p className="mt-2 text-sm font-medium">30 minutos</p>
                </div>
                <div>
                  <Label className="text-xs">Separación entre grupos</Label>
                  <p className="mt-2 text-sm font-medium">Sin intervalo adicional</p>
                </div>
                <NumberField
                  label="Minimum notice (hours)"
                  value={form.min_notice_hours}
                  onChange={(v) => setForm({ ...form, min_notice_hours: v })}
                />
                <div>
                  <Label className="text-xs">Ventana de reservas</Label>
                  <p className="mt-2 text-sm font-medium">Próximas 72 horas · Lunes a sábado</p>
                </div>
                <div>
                  <Label className="text-xs">Candidatos por grupo (cada 30 minutos)</Label>
                  <Select
                    value={String(form.max_per_slot)}
                    onValueChange={(v) => setForm({ ...form, max_per_slot: Number(v) })}
                  >
                    <SelectTrigger className="mt-1" aria-label="Cupo por grupo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 16 }, (_, i) => i + 5).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} candidatos
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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

              <h3 className="mt-6 text-sm font-semibold">Horario de entrevistas (UTC−6)</h3>
              <div className="mt-3 space-y-4">
                {WEEKDAY_LABELS.map((label, index) => {
                  const ranges = form.weekly_hours[String(index)] ?? [];
                  const names = [
                    "Domingo",
                    "Lunes",
                    "Martes",
                    "Miércoles",
                    "Jueves",
                    "Viernes",
                    "Sábado",
                  ];
                  function change(next: Array<[string, string]>) {
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            weekly_hours: { ...current.weekly_hours, [String(index)]: next },
                          }
                        : current,
                    );
                  }
                  return (
                    <div
                      key={label}
                      className="flex flex-wrap items-start gap-3 border-b border-border pb-3"
                    >
                      <div className="flex w-36 items-center gap-2 pt-2">
                        <Switch
                          disabled={index === 0}
                          aria-label={`Habilitar ${names[index]}`}
                          checked={ranges.length > 0}
                          onCheckedChange={(on) =>
                            change(
                              on
                                ? [
                                    ["09:00", "12:30"],
                                    ["14:00", "17:00"],
                                  ]
                                : [],
                            )
                          }
                        />
                        <span className="text-sm">
                          {names[index]}
                          {!ranges.length ? " · OFF" : ""}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {ranges.map((r, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2">
                            <Input
                              type="time"
                              className="w-28"
                              aria-label={`${names[index]} inicio ${i + 1}`}
                              value={r[0]}
                              onChange={(e) =>
                                change(
                                  ranges.map((old, j) =>
                                    j === i ? [e.target.value, old[1]] : old,
                                  ),
                                )
                              }
                            />
                            <span>—</span>
                            <Input
                              type="time"
                              className="w-28"
                              aria-label={`${names[index]} fin ${i + 1}`}
                              value={r[1]}
                              onChange={(e) =>
                                change(
                                  ranges.map((old, j) =>
                                    j === i ? [old[0], e.target.value] : old,
                                  ),
                                )
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Quitar bloque"
                              onClick={() => change(ranges.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {ranges.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => change([...ranges, ["14:00", "17:00"]])}
                          >
                            <Plus className="mr-1 h-4 w-4" />
                            Bloque
                          </Button>
                        )}
                      </div>
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
                        {i.email} ·{" "}
                        {i.country_codes.length ? i.country_codes.join(", ") : "All countries"}
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
                  onChange={(e) =>
                    setNewInterviewer({ ...newInterviewer, full_name: e.target.value })
                  }
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
              <h2 className="text-lg font-semibold">Días OFF y feriados</h2>
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
                  placeholder="Motivo del día OFF"
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
                  <Plus className="mr-2 h-4 w-4" /> Marcar día OFF
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
