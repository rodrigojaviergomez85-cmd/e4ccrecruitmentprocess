import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { MediaCheck } from "@/components/apply/MediaCheck";
import { Stepper } from "@/components/apply/Stepper";
import { VideoRecorder } from "@/components/apply/VideoRecorder";
import type { Recording } from "@/components/apply/media";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  createApplication,
  createUploadTargets,
  getReviewData,
  runAnalysis,
  saveVideo,
  submitApplication,
} from "@/lib/candidate.functions";
import { EXPERIENCE_OPTIONS, questionForSlot } from "@/lib/recruitment";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Teacher Application — E4CC" },
      {
        name: "description",
        content:
          "Complete your E4CC teacher application: share your details and record two short video answers in your browser.",
      },
      { property: "og:title", content: "Teacher Application — E4CC" },
      {
        property: "og:description",
        content: "Share your details and record two short spoken English answers.",
      },
    ],
  }),
  component: Apply,
});

type Step = "profile" | "check" | "video1" | "video2" | "review" | "done";

const STORAGE_KEY = "e4k-application";

const profileSchema = z.object({
  full_name: z.string().trim().min(2, "Please enter your full name").max(120),
  email: z.string().trim().email("Please enter a valid email").max(255),
  phone: z.string().trim().min(5, "Please enter your phone number").max(40),
  country: z.string().trim().min(2, "Please enter your country").max(80),
  city: z.string().trim().min(1, "Please enter your city").max(80),
  teaching_experience: z.enum(EXPERIENCE_OPTIONS),
  taught_children: z.boolean(),
});

type Profile = z.infer<typeof profileSchema>;

type Session = { applicationId: string; token: string; experience: string };

function Apply() {
  const [step, setStep] = useState<Step>("profile");
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    teaching_experience: "No experience",
    taught_children: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reviewVideos, setReviewVideos] = useState<
    Array<{ slot: number; question: string; url: string | null }>
  >([]);
  const topRef = useRef<HTMLDivElement | null>(null);

  const create = useServerFn(createApplication);
  const targets = useServerFn(createUploadTargets);
  const persistVideo = useServerFn(saveVideo);
  const review = useServerFn(getReviewData);
  const submit = useServerFn(submitApplication);
  const analyze = useServerFn(runAnalysis);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSession(JSON.parse(raw) as Session);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const stepNumber =
    step === "profile" || step === "check"
      ? 1
      : step === "video1"
        ? 2
        : step === "video2"
          ? 3
          : 4;

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await create({ data: parsed.data });
      const next = {
        applicationId: result.applicationId,
        token: result.token,
        experience: parsed.data.teaching_experience,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSession(next);
      setStep("check");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRecording(slot: number, recording: Recording) {
    if (!session) return;
    setBusy(true);
    try {
      if (!recording.videoBlob.size) {
        throw new Error("The recording is empty. Please record again.");
      }
      const upload = await targets({
        data: {
          applicationId: session.applicationId,
          token: session.token,
          slot,
          videoExt: recording.videoExt,
        },
      });
      const videoRes = await supabase.storage
        .from("candidate-media")
        .uploadToSignedUrl(upload.video.path, upload.video.token, recording.videoBlob);
      if (videoRes.error) throw new Error(videoRes.error.message);

      await persistVideo({
        data: {
          applicationId: session.applicationId,
          token: session.token,
          slot,
          videoPath: upload.video.path,
          duration: Math.round(recording.durationSeconds),
        },
      });

      if (slot === 1) {
        setStep("video2");
      } else {
        const data = await review({
          data: { applicationId: session.applicationId, token: session.token },
        });
        setReviewVideos(data.videos);
        setStep("review");
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Upload failed: ${err.message}`
          : "Upload failed. Please check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!session) return;
    setBusy(true);
    try {
      await submit({ data: { applicationId: session.applicationId, token: session.token } });
      void analyze({
        data: { applicationId: session.applicationId, token: session.token },
      }).catch(() => {});
      localStorage.removeItem(STORAGE_KEY);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-secondary/40 pb-16">
      <div ref={topRef} />
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <BrandMark className="h-8" />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        {step !== "done" && (
          <div className="mb-6">
            <Stepper current={stepNumber} />
          </div>
        )}

        {step === "profile" && (
          <form
            onSubmit={handleProfileSubmit}
            className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6"
          >
            <div>
              <h1 className="text-2xl font-bold">Tell us about you</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                All fields are required. This takes about a minute.
              </p>
            </div>

            <Field label="Full name" error={errors["full_name"]}>
              <Input
                value={profile.full_name}
                maxLength={120}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="Maria Santos"
              />
            </Field>
            <Field label="Email" error={errors["email"]}>
              <Input
                type="email"
                value={profile.email}
                maxLength={255}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="you@example.com"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Country" error={errors["country_code"]}>
                <SearchSelect
                  triggerLabel="Country"
                  value={profile.country_code}
                  onChange={(value) =>
                    setProfile({
                      ...profile,
                      country_code: value,
                      city_id: "",
                      city_other: "",
                      phone_dial_country: value,
                    })
                  }
                  options={countryOptions}
                  placeholder={countriesLoading ? "Loading…" : "Select your country"}
                  searchPlaceholder="Search countries"
                  emptyText="No countries found."
                />
              </Field>
              <Field label="City" error={errors["city_id"]}>
                <SearchSelect
                  triggerLabel="City"
                  value={profile.city_id}
                  onChange={(value) => setProfile({ ...profile, city_id: value })}
                  options={cityOptions}
                  disabled={!profile.country_code || citiesLoading}
                  placeholder={
                    !profile.country_code
                      ? "Select a country first"
                      : citiesLoading
                        ? "Loading…"
                        : "Select your city"
                  }
                  searchPlaceholder="Search cities"
                  emptyText="No cities found."
                />
              </Field>
            </div>
            {profile.city_id === OTHER_CITY_VALUE && (
              <Field label="Your city" error={errors["city_other"]}>
                <Input
                  value={profile.city_other}
                  maxLength={80}
                  onChange={(e) => setProfile({ ...profile, city_other: e.target.value })}
                  placeholder="Type your city"
                />
              </Field>
            )}
            <Field label="Phone / WhatsApp" error={errors["phone_local"]}>
              <div className="flex gap-2">
                <SearchSelect
                  triggerLabel="Dialing country"
                  className="w-[7.5rem] shrink-0"
                  value={profile.phone_dial_country}
                  onChange={(value) => setProfile({ ...profile, phone_dial_country: value })}
                  options={dialOptions}
                  placeholder="Code"
                  searchPlaceholder="Search"
                  emptyText="No countries found."
                />
                <Input
                  type="tel"
                  className="flex-1"
                  value={profile.phone_local}
                  maxLength={25}
                  onChange={(e) => setProfile({ ...profile, phone_local: e.target.value })}
                  placeholder="7000 0000"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                We&apos;ll save it as {selectedDial?.dial_code ?? "+"}
                {digitsOnly(profile.phone_local) || "…"}
              </p>
            </Field>

            <Field label="Teaching experience" error={errors["teaching_experience"]}>
              <Select
                value={profile.teaching_experience}
                onValueChange={(value) =>
                  setProfile({ ...profile, teaching_experience: value as Profile["teaching_experience"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPERIENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-secondary/40 p-4">
              <Label htmlFor="taught" className="text-sm font-medium">
                Have you taught children before?
              </Label>
              <Switch
                id="taught"
                checked={profile.taught_children}
                onCheckedChange={(checked) => setProfile({ ...profile, taught_children: checked })}
              />
            </div>

            <div className="space-y-2 rounded-2xl border border-border bg-secondary/40 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={profile.contact_consent}
                  onCheckedChange={(checked) =>
                    setProfile({ ...profile, contact_consent: checked === true })
                  }
                />
                <Label htmlFor="consent" className="text-sm font-normal leading-snug">
                  I agree to receive updates about my application and interview by email and
                  WhatsApp.
                </Label>
              </div>
              {errors["contact_consent"] && (
                <p className="text-xs font-medium text-destructive">{errors["contact_consent"]}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Privacy notice: your contact information and recordings are used only for this
                recruitment process and are never shared for marketing or with third parties.
              </p>
            </div>


            <Button
              type="submit"
              size="lg"
              className="h-14 w-full rounded-2xl text-base"
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Continue
            </Button>
          </form>
        )}

        {step === "check" && (
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <MediaCheck onReady={() => setStep("video1")} />
          </div>
        )}

        {step === "video1" && session && (
          <VideoRecorder
            key="video-1"
            slot={1}
            busy={busy}
            question={questionForSlot(1, session.experience)}
            onContinue={(rec) => void handleRecording(1, rec)}
          />
        )}

        {step === "video2" && session && (
          <VideoRecorder
            key="video-2"
            slot={2}
            busy={busy}
            question={questionForSlot(2, session.experience)}
            onContinue={(rec) => void handleRecording(2, rec)}
          />
        )}

        {step === "review" && (
          <div className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div>
              <h1 className="text-2xl font-bold">Review & submit</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Watch your answers one last time, then send your application.
              </p>
            </div>
            {reviewVideos.map((video) => (
              <div key={video.slot} className="space-y-2">
                <p className="text-sm font-semibold">
                  Video {video.slot}: {video.question}
                </p>
                {video.url ? (
                  <video
                    src={video.url}
                    controls
                    playsInline
                    className="w-full rounded-2xl border border-border bg-black"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Preview unavailable.</p>
                )}
              </div>
            ))}
            <Button
              size="lg"
              className="h-14 w-full rounded-2xl text-base"
              onClick={() => void handleSubmit()}
              disabled={busy}
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              Submit Application
            </Button>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
              <PartyPopper className="h-8 w-8" />
            </span>
            <h1 className="mt-5 text-2xl font-bold">Thank you!</h1>
            <p className="mt-2 text-muted-foreground">
              Your application has been received. Our team will review your videos and get back to
              you soon.
            </p>
            <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> Profile submitted
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> Both videos recorded
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> Review in progress
              </li>
            </ul>
            <Button asChild variant="outline" className="mt-8 rounded-2xl">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
