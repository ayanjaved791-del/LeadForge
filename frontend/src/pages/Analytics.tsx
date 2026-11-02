import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useChartColors } from "@/hooks/use-chart-colors";
import { dt, money, num } from "@/lib/format";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { ErrorState, Loading } from "@/components/shared/States";

interface Data {
  months: number;
  series: { period: string; headcount: number; hires: number; exits: number; attendance_rate: number | null; payroll: number | null }[];
  headcount: number;
  turnover_rate: number | null;
  avg_tenure_years: number | null;
  by_department: { name: string; value: number }[];
  by_type: { name: string; value: number }[];
  by_gender: { name: string; value: number }[];
  leave_by_type: { name: string; value: number }[];
  funnel: { stage: string; count: number }[];
  time_to_hire_days: number | null;
  avg_review_score: number | null;
  reviews_completed: number;
}
const LIGHT = ["#465fff", "#12b76a", "#f79009", "#ee46bc", "#7a5af8", "#0ba5ec", "#98a2b3"];
const DARK = ["#fafafa", "#a3a3a3", "#737373", "#525252", "#d4d4d4", "#404040", "#e5e5e5"];
const axis = { axisLine: false, tickLine: false, tick: { fill: "#667085", fontSize: 12 } };
function Tip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-theme-md dark:border-gray-800 dark:bg-gray-dark">
      {label && <p className="mb-1 font-medium text-gray-800 dark:text-white/90">{label}</p>}
      {payload.map((p: any) => <p key={p.name} className="flex items-center gap-2 text-gray-500"><span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />{p.name}: <span className="font-medium text-gray-800 dark:text-white/90">{fmt ? fmt(p.value) : num(p.value)}</span></p>)}
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <div className="flex h-full min-h-[180px] items-center justify-center text-center text-sm text-gray-400">{text}</div>;

function Donut({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  if (!data.length) return <Empty text="No data yet." />;
  return (
    <>
      <div className="h-[170px]"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2} stroke="none">{data.map((d, i) => <Cell key={d.name} fill={colors[i % colors.length]} />)}</Pie><Tooltip content={<Tip />} /></PieChart></ResponsiveContainer></div>
      <ul className="mt-3 space-y-1.5">{data.map((d, i) => <li key={d.name} className="flex items-center justify-between text-theme-sm"><span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><span className="size-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />{d.name}</span><span className="font-medium text-gray-800 dark:text-white/90">{d.value}</span></li>)}</ul>
    </>
  );
}

export default function Analytics() {
  const [months, setMonths] = useState("12");
  const c = useChartColors();
  const palette = c.dark ? DARK : LIGHT;
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["analytics", months], queryFn: () => api.get<Data>("/analytics", { months }) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;
  const series = data.series.map((s) => ({ ...s, label: dt(s.period + "-01T00:00:00", "MMM yy") }));
  const hires = series.reduce((a, s) => a + s.hires, 0);
  const exits = series.reduce((a, s) => a + s.exits, 0);
  const attended = series.filter((s) => s.attendance_rate !== null);
  const funnelMax = Math.max(1, ...data.funnel.map((f) => f.count));
  return (
    <>
      <PageHeader title="Analytics" description="Workforce insights calculated live from your HR data." actions={<ChipSelect value={months} onChange={setMonths} options={[{ value: "6", label: "Last 6 months" }, { value: "12", label: "Last 12 months" }, { value: "24", label: "Last 24 months" }]} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
        {[
          ["Headcount", num(data.headcount), `${hires} hired · ${exits} left in period`],
          ["Turnover (12 mo)", data.turnover_rate !== null ? `${data.turnover_rate}%` : "—", "exits ÷ average headcount"],
          ["Average tenure", data.avg_tenure_years !== null ? `${data.avg_tenure_years} yrs` : "—", "current employees"],
          ["Attendance rate", attended.length ? `${(attended.reduce((a, s) => a + (s.attendance_rate ?? 0), 0) / attended.length).toFixed(1)}%` : "—", "of marked days"],
          ["Time to hire", data.time_to_hire_days !== null ? `${data.time_to_hire_days} days` : "—", "application → hired"],
          ["Avg. review score", data.avg_review_score !== null ? `${data.avg_review_score} / 5` : "—", `${data.reviews_completed} completed reviews`],
          ["Leave taken", num(data.leave_by_type.reduce((a, l) => a + l.value, 0)), `approved days in ${new Date().getFullYear()}`],
          ["Payroll in period", money(series.reduce((a, s) => a + (s.payroll ?? 0), 0)), "net pay of payroll runs"],
        ].map(([l, v, s]) => (
          <div key={l} className="lf-card p-5"><p className="text-theme-sm text-gray-500 dark:text-gray-400">{l}</p><p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{v}</p><p className="mt-1 text-theme-xs text-gray-400">{s}</p></div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card title="Headcount trend" description="Employees at the end of each month" className="col-span-12 xl:col-span-8">
          <div className="h-[280px]">
            {series.every((s) => !s.headcount) ? <Empty text="Add employees to see your headcount trend." /> : (
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs><linearGradient id="hc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.primary} stopOpacity={0.25} /><stop offset="100%" stopColor={c.primary} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="headcount" name="Headcount" stroke={c.primary} strokeWidth={2} fill="url(#hc)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="By department" className="col-span-12 md:col-span-6 xl:col-span-4"><Donut data={data.by_department} colors={palette} /></Card>
        <Card title="Hires & exits" className="col-span-12 xl:col-span-8">
          <div className="h-[260px]">
            {!hires && !exits ? <Empty text="No hires or exits in this period." /> : (
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip />} />
                  <Bar dataKey="hires" name="Hires" fill={c.primary} radius={[4, 4, 0, 0]} barSize={14} />
                  <Bar dataKey="exits" name="Exits" fill={c.secondary} radius={[4, 4, 0, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Employment type" className="col-span-12 md:col-span-6 xl:col-span-4"><Donut data={data.by_type} colors={palette} /></Card>
        <Card title="Attendance rate" description="Share of marked days that were present, late, remote or half day" className="col-span-12 xl:col-span-8">
          <div className="h-[240px]">
            {!attended.length ? <Empty text="Mark attendance to see the trend." /> : (
              <ResponsiveContainer>
                <LineChart data={series} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<Tip fmt={(v: number) => `${v}%`} />} />
                  <Line type="monotone" dataKey="attendance_rate" name="Attendance" stroke={c.primary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Leave by type" description={`Approved days in ${new Date().getFullYear()}`} className="col-span-12 md:col-span-6 xl:col-span-4"><Donut data={data.leave_by_type} colors={palette} /></Card>
        <Card title="Payroll cost" description="Net pay per payroll run" className="col-span-12 xl:col-span-8">
          <div className="h-[240px]">
            {series.every((s) => !s.payroll) ? <Empty text="Run payroll to see costs over time." /> : (
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 5, right: 5, left: -5, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: "compact" }).format(v)} />
                  <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip fmt={(v: number) => money(v)} />} />
                  <Bar dataKey="payroll" name="Net pay" fill={c.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card title="Recruitment funnel" description="Candidates that reached each stage" className="col-span-12 md:col-span-6 xl:col-span-4">
          {!data.funnel[0].count ? <Empty text="Add candidates to see the funnel." /> : (
            <ul className="space-y-3">
              {data.funnel.map((f) => (
                <li key={f.stage}>
                  <div className="mb-1 flex justify-between text-theme-sm"><span className="capitalize text-gray-700 dark:text-gray-300">{f.stage}</span><span className="text-gray-500">{f.count}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5"><div className="h-full rounded-full bg-brand-500" style={{ width: `${(f.count / funnelMax) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {!!data.by_gender.length && <Card title="Gender" description="Where provided on employee profiles" className="col-span-12 md:col-span-6 xl:col-span-4"><Donut data={data.by_gender} colors={palette} /></Card>}
      </div>
    </>
  );
}
