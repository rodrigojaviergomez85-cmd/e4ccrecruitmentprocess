import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAllCountries } from "@/lib/admin.functions";
import {
  STAFF_ROLES,
  createStaffUser,
  listAuditLogs,
  listStaff,
  sendStaffResetLink,
  setStaffActive,
  updateStaffAccess,
  type StaffRole,
} from "@/lib/staff.functions";
import { ROLE_LABELS } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/staff")({
  head: () => ({
    meta: [
      { title: "Staff Access — E4CC" },
      {
        name: "description",
        content:
          "Invitation-only management of E4CC staff accounts, roles and permitted countries.",
      },
      { property: "og:title", content: "Staff Access — E4CC" },
      {
        property: "og:description",
        content: "Create, deactivate and audit E4CC recruiter and admin accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const qc = useQueryClient();
  const fetchStaff = useServerFn(listStaff);
  const fetchCountries = useServerFn(listAllCountries);
  const fetchLogs = useServerFn(listAuditLogs);
  const createFn = useServerFn(createStaffUser);
  const activeFn = useServerFn(setStaffActive);
  const accessFn = useServerFn(updateStaffAccess);
  const resetFn = useServerFn(sendStaffResetLink);

  const staff = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff(), retry: false });
  const countries = useQuery({
    queryKey: ["admin-countries"],
    queryFn: () => fetchCountries(),
    retry: false,
  });
  const logs = useQuery({ queryKey: ["audit-logs"], queryFn: () => fetchLogs(), retry: false });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("recruitment");
  const [picked, setPicked] = useState<string[]>([]);
  const [sendInvite, setSendInvite] = useState(true);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["staff"] });
    void qc.invalidateQueries({ queryKey: ["audit-logs"] });
  };

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          fullName,
          email,
          role,
          countries: picked,
          sendInvite,
          origin: window.location.origin,
        },
      }),
    onSuccess: (res) => {
      setTempPassword(res.tempPassword);
      setFullName("");
      setEmail("");
      setPicked([]);
      toast.success(res.invited ? "Account created and invitation sent." : "Account created.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const countryList = countries.data?.countries ?? [];

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <ShieldCheck className="h-5 w-5 text-primary" /> Staff Access
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-5 py-6">
        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <UserPlus className="h-4 w-4 text-primary" /> Invite a staff member
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts are invitation-only. A strong temporary password is generated on the server
            and shown once — it is never stored or emailed in plain text.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Work email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@e4cc.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Permitted countries</Label>
              <div className="flex flex-wrap gap-2 rounded-2xl border border-border p-3">
                {countryList.map((c) => {
                  const on = picked.includes(c.code);
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() =>
                        setPicked(on ? picked.filter((x) => x !== c.code) : [...picked, c.code])
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {c.flag} {c.code}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendInvite}
              onCheckedChange={(v) => setSendInvite(v === true)}
            />
            Also send a secure password-creation email
          </label>
          <Button
            className="mt-4 rounded-2xl"
            disabled={create.isPending || !fullName || !email}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create account
          </Button>

          {tempPassword ? (
            <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                Temporary password (shown once — copy it now)
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded-xl bg-background px-3 py-2 text-sm">
                  {tempPassword}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(tempPassword);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => setTempPassword(null)}
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-semibold">Staff accounts</h2>
          {staff.isPending ? (
            <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="mt-4 space-y-3">
              {(staff.data ?? []).map((s) => (
                <div key={s.user_id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{s.full_name || s.email}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={s.active ? "default" : "secondary"}>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                      {s.must_change_password ? (
                        <Badge variant="outline">Must change password</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        Last login:{" "}
                        {s.last_login_at
                          ? new Date(s.last_login_at).toLocaleString()
                          : "never"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={s.role ?? "recruitment"}
                      onValueChange={(v) =>
                        accessFn({
                          data: {
                            userId: s.user_id,
                            role: v as StaffRole,
                            countries: s.countries,
                          },
                        })
                          .then(() => {
                            toast.success("Role updated");
                            invalidate();
                          })
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {s.role !== "admin" && s.countries.length === 0 && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                        No countries — sees no candidates
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {countryList.map((c) => {
                        const on = s.countries.includes(c.code);
                        return (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              const next = on
                                ? s.countries.filter((x) => x !== c.code)
                                : [...s.countries, c.code];
                              accessFn({
                                data: {
                                  userId: s.user_id,
                                  role: (s.role ?? "recruitment") as StaffRole,
                                  countries: next,
                                },
                              })
                                .then(() => invalidate())
                                .catch((e: Error) => toast.error(e.message));
                            }}
                            className={`rounded-full border px-2.5 py-1 text-xs ${
                              on
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            {c.code}
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        resetFn({ data: { userId: s.user_id, origin: window.location.origin } })
                          .then(() => {
                            toast.success("Reset link sent");
                            invalidate();
                          })
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      Send reset link
                    </Button>
                    <Button
                      size="sm"
                      variant={s.active ? "ghost" : "default"}
                      onClick={() =>
                        activeFn({ data: { userId: s.user_id, active: !s.active } })
                          .then(() => {
                            toast.success(s.active ? "Deactivated" : "Activated");
                            invalidate();
                          })
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5">
          <h2 className="font-semibold">Audit log</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(logs.data ?? []).map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-muted-foreground"
              >
                <span className="text-xs">{new Date(l.created_at).toLocaleString()}</span>
                <span className="font-medium text-foreground">{l.action}</span>
                <span className="text-xs">{l.entity_type}</span>
                {l.actor_email ? <span className="text-xs">by {l.actor_email}</span> : null}
                {l.actor_role ? (
                  <Badge variant="outline">{ROLE_LABELS[l.actor_role] ?? l.actor_role}</Badge>
                ) : null}
                {l.old_value || l.new_value ? (
                  <span className="w-full text-xs">
                    {l.old_value ? <>Before: <code>{JSON.stringify(l.old_value)}</code> </> : null}
                    {l.new_value ? <>After: <code>{JSON.stringify(l.new_value)}</code></> : null}
                  </span>
                ) : null}
              </div>
            ))}
            {logs.data && logs.data.length === 0 ? (
              <p className="text-muted-foreground">No activity recorded yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
