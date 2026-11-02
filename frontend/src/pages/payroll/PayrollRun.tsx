import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Lock, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { money } from "@/lib/format";
import type { PayItem, Payslip, PayrollRunDetail } from "@/lib/types";
import { Pill } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { ErrorState, Loading } from "@/components/shared/States";
import { Confirm } from "@/components/shared/Modal";
import { Field, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RUN_STATUS, periodLabel } from "./Payroll";

function Items({ label, items, onChange }: { label: string; items: PayItem[]; onChange: (v: PayItem[]) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><span className="lf-label mb-0">{label}</span><button type="button" onClick={() => onChange([...items, { name: "", amount: 0 }])} className="inline-flex items-center gap-1 text-theme-xs font-medium text-brand-500"><Plus className="size-3.5" /> Add</button></div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <TextInput className="h-10" value={it.name} placeholder="Name" onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <TextInput className="h-10 w-32" type="number" min={0} step="0.01" value={it.amount || ""} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
            <Button type="button" variant="ghost" size="icon-sm" className="size-10" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove"><X /></Button>
          </div>
        ))}
        {!items.length && <p className="text-theme-xs text-gray-400">None</p>}
      </div>
    </div>
  );
}

function EditSlip({ slip, onClose }: { slip: Payslip | null; onClose: () => void }) {
  const [f, setF] = useState({ bonus: "", unpaid_days: "", tax_rate: "", allowances: [] as PayItem[], deductions: [] as PayItem[] });
  useEffect(() => {
    if (slip) setF({ bonus: slip.bonus ? String(slip.bonus) : "", unpaid_days: String(slip.unpaid_days), tax_rate: String(slip.tax_rate), allowances: slip.allowances, deductions: slip.deductions });
  }, [slip]);
  const save = useMutate((b: Record<string, unknown>) => api.patch(`/payroll/payslips/${slip!.id}`, b), { success: "Payslip updated", invalidate: [["payroll"], ["employee"]], onSuccess: onClose });
  return (
    <Sheet open={!!slip} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg dark:border-gray-800 dark:bg-gray-900">
        <SheetHeader className="mb-4 p-0"><SheetTitle className="text-gray-800 dark:text-white/90">Adjust payslip · {slip?.employee.full_name}</SheetTitle></SheetHeader>
        {slip && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate({ bonus: Number(f.bonus || 0), unpaid_days: Number(f.unpaid_days || 0), tax_rate: Number(f.tax_rate || 0), allowances: f.allowances, deductions: f.deductions }); }} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bonus"><TextInput type="number" min={0} step="0.01" value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} /></Field>
              <Field label="Unpaid days" hint={`of ${slip.working_days} working days`}><TextInput type="number" min={0} max={slip.working_days} step="0.5" value={f.unpaid_days} onChange={(e) => setF({ ...f, unpaid_days: e.target.value })} /></Field>
              <Field label="Tax %"><TextInput type="number" min={0} max={100} step="0.1" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
            </div>
            <Items label="Allowances" items={f.allowances} onChange={(v) => setF({ ...f, allowances: v })} />
            <Items label="Deductions" items={f.deductions} onChange={(v) => setF({ ...f, deductions: v })} />
            <p className="text-theme-xs text-gray-400">Changes apply to this month's payslip only. Edit the employee's salary to change future months.</p>
            <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save & recalculate</Button></div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function PayrollRun() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: run, isLoading, error, refetch } = useQuery({ queryKey: ["payroll", "run", id], queryFn: () => api.get<PayrollRunDetail>(`/payroll/runs/${id}`) });
  const [edit, setEdit] = useState<Payslip | null>(null);
  const [del, setDel] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const inv = [["payroll"], ["dashboard"], ["employee"], ["notifications"]];
  const finalize = useMutate(() => api.post(`/payroll/runs/${id}/finalize`), { success: "Payroll finalized", invalidate: inv });
  const reopen = useMutate(() => api.post(`/payroll/runs/${id}/reopen`), { success: "Run reopened for edits", invalidate: inv });
  const pay = useMutate(() => api.post(`/payroll/runs/${id}/pay`), { success: "Marked as paid", invalidate: inv });
  const remove = useMutate(() => api.delete(`/payroll/runs/${id}`), { success: "Payroll run deleted", invalidate: inv, onSuccess: () => nav("/payroll") });
  if (isLoading) return <Loading />;
  if (error || !run) return <ErrorState error={error} onRetry={refetch} />;
  const draft = run.status === "draft";
  return (
    <>
      <Link to="/payroll" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400"><ArrowLeft className="size-4" /> Payroll</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{periodLabel(run.period)}</h1><Pill className={RUN_STATUS[run.status].color}>{RUN_STATUS[run.status].label}</Pill></div>
          <p className="mt-1 text-theme-sm text-gray-500">{run.payslips.length} payslips · working days this month: {run.payslips[0]?.working_days ?? "—"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && <Button onClick={() => finalize.mutate(undefined)} disabled={finalize.isPending}><Lock /> Finalize</Button>}
          {run.status === "finalized" && <><Button onClick={() => setConfirmPay(true)}><Check /> Mark as paid</Button><Button variant="outline" onClick={() => reopen.mutate(undefined)}><RotateCcw /> Reopen</Button></>}
          {run.status !== "paid" && <Button variant="outline" size="icon" onClick={() => setDel(true)} aria-label="Delete run"><Trash2 /></Button>}
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[["Gross pay", run.gross], ["Total deductions", run.deductions], ["Net pay", run.net]].map(([l, v]) => (
          <div key={l as string} className="lf-card p-5"><p className="text-theme-sm text-gray-500">{l}</p><p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{money(v as number)}</p></div>
        ))}
      </div>
      <div className="lf-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr className="border-b border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="px-5 py-3 font-medium">Employee</th><th className="px-4 py-3 text-right font-medium">Basic</th><th className="px-4 py-3 text-right font-medium">Allowances + bonus</th><th className="px-4 py-3 text-right font-medium">Unpaid days</th><th className="px-4 py-3 text-right font-medium">Tax</th><th className="px-4 py-3 text-right font-medium">Deductions</th><th className="px-4 py-3 text-right font-medium">Net</th><th className="px-5 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {run.payslips.map((p) => (
                <tr key={p.id} className="text-theme-sm">
                  <td className="px-5 py-3"><Link to={`/employees/${p.employee_id}`} className="flex items-center gap-3"><Avatar name={p.employee.full_name} /><span><span className="block font-medium text-gray-800 dark:text-white/90">{p.employee.full_name}</span><span className="block text-theme-xs text-gray-500">{p.employee.job_title ?? p.employee.employee_code}</span></span></Link></td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{money(p.basic)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{money(p.gross - p.basic)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{p.unpaid_days ? <>{p.unpaid_days} <span className="text-theme-xs text-error-500">(−{money(p.unpaid_deduction)})</span></> : "0"}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{money(p.tax)}</td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{money(p.total_deductions - p.tax - p.unpaid_deduction)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 dark:text-white/90">{money(p.net)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {draft && <Button size="icon-sm" variant="ghost" onClick={() => setEdit(p)} aria-label="Adjust"><Pencil /></Button>}
                    <Button size="icon-sm" variant="ghost" asChild><Link to={`/payroll/payslip/${p.id}`} aria-label="Payslip"><FileText /></Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {draft && <p className="mt-3 text-theme-xs text-gray-400">Draft: adjust bonuses, deductions or unpaid days, then finalize. Unpaid days include unpaid leave, absences, half days and days before joining or after leaving.</p>}
      <EditSlip slip={edit} onClose={() => setEdit(null)} />
      <Confirm open={del} onOpenChange={setDel} title={`Delete the ${periodLabel(run.period)} run?`} description="All payslips in this run will be removed. You can create the run again." onConfirm={() => remove.mutate(undefined)} />
      <Confirm open={confirmPay} onOpenChange={setConfirmPay} title="Mark this payroll as paid?" description="Paid runs are locked and can't be edited or deleted." confirmLabel="Mark as paid" onConfirm={() => pay.mutate(undefined)} />
    </>
  );
}
