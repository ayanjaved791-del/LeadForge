import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  Compass,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Target,
  UsersRound,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { change, dt, getCurrency, money, num, relDay } from "@/lib/format";
import { LEAD_STATUSES } from "@/lib/constants";
import type { ActivityType, LeadStatus, UsageRow, WebsiteStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ChipSelect } from "@/components/shared/Form";
import { Ring, StatCard, Trend } from "@/components/shared/StatCard";
import { ErrorState, Loading } from "@/components/shared/States";
import { ScoreBadge, StatusBadge, WebsiteBadge } from "@/components/shared/Badges";
import { LogoMark } from "@/components/layout/Logo";
import { LeadFormModal } from "./leads/LeadFormModal";
import { TaskFormModal } from "./crm/TaskFormModal";

interface DashboardData {
  kpi: Record<string, number> & { conversion_rate: number | null };
  businesses: { total: number; no_website: number; inactive: number; high_opportunity: number; d30: number };
  follow_ups: { overdue: number; pending: number; today: number };
  monthly: { month: number; leads: number; won: number; lost: number; revenue: number }[];
  year: number;
  years: number[];
  daily: { date: string; leads: number; value: number }[];
  upcoming_follow_ups: { id: string; lead_id: string; due_at: string; channel: string; note: string | null; lead_name: string }[];
  recent_activity: { id: string; lead_id: string; type: ActivityType; subject: string | null; body: string | null; occurred_at: string; lead_name: string; deal_value: number; status: LeadStatus }[];
  top_opportunities: { id: string; name: string; category_label: string; city: string | null; opportunity_score: number; website_status: WebsiteStatus; lead_id: string | null }[];
  workspace: { name: string; created_at: string; plan: string; status: string; members: number };
  usage: UsageRow[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "NGN", "ZAR", "BDT", "TRY", "BRL", "MXN"];
const ACT_ICON: Record<string, LucideIcon> = { call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle, note: ClipboardPlus, status_change: ArrowUpRight };

function ChartTooltip({ active, payload, label, valueFmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-theme-md dark:border-gray-800 dark:bg-gray-dark">
      <p className="mb-1 font-medium text-gray-800 dark:text-white/90">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <span className="size-2 rounded-full" style={{ background: p.color || p.fill }} /> {p.name}: <span className="font-medium text-gray-800 dark:text-white/90">{valueFmt ? valueFmt(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const me = useMe();
  const navigate = useNavigate();
  const [year, setYear] = useState(new Date().getFullYear());
  const [range, setRange] = useState("30");
  const [metric, setMetric] = useState<"flow" | "revenue">("flow");
  const [fuIndex, setFuIndex] = useState(0);
  const [leadOpen, setLeadOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["dashboard", year], queryFn: () => api.get<DashboardData>("/dashboard", { year }) });
  const setCurrencyM = useMutate((c: string) => api.patch("/auth/profile", { currency: c }), { invalidate: [["me"], ["dashboard"]] });

  const spark = useMemo(() => {
    if (!data) return [];
    const slice = data.daily.slice(-Number(range));
    let acc = 0;
    return slice.map((d) => ({ date: dt(d.date + "T00:00:00Z", "MMM d"), value: (acc += d.value) }));
  }, [data, range]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={refetch} />;

  const k = data.kpi;
  const openDeals = k.total_leads - k.won - k.lost;
  const closed = k.won + k.lost;
  const yearRevenue = data.monthly.reduce((s, m) => s + m.revenue, 0);
  const yearWon = data.monthly.reduce((s, m) => s + m.won, 0);
  const chartData = data.monthly.map((m) => ({ name: MONTHS[m.month - 1], leads: m.leads, won: m.won, revenue: m.revenue }));
  const fu = data.upcoming_follow_ups[fuIndex] ?? null;

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* ---------- Pipeline value ---------- */}
      <div className="col-span-12 space-y-4 xl:col-span-6">
        <div className="lf-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Pipeline Value</h3>
              <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">Open deals across active stages</p>
            </div>
            <div className="flex items-center gap-2">
              <ChipSelect value={getCurrency()} onChange={(c) => setCurrencyM.mutate(c)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              <ChipSelect value={range} onChange={setRange} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-semibold tracking-tight text-gray-800 dark:text-white/90">
                {new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(k.pipeline_value)}
              </p>
              <div className="mt-2">
                <Trend value={change(k.leads_30d, k.leads_prev_30d)} suffix="leads vs prior 30 days" />
              </div>
            </div>
            <div className="h-[70px] w-full max-w-[220px]">
              {spark.some((s) => s.value > 0) ? (
                <ResponsiveContainer>
                  <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#465fff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#465fff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip content={<ChartTooltip valueFmt={(v: number) => money(v)} />} />
                    <Area type="monotone" dataKey="value" name="Added value" stroke="#465fff" strokeWidth={2} fill="url(#spark)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-end text-xs text-gray-400">No deal value added in this period</div>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800">
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              Open deals: <span className="font-medium text-gray-800 dark:text-white/90">{num(openDeals)}</span>
              <span className="mx-2 text-gray-300 dark:text-gray-700">•</span>
              Follow-ups due today: <span className="font-medium text-gray-800 dark:text-white/90">{num(data.follow_ups.today)}</span>
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/pipeline">See Details</Link>
            </Button>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="h-12 flex-1" onClick={() => navigate("/discover")}>
            <Compass /> Discover
          </Button>
          <Button variant="outline" className="h-12 flex-1" onClick={() => setLeadOpen(true)}>
            <UsersRound /> Add Lead
          </Button>
          <Button variant="outline" size="icon" className="size-12" onClick={() => setTaskOpen(true)} aria-label="New task" title="New task">
            <Plus className="size-5!" />
          </Button>
        </div>
      </div>

      {/* ---------- KPI grid ---------- */}
      <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:col-span-6">
        <StatCard
          title="Discovered Businesses"
          value={num(data.businesses.total)}
          icon={Building2}
          tone="brand"
          footer={
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-success-600 dark:text-success-500">{num(data.businesses.high_opportunity)}</span> high-opportunity businesses
            </span>
          }
        />
        <StatCard title="Saved Leads" value={num(k.total_leads)} icon={UsersRound} tone="success" footer={<Trend value={change(k.leads_30d, k.leads_prev_30d)} suffix="vs prior 30 days" />} />
        <StatCard title="Revenue Won" value={money(k.revenue)} icon={Wallet} tone="orange" footer={<Trend value={change(k.revenue_30d, k.revenue_prev_30d)} suffix="vs prior 30 days" />} />
        <StatCard
          title="Conversion Rate"
          value={k.conversion_rate === null ? "—" : `${k.conversion_rate}%`}
          icon={Target}
          tone="pink"
          footer={
            <span className="flex items-center gap-2 text-theme-sm text-gray-500 dark:text-gray-400">
              <Ring value={k.conversion_rate ?? 0} />
              {closed > 0 ? `Won ${num(k.won)} of ${num(closed)} closed deals` : "No closed deals yet"}
            </span>
          }
        />
      </div>

      {/* ---------- Lead flow chart ---------- */}
      <div className="col-span-12 xl:col-span-8">
        <div className="lf-card flex h-full flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Lead Flow Overview</h3>
            <div className="flex items-center gap-2">
              <ChipSelect value={String(year)} onChange={(v) => setYear(Number(v))} options={data.years.map((y) => ({ value: String(y), label: String(y) }))} />
              <ChipSelect value={metric} onChange={(v) => setMetric(v as "flow" | "revenue")} options={[{ value: "flow", label: "Lead flow" }, { value: "revenue", label: "Revenue" }]} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Revenue won in {data.year}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-title-sm font-semibold text-gray-800 dark:text-white/90">{money(yearRevenue)}</span>
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-theme-xs font-medium text-success-600 dark:bg-success-500/15 dark:text-success-500">{num(yearWon)} won</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-theme-sm text-gray-500 dark:text-gray-400">
              {metric === "flow" ? (
                <>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-500" /> Leads added</span>
                  <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-300" /> Deals won</span>
                </>
              ) : (
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand-500" /> Revenue</span>
              )}
            </div>
          </div>
          <div className="mt-4 min-h-[300px] flex-1">
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }} barSize={22}>
                <CartesianGrid vertical={false} stroke="currentColor" className="text-gray-100 dark:text-gray-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#667085", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: "#667085", fontSize: 12 }} tickFormatter={(v) => (metric === "revenue" ? new Intl.NumberFormat(undefined, { notation: "compact" }).format(v) : v)} />
                <Tooltip cursor={{ fill: "rgba(70,95,255,0.06)" }} content={<ChartTooltip valueFmt={metric === "revenue" ? (v: number) => money(v) : undefined} />} />
                {metric === "flow" ? (
                  <>
                    <Bar dataKey="leads" name="Leads added" stackId="a" fill="#465fff" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="won" name="Deals won" stackId="a" fill="#9cb9ff" radius={[5, 5, 0, 0]} />
                  </>
                ) : (
                  <Bar dataKey="revenue" name="Revenue" fill="#465fff" radius={[5, 5, 0, 0]} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ---------- Workspace card + follow-ups + recent activity ---------- */}
      <div className="col-span-12 xl:col-span-4">
        <div className="lf-card h-full p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">My Workspace</h3>
            <Button variant="outline" size="sm" onClick={() => setLeadOpen(true)}>
              <Plus /> Add Lead
            </Button>
          </div>
          <div className="relative mt-5 overflow-hidden rounded-2xl bg-gray-900 p-5 text-white dark:bg-gray-800">
            <div className="absolute -right-6 -top-10 size-36 rounded-3xl bg-white/[0.04]" />
            <div className="absolute -right-16 top-10 size-36 rounded-3xl bg-white/[0.03]" />
            <div className="relative flex items-start justify-between">
              <span className="rounded-full bg-success-500/15 px-2.5 py-0.5 text-theme-xs font-medium capitalize text-success-500">{data.workspace.status ?? "active"}</span>
              <LogoMark className="size-8" />
            </div>
            <p className="relative mt-6 truncate text-lg font-semibold">{data.workspace.name}</p>
            <div className="relative mt-5 flex items-end justify-between gap-3 text-theme-xs">
              <div>
                <p className="text-white/50">Plan</p>
                <p className="mt-0.5 text-sm font-medium uppercase">{data.workspace.plan ?? "free"}</p>
              </div>
              <div>
                <p className="text-white/50">Members</p>
                <p className="mt-0.5 text-sm font-medium">{data.workspace.members}</p>
              </div>
              <div>
                <p className="text-white/50">Since</p>
                <p className="mt-0.5 text-sm font-medium">{dt(data.workspace.created_at, "MM/yy")}</p>
              </div>
              <div>
                <p className="text-white/50">Role</p>
                <p className="mt-0.5 text-sm font-medium capitalize">{me.workspace.role}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <h4 className="text-base font-medium text-gray-800 dark:text-white/90">Next Follow-up</h4>
            <div className="flex gap-2">
              <button disabled={fuIndex === 0} onClick={() => setFuIndex((i) => i - 1)} className="flex size-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-40 dark:border-gray-800" aria-label="Previous">
                <ChevronLeft className="size-4" />
              </button>
              <button disabled={fuIndex >= data.upcoming_follow_ups.length - 1} onClick={() => setFuIndex((i) => i + 1)} className="flex size-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 disabled:opacity-40 dark:border-gray-800" aria-label="Next">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
          {fu ? (
            <Link to={`/leads/${fu.lead_id}`} className="mt-3 flex items-center gap-3 rounded-xl border border-gray-100 p-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03]">
              <span className={`flex size-10 items-center justify-center rounded-full ${new Date(fu.due_at) < new Date() ? "bg-error-50 text-error-500 dark:bg-error-500/15" : "bg-brand-50 text-brand-500 dark:bg-brand-500/15"}`}>
                <CalendarClock className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{fu.lead_name}</span>
                <span className="block truncate text-theme-xs capitalize text-gray-500 dark:text-gray-400">{fu.channel}{fu.note ? ` · ${fu.note}` : ""}</span>
              </span>
              <span className={`shrink-0 text-theme-xs ${new Date(fu.due_at) < new Date() ? "text-error-500" : "text-gray-500 dark:text-gray-400"}`}>{relDay(fu.due_at)}</span>
            </Link>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-gray-200 p-4 text-center text-theme-sm text-gray-500 dark:border-gray-800">No pending follow-ups.</p>
          )}

          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-theme-xs text-gray-500 dark:text-gray-400">Recent Activity</p>
              <Link to="/activities" className="text-theme-xs text-brand-500">View all</Link>
            </div>
            {!data.recent_activity.length && <p className="py-4 text-center text-theme-sm text-gray-500">Log calls, emails and meetings on your leads to see them here.</p>}
            <ul className="space-y-1">
              {data.recent_activity.map((a) => {
                const Icon = ACT_ICON[a.type] ?? ClipboardPlus;
                return (
                  <li key={a.id}>
                    <Link to={`/leads/${a.lead_id}`} className="flex items-center gap-3 rounded-lg py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{a.lead_name}</span>
                        <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{a.type === "status_change" ? a.body : a.subject || a.type}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`block text-theme-sm font-medium ${a.status === "won" ? "text-success-600 dark:text-success-500" : "text-gray-800 dark:text-white/90"}`}>
                          {a.deal_value > 0 ? money(a.deal_value) : <StatusBadge status={a.status} />}
                        </span>
                        <span className="block text-theme-xs text-gray-400">{dt(a.occurred_at, "MMM d")}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* ---------- Top opportunities ---------- */}
      <div className="col-span-12 xl:col-span-8">
        <div className="lf-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Top Opportunities</h3>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Highest scoring businesses you have discovered</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/discover">See all</Link>
            </Button>
          </div>
          {data.top_opportunities.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-gray-500">Run your first discovery search to find businesses near you.</p>
              <Button className="mt-4" size="sm" onClick={() => navigate("/discover")}><Compass /> Discover businesses</Button>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-6 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Website</th>
                    <th className="px-4 py-3 font-medium">Score</th>
                    <th className="px-6 py-3 text-right font-medium">Lead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.top_opportunities.map((b) => (
                    <tr key={b.id} className="text-theme-sm">
                      <td className="px-6 py-3.5">
                        <p className="font-medium text-gray-800 dark:text-white/90">{b.name}</p>
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{b.city ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 dark:text-gray-400">{b.category_label}</td>
                      <td className="px-4 py-3.5"><WebsiteBadge status={b.website_status} /></td>
                      <td className="px-4 py-3.5"><ScoreBadge score={b.opportunity_score} /></td>
                      <td className="px-6 py-3.5 text-right">
                        {b.lead_id ? (
                          <Link to={`/leads/${b.lead_id}`} className="text-theme-sm font-medium text-brand-500">Open lead</Link>
                        ) : (
                          <Link to={`/discover?business=${b.id}`} className="text-theme-sm font-medium text-gray-500 hover:text-brand-500">Review</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Pipeline by stage ---------- */}
      <div className="col-span-12 xl:col-span-4">
        <PipelineStages />
      </div>

      <LeadFormModal open={leadOpen} onOpenChange={setLeadOpen} />
      <TaskFormModal open={taskOpen} onOpenChange={setTaskOpen} />
    </div>
  );
}

function PipelineStages() {
  const { data } = useQuery({ queryKey: ["analytics", 365], queryFn: () => api.get<{ statuses: { status: LeadStatus; count: number; value: number }[] }>("/analytics", { days: 365 }) });
  const max = Math.max(1, ...(data?.statuses.map((s) => s.count) ?? [1]));
  return (
    <div className="lf-card h-full p-5 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Pipeline by Stage</h3>
      <p className="text-theme-sm text-gray-500 dark:text-gray-400">Leads and deal value in each status</p>
      <ul className="mt-5 space-y-4">
        {LEAD_STATUSES.map((s) => {
          const row = data?.statuses.find((x) => x.status === s.key);
          return (
            <li key={s.key}>
              <div className="mb-1.5 flex items-center justify-between text-theme-sm">
                <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <span className={`size-2 rounded-full ${s.dot}`} /> {s.label}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  <span className="font-medium text-gray-800 dark:text-white/90">{row?.count ?? 0}</span> · {money(row?.value ?? 0, true)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                <div className={`h-full rounded-full ${s.dot}`} style={{ width: `${((row?.count ?? 0) / max) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
