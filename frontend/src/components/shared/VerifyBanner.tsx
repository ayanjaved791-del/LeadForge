import { useState } from "react";
import { MailWarning, X } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, LOCAL_MODE } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";

export function VerifyBanner() {
  const me = useMe();
  const [hidden, setHidden] = useState(false);
  if (LOCAL_MODE || me.user.email_verified_at || hidden) return null;
  const resend = async () => {
    try {
      await api.post("/auth/resend-verification");
      toast.success("Verification email sent. Check your inbox (in local dev: api/storage/mail).");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-orange-400">
      <MailWarning className="size-5 shrink-0" />
      <p className="flex-1">
        Please verify <strong>{me.user.email}</strong> to secure your account.{" "}
        <button onClick={resend} className="font-medium underline underline-offset-2">
          Resend email
        </button>
      </p>
      <button onClick={() => setHidden(true)} aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}
