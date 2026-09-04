import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Sparkles, Video } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Join E4CC — Teacher Application" },
      {
        name: "description",
        content:
          "Apply to become an English teacher at E4CC. Complete your profile and record two short video answers in about 10 minutes.",
      },
      { property: "og:title", content: "Join E4CC — Teacher Application" },
      {
        property: "og:description",
        content:
          "Apply to become an English teacher at E4CC. Record two short video answers directly in your browser.",
      },
    ],
  }),
  component: Welcome,
});

const STEPS = [
  { icon: ClipboardList, title: "Step 1", text: "Complete your profile" },
  { icon: Video, title: "Step 2", text: "Record Video 1" },
  { icon: Video, title: "Step 3", text: "Record Video 2" },
  { icon: Sparkles, title: "Step 4", text: "Submit your application" },
];

function Welcome() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/60 via-background to-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <BrandMark className="h-8" />
        <Link
          to="/auth"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Recruiter login
        </Link>
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Now hiring English teachers
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
            Join E4CC
          </h1>
          <p className="mt-3 text-lg font-medium text-primary">
            Show us your English in just a few minutes.
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            We&apos;d love to learn more about you. You will answer two short questions by
            recording yourself speaking in English. Each answer should be between 1 and 2 minutes.
          </p>

          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, text }) => (
              <li
                key={title}
                className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {title}
                  </span>
                  <span className="block font-semibold">{text}</span>
                </span>
              </li>
            ))}
          </ol>

          <Button asChild size="lg" className="mt-8 h-14 w-full rounded-2xl text-base sm:w-auto sm:px-10">
            <Link to="/apply">
              Start Application <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            You will need a working camera and microphone. Videos must be recorded here — uploads
            are not accepted.
          </p>
        </div>
      </div>
    </main>
  );
}
