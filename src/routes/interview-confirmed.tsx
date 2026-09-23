import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Mail, CalendarClock, Video } from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/interview-confirmed")({
  head: () => ({
    meta: [
      { title: "Interview Confirmed — E4CC" },
      {
        name: "description",
        content:
          "Your E4CC interview is confirmed. We have sent the preparation steps to your email.",
      },
      { property: "og:title", content: "Interview Confirmed — E4CC" },
      {
        property: "og:description",
        content:
          "Your E4CC interview is confirmed. We have sent the preparation steps to your email.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterviewConfirmed,
});

function InterviewConfirmed() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-secondary/60 via-background to-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <BrandMark className="h-8" />
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm sm:p-10">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-11 w-11 text-success" />
            </span>
          </div>

          <h1 className="mt-6 text-center text-3xl font-extrabold leading-tight sm:text-4xl">
            Your interview is confirmed
          </h1>
          <p className="mt-4 text-center text-lg font-medium text-primary">
            We have sent the preparation steps to your email.
          </p>

          <p className="mt-4 max-w-xl mx-auto text-center text-base leading-relaxed text-muted-foreground">
            Please review the preparation materials before your interview. Check your Inbox,
            Spam, or Junk folder if you don't see the message.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-center">
              <Mail className="h-6 w-6 text-primary" />
              <span className="font-semibold">Check your email</span>
              <span className="text-sm text-muted-foreground">
                Preparation steps and Zoom link were sent to you.
              </span>
            </article>
            <article className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-center">
              <CalendarClock className="h-6 w-6 text-primary" />
              <span className="font-semibold">Be on time</span>
              <span className="text-sm text-muted-foreground">
                Join the Zoom meeting a few minutes early.
              </span>
            </article>
            <article className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-center">
              <Video className="h-6 w-6 text-primary" />
              <span className="font-semibold">Use a laptop</span>
              <span className="text-sm text-muted-foreground">
                A laptop or desktop with camera and microphone is required.
              </span>
            </article>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button asChild variant="outline">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          English4CallCenters (E4CC) Recruitment Team
        </p>
      </div>
    </main>
  );
}
