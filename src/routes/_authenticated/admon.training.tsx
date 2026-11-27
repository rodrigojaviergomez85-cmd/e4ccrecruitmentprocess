import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Mail, Save, Check, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdmonReferenceCalls } from "@/components/admon/ReferenceCalls";
import { EditAdmonBasics } from "@/components/admon/EditBasics";
import { listAdmonTraining, saveAdmonTraining, sendAdmonPreparation } from "@/lib/admon-training.functions";
import { ADMON_DOCUMENTS, TRAINING_STATES, buildAdmonPreparationEmail, preparationBlocked, referenceProgress, type AdmonTrainingStatus } from "@/lib/admon-training";
import type { AdmonCandidate } from "@/lib/admon.functions";

const trainingQuery = queryOptions({ queryKey: ["admon-training"], queryFn: () => listAdmonTraining() });
export const Route = createFileRoute("/_authenticated/admon/training")({
  loader: ({ context }) => context.queryClient.ensureQueryData(trainingQuery),
  head: () => ({ meta: [{ title: "E4CC — Training ADMON" }, { name: "description", content: "Seguimiento de Training administrativo: candidatos, referencias y documentación por país." }, { property: "og:title", content: "E4CC — Training ADMON" }, { property: "og:description", content: "Estado de Training, CV y referencias de candidatos administrativos y de ventas." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: TrainingAdmon,
});
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
function TrainingAdmon() {
  const { data } = useSuspenseQuery(trainingQuery);
  const [q, setQ] = useState(""); const [state, setState] = useState("all"); const [country, setCountry] = useState("all");
  const rows = data.candidates.filter((c) => (state === "all" || c.training_status === state) && (country === "all" || c.country === country) && `${c.full_name} ${c.phone} ${c.email} ${c.position}`.toLowerCase().includes(q.toLowerCase()));
  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <Link to="/admon" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Contratación ADMON</Link>
    <h1 className="text-2xl font-semibold text-navy">Training ADMON</h1>
    <div className="grid gap-3 sm:grid-cols-3"><Input aria-label="Buscar en Training ADMON" placeholder="Nombre, teléfono, correo o puesto" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Estado de Training" className={selectCls} value={state} onChange={(e) => setState(e.target.value)}><option value="all">Todos los estados</option>{Object.entries(TRAINING_STATES).map(([k, label]) => <option value={k} key={k}>{label} ({data.candidates.filter((c) => c.training_status === k).length})</option>)}</select>
      <select aria-label="País" className={selectCls} value={country} onChange={(e) => setCountry(e.target.value)}><option value="all">Todos los países</option>{[...new Set(data.candidates.map((c) => c.country))].map((v) => <option key={v}>{v}</option>)}</select>
    </div>
    <p className="text-sm text-muted-foreground">{rows.length} candidatos aprobados para Training</p>
    <section aria-label="Candidatos de Training ADMON" className="divide-y border-y">
      <div className="hidden grid-cols-4 gap-4 bg-muted px-3 py-3 text-sm font-semibold lg:grid"><span>Candidato y contacto</span><span>Puesto y sucursal</span><span>Training</span><span>Referencias y preparación</span></div>
      {rows.map((c) => <TrainingRow key={`${c.id}-${c.training_status}-${c.training_comment}`} c={c} emailStatus={data.emails.find((e) => e.candidate_id === c.id)?.status ?? null} />)}
      {rows.length === 0 && <p className="py-12 text-center text-muted-foreground">No hay candidatos aprobados para Training con estos filtros.</p>}
    </section>
  </main>;
}
function TrainingRow({ c, emailStatus }: { c: AdmonCandidate; emailStatus: string | null }) {
  const save = useServerFn(saveAdmonTraining); const send = useServerFn(sendAdmonPreparation); const qc = useQueryClient();
  const [status, setStatus] = useState<AdmonTrainingStatus>(c.training_status); const [comment, setComment] = useState(c.training_comment); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(false); const [referencesOpen, setReferencesOpen] = useState(false); const [editTraining, setEditTraining] = useState(false);
  const refs = Array.isArray(c.screening["references"]) ? c.screening["references"] as unknown[] : [];
  const progress = referenceProgress(refs, c.reference_calls ?? []);
  const docs = ADMON_DOCUMENTS[c.country];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["admon-training"] }), qc.invalidateQueries({ queryKey: ["admon"] })]);
  const submit = async () => { setBusy(true); try { await save({ data: { id: c.id, status, comment } }); await refresh(); setEditTraining(false); toast.success("Training guardado"); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); } finally { setBusy(false); } };
  const sendMail = async () => { setBusy(true); try { const result = await send({ data: { id: c.id, expectedEmail: c.email, expectedCountry: c.country, expectedName: c.full_name } }); await refresh(); setPreview(false); toast.info(result.detail); } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo solicitar el correo"); } finally { setBusy(false); } };
  return <article className="grid gap-3 py-3 lg:grid-cols-4 lg:px-3">
    <div className="min-w-0 space-y-2"><Link to="/admon/$id" params={{ id: c.id }} className="block break-words font-semibold text-primary underline">{c.full_name}</Link><p className="text-sm">{c.phone || "Sin teléfono"}</p><p className="break-words text-sm text-muted-foreground">{c.email}</p><div className="flex flex-wrap gap-2"><EditAdmonBasics candidate={c} />{c.cv_link.startsWith("https://") && <Button size="sm" variant="outline" asChild><a href={c.cv_link} target="_blank" rel="noreferrer"><ExternalLink /> CV</a></Button>}</div></div>
    <div className="min-w-0 text-sm"><p className="font-medium">{c.position}</p><p className="mt-1">{c.country}</p><p className="break-words text-muted-foreground">{c.branch || "Sucursal pendiente"}</p>{c.technical_at && <p className="mt-2 text-xs text-muted-foreground">Aprobado: {new Date(c.technical_at).toLocaleDateString("es")}</p>}</div>
    <div className="space-y-2"><p className="text-sm font-medium">{TRAINING_STATES[c.training_status]}</p><Button size="sm" variant="outline" onClick={() => setEditTraining(true)}><MessageSquare /> Actualizar Training</Button>
      <Dialog open={editTraining} onOpenChange={setEditTraining}><DialogContent><DialogHeader><DialogTitle>Training — {c.full_name}</DialogTitle></DialogHeader><select aria-label={`Training de ${c.full_name}`} className={selectCls} value={status} disabled={busy} onChange={(e) => setStatus(e.target.value as AdmonTrainingStatus)}>{Object.entries(TRAINING_STATES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select><Textarea aria-label={`Comentarios de ${c.full_name}`} placeholder={status === "dropout" ? "Motivo del Dropout (obligatorio)" : "Comentarios"} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} /><Button disabled={busy} onClick={() => void submit()}><Save /> Guardar</Button></DialogContent></Dialog>
    </div>
    <div className="space-y-2"><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setReferencesOpen(true)}><Phone /> Referencias {progress.done}/{progress.total}</Button><Button title={preparationBlocked(emailStatus) ? "Solicitud de correo ya registrada" : "Revisar correo de preparación"} variant="outline" size="sm" disabled={busy || preparationBlocked(emailStatus) || !docs || !c.email} onClick={() => setPreview(true)}>{preparationBlocked(emailStatus) ? <Check /> : <Mail />}{preparationBlocked(emailStatus) ? "Correo solicitado" : "Preparación"}</Button></div>
      {emailStatus && <p className="text-xs text-muted-foreground" title={emailStatus === "accepted" ? "Solicitud recibida por Make; envío pendiente de confirmación" : undefined}>{emailStatus === "accepted" ? "Recibido por Make · pendiente de confirmación" : emailStatus === "requesting" ? "Solicitud pendiente de revisión" : emailStatus === "sent" ? "Envío confirmado" : "Solicitud fallida; puedes reintentar"}</p>}
      <Dialog open={referencesOpen} onOpenChange={setReferencesOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Referencias — {c.full_name}</DialogTitle></DialogHeader><AdmonReferenceCalls candidate={c} onSaved={() => setReferencesOpen(false)} /></DialogContent></Dialog>
      {!docs && <p className="text-xs text-destructive">Confirma el país para preparar los documentos.</p>}
      <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar correo de preparación</DialogTitle></DialogHeader><p className="break-words text-sm">Para: {c.email}</p>{docs && <div className="space-y-3 text-sm"><h2 className="font-semibold">{buildAdmonPreparationEmail(c.full_name, c.country).subject}</h2><p>Hola, {c.full_name}</p><p>¡Gracias por culminar tu proceso de entrevistas con E4CC!</p><p>Has finalizado exitosamente las tres entrevistas. El equipo de Reclutamiento se encuentra hoy realizando las llamadas de referencias laborales. Por favor, avisa a tus referencias que les estaremos llamando.</p><p>Prepara la siguiente documentación a presentar para {c.country}:</p><ul className="list-disc pl-5">{docs.map((d) => <li key={d}>{d}</li>)}</ul><p>El equipo de Reclutamiento te confirmará los detalles de presentación y el inicio de Training.</p><p>Saludos,<br />Equipo de Reclutamiento E4CC</p></div>}<Button disabled={busy || preparationBlocked(emailStatus)} onClick={() => void sendMail()}><Mail /> Confirmar y enviar</Button></DialogContent></Dialog>
    </div>
  </article>;
}
