import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  addCity,
  listAllCountries,
  listStaffCountryAccess,
  setCityActive,
  setCountryActive,
  setStaffCountries,
  upsertCountry,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Admin Settings — E4CC" },
      {
        name: "description",
        content: "Manage allowed countries, cities and recruiter country access for E4CC hiring.",
      },
      { property: "og:title", content: "Admin Settings — E4CC" },
      {
        property: "og:description",
        content: "Manage allowed countries, cities and recruiter country access.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const loadCountries = useServerFn(listAllCountries);
  const loadStaff = useServerFn(listStaffCountryAccess);
  const saveCountry = useServerFn(upsertCountry);
  const toggleCountry = useServerFn(setCountryActive);
  const createCity = useServerFn(addCity);
  const toggleCity = useServerFn(setCityActive);
  const saveStaffCountries = useServerFn(setStaffCountries);

  const countriesQuery = useQuery({ queryKey: ["admin-countries"], queryFn: () => loadCountries() });
  const staffQuery = useQuery({ queryKey: ["admin-staff-countries"], queryFn: () => loadStaff() });

  const [newCountry, setNewCountry] = useState({ code: "", name: "", dial_code: "", flag: "" });
  const [newCity, setNewCity] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-countries"] });
    void queryClient.invalidateQueries({ queryKey: ["countries"] });
    void queryClient.invalidateQueries({ queryKey: ["cities"] });
  };

  const addCountryMutation = useMutation({
    mutationFn: () =>
      saveCountry({
        data: {
          code: newCountry.code,
          name: newCountry.name,
          dial_code: newCountry.dial_code,
          flag: newCountry.flag,
          timezone: "America/El_Salvador",
          active: true,
          sort_order: 500,
        },
      }),
    onSuccess: () => {
      setNewCountry({ code: "", name: "", dial_code: "", flag: "" });
      invalidate();
      toast.success("Country saved");
    },
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not save country"),
  });

  const isError = countriesQuery.error ?? staffQuery.error;

  return (
    <main className="min-h-screen bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div>
            <BrandMark className="h-8" />
            <p className="text-xs text-muted-foreground">Admin settings</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-5 py-6">
        {isError && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {isError instanceof Error ? isError.message : "Could not load settings."}
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h1 className="text-lg font-semibold">Allowed countries &amp; cities</h1>
            <p className="text-sm text-muted-foreground">
              Only active countries appear in the applicant form.
            </p>
          </div>

          {countriesQuery.isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

          <div className="space-y-2">
            {countriesQuery.data?.countries.map((country) => {
              const cities = countriesQuery.data.cities.filter(
                (city) => city.country_code === country.code,
              );
              const open = expanded === country.code;
              return (
                <div key={country.code} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="text-left text-sm font-medium"
                      onClick={() => setExpanded(open ? null : country.code)}
                    >
                      {country.flag} {country.name}{" "}
                      <span className="text-muted-foreground">
                        · {country.code} · {country.dial_code} · {cities.length} cities
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Active</Label>
                      <Switch
                        checked={country.active}
                        onCheckedChange={(checked) => {
                          void toggleCountry({ data: { code: country.code, active: checked } })
                            .then(invalidate)
                            .catch((e: unknown) =>
                              toast.error(e instanceof Error ? e.message : "Update failed"),
                            );
                        }}
                      />
                    </div>
                  </div>

                  {open && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      {cities.map((city) => (
                        <div key={city.id} className="flex items-center justify-between text-sm">
                          <span className={city.active ? "" : "text-muted-foreground line-through"}>
                            {city.name}
                          </span>
                          <Switch
                            checked={city.active}
                            onCheckedChange={(checked) => {
                              void toggleCity({ data: { id: city.id, active: checked } })
                                .then(invalidate)
                                .catch((e: unknown) =>
                                  toast.error(e instanceof Error ? e.message : "Update failed"),
                                );
                            }}
                          />
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <Input
                          placeholder="Add a city"
                          value={newCity[country.code] ?? ""}
                          onChange={(e) =>
                            setNewCity({ ...newCity, [country.code]: e.target.value })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const name = (newCity[country.code] ?? "").trim();
                            if (name.length < 2) return;
                            void createCity({ data: { country_code: country.code, name } })
                              .then(() => {
                                setNewCity({ ...newCity, [country.code]: "" });
                                invalidate();
                              })
                              .catch((e: unknown) =>
                                toast.error(e instanceof Error ? e.message : "Could not add city"),
                              );
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-2 rounded-xl border border-dashed border-border p-3 sm:grid-cols-5">
            <Input
              placeholder="Code (PE)"
              value={newCountry.code}
              onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })}
            />
            <Input
              placeholder="Name"
              value={newCountry.name}
              onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
            />
            <Input
              placeholder="+51"
              value={newCountry.dial_code}
              onChange={(e) => setNewCountry({ ...newCountry, dial_code: e.target.value })}
            />
            <Input
              placeholder="Flag emoji"
              value={newCountry.flag}
              onChange={(e) => setNewCountry({ ...newCountry, flag: e.target.value })}
            />
            <Button
              type="button"
              onClick={() => addCountryMutation.mutate()}
              disabled={addCountryMutation.isPending}
            >
              {addCountryMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Add country
            </Button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h2 className="text-lg font-semibold">Recruiter country access</h2>
            <p className="text-sm text-muted-foreground">
              Recruiters only see candidates from their assigned countries. Leave all unchecked to
              allow every country. Admins always see everything.
            </p>
          </div>

          {staffQuery.isLoading && <Skeleton className="h-24 w-full rounded-xl" />}

          {staffQuery.data?.map((member) => (
            <div key={member.user_id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">{member.email || member.user_id}</p>
              <p className="text-xs text-muted-foreground">{member.roles.join(", ")}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {countriesQuery.data?.countries.map((country) => {
                  const checked = member.countries.includes(country.code);
                  return (
                    <label
                      key={country.code}
                      className="flex items-center gap-2 text-sm"
                      htmlFor={`${member.user_id}-${country.code}`}
                    >
                      <Checkbox
                        id={`${member.user_id}-${country.code}`}
                        checked={checked}
                        onCheckedChange={(value) => {
                          const next = value
                            ? [...member.countries, country.code]
                            : member.countries.filter((c) => c !== country.code);
                          void saveStaffCountries({
                            data: { user_id: member.user_id, country_codes: next },
                          })
                            .then(() =>
                              queryClient.invalidateQueries({
                                queryKey: ["admin-staff-countries"],
                              }),
                            )
                            .catch((e: unknown) =>
                              toast.error(e instanceof Error ? e.message : "Update failed"),
                            );
                        }}
                      />
                      {country.flag} {country.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
