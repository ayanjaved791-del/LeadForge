import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { PRIORITIES } from "@/lib/constants";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { Task } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { Button } from "@/components/ui/button";

export function TaskFormModal({ open, onOpenChange, task, leadId, leadName }: { open: boolean; onOpenChange: (v: boolean) => void; task?: Task | null; leadId?: string; leadName?: string }) {
  const members = useQuery({ queryKey: ["members"], queryFn: () => api.get<{ user_id: string; name: string }[]>("/workspace/members"), enabled: open });
  const [f, setF] = useState({ title: "", description: "", priority: "medium", status: "todo", due_at: "", lead_id: null as string | null, lead_name: null as string | null, assigned_to: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
      status: task?.status ?? "todo",
      due_at: toLocalInput(task?.due_at),
      lead_id: task?.lead_id ?? leadId ?? null,
      lead_name: task?.lead_name ?? leadName ?? null,
      assigned_to: task?.assigned_to ?? "",
    });
  }, [open, task, leadId, leadName]);
  const save = useMutate((b: Record<string, unknown>) => (task ? api.patch(`/tasks/${task.id}`, b) : api.post("/tasks", b)), {
    success: task ? "Task updated" : "Task created",
    invalidate: [["tasks"], ["lead"], ["calendar"], ["dashboard"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ title: f.title, description: f.description || null, priority: f.priority, status: f.status, due_at: fromLocalInput(f.due_at), lead_id: f.lead_id, ...(f.assigned_to ? { assigned_to: f.assigned_to } : {}) });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={task ? "Edit task" : "New task"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title *" error={errors.title}>
          <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </Field>
        <Field label="Description">
          <TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due">
            <TextInput type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} />
          </Field>
          <Field label="Priority">
            <NativeSelect value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </NativeSelect>
          </Field>
          <Field label="Assignee" error={errors.assigned_to}>
            <NativeSelect value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
              <option value="">Me</option>
              {members.data?.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Related lead">
          <LeadPicker value={f.lead_id} valueLabel={f.lead_name} onChange={(id, name) => setF({ ...f, lead_id: id, lead_name: name })} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{task ? "Save" : "Create task"}</Button>
        </div>
      </form>
    </Modal>
  );
}
