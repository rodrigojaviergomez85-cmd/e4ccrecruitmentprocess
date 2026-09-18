import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCities, useCountries } from "@/hooks/useLocations";
import { createManualCandidate } from "@/lib/candidate-admin.functions";

export const Route = createFileRoute("/_authenticated/candidates/new")({
  head: () => ({
    meta: [
      { title: "Add Candidate — E4CC" },
      {
        name: "description",
        content: "Add a candidate manually to the E4CC recruitment pipeline.",
      },
      { property: "og:title", content: "Add Candidate — E4CC" },
      { property: "og:description", content: "Manual candidate intake for the E4CC team." },
    ],
  }),
  component: AddCandidate,
});

const OTHER = "other";

function AddCandidate() {
  const navigate = useNavigate();
  const create = useServerFn(createManualCandidate);
  const { data: countries = [] } = useCountries();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [cityId, setCityId] = useState("");
  const [cityOther, setCityOther] = useState("");
  const [phone, setPhone] = useState("");
  const [modality, setModality] = useState<"online" | "onsite">("online");
  const [duplicates, setDuplicates] = useState<
    Array<{ id: string; fullName: string; email: string }>
  >([]);

  const { data: cities = [] } = useCities(countryCode || null);
  const dial = countries.find((c) => c.code === countryCode)?.dial_code ?? "";

  const mutation = useMutation({
    mutationFn: (force: boolean) =>
      create({
        data: {
          fullName,
          email,
          phone: `${dial}${phone.replace(/\D/g, "")}`,
          countryCode,
          cityId: cityId && cityId !== OTHER ? cityId : null,
          cityOther: cityId === OTHER ? cityOther : "",
          modality,
          force,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setDuplicates(result.duplicates ?? []);
        toast.warning("A candidate with the same email or phone already exists.");
        return;
      }
      toast.success("Candidate added.");
      void navigate({ to: "/candidates/$id", params: { id: result.id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = fullName.trim() && email.trim() && countryCode && phone.trim() &&
    (cityId && (cityId !== OTHER || cityOther.trim()));

  return (
    <main className="min-h-screen bg-secondary/30 pb-16">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-2xl items-center px-5 py-4">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All candidates
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-5 py-6">
        <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">Add candidate manually</h1>
            <p className="text-sm text-muted-foreground">
              Use this for candidates who did not apply through the portal. They will be marked as
              added manually and will have no video answers or AI analysis.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Select
                value={countryCode}
                onValueChange={(v) => {
                  setCountryCode(v);
                  setCityId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Select value={cityId} onValueChange={setCityId} disabled={!countryCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select city" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER}>Other city</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {cityId === OTHER && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>City name</Label>
                <Input value={cityOther} onChange={(e) => setCityOther(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <div className="flex items-center gap-2">
                <span className="rounded-2xl border border-border px-3 py-2 text-sm">
                  {dial || "+"}
                </span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="70000000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Modality</Label>
              <Select value={modality} onValueChange={(v) => setModality(v as "online" | "onsite")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="onsite">Onsite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {duplicates.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="font-semibold">A similar candidate already exists:</p>
              <ul className="space-y-1">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link
                      to="/candidates/$id"
                      params={{ id: d.id }}
                      className="underline underline-offset-2"
                    >
                      {d.fullName} — {d.email}
                    </Link>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(true)}
              >
                Add anyway
              </Button>
            </div>
          )}

          <Button
            className="rounded-2xl"
            disabled={!ready || mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            Add candidate
          </Button>
        </section>
      </div>
    </main>
  );
}
