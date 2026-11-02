import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage, LOCAL_MODE } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

export default function Login() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  if (me) return <Navigate to={loc.state?.from ?? "/"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setFields({});
    try {
      await api.post("/auth/login", { email, password });
      await qc.invalidateQueries({ queryKey: ["me"] });
      nav(loc.state?.from ?? "/", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setFields(e.fields);
      else setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Sign In"
      subtitle="Enter your email and password to sign in!"
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link to="/register" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Sign Up
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5">
        {err && <div className="rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{err}</div>}
        <Field label="Email *" error={fields.email}>
          <TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@gmail.com" required invalid={!!fields.email} />
        </Field>
        <Field label="Password *" error={fields.password}>
          <div className="relative">
            <TextInput type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" aria-label="Show password">
              {show ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-end">
          <Link to="/forgot-password" className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} Sign in
        </Button>
        {LOCAL_MODE && <p className="text-center text-xs text-gray-400">Your account and data are stored securely in this browser only.</p>}
      </form>
    </AuthLayout>
  );
}
