import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { EMPLOYMENT_TYPES } from "@/lib/constants";
import type { Department, Employee, PayItem } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { EmployeePicker } from "@/components/shared/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const today = () => new Date().toISOString().slice(0, 10);
type F = {
  first_name: string; last_name: string; email: string; phone: string; gender: string; date_of_birth: string; address: string;
  employee_code: string; department_id: string; job_title: string; manager_id: string | null; manager_name: string | null; employment_type: string;
  status: string; join_date: string; probation_end: string; termination_date: string;
  basic: string; tax_rate: string; allowances: PayItem[]; deductions: PayItem[];
  bank_name: string; account_name: string; account_number: string; em_name: string; em_phone: string; em_relation: string; notes: string;
};
const blank = (): F => ({
  first_name: "", last_name: "", email: "", phone: "", gender: "", date_of_birth: "", address: "", employee_code: "", department_id: "", job_title: "",
  manager_id: null, manager_name: null, employment_type: "full_time", status: "active", join_date: today(), probation_end: "", termination_date: "",
  basic: "", tax_rate: "", allowances: [], deductions: [], bank_name: "", account_name: "", account_number: "", em_name: "", em_phone: "", em_relation: "", notes: "",
});

function ItemsEditor({ label, items, onChange }: { label: string; items: PayItem[]; onChange: (v: PayItem[]) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="lf-label mb-0">{label}</span>
        <button type="button" onClick={() => onChange([...items, { name: "", amount: 0 }])} className="inline-flex items-center gap-1 text-theme-xs font-medium text-brand-500"><Plus className="size-3.5" /> Add</button>
      </div>
      {!items.length && <p className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-theme-xs text-gray-400 dark:border-gray-800">None</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <TextInput className="h-10" placeholder="Name (e.g. Housing)" value={it.name} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <TextInput className="h-10 w-36" type="number" min={0} step="0.01" placeholder="Amount" value={it.amount || ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
            <Button type="button" variant="ghost" size="icon-sm" className="size-10" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><X /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmployeeFormModal({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (v: boolean) => void; employee?: Employee | null }) {
  const nav = useNavigate();
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments"), enabled: open });
  const [f, setF] = useState<F>(blank());
  const [tab, setTab] = useState("personal");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTab("personal");
    if (!employee) return setF(blank());
    const e = employee;
    setF({
      first_name: e.first_name, last_name: e.last_name ?? "", email: e.email ?? "", phone: e.phone ?? "", gender: e.gender ?? "", date_of_birth: e.date_of_birth ?? "", address: e.address ?? "",
      employee_code: e.employee_code, department_id: e.department_id ?? "", job_title: e.job_title ?? "", manager_id: e.manager_id, manager_name: e.manager_name ?? null,
      employment_type: e.employment_type, status: e.status, join_date: e.join_date, probation_end: e.probation_end ?? "", termination_date: e.termination_date ?? "",
      basic: e.salary.basic ? String(e.salary.basic) : "", tax_rate: e.salary.tax_rate ? String(e.salary.tax_rate) : "", allowances: e.salary.allowances, deductions: e.salary.deductions,
      bank_name: e.bank.bank_name ?? "", account_name: e.bank.account_name ?? "", account_number: e.bank.account_number ?? "",
      em_name: e.emergency.name ?? "", em_phone: e.emergency.phone ?? "", em_relation: e.emergency.relation ?? "", notes: e.notes ?? "",
    });
  }, [open, employee]);

  const save = useMutate((b: Record<string, unknown>) => (employee ? api.patch<Employee>(`/employees/${employee.id}`, b) : api.post<Employee>("/employees", b)), {
    success: employee ? "Employee updated" : "Employee added",
    invalidate: [["employees"], ["employee"], ["dashboard"], ["departments"]],
    onFieldErrors: (fe) => {
      setErrors(fe);
      const personal = ["first_name", "last_name", "email", "phone", "date_of_birth"];
      const job = ["employee_code", "join_date", "department_id", "manager_id", "employment_type", "status", "probation_end", "termination_date"];
      setTab(Object.keys(fe).some((k) => personal.includes(k)) ? "personal" : Object.keys(fe).some((k) => job.includes(k)) ? "job" : "pay");
    },
    onSuccess: (r) => {
      onOpenChange(false);
      if (!employee) nav(`/employees/${r.id}`);
    },
  });
  const set = (k: keyof F) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = (v: string) => (v.trim() === "" ? null : v.trim());
    save.mutate({
      first_name: f.first_name, last_name: n(f.last_name), email: n(f.email), phone: n(f.phone), gender: n(f.gender), date_of_birth: n(f.date_of_birth), address: n(f.address),
      ...(f.employee_code.trim() ? { employee_code: f.employee_code.trim() } : {}),
      department_id: n(f.department_id), job_title: n(f.job_title), manager_id: f.manager_id, employment_type: f.employment_type, status: f.status,
      join_date: f.join_date, probation_end: n(f.probation_end), termination_date: f.status === "terminated" ? n(f.termination_date) : null,
      salary: { basic: Number(f.basic || 0), tax_rate: Number(f.tax_rate || 0), allowances: f.allowances, deductions: f.deductions },
      bank: { bank_name: n(f.bank_name), account_name: n(f.account_name), account_number: n(f.account_number) },
      emergency: { name: n(f.em_name), phone: n(f.em_phone), relation: n(f.em_relation) },
      notes: n(f.notes),
    });
  };
  const allowTotal = f.allowances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const dedTotal = f.deductions.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const gross = Number(f.basic || 0) + allowTotal;
  const estNet = Math.max(0, gross - dedTotal - gross * (Number(f.tax_rate || 0) / 100));

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={employee ? `Edit ${employee.full_name}` : "Add employee"} className="sm:max-w-3xl">
      <form onSubmit={submit}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5 h-auto flex-wrap justify-start gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
            {[["personal", "Personal"], ["job", "Job"], ["pay", "Salary & bank"], ["other", "Emergency & notes"]].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="personal" className="grid gap-4 sm:grid-cols-2">
            <Field label="First name *" error={errors.first_name}><TextInput value={f.first_name} onChange={set("first_name")} required /></Field>
            <Field label="Last name" error={errors.last_name}><TextInput value={f.last_name} onChange={set("last_name")} /></Field>
            <Field label="Work email" error={errors.email}><TextInput type="email" value={f.email} onChange={set("email")} /></Field>
            <Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Date of birth" error={errors.date_of_birth}><TextInput type="date" value={f.date_of_birth} onChange={set("date_of_birth")} max={today()} /></Field>
            <Field label="Gender">
              <NativeSelect value={f.gender} onChange={set("gender")}>
                <option value="">Prefer not to say</option>
                <option>Female</option>
                <option>Male</option>
                <option>Non-binary</option>
              </NativeSelect>
            </Field>
            <Field label="Address" className="sm:col-span-2"><TextInput value={f.address} onChange={set("address")} /></Field>
          </TabsContent>
          <TabsContent value="job" className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title"><TextInput value={f.job_title} onChange={set("job_title")} placeholder="e.g. Accountant" /></Field>
            <Field label="Department">
              <NativeSelect value={f.department_id} onChange={set("department_id")}>
                <option value="">No department</option>
                {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Manager" error={errors.manager_id}>
              <EmployeePicker value={f.manager_id} valueLabel={f.manager_name} exclude={employee?.id} onChange={(id, name) => setF({ ...f, manager_id: id, manager_name: name })} placeholder="No manager" />
            </Field>
            <Field label="Employee ID" error={errors.employee_code} hint={employee ? undefined : "Leave empty to generate one (EMP-0001…)"}><TextInput value={f.employee_code} onChange={set("employee_code")} /></Field>
            <Field label="Employment type">
              <NativeSelect value={f.employment_type} onChange={set("employment_type")}>
                {Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Status">
              <NativeSelect value={f.status} onChange={set("status")}>
                <option value="active">Active</option>
                <option value="probation">On probation</option>
                <option value="terminated">Former employee</option>
              </NativeSelect>
            </Field>
            <Field label="Join date *" error={errors.join_date}><TextInput type="date" value={f.join_date} onChange={set("join_date")} required /></Field>
            {f.status === "probation" && <Field label="Probation ends"><TextInput type="date" value={f.probation_end} onChange={set("probation_end")} /></Field>}
            {f.status === "terminated" && <Field label="Last working day" error={errors.termination_date}><TextInput type="date" value={f.termination_date} onChange={set("termination_date")} /></Field>}
          </TabsContent>
          <TabsContent value="pay" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Basic salary (monthly)"><TextInput type="number" min={0} step="0.01" value={f.basic} onChange={set("basic")} placeholder="0.00" /></Field>
              <Field label="Income tax rate (%)" hint="Applied to gross pay after unpaid-leave deductions"><TextInput type="number" min={0} max={100} step="0.1" value={f.tax_rate} onChange={set("tax_rate")} placeholder="0" /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <ItemsEditor label="Monthly allowances" items={f.allowances} onChange={(v) => setF({ ...f, allowances: v })} />
              <ItemsEditor label="Monthly deductions" items={f.deductions} onChange={(v) => setF({ ...f, deductions: v })} />
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-theme-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
              Gross <strong>{gross.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> · estimated net <strong>{estNet.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong> per month (before unpaid leave)
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bank"><TextInput value={f.bank_name} onChange={set("bank_name")} /></Field>
              <Field label="Account name"><TextInput value={f.account_name} onChange={set("account_name")} /></Field>
              <Field label="Account / IBAN"><TextInput value={f.account_number} onChange={set("account_number")} /></Field>
            </div>
          </TabsContent>
          <TabsContent value="other" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Emergency contact"><TextInput value={f.em_name} onChange={set("em_name")} /></Field>
              <Field label="Their phone"><TextInput value={f.em_phone} onChange={set("em_phone")} /></Field>
              <Field label="Relationship"><TextInput value={f.em_relation} onChange={set("em_relation")} /></Field>
            </div>
            <Field label="Notes"><TextArea value={f.notes} onChange={set("notes")} rows={4} /></Field>
          </TabsContent>
        </Tabs>
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{employee ? "Save changes" : "Add employee"}</Button>
        </div>
      </form>
    </Modal>
  );
}
