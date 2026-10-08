import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateCandidateInfo } from "@/lib/recruiter.functions";
import { EXPERIENCE_OPTIONS } from "@/lib/recruitment";

const CHOICES: string[] = [...EXPERIENCE_OPTIONS];

type App = {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  teaching_experience: string;
  callcenter_experience_level?: string | null;
  taught_children: boolean;
};

export function EditCandidateInfo({ id, app }: { id: string; app: App }) {
  const qc = useQueryClient();
  const save = useServerFn(updateCandidateInfo);
  const [open, setOpen] = useState(false);
  const initial = () => ({
    full_name: app.full_name ?? "",
    email: app.email ?? "",
    phone: app.phone ?? "",
    city: app.city ?? "",
    teaching_experience: app.teaching_experience || "No experience",
    callcenter_experience_level: app.callcenter_experience_level || "No experience",
    taught_children: Boolean(app.taught_children),
  });
  const [f, setF] = useState(initial);
  const m = useMutation({
    mutationFn: () => save({ data: { id, ...f } }),
    onSuccess: () => {
      toast.success("Candidate info updated");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["candidate", id] });
      void qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (!open)
    return (
      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setF(initial()); setOpen(true); }}>
        Edit candidate info
      </Button>
    );

  const text = (k: "full_name" | "email" | "phone" | "city", label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  const pick = (k: "teaching_experience" | "callcenter_experience_level", label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {(CHOICES.includes(f[k]) ? CHOICES : [f[k], ...CHOICES]).map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-2">
      {text("full_name", "Full name")}
      {text("email", "Email")}
      {text("phone", "Phone")}
      {text("city", "City")}
      {pick("teaching_experience", "Teaching / training experience")}
      {pick("callcenter_experience_level", "Call center experience")}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.taught_children} onChange={(e) => setF({ ...f, taught_children: e.target.checked })} />
        Has taught children
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
