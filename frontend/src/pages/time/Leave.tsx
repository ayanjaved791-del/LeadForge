import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarOff, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { LEAVE_STATUS } from "@/lib/constants";
import { ago, dt, num } from "@/lib/format";
import type { LeaveBalance, LeaveRequest, LeaveType, Paged } from "@/lib/types";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { ChipSelect, Field, TextInput } from "@/components/shared/Form";
import { StatusPill } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { EmptyState, Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMe } from "@/hooks/use-auth";
import { LeaveRequestModal } from "./LeaveRequestModal";

const d = (k: string) => dt(k + "T00:00:00");
const inv = [["leave"], ["employee"], ["dashboard"], ["attendance"], ["calendar"]];

function Requests() {
  const [status, setStatus] = useState("pending");
  const { data, isLoading } = useQuery({ queryKey: ["leave", "requests", status], queryFn: () => api.get<Paged<LeaveRequest> & { counts: Record<string, number> }>("/leave-requests", { status, limit: 200 }) });
  const decide = useMutate(({ id, status }: { id: string; status: string }) => api.patch(`/leave-requests/${id}`, { status }), { invalidate: inv, success: "Leave updated" });
  const remove = useMutate((id: string) => api.delete(`/leave-requests/${id}`), { invalidate: inv, success: "Leave request deleted" });
  const c = data?.counts ?? {};
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[["Pending approval", c.pending, "text-warning-600 dark:text-white"], ["On leave today", c.on_leave_today, "text-brand-500 dark:text-white"], ["Approved", c.approved, "text-success-600"], ["Rejected", c.rejected, "text-error-500"]].map(([l, v, cl]) => (
          <div key={l as string} className="lf-card p-5"><p className="text-theme-sm text-gray-500">{l}</p><p className={`mt-1 text-2xl font-semibold ${cl}`}>{num((v as number) ?? 0)}</p></div>
        ))}
      </div>
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap gap-1 px-5 pt-5">
          {[["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["", "All"]].map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`rounded-lg px-3 py-1.5 text-theme-sm font-medium ${status === k ? "bg-brand-50 text-brand-500 dark:bg-white/10 dark:text-white" : "text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"}`}>{l}</button>
          ))}
        </div>
        <div className="mt-2">
          {isLoading ? <Loading /> : !data?.items.length ? (
            <EmptyState icon={CalendarOff} title={status === "pending" ? "No pending requests" : "No leave requests"} description="Record leave for an employee with the button above." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.items.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                  <Avatar name={l.employee_name ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-theme-sm text-gray-800 dark:text-white/90"><Link to={`/employees/${l.employee_id}`} className="font-medium hover:text-brand-500">{l.employee_name}</Link>{l.department_name && <span className="text-gray-500"> · {l.department_name}</span>}</p>
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">{l.leave_type}{!l.paid && " (unpaid)"} · <strong className="font-medium text-gray-700 dark:text-gray-300">{l.days} day{l.days === 1 ? "" : "s"}</strong> · {d(l.start_date)}{l.end_date !== l.start_date && ` – ${d(l.end_date)}`}</p>
                    {l.reason && <p className="mt-0.5 text-theme-xs text-gray-400">“{l.reason}”</p>}
                  </div>
                  <span className="text-theme-xs text-gray-400">{ago(l.created_at)}</span>
                  <StatusPill map={LEAVE_STATUS} value={l.status} />
                  <div className="flex items-center gap-1">
                    {l.status === "pending" ? (
                      <>
                        <Button size="xs" onClick={() => decide.mutate({ id: l.id, status: "approved" })}><Check /> Approve</Button>
                        <Button size="xs" variant="outline" onClick={() => decide.mutate({ id: l.id, status: "rejected" })}><X /> Reject</Button>
                      </>
                    ) : l.status === "approved" ? (
                      <Button size="xs" variant="ghost" onClick={() => decide.mutate({ id: l.id, status: "cancelled" })}>Cancel</Button>
                    ) : null}
                    <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(l.id)} aria-label="Delete"><Trash2 /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function Balances() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const { data, isLoading } = useQuery({ queryKey: ["leave", "balances", year], queryFn: () => api.get<{ employee_id: string; employee_name: string; department_name: string | null; balances: LeaveBalance[] }[]>("/leave/balances", { year }) });
  const types = data?.[0]?.balances ?? [];
  const y = new Date().getFullYear();
  return (
    <div className="lf-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-theme-sm text-gray-500">Days remaining per leave type (used / allowance).</p>
        <ChipSelect value={year} onChange={setYear} options={[y + 1, y, y - 1, y - 2].map((v) => ({ value: String(v), label: String(v) }))} />
      </div>
      <div className="mt-4">
        {isLoading ? <Loading /> : !data?.length ? <p className="px-5 py-10 text-center text-sm text-gray-500">No current employees.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead><tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"><th className="px-5 py-3 font-medium">Employee</th>{types.map((t) => <th key={t.leave_type_id} className="px-4 py-3 font-medium">{t.leave_type}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.map((r) => (
                  <tr key={r.employee_id} className="text-theme-sm">
                    <td className="px-5 py-3"><Link to={`/employees/${r.employee_id}`} className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{r.employee_name}</Link><span className="block text-theme-xs text-gray-500">{r.department_name ?? "—"}</span></td>
                    {r.balances.map((b) => (
                      <td key={b.leave_type_id} className="px-4 py-3">
                        <span className={`font-semibold ${b.remaining === 0 ? "text-error-500" : "text-gray-800 dark:text-white/90"}`}>{b.remaining}</span>
                        <span className="text-theme-xs text-gray-400"> left · {b.used}/{b.allowance}{b.pending ? ` · ${b.pending} pending` : ""}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="h-4" />
    </div>
  );
}

function Types() {
  const me = useMe();
  const canEdit = me.workspace.role !== "member";
  const { data } = useQuery({ queryKey: ["leave-types"], queryFn: () => api.get<LeaveType[]>("/leave-types") });
  const [form, setForm] = useState<{ open: boolean; t?: LeaveType | null }>({ open: false });
  const [f, setF] = useState({ name: "", days_per_year: "", paid: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [del, setDel] = useState<LeaveType | null>(null);
  useEffect(() => {
    if (form.open) { setErrors({}); setF({ name: form.t?.name ?? "", days_per_year: form.t ? String(form.t.days_per_year) : "", paid: form.t?.paid ?? true }); }
  }, [form]);
  const save = useMutate((b: Record<string, unknown>) => (form.t ? api.patch(`/leave-types/${form.t.id}`, b) : api.post("/leave-types", b)), { success: "Leave type saved", invalidate: [["leave-types"], ["leave"], ["employee"]], onFieldErrors: setErrors, onSuccess: () => setForm({ open: false }) });
  const remove = useMutate((id: string) => api.delete(`/leave-types/${id}`), { success: "Leave type deleted", invalidate: [["leave-types"], ["leave"]] });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ name: f.name, days_per_year: Number(f.days_per_year || 0), paid: f.paid }); };
  return (
    <Card title="Leave types" description="Yearly allowance per employee. Unpaid leave is deducted from salary in payroll." actions={canEdit && <Button size="sm" onClick={() => setForm({ open: true })}><Plus /> Add type</Button>}>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {data?.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-3">
            <div><p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{t.name}</p><p className="text-theme-xs text-gray-500">{t.days_per_year} days / year · {t.paid ? "Paid" : "Unpaid"}</p></div>
            {canEdit && <div className="flex"><Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, t })} aria-label="Edit"><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => setDel(t)} aria-label="Delete"><Trash2 /></Button></div>}
          </li>
        ))}
      </ul>
      <Modal open={form.open} onOpenChange={(o) => setForm({ open: o })} title={form.t ? "Edit leave type" : "New leave type"}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name *" error={errors.name}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Maternity leave" /></Field>
          <Field label="Days per year"><TextInput type="number" min={0} max={366} value={f.days_per_year} onChange={(e) => setF({ ...f, days_per_year: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-theme-sm text-gray-700 dark:text-gray-300"><Checkbox checked={f.paid} onCheckedChange={(v) => setF({ ...f, paid: !!v })} /> Paid leave</label>
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setForm({ open: false })}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
        </form>
      </Modal>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete ${del?.name}?`} description="Leave types that are already used by requests can't be deleted." onConfirm={() => del && remove.mutate(del.id)} />
    </Card>
  );
}

export default function Leave() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Leave" actions={<Button onClick={() => setOpen(true)}><Plus /> Record leave</Button>} />
      <Tabs defaultValue="requests">
        <TabsList className="mb-5 h-auto gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          {[["requests", "Requests"], ["balances", "Balances"], ["types", "Leave types"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="requests"><Requests /></TabsContent>
        <TabsContent value="balances"><Balances /></TabsContent>
        <TabsContent value="types"><Types /></TabsContent>
      </Tabs>
      <LeaveRequestModal open={open} onOpenChange={setOpen} />
    </>
  );
}
