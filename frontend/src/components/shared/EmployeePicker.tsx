import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Employee, Paged } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Searchable employee selector. */
export function EmployeePicker({ value, valueLabel, onChange, placeholder = "Select an employee", allowClear = true, exclude }: { value: string | null; valueLabel?: string | null; onChange: (id: string | null, name: string | null) => void; placeholder?: string; allowClear?: boolean; exclude?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["employees", "picker", q], queryFn: () => api.get<Paged<Employee>>("/employees", { q, limit: 30 }), enabled: open });
  const items = (data?.items ?? []).filter((e) => e.id !== exclude);
  const label = items.find((e) => e.id === value)?.full_name ?? valueLabel ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="lf-input flex items-center justify-between text-left">
          <span className={cn("truncate", !label && "text-gray-400")}>{label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {allowClear && value && (
              <X className="size-4 text-gray-400 hover:text-gray-600" onClick={(e) => { e.stopPropagation(); onChange(null, null); }} />
            )}
            <ChevronsUpDown className="size-4 text-gray-400" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) rounded-xl p-2 dark:border-gray-800 dark:bg-gray-dark" align="start">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employees…" className="lf-input mb-2 h-9" />
        <ul className="custom-scrollbar max-h-60 overflow-y-auto">
          {isLoading && <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>}
          {!isLoading && !items.length && <li className="px-3 py-2 text-sm text-gray-500">No employees found</li>}
          {items.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => { onChange(e.id, e.full_name); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">
                <Check className={cn("size-4", value === e.id ? "text-brand-500" : "invisible")} />
                <span className="truncate">{e.full_name}</span>
                <span className="ml-auto shrink-0 text-xs text-gray-400">{e.job_title ?? e.employee_code}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function Avatar({ name, className = "size-9 text-xs" }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
  const hues = ["bg-brand-50 text-brand-600", "bg-success-50 text-success-700", "bg-warning-50 text-warning-600", "bg-pink-50 text-pink-600", "bg-sky-50 text-sky-700", "bg-violet-50 text-violet-700"];
  const h = hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold dark:bg-white/[0.08] dark:text-gray-200", h, className)}>{initials || "?"}</span>;
}
