import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarState {
  expanded: boolean;
  mobileOpen: boolean;
  hovered: boolean;
  isMobile: boolean;
  toggle: () => void;
  toggleMobile: () => void;
  closeMobile: () => void;
  setHovered: (v: boolean) => void;
}
const Ctx = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);

  useEffect(() => {
    const onResize = () => {
      const m = window.innerWidth < 1024;
      setIsMobile(m);
      if (!m) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Ctx.Provider
      value={{
        expanded: isMobile ? false : expanded,
        mobileOpen,
        hovered,
        isMobile,
        toggle: () => setExpanded((v) => !v),
        toggleMobile: () => setMobileOpen((v) => !v),
        closeMobile: () => setMobileOpen(false),
        setHovered,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useSidebar = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSidebar outside provider");
  return c;
};
