import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Mail, MessageCircle, Pencil, Phone, Plus, SkipForward, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { dtTime, num } from "@/lib/format";
import type { FollowUp, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/Badges";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { FollowUpFormModal } from "./FollowUpFormModal";

const SCOPES = [["pending", "All pending"], ["overdue", "Overdue"], ["upcoming", "Upcoming"], ["done", "Completed"]] as const;

export default function FollowUps() {
  const [scope, setScope] = useState<string>("pending");
  const [form, setForm] = useState<{ open: boolean; fu?: FollowUp | null }>({ open: false });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["follow-ups", scope], queryFn: () => api.get<Paged<FollowUp> & { counts: Record<string, number> }>("/follow-ups", { scope, limit: 200 }) });
  const inv = [["follow-ups"], ["dashboard"], ["lead"], ["leads"], ["notifications"]];
  const setStatus = useMutate(({ id, status }: { id: string; status: string }) => api.patch(`/follow-ups/${id}`, { status }), { invalidate: inv });
  const remove = useMutate((id: string) => api.delete(`/follow-ups/${id}`), { success: "Follow-up deleted", invalidate: inv });
  const c = data?.counts ?? {};
  return (
    <>
      <PageHeader title="Follow-ups" description="Reminders to get back to your leads at the right time." actions={<Button onClick={() => setForm({ open: true })}><Plus /> Schedule follow-up</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Overdue", c.overdue, "text-error-500"], ["Due today", c.today, "text-warning-600"], ["Pending", c.pending, "text-brand-500"], ["Completed", c.done, "text-success-600"]].map(([l, v, cl]) => (
          <div key={l as string} className="lf-card p-5">
            <p className="text-theme-sm text-gray-500">{l}</p>
            <p className={`mt-1 text-2xl font-semibold ${cl}`}>{num((v as number) ?? 0)}</p>
          </div>
        ))}
      </div>
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap gap-1 px-5 pt-5">
          {SCOPES.map(([k, l]) => (
            <button key={k} onClick={() => setScope(k)} className={`rounded-lg px-3 py-1.5 text-theme-sm font-medium ${scope === k ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-2">
          {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.items.length ? (
            <EmptyState icon={CalendarClock} title="Nothing here" description={scope === "done" ? "Completed follow-ups will appear here." : "Schedule follow-ups from a lead to never miss a conversation."} />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.items.map((f) => {
                const overdue = f.status === "pending" && new Date(f.due_at) < new Date();
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                    <span className={`flex size-10 items-center justify-center rounded-xl ${overdue ? "bg-error-50 text-error-500 dark:bg-error-500/15" : "bg-brand-50 text-brand-500 dark:bg-brand-500/15"}`}><CalendarClock className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-theme-sm text-gray-800 dark:text-white/90">
                        <Link to={`/leads/${f.lead_id}`} className="font-medium hover:text-brand-500">{f.lead_name}</Link>
                        {f.lead_status && <span className="ml-2"><StatusBadge status={f.lead_status} /></span>}
                      </p>
                      <p className="text-theme-xs capitalize text-gray-500 dark:text-gray-400">{f.channel}{f.note ? ` · ${f.note}` : ""}</p>
                      <p className={`text-theme-xs ${overdue ? "font-medium text-error-500" : "text-gray-400"}`}>{overdue ? "Overdue · " : ""}{dtTime(f.due_at)}{f.status !== "pending" && ` · ${f.status}`}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {f.lead_phone && <Button size="icon-sm" variant="ghost" asChild><a href={`tel:${f.lead_phone}`} aria-label="Call"><Phone /></a></Button>}
                      {f.lead_phone && <Button size="icon-sm" variant="ghost" asChild><a href={`https://wa.me/${f.lead_phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><MessageCircle /></a></Button>}
                      {f.lead_email && <Button size="icon-sm" variant="ghost" asChild><a href={`mailto:${f.lead_email}`} aria-label="Email"><Mail /></a></Button>}
                      {f.status === "pending" ? (
                        <>
                          <Button size="xs" onClick={() => setStatus.mutate({ id: f.id, status: "done" })}><Check /> Done</Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setStatus.mutate({ id: f.id, status: "skipped" })} aria-label="Skip" title="Skip"><SkipForward /></Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, fu: f })} aria-label="Edit"><Pencil /></Button>
                        </>
                      ) : (
                        <Button size="xs" variant="outline" onClick={() => setStatus.mutate({ id: f.id, status: "pending" })}>Reopen</Button>
                      )}
                      <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(f.id)} aria-label="Delete"><Trash2 /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <FollowUpFormModal open={form.open} onOpenChange={(o) => setForm({ open: o })} followUp={form.fu} />
    </>
  );
}
