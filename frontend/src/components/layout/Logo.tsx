export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-500" />
      <path d="M10.5 9v14M21.5 9v14M10.5 16h11" className="stroke-white dark:stroke-gray-950" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="16" cy="9.5" r="2" className="fill-white dark:fill-gray-950" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="text-[22px] font-semibold tracking-tight text-gray-900 dark:text-white">
          Hello<span className="text-brand-500">HR</span>
        </span>
      )}
    </span>
  );
}
