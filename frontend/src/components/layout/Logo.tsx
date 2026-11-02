export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand-500" />
      <path d="M10 8v16h12" className="stroke-white dark:stroke-gray-950" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 13h7M15 18.5h5" className="stroke-white dark:stroke-gray-950" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && <span className="text-[22px] font-semibold tracking-tight text-gray-900 dark:text-white">LeadForge</span>}
    </span>
  );
}
