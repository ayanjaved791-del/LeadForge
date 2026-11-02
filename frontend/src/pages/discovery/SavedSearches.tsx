import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, Play, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ago } from "@/lib/format";
import type { SavedSearch } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Confirm } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { useCategories } from "./shared";

export default function SavedSearches() {
  const nav = useNavigate();
  const cats = useCategories();
  const [del, setDel] = useState<SavedSearch | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["saved-searches"], queryFn: () => api.get<SavedSearch[]>("/saved-searches") });
  const remove = useMutate((id: string) => api.delete(`/saved-searches/${id}`), { success: "Saved search deleted", invalidate: [["saved-searches"]] });

  return (
    <>
      <PageHeader title="Saved Searches" crumbs={[{ label: "Discovery" }]} />
      <div className="lf-card overflow-hidden">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState icon={Bookmark} title="No saved searches" description="Run a search on the Search Businesses page and choose “Save search” to keep it here." action={<Button onClick={() => nav("/discover")}>Search businesses</Button>} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><Bookmark className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 dark:text-white/90">{s.name}</p>
                  <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                    {cats.data?.find((c) => c.key === s.params.category)?.label} ·{" "}
                    {s.params.lat !== undefined ? `Map point ${Number(s.params.lat).toFixed(3)}, ${Number(s.params.lng).toFixed(3)}` : [s.params.area, s.params.city, s.params.country].filter(Boolean).join(", ")} · {s.params.radius / 1000} km
                    {s.result_count !== null && ` · ${s.result_count} results`} · last run {ago(s.last_run_at)}
                  </p>
                </div>
                <Button size="sm" onClick={() => nav(`/discover?run=${s.id}`)}><Play /> Run</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setDel(s)} aria-label="Delete"><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete saved search?" description={`“${del?.name}” will be removed. Discovered businesses are kept.`} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  );
}
