import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";

import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type StaffNavigationAccess = {
  isAdmin: boolean;
  isRecruitment: boolean;
  isTrainerOnly: boolean;
};

type NavItem = {
  label: string;
  to: "/dashboard" | "/candidates/new" | "/second-filter" | "/evaluations" | "/scorecard" | "/training" | "/settings" | "/staff";
  icon: typeof ClipboardList;
  active: (pathname: string) => boolean;
  show: (access: StaffNavigationAccess) => boolean;
};

const fullStaff = (access: StaffNavigationAccess) => !access.isTrainerOnly;
const canEvaluate = (access: StaffNavigationAccess) => access.isAdmin || access.isRecruitment;

const ITEMS: NavItem[] = [
  {
    label: "Candidates",
    to: "/dashboard",
    icon: ClipboardList,
    active: (path) => path === "/dashboard" || (path.startsWith("/candidates/") && path !== "/candidates/new"),
    show: fullStaff,
  },
  {
    label: "Add candidate",
    to: "/candidates/new",
    icon: Plus,
    active: (path) => path === "/candidates/new",
    show: fullStaff,
  },
  {
    label: "Pending Second Filter",
    to: "/second-filter",
    icon: UserRoundSearch,
    active: (path) => path.startsWith("/second-filter"),
    show: fullStaff,
  },
  {
    label: "E4CC Interviews",
    to: "/evaluations",
    icon: ClipboardCheck,
    active: (path) => path.startsWith("/evaluations"),
    show: canEvaluate,
  },
  {
    label: "Scorecard",
    to: "/scorecard",
    icon: BarChart3,
    active: (path) => path === "/scorecard",
    show: canEvaluate,
  },
  {
    label: "Training Tracker",
    to: "/training",
    icon: UsersRound,
    active: (path) => path === "/training",
    show: () => true,
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
    active: (path) => path === "/settings",
    show: (access) => access.isAdmin,
  },
  {
    label: "Staff",
    to: "/staff",
    icon: ShieldCheck,
    active: (path) => path === "/staff",
    show: (access) => access.isAdmin,
  },
];

export function InternalNavigation({ access }: { access: StaffNavigationAccess }) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const items = ITEMS.filter((item) => item.show(access));

  async function signOut() {
    await supabase.auth.signOut();
    await navigate({ to: "/auth" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <Link to={access.isTrainerOnly ? "/training" : "/dashboard"} aria-label="E4CC internal home">
          <BrandMark className="h-8" />
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Internal recruitment navigation">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.active(pathname);
            return (
              <Button
                key={item.to}
                asChild
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(isActive && "text-foreground")}
              >
                <Link to={item.to} aria-current={isActive ? "page" : undefined}>
                  <Icon className="mr-1.5 h-4 w-4" /> {item.label}
                </Link>
              </Button>
            );
          })}
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="xl:hidden" aria-label="Open navigation menu">
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = item.active(pathname);
              return (
                <DropdownMenuItem key={item.to} asChild className={cn(isActive && "bg-accent font-medium")}>
                  <Link to={item.to} aria-current={isActive ? "page" : undefined}>
                    <Icon /> {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}