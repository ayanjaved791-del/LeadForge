import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, ExternalLink, FileSearch, Globe, Loader2, Mail, MapPin, Phone, RefreshCw, Clock } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ago, safeUrl, titleCase } from "@/lib/format";
import type { Business } from "@/lib/types";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScoreBreakdown, WebsiteBadge } from "@/components/shared/Badges";
import { Loading } from "@/components/shared/States";
import { useDiscovery, useSaveLead } from "./shared";

function Row({ icon: Icon, label, children }: { icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{label}</p>
        <div className="break-words text-sm text-gray-800 dark:text-white/90">{children}</div>
      </div>
    </div>
  );
}
const Missing = () => <span className="text-gray-400">Not listed</span>;

export function BusinessSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { patch } = useDiscovery();
  const { data: b, isLoading } = useQuery({ queryKey: ["business", id], queryFn: () => api.get<Business>(`/businesses/${id}`), enabled: !!id });
  const save = useSaveLead();
  const check = useMutate(() => api.post<Business>(`/businesses/${id}/check-website`), {
    onSuccess: (r) => {
      qc.setQueryData(["business", id], r);
      patch(r);
      qc.invalidateQueries({ queryKey: ["businesses"] });
      toast.success(`Website status: ${r.website_status_label}`);
    },
  });
  const audit = useMutate(() => api.post(`/audits`, { business_id: id }), {
    success: "Audit complete",
    invalidate: [["business", id ?? ""], ["audits"], ["businesses"]],
    onSuccess: () => api.get<Business>(`/businesses/${id}`).then(patch).catch(() => undefined),
  });
  const web = safeUrl(b?.website);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-gray-200 p-0 sm:max-w-lg dark:border-gray-800 dark:bg-gray-900">
        {isLoading || !b ? (
          <Loading />
        ) : (
          <>
            <SheetHeader className="border-b border-gray-100 p-6 dark:border-gray-800">
              <p className="text-theme-xs font-medium uppercase tracking-wide text-brand-500">{b.category_label}</p>
              <SheetTitle className="text-xl text-gray-800 dark:text-white/90">{b.name}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <WebsiteBadge status={b.website_status} note={b.website_check_note} />
                <span className="text-xs text-gray-400">Discovered {ago(b.discovered_at)}</span>
              </SheetDescription>
              <div className="flex flex-wrap gap-2 pt-3">
                {b.lead_id ? (
                  <Button size="sm" asChild>
                    <Link to={`/leads/${b.lead_id}`}>Open lead</Link>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => save.mutate(b.id, { onSuccess: () => qc.invalidateQueries({ queryKey: ["business", id] }) })} disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Save as lead
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => check.mutate(undefined)} disabled={check.isPending}>
                  {check.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {b.website ? "Check website" : "Re-evaluate"}
                </Button>
                {b.website && (
                  <Button size="sm" variant="outline" onClick={() => audit.mutate(undefined)} disabled={audit.isPending}>
                    {audit.isPending ? <Loader2 className="animate-spin" /> : <FileSearch />} Run audit
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-6 p-6">
              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Opportunity score</h4>
                <ScoreBreakdown score={b.score} items={b.score_breakdown} />
              </section>

              {b.website_check_note && (
                <section className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
                  <p className="mb-1 font-medium text-gray-800 dark:text-white/90">Website check</p>
                  <p>{b.website_check_note}</p>
                  {b.website_checked_at && <p className="mt-1 text-xs text-gray-400">Checked {ago(b.website_checked_at)}{b.website_http_status ? ` · HTTP ${b.website_http_status}` : ""}</p>}
                </section>
              )}

              <section>
                <h4 className="mb-1 text-sm font-semibold text-gray-800 dark:text-white/90">Public business information</h4>
                <p className="mb-2 text-xs text-gray-400">Only information published on OpenStreetMap is shown. Missing fields are never guessed.</p>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <Row icon={MapPin} label="Address">{b.address ?? <Missing />}</Row>
                  <Row icon={Phone} label="Phone">{b.phone ? <a href={`tel:${b.phone.split(";")[0]}`} className="text-brand-500">{b.phone}</a> : <Missing />}</Row>
                  <Row icon={Globe} label="Website">
                    {web ? (
                      <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-500">
                        {b.website} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <Missing />
                    )}
                  </Row>
                  <Row icon={Mail} label="Email">{b.email ? <a href={`mailto:${b.email}`} className="text-brand-500">{b.email}</a> : <Missing />}</Row>
                  <Row icon={Clock} label="Opening hours">{b.opening_hours ?? <Missing />}</Row>
                  <Row icon={Globe} label="Social media">
                    {Object.keys(b.socials).length ? (
                      <ul className="space-y-0.5">
                        {Object.entries(b.socials).map(([k, v]) => {
                          const u = safeUrl(v);
                          return (
                            <li key={k}>
                              <span className="text-gray-500">{titleCase(k)}: </span>
                              {u && /^https?:/i.test(v) ? <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-500">{v}</a> : v}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <Missing />
                    )}
                  </Row>
                  <Row icon={MapPin} label="Coordinates">
                    {b.lat.toFixed(6)}, {b.lng.toFixed(6)} ·{" "}
                    <a href={b.osm_url} target="_blank" rel="noopener noreferrer" className="text-brand-500">View on OpenStreetMap</a>
                  </Row>
                </div>
              </section>

              {b.latest_audit && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">Latest audit</h4>
                    <Link to={`/audit?id=${b.latest_audit.id}`} className="text-xs text-brand-500">Full report</Link>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Score <strong>{b.latest_audit.score}/100</strong> · {b.latest_audit.checks.filter((c) => !c.passed).length} issues · {ago(b.latest_audit.created_at)}
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export const errorText = errorMessage;
