import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, ExternalLink, FileText, Loader2, Lock, RefreshCw, Upload, Wifi } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { BrandMark } from "@/components/BrandMark";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { createResumeUploadTarget, getRecruitmentProcess, markSchedulingOpened, recordCalendlyBooking, saveRecruitmentProgress, saveResume, saveWorkReference } from "@/lib/process.functions";

const CALENDLY_URL = "https://calendly.com/teachingjobs4callcenters/schedule";
const ZOOM_URL = "https://zoom.us/j/97824770369";

export const Route = createFileRoute("/process/$id")({
  validateSearch: z.object({ t: z.string().optional() }),
  head: () => ({ meta: [
    { title: "E4CC Recruitment Process" },
    { name: "description", content: "Complete your E4CC interview preparation and schedule your interview." },
    { property: "og:title", content: "E4CC Recruitment Process" },
    { property: "og:description", content: "Complete your E4CC interview preparation and schedule your interview." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ProcessPage,
});

type State = Extract<Awaited<ReturnType<typeof getRecruitmentProcess>>, { invalid: null }>;
type Reference = State["references"][number];

function ProcessPage() {
  const { id } = Route.useParams();
  const token = Route.useSearch().t ?? "";
  const load = useServerFn(getRecruitmentProcess);
  const query = useQuery({ queryKey: ["process", id], queryFn: () => load({ data: { applicationId: id, token } }), enabled: Boolean(token), retry: false, refetchInterval: (q) => (q.state.data && "appointment" in q.state.data && q.state.data.appointment ? false : 5000) });
  if (!token || query.error || (query.data && query.data.invalid != null)) return <Denied message={query.data?.invalid ?? (query.error as Error | null)?.message} />;
  if (!query.data) return <Shell><Skeleton className="h-96 w-full rounded-lg" /></Shell>;
  return <Shell><Content state={query.data} id={id} token={token} /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-secondary/30 pb-16"><header className="border-b bg-background"><div className="mx-auto max-w-3xl px-5 py-4"><BrandMark className="h-8" /></div></header><div className="mx-auto max-w-3xl space-y-4 px-5 py-7">{children}</div></main>;
}

function Denied({ message }: { message?: string }) {
  return <Shell><section className="rounded-lg border bg-card p-8 text-center"><h1 className="text-2xl font-bold">This page is not available</h1><p className="mt-3 text-muted-foreground">{message ?? "This link is not valid."}</p><Button asChild variant="outline" className="mt-6"><Link to="/">Back to home</Link></Button></section></Shell>;
}

function Content({ state, id, token }: { state: State; id: string; token: string }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveRecruitmentProgress);
  const markOpened = useServerFn(markSchedulingOpened);
  const setState = (next: State) => queryClient.setQueryData(["process", id], next);
  const saveMutation = useMutation({ mutationFn: (patch: Record<string, string | number>) => save({ data: { applicationId: id, token, ...patch } }), onSuccess: (next) => setState(next as State), onError: (e: Error) => toast.error(e.message) });
  const opened = useRef(false);
  useEffect(() => { if (state.unlocked && !opened.current) { opened.current = true; void markOpened({ data: { applicationId: id, token } }); } }, [state.unlocked, id, token, markOpened]);
  const completed = state.requirements.filter((item) => item.done).length;
  return <>
    <section className="rounded-lg border bg-card p-6"><p className="text-sm font-semibold text-primary">E4CC Recruitment Process</p><h1 className="mt-1 text-2xl font-bold">You’re almost ready, {state.candidate.fullName.split(/\s+/)[0]}.</h1><p className="mt-2 text-muted-foreground">Complete these simple steps, then choose your interview time.</p><p className="mt-4 text-sm font-medium">{completed} of {state.requirements.length} ready</p></section>
    <PositionCard state={state} saveMutation={saveMutation} id={id} token={token} setState={setState} />
    <DocumentsCard state={state} id={id} token={token} setState={setState} />
    <SchedulingCard state={state} id={id} token={token} />
  </>;
}

function PositionCard({ state, saveMutation, id, token, setState }: { state: State; saveMutation: ReturnType<typeof useMutation>; id: string; token: string; setState: (s: State) => void }) {
  const modality = state.progress.work_modality;
  const [testing, setTesting] = useState(false);
  async function speedTest() {
    setTesting(true);
    try {
      const pingStart = performance.now();
      await fetch(`/api/public/speed-test?ping=${Date.now()}`, { cache: "no-store" });
      const ping = performance.now() - pingStart;
      const downStart = performance.now();
      const download = await fetch(`/api/public/speed-test?download=${Date.now()}`, { cache: "no-store" }).then((r) => r.arrayBuffer());
      const downSeconds = (performance.now() - downStart) / 1000;
      const uploadBytes = new Uint8Array(1024 * 1024);
      const upStart = performance.now();
      await fetch("/api/public/speed-test", { method: "POST", body: uploadBytes });
      const upSeconds = (performance.now() - upStart) / 1000;
      const next = await saveRecruitmentProgress({ data: { applicationId: id, token, internet_download_mbps: Math.round((download.byteLength * 8 / downSeconds / 1_000_000) * 10) / 10, internet_upload_mbps: Math.round((uploadBytes.byteLength * 8 / upSeconds / 1_000_000) * 10) / 10, internet_ping_ms: Math.round(ping) } });
      setState(next as State);
    } catch { toast.error("We could not complete the speed test. Please try again."); } finally { setTesting(false); }
  }
  const p = state.progress;
  return <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-bold">1. Choose your position</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{(["online", "onsite"] as const).map((value) => <Button key={value} variant={modality === value ? "default" : "outline"} className="h-auto justify-start p-4 text-left" onClick={() => saveMutation.mutate({ work_modality: value })}><span><strong className="block">{value === "online" ? "Online Coach" : "Onsite Coach"}</strong><small>{value === "online" ? "Work from home" : "Work at an E4CC site"}</small></span></Button>)}</div>
    {modality === "online" && <div className="mt-5 rounded-lg bg-secondary/50 p-4"><div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-primary"/><h3 className="font-semibold">Internet Speed Test</h3></div><p className="mt-1 text-sm text-muted-foreground">Online positions require at least 10 Mbps download and 10 Mbps upload.</p><Button variant="outline" className="mt-3" disabled={testing} onClick={() => void speedTest()}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <RefreshCw className="mr-2 h-4 w-4"/>}{p.internet_tested_at ? "Test again" : "Start test"}</Button>{p.internet_tested_at && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm"><Metric label="Download" value={`${p.internet_download_mbps ?? 0} Mbps`}/><Metric label="Upload" value={`${p.internet_upload_mbps ?? 0} Mbps`}/><Metric label="Ping" value={`${p.internet_ping_ms ?? 0} ms`}/></div>}{p.internet_tested_at && !p.internet_test_passed && !p.internet_override && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive"><span>Your connection needs review.</span><Button size="sm" variant="outline" onClick={() => saveMutation.mutate({ work_modality: "onsite" })}>Change to Onsite</Button></div>}</div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-md border bg-background p-2"><span className="block font-semibold">{value}</span><span className="text-xs text-muted-foreground">{label}</span></div>; }

function DocumentsCard({ state, id, token, setState }: { state: State; id: string; token: string; setState: (s: State) => void }) {
  const createTarget = useServerFn(createResumeUploadTarget); const commit = useServerFn(saveResume); const saveRef = useServerFn(saveWorkReference);
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [count, setCount] = useState(Math.max(1, state.references.length));
  async function upload(file: File) { const ext = (file.name.split(".").pop() ?? "").toLowerCase(); if (!["pdf","doc","docx"].includes(ext) || file.size > 10 * 1024 * 1024) return toast.error("Use one PDF, DOC or DOCX file up to 10 MB."); setBusy(true); try { const target = await createTarget({ data: { applicationId: id, token, ext: ext as "pdf"|"doc"|"docx", size: file.size } }); const result = await supabase.storage.from("candidate-media").uploadToSignedUrl(target.path, target.token, file); if (result.error) throw result.error; setState(await commit({ data: { applicationId: id, token, path: target.path, filename: file.name } }) as State); toast.success("Resume uploaded"); } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); } }
  return <section className="rounded-lg border bg-card p-6"><h2 className="text-lg font-bold">2. Resume and Work References</h2><p className="mt-1 text-sm text-muted-foreground">Upload one resume and complete at least Reference 1. You may add up to five.</p><input ref={input} className="hidden" type="file" accept=".pdf,.doc,.docx" onChange={(e) => { const f=e.target.files?.[0]; if(f) void upload(f); }}/><Button variant="outline" className="mt-4" disabled={busy} onClick={() => input.current?.click()}><Upload className="mr-2 h-4 w-4"/>{state.progress.resume_path ? "Replace resume" : "Upload resume"}</Button>{state.progress.resume_filename && <span className="ml-3 text-sm text-success"><CheckCircle2 className="mr-1 inline h-4 w-4"/>{state.progress.resume_filename}</span>}
    <div className="mt-5 flex items-center justify-between"><h3 className="font-semibold">Work References</h3><span className="rounded-full bg-secondary px-3 py-1 text-xs">{count} of 5</span></div>
    <Accordion type="single" collapsible defaultValue="reference-1" className="mt-2">{Array.from({ length: count }, (_, i) => i + 1).map((slot) => <AccordionItem key={slot} value={`reference-${slot}`}><AccordionTrigger>Reference {slot} {slot === 1 ? "(required)" : "(optional)"}</AccordionTrigger><AccordionContent><ReferenceForm initial={state.references.find((r) => r.slot === slot)} onSave={async (values) => { const next = await saveRef({ data: { applicationId: id, token, slot, ...values } }); setState(next as State); if ("error" in next && next.error) toast.error(next.error); else toast.success("Reference saved"); }}/></AccordionContent></AccordionItem>)}</Accordion>
    {count < 5 && <Button size="sm" variant="outline" className="mt-3" onClick={() => setCount((c) => c + 1)}>Add another reference</Button>}
  </section>;
}

type RefValues = { company:string; position:string; start_date:string|null; end_date:string|null; currently_working:boolean; supervisor_name:string; supervisor_position:string; supervisor_phone:string; supervisor_email:string; reason_for_leaving:string; may_contact:boolean };
function ReferenceForm({ initial, onSave }: { initial?: Reference; onSave: (v: RefValues) => Promise<void> }) {
  const [v,setV]=useState<RefValues>({company:initial?.company??"",position:initial?.position??"",start_date:initial?.start_date??"",end_date:initial?.end_date??"",currently_working:initial?.currently_working??false,supervisor_name:initial?.supervisor_name??"",supervisor_position:initial?.supervisor_position??"",supervisor_phone:initial?.supervisor_phone??"",supervisor_email:initial?.supervisor_email??"",reason_for_leaving:initial?.reason_for_leaving??"",may_contact:initial?.may_contact??true}); const [busy,setBusy]=useState(false); const set=(p:Partial<RefValues>)=>setV((x)=>({...x,...p}));
  return <div className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field label="Company"><Input value={v.company} onChange={(e)=>set({company:e.target.value})}/></Field><Field label="Your position"><Input value={v.position} onChange={(e)=>set({position:e.target.value})}/></Field><Field label="Start date"><Input type="date" value={v.start_date??""} onChange={(e)=>set({start_date:e.target.value})}/></Field><Field label="End date"><Input type="date" disabled={v.currently_working} value={v.end_date??""} onChange={(e)=>set({end_date:e.target.value})}/></Field><Field label="Supervisor name"><Input value={v.supervisor_name} onChange={(e)=>set({supervisor_name:e.target.value})}/></Field><Field label="Supervisor position"><Input value={v.supervisor_position} onChange={(e)=>set({supervisor_position:e.target.value})}/></Field><Field label="Phone / WhatsApp (international)"><Input placeholder="+503 7777 7777" value={v.supervisor_phone} onChange={(e)=>set({supervisor_phone:e.target.value})}/></Field><Field label="Email (optional)"><Input type="email" value={v.supervisor_email} onChange={(e)=>set({supervisor_email:e.target.value})}/></Field></div><label className="flex items-center gap-2 text-sm"><Checkbox checked={v.currently_working} onCheckedChange={(x)=>set({currently_working:x===true,end_date:""})}/>Currently working here</label><Field label="Reason for leaving"><Textarea value={v.reason_for_leaving} onChange={(e)=>set({reason_for_leaving:e.target.value})}/></Field><label className="flex items-center gap-2 text-sm"><Checkbox checked={v.may_contact} onCheckedChange={(x)=>set({may_contact:x===true})}/>E4CC may contact this person</label><Button disabled={busy} onClick={async()=>{setBusy(true);try{await onSave({...v,start_date:v.start_date||null,end_date:v.currently_working?null:v.end_date||null});}finally{setBusy(false);}}}>Save reference</Button></div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>}

function SchedulingCard({ state, id, token }: { state: State; id: string; token: string }) {
  const sync = useServerFn(recordCalendlyBooking); const queryClient=useQueryClient(); const [waiting,setWaiting]=useState(false);
  useEffect(()=>{const listener=(event:MessageEvent)=>{const d=event.data as {event?:string}|null;if(d?.event!=="calendly.event_scheduled")return;setWaiting(true);setTimeout(async()=>{await sync({data:{applicationId:id,token}});await queryClient.invalidateQueries({queryKey:["process",id]});},3000)};window.addEventListener("message",listener);return()=>window.removeEventListener("message",listener)},[id,token,sync,queryClient]);
  if(state.appointment){const email=state.preparationEmail;const masked=state.candidate.email.replace(/^(.).*(?=@)/,"$1***");return <section className="rounded-lg border border-success/40 bg-card p-6"><CheckCircle2 className="h-8 w-8 text-success"/><h2 className="mt-3 text-2xl font-bold">Your interview is scheduled!</h2><p className="mt-2 text-muted-foreground">{email?.status==="sent"?"We have sent the next steps and preparation materials to your email. Please review them before your interview.":"Your interview is scheduled, but we could not send the preparation email. You can review the steps below."}</p><dl className="mt-4 grid gap-2 text-sm"><div><b>Date and time:</b> {new Date(state.appointment.starts_at).toLocaleString(undefined,{timeZone:state.appointment.candidate_timezone})}</div><div><b>Timezone:</b> {state.appointment.candidate_timezone}</div><div><b>Zoom:</b> <a className="text-primary underline" href={ZOOM_URL}>{ZOOM_URL}</a></div></dl><p className="mt-4 text-sm">Preparation instructions {email?.status==="sent"?"were sent":"will be available"} to {masked}. Please check your Inbox, Spam or Junk folder.</p><Button asChild variant="outline" className="mt-4"><a href={ZOOM_URL} target="_blank" rel="noreferrer">View Preparation Steps</a></Button></section>}
  if(!state.unlocked)return <section className="rounded-lg border bg-card p-6"><div className="flex items-center gap-2"><Lock className="h-5 w-5"/><h2 className="text-lg font-bold">3. Schedule your interview</h2></div><p className="mt-2 text-sm text-muted-foreground">Complete the items above to unlock scheduling.</p><ul className="mt-3 text-sm text-destructive">{state.requirements.filter((r)=>!r.done).map((r)=><li key={r.key}>• {r.label}</li>)}</ul></section>;
  const url=new URL(CALENDLY_URL);url.searchParams.set("name",state.candidate.fullName);url.searchParams.set("email",state.candidate.email);return <section className="rounded-lg border border-success/40 bg-card p-6"><div className="flex items-center gap-2 text-success"><CalendarClock className="h-5 w-5"/><h2 className="text-lg font-bold text-foreground">3. Schedule your interview</h2></div>{waiting&&<p className="mt-3 rounded-md bg-secondary p-3 text-sm">Confirming your booking… This page will update when Calendly confirms it.</p>}<div className="calendly-inline-widget mt-4 min-w-[280px]" data-url={url.toString()} style={{height:720}}/><script async src="https://assets.calendly.com/assets/external/widget.js"/><Button asChild variant="outline" className="mt-3"><a href={url.toString()} target="_blank" rel="noreferrer">Open Calendly <ExternalLink className="ml-2 h-4 w-4"/></a></Button></section>;
}