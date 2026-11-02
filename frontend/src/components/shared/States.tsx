import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { LogoMark } from "@/components/layout/Logo";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-10 animate-pulse" />
        <Loader2 className="size-5 animate-spin text-gray-400" />
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…", className = "py-16" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "py-14",
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 text-center ${className}`}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/5 dark:text-gray-400">
        <Icon className="size-6" />
      </div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Couldn't load this data"
      description={errorMessage(error)}
      action={onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    />
  );
}
