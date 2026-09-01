import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a New Password — English4Kids" },
      {
        name: "description",
        content:
          "Create a new password for your English4Kids recruiter account using your secure recovery link.",
      },
      { property: "og:title", content: "Set a New Password — English4Kids" },
      {
        property: "og:description",
        content: "Securely restore access to the English4Kids recruiter dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type State = "checking" | "ready" | "invalid" | "done";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const hash = window.location.hash ?? "";
    const isRecoveryLink = hash.includes("type=recovery") || hash.includes("access_token");
    const search = new URLSearchParams(window.location.search);
    const hasCode = search.has("code");

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (session && (isRecoveryLink || hasCode))) {
        setState("ready");
        // Strip the recovery tokens from the address bar.
        window.history.replaceState({}, "", "/reset-password");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session && (isRecoveryLink || hasCode)) {
        setState("ready");
        window.history.replaceState({}, "", "/reset-password");
      } else {
        // Give the client a moment to exchange the link for a recovery session.
        setTimeout(() => {
          if (!active) return;
          void supabase.auth.getSession().then(({ data: retry }) => {
            if (!active) return;
            setState(retry.session && (isRecoveryLink || hasCode) ? "ready" : "invalid");
          });
        }, 1200);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setState("done");
      toast.success("Password updated. You're signed in.");
      await navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Set a new password</h1>

        {state === "checking" ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying your recovery link…
          </p>
        ) : null}

        {state === "invalid" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              This recovery link is invalid or has expired. Reset links can only be used once and
              expire after a short time.
            </p>
            <Button asChild className="h-12 w-full rounded-2xl">
              <Link to="/auth">Request a new link</Link>
            </Button>
          </div>
        ) : null}

        {state === "ready" || state === "done" ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a strong password you don&apos;t use anywhere else.
            </p>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 w-full rounded-2xl" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
