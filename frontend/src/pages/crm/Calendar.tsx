import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { CalendarEvent } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventFormModal } from "./EventFormModal";

interface Feed {
  events: CalendarEvent[];
  follow_ups: { id: string; lead_id: string; due_at: string; channel: string; note: string | null; status: string; lead_name: string }[];
  tasks: { id: string; lead_id: string | null; title: string; due_at: string; status: string; priority: string; lead_name: string | null }[];
}
type Item = { id: string; kind: "event" | "follow_up" | "task"; date: Date; label: string; to?: string; done?: boolean; event?: CalendarEvent };

const KIND_STYLE = {
  event: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400",
  follow_up: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400",
  task: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-500",
};

export default function Calendar() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [form, setForm] = useState<{ open: boolean; event?: CalendarEvent | null; date?: Date | null }>({ open: false });
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const { data, isLoading } = useQuery({
    queryKey: ["calendar", gridStart.toISOString()],
    queryFn: () => api.get<Feed>("/calendar", { from: gridStart.toISOString(), to: addDays(gridEnd, 1).toISOString() }),
  });

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    return [
      ...data.events.map((e) => ({ id: e.id, kind: "event" as const, date: new Date(e.starts_at), label: `${format(new Date(e.starts_at), "h:mm a")} ${e.title}`, event: e })),
      ...data.follow_ups.map((f) => ({ id: f.id, kind: "follow_up" as const, date: new Date(f.due_at), label: `${f.channel}: ${f.lead_name}`, to: `/leads/${f.lead_id}`, done: f.status !== "pending" })),
      ...data.tasks.map((t) => ({ id: t.id, kind: "task" as const, date: new Date(t.due_at), label: t.title, to: t.lead_id ? `/leads/${t.lead_id}` : "/tasks", done: t.status === "done" })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-3 text-theme-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-500" /> Events</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning-500" /> Follow-ups</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success-500" /> Tasks</span>
            </div>
            <Button size="sm" onClick={() => setForm({ open: true })}><Plus /> Add event</Button>
          </div>
        </div>
        {isLoading ? <Loading /> : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="border-b border-gray-100 py-3 text-center text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800">{d}</div>
              ))}
              {days.map((d) => {
                const dayItems = items.filter((i) => isSameDay(i.date, d));
                const today = isSameDay(d, new Date());
                return (
                  <div
                    key={d.toISOString()}
                    onClick={() => setForm({ open: true, date: d })}
                    className={cn("group min-h-[118px] cursor-pointer border-b border-r border-gray-100 p-2 hover:bg-gray-50/70 dark:border-gray-800 dark:hover:bg-white/[0.02]", !isSameMonth(d, month) && "bg-gray-50/50 dark:bg-white/[0.01]")}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className={cn("flex size-7 items-center justify-center rounded-full text-theme-sm", today ? "bg-brand-500 font-semibold text-white" : isSameMonth(d, month) ? "text-gray-700 dark:text-gray-300" : "text-gray-300 dark:text-gray-600")}>{format(d, "d")}</span>
                      <Plus className="invisible size-3.5 text-gray-400 group-hover:visible" />
                    </div>
                    <div className="space-y-1">
                      {dayItems.slice(0, 4).map((i) =>
                        i.kind === "event" ? (
                          <button key={i.id} onClick={(e) => { e.stopPropagation(); setForm({ open: true, event: i.event }); }} className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium", KIND_STYLE[i.kind])}>{i.label}</button>
                        ) : (
                          <Link key={i.id} to={i.to!} onClick={(e) => e.stopPropagation()} className={cn("block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize", KIND_STYLE[i.kind], i.done && "line-through opacity-60")}>{i.label}</Link>
                        ),
                      )}
                      {dayItems.length > 4 && <p className="px-1.5 text-[11px] text-gray-400">+{dayItems.length - 4} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <EventFormModal open={form.open} onOpenChange={(o) => setForm({ open: o })} event={form.event} defaultDate={form.date} />
    </>
  );
}
