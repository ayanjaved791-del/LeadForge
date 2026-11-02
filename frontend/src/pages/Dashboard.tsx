import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Briefcase, Cake, CalendarOff, Check, ChevronLeft, ChevronRight, Clock, Plus, UserCheck, UserPlus, UsersRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { useChartColors } from "@/hooks/use-chart-colors";
import { dt, getCurrency, money, num, relDay } from "@/lib/format";
import type { Interview, LeaveRequest, PayrollRun } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "@/components/shared/Form";
import { Ring, StatCard } from "@/components/shared/StatCard";
import { ErrorState, Loading } from "@/components/shared/States";
import { Avatar } from "@/components/shared/EmployeePicker";
import { LogoMark } from "@/components/layout/Logo";
import { EmployeeFormModal } from "./people/EmployeeFormModal";
import { LeaveRequestModal } from "./time/LeaveRequestModal";

interface DashboardData {
  kpi: Record<string, number> & { working_day: boolean; holiday: string | null };
  monthly: { month: number; hires: number; exits: number; headcount: number }[];
  year: number;
  years: number[];
  attendance_trend: { date: string; present: number; absent: number; on_leave: number }[];
  departments: { name: string; count: number }[];
  pending_leave: LeaveRequest[];
  on_leave_today: { id: string; name: string; type: string }[];
  birthdays: { id: string; name: string; date: string; years: number }[];
  anniversaries: { id: string; name: string; date: string; years: number }[];
  recent_hires: { id: string; name: string; job_title: string | null; department: string | null; join_date: string }[];
  interviews: (Interview & { candidate_name?: string })[];
  last_run: PayrollRun | null;
  company: { name: string; created_at: string; members: number; departments: number };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "NGN", "ZAR", "BDT", "TRY", "BRL", "MXN"];

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-theme-md dark:border-gray-800 dark:bg-gray-dark">
      <p className="mb-1 font-medium text-gray-800 dark:text-white/90">{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} className="flex items-center gap-2 text-gray-500 dark:text-gray-400"><span className="size-2 rounded-full" style={{ background: p.color || p.fill }} /> {p.name}: <span className="font-medium text-gray-800 dark:text-white/90">{p.value}</span></p>)}
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const nav = useNavigate();
  const c = useChartColors();
  const [year, setYear] = useState(new Date().getFullYear());
  const [pi, setPi] = useState(0);
  const [addEmp, setAddEmp] = useState(false);
  const [leave, setLeave] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard", year], queryFn: () => api.get<DashboardData>("/dashboard", { year }) });
  const setCurrency = useMutate((cur: string) => api.patch("/auth/profile", { currency: cur }), { invalidate: [["me"], ["dashboard"]] });
  const decide = useMutate(({ id, status }: { id: string; status: string }) => api.patch(`/leave-requests/${id}`, { status }), { success: "Leave updated", invalidate: [["dashboard"], ["leave"], ["employee"], ["calendar"]], onSuccess: () => setPi(0) });
  const spark = useMemo(() => data?.attendance_trend.map((d) => ({ label: dt(d.date + "T00:00:00", "MMM d"), present: d.present })) ?? [], [data]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const k = data.kpi;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const attention = [
    k.pending_leave && `${num(k.pending_leave)} leave request${k.pending_leave > 1 ? "s" : ""} to review`,
    k.not_marked_today && `${num(k.not_marked_today)} employee${k.not_marked_today > 1 ? "s" : ""} without attendance today`,
    data.interviews.filter((i) => new Date(i.scheduled_at).toDateString() === new Date().toDateString()).length && "interviews scheduled today",
  ].filter(Boolean);
  const chart = data.monthly.map((m) => ({ name: MONTHS[m.month - 1], hires: m.hires, exits: m.exits }));
  const pending = data.pending_leave[pi] ?? null;
  const attendRate = k.headcount ? Math.round((k.present_today / Math.max(1, k.headcount - k.on_leave_today)) * 100) : 0;
  const upcoming = [
    ...data.birthdays.map((b) => ({ key: "b" + b.id, icon: Cake, title: `${b.name}'s birthday`, date: b.date, to: `/employees/${b.id}` })),
    ...data.anniversaries.map((a) => ({ key: "a" + a.id, icon: UsersRound, title: `${a.name} · ${a.years} year${a.years > 1 ? "s" : ""}`, date: a.date, to: `/employees/${a.id}` })),
    ...data.interviews.map((i) => ({ key: "i" + i.id, icon: Briefcase, title: `Interview · ${i.candidate_name}`, date: i.scheduled_at, to: "/recruitment/candidates" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const maxDept = Math.max(1, ...data.departments.map((d) => d.count));

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}{k.holiday && ` · ${k.holiday}`}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-800 sm:text-[28px] dark:text-white/90">{greeting}, {me.user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">{attention.length ? attention.join(" · ") : k.headcount ? "Everything is up to date." : "Start by adding your first employee."}</p>
        </div>
        {k.pending_leave > 0 && <Button variant="outline" size="sm" asChild><Link to="/leave"><CalendarOff /> Review leave</Link></Button>}
      </div>

      {/* Payroll card + actions */}
      <div className="col-span-12 space-y-4 xl:col-span-6">
        <div className="lf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Monthly Payroll</h3><p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">Basic salary + allowances for current staff</p></div>
            <ChipSelect value={getCurrency()} onChange={(v) => setCurrency.mutate(v)} options={CURRENCIES.map((x) => ({ value: x, label: x }))} />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(k.monthly_payroll)}</p>
              <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">{num(k.headcount)} employee{k.headcount === 1 ? "" : "s"} · {getCurrency()}</p>
            </div>
            <div className="h-[70px] w-full max-w-[220px]">
              {spark.some((s) => s.present) ? (
                <ResponsiveContainer>
                  <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="sp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={c.primary} stopOpacity={0} /></linearGradient></defs>
                    <Tooltip content={<Tip />} />
                    <Area type="monotone" dataKey="present" name="Present" stroke={c.primary} strokeWidth={2} fill="url(#sp)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="flex h-full items-center justify-end text-right text-xs text-gray-400">Attendance trend appears once you mark attendance</div>}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">Last run: <span className="font-medium text-gray-800 dark:text-white/90">{data.last_run ? `${dt(data.last_run.period + "-01T00:00:00", "MMM yyyy")} · ${money(data.last_run.net)} net` : "none yet"}</span></p>
            <Button variant="outline" size="sm" asChild><Link to="/payroll">See Payroll</Link></Button>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="h-12 flex-1" onClick={() => setAddEmp(true)}><UserPlus /> Add Employee</Button>
          <Button variant="outline" className="h-12 flex-1" onClick={() => nav("/attendance")}><Clock /> Attendance</Button>
          <Button variant="outline" size="icon" className="size-12" onClick={() => setLeave(true)} aria-label="Record leave" title="Record leave"><Plus className="size-5!" /></Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:col-span-6">
        <StatCard title="Headcount" value={num(k.headcount)} icon={UsersRound} tone="brand" footer={<span className="text-theme-sm text-gray-500 dark:text-gray-400"><span className="font-medium text-success-600 dark:text-success-500">+{num(k.new_hires_month)}</span> joined this month · {num(k.exits_year)} left this year</span>} />
        <StatCard title="Present Today" value={k.working_day ? num(k.present_today) : "—"} icon={UserCheck} tone="success" footer={<span className="flex items-center gap-2 text-theme-sm text-gray-500 dark:text-gray-400">{k.working_day ? <><Ring value={attendRate} /> {attendRate}% attendance{k.late_today ? ` · ${k.late_today} late` : ""}</> : "Not a working day"}</span>} />
        <StatCard title="On Leave Today" value={num(k.on_leave_today)} icon={CalendarOff} tone="orange" footer={<span className="text-theme-sm text-gray-500 dark:text-gray-400">{k.pending_leave ? <><span className="font-medium text-warning-600 dark:text-white">{num(k.pending_leave)}</span> request{k.pending_leave > 1 ? "s" : ""} awaiting approval</> : "No pending requests"}</span>} />
        <StatCard title="Open Positions" value={num(k.open_positions)} icon={Briefcase} tone="pink" footer={<span className="text-theme-sm text-gray-500 dark:text-gray-400">{num(k.candidates_active)} candidate{k.candidates_active === 1 ? "" : "s"} in the pipeline</span>} />
      </div>

      {/* Hires vs exits */}
      <div className="col-span-12 xl:col-span-8">
        <div className="lf-card flex h-full flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Headcount Overview</h3>
            <ChipSelect value={String(year)} onChange={(v) => setYear(Number(v))} options={data.years.map((y) => ({ value: String(y), label: String(y) }))} />
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Current headcount</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-title-sm font-semibold text-gray-800 dark:text-white/90">{num(k.headcount)}</span>
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-theme-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-500">+{chart.reduce((s, m) => s + m.hires, 0)} hired in {data.year}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-theme-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c.primary }} /> Hires</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: c.secondary }} /> Exits</span>
            </div>
          </div>
          <div className="mt-4 min-h-[300px] flex-1">
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              <BarChart data={chart} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barSize={22}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#667085", fontSize: 12 }} />
                <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip />} />
                <Bar dataKey="hires" name="Hires" stackId="a" fill={c.primary} />
                <Bar dataKey="exits" name="Exits" stackId="a" fill={c.secondary} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Company card + pending leave + on leave */}
      <div className="col-span-12 xl:col-span-4">
        <div className="lf-card h-full p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">My Company</h3>
            <Button variant="outline" size="sm" onClick={() => setAddEmp(true)}><Plus /> Add</Button>
          </div>
          <div className="relative mt-5 overflow-hidden rounded-2xl bg-gray-900 p-5 text-white dark:bg-[#141414]">
            <div className="absolute -right-6 -top-10 size-36 rounded-3xl bg-white/[0.04]" />
            <div className="absolute -right-16 top-10 size-36 rounded-3xl bg-white/[0.03]" />
            <div className="relative flex items-start justify-between"><span className="rounded-full bg-success-500/15 px-2.5 py-0.5 text-theme-xs font-medium text-success-500">Active</span><LogoMark className="size-8" /></div>
            <p className="relative mt-6 truncate text-lg font-semibold">{data.company.name}</p>
            <div className="relative mt-5 flex items-end justify-between gap-3 text-theme-xs">
              <div><p className="text-white/50">Employees</p><p className="mt-0.5 text-sm font-medium">{k.headcount}</p></div>
              <div><p className="text-white/50">Departments</p><p className="mt-0.5 text-sm font-medium">{data.company.departments}</p></div>
              <div><p className="text-white/50">Admins</p><p className="mt-0.5 text-sm font-medium">{data.company.members}</p></div>
              <div><p className="text-white/50">Since</p><p className="mt-0.5 text-sm font-medium">{dt(data.company.created_at, "MM/yy")}</p></div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between">
            <h4 className="text-base font-medium text-gray-800 dark:text-white/90">Pending Leave</h4>
            <div className="flex gap-2">
              <button disabled={pi === 0} onClick={() => setPi(pi - 1)} className="flex size-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-40 dark:border-gray-800" aria-label="Previous"><ChevronLeft className="size-4" /></button>
              <button disabled={pi >= data.pending_leave.length - 1} onClick={() => setPi(pi + 1)} className="flex size-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-40 dark:border-gray-800" aria-label="Next"><ChevronRight className="size-4" /></button>
            </div>
          </div>
          {pending ? (
            <div className="mt-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Avatar name={pending.employee_name ?? "?"} />
                <div className="min-w-0 flex-1"><p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{pending.employee_name}</p><p className="truncate text-theme-xs text-gray-500">{pending.leave_type} · {pending.days} day{pending.days === 1 ? "" : "s"} from {dt(pending.start_date + "T00:00:00", "MMM d")}</p></div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="xs" className="flex-1" onClick={() => decide.mutate({ id: pending.id, status: "approved" })}><Check /> Approve</Button>
                <Button size="xs" variant="outline" className="flex-1" onClick={() => decide.mutate({ id: pending.id, status: "rejected" })}><X /> Reject</Button>
              </div>
            </div>
          ) : <p className="mt-3 rounded-xl border border-dashed border-gray-200 p-4 text-center text-theme-sm text-gray-500 dark:border-gray-800">No leave requests waiting.</p>}
          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between"><p className="text-theme-xs text-gray-500 dark:text-gray-400">Out of office today</p><Link to="/leave" className="text-theme-xs text-brand-500">View all</Link></div>
            {!data.on_leave_today.length ? <p className="py-3 text-center text-theme-sm text-gray-500">Everyone is in today.</p> : (
              <ul className="space-y-1">
                {data.on_leave_today.slice(0, 5).map((p) => (
                  <li key={p.id}><Link to={`/employees/${p.id}`} className="flex items-center gap-3 rounded-lg py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.03]"><Avatar name={p.name} className="size-8 text-[10px]" /><span className="flex-1 truncate text-theme-sm text-gray-800 dark:text-white/90">{p.name}</span><span className="text-theme-xs text-gray-500">{p.type}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Attendance trend */}
      <div className="col-span-12 xl:col-span-8">
        <div className="lf-card h-full p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Attendance</h3><p className="text-theme-sm text-gray-500 dark:text-gray-400">Last 14 working days</p></div><Button variant="outline" size="sm" asChild><Link to="/attendance">Open register</Link></Button></div>
          <div className="mt-4 h-[240px]">
            {data.attendance_trend.every((d) => !d.present && !d.absent && !d.on_leave) ? <div className="flex h-full items-center justify-center text-sm text-gray-400">No attendance recorded yet.</div> : (
              <ResponsiveContainer>
                <BarChart data={data.attendance_trend.map((d) => ({ ...d, name: dt(d.date + "T00:00:00", "MMM d") }))} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barSize={16}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#667085", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip />} />
                  <Bar dataKey="present" name="Present" stackId="a" fill={c.primary} />
                  <Bar dataKey="on_leave" name="On leave" stackId="a" fill={c.secondary} />
                  <Bar dataKey="absent" name="Absent" stackId="a" fill={c.dark ? "#525252" : "#f04438"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Upcoming */}
      <div className="col-span-12 xl:col-span-4">
        <div className="lf-card h-full p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Coming Up</h3>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">Birthdays, work anniversaries and interviews</p>
          {!upcoming.length ? <p className="py-10 text-center text-theme-sm text-gray-500">Nothing in the next 30 days.</p> : (
            <ul className="mt-4 space-y-1">
              {upcoming.map((u) => (
                <li key={u.key}><Link to={u.to} className="flex items-center gap-3 rounded-lg py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"><u.icon className="size-4" /></span><span className="flex-1 truncate text-theme-sm text-gray-800 dark:text-white/90">{u.title}</span><span className="shrink-0 text-theme-xs text-gray-500">{u.date.length > 10 ? relDay(u.date) : dt(u.date + "T00:00:00", "MMM d")}</span></Link></li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Departments + recent hires */}
      <div className="col-span-12 xl:col-span-4">
        <div className="lf-card h-full p-5 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">By Department</h3>
          {!data.departments.length ? <p className="py-10 text-center text-theme-sm text-gray-500"><Link to="/departments" className="text-brand-500">Create departments</Link> to group your team.</p> : (
            <ul className="mt-5 space-y-4">
              {data.departments.map((d) => (
                <li key={d.name}>
                  <div className="mb-1.5 flex justify-between text-theme-sm"><span className="text-gray-700 dark:text-gray-300">{d.name}</span><span className="font-medium text-gray-800 dark:text-white/90">{d.count}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.count / maxDept) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="col-span-12 xl:col-span-8">
        <div className="lf-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent Hires</h3><p className="text-theme-sm text-gray-500 dark:text-gray-400">Newest members of your team</p></div><Button variant="outline" size="sm" asChild><Link to="/employees">See all</Link></Button></div>
          {!data.recent_hires.length ? <div className="px-6 py-12 text-center"><p className="text-sm text-gray-500">No employees yet.</p><Button className="mt-4" size="sm" onClick={() => setAddEmp(true)}><UserPlus /> Add employee</Button></div> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"><th className="px-6 py-3 font-medium">Employee</th><th className="px-4 py-3 font-medium">Department</th><th className="px-6 py-3 text-right font-medium">Joined</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.recent_hires.map((h) => (
                    <tr key={h.id} className="text-theme-sm">
                      <td className="px-6 py-3"><Link to={`/employees/${h.id}`} className="flex items-center gap-3"><Avatar name={h.name} /><span><span className="block font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{h.name}</span><span className="block text-theme-xs text-gray-500">{h.job_title ?? "—"}</span></span></Link></td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{h.department ?? "—"}</td>
                      <td className="px-6 py-3 text-right text-gray-500 dark:text-gray-400">{dt(h.join_date + "T00:00:00")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <EmployeeFormModal open={addEmp} onOpenChange={setAddEmp} />
      <LeaveRequestModal open={leave} onOpenChange={setLeave} />
    </div>
  );
}
