import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity as ActivityIcon, Check, Mail, MessageCircle, Phone, Plus, StickyNote, Video, ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import { ACTIVITY_TYPES } from "@/lib/constants";
import { dtTime, num } from "@/lib/format";
import type { Activity, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { ActivityFormModal } from "./ActivityFormModal";

const ICON = { call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle, note: StickyNote, status_change: Check, system: ClipboardList };
const TABS = [["", "All"], ["call", "Calls"], ["email", "Emails"], ["meeting", "Meetings"], ["whatsapp", "WhatsApp"], ["note", "Notes"], ["status_change", "Status changes"]] as const;

export default function Activities() {
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["activities", type, page], queryFn: () => api.get<Paged<Activity> & { counts: Record<string, number> }>("/activities", { type, page, limit: 30 }) });
  return (
    <>
      <PageHeader title="Activities" description="Calls, emails, meetings and WhatsApp conversations across all leads." actions={<Button onClick={() => setOpen(true)}><Plus /> Log activity</Button>} />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {(["call", "email", "meeting", "whatsapp", "note"] as const).map((t) => {
          const Icon = ICON[t];
          return (
            <div key={t} className="lf-card flex items-center gap-3 p-4">
              <span className={`flex size-10 items-center justify-center rounded-xl ${ACTIVITY_TYPES[t].color}`}><Icon className="size-5" /></span>
              <div>
                <p className="text-theme-xs text-gray-500">{ACTIVITY_TYPES[t].label}s</p>
                <p className="text-lg font-semibold text-gray-800 dark:text-white/90">{num(data?.counts?.[t] ?? 0)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap gap-1 px-5 pt-5">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => { setType(k); setPage(1); }} className={`rounded-lg px-3 py-1.5 text-theme-sm font-medium ${type === k ? "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-2">
          {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.items.length ? (
            <EmptyState icon={ActivityIcon} title="No activities logged" description="Log calls, emails, meetings and WhatsApp messages from any lead." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.items.map((a) => {
                const Icon = ICON[a.type];
                return (
                  <li key={a.id} className="flex gap-4 px-5 py-4 sm:px-6">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${ACTIVITY_TYPES[a.type].color}`}><Icon className="size-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-theme-sm text-gray-800 dark:text-white/90">
                        <span className="font-medium">{a.type === "status_change" ? `Status: ${a.body}` : a.subject || ACTIVITY_TYPES[a.type].label}</span>
                        <span className="text-gray-500"> · </span>
                        <Link to={`/leads/${a.lead_id}`} className="text-brand-500">{a.lead_name}</Link>
                      </p>
                      {a.type !== "status_change" && a.body && <p className="mt-1 line-clamp-2 text-theme-sm text-gray-600 dark:text-gray-400">{a.body}</p>}
                      <p className="mt-1 text-theme-xs text-gray-400">
                        {dtTime(a.occurred_at)}{a.author && ` · ${a.author}`}{a.direction && ` · ${a.direction}`}{a.outcome && ` · ${a.outcome}`}{a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}{a.contact_name ? ` · with ${a.contact_name}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {data && <Pagination page={page} total={data.total} limit={30} onPage={setPage} />}
      </div>
      <ActivityFormModal open={open} onOpenChange={setOpen} />
    </>
  );
}
