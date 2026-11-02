// In-browser implementation of the LeadForge REST API (frontend-only edition).
// Mirrors the PHP API's routes and response shapes so pages work unchanged.
import { ApiError } from "../api";
import { db, getSession, nowIso, save, setSession, uuid, type Row } from "./store";
import * as osm from "./osm";
import * as scoring from "./scoring";
import * as web from "./web";

type Q = Record<string, string | undefined>;
type Handler = (ctx: { body: any; query: Q; params: Record<string, string> }) => unknown | Promise<unknown>;

const LIMITS: Record<string, number> = { discovery_search: 300, website_check: 2000, website_audit: 300, lead_export: 100 };
const STATUSES = ["new", "contacted", "interested", "qualified", "proposal_sent", "negotiation", "won", "lost"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const WEBSITE_LABELS: Record<string, string> = { available: "Website Available", no_website: "No Website Found", inactive: "Website Inactive", needs_review: "Needs Review", unknown: "Unknown" };

// ------------------------------------------------------------------ helpers
const fail = (status: number, message: string, fields: Record<string, string> = {}): never => {
  throw new ApiError(status, message, fields);
};
const invalid = (fields: Record<string, string>): never => fail(422, "Validation failed", fields);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : v === null || v === undefined ? null : String(v).slice(0, max)) || null;
const iso = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const now = () => Date.now();
const isPast = (v: string | null | undefined) => !!v && new Date(v).getTime() < now();
const sameDay = (a: string, b = new Date()) => new Date(a).toDateString() === b.toDateString();
const like = (hay: unknown, q: string) => String(hay ?? "").toLowerCase().includes(q.toLowerCase());

function auth() {
  const s = getSession();
  const user = s && db().users.find((u) => u.id === s.user_id);
  if (!s || !user) fail(401, "Authentication required");
  let member = db().members.find((m) => m.workspace_id === s!.workspace_id && m.user_id === user!.id);
  if (!member) {
    member = db().members.find((m) => m.user_id === user!.id);
    if (!member) fail(403, "You are not a member of any workspace.");
    setSession({ user_id: user!.id, workspace_id: member!.workspace_id });
  }
  return { user: user!, wsId: member!.workspace_id as string, role: member!.role as string };
}
const ws = () => auth().wsId;
const rows = (t: keyof ReturnType<typeof db>) => (db()[t] as Row[]).filter((r) => r.workspace_id === ws());
function find(t: keyof ReturnType<typeof db>, id: string, label = "Record"): Row {
  const r = (db()[t] as Row[]).find((x) => x.id === id && x.workspace_id === ws());
  if (!r) fail(404, `${label} not found`);
  return r!;
}
function remove(t: keyof ReturnType<typeof db>, pred: (r: Row) => boolean) {
  (db() as any)[t] = (db()[t] as Row[]).filter((r) => !pred(r));
}
function page<T>(items: T[], q: Q, def = 50) {
  const limit = Math.max(1, Math.min(500, Number(q.limit) || def));
  const p = Math.max(1, Number(q.page) || 1);
  return { total: items.length, page: p, limit, items: items.slice((p - 1) * limit, p * limit) };
}
function requireRole(...roles: string[]) {
  if (!roles.includes(auth().role)) fail(403, "Your role does not allow this action.");
}
const userName = (id: string | null) => db().users.find((u) => u.id === id)?.name ?? null;

// usage quotas (free plan)
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const used = (metric: string) => rows("usage").filter((u) => u.metric === metric && new Date(u.at).getTime() >= monthStart()).length;
function consume(metric: string) {
  if (used(metric) + 1 > LIMITS[metric]) fail(402, `Monthly free-plan limit reached for ${metric.replace(/_/g, " ")}. It resets on the 1st of next month.`);
  db().usage.push({ id: uuid(), workspace_id: ws(), user_id: auth().user.id, metric, at: nowIso() });
}
const usageSummary = () => Object.keys(LIMITS).map((metric) => ({ metric, used: used(metric), limit: LIMITS[metric] }));

// password hashing (PBKDF2-SHA256 via Web Crypto)
async function hashPassword(password: string, salt?: string) {
  const s = salt ?? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(s), iterations: 150_000 }, key, 256);
  return { salt: s, hash: [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("") };
}
const strongPassword = (pw: string) => {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) invalid({ password: "Use at least 8 characters with letters and numbers." });
};

// ------------------------------------------------------------------ formatting
const overrides = (wsId: string): Record<string, number> => db().workspaces.find((w) => w.id === wsId)?.settings?.scoring ?? {};
const latestAudit = (businessId: string) =>
  db().audits.filter((a) => a.business_id === businessId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

function rescore(b: Row) {
  const s = scoring.score(b, latestAudit(b.id), overrides(b.workspace_id));
  b.opportunity_score = s.score;
  b.score_breakdown = s.items;
}

function formatBusiness(b: Row) {
  const lead = db().leads.find((l) => l.business_id === b.id && l.workspace_id === b.workspace_id);
  const address = [b.street, b.city, b.postcode, b.country].filter(Boolean).join(", ");
  return {
    id: b.id, osm_type: b.osm_type, osm_id: b.osm_id, osm_url: `https://www.openstreetmap.org/${b.osm_type}/${b.osm_id}`,
    name: b.name, category: b.category, category_label: osm.CATEGORIES[b.category]?.label ?? b.category,
    address: address || null, street: b.street, city: b.city, postcode: b.postcode, country: b.country,
    phone: b.phone, website: b.website, email: b.email, socials: b.socials ?? {}, opening_hours: b.opening_hours,
    lat: b.lat, lng: b.lng, website_status: b.website_status, website_status_label: WEBSITE_LABELS[b.website_status] ?? "Unknown",
    website_check_note: b.website_check_note ?? null, website_http_status: null, website_checked_at: b.website_checked_at ?? null,
    score: b.opportunity_score, band: scoring.band(b.opportunity_score), score_breakdown: b.score_breakdown ?? [],
    lead_id: lead?.id ?? null, discovered_at: b.discovered_at,
  };
}

function formatLead(l: Row): Row {
  const b = l.business_id ? db().businesses.find((x) => x.id === l.business_id) : null;
  const pending = db().follow_ups.filter((f) => f.lead_id === l.id && f.status === "pending").map((f) => f.due_at).sort();
  const acts = db().activities
    .filter((a) => a.lead_id === l.id && !["system", "status_change"].includes(a.type) && new Date(a.occurred_at).getTime() <= now())
    .map((a) => a.occurred_at)
    .sort();
  return {
    ...l,
    opportunity_score: b ? b.opportunity_score : null,
    website_status: b ? b.website_status : null,
    lat: b ? b.lat : null,
    lng: b ? b.lng : null,
    next_follow_up_at: pending[0] ?? null,
    last_activity_at: acts[acts.length - 1] ?? null,
    tags: l.tags ?? [],
  };
}

const formatActivity = (a: Row) => {
  const c = a.contact_id ? db().contacts.find((x) => x.id === a.contact_id) : null;
  return { ...a, author: userName(a.user_id), contact_name: c ? [c.first_name, c.last_name].filter(Boolean).join(" ") : null, lead_name: db().leads.find((l) => l.id === a.lead_id)?.name };
};

function logActivity(leadId: string, data: Row) {
  db().activities.push({ id: uuid(), workspace_id: ws(), lead_id: leadId, user_id: auth().user.id, contact_id: null, direction: null, subject: null, body: null, outcome: null, duration_minutes: null, occurred_at: nowIso(), created_at: nowIso(), ...data });
}
const touchLead = (id: string | null) => {
  const l = id && db().leads.find((x) => x.id === id);
  if (l) l.updated_at = nowIso();
};
const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function applyStatus(lead: Row, next: string) {
  if (next === lead.status) return;
  lead.won_at = next === "won" ? lead.won_at ?? nowIso() : null;
  lead.lost_at = next === "lost" ? lead.lost_at ?? nowIso() : null;
  logActivity(lead.id, { type: "status_change", subject: "Status changed", body: `${statusLabel(lead.status)} → ${statusLabel(next)}` });
  lead.status = next;
}

// ------------------------------------------------------------------ handlers
const me = () => {
  const { user, wsId, role } = auth();
  const w = db().workspaces.find((x) => x.id === wsId)!;
  const { password_hash, salt, ...u } = user;
  return {
    user: u,
    workspace: { id: w.id, name: w.name, slug: w.slug, settings: w.settings, created_at: w.created_at, role },
    workspaces: db().members.filter((m) => m.user_id === user.id).map((m) => ({ id: m.workspace_id, name: db().workspaces.find((x) => x.id === m.workspace_id)?.name, role: m.role })),
    csrf: "local",
  };
};

async function register({ body }: { body: any }) {
  const name = str(body.name, 120);
  const email = (str(body.email, 191) ?? "").toLowerCase();
  const password = String(body.password ?? "");
  const errors: Record<string, string> = {};
  if (!name || name.length < 2) errors.name = "This field is required.";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  if (Object.keys(errors).length) invalid(errors);
  strongPassword(password);
  if (db().users.some((u) => u.email === email)) invalid({ email: "An account with this email already exists in this browser." });
  const { salt, hash } = await hashPassword(password);
  const uid = uuid();
  const wid = uuid();
  const t = nowIso();
  db().users.push({ id: uid, email, name, password_hash: hash, salt, email_verified_at: null, created_at: t, last_login_at: t, job_title: null, company: null, phone: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", currency: "USD", default_city: null, default_country: null, onboarded_at: null });
  const wsName = str(body.workspace, 120) || `${name}'s Workspace`;
  db().workspaces.push({ id: wid, name: wsName, slug: wsName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), owner_id: uid, settings: {}, created_at: t });
  db().members.push({ id: uuid(), workspace_id: wid, user_id: uid, role: "owner", created_at: t });
  save();
  setSession({ user_id: uid, workspace_id: wid });
  return { user_id: uid };
}

async function login({ body }: { body: any }) {
  const email = String(body.email ?? "").trim().toLowerCase();
  const user = db().users.find((u) => u.email === email);
  const check = await hashPassword(String(body.password ?? ""), user?.salt ?? "x");
  if (!user || check.hash !== user.password_hash) fail(401, "Incorrect email or password.");
  user!.last_login_at = nowIso();
  save();
  const m = db().members.find((x) => x.user_id === user!.id);
  setSession({ user_id: user!.id, workspace_id: m?.workspace_id });
  return {};
}

function businessList(q: Q) {
  let items = rows("businesses");
  if (q.q) items = items.filter((b) => like(b.name, q.q!) || like(b.city, q.q!) || like(b.street, q.q!));
  if (q.category) items = items.filter((b) => b.category === q.category);
  if (q.website_status) items = items.filter((b) => b.website_status === q.website_status);
  if (q.min_score) items = items.filter((b) => b.opportunity_score >= Number(q.min_score));
  const saved = new Set(rows("leads").map((l) => l.business_id));
  if (q.saved === "1") items = items.filter((b) => saved.has(b.id));
  if (q.saved === "0") items = items.filter((b) => !saved.has(b.id));
  items.sort(q.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : q.sort === "recent" ? (a, b) => b.discovered_at.localeCompare(a.discovered_at) : (a, b) => b.opportunity_score - a.opportunity_score || a.name.localeCompare(b.name));
  const p = page(items, q, 50);
  return { ...p, items: p.items.map(formatBusiness) };
}

function showBusiness(id: string) {
  const b = find("businesses", id, "Business");
  const a = latestAudit(b.id);
  return { ...formatBusiness(b), latest_audit: a ? { ...a } : null };
}

async function checkBusiness(b: Row) {
  if (!b.website) {
    const init = web.initial(null, b.socials);
    Object.assign(b, { website_status: init.status, website_check_note: init.note, website_checked_at: nowIso() });
  } else {
    consume("website_check");
    const r = await web.check(b.website);
    Object.assign(b, { website_status: r.status, website_check_note: r.note, website_checked_at: nowIso() });
  }
  rescore(b);
}

function leadFilters(q: Q) {
  let items = rows("leads");
  if (q.q) items = items.filter((l) => like(l.name, q.q!) || like(l.email, q.q!) || like(l.phone, q.q!) || like(l.address, q.q!));
  if (q.status) items = items.filter((l) => l.status === q.status);
  if (q.priority) items = items.filter((l) => l.priority === q.priority);
  if (q.category) items = items.filter((l) => l.category === q.category);
  if (q.tag) items = items.filter((l) => (l.tags ?? []).includes(q.tag));
  const fu = (l: Row, fn: (f: Row) => boolean) => db().follow_ups.some((f) => f.lead_id === l.id && f.status === "pending" && fn(f));
  if (q.follow_up === "overdue") items = items.filter((l) => fu(l, (f) => isPast(f.due_at)));
  if (q.follow_up === "upcoming") items = items.filter((l) => fu(l, (f) => !isPast(f.due_at)));
  return items.map(formatLead);
}

function leadDetail(id: string) {
  const l = find("leads", id, "Lead");
  const b = l.business_id ? db().businesses.find((x) => x.id === l.business_id) : null;
  const d = db();
  return {
    ...formatLead(l),
    business: b ? formatBusiness(b) : null,
    notes: d.notes.filter((n) => n.lead_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => ({ ...n, author: userName(n.user_id) })),
    activities: d.activities.filter((a) => a.lead_id === id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).map(formatActivity),
    follow_ups: d.follow_ups.filter((f) => f.lead_id === id).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || a.due_at.localeCompare(b.due_at)),
    tasks: d.tasks.filter((t) => t.lead_id === id).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || String(a.due_at ?? "9").localeCompare(String(b.due_at ?? "9"))),
    contacts: d.contacts.filter((c) => c.lead_id === id),
    audits: d.audits.filter((a) => a.lead_id === id || (l.business_id && a.business_id === l.business_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
  };
}

function leadInput(body: any, partial: boolean) {
  const errors: Record<string, string> = {};
  const out: Row = {};
  for (const k of ["name", "category", "address", "phone", "email", "website", "lost_reason"]) if (k in body) out[k] = str(body[k], k === "name" ? 255 : 500);
  if (!partial && !out.name && !body.business_id) errors.name = "This field is required.";
  if ("name" in body && !out.name && partial) errors.name = "This field is required.";
  if (out.email && !EMAIL.test(out.email)) errors.email = "Enter a valid email address.";
  if (out.website && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(out.website)) errors.website = "Enter a valid http(s) URL.";
  if ("status" in body) STATUSES.includes(body.status) ? (out.status = body.status) : (errors.status = "Invalid option selected.");
  if ("priority" in body) PRIORITIES.includes(body.priority) ? (out.priority = body.priority) : (errors.priority = "Invalid option selected.");
  if ("deal_value" in body) {
    const v = Number(body.deal_value);
    isNaN(v) ? (errors.deal_value = "Must be a number.") : (out.deal_value = Math.max(0, v));
  }
  if (Object.keys(errors).length) invalid(errors);
  return out;
}
const cleanTags = (tags: unknown) => [...new Map((Array.isArray(tags) ? tags : []).filter((t) => typeof t === "string" && t.trim()).map((t: string) => [t.trim().toLowerCase(), t.trim().slice(0, 50)])).values()].slice(0, 20);

function csv(rowsIn: (string | number | null)[][]) {
  return "﻿" + rowsIn.map((r) => r.map((v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

function syncDue() {
  const { user, wsId } = auth();
  for (const f of db().follow_ups) {
    if (f.workspace_id !== wsId || f.status !== "pending" || f.notified_at || !isPast(f.due_at)) continue;
    const lead = db().leads.find((l) => l.id === f.lead_id);
    db().notifications.push({ id: uuid(), workspace_id: wsId, user_id: user.id, type: "follow_up_due", title: `Follow-up due: ${lead?.name ?? "lead"}`, body: `${f.channel[0].toUpperCase()}${f.channel.slice(1)} follow-up is due.`, link: `/leads/${f.lead_id}`, read_at: null, created_at: nowIso() });
    f.notified_at = nowIso();
  }
}

function dashboard(q: Q) {
  const leads = rows("leads");
  const year = Number(q.year) || new Date().getFullYear();
  const t = now();
  const DAY = 86400_000;
  const within = (v: string | null, from: number, to = Infinity) => !!v && new Date(v).getTime() >= t - from && new Date(v).getTime() < t - (to === Infinity ? -1 : to);
  const sum = (arr: Row[]) => arr.reduce((s, l) => s + Number(l.deal_value || 0), 0);
  const won = leads.filter((l) => l.status === "won");
  const lost = leads.filter((l) => l.status === "lost");
  const kpi = {
    total_leads: leads.length,
    new_leads: leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    qualified: leads.filter((l) => l.status === "qualified").length,
    won: won.length,
    lost: lost.length,
    revenue: sum(won),
    pipeline_value: sum(leads.filter((l) => !["won", "lost"].includes(l.status))),
    leads_30d: leads.filter((l) => within(l.created_at, 30 * DAY)).length,
    leads_prev_30d: leads.filter((l) => within(l.created_at, 60 * DAY, 30 * DAY)).length,
    revenue_30d: sum(won.filter((l) => within(l.won_at, 30 * DAY))),
    revenue_prev_30d: sum(won.filter((l) => within(l.won_at, 60 * DAY, 30 * DAY))),
    conversion_rate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : null,
    win_rate_all: leads.length ? Math.round((won.length / leads.length) * 1000) / 10 : null,
  };
  const biz = rows("businesses");
  const pend = rows("follow_ups").filter((f) => f.status === "pending");
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, leads: 0, won: 0, lost: 0, revenue: 0 }));
  for (const l of leads) {
    const c = new Date(l.created_at);
    if (c.getFullYear() === year) monthly[c.getMonth()].leads++;
    if (l.status === "won" && l.won_at && new Date(l.won_at).getFullYear() === year) {
      monthly[new Date(l.won_at).getMonth()].won++;
      monthly[new Date(l.won_at).getMonth()].revenue += Number(l.deal_value || 0);
    }
    if (l.status === "lost" && l.lost_at && new Date(l.lost_at).getFullYear() === year) monthly[new Date(l.lost_at).getMonth()].lost++;
  }
  const daily = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(t - (29 - i) * DAY);
    const key = d.toISOString().slice(0, 10);
    const dayLeads = leads.filter((l) => sameDay(l.created_at, d));
    return { date: key, leads: dayLeads.length, value: sum(dayLeads) };
  });
  const years = [...new Set([new Date().getFullYear(), ...leads.map((l) => new Date(l.created_at).getFullYear())])].sort((a, b) => b - a);
  const w = db().workspaces.find((x) => x.id === ws())!;
  return {
    kpi,
    businesses: { total: biz.length, no_website: biz.filter((b) => b.website_status === "no_website").length, inactive: biz.filter((b) => b.website_status === "inactive").length, high_opportunity: biz.filter((b) => b.opportunity_score >= 50).length, d30: biz.filter((b) => within(b.discovered_at, 30 * DAY)).length },
    follow_ups: { overdue: pend.filter((f) => isPast(f.due_at)).length, pending: pend.length, today: pend.filter((f) => sameDay(f.due_at)).length },
    monthly, year, years, daily,
    upcoming_follow_ups: [...pend].sort((a, b) => a.due_at.localeCompare(b.due_at)).slice(0, 5).map((f) => ({ ...f, lead_name: db().leads.find((l) => l.id === f.lead_id)?.name })),
    recent_activity: rows("activities").filter((a) => a.type !== "system" && new Date(a.occurred_at).getTime() <= now()).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 6).map((a) => {
      const l = db().leads.find((x) => x.id === a.lead_id);
      return { ...a, lead_name: l?.name, deal_value: Number(l?.deal_value ?? 0), status: l?.status };
    }),
    top_opportunities: [...biz].sort((a, b) => b.opportunity_score - a.opportunity_score || b.discovered_at.localeCompare(a.discovered_at)).slice(0, 5).map((b) => ({ id: b.id, name: b.name, category: b.category, category_label: osm.CATEGORIES[b.category]?.label ?? b.category, city: b.city, opportunity_score: b.opportunity_score, website_status: b.website_status, lead_id: formatBusiness(b).lead_id })),
    workspace: { name: w.name, created_at: w.created_at, plan: "free", status: "active", members: rows("members").length },
    usage: usageSummary(),
  };
}

function analytics(q: Q) {
  const days = [7, 30, 90, 180, 365].includes(Number(q.days)) ? Number(q.days) : 90;
  const leads = rows("leads");
  const biz = rows("businesses");
  const DAY = 86400_000;
  const statuses = STATUSES.map((s) => {
    const ls = leads.filter((l) => l.status === s);
    return { status: s, count: ls.length, value: ls.reduce((a, l) => a + Number(l.deal_value || 0), 0) };
  });
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(now() - (days - 1 - i) * DAY);
    const wonDay = leads.filter((l) => l.status === "won" && l.won_at && sameDay(l.won_at, d));
    return { date: d.toISOString().slice(0, 10), leads: leads.filter((l) => sameDay(l.created_at, d)).length, discovered: biz.filter((b) => sameDay(b.discovered_at, d)).length, won: wonDay.length, revenue: wonDay.reduce((a, l) => a + Number(l.deal_value || 0), 0) };
  });
  const catMap = new Map<string, { leads: number; won: number; revenue: number }>();
  for (const l of leads) {
    const k = l.category ?? "";
    const c = catMap.get(k) ?? { leads: 0, won: 0, revenue: 0 };
    c.leads++;
    if (l.status === "won") { c.won++; c.revenue += Number(l.deal_value || 0); }
    catMap.set(k, c);
  }
  const won = leads.filter((l) => l.status === "won");
  const cycles = won.filter((l) => l.won_at).map((l) => (new Date(l.won_at).getTime() - new Date(l.created_at).getTime()) / DAY);
  const lostReasons = new Map<string, number>();
  leads.filter((l) => l.status === "lost" && l.lost_reason).forEach((l) => lostReasons.set(l.lost_reason, (lostReasons.get(l.lost_reason) ?? 0) + 1));
  const tasks = rows("tasks");
  const since = now() - days * DAY;
  const actCounts = new Map<string, number>();
  rows("activities").filter((a) => ["call", "email", "meeting", "whatsapp", "note"].includes(a.type) && new Date(a.occurred_at).getTime() >= since).forEach((a) => actCounts.set(a.type, (actCounts.get(a.type) ?? 0) + 1));
  const wsCounts = new Map<string, number>();
  biz.forEach((b) => wsCounts.set(b.website_status, (wsCounts.get(b.website_status) ?? 0) + 1));
  return {
    days, statuses, series,
    categories: [...catMap.entries()].sort((a, b) => b[1].leads - a[1].leads).slice(0, 12).map(([k, v]) => ({ category: k, label: osm.CATEGORIES[k]?.label ?? (k || "Uncategorised"), ...v })),
    website_status: [...wsCounts.entries()].map(([status, count]) => ({ status, count })),
    score_bands: { low: biz.filter((b) => b.opportunity_score < 25).length, medium: biz.filter((b) => b.opportunity_score >= 25 && b.opportunity_score < 50).length, high: biz.filter((b) => b.opportunity_score >= 50 && b.opportunity_score < 75).length, very_high: biz.filter((b) => b.opportunity_score >= 75).length },
    activity: [...actCounts.entries()].map(([type, count]) => ({ type, count })),
    avg_sales_cycle_days: cycles.length ? Math.round((cycles.reduce((a, b) => a + b, 0) / cycles.length) * 10) / 10 : null,
    avg_deal_value: won.length ? Math.round((won.reduce((a, l) => a + Number(l.deal_value || 0), 0) / won.length) * 100) / 100 : null,
    lost_reasons: [...lostReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, count]) => ({ reason, count })),
    tasks: { done: tasks.filter((t) => t.status === "done").length, open: tasks.filter((t) => t.status !== "done").length, overdue: tasks.filter((t) => t.status !== "done" && isPast(t.due_at)).length },
  };
}

// generic CRUD for simple workspace tables
function contactInput(body: any) {
  const out: Row = {};
  for (const k of ["first_name", "last_name", "job_title", "email", "phone", "whatsapp", "notes"]) if (k in body) out[k] = str(body[k], k === "notes" ? 5000 : 191);
  if ("first_name" in body && !out.first_name) invalid({ first_name: "This field is required." });
  if (out.email && !EMAIL.test(out.email)) invalid({ email: "Enter a valid email address." });
  if ("lead_id" in body) out.lead_id = body.lead_id ? find("leads", body.lead_id, "Lead").id : null;
  return out;
}
function taskInput(body: any) {
  const out: Row = {};
  if ("title" in body) { out.title = str(body.title, 255); if (!out.title) invalid({ title: "This field is required." }); }
  if ("description" in body) out.description = str(body.description, 5000);
  if ("priority" in body && PRIORITIES.includes(body.priority)) out.priority = body.priority;
  if ("status" in body && ["todo", "in_progress", "done"].includes(body.status)) out.status = body.status;
  if ("due_at" in body) out.due_at = iso(body.due_at);
  if ("lead_id" in body) out.lead_id = body.lead_id ? find("leads", body.lead_id, "Lead").id : null;
  if ("assigned_to" in body) {
    if (body.assigned_to && !rows("members").some((m) => m.user_id === body.assigned_to)) invalid({ assigned_to: "Assignee must be a workspace member." });
    out.assigned_to = body.assigned_to || null;
  }
  return out;
}
function eventInput(body: any) {
  const out: Row = {};
  if ("title" in body) { out.title = str(body.title, 255); if (!out.title) invalid({ title: "This field is required." }); }
  for (const k of ["description", "location"]) if (k in body) out[k] = str(body[k], 5000);
  if ("type" in body && ["meeting", "call", "demo", "other"].includes(body.type)) out.type = body.type;
  for (const k of ["starts_at", "ends_at"]) if (k in body) { out[k] = iso(body[k]); if (!out[k]) invalid({ [k]: "Enter a valid date." }); }
  if ("lead_id" in body) out.lead_id = body.lead_id ? find("leads", body.lead_id, "Lead").id : null;
  return out;
}

const routes: [string, string, Handler][] = [
  // auth
  ["GET", "/auth/csrf", () => ({ token: "local" })],
  ["POST", "/auth/register", register],
  ["POST", "/auth/login", login],
  ["POST", "/auth/logout", () => { setSession(null); return {}; }],
  ["GET", "/auth/me", me],
  ["PATCH", "/auth/profile", ({ body }) => {
    const { user } = auth();
    if ("name" in body) { const n = str(body.name, 120); if (!n || n.length < 2) invalid({ name: "Must be at least 2 characters." }); user.name = n; }
    for (const k of ["job_title", "company", "phone", "default_city", "default_country"]) if (k in body) user[k] = str(body[k], 160);
    if (body.timezone) user.timezone = String(body.timezone).slice(0, 64);
    if (body.currency) user.currency = String(body.currency).toUpperCase().slice(0, 3);
    if (body.complete_onboarding) user.onboarded_at = nowIso();
    save();
    return me();
  }],
  ["POST", "/auth/password", async ({ body }) => {
    const { user } = auth();
    if ((await hashPassword(String(body.current_password ?? ""), user.salt)).hash !== user.password_hash) invalid({ current_password: "Current password is incorrect." });
    strongPassword(String(body.password ?? ""));
    Object.assign(user, await hashPassword(String(body.password)).then((h) => ({ salt: h.salt, password_hash: h.hash })));
    save();
    return { changed: true };
  }],
  ["POST", "/auth/forgot-password", () => fail(501, "Password reset by email needs the server edition. In this browser-only edition, accounts live in this browser — you can export/clear your data from Settings → Data.")],
  ["POST", "/auth/reset-password", () => fail(501, "Password reset is not available in the browser-only edition.")],
  ["POST", "/auth/verify-email", () => fail(501, "Email verification is not available in the browser-only edition.")],
  ["POST", "/auth/resend-verification", () => fail(501, "Email verification is not available in the browser-only edition.")],

  // workspace
  ["GET", "/workspace", () => {
    const w = db().workspaces.find((x) => x.id === ws())!;
    return { workspace: { ...w, role: auth().role }, subscription: { plan: "free", status: "active", current_period_start: w.created_at }, counts: { members: rows("members").length, leads: rows("leads").length, businesses: rows("businesses").length }, usage: usageSummary() };
  }],
  ["PATCH", "/workspace", ({ body }) => {
    requireRole("owner", "admin");
    const n = str(body.name, 120);
    if (!n || n.length < 2) invalid({ name: "Must be at least 2 characters." });
    db().workspaces.find((x) => x.id === ws())!.name = n;
    save();
    return {};
  }],
  ["GET", "/workspace/scoring", () => ({ rules: Object.entries(scoring.rules(overrides(ws()))).map(([key, r]) => ({ key, default: scoring.RULES[key].points, ...r })), bands: scoring.BANDS })],
  ["PUT", "/workspace/scoring", ({ body }) => {
    requireRole("owner", "admin");
    const points: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.points ?? {})) {
      if (!scoring.RULES[k] || isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) invalid({ points: `Invalid value for ${k} (0–100).` });
      points[k] = Math.round(Number(v));
    }
    const w = db().workspaces.find((x) => x.id === ws())!;
    w.settings = { ...(w.settings ?? {}), scoring: points };
    rows("businesses").forEach(rescore);
    save();
    return { rules: Object.entries(scoring.rules(points)).map(([key, r]) => ({ key, default: scoring.RULES[key].points, ...r })), bands: scoring.BANDS };
  }],
  ["GET", "/workspace/members", () => rows("members").map((m) => {
    const u = db().users.find((x) => x.id === m.user_id);
    return { id: m.id, role: m.role, created_at: m.created_at, user_id: m.user_id, name: u?.name, email: u?.email };
  })],
  ["POST", "/workspace/members", ({ body }) => {
    requireRole("owner", "admin");
    const u = db().users.find((x) => x.email === String(body.email ?? "").trim().toLowerCase());
    if (!u) invalid({ email: "No account with this email exists in this browser. In the browser-only edition, members must sign up on this same browser." });
    if (rows("members").some((m) => m.user_id === u!.id)) invalid({ email: "This user is already a member." });
    db().members.push({ id: uuid(), workspace_id: ws(), user_id: u!.id, role: body.role === "admin" ? "admin" : "member", created_at: nowIso() });
    save();
    return {};
  }],
  ["DELETE", "/workspace/members/:id", ({ params }) => {
    requireRole("owner", "admin");
    const m = rows("members").find((x) => x.id === params.id);
    if (!m) fail(404, "Member not found");
    if (m!.role === "owner") fail(403, "The workspace owner cannot be removed.");
    remove("members", (x) => x.id === params.id);
    save();
    return {};
  }],

  // discovery
  ["GET", "/discovery/categories", () => Object.entries(osm.CATEGORIES).map(([key, c]) => ({ key, label: c.label }))],
  ["POST", "/discovery/search", async ({ body }) => {
    auth();
    if (!osm.CATEGORIES[body.category]) invalid({ category: "Choose a category." });
    const radius = Number(body.radius);
    if (!(radius >= 200 && radius <= 10000)) invalid({ radius: "Radius must be between 200 m and 10 km." });
    let center: { lat: number; lng: number; display_name: string } | null;
    if (body.lat !== undefined && body.lng !== undefined) {
      center = { lat: Number(body.lat), lng: Number(body.lng), display_name: `${Number(body.lat).toFixed(5)}, ${Number(body.lng).toFixed(5)}` };
    } else {
      const q = [body.area, body.city, body.country].filter((x) => typeof x === "string" && x.trim()).join(", ");
      if (!q) invalid({ city: "Enter a city or pick a point on the map." });
      try { center = await osm.geocode(q); } catch (e) { return fail((e as osm.OsmError).status ?? 502, (e as Error).message); }
      if (!center) invalid({ city: `We couldn't find "${q}" on OpenStreetMap.` });
    }
    consume("discovery_search");
    let found: osm.OsmBusiness[];
    try { found = await osm.searchBusinesses(body.category, center!.lat, center!.lng, radius); } catch (e) { return fail((e as osm.OsmError).status ?? 502, (e as Error).message); }
    const wsId = ws();
    const ids: string[] = [];
    for (const it of found) {
      let b = db().businesses.find((x) => x.workspace_id === wsId && x.osm_type === it.osm_type && x.osm_id === it.osm_id);
      const keepCheck = b && b.website_checked_at && b.website === it.website;
      if (!b) {
        b = { id: uuid(), workspace_id: wsId, discovered_at: nowIso() };
        db().businesses.push(b);
      }
      Object.assign(b, it);
      if (!keepCheck) {
        const init = web.initial(it.website, it.socials);
        Object.assign(b, { website_status: init.status, website_check_note: init.note, website_checked_at: null });
      }
      rescore(b);
      ids.push(b.id);
    }
    save();
    const list = ids.map((id) => db().businesses.find((b) => b.id === id)!).sort((a, b) => b.opportunity_score - a.opportunity_score || a.name.localeCompare(b.name));
    return { center, radius, count: list.length, businesses: list.map(formatBusiness), attribution: "Data © OpenStreetMap contributors, ODbL" };
  }],
  ["GET", "/businesses", ({ query }) => businessList(query)],
  ["POST", "/businesses/check-websites", async ({ body }) => {
    const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 10) : [];
    if (!ids.length) invalid({ ids: "Provide 1–10 business ids." });
    const out = [];
    for (const id of ids) {
      const b = rows("businesses").find((x) => x.id === id);
      if (!b || !b.website) continue;
      await checkBusiness(b);
      out.push(formatBusiness(b));
    }
    save();
    return out;
  }],
  ["GET", "/businesses/:id", ({ params }) => showBusiness(params.id)],
  ["POST", "/businesses/:id/check-website", async ({ params }) => {
    await checkBusiness(find("businesses", params.id, "Business"));
    save();
    return showBusiness(params.id);
  }],
  ["DELETE", "/businesses/:id", ({ params }) => { find("businesses", params.id, "Business"); remove("businesses", (b) => b.id === params.id); db().leads.forEach((l) => { if (l.business_id === params.id) l.business_id = null; }); save(); return {}; }],
  ["GET", "/saved-searches", () => rows("saved_searches").sort((a, b) => b.created_at.localeCompare(a.created_at))],
  ["POST", "/saved-searches", ({ body }) => {
    const name = str(body.name, 120);
    if (!name) invalid({ name: "This field is required." });
    const p = body.params ?? {};
    if (!osm.CATEGORIES[p.category]) invalid({ params: "Invalid search." });
    const params = Object.fromEntries(Object.entries(p).filter(([k]) => ["category", "country", "city", "area", "radius", "lat", "lng"].includes(k)));
    const s = { id: uuid(), workspace_id: ws(), user_id: auth().user.id, name, params, result_count: body.result_count ?? null, last_run_at: nowIso(), created_at: nowIso() };
    db().saved_searches.push(s);
    save();
    return s;
  }],
  ["POST", "/saved-searches/:id/run", ({ params, body }) => { const s = find("saved_searches", params.id, "Saved search"); s.last_run_at = nowIso(); if (typeof body.result_count === "number") s.result_count = body.result_count; save(); return {}; }],
  ["DELETE", "/saved-searches/:id", ({ params }) => { find("saved_searches", params.id, "Saved search"); remove("saved_searches", (s) => s.id === params.id); save(); return {}; }],

  // leads
  ["GET", "/leads", ({ query }) => {
    const items = leadFilters(query);
    const sorters: Record<string, (a: Row, b: Row) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      value: (a, b) => b.deal_value - a.deal_value,
      score: (a, b) => (b.opportunity_score ?? -1) - (a.opportunity_score ?? -1),
      updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
      follow_up: (a, b) => String(a.next_follow_up_at ?? "z").localeCompare(String(b.next_follow_up_at ?? "z")),
      pipeline: (a, b) => (a.position ?? 0) - (b.position ?? 0) || b.created_at.localeCompare(a.created_at),
    };
    items.sort(sorters[query.sort ?? ""] ?? ((a, b) => b.created_at.localeCompare(a.created_at)));
    return { ...page(items, query, 25), all_tags: [...new Set(rows("leads").flatMap((l) => l.tags ?? []))].sort() };
  }],
  ["POST", "/leads", ({ body }) => {
    const data = leadInput(body, false);
    const t = nowIso();
    const lead: Row = { id: uuid(), workspace_id: ws(), owner_id: auth().user.id, business_id: null, name: null, category: null, address: null, phone: null, email: null, website: null, status: "new", priority: "medium", deal_value: 0, won_at: null, lost_at: null, lost_reason: null, tags: cleanTags(body.tags), created_at: t, updated_at: t };
    if (body.business_id) {
      const b = find("businesses", body.business_id, "Business");
      if (rows("leads").some((l) => l.business_id === b.id)) fail(409, "This business is already saved as a lead.");
      const fb = formatBusiness(b);
      Object.assign(lead, { business_id: b.id, name: b.name, category: b.category, address: fb.address, phone: b.phone, email: b.email, website: b.website });
    }
    for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined) lead[k] = v;
    if (lead.status === "won") lead.won_at = t;
    if (lead.status === "lost") lead.lost_at = t;
    lead.position = Math.min(0, ...rows("leads").filter((l) => l.status === lead.status).map((l) => l.position ?? 0)) - 1;
    db().leads.push(lead);
    logActivity(lead.id, { type: "system", subject: "Lead created" + (lead.business_id ? " from discovery" : "") });
    if (str(body.note, 5000)) db().notes.push({ id: uuid(), workspace_id: lead.workspace_id, lead_id: lead.id, user_id: auth().user.id, body: str(body.note, 5000), created_at: t, updated_at: t });
    if (iso(body.follow_up_at)) db().follow_ups.push({ id: uuid(), workspace_id: lead.workspace_id, lead_id: lead.id, user_id: auth().user.id, due_at: iso(body.follow_up_at), channel: "call", note: null, status: "pending", completed_at: null, notified_at: null, created_at: t });
    save();
    return leadDetail(lead.id);
  }],
  ["GET", "/leads/export", ({ query }) => {
    consume("lead_export");
    save();
    const items = leadFilters(query).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return csv([
      ["Name", "Category", "Status", "Priority", "Deal value", "Opportunity score", "Website status", "Phone", "Email", "Website", "Address", "Tags", "Next follow-up", "Created"],
      ...items.map((l) => [l.name, l.category, l.status, l.priority, l.deal_value, l.opportunity_score, l.website_status, l.phone, l.email, l.website, l.address, l.tags.join("; "), l.next_follow_up_at, l.created_at]),
    ]);
  }],
  ["GET", "/leads/tags", () => {
    const counts = new Map<string, number>();
    rows("leads").forEach((l) => (l.tags ?? []).forEach((t: string) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort().map(([name, lead_count]) => ({ name, lead_count }));
  }],
  ["POST", "/leads/bulk-delete", ({ body }) => {
    const ids = new Set<string>(Array.isArray(body.ids) ? body.ids : []);
    const mine = rows("leads").filter((l) => ids.has(l.id)).map((l) => l.id);
    mine.forEach(deleteLeadCascade);
    save();
    return { deleted: mine.length };
  }],
  ["GET", "/leads/:id", ({ params }) => leadDetail(params.id)],
  ["PATCH", "/leads/:id", ({ params, body }) => {
    const lead = find("leads", params.id, "Lead");
    const data = leadInput(body, true);
    if (data.status) { applyStatus(lead, data.status); delete data.status; }
    Object.assign(lead, data);
    if ("tags" in body) lead.tags = cleanTags(body.tags);
    lead.updated_at = nowIso();
    save();
    return leadDetail(lead.id);
  }],
  ["DELETE", "/leads/:id", ({ params }) => { find("leads", params.id, "Lead"); deleteLeadCascade(params.id); save(); return {}; }],
  ["POST", "/leads/:id/move", ({ params, body }) => {
    const lead = find("leads", params.id, "Lead");
    if (!STATUSES.includes(body.status)) invalid({ status: "Invalid option selected." });
    const col = rows("leads").filter((l) => l.status === body.status && l.id !== lead.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.created_at.localeCompare(a.created_at));
    col.splice(Math.max(0, Math.min(col.length, Number(body.index) || 0)), 0, lead);
    applyStatus(lead, body.status);
    col.forEach((l, i) => (l.position = i));
    lead.updated_at = nowIso();
    save();
    return { moved: true };
  }],
  ["POST", "/leads/:id/notes", ({ params, body }) => {
    const lead = find("leads", params.id, "Lead");
    const text = str(body.body, 5000);
    if (!text) invalid({ body: "This field is required." });
    const n = { id: uuid(), workspace_id: ws(), lead_id: lead.id, user_id: auth().user.id, body: text, created_at: nowIso(), updated_at: nowIso() };
    db().notes.push(n);
    touchLead(lead.id);
    save();
    return { id: n.id };
  }],
  ["DELETE", "/leads/:id/notes/:noteId", ({ params }) => { find("notes", params.noteId, "Note"); remove("notes", (n) => n.id === params.noteId); save(); return {}; }],

  // contacts
  ["GET", "/contacts", ({ query }) => {
    let items = rows("contacts").map((c): Row => {
      const l = db().leads.find((x) => x.id === c.lead_id);
      const last = db().activities.filter((a) => a.contact_id === c.id).map((a) => a.occurred_at).sort().pop() ?? null;
      return { ...c, lead_name: l?.name ?? null, lead_status: l?.status ?? null, last_contacted_at: last };
    });
    if (query.q) items = items.filter((c) => [c.first_name, c.last_name, c.email, c.phone, c.lead_name].some((v) => like(v, query.q!)));
    if (query.lead_id) items = items.filter((c) => c.lead_id === query.lead_id);
    items.sort((a, b) => `${a.first_name} ${a.last_name ?? ""}`.localeCompare(`${b.first_name} ${b.last_name ?? ""}`));
    return page(items, query);
  }],
  ["POST", "/contacts", ({ body }) => {
    if (!str(body.first_name)) invalid({ first_name: "This field is required." });
    const c = { id: uuid(), workspace_id: ws(), lead_id: null, first_name: null, last_name: null, job_title: null, email: null, phone: null, whatsapp: null, notes: null, created_at: nowIso(), updated_at: nowIso(), ...contactInput(body) };
    db().contacts.push(c);
    touchLead(c.lead_id);
    save();
    return c;
  }],
  ["PATCH", "/contacts/:id", ({ params, body }) => { const c = find("contacts", params.id, "Contact"); Object.assign(c, contactInput(body), { updated_at: nowIso() }); save(); return c; }],
  ["DELETE", "/contacts/:id", ({ params }) => { find("contacts", params.id, "Contact"); remove("contacts", (c) => c.id === params.id); db().activities.forEach((a) => { if (a.contact_id === params.id) a.contact_id = null; }); save(); return {}; }],

  // activities
  ["GET", "/activities", ({ query }) => {
    let items = rows("activities");
    items = query.type ? items.filter((a) => a.type === query.type) : items.filter((a) => a.type !== "system");
    if (query.lead_id) items = items.filter((a) => a.lead_id === query.lead_id);
    items.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    const counts: Record<string, number> = {};
    rows("activities").filter((a) => ["call", "email", "meeting", "whatsapp", "note"].includes(a.type)).forEach((a) => (counts[a.type] = (counts[a.type] ?? 0) + 1));
    const p = page(items, query);
    return { ...p, items: p.items.map(formatActivity), counts };
  }],
  ["POST", "/activities", ({ body }) => {
    const lead = find("leads", body.lead_id, "Lead");
    if (!["call", "email", "meeting", "whatsapp", "note"].includes(body.type)) invalid({ type: "Invalid option selected." });
    const contact = body.contact_id ? find("contacts", body.contact_id, "Contact").id : null;
    const dur = body.duration_minutes === null || body.duration_minutes === undefined || body.duration_minutes === "" ? null : Number(body.duration_minutes);
    if (dur !== null && (isNaN(dur) || dur < 0 || dur > 1440)) invalid({ duration_minutes: "Must be 0–1440 minutes." });
    const id = uuid();
    db().activities.push({ id, workspace_id: ws(), lead_id: lead.id, contact_id: contact, user_id: auth().user.id, type: body.type, direction: ["inbound", "outbound"].includes(body.direction) ? body.direction : null, subject: str(body.subject, 255), body: str(body.body, 10000), outcome: str(body.outcome, 120), duration_minutes: dur, occurred_at: iso(body.occurred_at) ?? nowIso(), created_at: nowIso() });
    if (body.type !== "note" && (body.direction ?? "outbound") === "outbound" && lead.status === "new") applyStatus(lead, "contacted");
    touchLead(lead.id);
    save();
    return { id };
  }],
  ["DELETE", "/activities/:id", ({ params }) => {
    const a = find("activities", params.id, "Activity");
    if (["system", "status_change"].includes(a.type)) fail(403, "System history entries cannot be deleted.");
    remove("activities", (x) => x.id === params.id);
    save();
    return {};
  }],

  // tasks
  ["GET", "/tasks", ({ query }) => {
    let items = rows("tasks");
    if (["todo", "in_progress", "done"].includes(query.status ?? "")) items = items.filter((t) => t.status === query.status);
    if (query.status === "open") items = items.filter((t) => t.status !== "done");
    if (query.due === "overdue") items = items.filter((t) => t.status !== "done" && isPast(t.due_at));
    if (query.due === "today") items = items.filter((t) => t.due_at && sameDay(t.due_at));
    if (query.mine === "1") items = items.filter((t) => t.assigned_to === auth().user.id);
    if (query.lead_id) items = items.filter((t) => t.lead_id === query.lead_id);
    if (query.q) items = items.filter((t) => like(t.title, query.q!));
    const pr = { urgent: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
    items.sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || String(a.due_at ?? "z").localeCompare(String(b.due_at ?? "z")) || pr[a.priority] - pr[b.priority]);
    const all = rows("tasks");
    const p = page(items, query, 100);
    return {
      ...p,
      items: p.items.map((t) => ({ ...t, lead_name: db().leads.find((l) => l.id === t.lead_id)?.name ?? null, assignee_name: userName(t.assigned_to) })),
      counts: { todo: all.filter((t) => t.status === "todo").length, in_progress: all.filter((t) => t.status === "in_progress").length, done: all.filter((t) => t.status === "done").length, overdue: all.filter((t) => t.status !== "done" && isPast(t.due_at)).length },
    };
  }],
  ["POST", "/tasks", ({ body }) => {
    if (!str(body.title)) invalid({ title: "This field is required." });
    const t: Row = { id: uuid(), workspace_id: ws(), lead_id: null, assigned_to: auth().user.id, created_by: auth().user.id, title: null, description: null, priority: "medium", status: "todo", due_at: null, completed_at: null, created_at: nowIso(), updated_at: nowIso(), ...taskInput({ assigned_to: auth().user.id, ...body }) };
    if (t.status === "done") t.completed_at = nowIso();
    db().tasks.push(t);
    touchLead(t.lead_id);
    save();
    return t;
  }],
  ["PATCH", "/tasks/:id", ({ params, body }) => {
    const t = find("tasks", params.id, "Task");
    const data = taskInput(body);
    if (data.status) data.completed_at = data.status === "done" ? t.completed_at ?? nowIso() : null;
    Object.assign(t, data, { updated_at: nowIso() });
    save();
    return t;
  }],
  ["DELETE", "/tasks/:id", ({ params }) => { find("tasks", params.id, "Task"); remove("tasks", (t) => t.id === params.id); save(); return {}; }],

  // follow-ups
  ["GET", "/follow-ups", ({ query }) => {
    const scope = query.scope ?? "pending";
    let items = rows("follow_ups");
    if (scope === "pending") items = items.filter((f) => f.status === "pending");
    if (scope === "overdue") items = items.filter((f) => f.status === "pending" && isPast(f.due_at));
    if (scope === "upcoming") items = items.filter((f) => f.status === "pending" && !isPast(f.due_at));
    if (scope === "done") items = items.filter((f) => f.status !== "pending");
    if (query.lead_id) items = items.filter((f) => f.lead_id === query.lead_id);
    items.sort(scope === "done" ? (a, b) => String(b.completed_at).localeCompare(String(a.completed_at)) : (a, b) => a.due_at.localeCompare(b.due_at));
    const all = rows("follow_ups");
    const p = page(items, query, 100);
    return {
      ...p,
      items: p.items.map((f) => {
        const l = db().leads.find((x) => x.id === f.lead_id);
        return { ...f, lead_name: l?.name, lead_status: l?.status, lead_phone: l?.phone, lead_email: l?.email };
      }),
      counts: { overdue: all.filter((f) => f.status === "pending" && isPast(f.due_at)).length, today: all.filter((f) => f.status === "pending" && sameDay(f.due_at)).length, pending: all.filter((f) => f.status === "pending").length, done: all.filter((f) => f.status !== "pending").length },
    };
  }],
  ["POST", "/follow-ups", ({ body }) => {
    const lead = find("leads", body.lead_id, "Lead");
    const due = iso(body.due_at);
    if (!due) invalid({ due_at: "Enter a valid date." });
    const f = { id: uuid(), workspace_id: ws(), lead_id: lead.id, user_id: auth().user.id, due_at: due, channel: ["call", "email", "meeting", "whatsapp", "other"].includes(body.channel) ? body.channel : "call", note: str(body.note, 500), status: "pending", completed_at: null, notified_at: null, created_at: nowIso() };
    db().follow_ups.push(f);
    touchLead(lead.id);
    save();
    return f;
  }],
  ["PATCH", "/follow-ups/:id", ({ params, body }) => {
    const f = find("follow_ups", params.id, "Follow-up");
    if ("due_at" in body) { const d = iso(body.due_at); if (!d) invalid({ due_at: "Enter a valid date." }); f.due_at = d; f.notified_at = null; }
    if ("channel" in body && ["call", "email", "meeting", "whatsapp", "other"].includes(body.channel)) f.channel = body.channel;
    if ("note" in body) f.note = str(body.note, 500);
    if (["pending", "done", "skipped"].includes(body.status)) { f.status = body.status; f.completed_at = body.status === "pending" ? null : nowIso(); }
    save();
    return f;
  }],
  ["DELETE", "/follow-ups/:id", ({ params }) => { find("follow_ups", params.id, "Follow-up"); remove("follow_ups", (f) => f.id === params.id); save(); return {}; }],

  // calendar
  ["GET", "/calendar", ({ query }) => {
    const from = query.from ? new Date(query.from).getTime() : 0;
    const to = query.to ? new Date(query.to).getTime() : Infinity;
    const inRange = (v: string | null) => !!v && new Date(v).getTime() >= from && new Date(v).getTime() <= to;
    const leadName = (id: string | null) => db().leads.find((l) => l.id === id)?.name ?? null;
    return {
      events: rows("events").filter((e) => new Date(e.starts_at).getTime() < to && new Date(e.ends_at).getTime() >= from).map((e) => ({ ...e, lead_name: leadName(e.lead_id) })),
      follow_ups: rows("follow_ups").filter((f) => inRange(f.due_at)).map((f) => ({ ...f, lead_name: leadName(f.lead_id) })),
      tasks: rows("tasks").filter((t) => inRange(t.due_at)).map((t) => ({ ...t, lead_name: leadName(t.lead_id) })),
    };
  }],
  ["POST", "/calendar/events", ({ body }) => {
    if (!str(body.title)) invalid({ title: "This field is required." });
    const e: Row = { id: uuid(), workspace_id: ws(), user_id: auth().user.id, lead_id: null, description: null, location: null, type: "meeting", created_at: nowIso(), ...eventInput(body) };
    if (!e.starts_at || !e.ends_at) invalid({ starts_at: "Enter a valid date." });
    if (e.ends_at < e.starts_at) invalid({ ends_at: "End must be after start." });
    db().events.push(e);
    if (e.lead_id && e.type === "meeting") logActivity(e.lead_id, { type: "meeting", subject: `Meeting scheduled: ${e.title}`, body: e.description, occurred_at: e.starts_at });
    save();
    return e;
  }],
  ["PATCH", "/calendar/events/:id", ({ params, body }) => {
    const e = find("events", params.id, "Event");
    const next = { ...e, ...eventInput(body) };
    if (next.ends_at < next.starts_at) invalid({ ends_at: "End must be after start." });
    Object.assign(e, next);
    save();
    return e;
  }],
  ["DELETE", "/calendar/events/:id", ({ params }) => { find("events", params.id, "Event"); remove("events", (e) => e.id === params.id); save(); return {}; }],

  // email templates
  ["GET", "/email-templates", () => rows("templates").sort((a, b) => a.name.localeCompare(b.name))],
  ["POST", "/email-templates", ({ body }) => {
    const t = { id: uuid(), workspace_id: ws(), created_by: auth().user.id, name: str(body.name, 120), subject: str(body.subject, 255), body: str(body.body, 20000), created_at: nowIso(), updated_at: nowIso() };
    const errors: Record<string, string> = {};
    for (const k of ["name", "subject", "body"] as const) if (!t[k]) errors[k] = "This field is required.";
    if (Object.keys(errors).length) invalid(errors);
    db().templates.push(t);
    save();
    return t;
  }],
  ["PATCH", "/email-templates/:id", ({ params, body }) => {
    const t = find("templates", params.id, "Template");
    for (const [k, max] of [["name", 120], ["subject", 255], ["body", 20000]] as const) if (k in body) { const v = str(body[k], max); if (!v) invalid({ [k]: "This field is required." }); t[k] = v; }
    t.updated_at = nowIso();
    save();
    return t;
  }],
  ["DELETE", "/email-templates/:id", ({ params }) => { find("templates", params.id, "Template"); remove("templates", (t) => t.id === params.id); save(); return {}; }],

  // audits
  ["GET", "/audits", ({ query }) => rows("audits").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, Number(query.limit) || 50).map((a) => ({ ...a, business_name: db().businesses.find((b) => b.id === a.business_id)?.name ?? null, lead_name: db().leads.find((l) => l.id === a.lead_id)?.name ?? null }))],
  ["POST", "/audits", async ({ body }) => {
    let business = body.business_id ? find("businesses", body.business_id, "Business") : null;
    const lead = body.lead_id ? find("leads", body.lead_id, "Lead") : null;
    const url = str(body.url) ?? lead?.website ?? business?.website;
    if (!url) invalid({ url: "Enter a website URL to audit." });
    if (!business && lead?.business_id) business = db().businesses.find((b) => b.id === lead.business_id) ?? null;
    consume("website_audit");
    let res;
    try { res = await web.audit(url!); } catch (e) { return invalid({ url: (e as Error).message }); }
    const a = { id: uuid(), workspace_id: ws(), business_id: business?.id ?? null, lead_id: lead?.id ?? null, created_by: auth().user.id, created_at: nowIso(), ...res };
    db().audits.push(a);
    if (business) {
      Object.assign(business, { website_status: res.is_reachable ? "available" : "needs_review", website_check_note: res.is_reachable ? "Updated by website audit." : res.error, website_checked_at: nowIso() });
      rescore(business);
    }
    save();
    return a;
  }],
  ["GET", "/audits/:id", ({ params }) => find("audits", params.id, "Audit")],
  ["DELETE", "/audits/:id", ({ params }) => {
    const a = find("audits", params.id, "Audit");
    remove("audits", (x) => x.id === params.id);
    const b = a.business_id && db().businesses.find((x) => x.id === a.business_id);
    if (b) rescore(b);
    save();
    return {};
  }],

  // analytics & notifications
  ["GET", "/dashboard", ({ query }) => dashboard(query)],
  ["GET", "/analytics", ({ query }) => analytics(query)],
  ["GET", "/notifications", ({ query }) => {
    syncDue();
    save();
    const uid = auth().user.id;
    const mine = rows("notifications").filter((n) => n.user_id === uid).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { unread: mine.filter((n) => !n.read_at).length, items: (query.unread === "1" ? mine.filter((n) => !n.read_at) : mine).slice(0, 100) };
  }],
  ["POST", "/notifications/read-all", () => { const uid = auth().user.id; rows("notifications").forEach((n) => { if (n.user_id === uid && !n.read_at) n.read_at = nowIso(); }); save(); return {}; }],
  ["POST", "/notifications/:id/read", ({ params }) => { const n = find("notifications", params.id, "Notification"); n.read_at ??= nowIso(); save(); return {}; }],
  ["DELETE", "/notifications/:id", ({ params }) => { find("notifications", params.id, "Notification"); remove("notifications", (n) => n.id === params.id); save(); return {}; }],
];

function deleteLeadCascade(id: string) {
  remove("leads", (l) => l.id === id);
  for (const t of ["notes", "activities", "tasks", "follow_ups"] as const) remove(t, (r) => r.lead_id === id);
  for (const t of ["contacts", "events", "audits"] as const) (db()[t] as Row[]).forEach((r) => { if (r.lead_id === id) r.lead_id = null; });
}

const compiled = routes.map(([method, pattern, handler]) => {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  return { method, re, keys, handler };
});

/** Dispatches an API call to the in-browser implementation. */
export async function localRequest<T>(method: string, path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
  const q: Q = {};
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") q[k] = String(v);
  let methodMatched = false;
  for (const r of compiled) {
    const m = path.match(r.re);
    if (!m) continue;
    methodMatched = true;
    if (r.method !== method) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    // Return copies so React Query never holds references into the live store.
    const out = await r.handler({ body: (body as any) ?? {}, query: q, params });
    return (typeof out === "string" ? out : JSON.parse(JSON.stringify(out ?? null))) as T;
  }
  throw new ApiError(methodMatched ? 405 : 404, methodMatched ? "Method not allowed" : "Endpoint not found");
}
