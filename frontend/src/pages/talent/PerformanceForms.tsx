import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { REVIEW_CRITERIA } from "@/lib/constants";
import type { Goal, Review } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, TextArea, TextInput } from "@/components/shared/Form";
import { EmployeePicker } from "@/components/shared/EmployeePicker";
import { Stars } from "@/components/shared/Badges";
import { Button } from "@/components/ui/button";

const inv = [["reviews"], ["goals"], ["employee"], ["analytics"]];
const defaultPeriod = () => {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
};

export function ReviewFormModal({ open, onOpenChange, review, employeeId, employeeName }: { open: boolean; onOpenChange: (v: boolean) => void; review?: Review | null; employeeId?: string; employeeName?: string }) {
  const [f, setF] = useState({ employee_id: null as string | null, employee_name: null as string | null, period: "", reviewer: "", ratings: {} as Record<string, number>, strengths: "", improvements: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({ employee_id: review?.employee_id ?? employeeId ?? null, employee_name: review?.employee_name ?? employeeName ?? null, period: review?.period ?? defaultPeriod(), reviewer: review?.reviewer ?? "", ratings: review?.ratings ?? {}, strengths: review?.strengths ?? "", improvements: review?.improvements ?? "" });
  }, [open, review, employeeId, employeeName]);
  const save = useMutate((b: Record<string, unknown>) => (review ? api.patch(`/reviews/${review.id}`, b) : api.post("/reviews", b)), { success: "Review saved", invalidate: inv, onFieldErrors: setErrors, onSuccess: () => onOpenChange(false) });
  const scores = Object.values(f.ratings).filter(Boolean);
  const overall = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const submit = (status: "draft" | "completed") => (e?: FormEvent) => {
    e?.preventDefault();
    if (!f.employee_id) return setErrors({ employee_id: "Choose an employee." });
    save.mutate({ employee_id: f.employee_id, period: f.period, reviewer: f.reviewer || null, ratings: Object.fromEntries(Object.entries(f.ratings).filter(([, v]) => v)), strengths: f.strengths || null, improvements: f.improvements || null, status });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={review ? "Edit performance review" : "New performance review"} className="sm:max-w-2xl">
      <form onSubmit={submit("completed")} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {!employeeId && !review ? <Field label="Employee *" error={errors.employee_id} className="sm:col-span-3"><EmployeePicker value={f.employee_id} valueLabel={f.employee_name} onChange={(id, name) => setF({ ...f, employee_id: id, employee_name: name })} allowClear={false} /></Field> : null}
          <Field label="Review period *" error={errors.period}><TextInput value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} required /></Field>
          <Field label="Reviewer" className="sm:col-span-2"><TextInput value={f.reviewer} onChange={(e) => setF({ ...f, reviewer: e.target.value })} placeholder="Manager name" /></Field>
        </div>
        <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between"><span className="lf-label mb-0">Ratings (1–5)</span><span className="text-theme-sm text-gray-500">Overall <strong className="text-gray-800 dark:text-white">{overall}</strong></span></div>
          {errors.ratings && <p className="mb-2 text-xs text-error-500">{errors.ratings}</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {REVIEW_CRITERIA.map((c) => (
              <li key={c} className="flex items-center justify-between py-2 text-theme-sm text-gray-700 dark:text-gray-300">{c}<Stars value={f.ratings[c] ?? 0} onChange={(v) => setF({ ...f, ratings: { ...f.ratings, [c]: v } })} /></li>
            ))}
          </ul>
        </div>
        <Field label="Strengths"><TextArea value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} rows={3} /></Field>
        <Field label="Areas to improve"><TextArea value={f.improvements} onChange={(e) => setF({ ...f, improvements: e.target.value })} rows={3} /></Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => submit("draft")()} disabled={save.isPending}>Save draft</Button>
          <Button type="submit" disabled={save.isPending}>Complete review</Button>
        </div>
      </form>
    </Modal>
  );
}

export function GoalFormModal({ open, onOpenChange, goal, employeeId, employeeName }: { open: boolean; onOpenChange: (v: boolean) => void; goal?: Goal | null; employeeId?: string; employeeName?: string }) {
  const [f, setF] = useState({ employee_id: null as string | null, employee_name: null as string | null, title: "", description: "", due_date: "", progress: 0 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setErrors({}); setF({ employee_id: goal?.employee_id ?? employeeId ?? null, employee_name: goal?.employee_name ?? employeeName ?? null, title: goal?.title ?? "", description: goal?.description ?? "", due_date: goal?.due_date ?? "", progress: goal?.progress ?? 0 }); }
  }, [open, goal, employeeId, employeeName]);
  const save = useMutate((b: Record<string, unknown>) => (goal ? api.patch(`/goals/${goal.id}`, b) : api.post("/goals", b)), { success: "Goal saved", invalidate: inv, onFieldErrors: setErrors, onSuccess: () => onOpenChange(false) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.employee_id) return setErrors({ employee_id: "Choose an employee." });
    save.mutate({ employee_id: f.employee_id, title: f.title, description: f.description || null, due_date: f.due_date || null, progress: f.progress });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={goal ? "Edit goal" : "Add goal"}>
      <form onSubmit={submit} className="space-y-4">
        {!employeeId && !goal && <Field label="Employee *" error={errors.employee_id}><EmployeePicker value={f.employee_id} valueLabel={f.employee_name} onChange={(id, name) => setF({ ...f, employee_id: id, employee_name: name })} allowClear={false} /></Field>}
        <Field label="Goal *" error={errors.title}><TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="e.g. Complete AWS certification" /></Field>
        <Field label="Details"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date"><TextInput type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
          <Field label={`Progress · ${f.progress}%`}><input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => setF({ ...f, progress: Number(e.target.value) })} className="mt-3 w-full accent-brand-500" /></Field>
        </div>
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save goal</Button></div>
      </form>
    </Modal>
  );
}
