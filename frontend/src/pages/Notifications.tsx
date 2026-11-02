import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { dtTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";

export default function Notifications() {
  const nav = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ unread: number; items: Notification[] }>("/notifications") });
  const readAll = useMutate(() => api.post("/notifications/read-all"), { invalidate: [["notifications"]] });
  const read = useMutate((id: string) => api.post(`/notifications/${id}/read`), { invalidate: [["notifications"]] });
  const remove = useMutate((id: string) => api.delete(`/notifications/${id}`), { invalidate: [["notifications"]] });
  return (
    <>
      <PageHeader title="Notifications" description={data ? `${data.unread} unread` : undefined} actions={data?.unread ? <Button variant="outline" onClick={() => readAll.mutate(undefined)}>Mark all as read</Button> : undefined} />
      <div className="lf-card overflow-hidden">
        {isLoading ? <Loading /> : !data?.items.length ? (
          <EmptyState icon={Bell} title="No notifications" description="You'll be reminded here when follow-ups become due." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.items.map((n) => (
              <li key={n.id} className="group flex items-start gap-4 px-5 py-4 sm:px-6">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.read_at ? "bg-gray-300 dark:bg-gray-600" : "bg-success-500"}`} />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (!n.read_at) read.mutate(n.id);
                    if (n.link) nav(n.link);
                  }}
                >
                  <p className={`text-theme-sm ${n.read_at ? "text-gray-600 dark:text-gray-400" : "font-medium text-gray-800 dark:text-white/90"}`}>{n.title}</p>
                  {n.body && <p className="text-theme-sm text-gray-500">{n.body}</p>}
                  <p className="mt-1 text-theme-xs text-gray-400">{dtTime(n.created_at)}</p>
                </button>
                <button onClick={() => remove.mutate(n.id)} className="invisible text-gray-400 hover:text-error-500 group-hover:visible" aria-label="Delete"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
