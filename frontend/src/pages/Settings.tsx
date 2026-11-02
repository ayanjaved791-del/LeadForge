import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, errorMessage, LOCAL_MODE } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { dt, initials } from "@/lib/format";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { Field, NativeSelect, TextInput } from "@/components/shared/Form";
import { Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "NGN", "ZAR", "BDT", "TRY", "BRL", "MXN"];

function Profile() {
  const me = useMe();
  const u = me.user;
  const [f, setF] = useState({ name: u.name, job_title: u.job_title ?? "", company: u.company ?? "", phone: u.phone ?? "", timezone: u.timezone, currency: u.currency, default_city: u.default_city ?? "", default_country: u.default_country ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutate((b: typeof f) => api.patch("/auth/profile", Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v === "" ? null : v]))), { success: "Profile saved", invalidate: [["me"], ["dashboard"]], onFieldErrors: setErrors });
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [u.timezone];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Card title="Profile" description={`Signed in as ${u.email}${LOCAL_MODE ? "" : u.email_verified_at ? " · verified" : " · not verified"}`}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(f); }} className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" error={errors.name}><TextInput value={f.name} onChange={set("name")} required /></Field>
        <Field label="Job title"><TextInput value={f.job_title} onChange={set("job_title")} /></Field>
        <Field label="Company"><TextInput value={f.company} onChange={set("company")} /></Field>
        <Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field>
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function Company() {
  const me = useMe();
  const canManage = me.workspace.role !== "member";
  const st = me.workspace.settings ?? {};
  const [f, setF] = useState({ name: me.workspace.name, work_start: st.work_start ?? "09:00", late_after_minutes: String(st.late_after_minutes ?? 15), work_days: st.work_days ?? [1, 2, 3, 4, 5] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [ierrors, setIErrors] = useState<Record<string, string>>({});
  const members = useQuery({ queryKey: ["members"], queryFn: () => api.get<{ id: string; user_id: string; name: string; email: string; role: string; created_at: string }[]>("/workspace/members") });
  const save = useMutate((b: Record<string, unknown>) => api.patch("/workspace", b), { success: "Company settings saved", invalidate: [["me"], ["dashboard"], ["attendance"], ["leave"]], onFieldErrors: setErrors });
  const add = useMutate((b: typeof invite) => api.post("/workspace/members", b), { success: "Admin added", invalidate: [["members"]], onFieldErrors: setIErrors, onSuccess: () => setInvite({ email: "", role: "member" }) });
  const remove = useMutate((id: string) => api.delete(`/workspace/members/${id}`), { success: "Removed", invalidate: [["members"]] });
  return (
    <div className="space-y-6">
      <Card title="Company" description="Working days and hours are used for attendance (late detection), leave day counts and payroll.">
        <form onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate({ name: f.name, settings: { work_start: f.work_start, late_after_minutes: Number(f.late_after_minutes || 0), work_days: f.work_days } }); }} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Company name" error={errors.name} className="sm:col-span-3"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!canManage} required minLength={2} /></Field>
            <Field label="Work starts at" error={errors.work_start}><TextInput type="time" value={f.work_start} onChange={(e) => setF({ ...f, work_start: e.target.value })} disabled={!canManage} /></Field>
            <Field label="Late after (minutes)" hint="Grace period before a check-in counts as late"><TextInput type="number" min={0} max={240} value={f.late_after_minutes} onChange={(e) => setF({ ...f, late_after_minutes: e.target.value })} disabled={!canManage} /></Field>
          </div>
          <Field label="Working days" error={errors.work_days}>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => {
                const on = f.work_days.includes(i);
                return <button key={d} type="button" disabled={!canManage} onClick={() => setF({ ...f, work_days: on ? f.work_days.filter((x) => x !== i) : [...f.work_days, i].sort() })} className={`h-10 w-14 rounded-lg border text-theme-sm font-medium transition ${on ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"}`}>{d}</button>;
              })}
            </div>
          </Field>
          {canManage && <div className="flex justify-end"><Button type="submit" disabled={save.isPending}>Save company settings</Button></div>}
        </form>
      </Card>
      <Card title="HR admins" description="People who can sign in to manage this company's HR data.">
        {canManage && (
          <form onSubmit={(e) => { e.preventDefault(); setIErrors({}); add.mutate(invite); }} className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field error={ierrors.email} className="flex-1"><TextInput type="email" placeholder="colleague@company.com (must have signed up in this browser)" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} required /></Field>
            <NativeSelect value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} className="sm:w-36"><option value="member">Member</option><option value="admin">Admin</option></NativeSelect>
            <Button type="submit" disabled={add.isPending}><UserPlus /> Add</Button>
          </form>
        )}
        {members.isLoading ? <Loading className="py-6" /> : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {members.data?.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-white/[0.08] dark:text-gray-200">{initials(m.name)}</span>
                <div className="min-w-0 flex-1"><p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{m.name}{m.user_id === me.user.id && " (you)"}</p><p className="truncate text-theme-xs text-gray-500">{m.email} · since {dt(m.created_at)}</p></div>
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

function DataTab() {
  const [confirm, setConfirm] = useState("");
  const download = async () => {
    const { exportAll } = await import("@/lib/local/store");
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hellohr-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { importAll } = await import("@/lib/local/store");
      importAll(await file.text());
      toast.success("Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const clear = async () => {
    const { clearAll } = await import("@/lib/local/store");
    clearAll();
    window.location.href = import.meta.env.BASE_URL + "register";
  };
  return (
    <div className="space-y-6">
      <Card title="Your data" description="Every account, employee, attendance, leave and payroll record is stored in this browser (localStorage). It is not sent to any server. Clearing your browser data, or using another browser or device, means you won't see it — so back it up regularly.">
        <div className="flex flex-wrap gap-3">
          <Button onClick={download}><Download /> Download backup (.json)</Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <Upload className="size-4" /> Restore from backup
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          </label>
        </div>
        <p className="mt-3 text-theme-xs text-gray-400">Restoring replaces everything currently stored in this browser.</p>
      </Card>
      <Card title="Delete all data" description="Permanently removes every HelloHR account and record stored in this browser. This cannot be undone.">
        <div className="flex max-w-md flex-col gap-3 sm:flex-row">
          <TextInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder='Type "DELETE" to confirm' />
          <Button variant="destructive" disabled={confirm !== "DELETE"} onClick={clear}><Trash2 /> Delete everything</Button>
        </div>
      </Card>
    </div>
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
          {[["profile", "Profile"], ["security", "Password"], ["company", "Company & admins"], ...(LOCAL_MODE ? [["data", "Data & backup"]] : [])].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile"><Profile /></TabsContent>
        <TabsContent value="security"><Password /></TabsContent>
        <TabsContent value="company"><Company /></TabsContent>
        {LOCAL_MODE && <TabsContent value="data"><DataTab /></TabsContent>}
      </Tabs>
    </>
  );
}
