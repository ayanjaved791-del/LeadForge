// Browser storage for HelloHR.
// All records live in localStorage under one key; every record (except users) carries workspace_id.
export type Row = Record<string, any>;

export const TABLES = [
  "users", "workspaces", "members", "departments", "employees", "employee_events", "attendance", "leave_types", "leave_requests",
  "holidays", "payroll_runs", "payslips", "jobs", "candidates", "interviews", "reviews", "goals", "notifications",
] as const;
export type Table = (typeof TABLES)[number];
export type DB = { version: 2 } & Record<Table, Row[]>;

const KEY = "hellohr:db";
const SESSION_KEY = "hellohr:session";

const empty = (): DB => Object.assign({ version: 2 as const }, Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as Record<Table, Row[]>);

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
    throw new Error("Browser storage is full. Download a backup and remove old records in Settings → Data.");
  }
}

export function exportAll(): string {
  return JSON.stringify(db(), null, 2);
}

export function importAll(json: string): void {
  const parsed = JSON.parse(json);
  if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.users) || !Array.isArray(parsed.employees)) throw new Error("This file is not a HelloHR backup.");
  cache = { ...empty(), ...parsed };
  save();
}

export function clearAll(): void {
  cache = empty();
  [KEY, SESSION_KEY].forEach((k) => localStorage.removeItem(k));
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

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
