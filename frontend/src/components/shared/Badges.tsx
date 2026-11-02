import { Info } from "lucide-react";
import { BANDS, bandFor, priorityMeta, statusMeta, WEBSITE_STATUS } from "@/lib/constants";
import type { LeadStatus, Priority, ScoreItem, WebsiteStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-theme-xs font-medium", className)}>{children}</span>;
}

export const StatusBadge = ({ status }: { status: LeadStatus }) => {
  const m = statusMeta(status);
  return <Pill className={m.color}>{m.label}</Pill>;
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const m = priorityMeta(priority);
  return <Pill className={m.color}>{m.label}</Pill>;
};

export function WebsiteBadge({ status, note }: { status: WebsiteStatus; note?: string | null }) {
  const m = WEBSITE_STATUS[status];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Pill className={m.color}>
              {m.label}
              <Info className="size-3 opacity-60" />
            </Pill>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs bg-gray-900 text-xs text-white">{note || m.hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ScoreBadge({ score, showLabel = false }: { score: number; showLabel?: boolean }) {
  const band = BANDS[bandFor(score)];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-theme-xs font-semibold", band.color)}>{score}</span>
      {showLabel && <span className="text-theme-xs text-gray-500 dark:text-gray-400">{band.label}</span>}
    </span>
  );
}

export function ScoreBreakdown({ score, items }: { score: number; items: ScoreItem[] }) {
  const band = BANDS[bandFor(score)];
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <span className="text-3xl font-semibold text-gray-800 dark:text-white/90">{score}</span>
          <span className="text-sm text-gray-400"> / 100</span>
        </div>
        <Pill className={band.color}>{band.label}</Pill>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
        <div className={cn("h-full rounded-full transition-all", band.bar)} style={{ width: `${score}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {items.length === 0 && <li className="text-sm text-gray-500">No opportunity signals found — the business looks well covered online.</li>}
        {items.map((i) => (
          <li key={i.rule} className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-300">{i.label}</span>
            <span className="font-medium text-success-600 dark:text-success-500">+{i.points}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-gray-400">
        The score is a transparent, rule-based estimate of how much a business could benefit from web services. It is not a probability of winning the deal.
      </p>
    </div>
  );
}
