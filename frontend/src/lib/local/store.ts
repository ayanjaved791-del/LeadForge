// Browser storage for the frontend-only edition of LeadForge.
// All records live in localStorage under one key; every record (except users) carries workspace_id.
export type Row = Record<string, any>;

export interface DB {
  version: 1;
  users: Row[];
  workspaces: Row[];
  members: Row[];
  businesses: Row[];
  leads: Row[];
  contacts: Row[];
  notes: Row[];
  activities: Row[];
  tasks: Row[];
  follow_ups: Row[];
  events: Row[];
  templates: Row[];
  audits: Row[];
  notifications: Row[];
  saved_searches: Row[];
  usage: Row[];
}

const KEY = "leadforge:db";
const SESSION_KEY = "leadforge:session";
const CACHE_KEY = "leadforge:cache";

const empty = (): DB => ({
  version: 1,
  users: [], workspaces: [], members: [], businesses: [], leads: [], contacts: [], notes: [], activities: [],
  tasks: [], follow_ups: [], events: [], templates: [], audits: [], notifications: [], saved_searches: [], usage: [],
});

let cache: DB | null = null;

export function db(): DB {
  if (!cache) {
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    } catch {
      cache = empty();
    }
  }
  return cache!;
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch (e) {
    throw new Error("Browser storage is full. Delete some discovered businesses or export and clear your data in Settings.");
  }
}

export function exportAll(): string {
  return JSON.stringify(db(), null, 2);
}

export function importAll(json: string): void {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users)) throw new Error("This file is not a LeadForge backup.");
  cache = { ...empty(), ...parsed };
  save();
}

export function clearAll(): void {
  cache = empty();
  [KEY, SESSION_KEY, CACHE_KEY].forEach((k) => localStorage.removeItem(k));
}

export interface Session {
  user_id: string;
  workspace_id: string;
}
export const getSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
};
export const setSession = (s: Session | null) => (s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY));

// --- small response cache for OpenStreetMap requests (keeps us within their fair-use policy)
export function cacheGet<T>(key: string): T | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const hit = all[key];
    return hit && hit.expires > Date.now() ? (hit.value as T) : undefined;
  } catch {
    return undefined;
  }
}
export function cachePut(key: string, value: unknown, ttlMs: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const now = Date.now();
    for (const k of Object.keys(all)) if (all[k].expires < now) delete all[k];
    all[key] = { value, expires: now + ttlMs };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
