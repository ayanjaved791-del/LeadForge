import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Field, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout
      title="Forgot Your Password?"
      subtitle="Enter the email linked to your account and we'll send you a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex gap-3 rounded-xl border border-success-500/30 bg-success-50 p-4 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-500">
          <CheckCircle2 className="size-5 shrink-0" />
          <p>If an account exists for <strong>{email}</strong>, a reset link is on its way. It expires in 1 hour. (Local development: emails are written to <code>api/storage/mail</code>.)</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          {err && <div className="rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10">{err}</div>}
          <Field label="Email *">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
