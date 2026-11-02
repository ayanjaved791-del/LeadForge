import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import type { Holiday, Interview, LeaveRequest } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Feed { holidays: Holiday[]; leaves: LeaveRequest[]; interviews: Interview[]; birthdays: { employee_id: string; name: string; date: string }[]; anniversaries: { employee_id: string; name: string; date: string; years: number }[] }
type Item = { id: string; kind: keyof typeof STYLE; label: string; to?: string; faded?: boolean };
const STYLE = {
  holiday: "bg-violet-50 text-violet-700 dark:bg-white/[0.12] dark:text-white",
  leave: "bg-brand-50 text-brand-600 dark:bg-white/[0.06] dark:text-gray-200",
  interview: "bg-warning-50 text-warning-600 dark:bg-white/[0.06] dark:text-gray-200",
  birthday: "bg-pink-50 text-pink-600 dark:bg-white/[0.06] dark:text-gray-200",
  anniversary: "bg-success-50 text-success-700 dark:bg-white/[0.06] dark:text-gray-200",
};
const LABEL = { holiday: "Holiday", leave: "Leave", interview: "Interview", birthday: "Birthday", anniversary: "Work anniversary" };
const k = (d: Date) => format(d, "yyyy-MM-dd");

export default function Calendar() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const { data, isLoading } = useQuery({ queryKey: ["calendar", k(gridStart)], queryFn: () => api.get<Feed>("/calendar", { from: k(gridStart), to: k(gridEnd) }) });
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    const push = (day: string, it: Item) => m.set(day, [...(m.get(day) ?? []), it]);
    data?.holidays.forEach((h) => push(h.date, { id: h.id, kind: "holiday", label: h.name, to: "/holidays" }));
    data?.leaves.forEach((l) => { for (let d = l.start_date; d <= l.end_date; d = k(addDays(new Date(d + "T00:00:00"), 1))) push(d, { id: l.id + d, kind: "leave", label: `${l.employee_name} · ${l.leave_type}`, to: `/employees/${l.employee_id}`, faded: l.status === "pending" }); });
    data?.interviews.forEach((i) => push(k(new Date(i.scheduled_at)), { id: i.id, kind: "interview", label: `${format(new Date(i.scheduled_at), "h:mm a")} ${i.candidate_name}`, to: "/recruitment/candidates" }));
    data?.birthdays.forEach((b) => push(b.date, { id: "b" + b.employee_id + b.date, kind: "birthday", label: `${b.name}'s birthday`, to: `/employees/${b.employee_id}` }));
    data?.anniversaries.forEach((a) => push(a.date, { id: "a" + a.employee_id + a.date, kind: "anniversary", label: `${a.name} · ${a.years} yr${a.years > 1 ? "s" : ""}`, to: `/employees/${a.employee_id}` }));
    return m;
  }, [data]);
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  return (
    <>
      <PageHeader title="Calendar" />
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month"><ChevronLeft /></Button>
            <Button variant="outline" size="icon-sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight /></Button>
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
            <h3 className="ml-2 text-lg font-semibold text-gray-800 dark:text-white/90">{format(month, "MMMM yyyy")}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STYLE) as (keyof typeof STYLE)[]).map((s) => <span key={s} className={cn("rounded-full px-2.5 py-0.5 text-theme-xs font-medium", STYLE[s])}>{LABEL[s]}</span>)}
          </div>
        </div>
        {isLoading ? <Loading /> : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="border-b border-gray-100 py-3 text-center text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800">{d}</div>)}
              {days.map((d) => {
                const items = byDay.get(k(d)) ?? [];
                const today = isSameDay(d, new Date());
                return (
                  <div key={k(d)} className={cn("min-h-[118px] border-b border-r border-gray-100 p-2 dark:border-gray-800", !isSameMonth(d, month) && "bg-gray-50/50 dark:bg-white/[0.01]")}>
                    <span className={cn("mb-1 flex size-7 items-center justify-center rounded-full text-theme-sm", today ? "bg-brand-500 font-semibold text-white" : isSameMonth(d, month) ? "text-gray-700 dark:text-gray-300" : "text-gray-300 dark:text-gray-600")}>{format(d, "d")}</span>
                    <div className="space-y-1">
                      {items.slice(0, 4).map((i) => (
                        <Link key={i.id} to={i.to ?? "#"} title={i.label} className={cn("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium", STYLE[i.kind], i.faded && "opacity-60 ring-1 ring-dashed ring-current")}>{i.label}</Link>
                      ))}
                      {items.length > 4 && <p className="px-1.5 text-[11px] text-gray-400">+{items.length - 4} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-theme-xs text-gray-400">Pending leave requests are shown faded. Birthdays and anniversaries come from employee profiles.</p>
    </>
  );
}
