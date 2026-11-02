import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { COUNTRIES } from "@/lib/constants";
import type { Business, SearchParams, SearchResult } from "@/lib/types";
import { Field, NativeSelect, TextInput } from "@/components/shared/Form";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api.get<{ key: string; label: string }[]>("/discovery/categories"), staleTime: Infinity });

const LAST = ["discovery", "last"];
export interface LastSearch {
  params: SearchParams;
  result: SearchResult;
  savedSearchId?: string;
}

/** Shared discovery state (last search) so the list and map views show the same results. */
export function useDiscovery() {
  const qc = useQueryClient();
  const last = useQuery<LastSearch | null>({ queryKey: LAST, queryFn: () => null, staleTime: Infinity, gcTime: Infinity, enabled: false, initialData: null });
  const [running, setRunning] = useState(false);
  const run = async (params: SearchParams, savedSearchId?: string) => {
    setRunning(true);
    try {
      const result = await api.post<SearchResult>("/discovery/search", params);
      qc.setQueryData(LAST, { params, result, savedSearchId });
      if (savedSearchId) api.post(`/saved-searches/${savedSearchId}/run`, { result_count: result.count }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["businesses"] });
      if (result.count === 0) toast.info("No businesses with a name were found in this area. Try a larger radius or another category.");
      return result;
    } catch (e) {
      toast.error(errorMessage(e));
      return null;
    } finally {
      setRunning(false);
    }
  };
  /** Replace a business inside the cached results after a check / save. */
  const patch = (b: Partial<Business> & { id: string }) => {
    qc.setQueryData<LastSearch | null>(LAST, (old) =>
      old ? { ...old, result: { ...old.result, businesses: old.result.businesses.map((x) => (x.id === b.id ? { ...x, ...b } : x)) } } : old,
    );
  };
  return { last: last.data ?? null, run, running, patch };
}

export function useSaveLead(onSaved?: (businessId: string, leadId: string) => void) {
  const { patch } = useDiscovery();
  return useMutate((businessId: string) => api.post<{ id: string; business_id: string }>("/leads", { business_id: businessId }), {
    success: "Saved to leads",
    invalidate: [["leads"], ["dashboard"], ["businesses"], ["business"], ["pipeline"]],
    onSuccess: (r, businessId) => {
      patch({ id: businessId, lead_id: r.id });
      onSaved?.(businessId, r.id);
    },
  });
}

export function SearchForm({ initial, onSearch, running, point, onClearPoint, compact = false }: { initial?: SearchParams | null; onSearch: (p: SearchParams) => void; running: boolean; point?: { lat: number; lng: number } | null; onClearPoint?: () => void; compact?: boolean }) {
  const me = useMe();
  const cats = useCategories();
  const [f, setF] = useState({
    category: initial?.category ?? "restaurant",
    country: initial?.country ?? me.user.default_country ?? "",
    city: initial?.city ?? me.user.default_city ?? "",
    area: initial?.area ?? "",
    radius: initial?.radius ?? 2000,
  });
  useEffect(() => {
    if (initial) setF((p) => ({ ...p, category: initial.category, country: initial.country ?? p.country, city: initial.city ?? p.city, area: initial.area ?? "", radius: initial.radius }));
  }, [initial]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const params: SearchParams = { category: f.category, radius: f.radius };
    if (point) {
      params.lat = Number(point.lat.toFixed(6));
      params.lng = Number(point.lng.toFixed(6));
    } else {
      if (!f.city.trim()) return toast.error(compact ? "Enter a city or click the map to pick a point." : "Enter a city.");
      Object.assign(params, { country: f.country || undefined, city: f.city.trim(), area: f.area.trim() || undefined });
    }
    onSearch(params);
  };

  const grid = compact ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5";
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={grid}>
        <Field label="Category">
          <NativeSelect value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.data?.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </NativeSelect>
        </Field>
        {point ? (
          <div className={compact ? "" : "sm:col-span-2 xl:col-span-3"}>
            <span className="lf-label">Location</span>
            <div className="flex h-11 items-center justify-between rounded-lg border border-brand-300 bg-brand-25 px-4 text-sm text-brand-600 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-400">
              <span className="flex items-center gap-2"><MapPin className="size-4" /> Map point {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</span>
              <button type="button" onClick={onClearPoint} className="text-xs font-medium underline">Use city instead</button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Country">
              <NativeSelect value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>
                <option value="">Any country</option>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </NativeSelect>
            </Field>
            <Field label="City">
              <TextInput value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="e.g. Lahore" />
            </Field>
            <Field label="Area / neighbourhood">
              <TextInput value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="Optional, e.g. Gulberg" />
            </Field>
          </>
        )}
        <div>
          <span className="lf-label">
            Radius <span className="font-normal text-gray-400">· {f.radius >= 1000 ? `${(f.radius / 1000).toFixed(1)} km` : `${f.radius} m`}</span>
          </span>
          <div className="flex h-11 items-center">
            <Slider min={200} max={10000} step={100} value={[f.radius]} onValueChange={([v]) => setF({ ...f, radius: v })} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-400">Data from OpenStreetMap via the free Overpass API. Results are cached for 24 hours to respect fair-use limits.</p>
        <Button type="submit" disabled={running} className={compact ? "w-full" : ""}>
          {running ? <Loader2 className="animate-spin" /> : <Search />} {running ? "Searching OpenStreetMap…" : "Search businesses"}
        </Button>
      </div>
    </form>
  );
}
