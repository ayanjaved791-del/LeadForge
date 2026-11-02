import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { dt, money, num } from "@/lib/format";
import type { PayrollRun } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { Field, TextInput } from "@/components/shared/Form";
import { Pill } from "@/components/shared/Badges";
import { EmptyState, Loading } from "@/components/shared/States";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";

export const RUN_STATUS = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
  finalized: { label: "Finalized", color: "bg-brand-50 text-brand-600 dark:bg-white/[0.08] dark:text-gray-200" },
  paid: { label: "Paid", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" },
};
export const periodLabel = (p: string) => dt(p + "-01T00:00:00", "MMMM yyyy");

export default function Payroll() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({ queryKey: ["payroll", "runs"], queryFn: () => api.get<PayrollRun[]>("/payroll/runs") });
  const create = useMutate((p: string) => api.post<PayrollRun>("/payroll/runs", { period: p }), { success: "Payroll run created", invalidate: [["payroll"], ["dashboard"]], onFieldErrors: setErrors, onSuccess: (r) => nav(`/payroll/${r.id}`) });
  const submit = (e: FormEvent) => { e.preventDefault(); setErrors({}); create.mutate(period); };
  const paidYear = data?.filter((r) => r.status === "paid" && r.period.startsWith(String(now.getFullYear()))).reduce((s, r) => s + r.net, 0) ?? 0;
  const last = data?.[0];
  return (
    <>
      <PageHeader title="Payroll" description="Monthly salary runs based on each employee's salary, leave and attendance." actions={<Button onClick={() => setOpen(true)}><Plus /> New payroll run</Button>} />
      <div className="mb-6 grid gap-4 md:grid-cols-3 md:gap-6">
        <div className="relative overflow-hidden rounded-2xl bg-gray-900 p-6 text-white dark:bg-[#141414]">
          <div className="absolute -right-8 -top-10 size-40 rounded-3xl bg-white/[0.04]" />
          <p className="relative text-theme-sm text-white/60">Latest run</p>
          <p className="relative mt-1 text-2xl font-semibold">{last ? money(last.net) : "—"}</p>
          <p className="relative mt-4 text-theme-sm text-white/70">{last ? `${periodLabel(last.period)} · ${last.employees} payslips · ${RUN_STATUS[last.status].label}` : "No payroll runs yet"}</p>
        </div>
        <div className="lf-card p-6"><p className="text-theme-sm text-gray-500">Paid in {now.getFullYear()}</p><p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{money(paidYear)}</p><p className="mt-4 text-theme-sm text-gray-500">{num(data?.filter((r) => r.status === "paid").length ?? 0)} paid runs in total</p></div>
        <div className="lf-card p-6"><p className="text-theme-sm text-gray-500">Awaiting action</p><p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{num(data?.filter((r) => r.status !== "paid").length ?? 0)}</p><p className="mt-4 text-theme-sm text-gray-500">Draft or finalized runs not yet paid</p></div>
      </div>
      <div className="lf-card overflow-hidden">
        {isLoading ? <Loading /> : !data?.length ? (
          <EmptyState icon={Wallet} title="No payroll runs yet" description="Set basic salaries on employee profiles, then create a run for the month." action={<Button onClick={() => setOpen(true)}><Plus /> New payroll run</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr className="border-b border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"><th className="px-6 py-3 font-medium">Period</th><th className="px-4 py-3 font-medium">Employees</th><th className="px-4 py-3 font-medium">Gross</th><th className="px-4 py-3 font-medium">Deductions</th><th className="px-4 py-3 font-medium">Net pay</th><th className="px-6 py-3 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.map((r) => (
                  <tr key={r.id} className="text-theme-sm hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                    <td className="px-6 py-3.5"><Link to={`/payroll/${r.id}`} className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{periodLabel(r.period)}</Link></td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400">{r.employees}</td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400">{money(r.gross)}</td>
                    <td className="px-4 py-3.5 text-gray-600 dark:text-gray-400">{money(r.deductions)}</td>
                    <td className="px-4 py-3.5 font-semibold text-gray-800 dark:text-white/90">{money(r.net)}</td>
                    <td className="px-6 py-3.5"><Pill className={RUN_STATUS[r.status].color}>{RUN_STATUS[r.status].label}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="New payroll run" description="Creates draft payslips for everyone employed during the month who has a basic salary. You can review and adjust them before finalizing.">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Month" error={errors.period}><TextInput type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required /></Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>Create run</Button></div>
        </form>
      </Modal>
    </>
  );
}
