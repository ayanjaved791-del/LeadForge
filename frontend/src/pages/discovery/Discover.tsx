import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkPlus, CheckCircle2, Compass, Loader2, Map as MapIcon, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import type { Business, Paged, SavedSearch, WebsiteStatus } from "@/lib/types";
import { WEBSITE_STATUS } from "@/lib/constants";
import { PageHeader, Card } from "@/components/shared/PageHeader";
import { ChipSelect, Field, TextInput } from "@/components/shared/Form";
import { ScoreBadge, WebsiteBadge } from "@/components/shared/Badges";
import { EmptyState, Loading } from "@/components/shared/States";
import { Modal } from "@/components/shared/Modal";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BusinessSheet } from "./BusinessSheet";
import { SearchForm, useCategories, useDiscovery, useSaveLead } from "./shared";

export function BusinessTable({ items, selected, onSelect, onOpen }: { items: Business[]; selected?: Set<string>; onSelect?: (ids: Set<string>) => void; onOpen: (id: string) => void }) {
  const save = useSaveLead();
  const allSel = !!selected && items.length > 0 && items.every((b) => selected.has(b.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {onSelect && (
              <th className="w-10 py-3 pl-5">
                <Checkbox checked={allSel} onCheckedChange={(v) => onSelect(v ? new Set(items.map((b) => b.id)) : new Set())} aria-label="Select all" />
              </th>
            )}
            <th className="px-5 py-3 font-medium">Business</th>
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Website status</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-5 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.map((b) => (
            <tr key={b.id} className="text-theme-sm hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
              {onSelect && selected && (
                <td className="py-3 pl-5">
                  <Checkbox
                    checked={selected.has(b.id)}
                    onCheckedChange={(v) => {
                      const n = new Set(selected);
                      v ? n.add(b.id) : n.delete(b.id);
                      onSelect(n);
                    }}
                  />
                </td>
              )}
              <td className="max-w-[280px] px-5 py-3">
                <button onClick={() => onOpen(b.id)} className="text-left">
                  <span className="block truncate font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{b.name}</span>
                  <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{b.category_label}{b.address ? ` · ${b.address}` : ""}</span>
                </button>
              </td>
              <td className="px-4 py-3 text-theme-xs text-gray-500 dark:text-gray-400">
                <span className="block">{b.phone ?? <span className="text-gray-300 dark:text-gray-600">No phone</span>}</span>
                <span className="block max-w-[200px] truncate">{b.website ?? b.email ?? <span className="text-gray-300 dark:text-gray-600">No website / email</span>}</span>
              </td>
              <td className="px-4 py-3"><WebsiteBadge status={b.website_status} note={b.website_check_note} /></td>
              <td className="px-4 py-3"><ScoreBadge score={b.score} /></td>
              <td className="px-5 py-3 text-right">
                {b.lead_id ? (
                  <Link to={`/leads/${b.lead_id}`} className="inline-flex items-center gap-1 text-theme-sm font-medium text-success-600 dark:text-success-500">
                    <CheckCircle2 className="size-4" /> Saved
                  </Link>
                ) : (
                  <Button size="xs" variant="outline" onClick={() => save.mutate(b.id)} disabled={save.isPending && save.variables === b.id}>
                    {save.isPending && save.variables === b.id ? <Loader2 className="animate-spin" /> : <BookmarkPlus />} Save lead
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_OPTS = [{ value: "", label: "All website statuses" }, ...Object.entries(WEBSITE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))];

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const { last, run, running, patch } = useDiscovery();
  const cats = useCategories();
  const [openId, setOpenId] = useState<string | null>(params.get("business"));
  const [status, setStatus] = useState<"" | WebsiteStatus>("");
  const [minScore, setMinScore] = useState("0");
  const [hideSaved, setHideSaved] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [tab, setTab] = useState<"results" | "all">(last ? "results" : "all");
  const [page, setPage] = useState(1);
  const [checking, setChecking] = useState(false);

  // Run a saved search when arriving with ?run=<id>
  const runId = params.get("run");
  const saved = useQuery({ queryKey: ["saved-searches"], queryFn: () => api.get<SavedSearch[]>("/saved-searches"), enabled: !!runId });
  useEffect(() => {
    if (!runId || !saved.data) return;
    const s = saved.data.find((x) => x.id === runId);
    params.delete("run");
    setParams(params, { replace: true });
    if (s) run(s.params, s.id).then((r) => r && setTab("results"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, saved.data]);

  const all = useQuery({
    queryKey: ["businesses", page, status, minScore, hideSaved],
    queryFn: () => api.get<Paged<Business>>("/businesses", { page, limit: 25, website_status: status, min_score: minScore, saved: hideSaved ? "0" : "" }),
    enabled: tab === "all",
  });

  const filtered = useMemo(() => {
    if (!last) return [];
    return last.result.businesses.filter((b) => (!status || b.website_status === status) && b.score >= Number(minScore) && (!hideSaved || !b.lead_id));
  }, [last, status, minScore, hideSaved]);

  const saveSearch = useMutate((name: string) => api.post("/saved-searches", { name, params: last!.params, result_count: last!.result.count }), {
    success: "Search saved",
    invalidate: [["saved-searches"]],
    onSuccess: () => setSaveOpen(false),
  });

  const checkSelected = async () => {
    const ids = [...selected].filter((id) => {
      const b = (tab === "results" ? filtered : all.data?.items ?? []).find((x) => x.id === id);
      return b?.website;
    });
    if (!ids.length) return toast.info("None of the selected businesses list a website to check.");
    setChecking(true);
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const res = await api.post<Business[]>("/businesses/check-websites", { ids: ids.slice(i, i + 10) });
        res.forEach(patch);
      }
      toast.success(`Checked ${ids.length} website${ids.length > 1 ? "s" : ""}`);
      all.refetch();
      setSelected(new Set());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  const catLabel = cats.data?.find((c) => c.key === last?.params.category)?.label;
  const items = tab === "results" ? filtered : all.data?.items ?? [];

  return (
    <>
      <PageHeader title="Search Businesses" crumbs={[{ label: "Discovery" }]} />
      <Card title="Find local businesses" description="Search OpenStreetMap by location and category, then save the best opportunities as leads." className="mb-6">
        <SearchForm
          initial={last?.params}
          running={running}
          onSearch={async (p) => {
            const r = await run(p);
            if (r) {
              setTab("results");
              setSelected(new Set());
            }
          }}
        />
      </Card>

      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
            {(["results", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSelected(new Set());
                }}
                className={`rounded-md px-3 py-2 text-theme-sm font-medium ${tab === t ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
              >
                {t === "results" ? `Latest search${last ? ` (${last.result.count})` : ""}` : "All discovered"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChipSelect value={status} onChange={(v) => { setStatus(v as WebsiteStatus | ""); setPage(1); }} options={STATUS_OPTS} />
            <ChipSelect value={minScore} onChange={(v) => { setMinScore(v); setPage(1); }} options={[{ value: "0", label: "Any score" }, { value: "25", label: "Score 25+" }, { value: "50", label: "Score 50+" }, { value: "75", label: "Score 75+" }]} />
            <label className="flex items-center gap-2 text-theme-sm text-gray-600 dark:text-gray-400">
              <Checkbox checked={hideSaved} onCheckedChange={(v) => { setHideSaved(!!v); setPage(1); }} /> Hide saved
            </label>
          </div>
        </div>

        {tab === "results" && last && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-5">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-white/90">{catLabel}</span> within {last.result.radius >= 1000 ? `${last.result.radius / 1000} km` : `${last.result.radius} m`} of{" "}
              <span className="font-medium text-gray-800 dark:text-white/90">{last.result.center.display_name}</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/map"><MapIcon /> View on map</Link>
              </Button>
              {!last.savedSearchId && (
                <Button variant="outline" size="sm" onClick={() => { setSaveName(`${catLabel} · ${last.params.city ?? "map area"}`); setSaveOpen(true); }}>
                  <Save /> Save search
                </Button>
              )}
            </div>
          </div>
        )}

        {selected.size > 0 && (
          <div className="mx-5 mt-4 flex items-center justify-between rounded-lg bg-brand-25 px-4 py-2.5 text-sm dark:bg-brand-500/10">
            <span className="text-brand-600 dark:text-brand-400">{selected.size} selected</span>
            <Button size="xs" onClick={checkSelected} disabled={checking}>
              {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check websites
            </Button>
          </div>
        )}

        <div className="mt-4">
          {tab === "results" && !last ? (
            <EmptyState icon={Compass} title="No search yet" description="Choose a category and a city above to discover businesses from OpenStreetMap." />
          ) : tab === "all" && all.isLoading ? (
            <Loading />
          ) : items.length === 0 ? (
            <EmptyState
              icon={tab === "all" ? Bookmark : Search}
              title={tab === "all" && !all.data?.total ? "No businesses discovered yet" : "No businesses match these filters"}
              description={tab === "all" && !all.data?.total ? "Businesses you discover are stored in your workspace so you can come back to them." : "Adjust the website status, score or saved filters."}
            />
          ) : (
            <BusinessTable items={items} selected={selected} onSelect={setSelected} onOpen={setOpenId} />
          )}
        </div>
        {tab === "all" && all.data && <Pagination page={page} total={all.data.total} limit={25} onPage={setPage} />}
      </div>

      <BusinessSheet
        id={openId}
        onClose={() => {
          setOpenId(null);
          if (params.get("business")) {
            params.delete("business");
            setParams(params, { replace: true });
          }
        }}
      />
      <Modal open={saveOpen} onOpenChange={setSaveOpen} title="Save this search" description="Re-run it any time from Saved Searches.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSearch.mutate(saveName);
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <TextInput value={saveName} onChange={(e) => setSaveName(e.target.value)} required maxLength={120} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveSearch.isPending}>Save</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
