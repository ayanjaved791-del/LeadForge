import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, FileSearch, Loader2, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ago, dtTime, num, safeUrl } from "@/lib/format";
import type { Audit as AuditT } from "@/lib/types";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { EmptyState, Loading } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function ScoreDial({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "#12b76a" : score >= 50 ? "#f79009" : "#f04438";
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} strokeWidth="10" fill="none" className="stroke-gray-100 dark:stroke-gray-800" />
        <circle cx="60" cy="60" r={r} strokeWidth="10" fill="none" stroke={color} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-gray-800 dark:text-white/90">{score}</span>
        <span className="text-theme-xs text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

export function AuditReport({ audit }: { audit: AuditT }) {
  const link = safeUrl(audit.final_url ?? audit.url);
  const failed = audit.checks.filter((c) => !c.passed);
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col items-center text-center">
        <ScoreDial score={audit.score} />
        <p className="mt-3 text-theme-sm font-medium text-gray-800 dark:text-white/90">{failed.length === 0 ? "No issues found" : `${failed.length} issue${failed.length > 1 ? "s" : ""} found`}</p>
        {link && <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-theme-xs text-brand-500">{audit.final_url ?? audit.url} <ExternalLink className="size-3 shrink-0" /></a>}
        <p className="mt-1 text-theme-xs text-gray-400">{dtTime(audit.created_at)}</p>
      </div>
      <div>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Status", audit.status_code ? `HTTP ${audit.status_code}` : "No response"],
            ["Response time", audit.response_time_ms !== null ? `${num(audit.response_time_ms)} ms` : "—"],
            ["Page size", audit.page_bytes ? `${(audit.page_bytes / 1024).toFixed(0)} KB` : "—"],
            ["Language", audit.html_lang ?? "—"],
          ].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
              <p className="text-theme-xs text-gray-500">{l}</p>
              <p className="mt-0.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{v}</p>
            </div>
          ))}
        </div>
        {audit.error && <p className="mb-4 rounded-lg bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{audit.error}</p>}
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {audit.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 px-4 py-3">
              {c.passed ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-500" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-error-500" />}
              <div className="min-w-0 flex-1">
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{c.label}</p>
                <p className="break-words text-theme-xs text-gray-500 dark:text-gray-400">{c.detail}</p>
              </div>
              {c.weight > 0 && <span className="shrink-0 text-theme-xs text-gray-400">{c.weight} pts</span>}
            </li>
          ))}
        </ul>
        {(audit.page_title || audit.meta_description) && (
          <div className="mt-5 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
            <p className="mb-2 text-theme-xs font-medium uppercase text-gray-400">Search snippet preview</p>
            <p className="truncate text-base text-[#1a0dab] dark:text-brand-400">{audit.page_title ?? "(no title)"}</p>
            <p className="truncate text-theme-xs text-success-700 dark:text-success-500">{audit.final_url}</p>
            <p className="line-clamp-2 text-theme-sm text-gray-600 dark:text-gray-400">{audit.meta_description ?? "(no meta description)"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Audit() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [current, setCurrent] = useState<AuditT | null>(null);
  const history = useQuery({ queryKey: ["audits"], queryFn: () => api.get<(AuditT & { business_name?: string; lead_name?: string })[]>("/audits") });
  const run = useMutate((u: string) => api.post<AuditT>("/audits", { url: u }), { invalidate: [["audits"]], onSuccess: (a) => setCurrent(a) });
  const remove = useMutate((id: string) => api.delete(`/audits/${id}`), { success: "Audit deleted", invalidate: [["audits"]], onSuccess: (_r, id) => current?.id === id && setCurrent(null) });

  const qid = params.get("id");
  useEffect(() => {
    if (!qid) return;
    api.get<AuditT>(`/audits/${qid}`).then(setCurrent).catch(() => undefined);
  }, [qid]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) run.mutate(url.trim());
  };

  return (
    <>
      <PageHeader title="Website Audit" />
      <Card title="Audit a website" description="Checks availability, HTTPS, title, meta description, mobile viewport, favicon and basic SEO. Pages are read as text — scripts are never executed." className="mb-6">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="example.com" className="lf-input flex-1" maxLength={500} />
          <Button type="submit" disabled={run.isPending || !url.trim()}>
            {run.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />} {run.isPending ? "Auditing…" : "Run audit"}
          </Button>
        </form>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400"><ShieldCheck className="size-3.5" /> Private, local and internal network addresses are blocked for safety.</p>
      </Card>

      {current && (
        <Card title="Audit report" className="mb-6" actions={<Button size="sm" variant="ghost" onClick={() => { setCurrent(null); params.delete("id"); setParams(params, { replace: true }); }}>Close</Button>}>
          <AuditReport audit={current} />
        </Card>
      )}

      <div className="lf-card overflow-hidden">
        <div className="px-5 pt-5 sm:px-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Audit history</h3>
        </div>
        {history.isLoading ? <Loading /> : !history.data?.length ? (
          <EmptyState icon={FileSearch} title="No audits yet" description="Audit a prospect's website to find concrete improvements you can pitch." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-6 py-3 font-medium">Website</th>
                  <th className="px-4 py-3 font-medium">Linked to</th>
                  <th className="px-4 py-3 font-medium">Issues</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.data.map((a) => (
                  <tr key={a.id} className={cn("text-theme-sm", current?.id === a.id && "bg-brand-25 dark:bg-brand-500/5")}>
                    <td className="max-w-[300px] px-6 py-3">
                      <button onClick={() => { setCurrent(a); qc.setQueryData(["audit", a.id], a); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="block truncate text-left font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{a.final_url ?? a.url}</button>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{a.lead_id ? <Link to={`/leads/${a.lead_id}`} className="text-brand-500">{a.lead_name}</Link> : a.business_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{a.checks.filter((c) => !c.passed).length}</td>
                    <td className="px-4 py-3"><span className={cn("font-semibold", a.score >= 80 ? "text-success-600" : a.score >= 50 ? "text-warning-600" : "text-error-500")}>{a.score}</span></td>
                    <td className="px-4 py-3 text-theme-xs text-gray-500">{ago(a.created_at)}</td>
                    <td className="px-6 py-3 text-right"><Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(a.id)} aria-label="Delete"><Trash2 /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
