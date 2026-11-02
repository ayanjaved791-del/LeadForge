import { cn } from "@/lib/utils";

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-theme-xs font-medium", className)}>{children}</span>;
}

/** Renders a status pill from a { key: { label, color } } map. */
export function StatusPill<K extends string>({ map, value }: { map: Record<K, { label: string; color: string }>; value: K }) {
  const m = map[value];
  return <Pill className={m?.color}>{m?.label ?? value}</Pill>;
}

export function Stars({ value, onChange, size = "size-5" }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={!onChange} onClick={() => onChange?.(i === value ? 0 : i)} className={cn("disabled:cursor-default", !onChange && "pointer-events-none")} aria-label={`${i} star${i > 1 ? "s" : ""}`}>
          <svg viewBox="0 0 20 20" className={cn(size, i <= value ? "fill-warning-500 dark:fill-gray-100" : "fill-gray-200 dark:fill-gray-700")}>
            <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" />
          </svg>
        </button>
      ))}
    </span>
  );
}
