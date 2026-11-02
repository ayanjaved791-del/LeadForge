import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

export default function Register() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", workspace: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  if (me) return <Navigate to="/" replace />;

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFields({});
    try {
      await api.post("/auth/register", f);
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav("/onboarding", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setFields(e.fields);
      else setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign Up"
      subtitle="Create your free LeadForge workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Sign In
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {err && <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">{err}</div>}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Full name *" error={fields.name}>
            <TextInput value={f.name} onChange={set("name")} placeholder="Your name" autoComplete="name" required invalid={!!fields.name} />
          </Field>
          <Field label="Workspace" error={fields.workspace}>
            <TextInput value={f.workspace} onChange={set("workspace")} placeholder="Company or team" />
          </Field>
        </div>
        <Field label="Email *" error={fields.email}>
          <TextInput type="email" value={f.email} onChange={set("email")} placeholder="you@company.com" autoComplete="email" required invalid={!!fields.email} />
        </Field>
        <Field label="Password *" error={fields.password} hint="At least 8 characters, with letters and numbers.">
          <div className="relative">
            <TextInput type={show ? "text" : "password"} value={f.password} onChange={set("password")} placeholder="Create a password" autoComplete="new-password" minLength={8} required invalid={!!fields.password} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" aria-label="Show password">
              {show ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </button>
          </div>
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
