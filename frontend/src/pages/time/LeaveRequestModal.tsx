import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import type { EmployeeDetail, LeaveType } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { EmployeePicker } from "@/components/shared/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const today = () => new Date().toISOString().slice(0, 10);

export function LeaveRequestModal({ open, onOpenChange, employeeId, employeeName }: { open: boolean; onOpenChange: (v: boolean) => void; employeeId?: string; employeeName?: string }) {
  const types = useQuery({ queryKey: ["leave-types"], queryFn: () => api.get<LeaveType[]>("/leave-types"), enabled: open });
  const [f, setF] = useState({ employee_id: null as string | null, employee_name: null as string | null, leave_type_id: "", start_date: today(), end_date: today(), half_day: false, reason: "", approve: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const emp = useQuery({ queryKey: ["employee", f.employee_id], queryFn: () => api.get<EmployeeDetail>(`/employees/${f.employee_id}`), enabled: open && !!f.employee_id });
  useEffect(() => {
    if (open) { setErrors({}); setF((p) => ({ ...p, employee_id: employeeId ?? null, employee_name: employeeName ?? null, start_date: today(), end_date: today(), half_day: false, reason: "", approve: true })); }
  }, [open, employeeId, employeeName]);
  useEffect(() => {
    if (types.data?.length && !f.leave_type_id) setF((p) => ({ ...p, leave_type_id: types.data![0].id }));
  }, [types.data, f.leave_type_id]);
  const balance = useMemo(() => emp.data?.balances.find((b) => b.leave_type_id === f.leave_type_id), [emp.data, f.leave_type_id]);
  const save = useMutate((b: Record<string, unknown>) => api.post("/leave-requests", b), {
    success: f.approve ? "Leave recorded" : "Leave request submitted",
    invalidate: [["leave"], ["employee"], ["dashboard"], ["attendance"], ["calendar"], ["notifications"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.employee_id) return setErrors({ employee_id: "Choose an employee." });
    save.mutate({ employee_id: f.employee_id, leave_type_id: f.leave_type_id, start_date: f.start_date, end_date: f.half_day ? f.start_date : f.end_date, half_day: f.half_day, reason: f.reason || null, status: f.approve ? "approved" : "pending" });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Record leave" description="Weekends and company holidays are not counted as leave days.">
      <form onSubmit={submit} className="space-y-4">
        {!employeeId && <Field label="Employee *" error={errors.employee_id}><EmployeePicker value={f.employee_id} valueLabel={f.employee_name} onChange={(id, name) => setF({ ...f, employee_id: id, employee_name: name })} allowClear={false} /></Field>}
        <Field label="Leave type" error={errors.leave_type_id} hint={balance ? `${balance.remaining} of ${balance.allowance} day(s) left this year${balance.pending ? ` · ${balance.pending} pending` : ""}` : undefined}>
          <NativeSelect value={f.leave_type_id} onChange={(e) => setF({ ...f, leave_type_id: e.target.value })}>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.paid ? "" : " (unpaid)"}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={f.half_day ? "Date" : "From"} error={errors.start_date}><TextInput type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: e.target.value > f.end_date ? e.target.value : f.end_date })} required /></Field>
          {!f.half_day && <Field label="To" error={errors.end_date}><TextInput type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} required /></Field>}
        </div>
        <label className="flex items-center gap-2 text-theme-sm text-gray-700 dark:text-gray-300"><Checkbox checked={f.half_day} onCheckedChange={(v) => setF({ ...f, half_day: !!v })} /> Half day</label>
        <Field label="Reason"><TextArea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} /></Field>
        <label className="flex items-center gap-2 text-theme-sm text-gray-700 dark:text-gray-300"><Checkbox checked={f.approve} onCheckedChange={(v) => setF({ ...f, approve: !!v })} /> Approve now (uncheck to leave it pending for approval)</label>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !types.data?.length}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
