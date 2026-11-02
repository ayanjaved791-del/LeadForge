import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { LogoMark } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const { dark, toggle } = useTheme();
  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      <div className="relative flex h-screen w-full flex-col justify-center sm:p-0 lg:flex-row dark:bg-gray-900">
        <div className="flex w-full flex-1 flex-col lg:w-1/2">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
              <LogoMark />
              <span className="text-xl font-semibold text-gray-900 dark:text-white">LeadForge</span>
            </Link>
            <div className="mb-5 sm:mb-8">
              <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">{title}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
            {children}
            {footer && <div className="mt-5 text-center text-sm font-normal text-gray-700 sm:text-start dark:text-gray-400">{footer}</div>}
          </div>
        </div>
        <div className="relative hidden h-full w-full items-center bg-brand-950 lg:grid lg:w-1/2 dark:bg-white/5">
          <div className="relative z-1 flex items-center justify-center">
            {/* grid pattern */}
            <svg className="absolute right-0 top-0 -z-1 w-full max-w-[250px] xl:max-w-[450px]" viewBox="0 0 450 254" fill="none" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, r) =>
                Array.from({ length: 10 }).map((_, c) => <rect key={`${r}-${c}`} x={c * 45 + 0.5} y={r * 45 + 0.5} width="44" height="44" stroke="#fff" strokeOpacity="0.06" />),
              )}
            </svg>
            <svg className="absolute bottom-0 left-0 -z-1 w-full max-w-[250px] rotate-180 xl:max-w-[450px]" viewBox="0 0 450 254" fill="none" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, r) =>
                Array.from({ length: 10 }).map((_, c) => <rect key={`${r}-${c}`} x={c * 45 + 0.5} y={r * 45 + 0.5} width="44" height="44" stroke="#fff" strokeOpacity="0.06" />),
              )}
            </svg>
            <div className="flex max-w-xs flex-col items-center">
              <div className="mb-4 flex items-center gap-3">
                <LogoMark className="size-11" />
                <span className="text-3xl font-semibold text-white">LeadForge</span>
              </div>
              <p className="text-center text-gray-400 dark:text-white/60">
                Discover local businesses on OpenStreetMap, spot the ones that need a better web presence, and manage every deal in one CRM.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          className="fixed bottom-6 right-6 z-50 hidden size-14 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600 sm:inline-flex"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </div>
    </div>
  );
}
