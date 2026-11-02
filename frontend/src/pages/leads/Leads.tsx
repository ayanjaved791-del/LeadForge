import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { LEAD_STATUSES, PRIORITIES } from "@/lib/constants";
import { ago, money, relDay } from "@/lib/format";
import type { Lead, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { PriorityBadge, ScoreBadge, StatusBadge, Pill } from "@/components/shared/Badges";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Pagination } from "@/components/shared/Pagination";
import { Confirm } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadFormModal } from "./LeadFormModal";

export default function Leads() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [tag, setTag] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [sort, setSort] = useState("created");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = { q: debounced, status, priority, tag, follow_up: followUp };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["leads", filters, sort, page],
    queryFn: () => api.get<Paged<Lead> & { all_tags: string[] }>("/leads", { ...filters, sort, page, limit: 25 }),
  });
  const bulkDelete = useMutate((ids: string[]) => api.post<{ deleted: number }>("/leads/bulk-delete", { ids }), {
    invalidate: [["leads"], ["dashboard"], ["pipeline"]],
    onSuccess: (r) => { toast.success(`${r.deleted} lead(s) removed`); setSelected(new Set()); },
  });
  const exportCsv = async () => {
    try {
      await api.download("/leads/export", filters, `leadforge-leads-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const items = data?.items ?? [];
  const allSel = items.length > 0 && items.every((l) => selected.has(l.id));
  const set = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Leads"
        description={data ? `${data.total} lead${data.total === 1 ? "" : "s"} in this workspace` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
            <Button onClick={() => setFormOpen(true)}><Plus /> Add lead</Button>
          </>
        }
      />
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, address…" className="lf-input h-10 pl-10" />
          </div>
          <ChipSelect value={status} onChange={set(setStatus)} options={[{ value: "", label: "All statuses" }, ...LEAD_STATUSES.map((s) => ({ value: s.key, label: s.label }))]} />
          <ChipSelect value={priority} onChange={set(setPriority)} options={[{ value: "", label: "All priorities" }, ...PRIORITIES.map((p) => ({ value: p.key, label: p.label }))]} />
          <ChipSelect value={followUp} onChange={set(setFollowUp)} options={[{ value: "", label: "Any follow-up" }, { value: "overdue", label: "Overdue follow-up" }, { value: "upcoming", label: "Upcoming follow-up" }]} />
          {!!data?.all_tags.length && <ChipSelect value={tag} onChange={set(setTag)} options={[{ value: "", label: "All tags" }, ...data.all_tags.map((t) => ({ value: t, label: t }))]} />}
          <ChipSelect value={sort} onChange={set(setSort)} options={[{ value: "created", label: "Newest" }, { value: "updated", label: "Recently updated" }, { value: "follow_up", label: "Next follow-up" }, { value: "value", label: "Deal value" }, { value: "score", label: "Opportunity score" }, { value: "name", label: "Name A–Z" }]} />
        </div>
        {selected.size > 0 && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-lg bg-error-50 px-4 py-2.5 text-sm dark:bg-error-500/10">
            <span className="text-error-600 dark:text-error-500">{selected.size} selected</span>
            <Button size="xs" variant="destructive" onClick={() => setConfirm(true)}><Trash2 /> Remove</Button>
          </div>
        )}
        <div className="mt-4">
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title={data?.total === 0 && !debounced && !status && !priority && !tag && !followUp ? "No leads yet" : "No leads match your filters"}
              description="Save businesses from Discovery or add a lead manually."
              action={<Button onClick={() => setFormOpen(true)}><Plus /> Add lead</Button>}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="w-10 py-3 pl-5"><Checkbox checked={allSel} onCheckedChange={(v) => setSelected(v ? new Set(items.map((l) => l.id)) : new Set())} /></th>
                    <th className="px-5 py-3 font-medium">Lead</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Priority</th>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-4 py-3 font-medium">Next follow-up</th>
                    <th className="px-5 py-3 font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((l) => {
                    const overdue = l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date();
                    return (
                      <tr key={l.id} className="text-theme-sm hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                        <td className="py-3 pl-5">
                          <Checkbox checked={selected.has(l.id)} onCheckedChange={(v) => { const n = new Set(selected); v ? n.add(l.id) : n.delete(l.id); setSelected(n); }} />
                        </td>
                        <td className="max-w-[300px] px-5 py-3">
                          <Link to={`/leads/${l.id}`} className="block truncate font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{l.name}</Link>
                          <span className="flex flex-wrap items-center gap-1 text-theme-xs text-gray-500 dark:text-gray-400">
                            {l.phone || l.email || l.address || "No contact details"}
                          </span>
                          {!!l.tags.length && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {l.tags.map((t) => <Pill key={t} className="bg-gray-100 px-2 text-[11px] text-gray-600 dark:bg-white/5 dark:text-gray-400">{t}</Pill>)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                        <td className="px-4 py-3"><PriorityBadge priority={l.priority} /></td>
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{l.deal_value ? money(l.deal_value) : "—"}</td>
                        <td className="px-4 py-3">{l.opportunity_score !== null ? <ScoreBadge score={l.opportunity_score} /> : <span className="text-gray-400">—</span>}</td>
                        <td className={`px-4 py-3 text-theme-xs ${overdue ? "font-medium text-error-500" : "text-gray-500 dark:text-gray-400"}`}>{l.next_follow_up_at ? relDay(l.next_follow_up_at) : "—"}</td>
                        <td className="px-5 py-3 text-theme-xs text-gray-500 dark:text-gray-400">{l.last_activity_at ? ago(l.last_activity_at) : "None yet"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {data && <Pagination page={page} total={data.total} limit={25} onPage={setPage} />}
      </div>
      <LeadFormModal open={formOpen} onOpenChange={setFormOpen} />
      <Confirm open={confirm} onOpenChange={setConfirm} title={`Remove ${selected.size} lead(s)?`} description="Notes, activities, tasks and follow-ups for these leads will be deleted. Discovered business data is kept." confirmLabel="Remove" onConfirm={() => bulkDelete.mutate([...selected])} />
    </>
  );
}
