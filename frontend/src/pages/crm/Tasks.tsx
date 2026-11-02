import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { num, relDay } from "@/lib/format";
import type { Paged, Task } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { PriorityBadge } from "@/components/shared/Badges";
import { ChipSelect } from "@/components/shared/Form";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { TaskFormModal } from "./TaskFormModal";

const COLS = [["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Completed"]] as const;

export default function Tasks() {
  const [due, setDue] = useState("");
  const [mine, setMine] = useState("");
  const [form, setForm] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["tasks", due, mine], queryFn: () => api.get<Paged<Task> & { counts: Record<string, number> }>("/tasks", { due, mine, limit: 500 }) });
  const inv = [["tasks"], ["lead"], ["calendar"]];
  const setStatus = useMutate(({ id, status }: { id: string; status: string }) => api.patch(`/tasks/${id}`, { status }), { invalidate: inv });
  const remove = useMutate((id: string) => api.delete(`/tasks/${id}`), { success: "Task deleted", invalidate: inv });
  const c = data?.counts ?? {};
  return (
    <>
      <PageHeader title="Tasks" description={data ? `${num(c.overdue ?? 0)} overdue · ${num((c.todo ?? 0) + (c.in_progress ?? 0))} open` : undefined} actions={<Button onClick={() => setForm({ open: true })}><Plus /> New task</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <ChipSelect value={due} onChange={setDue} options={[{ value: "", label: "Any due date" }, { value: "overdue", label: "Overdue" }, { value: "today", label: "Due today" }]} />
        <ChipSelect value={mine} onChange={setMine} options={[{ value: "", label: "Everyone" }, { value: "1", label: "Assigned to me" }]} />
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.total && !due && !mine ? (
        <div className="lf-card"><EmptyState icon={ClipboardCheck} title="No tasks yet" description="Create tasks for proposals, design work or anything else you need to do for a lead." action={<Button onClick={() => setForm({ open: true })}><Plus /> New task</Button>} /></div>
      ) : (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          {COLS.map(([key, label]) => {
            const items = data!.items.filter((t) => t.status === key);
            return (
              <div key={key} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="flex items-center gap-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                    {label} <span className="rounded-full bg-white px-2 py-0.5 text-theme-xs text-gray-500 shadow-theme-xs dark:bg-gray-800">{items.length}</span>
                  </h3>
                </div>
                <div className="space-y-3">
                  {!items.length && <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-theme-xs text-gray-400 dark:border-gray-800">No tasks</p>}
                  {items.map((t) => {
                    const overdue = t.status !== "done" && t.due_at && new Date(t.due_at) < new Date();
                    return (
                      <div key={t.id} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => setStatus.mutate({ id: t.id, status: t.status === "done" ? "todo" : "done" })}
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${t.status === "done" ? "border-success-500 bg-success-500 text-white" : "border-gray-300 dark:border-gray-700"}`}
                            aria-label="Toggle done"
                          >
                            {t.status === "done" && <Check className="size-3.5" />}
                          </button>
                          <button onClick={() => setForm({ open: true, task: t })} className="min-w-0 flex-1 text-left">
                            <p className={`text-theme-sm font-medium ${t.status === "done" ? "text-gray-400 line-through" : "text-gray-800 dark:text-white/90"}`}>{t.title}</p>
                            {t.description && <p className="mt-1 line-clamp-2 text-theme-xs text-gray-500">{t.description}</p>}
                          </button>
                          <button onClick={() => remove.mutate(t.id)} className="invisible text-gray-400 hover:text-error-500 group-hover:visible" aria-label="Delete"><Trash2 className="size-4" /></button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-theme-xs">
                          <PriorityBadge priority={t.priority} />
                          {t.due_at && <span className={overdue ? "font-medium text-error-500" : "text-gray-500"}>{relDay(t.due_at)}</span>}
                          {t.lead_id && <Link to={`/leads/${t.lead_id}`} className="truncate text-brand-500">{t.lead_name}</Link>}
                          {t.assignee_name && <span className="ml-auto text-gray-400">{t.assignee_name}</span>}
                        </div>
                        {t.status === "todo" && <button onClick={() => setStatus.mutate({ id: t.id, status: "in_progress" })} className="mt-3 text-theme-xs font-medium text-brand-500">Start →</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <TaskFormModal open={form.open} onOpenChange={(o) => setForm({ open: o })} task={form.task} />
    </>
  );
}
