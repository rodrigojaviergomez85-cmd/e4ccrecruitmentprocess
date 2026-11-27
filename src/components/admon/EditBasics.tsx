import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ADMON_COUNTRIES, ADMON_BRANCHES, ADMON_POSITIONS } from "@/lib/admon";
import { updateAdmonBasics, type AdmonCandidate } from "@/lib/admon.functions";

export function EditAdmonBasics({ candidate: c }: { candidate: AdmonCandidate }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const initial = () => ({ full_name: c.full_name, email: c.email, phone: c.phone, cv_link: c.cv_link, country: c.country, branch: c.branch, position: c.position });
  const [f, setF] = useState(initial);
  const save = useServerFn(updateAdmonBasics);
  const qc = useQueryClient();
  const submit = async () => {
    setBusy(true);
    try { await save({ data: { id: c.id, ...f } }); await Promise.all([qc.invalidateQueries({ queryKey: ["admon"] }), qc.invalidateQueries({ queryKey: ["admon-training"] })]); setOpen(false); toast.success("Datos actualizados"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  };
  const cls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  return <><Button variant="outline" size="sm" onClick={() => { setF(initial()); setOpen(true); }}><Pencil /> Editar datos</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Editar datos del candidato</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">{([ ["full_name", "Nombre completo"], ["email", "Correo"], ["phone", "Teléfono"], ["cv_link", "Enlace del CV"] ] as const).map(([key, label]) => <div key={key}><Label htmlFor={`edit-${key}`}>{label}</Label><Input id={`edit-${key}`} type={key === "email" ? "email" : "text"} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></div>)}
        {([["country", "País", ADMON_COUNTRIES], ["branch", "Sucursal de trabajo", ADMON_BRANCHES], ["position", "Puesto", ADMON_POSITIONS]] as const).map(([key, label, options]) => <div key={key}><Label htmlFor={`edit-${key}`}>{label}</Label><select id={`edit-${key}`} className={cls} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })}><option value="">Elegir…</option>{f[key] && !options.some((v) => v === f[key]) && <option>{f[key]}</option>}{options.map((v) => <option key={v}>{v}</option>)}</select></div>)}
      </div><Button disabled={busy} onClick={() => void submit()}><Save /> Guardar datos</Button>
    </DialogContent></Dialog></>;
}
