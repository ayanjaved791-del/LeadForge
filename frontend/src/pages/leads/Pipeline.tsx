import { useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, GripVertical, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { LEAD_STATUSES } from "@/lib/constants";
import { money, relDay } from "@/lib/format";
import type { Lead, LeadStatus, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/Badges";
import { ErrorState, Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LeadFormModal } from "./LeadFormModal";

export default function Pipeline() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: LeadStatus; index: number } | null>(null);
  const key = ["pipeline"];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => api.get<Paged<Lead>>("/leads", { sort: "pipeline", limit: 500 }) });

  const columns = useMemo(() => {
    const m = new Map<LeadStatus, Lead[]>(LEAD_STATUSES.map((s) => [s.key, []]));
    data?.items.forEach((l) => m.get(l.status)?.push(l));
    return m;
  }, [data]);

  const drop = async (status: LeadStatus, index: number) => {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (!id || !data) return;
    const lead = data.items.find((l) => l.id === id)!;
    const col = columns.get(status)!.filter((l) => l.id !== id);
    col.splice(index, 0, { ...lead, status });
    // optimistic update
    const others = data.items.filter((l) => l.status !== status && l.id !== id);
    qc.setQueryData<Paged<Lead>>(key, { ...data, items: [...others, ...col] });
    try {
      await api.post(`/leads/${id}/move`, { status, index });
      if (lead.status !== status) toast.success(`Moved to ${LEAD_STATUSES.find((s) => s.key === status)!.label}`);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
    refetch();
  };

  const onCardOver = (e: DragEvent, status: LeadStatus, index: number) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setOver({ status, index: index + (after ? 1 : 0) });
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Pipeline" description="Drag leads between stages. Moving to Won or Lost records the date automatically." actions={<Button onClick={() => setFormOpen(true)}><Plus /> Add lead</Button>} />
      <div className="custom-scrollbar -mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
        <div className="flex min-w-max gap-4">
          {LEAD_STATUSES.map((s) => {
            const leads = columns.get(s.key)!;
            const total = leads.reduce((sum, l) => sum + l.deal_value, 0);
            return (
              <div
                key={s.key}
                className={cn("flex w-[290px] flex-col rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]", over?.status === s.key && "border-brand-300 dark:border-brand-800")}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!leads.length || over?.status !== s.key) setOver({ status: s.key, index: over?.status === s.key ? over.index : leads.length });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(s.key, over?.status === s.key ? over.index : leads.length);
                }}
              >
                <div className="flex items-center justify-between px-4 pb-3 pt-4">
                  <span className="flex items-center gap-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                    <span className={`size-2 rounded-full ${s.dot}`} /> {s.label}
                    <span className="rounded-full bg-white px-2 py-0.5 text-theme-xs font-medium text-gray-500 shadow-theme-xs dark:bg-gray-800 dark:text-gray-400">{leads.length}</span>
                  </span>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">{money(total, true)}</span>
                </div>
                <div className="flex min-h-[120px] flex-1 flex-col gap-3 px-3 pb-3">
                  {leads.map((l, i) => (
                    <div key={l.id}>
                      {over?.status === s.key && over.index === i && dragId && dragId !== l.id && <div className="mb-3 h-1 rounded-full bg-brand-500" />}
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDragId(l.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOver(null);
                        }}
                        onDragOver={(e) => onCardOver(e, s.key, i)}
                        className={cn("group cursor-grab rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition active:cursor-grabbing dark:border-gray-800 dark:bg-gray-900", dragId === l.id && "opacity-40")}
                      >
                        <div className="flex items-start gap-2">
                          <Link to={`/leads/${l.id}`} className="min-w-0 flex-1 text-theme-sm font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{l.name}</Link>
                          <GripVertical className="size-4 shrink-0 text-gray-300 group-hover:text-gray-400" />
                        </div>
                        {l.category && <p className="mt-0.5 text-theme-xs capitalize text-gray-500 dark:text-gray-400">{l.category.replace(/_/g, " ")}</p>}
                        <div className="mt-3 flex items-center justify-between">
                          <PriorityBadge priority={l.priority} />
                          <span className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">{l.deal_value ? money(l.deal_value) : ""}</span>
                        </div>
                        {l.next_follow_up_at && (
                          <p className={`mt-3 flex items-center gap-1.5 border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800 ${new Date(l.next_follow_up_at) < new Date() ? "text-error-500" : "text-gray-500 dark:text-gray-400"}`}>
                            <CalendarClock className="size-3.5" /> {relDay(l.next_follow_up_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {over?.status === s.key && over.index >= leads.length && dragId && <div className="h-1 rounded-full bg-brand-500" />}
                  {!leads.length && <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-theme-xs text-gray-400 dark:border-gray-800">Drop leads here</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <LeadFormModal open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
