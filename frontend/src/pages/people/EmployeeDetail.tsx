import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Cake, CalendarOff, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Target, Trash2, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ATTENDANCE, EMPLOYEE_STATUS, EMPLOYMENT_TYPES, GOAL_STATUS, LEAVE_STATUS } from "@/lib/constants";
import { ago, dt, money } from "@/lib/format";
import type { AttendanceStatus, EmployeeDetail as Detail } from "@/lib/types";
import { Card } from "@/components/shared/PageHeader";
import { Pill, Stars, StatusPill } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { ErrorState, Loading } from "@/components/shared/States";
import { Confirm } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmployeeFormModal } from "./EmployeeFormModal";
import { LeaveRequestModal } from "../time/LeaveRequestModal";
import { GoalFormModal, ReviewFormModal } from "../talent/PerformanceForms";

const d = (k: string | null) => (k ? dt(k + "T00:00:00") : "—");
function tenure(join: string, end?: string | null) {
  const a = new Date(join + "T00:00:00");
  const b = end ? new Date(end + "T00:00:00") : new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  if (months < 1) return "Less than a month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr${y > 1 ? "s" : ""}`, m && `${m} mo`].filter(Boolean).join(" ");
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2.5 text-theme-sm">
    <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
    <dd className="text-right font-medium text-gray-800 dark:text-white/90">{children}</dd>
  </div>
);

export default function EmployeeDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: e, isLoading, error, refetch } = useQuery({ queryKey: ["employee", id], queryFn: () => api.get<Detail>(`/employees/${id}`) });
  const [edit, setEdit] = useState(false);
  const [leave, setLeave] = useState(false);
  const [review, setReview] = useState(false);
  const [goal, setGoal] = useState(false);
  const [del, setDel] = useState(false);
  const [offboard, setOffboard] = useState(false);
  const inv = [["employee", id], ["employees"], ["dashboard"]];
  const remove = useMutate(() => api.delete(`/employees/${id}`), { success: "Employee deleted", invalidate: inv, onSuccess: () => nav("/employees") });
  const terminate = useMutate(() => api.patch(`/employees/${id}`, { status: "terminated" }), { success: "Marked as former employee", invalidate: inv });
  const confirmProbation = useMutate(() => api.patch(`/employees/${id}`, { status: "active", probation_end: null }), { success: "Probation completed", invalidate: inv });
  const goalProgress = useMutate(({ gid, progress }: { gid: string; progress: number }) => api.patch(`/goals/${gid}`, { progress }), { invalidate: [["employee", id], ["goals"]] });

  if (isLoading) return <Loading />;
  if (error || !e) return <ErrorState error={error} onRetry={refetch} />;
  const s = e.salary;
  const gross = s.basic + s.allowances.reduce((a, x) => a + x.amount, 0);
  const sum = e.attendance_summary;
  const marked = Object.values(sum).reduce((a, b) => a + b, 0);

  return (
    <>
      <Link to="/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400"><ArrowLeft className="size-4" /> All employees</Link>

      <div className="lf-card relative mb-6 overflow-hidden">
        <div className="h-24 bg-linear-to-r from-brand-500 via-brand-600 to-brand-800 dark:from-gray-800 dark:via-gray-900 dark:to-black" />
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5">
          <div className="flex items-end gap-4">
            <Avatar name={e.full_name} className="-mt-10 size-20 text-xl ring-4 ring-white dark:ring-gray-950" />
            <div className="pt-3">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{e.full_name}</h1>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">{e.job_title ?? "No job title"}{e.department_name && ` · ${e.department_name}`} · {e.employee_code}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {e.on_leave_today ? <Pill className="bg-violet-50 text-violet-700 dark:bg-white/[0.08] dark:text-gray-200">On leave today</Pill> : <StatusPill map={EMPLOYEE_STATUS} value={e.status} />}
            {e.status === "probation" && <Button size="sm" variant="outline" onClick={() => confirmProbation.mutate(undefined)}>Confirm employment</Button>}
            <Button size="sm" onClick={() => setLeave(true)}><CalendarOff /> Record leave</Button>
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon-sm" variant="outline" aria-label="More"><MoreHorizontal /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl dark:border-gray-800 dark:bg-gray-dark">
                <DropdownMenuItem onClick={() => setReview(true)} className="gap-2 rounded-lg"><Target className="size-4" /> New performance review</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGoal(true)} className="gap-2 rounded-lg"><Plus className="size-4" /> Add goal</DropdownMenuItem>
                {e.status !== "terminated" && <DropdownMenuItem onClick={() => setOffboard(true)} className="gap-2 rounded-lg"><UserMinus className="size-4" /> Mark as former employee</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => setDel(true)} className="gap-2 rounded-lg text-error-500"><Trash2 className="size-4" /> Delete record</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="grid border-t border-gray-100 sm:grid-cols-4 dark:border-gray-800">
          {[
            ["Tenure", tenure(e.join_date, e.termination_date)],
            ["Employment", EMPLOYMENT_TYPES[e.employment_type]],
            ["Monthly gross", money(gross)],
            ["Attendance (30 days)", marked ? `${Math.round(((sum.present + sum.late + sum.remote + sum.half_day) / marked) * 100)}%` : "No records"],
          ].map(([l, v]) => (
            <div key={l} className="border-gray-100 px-6 py-4 sm:border-l sm:first:border-l-0 dark:border-gray-800">
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">{l}</p>
              <p className="mt-0.5 font-semibold text-gray-800 dark:text-white/90">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-4">
          <Card title="Contact">
            <ul className="space-y-3 text-theme-sm">
              <li className="flex gap-3"><Mail className="mt-0.5 size-4 text-gray-400" />{e.email ? <a href={`mailto:${e.email}`} className="break-all text-gray-800 hover:text-brand-500 dark:text-white/90">{e.email}</a> : <span className="text-gray-400">No email</span>}</li>
              <li className="flex gap-3"><Phone className="mt-0.5 size-4 text-gray-400" />{e.phone ? <a href={`tel:${e.phone}`} className="text-gray-800 hover:text-brand-500 dark:text-white/90">{e.phone}</a> : <span className="text-gray-400">No phone</span>}</li>
              <li className="flex gap-3"><MapPin className="mt-0.5 size-4 text-gray-400" /><span className={e.address ? "text-gray-800 dark:text-white/90" : "text-gray-400"}>{e.address ?? "No address"}</span></li>
              <li className="flex gap-3"><Cake className="mt-0.5 size-4 text-gray-400" /><span className={e.date_of_birth ? "text-gray-800 dark:text-white/90" : "text-gray-400"}>{e.date_of_birth ? d(e.date_of_birth) : "Birthday not set"}</span></li>
            </ul>
          </Card>
          <Card title="Job">
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              <Row label="Department">{e.department_name ?? "—"}</Row>
              <Row label="Manager">{e.manager_id ? <Link to={`/employees/${e.manager_id}`} className="text-brand-500">{e.manager_name}</Link> : "—"}</Row>
              <Row label="Joined">{d(e.join_date)}</Row>
              {e.probation_end && <Row label="Probation ends">{d(e.probation_end)}</Row>}
              {e.termination_date && <Row label="Last working day">{d(e.termination_date)}</Row>}
              <Row label="Direct reports">{e.reports.length}</Row>
            </dl>
            {!!e.reports.length && (
              <div className="mt-3 flex flex-wrap gap-2">
                {e.reports.map((r) => <Link key={r.id} to={`/employees/${r.id}`} className="inline-flex items-center gap-2 rounded-full bg-gray-50 py-1 pl-1 pr-3 text-theme-xs text-gray-700 hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300"><Avatar name={r.full_name} className="size-6 text-[10px]" />{r.full_name}</Link>)}
              </div>
            )}
          </Card>
          <Card title="Leave balance" description={`${new Date().getFullYear()}`}>
            {!e.balances.length && <p className="text-theme-sm text-gray-500">No leave types configured.</p>}
            <ul className="space-y-4">
              {e.balances.map((b) => (
                <li key={b.leave_type_id}>
                  <div className="mb-1.5 flex justify-between text-theme-sm">
                    <span className="text-gray-700 dark:text-gray-300">{b.leave_type}{!b.paid && <span className="ml-1 text-theme-xs text-gray-400">(unpaid)</span>}</span>
                    <span className="text-gray-500"><span className="font-semibold text-gray-800 dark:text-white/90">{b.remaining}</span> / {b.allowance} left</span>
                  </div>
                  <Progress value={b.allowance ? (b.used / b.allowance) * 100 : 0} className="h-1.5 bg-gray-100 dark:bg-white/5 [&>div]:bg-brand-500" />
                  {b.pending > 0 && <p className="mt-1 text-theme-xs text-warning-600 dark:text-gray-400">{b.pending} day(s) pending approval</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Salary" actions={<Button size="xs" variant="ghost" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}>
            <dl className="divide-y divide-gray-100 dark:divide-gray-800">
              <Row label="Basic">{money(s.basic)}</Row>
              {s.allowances.map((a) => <Row key={a.name} label={`+ ${a.name}`}>{money(a.amount)}</Row>)}
              {s.deductions.map((a) => <Row key={a.name} label={`− ${a.name}`}>{money(a.amount)}</Row>)}
              <Row label="Tax rate">{s.tax_rate}%</Row>
              <Row label="Bank">{e.bank.bank_name ? `${e.bank.bank_name} · ${e.bank.account_number ?? ""}` : "—"}</Row>
            </dl>
          </Card>
          {(e.emergency.name || e.notes) && (
            <Card title="Emergency & notes">
              {e.emergency.name && <p className="text-theme-sm text-gray-700 dark:text-gray-300"><strong>{e.emergency.name}</strong>{e.emergency.relation && ` (${e.emergency.relation})`}{e.emergency.phone && ` · ${e.emergency.phone}`}</p>}
              {e.notes && <p className="mt-2 whitespace-pre-wrap text-theme-sm text-gray-500">{e.notes}</p>}
            </Card>
          )}
        </div>

        <div className="col-span-12 xl:col-span-8">
          <div className="lf-card p-5 sm:p-6">
            <Tabs defaultValue="timeline">
              <TabsList className="mb-5 h-auto flex-wrap justify-start gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
                {[["timeline", "Timeline"], ["attendance", "Attendance"], ["leave", `Leave (${e.leave_requests.length})`], ["payslips", `Payslips (${e.payslips.length})`], ["performance", "Performance"]].map(([v, l]) => (
                  <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="timeline">
                {!e.events.length ? <p className="py-8 text-center text-sm text-gray-500">No history yet.</p> : (
                  <ol className="relative ml-3 border-l border-gray-200 dark:border-gray-800">
                    {e.events.map((ev) => (
                      <li key={ev.id} className="mb-5 ml-5">
                        <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-brand-500 ring-4 ring-white dark:ring-gray-950" />
                        <p className="text-theme-sm text-gray-800 dark:text-white/90">{ev.text}</p>
                        <p className="text-theme-xs text-gray-400">{ago(ev.at)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="attendance">
                <div className="mb-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {(Object.keys(ATTENDANCE) as AttendanceStatus[]).map((k) => (
                    <div key={k} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.03]">
                      <p className="text-theme-xs text-gray-500">{ATTENDANCE[k].label}</p>
                      <p className="text-lg font-semibold text-gray-800 dark:text-white/90">{sum[k] ?? 0}</p>
                    </div>
                  ))}
                </div>
                {!e.attendance.length ? <p className="py-6 text-center text-sm text-gray-500">No attendance recorded in the last 30 days. <Link to="/attendance" className="text-brand-500">Mark attendance</Link></p> : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {e.attendance.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-theme-sm">
                        <span className="text-gray-700 dark:text-gray-300">{dt(a.date + "T00:00:00", "EEE, MMM d")}</span>
                        <span className="text-gray-500">{a.check_in ? `${a.check_in}${a.check_out ? ` – ${a.check_out}` : ""}` : ""}</span>
                        <Pill className={ATTENDANCE[a.status].color}>{ATTENDANCE[a.status].label}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="leave">
                <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setLeave(true)}><Plus /> Record leave</Button></div>
                {!e.leave_requests.length ? <p className="py-6 text-center text-sm text-gray-500">No leave requests.</p> : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {e.leave_requests.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{l.leave_type} · {l.days} day{l.days === 1 ? "" : "s"}</p>
                          <p className="text-theme-xs text-gray-500">{d(l.start_date)}{l.end_date !== l.start_date && ` – ${d(l.end_date)}`}{l.reason && ` · ${l.reason}`}</p>
                        </div>
                        <StatusPill map={LEAVE_STATUS} value={l.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="payslips">
                {!e.payslips.length ? <p className="py-6 text-center text-sm text-gray-500">No payslips yet. <Link to="/payroll" className="text-brand-500">Run payroll</Link></p> : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                    {e.payslips.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{dt(p.period + "-01T00:00:00", "MMMM yyyy")}</p>
                          <p className="text-theme-xs capitalize text-gray-500">{p.run_status} · gross {money(p.gross)}</p>
                        </div>
                        <Link to={`/payroll/payslip/${p.id}`} className="text-theme-sm font-semibold text-brand-500">{money(p.net)} →</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="performance" className="space-y-6">
                <div>
                  <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-800 dark:text-white/90">Goals</h4><Button size="xs" variant="outline" onClick={() => setGoal(true)}><Plus /> Add goal</Button></div>
                  {!e.goals.length ? <p className="text-sm text-gray-500">No goals set.</p> : (
                    <ul className="space-y-3">
                      {e.goals.map((g) => (
                        <li key={g.id} className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{g.title}</p>
                              <p className="text-theme-xs text-gray-500">{g.due_date ? `Due ${d(g.due_date)}` : "No due date"}</p>
                            </div>
                            <StatusPill map={GOAL_STATUS} value={g.status} />
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <input type="range" min={0} max={100} step={10} defaultValue={g.progress} onMouseUp={(ev) => goalProgress.mutate({ gid: g.id, progress: Number((ev.target as HTMLInputElement).value) })} onTouchEnd={(ev) => goalProgress.mutate({ gid: g.id, progress: Number((ev.target as HTMLInputElement).value) })} className="flex-1 accent-brand-500" aria-label="Progress" />
                            <span className="w-10 text-right text-theme-sm font-medium text-gray-700 dark:text-gray-300">{g.progress}%</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-gray-800 dark:text-white/90">Reviews</h4><Button size="xs" variant="outline" onClick={() => setReview(true)}><Plus /> New review</Button></div>
                  {!e.reviews.length ? <p className="text-sm text-gray-500">No performance reviews yet.</p> : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {e.reviews.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                          <div>
                            <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{r.period}</p>
                            <p className="text-theme-xs text-gray-500">{r.reviewer ? `by ${r.reviewer} · ` : ""}{r.status === "completed" ? `completed ${ago(r.completed_at)}` : "draft"}</p>
                          </div>
                          <span className="flex items-center gap-2"><Stars value={Math.round(r.overall)} size="size-4" /><span className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">{r.overall || "—"}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link to="/performance" className="mt-3 inline-flex items-center gap-1 text-theme-sm text-brand-500"><Briefcase className="size-4" /> Open performance</Link>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <EmployeeFormModal open={edit} onOpenChange={setEdit} employee={e} />
      <LeaveRequestModal open={leave} onOpenChange={setLeave} employeeId={e.id} employeeName={e.full_name} />
      <ReviewFormModal open={review} onOpenChange={setReview} employeeId={e.id} employeeName={e.full_name} />
      <GoalFormModal open={goal} onOpenChange={setGoal} employeeId={e.id} employeeName={e.full_name} />
      <Confirm open={offboard} onOpenChange={setOffboard} title={`Mark ${e.full_name} as a former employee?`} description="Their last working day is set to today (you can change it in Edit). Their records, payslips and history are kept." confirmLabel="Mark as former" onConfirm={() => terminate.mutate(undefined)} />
      <Confirm open={del} onOpenChange={setDel} title="Delete this employee record?" description="This permanently removes the employee with their attendance, leave, reviews and goals. Payslips in payroll runs are kept. To keep history, mark them as a former employee instead." onConfirm={() => remove.mutate(undefined)} />
    </>
  );
}
