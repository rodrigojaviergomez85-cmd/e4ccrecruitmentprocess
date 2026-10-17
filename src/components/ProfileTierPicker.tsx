import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getProfileTier, setProfileTier } from "@/lib/profile-tier.functions";

type Tier = "A" | "B" | "C";

/** Manual A/B/C classification for one evaluation (Recruitment or Manager stage). */
export function ProfileTierPicker({ stage, evaluationId }: { stage: "recruitment" | "manager"; evaluationId?: string | null }) {
  const fetchFn = useServerFn(getProfileTier);
  const saveFn = useServerFn(setProfileTier);
  const qc = useQueryClient();
  const key = ["profile-tier", stage, evaluationId];
  const { data } = useQuery({ queryKey: key, enabled: Boolean(evaluationId), queryFn: () => fetchFn({ data: { stage, evaluationId: evaluationId! } }) });
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && data) { setTier(data.tier); setReason(data.reason); } }, [open, data]);
  if (!evaluationId || !data) return null;

  const save = async (t: Tier | null) => {
    setBusy(true);
    try {
      await saveFn({ data: { stage, evaluationId, tier: t, reason } });
      await qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["recruitment-metrics"] });
      toast.success("Perfil guardado");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        Perfil {stage === "manager" ? "(manager)" : ""}: {data.tier ?? "Sin clasificar"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Calidad del candidato · {stage === "manager" ? "validación del manager" : "Recruitment"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              {(["A", "B", "C"] as Tier[]).map((t) => (
                <button key={t} type="button" disabled={!data.canEdit}
                  onClick={() => setTier(t)}
                  className={`rounded-lg border p-3 text-left text-sm ${tier === t ? "border-primary bg-primary/10" : "border-border"}`}>
                  <span className="font-semibold">{t}</span> — {data.labels[t]}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Justificación breve</Label>
              <Textarea value={reason} disabled={!data.canEdit} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Evidencia concreta frente al perfil requerido" />
            </div>
            {data.by && <p className="text-xs text-muted-foreground">Clasificado por {data.by}{data.at ? ` · ${new Date(data.at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" })}` : ""}</p>}
            {data.canEdit && (
              <div className="flex justify-between gap-2">
                {data.tier && <Button variant="ghost" disabled={busy} onClick={() => save(null)}>Quitar clasificación</Button>}
                <Button className="ml-auto" disabled={busy || !tier || reason.trim().length < 5} onClick={() => save(tier)}>Guardar</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
