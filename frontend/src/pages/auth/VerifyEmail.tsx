import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; msg?: string }>({ status: "loading" });
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    if (!token) return setState({ status: "error", msg: "Verification token missing." });
    api
      .post("/auth/verify-email", { token })
      .then(() => {
        setState({ status: "ok" });
        qc.invalidateQueries({ queryKey: ["me"] });
      })
      .catch((e) => setState({ status: "error", msg: errorMessage(e) }));
  }, [params, qc]);

  return (
    <AuthLayout title="Email Verification" subtitle="Confirming your email address." footer={<Link to="/" className="text-brand-500">Go to dashboard</Link>}>
      {state.status === "loading" && (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Verifying…
        </p>
      )}
      {state.status === "ok" && (
        <p className="flex items-center gap-2 text-sm text-success-600">
          <CheckCircle2 className="size-5" /> Your email is verified. Thanks!
        </p>
      )}
      {state.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-error-500">
          <XCircle className="size-5" /> {state.msg}
        </p>
      )}
    </AuthLayout>
  );
}
