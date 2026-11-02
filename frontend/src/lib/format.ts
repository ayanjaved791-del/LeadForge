import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";

let currency = "USD";
export const setCurrency = (c: string) => {
  currency = c || "USD";
};
export const getCurrency = () => currency;

export const money = (v: number | null | undefined, compact = false) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: compact || Math.abs(v ?? 0) >= 1000 ? 0 : 2,
    notation: compact && Math.abs(v ?? 0) >= 100000 ? "compact" : "standard",
  }).format(v ?? 0);

export const num = (v: number | null | undefined) => new Intl.NumberFormat().format(v ?? 0);

export const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : `${v.toFixed(digits)}%`);

export const change = (cur: number, prev: number): number | null => {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / prev) * 100;
};

export const dt = (iso: string | null | undefined, fmt = "MMM d, yyyy") => (iso ? format(new Date(iso), fmt) : "—");
export const dtTime = (iso: string | null | undefined) => (iso ? format(new Date(iso), "MMM d, yyyy · h:mm a") : "—");
export const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "—");
export const relDay = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
  if (isYesterday(d)) return `Yesterday, ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
};

/** ISO string → value for <input type="datetime-local"> in local time. */
export const toLocalInput = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");
/** <input type="datetime-local"> value → ISO (UTC) string. */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const safeUrl = (u: string | null | undefined) => {
  if (!u) return null;
  const v = /^https?:\/\//i.test(u) ? u : `http://${u}`;
  try {
    const p = new URL(v);
    return p.protocol === "http:" || p.protocol === "https:" ? p.toString() : null;
  } catch {
    return null;
  }
};
