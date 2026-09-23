import { createFileRoute, Link } from "@tanstack/react-router";

import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/interview-confirmed")({
  head: () => ({
    meta: [
      { title: "E4CC | Interview Confirmation" },
      {
        name: "description",
        content:
          "Your E4CC interview is confirmed. We have sent the preparation steps to your email.",
      },
      { property: "og:title", content: "E4CC | Interview Confirmation" },
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

const ZOOM_URL = "https://zoom.us/j/97824770369";
const GRAMMAR_TEST_URL = "https://app.testgorilla.com/s/bnm9wczd";
const GRAMMAR_TOPICS_URL =
  "https://drive.google.com/file/d/1NWJ1ktyJsHc9SKCgA9ZdMlSIzrKqC0-N/view?usp=sharing";
const SAMPLE_CLASS_ONLINE = "https://youtu.be/AoK7oVtSItQ";

function InterviewConfirmed() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: "#0c2d48" }}>
      {/* Orange hero */}
      <section
        className="px-5 py-16 text-center"
        style={{ background: "linear-gradient(135deg, #f26522, #ff7a1a)" }}
      >
        <div className="mb-6 flex justify-center">
          <BrandMark className="h-12 [&_*]:!brightness-0 [&_*]:!invert" />
        </div>
        <h1
          className="font-bold text-white"
          style={{ fontSize: "clamp(2rem, 5vw, 3.375rem)", lineHeight: 1.2 }}
        >
          Thank You for Scheduling Your Interview!
        </h1>
      </section>

      {/* White card container */}
      <div
        className="mx-auto -mt-10 mb-0 bg-white px-6 py-12 sm:px-10 sm:py-14"
        style={{
          maxWidth: 920,
          borderRadius: 18,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          marginTop: "-2.5rem",
          marginBottom: 0,
        }}
      >
        {/* Important alert box */}
        <div
          className="mb-10 rounded-[10px] px-5 py-5"
          style={{ background: "#fff4ed", borderLeft: "6px solid #f26522" }}
        >
          <p className="text-base font-semibold" style={{ color: "#0c2d48" }}>
            <span className="font-bold">Important:</span> You must complete ALL requirements below
            before your Zoom interview.
          </p>
        </div>

        {/* Section title */}
        <h2 className="font-bold" style={{ color: "#0c2d48", fontSize: "1.625rem" }}>
          Your interview has been successfully scheduled with the E4CC Recruitment Team.
        </h2>
        <p className="mt-2 text-base" style={{ color: "#666" }}>
          We have sent the preparation steps to your email. Please check your Inbox and your Spam
          or Junk folder for your confirmation email.
        </p>
        <p className="mt-1 text-base" style={{ color: "#666" }}>
          Please prepare carefully to ensure a successful interview experience. (Estimated
          interview time: 30–40 minutes)
        </p>

        {/* 5 requirement cards grid */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card number={1} emoji="💻" title="Device Requirement">
            <p>You must connect using a laptop or desktop computer.</p>
            <p className="mt-2 font-semibold">Mobile phones are NOT allowed.</p>
          </Card>

          <Card number={2} emoji="📝" title="Grammar Test (Mandatory)">
            <p>Complete the grammar test before your interview.</p>
            <p className="mt-2">⏱ Estimated time: 12 minutes</p>
            <Link href={GRAMMAR_TEST_URL} className="mt-3 inline-block">
              👉 Complete Grammar Test
            </Link>
          </Card>

          <Card number={3} emoji="📚" title="Review Grammar Topics">
            <p>You will explain grammar tenses as if teaching a class.</p>
            <Link href={GRAMMAR_TOPICS_URL} className="mt-3 inline-block">
              👉 Review Reference File
            </Link>
          </Card>

          <Card number={4} emoji="📄" title="Submit Your Information">
            <p>Upload your resume and valid references for your last two positions.</p>
            <Link to="/apply" className="mt-3 inline-block">
              👉 Submit Information
            </Link>
          </Card>

          <Card number={5} emoji="🎬" title="Prepare a Sample Class">
            <p>Watch the video and prepare your demo class.</p>
            <Link href={SAMPLE_CLASS_ONLINE} className="mt-3 inline-block">
              👉 Watch Sample Class
            </Link>
          </Card>
        </div>
      </div>

      {/* Navy footer */}
      <footer className="px-5 py-12 text-center text-white" style={{ backgroundColor: "#0c2d48" }}>
        <p className="text-xl font-semibold">We look forward to meeting you on Zoom.</p>
        <p className="mt-2 text-sm opacity-90">
          <a href={ZOOM_URL} className="underline" target="_blank" rel="noreferrer">
            {ZOOM_URL}
          </a>
        </p>
        <p className="mt-4 text-sm opacity-80">E4CC Recruitment Team</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md border border-white/30 px-5 py-2 text-sm text-white/90 transition-colors hover:bg-white/10"
        >
          Back to home
        </Link>
      </footer>
    </main>
  );
}

function Card({
  number,
  emoji,
  title,
  children,
}: {
  number: number;
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article
      className="rounded-[14px] p-6"
      style={{
        background: "#f9f9f9",
        borderTop: "6px solid #f26522",
        boxShadow: "0 15px 25px rgba(0,0,0,0.15)",
      }}
    >
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ color: "#0c2d48" }}>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
          style={{ backgroundColor: "#f26522" }}
        >
          {number}
        </span>
        <span className="text-xl">{emoji}</span>
        <span>{title}</span>
      </h3>
      <div className="space-y-1 text-sm" style={{ color: "#333" }}>
        {children}
      </div>
    </article>
  );
}
