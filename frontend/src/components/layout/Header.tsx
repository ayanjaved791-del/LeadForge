import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Briefcase, ChevronDown, LogOut, Menu, Moon, Search, Settings, Sun, User, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, useMe } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { ago, initials } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSidebar } from "./sidebar-context";
import { LogoMark } from "./Logo";

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const term = q.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === "Escape") ref.current?.blur();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const res = useQuery({
    queryKey: ["search", term],
    queryFn: () => api.get<{ employees: { id: string; name: string; detail: string | null }[]; candidates: { id: string; name: string; detail: string | null }[] }>("/search", { q: term }),
    enabled: term.length >= 2,
  });
  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };

  return (
    <div className="relative hidden lg:block">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
        <Search className="size-5" />
      </span>
      <input
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search employees or candidates..."
        className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 xl:w-[430px] dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30"
      />
      <kbd className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        <span>⌘</span>
        <span>K</span>
      </kbd>
      {open && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark">
          {(res.data?.employees.length ?? 0) + (res.data?.candidates.length ?? 0) === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">{res.isLoading ? "Searching…" : `No results for “${term}”`}</p>
          ) : (
            <>
              {!!res.data?.employees.length && <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-gray-400">Employees</p>}
              {res.data?.employees.map((e) => (
                <button key={e.id} onMouseDown={() => go(`/employees/${e.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5">
                  <UserRound className="size-4 text-gray-400" />
                  <span className="truncate text-gray-800 dark:text-white/90">{e.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-gray-400">{e.detail}</span>
                </button>
              ))}
              {!!res.data?.candidates.length && <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-gray-400">Candidates</p>}
              {res.data?.candidates.map((c) => (
                <button key={c.id} onMouseDown={() => go(`/recruitment/candidates?open=${c.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5">
                  <Briefcase className="size-4 text-gray-400" />
                  <span className="truncate text-gray-800 dark:text-white/90">{c.name}</span>
                  <span className="ml-auto shrink-0 text-xs capitalize text-gray-400">{c.detail}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const navigate = useNavigate();
  const { data, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ unread: number; items: Notification[] }>("/notifications"),
    refetchInterval: 60_000,
  });
  const markAll = async () => {
    await api.post("/notifications/read-all");
    refetch();
  };
  const open = async (n: Notification) => {
    if (!n.read_at) await api.post(`/notifications/${n.id}/read`);
    refetch();
    if (n.link) navigate(n.link);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Notifications">
          {!!data?.unread && (
            <span className="absolute right-0 top-0.5 z-10 flex size-2 rounded-full bg-orange-400">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange-400 opacity-75" />
            </span>
          )}
          <Bell className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={16} className="w-[350px] rounded-2xl border-gray-200 p-3 shadow-theme-lg sm:w-[361px] dark:border-gray-800 dark:bg-gray-dark">
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notification</h5>
          {!!data?.unread && (
            <button onClick={markAll} className="text-xs font-medium text-brand-500 hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <ul className="custom-scrollbar flex max-h-[380px] flex-col overflow-y-auto">
          {!data?.items.length && <li className="px-2 py-6 text-center text-sm text-gray-500">You're all caught up.</li>}
          {data?.items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex w-full gap-3 rounded-lg border-b border-gray-100 px-3 py-3 text-left hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-gray-300 dark:bg-gray-600" : "bg-success-500"}`} />
                <span className="block">
                  <span className="mb-1 block text-theme-sm font-medium text-gray-800 dark:text-white/90">{n.title}</span>
                  {n.body && <span className="block text-theme-sm text-gray-500 dark:text-gray-400">{n.body}</span>}
                  <span className="mt-1 block text-theme-xs text-gray-400">{ago(n.created_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Link to="/notifications" className="mt-3 flex justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700">
          View All Notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const first = me.user.name.split(" ")[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center text-gray-700 outline-none dark:text-gray-400">
          <span className="mr-3 flex size-11 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-sm font-semibold text-white">
            {initials(me.user.name)}
          </span>
          <span className="mr-1 hidden text-theme-sm font-medium sm:block">{first}</span>
          <ChevronDown className="size-4.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={16} className="w-[260px] rounded-2xl border-gray-200 p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark">
        <div className="px-1 pb-3">
          <span className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{me.user.name}</span>
          <span className="mt-0.5 block truncate text-theme-xs text-gray-500 dark:text-gray-400">{me.user.email}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-3 rounded-lg px-3 py-2 text-theme-sm text-gray-700 dark:text-gray-400">
          <User className="size-5" /> Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings?tab=company")} className="gap-3 rounded-lg px-3 py-2 text-theme-sm text-gray-700 dark:text-gray-400">
          <Settings className="size-5" /> Company settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="gap-3 rounded-lg px-3 py-2 text-theme-sm text-gray-700 dark:text-gray-400"
        >
          <LogOut className="size-5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const { toggle, toggleMobile, mobileOpen, isMobile } = useSidebar();
  const { dark, toggle: toggleTheme } = useTheme();
  return (
    <header className="sticky top-0 z-40 flex w-full print:hidden border-b border-gray-200/80 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75 dark:border-gray-800 dark:bg-gray-900/85">
      <div className="flex grow items-center justify-between gap-4 px-3 py-3 lg:px-6 lg:py-4">
        <div className="flex items-center gap-3 lg:gap-4">
          <button
            onClick={() => (isMobile ? toggleMobile() : toggle())}
            className="flex size-10 items-center justify-center rounded-lg border-gray-200 text-gray-500 lg:size-11 lg:border dark:border-gray-800 dark:text-gray-400"
            aria-label="Toggle sidebar"
          >
            {mobileOpen ? <X className="size-6" /> : <Menu className="size-5" />}
          </button>
          <Link to="/" className="lg:hidden">
            <LogoMark />
          </Link>
          <GlobalSearch />
        </div>
        <div className="flex items-center gap-3 2xsm:gap-4">
          <button
            onClick={toggleTheme}
            className="flex size-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <Notifications />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
