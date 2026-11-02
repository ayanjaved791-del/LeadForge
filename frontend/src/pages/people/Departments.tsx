import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { money } from "@/lib/format";
import type { Department } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Field, TextArea, TextInput } from "@/components/shared/Form";
import { Avatar, EmployeePicker } from "@/components/shared/EmployeePicker";
import { Button } from "@/components/ui/button";

function DepartmentForm({ open, onOpenChange, dept }: { open: boolean; onOpenChange: (v: boolean) => void; dept?: Department | null }) {
  const [f, setF] = useState({ name: "", description: "", head_id: null as string | null, head_name: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setErrors({}); setF({ name: dept?.name ?? "", description: dept?.description ?? "", head_id: dept?.head_id ?? null, head_name: dept?.head_name ?? null }); }
  }, [open, dept]);
  const save = useMutate((b: Record<string, unknown>) => (dept ? api.patch(`/departments/${dept.id}`, b) : api.post("/departments", b)), {
    success: dept ? "Department updated" : "Department created", invalidate: [["departments"], ["employees"], ["dashboard"]], onFieldErrors: setErrors, onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ name: f.name, description: f.description || null, head_id: f.head_id }); };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={dept ? "Edit department" : "New department"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name *" error={errors.name}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Engineering" /></Field>
        <Field label="Department head"><EmployeePicker value={f.head_id} valueLabel={f.head_name} onChange={(id, name) => setF({ ...f, head_id: id, head_name: name })} placeholder="No head assigned" /></Field>
        <Field label="Description"><TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} /></Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Departments() {
  const [form, setForm] = useState<{ open: boolean; dept?: Department | null }>({ open: false });
  const [del, setDel] = useState<Department | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments") });
  const remove = useMutate((id: string) => api.delete(`/departments/${id}`), { success: "Department deleted", invalidate: [["departments"], ["employees"], ["dashboard"]] });
  const total = data?.reduce((s, d) => s + (d.headcount ?? 0), 0) ?? 0;
  return (
    <>
      <PageHeader title="Departments" description={data?.length ? `${data.length} departments · ${total} people` : undefined} actions={<Button onClick={() => setForm({ open: true })}><Plus /> New department</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <div className="lf-card"><EmptyState icon={Building2} title="No departments yet" description="Group your team into departments like Engineering, Sales or Finance." action={<Button onClick={() => setForm({ open: true })}><Plus /> New department</Button>} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-6">
          {data.map((d) => (
            <div key={d.id} className="lf-card group flex flex-col p-5 transition hover:shadow-theme-md">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-white/[0.06] dark:text-gray-200"><Building2 className="size-5" /></span>
                <div className="flex opacity-0 transition group-hover:opacity-100">
                  <Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, dept: d })} aria-label="Edit"><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDel(d)} aria-label="Delete"><Trash2 /></Button>
                </div>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-800 dark:text-white/90">{d.name}</h3>
              {d.description && <p className="mt-1 line-clamp-2 text-theme-sm text-gray-500 dark:text-gray-400">{d.description}</p>}
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800" style={{ marginTop: "1.25rem" }}>
                {d.head_id ? (
                  <Link to={`/employees/${d.head_id}`} className="flex items-center gap-2 text-theme-sm text-gray-700 hover:text-brand-500 dark:text-gray-300"><Avatar name={d.head_name ?? "?"} className="size-7 text-[10px]" /> {d.head_name}</Link>
                ) : <span className="text-theme-sm text-gray-400">No head assigned</span>}
                <Link to={`/employees?dept=${d.id}`} className="flex items-center gap-1.5 text-theme-sm text-gray-600 dark:text-gray-400"><UsersRound className="size-4" /> {d.headcount}</Link>
              </div>
              <p className="mt-2 text-theme-xs text-gray-400">Monthly basic payroll: {money(d.payroll_cost ?? 0)}</p>
            </div>
          ))}
        </div>
      )}
      <DepartmentForm open={form.open} onOpenChange={(o) => setForm({ open: o })} dept={form.dept} />
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete ${del?.name}?`} description="Employees in this department will become unassigned. No employee records are deleted." onConfirm={() => del && remove.mutate(del.id)} />
    </>
  );
}
