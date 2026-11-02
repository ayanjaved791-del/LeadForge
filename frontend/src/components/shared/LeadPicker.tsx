import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Lead, Paged } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Searchable lead selector backed by the API. */
export function LeadPicker({ value, valueLabel, onChange, placeholder = "Select a lead", allowClear = true }: { value: string | null; valueLabel?: string | null; onChange: (id: string | null, name: string | null) => void; placeholder?: string; allowClear?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["lead-picker", q],
    queryFn: () => api.get<Paged<Lead>>("/leads", { q, limit: 20, sort: "updated" }),
    enabled: open,
  });
  const selected = data?.items.find((l) => l.id === value);
  const label = selected?.name ?? valueLabel ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="lf-input flex items-center justify-between text-left">
          <span className={cn("truncate", !label && "text-gray-400")}>{label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {allowClear && value && (
              <X
                className="size-4 text-gray-400 hover:text-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null, null);
                }}
              />
            )}
            <ChevronsUpDown className="size-4 text-gray-400" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) rounded-xl p-2 dark:border-gray-800 dark:bg-gray-dark" align="start">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className="lf-input mb-2 h-9" />
        <ul className="custom-scrollbar max-h-60 overflow-y-auto">
          {isLoading && <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>}
          {!isLoading && !data?.items.length && <li className="px-3 py-2 text-sm text-gray-500">No leads found</li>}
          {data?.items.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(l.id, l.name);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
              >
                <Check className={cn("size-4", value === l.id ? "text-brand-500" : "invisible")} />
                <span className="truncate">{l.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
