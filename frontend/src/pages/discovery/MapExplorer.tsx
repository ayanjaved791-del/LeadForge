import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { BookmarkPlus, CheckCircle2, List, Map as MapIcon, MousePointerClick } from "lucide-react";
import { api } from "@/lib/api";
import { WEBSITE_STATUS, BANDS } from "@/lib/constants";
import type { Business, Paged, SearchParams } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { ScoreBadge } from "@/components/shared/Badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BusinessSheet } from "./BusinessSheet";
import { SearchForm, useCategories, useDiscovery, useSaveLead } from "./shared";

const BAND_HEX = { low: "#98a2b3", medium: "#465fff", high: "#f79009", very_high: "#12b76a" } as const;
const iconCache = new Map<string, L.DivIcon>();
function markerIcon(b: Business, active: boolean) {
  const key = `${b.band}-${active}-${!!b.lead_id}`;
  if (!iconCache.has(key)) {
    const size = active ? 30 : 22;
    const color = BAND_HEX[b.band];
    iconCache.set(
      key,
      L.divIcon({
        className: "lf-marker",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(16,24,40,.35);${b.lead_id ? "outline:2px solid " + color + ";outline-offset:2px;" : ""}"></span>`,
      }),
    );
  }
  return iconCache.get(key)!;
}

function ClickToPick({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FitTo({ center, radius, points, focus }: { center: [number, number] | null; radius: number | null; points: [number, number][]; focus: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center && radius) map.fitBounds(L.latLng(center).toBounds(radius * 2.2));
    else if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1], radius, points.length]);
  useEffect(() => {
    if (focus) map.flyTo(focus, Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [focus, map]);
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  });
  return null;
}

export default function MapExplorer() {
  const { last, run, running } = useDiscovery();
  const cats = useCategories();
  const save = useSaveLead();
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [band, setBand] = useState("");
  const [category, setCategory] = useState("");

  // Without a fresh search, show everything already discovered in this workspace.
  const all = useQuery({ queryKey: ["businesses", "map"], queryFn: () => api.get<Paged<Business>>("/businesses", { limit: 500 }), enabled: !last });
  const source = last ? last.result.businesses : all.data?.items ?? [];
  const items = useMemo(() => source.filter((b) => (!band || b.band === band) && (!category || b.category === category)), [source, band, category]);
  const center: [number, number] | null = last ? [last.result.center.lat, last.result.center.lng] : null;
  const points = useMemo(() => items.map((b) => [b.lat, b.lng] as [number, number]), [items]);

  const onSearch = async (p: SearchParams) => {
    const r = await run(p);
    if (r) setPoint(null);
  };

  return (
    <>
      <PageHeader title="Map Explorer" crumbs={[{ label: "Discovery" }]} />
      <div className="mb-4 flex gap-2 lg:hidden">
        <Button variant={view === "map" ? "default" : "outline"} size="sm" onClick={() => setView("map")}><MapIcon /> Map</Button>
        <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}><List /> List ({items.length})</Button>
      </div>
      <div className="grid gap-4 lg:h-[calc(100vh-190px)] lg:min-h-[560px] lg:grid-cols-[380px_1fr] md:gap-6">
        <div className={cn("lf-card flex min-h-0 flex-col overflow-hidden", view === "map" && "hidden lg:flex")}>
          <div className="border-b border-gray-100 p-5 dark:border-gray-800">
            <SearchForm compact initial={last?.params} running={running} onSearch={onSearch} point={point} onClearPoint={() => setPoint(null)} />
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400"><MousePointerClick className="size-3.5" /> Tip: click the map to search around any point.</p>
          </div>
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <ChipSelect value={category} onChange={setCategory} className="flex-1" options={[{ value: "", label: "All categories" }, ...(cats.data?.map((c) => ({ value: c.key, label: c.label })) ?? [])]} />
            <ChipSelect value={band} onChange={setBand} className="flex-1" options={[{ value: "", label: "All scores" }, ...Object.entries(BANDS).map(([k, v]) => ({ value: k, label: v.label.replace(" Opportunity", "") }))]} />
          </div>
          <ul className="custom-scrollbar min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {!items.length && (
              <li className="px-5 py-10 text-center text-sm text-gray-500">{last || all.data?.total ? "No businesses match these filters." : "Search an area to place businesses on the map."}</li>
            )}
            {items.map((b) => (
              <li key={b.id}>
                <button
                  onClick={() => {
                    setActiveId(b.id);
                    setFocus([b.lat, b.lng]);
                    setView("map");
                  }}
                  className={cn("flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]", activeId === b.id && "bg-brand-25 dark:bg-brand-500/10")}
                >
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: BAND_HEX[b.band] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{b.name}</span>
                    <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{b.category_label} · {WEBSITE_STATUS[b.website_status].label}</span>
                  </span>
                  <ScoreBadge score={b.score} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("lf-card relative h-[70vh] overflow-hidden lg:h-auto", view === "list" && "hidden lg:block")}>
          <MapContainer center={center ?? [25, 10]} zoom={center ? 14 : 2} className="size-full" scrollWheelZoom worldCopyJump>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <ClickToPick onPick={setPoint} />
            <FitTo center={center} radius={last?.result.radius ?? null} points={points} focus={focus} />
            {center && last && <Circle center={center} radius={last.result.radius} pathOptions={{ color: "#465fff", weight: 1.5, fillOpacity: 0.05 }} />}
            {point && <Circle center={[point.lat, point.lng]} radius={last?.params.radius ?? 2000} pathOptions={{ color: "#f79009", weight: 1.5, dashArray: "6 6", fillOpacity: 0.04 }} />}
            {items.map((b) => (
              <Marker key={b.id} position={[b.lat, b.lng]} icon={markerIcon(b, activeId === b.id)} eventHandlers={{ click: () => setActiveId(b.id) }}>
                <Popup>
                  <div className="min-w-[200px] font-sans">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-brand-500">{b.category_label}</p>
                    <p className="text-sm font-semibold">{b.name}</p>
                    {b.address && <p className="mt-0.5 text-xs text-gray-500">{b.address}</p>}
                    <p className="mt-2 flex items-center justify-between text-xs">
                      <span>{WEBSITE_STATUS[b.website_status].label}</span>
                      <span className="font-semibold">Score {b.score}</span>
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setOpenId(b.id)} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs font-medium dark:border-gray-700">Details</button>
                      {b.lead_id ? (
                        <Link to={`/leads/${b.lead_id}`} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-success-500 px-2 py-1.5 text-xs font-medium text-white!">
                          <CheckCircle2 className="size-3.5" /> Lead
                        </Link>
                      ) : (
                        <button onClick={() => save.mutate(b.id)} disabled={save.isPending} className="flex flex-1 items-center justify-center gap-1 rounded-md bg-brand-500 px-2 py-1.5 text-xs font-medium text-white">
                          <BookmarkPlus className="size-3.5" /> Save lead
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="pointer-events-none absolute bottom-6 left-3 z-[400] rounded-lg bg-white/95 px-3 py-2 text-[11px] shadow-theme-md dark:bg-gray-900/95">
            {Object.entries(BAND_HEX).map(([k, c]) => (
              <span key={k} className="mr-3 inline-flex items-center gap-1.5 text-gray-600 last:mr-0 dark:text-gray-300">
                <span className="size-2.5 rounded-full" style={{ background: c }} />
                {BANDS[k as keyof typeof BANDS].label.replace(" Opportunity", "")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BusinessSheet id={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
