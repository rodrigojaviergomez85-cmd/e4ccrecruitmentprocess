import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyReferrals, requestReferralCode, signOutReferrals, verifyReferralCode } from "@/lib/referrals.functions";

export const Route = createFileRoute("/mis-referidos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mis referidos — E4CC" },
      { name: "description", content: "Consulta el estado de las personas que referiste a E4CC con un código temporal enviado a tu correo." },
      { property: "og:title", content: "Mis referidos — E4CC" },
      { property: "og:description", content: "Consulta privada del estado de tus referidos en E4CC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyReferrals,
});

const fmt = (d: string) => new Date(d).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });

function MyReferrals() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMyReferrals);
  const { data, isPending } = useQuery({ queryKey: ["my-referrals"], queryFn: () => fetchMine() });
  const requestCode = useServerFn(requestReferralCode);
  const verify = useServerFn(verifyReferralCode);
  const signOut = useServerFn(signOutReferrals);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { toast.error("Escribe un correo válido."); return; }
    setBusy(true);
    try {
      const r = await requestCode({ data: { email } });
      if (!r.ok) { toast.error("No pudimos enviar el código. Intenta de nuevo."); return; }
      setStep("code");
      toast.success("Si tu correo está registrado, recibirás un código de 6 dígitos.");
    } catch { toast.error("No pudimos enviar el código. Intenta de nuevo."); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true);
    try {
      const r = await verify({ data: { email, code: code.trim() } });
      if (!r.ok) { toast.error("Código incorrecto o vencido."); return; }
      await qc.invalidateQueries({ queryKey: ["my-referrals"] });
    } catch { toast.error("Código incorrecto o vencido."); } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-secondary/40 px-5 py-12">
      <div className="mx-auto max-w-2xl rounded-xl border bg-card p-6 shadow-sm">
        {isPending ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : data?.signedIn ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Mis referidos</p>
                <h1 className="text-2xl font-semibold">{data.referrerName}</h1>
              </div>
              <Button variant="outline" size="sm" onClick={async () => { await signOut(); await qc.invalidateQueries({ queryKey: ["my-referrals"] }); setStep("email"); setCode(""); }}>
                <LogOut /> Cerrar sesión
              </Button>
            </div>
            {data.referrals.length === 0 ? (
              <p className="mt-8 text-sm text-muted-foreground">Aún no hay referidos registrados con tu correo.</p>
            ) : (
              <ul className="mt-6 divide-y rounded-lg border">
                {data.referrals.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">Actualizado {fmt(r.updatedAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">{r.status}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Bono: {r.bonusStatus}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Mis referidos</h1>
            <p className="mt-2 text-sm text-muted-foreground">Escribe el correo que usaste al referir. Te enviaremos un código temporal para ver el estado de tus referidos.</p>
            <div className="mt-6 space-y-3">
              <Input type="email" placeholder="tu@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "code"} />
              {step === "code" && (
                <Input inputMode="numeric" maxLength={6} placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              )}
              {step === "email" ? (
                <Button className="w-full" onClick={send} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Enviar código</Button>
              ) : (
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={check} disabled={busy || code.length !== 6}>{busy && <Loader2 className="animate-spin" />} Ver mis referidos</Button>
                  <Button variant="outline" onClick={() => { setStep("email"); setCode(""); }}>Cambiar correo</Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
