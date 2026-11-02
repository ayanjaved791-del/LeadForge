import type { ComponentType, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function Trend({ value, suffix = "than last month" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-theme-sm text-gray-500 dark:text-gray-400">No prior data to compare</span>;
  const up = value >= 0;
  return (
    <span className="flex items-center gap-1.5 text-theme-sm">
      <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-success-600 dark:text-success-500" : "text-error-600 dark:text-error-500")}>
        {up ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
        {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-gray-500 dark:text-gray-400">{suffix}</span>
    </span>
  );
}

export function StatCard({ title, value, icon: Icon, tone, footer }: { title: string; value: ReactNode; icon: ComponentType<{ className?: string }>; tone: "brand" | "success" | "orange" | "pink" | "purple" | "gray"; footer?: ReactNode }) {
  const tones = {
    brand: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
    orange: "bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400",
    pink: "bg-pink-50 text-theme-pink-500 dark:bg-pink-500/15 dark:text-pink-400",
    purple: "bg-violet-50 text-theme-purple-500 dark:bg-violet-500/15 dark:text-violet-400",
    gray: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  };
  return (
    <div className="lf-card flex h-full flex-col p-5 md:p-6">
      <div className="flex items-start justify-between">
        <h4 className="text-theme-sm text-gray-500 dark:text-gray-400">{title}</h4>
        <span className={cn("flex size-10 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">{value}</div>
      {footer && <div className="mt-auto pt-5">{footer}</div>}
    </div>
  );
}

export function Ring({ value, size = 28, stroke = 4 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-gray-200 dark:text-gray-800" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" strokeLinecap="round" className="text-brand-500" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)} />
    </svg>
  );
}
