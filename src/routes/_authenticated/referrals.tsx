import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createReferral, listReferrals, updateReferral, validateReferrer } from "@/lib/referrals.functions";
import { BONUS_STATUSES } from "@/lib/referrals";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Referrals — E4CC" },
      { name: "description", content: "Gestión interna de referidos E4CC: validar referidores, enlazar candidatos y estado del bono." },
      { property: "og:title", content: "Referrals — E4CC" },
      { property: "og:description", content: "Gestión interna de referidos y bonos E4CC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralsPage,
});

type Row = Awaited<ReturnType<typeof listReferrals>>[number];
const EMPTY = { referrerName: "", referrerEmail: "", referrerPhone: "", referredName: "", referredEmail: "", referredPhone: "", lob: "", branch: "", comments: "" };

function ReferralsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listReferrals);
  const create = useServerFn(createReferral);
  const update = useServerFn(updateReferral);
  const validate = useServerFn(validateReferrer);
  const { data, isPending } = useQuery({ queryKey: ["referrals"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["referrals"] });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter((r) => !t || [r.referrerName, r.referrerEmail, r.referredName, r.referredEmail].some((v) => (v ?? "").toLowerCase().includes(t)));
  }, [data, q]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const r = await create({ data: form });
      toast.success(r.emailSent ? "Referido guardado y confirmación enviada." : "Referido guardado.");
      setForm(EMPTY); setOpen(false); await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); } finally { setSaving(false); }
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Referrals</h1>
          <p className="text-sm text-muted-foreground">Guarda el correo del colaborador y podrá entrar a <span className="font-medium">/mis-referidos</span> con el código que le llega a ese correo.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Buscar nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Button onClick={() => setOpen(true)}><Plus /> Add referral</Button>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        {isPending ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No hay referidos todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Referidor</th><th className="p-3">Referido</th><th className="p-3">Candidatura</th><th className="p-3">Estado público</th><th className="p-3">Bono</th><th className="p-3">Disputa</th></tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => <ReferralRow key={r.id} r={r} run={run} update={update} validate={validate} />)}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nuevo referido</DialogTitle></DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["referrerName", "Nombre completo del referidor *"], ["referrerEmail", "Correo del referidor"], ["referrerPhone", "Teléfono del referidor"],
              ["referredName", "Nombre completo del referido *"], ["referredEmail", "Correo del referido"], ["referredPhone", "Teléfono del referido"],
              ["lob", "Quiere trabajar (LOB)"], ["branch", "Sucursal de interés"], ["comments", "Comentarios"],
            ] as const).map(([k, label]) => (
              <Input key={k} placeholder={label} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            ))}
          </div>
          <Button onClick={submit} disabled={saving || form.referrerName.trim().length < 2 || form.referredName.trim().length < 2}>
            {saving && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ReferralRow({ r, run, update, validate }: {
  r: Row;
  run: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  update: ReturnType<typeof useServerFn<typeof updateReferral>>;
  validate: ReturnType<typeof useServerFn<typeof validateReferrer>>;
}) {
  const [refEmail, setRefEmail] = useState(r.referrerEmail ?? "");
  const [appEmail, setAppEmail] = useState(r.referredEmail ?? "");
  return (
    <tr className="align-top">
      <td className="p-3">
        <p className="font-medium">{r.referrerName}</p>
        <div className="mt-1 flex items-center gap-1">
          <Input className="h-8 w-52" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} placeholder="correo" />
          {r.referrerId && (refEmail.trim() && refEmail !== (r.referrerEmail ?? "") ? (
            <Button size="sm" onClick={() => run(() => validate({ data: { id: r.referrerId!, email: refEmail, validated: true } }), "Correo guardado")}>Guardar</Button>
          ) : r.referrerEmail ? <Check className="h-4 w-4 text-muted-foreground" aria-label="Correo guardado" /> : null)}
        </div>
      </td>
      <td className="p-3"><p className="font-medium">{r.referredName}</p><p className="text-xs text-muted-foreground">{r.lob}{r.branch ? ` · ${r.branch}` : ""}</p></td>
      <td className="p-3">
        {r.applicationId ? (
          <div>
            <p>{r.applicationName}</p>
            <p className="text-xs text-muted-foreground">{r.internalStatus}</p>
            <button className="text-xs text-primary underline" onClick={() => run(() => update({ data: { id: r.id, unlink: true } }), "Desvinculado")}>Desvincular</button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Input className="h-8 w-48" value={appEmail} onChange={(e) => setAppEmail(e.target.value)} placeholder="correo del candidato" />
            <Button size="sm" variant="outline" onClick={() => run(() => update({ data: { id: r.id, applicationEmail: appEmail } }), "Candidatura enlazada")}><Link2 /></Button>
          </div>
        )}
      </td>
      <td className="p-3"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{r.publicStatus}</span></td>
      <td className="p-3">
        <Select value={r.bonusStatus} onValueChange={(v) => run(() => update({ data: { id: r.id, bonusStatus: v as (typeof BONUS_STATUSES)[number] } }), "Bono actualizado")}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{BONUS_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="p-3">
        <Button size="sm" variant={r.disputed ? "destructive" : "outline"} onClick={() => run(() => update({ data: { id: r.id, disputed: !r.disputed } }), "Actualizado")}>
          {r.disputed ? "En disputa" : "Marcar"}
        </Button>
      </td>
    </tr>
  );
}
