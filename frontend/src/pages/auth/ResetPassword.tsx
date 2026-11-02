import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, errorMessage } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return setErr("Passwords do not match.");
    setBusy(true);
    setErr(null);
    try {
      await api.post("/auth/reset-password", { token, password: pw });
      toast.success("Password updated. Sign in with your new password.");
      nav("/login");
    } catch (e) {
      setErr(e instanceof ApiError && e.fields.password ? e.fields.password : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Choose a New Password" subtitle="Your new password must have at least 8 characters with letters and numbers." footer={<Link to="/login" className="text-brand-500">Back to sign in</Link>}>
      {!token ? (
        <p className="text-sm text-error-500">This reset link is missing its token. Request a new one from the forgot password page.</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {err && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">{err}</div>}
          <Field label="New password *">
            <TextInput type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm password *">
            <TextInput type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
