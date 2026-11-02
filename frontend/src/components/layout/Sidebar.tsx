import { useEffect, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarOff,
  ClipboardCheck,
  Clock,
  LayoutGrid,
  Settings,
  Sparkles,
  Target,
  UsersRound,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "./sidebar-context";
import { Logo } from "./Logo";

type Count = { value: number; tone: "gray" | "brand" | "red" };
type NavItem = { name: string; path: string; icon: ComponentType<{ className?: string }>; isNew?: boolean; count?: (c: Counts) => Count | null };
type Counts = { employees: number; pendingLeave: number; unmarked: number; candidates: number; unread: number };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { name: "Dashboard", path: "/", icon: LayoutGrid },
      { name: "Analytics", path: "/analytics", icon: BarChart3 },
    ],
  },
  {
    title: "People",
    items: [
      { name: "Employees", path: "/employees", icon: UsersRound, count: (c) => (c.employees ? { value: c.employees, tone: "gray" } : null) },
      { name: "Departments", path: "/departments", icon: Building2 },
    ],
  },
  {
    title: "Time",
    items: [
      { name: "Attendance", path: "/attendance", icon: Clock, count: (c) => (c.unmarked ? { value: c.unmarked, tone: "brand" } : null) },
      { name: "Leave", path: "/leave", icon: CalendarOff, count: (c) => (c.pendingLeave ? { value: c.pendingLeave, tone: "red" } : null) },
      { name: "Holidays", path: "/holidays", icon: Sparkles },
      { name: "Calendar", path: "/calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Payroll",
    items: [{ name: "Payroll", path: "/payroll", icon: Wallet }],
  },
  {
    title: "Talent",
    items: [
      { name: "Job Openings", path: "/recruitment/jobs", icon: Briefcase },
      { name: "Candidates", path: "/recruitment/candidates", icon: ClipboardCheck, count: (c) => (c.candidates ? { value: c.candidates, tone: "brand" } : null), isNew: true },
      { name: "Performance", path: "/performance", icon: Target },
    ],
  },
  {
    title: "Account",
    items: [
      { name: "Notifications", path: "/notifications", icon: Bell, count: (c) => (c.unread ? { value: c.unread, tone: "red" } : null) },
      { name: "Settings", path: "/settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

/** Live counts shown next to menu items. Query keys sit under existing prefixes so mutations refresh them. */
function useCounts(): Counts {
  const dash = useQuery({ queryKey: ["dashboard", "nav"], queryFn: () => api.get<{ kpi: Record<string, number> }>("/dashboard") });
  const notes = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ unread: number }>("/notifications") });
  const k = dash.data?.kpi;
  return { employees: k?.headcount ?? 0, pendingLeave: k?.pending_leave ?? 0, unmarked: k?.not_marked_today ?? 0, candidates: k?.candidates_active ?? 0, unread: notes.data?.unread ?? 0 };
}

const COUNT_TONE = {
  gray: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  red: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
};

export function Sidebar() {
  const { expanded, mobileOpen, hovered, setHovered, closeMobile, isMobile } = useSidebar();
  const { pathname } = useLocation();
  const me = useMe();
  const counts = useCounts();
  const wide = expanded || hovered || mobileOpen;

  useEffect(() => {
    if (isMobile) closeMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col print:hidden border-r border-gray-200 bg-white text-gray-900 transition-[width,transform] duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900",
        wide ? "w-[290px]" : "w-[90px]",
        mobileOpen ? "translate-x-0 shadow-theme-lg" : "-translate-x-full lg:translate-x-0",
      )}
      onMouseEnter={() => !expanded && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn("flex h-[72px] shrink-0 items-center px-6", !wide && "lg:justify-center lg:px-0")}>
        <Link to="/" className="flex flex-col">
          <Logo compact={!wide} />
        </Link>
      </div>

      <TooltipProvider delayDuration={0}>
        <nav className="custom-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-1" aria-label="Main">
          {SECTIONS.map((section, si) => (
            <div key={section.title} className={cn(si > 0 && "mt-4")}>
              {wide ? (
                <h2 className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500">{section.title}</h2>
              ) : (
                si > 0 && <div className="mx-auto mb-3 h-px w-8 bg-gray-200 dark:bg-gray-800" />
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.path);
                  const Icon = item.icon;
                  const count = item.count?.(counts) ?? null;
                  const link = (
                    <Link
                      to={item.path}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-2.5 py-1.5 text-theme-sm font-medium transition-all duration-200",
                        active
                          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-200",
                        !wide && "lg:justify-center lg:px-0",
                      )}
                    >
                      {active && <span className="absolute -left-4 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-500" />}
                      <span
                        className={cn(
                          "relative flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                          active ? "bg-white text-brand-500 shadow-theme-xs dark:bg-brand-500/20 dark:text-brand-300" : "text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200",
                        )}
                      >
                        <Icon className="size-[18px]" />
                        {!wide && count && <span className={cn("absolute -right-1 -top-1 size-2 rounded-full ring-2 ring-white dark:ring-gray-900", count.tone === "red" ? "bg-error-500" : "bg-brand-500")} />}
                      </span>
                      {wide && <span className="flex-1 truncate">{item.name}</span>}
                      {wide && count && <span className={cn("min-w-6 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums", COUNT_TONE[count.tone])}>{count.value > 99 ? "99+" : count.value}</span>}
                      {wide && !count && item.isNew && <span className="menu-badge menu-badge-new">new</span>}
                    </Link>
                  );
                  return (
                    <li key={item.path}>
                      {wide ? (
                        link
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right" className="bg-gray-900 text-xs text-white">
                            {item.name}
                            {count ? ` · ${count.value}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </TooltipProvider>

      <div className={cn("shrink-0 border-t border-gray-100 p-4 dark:border-gray-800", !wide && "lg:px-3")}>
        <Link
          to="/settings?tab=company"
          className={cn("flex items-center gap-3 rounded-xl bg-gray-50 p-2.5 transition-colors hover:bg-gray-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]", !wide && "lg:justify-center lg:bg-transparent lg:p-1")}
          title={me.workspace.name}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-500 to-brand-700 text-xs font-semibold text-white">
            {initials(me.workspace.name)}
          </span>
          {wide && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-theme-sm font-semibold text-gray-800 dark:text-white/90">{me.workspace.name}</span>
              <span className="block truncate text-theme-xs capitalize text-gray-500 dark:text-gray-400">Company · {me.workspace.role}</span>
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}
