import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
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
  to: "/dashboard" | "/second-filter" | "/evaluations" | "/scorecard" | "/training" | "/settings" | "/staff";
  icon: typeof ClipboardList;
  active: (pathname: string) => boolean;
  show: (access: StaffNavigationAccess) => boolean;
};

const fullStaff = (access: StaffNavigationAccess) => !access.isTrainerOnly;
const canEvaluate = (access: StaffNavigationAccess) => access.isAdmin || access.isRecruitment;

const ITEMS: NavItem[] = [
  {
    label: "Applicants",
    to: "/dashboard",
    icon: ClipboardList,
    active: (path) => path === "/dashboard" || path.startsWith("/candidates/"),
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
    label: "Interviews",
    to: "/evaluations",
    icon: ClipboardCheck,
    active: (path) => path.startsWith("/evaluations") || path === "/interviews",
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

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem("e4cc-nav-collapsed") === "1");
  }, []);
  function toggle() {
    setCollapsed((v) => {
      window.localStorage.setItem("e4cc-nav-collapsed", v ? "0" : "1");
      return !v;
    });
  }
  const home = access.isTrainerOnly ? "/training" : "/dashboard";

  return (
    <>
      {/* Desktop: collapsible sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card lg:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-border", collapsed ? "justify-center px-2" : "px-4")}>
          <Link to={home} aria-label="E4CC internal home">
            {collapsed ? <span className="font-display text-sm font-bold text-navy">E4CC</span> : <BrandMark className="h-8" />}
          </Link>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Internal recruitment navigation">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.active(pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-navy/80 transition-colors hover:bg-secondary hover:text-navy",
                  isActive && "bg-navy text-navy-foreground hover:bg-navy hover:text-navy-foreground",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-0.5 border-t border-border p-2">
          <button
            type="button"
            onClick={() => void signOut()}
            title={collapsed ? "Sign out" : undefined}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-navy", collapsed && "justify-center px-0")}
          >
            <LogOut className="h-4 w-4" /> {!collapsed && "Sign out"}
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-navy", collapsed && "justify-center px-0")}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Mobile / tablet: top bar with menu */}
      <header className="sticky top-0 z-50 border-b border-border bg-card lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
          <Link to={home} aria-label="E4CC internal home">
            <BrandMark className="h-7" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open navigation menu">
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
    </>
  );
}
