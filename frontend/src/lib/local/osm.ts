// OpenStreetMap discovery straight from the browser (Nominatim + Overpass both allow CORS).
import { cacheGet, cachePut } from "./store";

export const CATEGORIES: Record<string, { label: string; tags: [string, string][] }> = {
  restaurant: { label: "Restaurants", tags: [["amenity", "restaurant"], ["amenity", "fast_food"]] },
  cafe: { label: "Cafes", tags: [["amenity", "cafe"]] },
  hotel: { label: "Hotels", tags: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "motel"]] },
  clinic: { label: "Clinics", tags: [["amenity", "clinic"], ["healthcare", "clinic"], ["amenity", "doctors"]] },
  hospital: { label: "Hospitals", tags: [["amenity", "hospital"]] },
  dentist: { label: "Dentists", tags: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  school: { label: "Schools", tags: [["amenity", "school"]] },
  university: { label: "Universities", tags: [["amenity", "university"], ["amenity", "college"]] },
  clothing: { label: "Clothing stores", tags: [["shop", "clothes"], ["shop", "boutique"]] },
  supermarket: { label: "Supermarkets", tags: [["shop", "supermarket"]] },
  gym: { label: "Gyms", tags: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]] },
  salon: { label: "Salons", tags: [["shop", "hairdresser"], ["shop", "beauty"]] },
  real_estate: { label: "Real estate agencies", tags: [["office", "estate_agent"], ["shop", "estate_agent"]] },
  car_dealership: { label: "Car dealerships", tags: [["shop", "car"]] },
  travel_agency: { label: "Travel agencies", tags: [["shop", "travel_agency"], ["office", "travel_agent"]] },
  furniture: { label: "Furniture stores", tags: [["shop", "furniture"]] },
  electronics: { label: "Electronics stores", tags: [["shop", "electronics"], ["shop", "computer"], ["shop", "mobile_phone"]] },
  law_firm: { label: "Law firms", tags: [["office", "lawyer"]] },
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

let lastNominatim = 0;
async function throttleNominatim() {
  // Nominatim usage policy: max 1 request per second.
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
}

export class OsmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function geocode(q: string): Promise<{ lat: number; lng: number; display_name: string } | null> {
  const key = "geo|" + q.trim().toLowerCase();
  const hit = cacheGet<{ lat: number; lng: number; display_name: string } | null>(key);
  if (hit !== undefined) return hit;
  await throttleNominatim();
  let res: Response;
  try {
    res = await fetch(`${NOMINATIM}/search?${new URLSearchParams({ q, format: "jsonv2", limit: "1" })}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new OsmError(502, "Could not reach OpenStreetMap. Check your internet connection.");
  }
  if (res.status === 429) throw new OsmError(429, "OpenStreetMap rate limit reached. Please wait a minute and try again.");
  if (!res.ok) throw new OsmError(502, `OpenStreetMap geocoding error (HTTP ${res.status}).`);
  const rows = await res.json();
  const out = Array.isArray(rows) && rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon), display_name: String(rows[0].display_name ?? q) } : null;
  cachePut(key, out, 30 * 86400_000);
  return out;
}

export interface OsmBusiness {
  osm_type: string;
  osm_id: number;
  name: string;
  category: string;
  street: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  socials: Record<string, string>;
  opening_hours: string | null;
  lat: number;
  lng: number;
}

export async function searchBusinesses(category: string, lat: number, lng: number, radius: number): Promise<OsmBusiness[]> {
  const cat = CATEGORIES[category];
  if (!cat) throw new OsmError(422, "Unknown category.");
  const key = `ovp|${category}|${lat.toFixed(4)}|${lng.toFixed(4)}|${radius}`;
  const hit = cacheGet<OsmBusiness[]>(key);
  if (hit) return hit;

  const parts = cat.tags.map(([k, v]) => `nwr["${k}"="${v}"]["name"](around:${radius},${lat.toFixed(6)},${lng.toFixed(6)});`).join("");
  const ql = `[out:json][timeout:25];(${parts});out center tags 300;`;
  let json: any = null;
  let lastErr = "";
  for (const endpoint of OVERPASS) {
    try {
      const res = await fetch(endpoint, { method: "POST", body: new URLSearchParams({ data: ql }) });
      if (res.status === 429) { lastErr = "Overpass rate limit reached. Please wait a minute."; continue; }
      if (res.status === 504) { lastErr = "Overpass API is busy. Try a smaller radius or retry shortly."; continue; }
      if (!res.ok) { lastErr = `Overpass error (HTTP ${res.status}).`; continue; }
      json = await res.json();
      break;
    } catch {
      lastErr = "Could not reach the Overpass API. Check your internet connection.";
    }
  }
  if (!json?.elements) throw new OsmError(502, lastErr || "OpenStreetMap returned an unexpected response.");

  const out: OsmBusiness[] = [];
  for (const el of json.elements) {
    const t: Record<string, string> = el.tags ?? {};
    const name = (t.name ?? "").trim();
    const la = el.lat ?? el.center?.lat;
    const lo = el.lon ?? el.center?.lon;
    if (!name || la === undefined || lo === undefined) continue;
    const pick = (...keys: string[]) => {
      for (const k of keys) if (t[k]?.trim()) return t[k].trim().slice(0, 490);
      return null;
    };
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ").trim();
    const socials: Record<string, string> = {};
    for (const net of ["facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "whatsapp"]) {
      const v = pick(`contact:${net}`, net);
      if (v) socials[net] = v;
    }
    let email = pick("email", "contact:email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = null;
    out.push({
      osm_type: el.type,
      osm_id: Number(el.id),
      name: name.slice(0, 250),
      category,
      street: street || pick("addr:full"),
      city: pick("addr:city", "addr:town", "addr:village"),
      postcode: pick("addr:postcode"),
      country: pick("addr:country"),
      phone: pick("phone", "contact:phone", "contact:mobile"),
      website: pick("website", "contact:website", "url"),
      email,
      socials,
      opening_hours: pick("opening_hours"),
      lat: Number(la),
      lng: Number(lo),
    });
  }
  cachePut(key, out, 86400_000);
  return out;
}
