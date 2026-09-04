import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Signing you in — E4CC" },
      { name: "description", content: "Completing secure sign-in for the E4CC recruitment team." },
      { property: "og:title", content: "Signing you in — E4CC" },
      { property: "og:description", content: "Completing secure sign-in for E4CC staff." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let done = false;
    const go = (to: "/dashboard" | "/auth") => {
      if (done) return;
      done = true;
      void navigate({ to, replace: true });
    };

    const params = new URLSearchParams(window.location.search);
    if (params.get("error") || params.get("error_description")) {
      setMessage("Google sign-in failed. Taking you back…");
      go("/auth");
      return;
    }

    // The session may land a moment after the redirect: listen and also poll once.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go("/dashboard");
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go("/dashboard");
    });

    const timeout = setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        go(data.session ? "/dashboard" : "/auth");
      });
    }, 4000);

    return () => {
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-5">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {message}
      </div>
    </main>
  );
}
