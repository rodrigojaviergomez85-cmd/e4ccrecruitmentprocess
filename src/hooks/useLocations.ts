import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { City, Country } from "@/lib/locations";

export function useCountries() {
  return useQuery({
    queryKey: ["countries"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Country[]> => {
      const { data, error } = await supabase
        .from("countries")
        .select("code, name, dial_code, flag, timezone, active, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as Country[];
    },
  });
}

export function useCities(countryCode: string | null) {
  return useQuery({
    queryKey: ["cities", countryCode],
    enabled: Boolean(countryCode),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<City[]> => {
      const { data, error } = await supabase
        .from("cities")
        .select("id, country_code, name, active, sort_order")
        .eq("country_code", countryCode!)
        .eq("active", true)
        .order("sort_order")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as City[];
    },
  });
}
