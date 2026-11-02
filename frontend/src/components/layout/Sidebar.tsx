import { useEffect, useState, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Ellipsis,
  FileSearch,
  LayoutGrid,
  Mail,
  Settings,
  UsersRound,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";
import { Logo } from "./Logo";

type SubItem = { name: string; path: string; badge?: "new" };
type NavItem = { name: string; icon: ComponentType<{ className?: string }>; path?: string; badge?: "new"; sub?: SubItem[] };

const MAIN: NavItem[] = [
  {
    name: "Dashboard",
    icon: LayoutGrid,
    sub: [
      { name: "Overview", path: "/" },
      { name: "Analytics", path: "/analytics" },
    ],
  },
  {
    name: "Discovery",
    icon: Compass,
    badge: "new",
    sub: [
      { name: "Search Businesses", path: "/discover" },
      { name: "Map Explorer", path: "/map", badge: "new" },
      { name: "Saved Searches", path: "/saved-searches" },
    ],
  },
  {
    name: "Leads",
    icon: UsersRound,
    sub: [
      { name: "All Leads", path: "/leads" },
      { name: "Pipeline", path: "/pipeline" },
    ],
  },
  {
    name: "CRM",
    icon: Workflow,
    sub: [
      { name: "Contacts", path: "/contacts" },
      { name: "Activities", path: "/activities" },
      { name: "Follow-ups", path: "/follow-ups" },
    ],
  },
  { name: "Tasks", icon: ClipboardCheck, path: "/tasks" },
  { name: "Calendar", icon: CalendarDays, path: "/calendar" },
  { name: "Website Audit", icon: FileSearch, path: "/audit", badge: "new" },
  { name: "Email Templates", icon: Mail, path: "/templates" },
];
const OTHERS: NavItem[] = [
  { name: "Reports", icon: BarChart3, path: "/analytics" },
  { name: "Notifications", icon: Bell, path: "/notifications" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

function isActive(pathname: string, path: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(path + "/");
}

export function Sidebar() {
  const { expanded, mobileOpen, hovered, setHovered, closeMobile, isMobile } = useSidebar();
  const { pathname } = useLocation();
  const wide = expanded || hovered || mobileOpen;
  const [open, setOpen] = useState<string | null>(null);

  // Open the group containing the active route.
  useEffect(() => {
    const group = MAIN.find((i) => i.sub?.some((s) => isActive(pathname, s.path)));
    if (group) setOpen(group.name);
    if (isMobile) closeMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const renderItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        if (item.sub) {
          const groupActive = item.sub.some((s) => isActive(pathname, s.path));
          const isOpen = open === item.name;
          return (
            <li key={item.name}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.name)}
                className={cn("menu-item group", groupActive ? "menu-item-active" : "menu-item-inactive", !wide && "lg:justify-center")}
              >
                <Icon className={cn("size-6 shrink-0", groupActive ? "menu-item-icon-active" : "menu-item-icon-inactive")} />
                {wide && <span className="flex-1 text-left">{item.name}</span>}
                {wide && item.badge && <span className="menu-badge menu-badge-new">new</span>}
                {wide && (
                  <ChevronDown className={cn("size-5 transition-transform duration-200", isOpen && "rotate-180 text-brand-500")} />
                )}
              </button>
              <div
                className={cn("grid transition-all duration-300 ease-in-out", isOpen && wide ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
              >
                <ul className="ml-9 mt-1 flex flex-col gap-1 overflow-hidden">
                  {item.sub.map((s) => (
                    <li key={s.path}>
                      <Link
                        to={s.path}
                        className={cn("menu-dropdown-item", isActive(pathname, s.path) ? "menu-dropdown-item-active" : "menu-dropdown-item-inactive")}
                      >
                        <span className="flex-1">{s.name}</span>
                        {s.badge && <span className="menu-badge menu-badge-new">new</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        }
        const active = isActive(pathname, item.path!);
        return (
          <li key={item.name}>
            <Link
              to={item.path!}
              className={cn("menu-item group", active ? "menu-item-active" : "menu-item-inactive", !wide && "lg:justify-center")}
            >
              <Icon className={cn("size-6 shrink-0", active ? "menu-item-icon-active" : "menu-item-icon-inactive")} />
              {wide && <span className="flex-1">{item.name}</span>}
              {wide && item.badge && <span className="menu-badge menu-badge-new">new</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900",
        wide ? "w-[290px]" : "w-[90px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
      onMouseEnter={() => !expanded && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn("flex py-8", wide ? "justify-start" : "lg:justify-center")}>
        <Link to="/">
          <Logo compact={!wide} />
        </Link>
      </div>
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto pb-8">
        <nav className="flex flex-col gap-6">
          <div>
            <h2 className={cn("mb-4 flex text-xs uppercase leading-5 text-gray-400", wide ? "justify-start" : "lg:justify-center")}>
              {wide ? "Menu" : <Ellipsis className="size-6" />}
            </h2>
            {renderItems(MAIN)}
          </div>
          <div>
            <h2 className={cn("mb-4 flex text-xs uppercase leading-5 text-gray-400", wide ? "justify-start" : "lg:justify-center")}>
              {wide ? "Others" : <Ellipsis className="size-6" />}
            </h2>
            {renderItems(OTHERS)}
          </div>
        </nav>
      </div>
    </aside>
  );
}
