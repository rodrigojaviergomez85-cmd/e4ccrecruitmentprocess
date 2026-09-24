import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getStaffContext } from "@/lib/staff.functions";

/**
 * Route guard for every staff surface. Hiding links is not enough: this checks the
 * server for an active staff account and forces a password change when required.
 * A network failure is NOT treated as "not authorized" — signing out on a transient
 * error kicked authorized staff back to /auth.
 */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const fetchContext = useServerFn(getStaffContext);
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["staff-context"],
    queryFn: () => fetchContext(),
    staleTime: 60_000,
    retry: 2,
    retryDelay: 800,
  });

  useEffect(() => {
    if (isPending || isError || !data) return;
    if (!data.isStaff) {
      void (async () => {
        await supabase.auth.signOut();
        toast.error("This account is not authorized for E4CC staff access.");
        void navigate({ to: "/auth", replace: true });
      })();
      return;
    }
    if (data.mustChangePassword) {
      void navigate({ to: "/change-password", replace: true });
    }
  }, [data, isError, isPending, navigate]);

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          We couldn't verify your access right now. Check your connection and try again.
        </p>
        <Button onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  }

  if (isPending || !data?.isStaff || data.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const noCountries = !data.isAdmin && (data.countries?.length ?? 0) === 0;
  return (
    <>
      {noCountries && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-center text-sm font-medium text-destructive">
          Your account has no countries assigned, so no candidates can be shown. Ask an Admin to assign them in Staff.
        </div>
      )}
      {children}
    </>
  );
}

