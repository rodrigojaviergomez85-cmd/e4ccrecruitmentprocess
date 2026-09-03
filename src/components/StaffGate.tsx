import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getStaffContext } from "@/lib/staff.functions";

/**
 * Route guard for every staff surface. Hiding links is not enough: this checks the
 * server for an active staff account and forces a password change when required.
 */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const fetchContext = useServerFn(getStaffContext);
  const { data, isPending, isError } = useQuery({
    queryKey: ["staff-context"],
    queryFn: () => fetchContext(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (isPending) return;
    if (isError || !data?.isStaff) {
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

  if (isPending || !data?.isStaff || data.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
