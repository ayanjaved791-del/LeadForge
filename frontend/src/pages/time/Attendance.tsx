import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { ATTENDANCE } from "@/lib/constants";
import { dt } from "@/lib/format";
import type { AttendanceDay, AttendanceStatus } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, Loading } from "@/components/shared/States";
import { Avatar } from "@/components/shared/EmployeePicker";
import { Pill } from "@/components/shared/Badges";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (k: string, n: number) => { const [y, m, d] = k.split("-").map(Number); return key(new Date(y, m - 1, d + n)); };
const nowTime = () => new Date().toTimeString().slice(0, 5);
type Draft = { status: AttendanceStatus | null; check_in: string; check_out: string; note: string };
const MARKABLE: AttendanceStatus[] = ["present", "late", "remote", "half_day", "absent"];

function Daily() {
  const qc = useQueryClient();
  const [date, setDate] = useState(key(new Date()));
  const { data, isLoading } = useQuery({ queryKey: ["attendance", date], queryFn: () => api.get<AttendanceDay>("/attendance", { date }) });
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.rows.map((r) => [r.employee.id, { status: r.record?.status ?? null, check_in: r.record?.check_in ?? "", check_out: r.record?.check_out ?? "", note: r.record?.note ?? "" }])));
  }, [data]);
  const dirty = useMemo(() => data?.rows.filter((r) => {
    const d = draft[r.employee.id];
    return d && (d.status !== (r.record?.status ?? null) || d.check_in !== (r.record?.check_in ?? "") || d.check_out !== (r.record?.check_out ?? "") || d.note !== (r.record?.note ?? ""));
  }) ?? [], [data, draft]);
  const isToday = date === key(new Date());
  const future = date > key(new Date());
  const set = (id: string, patch: Partial<Draft>) => setDraft((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const markAll = (status: AttendanceStatus) => setDraft((p) => Object.fromEntries(Object.entries(p).map(([id, d]) => {
    const row = data?.rows.find((r) => r.employee.id === id);
    return [id, row?.leave || d.status ? d : { ...d, status, check_in: status === "absent" ? "" : d.check_in }];
  })));
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<{ saved: number }>("/attendance", { entries: dirty.map((row) => ({ employee_id: row.employee.id, date, ...draft[row.employee.id], check_in: draft[row.employee.id].check_in || null, check_out: draft[row.employee.id].check_out || null })) });
      toast.success(`Attendance saved for ${r.saved} employee${r.saved === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lf-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setDate(shift(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <input type="date" value={date} max={key(new Date())} onChange={(e) => e.target.value && setDate(e.target.value)} className="lf-input h-9 w-auto" />
          <Button variant="outline" size="icon-sm" onClick={() => setDate(shift(date, 1))} disabled={isToday} aria-label="Next day"><ChevronRight /></Button>
          {!isToday && <Button variant="ghost" size="sm" onClick={() => setDate(key(new Date()))}>Today</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-theme-sm text-gray-500">Mark unmarked as:</span>
          <Button size="xs" variant="outline" onClick={() => markAll("present")} disabled={future}>Present</Button>
          <Button size="xs" variant="outline" onClick={() => markAll("absent")} disabled={future}>Absent</Button>
          <Button size="sm" onClick={save} disabled={!dirty.length || saving || future}><Save /> Save{dirty.length ? ` (${dirty.length})` : ""}</Button>
        </div>
      </div>
      {data && (
        <div className="mx-5 mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-theme-sm font-medium text-gray-700 dark:text-gray-300">{dt(date + "T00:00:00", "EEEE, MMMM d, yyyy")}</span>
          {data.holiday && <Pill className="bg-violet-50 text-violet-700 dark:bg-white/[0.08] dark:text-gray-200">Holiday: {data.holiday}</Pill>}
          {!data.working_day && !data.holiday && <Pill className="bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400">Non-working day</Pill>}
          {Object.entries(data.summary).filter(([, v]) => v).map(([k, v]) => (
            <Pill key={k} className={k === "unmarked" ? "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" : ATTENDANCE[k as AttendanceStatus].color}>{k === "unmarked" ? "Not marked" : ATTENDANCE[k as AttendanceStatus].label}: {v}</Pill>
          ))}
        </div>
      )}
      <div className="mt-4">
        {isLoading ? <Loading /> : !data?.rows.length ? (
          <EmptyState icon={Clock} title="No employees on this date" description={<>Add employees first, then mark their attendance here. <Link to="/employees" className="text-brand-500">Go to employees</Link></>} />
        ) : future ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">Attendance can't be recorded for future dates.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-5 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Check in</th>
                  <th className="px-4 py-3 font-medium">Check out</th>
                  <th className="px-5 py-3 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.rows.map((r) => {
                  const d = draft[r.employee.id];
                  if (!d) return null;
                  return (
                    <tr key={r.employee.id} className="text-theme-sm">
                      <td className="px-5 py-3">
                        <Link to={`/employees/${r.employee.id}`} className="flex items-center gap-3">
                          <Avatar name={r.employee.full_name} />
                          <span><span className="block font-medium text-gray-800 dark:text-white/90">{r.employee.full_name}</span><span className="block text-theme-xs text-gray-500">{r.employee.job_title ?? r.employee.employee_code}</span></span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {r.leave && !d.status ? (
                          <Pill className={ATTENDANCE.on_leave.color}>On leave · {r.leave.type}</Pill>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {MARKABLE.map((s) => (
                              <button key={s} onClick={() => set(r.employee.id, { status: d.status === s ? null : s, check_in: s === "absent" ? "" : d.check_in || (isToday && (s === "present" || s === "late") ? nowTime() : d.check_in) })}
                                className={cn("rounded-full px-2.5 py-1 text-theme-xs font-medium transition", d.status === s ? ATTENDANCE[s].color + " ring-1 ring-current" : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]")}>
                                {ATTENDANCE[s].label}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3"><input type="time" value={d.check_in} disabled={!d.status || d.status === "absent"} onChange={(e) => set(r.employee.id, { check_in: e.target.value })} className="lf-input h-9 w-32 disabled:opacity-40" /></td>
                      <td className="px-4 py-3"><input type="time" value={d.check_out} disabled={!d.status || d.status === "absent"} onChange={(e) => set(r.employee.id, { check_out: e.target.value })} className="lf-input h-9 w-32 disabled:opacity-40" /></td>
                      <td className="px-5 py-3"><input value={d.note} onChange={(e) => set(r.employee.id, { note: e.target.value })} placeholder="Optional" maxLength={300} className="lf-input h-9" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="px-5 py-4 text-theme-xs text-gray-400">Employees who check in after the start time + grace period (Settings → Company) are marked Late automatically.</p>
    </div>
  );
}

interface MonthData { month: string; days: { date: string; working: boolean; holiday: string | null }[]; employees: { id: string; full_name: string; employee_code: string; cells: Record<string, AttendanceStatus>; totals: Record<string, number> }[] }

function Monthly() {
  const [month, setMonth] = useState(key(new Date()).slice(0, 7));
  const { data, isLoading } = useQuery({ queryKey: ["attendance", "month", month], queryFn: () => api.get<MonthData>("/attendance/month", { month }) });
  const move = (n: number) => { const [y, m] = month.split("-").map(Number); setMonth(key(new Date(y, m - 1 + n, 1)).slice(0, 7)); };
  return (
    <div className="lf-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Previous month"><ChevronLeft /></Button>
          <span className="min-w-36 text-center font-semibold text-gray-800 dark:text-white/90">{dt(month + "-01T00:00:00", "MMMM yyyy")}</span>
          <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Next month"><ChevronRight /></Button>
        </div>
        <div className="flex flex-wrap gap-3 text-theme-xs text-gray-500">
          {(Object.keys(ATTENDANCE) as AttendanceStatus[]).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-sm", ATTENDANCE[k].dot)} />{ATTENDANCE[k].label}</span>)}
        </div>
      </div>
      <div className="mt-4">
        {isLoading ? <Loading /> : !data?.employees.length ? <p className="px-5 py-10 text-center text-sm text-gray-500">No employees in this month.</p> : (
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-theme-xs">
              <thead>
                <tr className="text-gray-500">
                  <th className="sticky left-0 z-10 min-w-48 border-b border-gray-100 bg-gray-50 px-4 py-2 text-left font-medium dark:border-gray-800 dark:bg-[#0d0d0d]">Employee</th>
                  {data.days.map((d) => (
                    <th key={d.date} title={d.holiday ?? undefined} className={cn("border-b border-gray-100 px-0.5 py-2 text-center font-medium dark:border-gray-800", !d.working && "text-gray-300 dark:text-gray-600")}>
                      <span className="block text-[10px] uppercase">{dt(d.date + "T00:00:00", "EEEEE")}</span>{Number(d.date.slice(8))}
                    </th>
                  ))}
                  <th className="border-b border-gray-100 px-3 py-2 text-center font-medium dark:border-gray-800">Present</th>
                  <th className="border-b border-gray-100 px-3 py-2 text-center font-medium dark:border-gray-800">Absent</th>
                  <th className="border-b border-gray-100 px-3 py-2 text-center font-medium dark:border-gray-800">Leave</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id}>
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-4 py-2 dark:border-gray-800 dark:bg-[#0d0d0d]"><Link to={`/employees/${e.id}`} className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{e.full_name}</Link></td>
                    {data.days.map((d) => {
                      const s = e.cells[d.date];
                      return (
                        <td key={d.date} className={cn("border-b border-gray-100 p-0.5 text-center dark:border-gray-800", !d.working && "bg-gray-50/70 dark:bg-white/[0.02]")}>
                          {s ? <span title={ATTENDANCE[s].label} className={cn("mx-auto block size-5 rounded-md", ATTENDANCE[s].dot)} /> : <span className="mx-auto block size-5" />}
                        </td>
                      );
                    })}
                    <td className="border-b border-gray-100 px-3 py-2 text-center font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">{(e.totals.present ?? 0) + (e.totals.late ?? 0) + (e.totals.remote ?? 0) + (e.totals.half_day ?? 0) * 0.5}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-center text-gray-600 dark:border-gray-800 dark:text-gray-400">{e.totals.absent ?? 0}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-center text-gray-600 dark:border-gray-800 dark:text-gray-400">{e.totals.on_leave ?? 0}</td>
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

export default function Attendance() {
  return (
    <>
      <PageHeader title="Attendance" />
      <Tabs defaultValue="daily">
        <TabsList className="mb-5 h-auto gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          {[["daily", "Daily register"], ["monthly", "Monthly overview"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="daily"><Daily /></TabsContent>
        <TabsContent value="monthly"><Monthly /></TabsContent>
      </Tabs>
    </>
  );
}
