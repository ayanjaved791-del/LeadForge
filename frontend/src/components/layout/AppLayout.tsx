import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { FullPageLoader } from "@/components/shared/States";
import { VerifyBanner } from "@/components/shared/VerifyBanner";

function Shell() {
  const { expanded, hovered, mobileOpen, closeMobile } = useSidebar();
  return (
    <div className="min-h-screen xl:flex">
      <Sidebar />
      {mobileOpen && <div className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" onClick={closeMobile} />}
      <div className={cn("flex-1 transition-all duration-300 ease-in-out", expanded || hovered ? "lg:ml-[290px]" : "lg:ml-[90px]")}>
        <Header />
        <main className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
          <VerifyBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageLoader />;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!me.user.onboarded_at && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;
  return (
    <SidebarProvider>
      <Shell />
    </SidebarProvider>
  );
}
