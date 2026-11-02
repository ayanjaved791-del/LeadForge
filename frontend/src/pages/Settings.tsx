import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { COUNTRIES } from "@/lib/constants";
import { dt, initials, num, titleCase } from "@/lib/format";
import type { UsageRow } from "@/lib/types";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { Field, NativeSelect, TextInput } from "@/components/shared/Form";
import { Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "NGN", "ZAR", "BDT", "TRY", "BRL", "MXN"];
const METRIC_LABEL: Record<string, string> = { discovery_search: "Discovery searches", website_check: "Website checks", website_audit: "Website audits", lead_export: "CSV exports" };

function Profile() {
  const me = useMe();
  const u = me.user;
  const [f, setF] = useState({ name: u.name, job_title: u.job_title ?? "", company: u.company ?? "", phone: u.phone ?? "", timezone: u.timezone, currency: u.currency, default_city: u.default_city ?? "", default_country: u.default_country ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutate((b: typeof f) => api.patch("/auth/profile", Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v === "" ? null : v]))), { success: "Profile saved", invalidate: [["me"], ["dashboard"]], onFieldErrors: setErrors });
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [u.timezone];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Profile" description={`Signed in as ${u.email}${u.email_verified_at ? " · verified" : " · not verified"}`}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(f); }} className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}><TextInput value={f.name} onChange={set("name")} required /></Field>
        <Field label="Job title"><TextInput value={f.job_title} onChange={set("job_title")} /></Field>
        <Field label="Company"><TextInput value={f.company} onChange={set("company")} /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Default city" hint="Pre-fills discovery searches"><TextInput value={f.default_city} onChange={set("default_city")} /></Field>
        <Field label="Default country">
          <NativeSelect value={f.default_country} onChange={set("default_country")}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Timezone" error={errors.timezone}>
          <NativeSelect value={f.timezone} onChange={set("timezone")}>
            {zones.map((z) => <option key={z}>{z}</option>)}
            {!zones.includes("UTC") && <option>UTC</option>}
          </NativeSelect>
        </Field>
        <Field label="Currency">
          <NativeSelect value={f.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </NativeSelect>
        </Field>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" disabled={save.isPending}>Save changes</Button></div>
      </form>
    </Card>
  );
}

function Password() {
  const [f, setF] = useState({ current_password: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setErrors({ confirm: "Passwords do not match." });
    setBusy(true);
    setErrors({});
    try {
      await api.post("/auth/password", { current_password: f.current_password, password: f.password });
      toast.success("Password changed");
      setF({ current_password: "", password: "", confirm: "" });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Change password" description="Use at least 8 characters with letters and numbers.">
      <form onSubmit={submit} className="max-w-md space-y-4">
        <Field label="Current password" error={errors.current_password}><TextInput type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} required /></Field>
        <Field label="New password" error={errors.password}><TextInput type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        <Field label="Confirm new password" error={errors.confirm}><TextInput type="password" autoComplete="new-password" minLength={8} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
        <Button type="submit" disabled={busy}>Update password</Button>
      </form>
    </Card>
  );
}

function Workspace() {
  const me = useMe();
  const canManage = me.workspace.role !== "member";
  const [name, setName] = useState(me.workspace.name);
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const members = useQuery({ queryKey: ["members"], queryFn: () => api.get<{ id: string; user_id: string; name: string; email: string; role: string; created_at: string }[]>("/workspace/members") });
  const rename = useMutate((n: string) => api.patch("/workspace", { name: n }), { success: "Workspace renamed", invalidate: [["me"], ["dashboard"]] });
  const add = useMutate((b: typeof invite) => api.post("/workspace/members", b), { success: "Member added", invalidate: [["members"]], onFieldErrors: setErrors, onSuccess: () => setInvite({ email: "", role: "member" }) });
  const remove = useMutate((id: string) => api.delete(`/workspace/members/${id}`), { success: "Member removed", invalidate: [["members"]] });
  return (
    <div className="space-y-6">
      <Card title="Workspace">
        <form onSubmit={(e) => { e.preventDefault(); rename.mutate(name); }} className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Workspace name" className="flex-1"><TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} required minLength={2} /></Field>
          {canManage && <Button type="submit" disabled={rename.isPending || name === me.workspace.name}>Save</Button>}
        </form>
        <p className="mt-3 text-theme-xs text-gray-400">All leads, businesses and CRM data are isolated per workspace. Your role: <span className="capitalize">{me.workspace.role}</span>.</p>
      </Card>
      <Card title="Members" description="Members share this workspace's leads and CRM.">
        {canManage && (
          <form onSubmit={(e) => { e.preventDefault(); setErrors({}); add.mutate(invite); }} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field error={errors.email} className="flex-1"><TextInput type="email" placeholder="colleague@company.com (must have a LeadForge account)" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></Field>
            <NativeSelect value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className="sm:w-36">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </NativeSelect>
            <Button type="submit" disabled={add.isPending}><UserPlus /> Add</Button>
          </form>
        )}
        {members.isLoading ? <Loading className="py-6" /> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {members.data?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-brand-500/15">{initials(m.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{m.name}{m.user_id === me.user.id && " (you)"}</p>
                  <p className="truncate text-theme-xs text-gray-500">{m.email} · joined {dt(m.created_at)}</p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-theme-xs capitalize text-gray-600 dark:bg-white/5 dark:text-gray-400">{m.role}</span>
                {canManage && m.role !== "owner" && <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(m.id)} aria-label="Remove"><Trash2 /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Scoring() {
  const me = useMe();
  const canManage = me.workspace.role !== "member";
  const { data } = useQuery({ queryKey: ["scoring"], queryFn: () => api.get<{ rules: { key: string; label: string; description: string; points: number; default: number }[]; bands: { min: number; label: string }[] }>("/workspace/scoring") });
  const [points, setPoints] = useState<Record<string, number>>({});
  useEffect(() => {
    if (data) setPoints(Object.fromEntries(data.rules.map((r) => [r.key, r.points])));
  }, [data]);
  const save = useMutate((p: Record<string, number>) => api.put("/workspace/scoring", { points: p }), { success: "Scoring rules saved — all businesses were re-scored", invalidate: [["scoring"], ["businesses"], ["dashboard"], ["business"]] });
  if (!data) return <Loading />;
  return (
    <Card title="Opportunity scoring rules" description="A transparent, rule-based score from 0–100. Each matching signal adds its points. It estimates potential need for web services — it is not a probability of closing a deal.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800">
              <th className="py-3 pr-4 font-medium">Signal</th>
              <th className="py-3 pr-4 font-medium">Default</th>
              <th className="w-32 py-3 font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.rules.map((r) => (
              <tr key={r.key}>
                <td className="py-3 pr-4">
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{r.label}</p>
                  <p className="text-theme-xs text-gray-500">{r.description}</p>
                </td>
                <td className="py-3 pr-4 text-theme-sm text-gray-500">+{r.default}</td>
                <td className="py-3"><TextInput type="number" min={0} max={100} className="h-9" disabled={!canManage} value={points[r.key] ?? 0} onChange={(e) => setPoints({ ...points, [r.key]: Math.max(0, Math.min(100, Number(e.target.value))) })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-theme-xs text-gray-500">Bands: {data.bands.slice().reverse().map((b) => `${b.label} ≥ ${b.min}`).join(" · ")}</p>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPoints(Object.fromEntries(data.rules.map((r) => [r.key, r.default])))}>Reset to defaults</Button>
            <Button onClick={() => save.mutate(points)} disabled={save.isPending}>Save & re-score</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Plan() {
  const { data } = useQuery({ queryKey: ["workspace"], queryFn: () => api.get<{ subscription: { plan: string; status: string; current_period_start: string } | null; counts: Record<string, number>; usage: UsageRow[] }>("/workspace") });
  if (!data) return <Loading />;
  return (
    <Card title="Plan & usage" description="LeadForge is free and self-hosted. Monthly quotas protect the free OpenStreetMap services and your server. They reset on the 1st of every month.">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold uppercase text-brand-500 dark:bg-brand-500/15">{data.subscription?.plan ?? "free"}</span>
        <span className="text-sm capitalize text-gray-500">{data.subscription?.status}</span>
        <span className="text-sm text-gray-400">· {num(data.counts.members)} members · {num(data.counts.leads)} leads · {num(data.counts.businesses)} businesses</span>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2">
        {data.usage.map((u) => (
          <li key={u.metric}>
            <div className="mb-1.5 flex justify-between text-theme-sm">
              <span className="text-gray-700 dark:text-gray-300">{METRIC_LABEL[u.metric] ?? titleCase(u.metric)}</span>
              <span className="text-gray-500">{num(u.used)} / {num(u.limit)}</span>
            </div>
            <Progress value={Math.min(100, (u.used / Math.max(1, u.limit)) * 100)} className="h-2 bg-gray-100 dark:bg-white/5 [&>div]:bg-brand-500" />
          </li>
        ))}
      </ul>
      <p className="mt-6 text-theme-xs text-gray-400">Self-hosting? Adjust the quotas in <code>api/config.php</code> → <code>limits</code>. Map data © OpenStreetMap contributors (ODbL).</p>
    </Card>
  );
}

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "profile";
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-6 h-auto flex-wrap justify-start gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          {[["profile", "Profile"], ["security", "Password"], ["workspace", "Workspace & team"], ["scoring", "Scoring rules"], ["plan", "Plan & usage"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="security"><Password /></TabsContent>
        <TabsContent value="workspace"><Workspace /></TabsContent>
        <TabsContent value="scoring"><Scoring /></TabsContent>
        <TabsContent value="plan"><Plan /></TabsContent>
      </Tabs>
    </>
  );
}
