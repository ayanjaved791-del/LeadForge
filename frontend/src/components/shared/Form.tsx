import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, error, hint, children, className }: { label?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="lf-label">{label}</label>}
      {children}
      {error ? <p className="mt-1.5 text-xs text-error-500">{error}</p> : hint ? <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => (
  <input ref={ref} className={cn("lf-input", invalid && "border-error-500 focus:border-error-300 focus:ring-error-500/10", className)} {...p} />
));
TextInput.displayName = "TextInput";

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn("lf-input h-auto min-h-24 py-3", className)} {...p} />
));
TextArea.displayName = "TextArea";

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select
    ref={ref}
    className={cn(
      "lf-input appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2220%22 height=%2220%22 viewBox=%220 0 20 20%22 fill=%22none%22><path d=%22M4.79 7.4L10 12.6l5.21-5.2%22 stroke=%22%23667085%22 stroke-width=%221.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>')] bg-[length:18px] bg-[right_12px_center] bg-no-repeat pr-10",
      className,
    )}
    {...p}
  >
    {children}
  </select>
));
NativeSelect.displayName = "NativeSelect";

/** Compact select used in card headers (e.g. "2026 ▾", "12 Months ▾"). */
export function ChipSelect({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-9 w-auto py-1.5 pl-3 pr-9 text-theme-sm font-medium text-gray-700 dark:text-gray-300", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
