import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useChartColors } from "@/hooks/use-chart-colors";
import { BANDS, LEAD_STATUSES, WEBSITE_STATUS } from "@/lib/constants";
import { dt, money, num } from "@/lib/format";
import type { LeadStatus, WebsiteStatus } from "@/lib/types";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { ErrorState, Loading } from "@/components/shared/States";

interface AnalyticsData {
  days: number;
  statuses: { status: LeadStatus; count: number; value: number }[];
  series: { date: string; leads: number; discovered: number; won: number; revenue: number }[];
  categories: { category: string; label: string; leads: number; won: number; revenue: number }[];
  website_status: { status: WebsiteStatus; count: number }[];
  score_bands: Record<string, number>;
  activity: { type: string; count: number }[];
  avg_sales_cycle_days: number | null;
  avg_deal_value: number | null;
  lost_reasons: { reason: string; count: number }[];
  tasks: { done: number; open: number; overdue: number };
}

const STATUS_HEX: Record<WebsiteStatus, string> = { available: "#12b76a", no_website: "#f04438", inactive: "#fb6514", needs_review: "#f79009", unknown: "#98a2b3" };
const BAND_HEX: Record<string, string> = { low: "#98a2b3", medium: "#465fff", high: "#f79009", very_high: "#12b76a" };
const axis = { axisLine: false, tickLine: false, tick: { fill: "#667085", fontSize: 12 } };

function Tip({ active, payload, label, money: isMoney }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-theme-md dark:border-gray-800 dark:bg-gray-dark">
      {label && <p className="mb-1 font-medium text-gray-800 dark:text-white/90">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2 text-gray-500">
          <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} /> {p.name}: <span className="font-medium text-gray-800 dark:text-white/90">{isMoney ? money(p.value) : num(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-gray-400">{text}</div>;
}

export default function Analytics() {
  const [days, setDays] = useState("90");
  const c = useChartColors();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["analytics", Number(days)], queryFn: () => api.get<AnalyticsData>("/analytics", { days }) });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const total = data.statuses.reduce((s, x) => s + x.count, 0);
  const won = data.statuses.find((s) => s.status === "won")!;
  const lost = data.statuses.find((s) => s.status === "lost")!;
  const funnel = LEAD_STATUSES.filter((s) => s.key !== "lost").map((s) => {
    const idx = LEAD_STATUSES.findIndex((x) => x.key === s.key);
    // Leads that reached at least this stage (current stage index ≥ this one, excluding lost).
    const reached = data.statuses.filter((x) => x.status !== "lost" && LEAD_STATUSES.findIndex((y) => y.key === x.status) >= idx).reduce((a, b) => a + b.count, 0);
    return { ...s, reached };
  });
  const series = data.series.map((s) => ({ ...s, label: dt(s.date + "T00:00:00Z", "MMM d") }));
  const periodLeads = data.series.reduce((a, b) => a + b.leads, 0);
  const periodDiscovered = data.series.reduce((a, b) => a + b.discovered, 0);
  const periodRevenue = data.series.reduce((a, b) => a + b.revenue, 0);
  const ws = data.website_status.map((w) => ({ name: WEBSITE_STATUS[w.status].label, value: w.count, fill: STATUS_HEX[w.status] }));
  const bands = Object.entries(data.score_bands).map(([k, v]) => ({ name: BANDS[k as keyof typeof BANDS].label.replace(" Opportunity", ""), value: v, fill: BAND_HEX[k] }));

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Every figure is calculated live from your workspace data."
        actions={<ChipSelect value={days} onChange={setDays} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }, { value: "180", label: "Last 180 days" }, { value: "365", label: "Last 12 months" }]} />}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 md:gap-6 lg:grid-cols-4">
        {[
          ["Businesses discovered", num(periodDiscovered), `in the last ${data.days} days`],
          ["Leads added", num(periodLeads), `in the last ${data.days} days`],
          ["Revenue won", money(periodRevenue), `in the last ${data.days} days`],
          ["Win rate", won.count + lost.count ? `${((won.count / (won.count + lost.count)) * 100).toFixed(1)}%` : "—", "won ÷ closed (all time)"],
          ["Avg. deal value", data.avg_deal_value !== null ? money(data.avg_deal_value) : "—", "won deals"],
          ["Avg. sales cycle", data.avg_sales_cycle_days !== null ? `${data.avg_sales_cycle_days} days` : "—", "lead created → won"],
          ["Open tasks", num(data.tasks.open), `${num(data.tasks.overdue)} overdue`],
          ["Total leads", num(total), `${num(won.count)} won · ${num(lost.count)} lost`],
        ].map(([l, v, s]) => (
          <div key={l} className="lf-card p-5">
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">{l}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{v}</p>
            <p className="mt-1 text-theme-xs text-gray-400">{s}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Card title="Lead generation" description="Businesses discovered and leads saved per day" className="col-span-12 xl:col-span-8">
          <div className="mb-3 flex gap-4 text-theme-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-300" /> Discovered</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-500" /> Leads saved</span>
          </div>
          <div className="h-[290px]">
            {periodDiscovered + periodLeads === 0 ? <Empty text="No discovery or lead activity in this period." /> : (
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.primary} stopOpacity={0.25} /><stop offset="100%" stopColor={c.primary} stopOpacity={0} /></linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.secondary} stopOpacity={0.3} /><stop offset="100%" stopColor={c.secondary} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="label" {...axis} minTickGap={30} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="discovered" name="Discovered" stroke={c.secondary} strokeWidth={2} fill="url(#g2)" />
                  <Area type="monotone" dataKey="leads" name="Leads saved" stroke={c.primary} strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Conversion funnel" description="Leads that reached each stage" className="col-span-12 xl:col-span-4">
          {total === 0 ? <Empty text="Save leads to see your funnel." /> : (
            <ul className="space-y-3">
              {funnel.map((s) => (
                <li key={s.key}>
                  <div className="mb-1 flex justify-between text-theme-sm">
                    <span className="text-gray-700 dark:text-gray-300">{s.label}</span>
                    <span className="text-gray-500">{num(s.reached)} <span className="text-gray-400">({total ? Math.round((s.reached / total) * 100) : 0}%)</span></span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                    <div className={`h-full rounded-full ${s.dot}`} style={{ width: `${total ? (s.reached / total) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
              <li className="pt-1 text-theme-xs text-gray-400">{num(lost.count)} lead(s) marked as lost are excluded.</li>
            </ul>
          )}
        </Card>

        <Card title="Revenue won" description="Deal value of leads marked as won" className="col-span-12 xl:col-span-8">
          <div className="h-[260px]">
            {periodRevenue === 0 ? <Empty text="No deals won in this period." /> : (
              <ResponsiveContainer>
                <BarChart data={series} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="label" {...axis} minTickGap={30} />
                  <YAxis {...axis} tickFormatter={(v) => new Intl.NumberFormat(undefined, { notation: "compact" }).format(v)} />
                  <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip money />} />
                  <Bar dataKey="revenue" name="Revenue" fill={c.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Website status" description="Across all discovered businesses" className="col-span-12 md:col-span-6 xl:col-span-4">
          {!ws.length ? <Empty text="No businesses discovered yet." /> : (
            <>
              <div className="h-[180px]">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={ws} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="none">
                      {ws.map((w) => <Cell key={w.name} fill={w.fill} />)}
                    </Pie>
                    <Tooltip content={<Tip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5">
                {ws.map((w) => (
                  <li key={w.name} className="flex items-center justify-between text-theme-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><span className="size-2.5 rounded-full" style={{ background: w.fill }} /> {w.name}</span>
                    <span className="font-medium text-gray-800 dark:text-white/90">{num(w.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Leads by category" className="col-span-12 md:col-span-6 xl:col-span-4">
          {!data.categories.length ? <Empty text="No leads yet." /> : (
            <ul className="space-y-3">
              {data.categories.map((c) => (
                <li key={c.category}>
                  <div className="mb-1 flex justify-between text-theme-sm">
                    <span className="text-gray-700 dark:text-gray-300">{c.label}</span>
                    <span className="text-gray-500">{num(c.leads)} · {num(c.won)} won</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${(c.leads / Math.max(...data.categories.map((x) => x.leads))) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Opportunity scores" description="Discovered businesses by score band" className="col-span-12 md:col-span-6 xl:col-span-4">
          <div className="h-[230px]">
            {bands.every((b) => !b.value) ? <Empty text="No businesses discovered yet." /> : (
              <ResponsiveContainer>
                <BarChart data={bands} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip cursor={{ fill: c.dark ? "rgba(255,255,255,0.05)" : "rgba(70,95,255,0.06)" }} content={<Tip />} />
                  <Bar dataKey="value" name="Businesses" radius={[4, 4, 0, 0]}>
                    {bands.map((b) => <Cell key={b.name} fill={c.dark && b.fill === "#465fff" ? c.primary : b.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Sales activity" description={`Logged in the last ${data.days} days`} className="col-span-12 md:col-span-6 xl:col-span-4">
          {!data.activity.length ? <Empty text="No calls, emails or meetings logged in this period." /> : (
            <ul className="space-y-3">
              {data.activity.map((a) => (
                <li key={a.type} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-theme-sm dark:bg-white/[0.03]">
                  <span className="capitalize text-gray-700 dark:text-gray-300">{a.type === "whatsapp" ? "WhatsApp" : `${a.type}s`}</span>
                  <span className="font-semibold text-gray-800 dark:text-white/90">{num(a.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Lost reasons" className="col-span-12 md:col-span-6 xl:col-span-4">
          {!data.lost_reasons.length ? <Empty text="Record a reason when marking a lead as lost to see patterns here." /> : (
            <ul className="space-y-2">
              {data.lost_reasons.map((r) => (
                <li key={r.reason} className="flex items-center justify-between text-theme-sm">
                  <span className="text-gray-700 dark:text-gray-300">{r.reason}</span>
                  <span className="rounded-full bg-error-50 px-2 py-0.5 text-theme-xs font-medium text-error-600 dark:bg-error-500/15">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
