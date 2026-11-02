import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Field, NativeSelect, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/Logo";
import { FullPageLoader } from "@/components/shared/States";

const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "NGN", "ZAR", "BDT", "TRY", "BRL", "MXN"];

export default function Onboarding() {
  const { me, loading } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [f, setF] = useState({ workspace: me?.workspace.name ?? "", job_title: "", currency: "USD", work_start: "09:00", work_days: [1, 2, 3, 4, 5] as number[] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (loading) return <FullPageLoader />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.user.onboarded_at) return <Navigate to="/" replace />;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.patch("/workspace", { name: f.workspace || me.workspace.name, settings: { work_start: f.work_start, work_days: f.work_days } });
      await api.patch("/auth/profile", {
        job_title: f.job_title || null,
        company: f.workspace || null,
        currency: f.currency,
        timezone: tz,
        complete_onboarding: true,
      });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/employees", { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError && Object.keys(e.fields).length ? Object.values(e.fields)[0] : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-950">
      <div className="lf-card w-full max-w-xl p-6 sm:p-10">
        <LogoMark className="mb-6 size-10" />
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Welcome, {me.user.name.split(" ")[0]}!</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Set up your company in HelloHR. You can change these later in Settings.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          {err && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">{err}</div>}
          <Field label="Company name">
            <TextInput value={f.workspace} onChange={set("workspace")} required minLength={2} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Your role" className="sm:col-span-2">
              <TextInput value={f.job_title} onChange={set("job_title")} placeholder="HR Manager" />
            </Field>
            <Field label="Currency">
              <NativeSelect value={f.currency} onChange={set("currency")}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Work starts at">
              <TextInput type="time" value={f.work_start} onChange={set("work_start")} />
            </Field>
            <Field label="Working days" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                  const on = f.work_days.includes(i);
                  return (
                    <button key={i} type="button" onClick={() => setF({ ...f, work_days: on ? f.work_days.filter((x) => x !== i) : [...f.work_days, i].sort() })} className={`size-10 rounded-lg border text-theme-sm font-medium ${on ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300 text-gray-500 dark:border-gray-700"}`}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <p className="text-xs text-gray-400">Timezone detected: {tz}</p>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Continue to HelloHR
          </Button>
        </form>
      </div>
    </div>
  );
}
