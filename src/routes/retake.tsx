import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, Mail, SearchX } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestRetakeAccess, verifyRetakeAccess } from "@/lib/retake.functions";

export const Route = createFileRoute("/retake")({
  head: () => ({ meta: [
    { title: "Continue Your E4CC Retake" },
    { name: "description", content: "Securely recover your previous E4CC application and continue your retake." },
    { property: "og:title", content: "Continue Your E4CC Retake" },
    { property: "og:description", content: "Securely recover your previous E4CC application and continue your retake." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: RetakePage,
});

function RetakePage() {
  const navigate = useNavigate();
  const request = useServerFn(requestRetakeAccess);
  const verify = useServerFn(verifyRetakeAccess);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const normalizedEmail = email.replace(/\s+/g, "").toLowerCase();
  const emailValid = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(normalizedEmail);
  const requestMutation = useMutation({
    mutationFn: () => request({ data: { email: normalizedEmail } }),
    onSuccess: (result) => {
      if (result.ok) {
        setSent(true);
        toast.success("We sent a 6-digit verification code to your email");
        return;
      }
      toast.error("We could not send your code. Please try again.");
    },
    onError: () => toast.error("We could not send your code. Please try again."),
  });
  const verifyMutation = useMutation({
    mutationFn: () => verify({ data: { email: normalizedEmail, code } }),
    onSuccess: (result) => {
      if (result.outcome === "not_found") {
        setNotFound(true);
        return;
      }
      if (result.outcome === "not_approved") {
        setClosed(
          result.eligibleAgainDate
            ? `Thank you for your interest in E4CC. You can apply with us again starting ${result.eligibleAgainDate}.`
            : "Thank you for your interest in E4CC. Your application is currently closed.",
        );
        return;
      }
      void navigate({ to: "/process/$id", params: { id: result.applicationId }, search: { t: result.token } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (closed) {
    return (
      <main className="min-h-screen bg-secondary/30 px-5 py-10">
        <div className="mx-auto max-w-lg">
          <BrandMark className="mx-auto h-9" />
          <section className="mt-8 rounded-lg border bg-card p-6 text-center shadow-sm">
            <h1 className="text-xl font-bold">Application status</h1>
            <p className="mt-3 text-muted-foreground">{closed}</p>
          </section>
        </div>
      </main>
    );
  }
  return <main className="min-h-screen bg-secondary/30 px-5 py-10"><div className="mx-auto max-w-lg"><BrandMark className="mx-auto h-9"/><section className="mt-8 rounded-lg border bg-card p-6 shadow-sm"><Mail className="h-8 w-8 text-primary"/><h1 className="mt-4 text-2xl font-bold">Continue your Retake</h1><p className="mt-2 text-muted-foreground">Enter the email used in your previous application. We’ll send a secure six-digit code.</p><div className="mt-5 space-y-2"><Label>Email address</Label><Input type="email" value={email} disabled={sent} onChange={(e)=>setEmail(e.target.value)} /></div>{sent&&<div className="mt-4 space-y-2"><Label>Secure code</Label><Input inputMode="numeric" maxLength={6} value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))}/><p className="text-xs text-muted-foreground">Check your Inbox, Spam or Junk folder. The code expires in 10 minutes.</p></div>}<Button className="mt-5 w-full" disabled={!emailValid || requestMutation.isPending || verifyMutation.isPending || (sent && code.length!==6)} onClick={()=>sent?verifyMutation.mutate():requestMutation.mutate()}>{(requestMutation.isPending||verifyMutation.isPending)&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{sent?"Verify and Continue":"Send Secure Code"}</Button></section></div></main>;
}