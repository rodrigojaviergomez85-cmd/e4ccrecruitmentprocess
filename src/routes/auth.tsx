import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Recruiter Login — E4CC" },
      {
        name: "description",
        content: "Sign in to the E4CC recruiter dashboard to review teacher applications.",
      },
      { property: "og:title", content: "Recruiter Login — E4CC" },
      {
        property: "og:description",
        content: "Secure sign-in for the E4CC recruitment team.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error && /rate|too many/i.test(error.message)) {
          toast.error("Too many reset emails requested. Please try again in a few minutes.");
          return;
        }
        // Neutral response regardless of whether the account exists.
        setSentTo(email);
        toast.success("If an account exists for that email, we've sent a reset link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    await navigate({ to: "/dashboard" });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Lock className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">
          {mode === "forgot" ? "Reset password" : "Recruiter access"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot" ? (
            "Enter your work email and we'll send you a secure link to set a new password."
          ) : (
            <>
              For E4CC staff only. Candidates should use the{" "}
              <Link to="/apply" className="font-medium text-primary underline">
                application form
              </Link>
              .
            </>
          )}
        </p>

        {mode === "forgot" && sentTo ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>
              , we&apos;ve sent a reset link. The link expires shortly and can only be used once.
            </div>
            <Button
              variant="outline"
              className="h-12 w-full rounded-2xl"
              onClick={() => setSentTo(null)}
            >
              Send another link
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSentTo(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label>Work email</Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@e4cc.com"
                />
              </div>
              {mode !== "forgot" ? (
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              ) : null}
              <Button type="submit" className="h-12 w-full rounded-2xl" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {mode === "signin" ? "Sign in" : "Send reset link"}
              </Button>
            </form>

            {mode === "signin" ? (
              <button
                type="button"
                className="mt-3 w-full text-center text-sm font-medium text-primary hover:underline"
                onClick={() => setMode("forgot")}
              >
                Forgot your password?
              </button>
            ) : null}

            {mode !== "forgot" ? (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or{" "}
                  <span className="h-px flex-1 bg-border" />
                </div>

                <Button
                  variant="outline"
                  className="h-12 w-full rounded-2xl"
                  onClick={() => void handleGoogle()}
                  disabled={busy}
                >
                  Continue with Google
                </Button>
              </>
            ) : null}

          </>
        )}
      </div>
    </main>
  );
}
