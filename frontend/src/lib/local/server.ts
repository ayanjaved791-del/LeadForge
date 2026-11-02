// HelloHR — in-browser implementation of the app's REST API.
// Every route returns the same shapes a server API would, and every record is scoped to the
// signed-in company (workspace). Data is persisted in localStorage via ./store.
import { ApiError } from "../api";
import { db, getSession, nowIso, save, setSession, uuid, type Row, type Table } from "./store";

type Q = Record<string, string | undefined>;
type Handler = (ctx: { body: any; query: Q; params: Record<string, string> }) => unknown | Promise<unknown>;

// ------------------------------------------------------------------ helpers
const fail = (status: number, message: string, fields: Record<string, string> = {}): never => {
  throw new ApiError(status, message, fields);
};
const invalid = (fields: Record<string, string>): never => fail(422, "Validation failed", fields);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : v === null || v === undefined ? null : String(v).slice(0, max)) || null;
const num = (v: unknown, min = 0, max = 1e9) => Math.min(max, Math.max(min, Number(v) || 0));
const money = (v: number) => Math.round(v * 100) / 100;
const iso = (v: unknown) => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
};
const dateOnly = (v: unknown, field: string, required = false) => {
  if (v === null || v === undefined || v === "") return required ? invalid({ [field]: "This field is required." }) : null;
  if (typeof v !== "string" || !DATE.test(v)) invalid({ [field]: "Enter a valid date." });
  return v as string;
};
const like = (hay: unknown, q: string) => String(hay ?? "").toLowerCase().includes(q.toLowerCase());

/** Local calendar date helpers ("YYYY-MM-DD", in the user's timezone). */
const dkey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const today = () => dkey(new Date());
const addDays = (k: string, n: number) => {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
};
const monthBounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return { start: dkey(new Date(y, m - 1, 1)), end: dkey(new Date(y, m, 0)) };
};

function auth() {
  const s = getSession();
  const user = s && db().users.find((u) => u.id === s.user_id);
  if (!s || !user) fail(401, "Authentication required");
  let member = db().members.find((m) => m.workspace_id === s!.workspace_id && m.user_id === user!.id);
  if (!member) {
    member = db().members.find((m) => m.user_id === user!.id);
    if (!member) fail(403, "You are not a member of any company.");
    setSession({ user_id: user!.id, workspace_id: member!.workspace_id });
  }
  return { user: user!, wsId: member!.workspace_id as string, role: member!.role as string };
}
const ws = () => auth().wsId;
const company = () => db().workspaces.find((w) => w.id === ws())!;
const rows = (t: Table) => db()[t].filter((r) => r.workspace_id === ws());
function find(t: Table, id: string, label = "Record"): Row {
  const r = db()[t].find((x) => x.id === id && x.workspace_id === ws());
  if (!r) fail(404, `${label} not found`);
  return r!;
}
const remove = (t: Table, pred: (r: Row) => boolean) => {
  db()[t] = db()[t].filter((r) => !pred(r));
};
function page<T>(items: T[], q: Q, def = 50) {
  const limit = Math.max(1, Math.min(1000, Number(q.limit) || def));
  const p = Math.max(1, Number(q.page) || 1);
  return { total: items.length, page: p, limit, items: items.slice((p - 1) * limit, p * limit) };
}
const requireRole = (...roles: string[]) => {
  if (!roles.includes(auth().role)) fail(403, "Your role does not allow this action.");
};
const notify = (title: string, body: string | null, link: string | null, type = "info") => {
  for (const m of rows("members")) db().notifications.push({ id: uuid(), workspace_id: ws(), user_id: m.user_id, type, title, body, link, read_at: null, created_at: nowIso() });
};

// ------------------------------------------------------------------ company calendar
const settings = () => ({ work_start: "09:00", late_after_minutes: 15, work_days: [1, 2, 3, 4, 5], ...(company().settings ?? {}) });
const holidayOn = (k: string) => rows("holidays").find((h) => h.date === k) ?? null;
const isWorkingDay = (k: string) => settings().work_days.includes(parseKey(k).getDay()) && !holidayOn(k);
function workingDays(start: string, end: string) {
  let n = 0;
  for (let k = start; k <= end; k = addDays(k, 1)) if (isWorkingDay(k)) n++;
  return n;
}
const overlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  return s <= e ? { start: s, end: e } : null;
};
const leaveOn = (employeeId: string, k: string) =>
  rows("leave_requests").find((l) => l.employee_id === employeeId && l.status === "approved" && l.start_date <= k && l.end_date >= k) ?? null;
const employedOn = (e: Row, k: string) => e.join_date <= k && (!e.termination_date || e.termination_date >= k);

// ------------------------------------------------------------------ formatting
const fullName = (e: Row | undefined | null) => (e ? [e.first_name, e.last_name].filter(Boolean).join(" ") : null);
const deptName = (id: string | null) => (id ? rows("departments").find((d) => d.id === id)?.name ?? null : null);
const leaveTypeName = (id: string) => rows("leave_types").find((t) => t.id === id)?.name ?? "Leave";
function formatEmployee(e: Row): Row {
  return {
    ...e,
    full_name: fullName(e),
    department_name: deptName(e.department_id),
    manager_name: e.manager_id ? fullName(rows("employees").find((m) => m.id === e.manager_id)) : null,
    on_leave_today: !!leaveOn(e.id, today()),
  };
}
const formatLeave = (l: Row) => {
  const e = rows("employees").find((x) => x.id === l.employee_id);
  const t = rows("leave_types").find((x) => x.id === l.leave_type_id);
  return { ...l, employee_name: fullName(e), department_name: e ? deptName(e.department_id) : null, leave_type: t?.name ?? "Leave", paid: t?.paid ?? true };
};
const logEvent = (employeeId: string, type: string, text: string) =>
  db().employee_events.push({ id: uuid(), workspace_id: ws(), employee_id: employeeId, type, text, at: nowIso() });

function balances(employeeId: string, year: number) {
  const ys = `${year}-01-01`;
  const ye = `${year}-12-31`;
  const reqs = rows("leave_requests").filter((l) => l.employee_id === employeeId && overlap(l.start_date, l.end_date, ys, ye));
  return rows("leave_types")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const days = (status: string) =>
        reqs.filter((l) => l.leave_type_id === t.id && l.status === status).reduce((s, l) => {
          const o = overlap(l.start_date, l.end_date, ys, ye)!;
          return s + (l.half_day ? 0.5 : workingDays(o.start, o.end));
        }, 0);
      const used = days("approved");
      const pending = days("pending");
      return { leave_type_id: t.id, leave_type: t.name, allowance: t.days_per_year, used, pending, remaining: Math.max(0, t.days_per_year - used), paid: t.paid };
    });
}

// ------------------------------------------------------------------ input validation
const EMP_TYPES = ["full_time", "part_time", "contract", "intern"];
function employeeInput(body: any, existing?: Row) {
  const out: Row = {};
  const errors: Record<string, string> = {};
  for (const k of ["first_name", "last_name", "email", "phone", "gender", "address", "job_title", "notes", "employee_code"]) if (k in body) out[k] = str(body[k], k === "notes" || k === "address" ? 2000 : 191);
  if (!existing && !out.first_name) errors.first_name = "This field is required.";
  if ("first_name" in body && !out.first_name) errors.first_name = "This field is required.";
  if (out.email && !EMAIL.test(out.email)) errors.email = "Enter a valid email address.";
  if (out.email && rows("employees").some((e) => e.email?.toLowerCase() === out.email.toLowerCase() && e.id !== existing?.id)) errors.email = "Another employee already uses this email.";
  if (out.employee_code && rows("employees").some((e) => e.employee_code === out.employee_code && e.id !== existing?.id)) errors.employee_code = "This employee ID is already in use.";
  for (const k of ["date_of_birth", "join_date", "probation_end", "termination_date"]) if (k in body) out[k] = dateOnly(body[k], k);
  if (!existing && !out.join_date) errors.join_date = "This field is required.";
  if ("employment_type" in body) EMP_TYPES.includes(body.employment_type) ? (out.employment_type = body.employment_type) : (errors.employment_type = "Invalid option selected.");
  if ("status" in body) ["active", "probation", "terminated"].includes(body.status) ? (out.status = body.status) : (errors.status = "Invalid option selected.");
  if ("department_id" in body) out.department_id = body.department_id ? find("departments", body.department_id, "Department").id : null;
  if ("manager_id" in body) {
    out.manager_id = body.manager_id ? find("employees", body.manager_id, "Manager").id : null;
    if (existing && out.manager_id === existing.id) errors.manager_id = "An employee cannot manage themselves.";
  }
  if ("salary" in body) {
    const s = body.salary ?? {};
    const items = (arr: unknown) => (Array.isArray(arr) ? arr : []).map((i: any) => ({ name: str(i?.name, 80) ?? "", amount: money(num(i?.amount)) })).filter((i) => i.name && i.amount > 0).slice(0, 20);
    out.salary = { basic: money(num(s.basic)), allowances: items(s.allowances), deductions: items(s.deductions), tax_rate: num(s.tax_rate, 0, 100) };
  }
  if ("bank" in body) out.bank = { bank_name: str(body.bank?.bank_name, 120), account_name: str(body.bank?.account_name, 120), account_number: str(body.bank?.account_number, 60) };
  if ("emergency" in body) out.emergency = { name: str(body.emergency?.name, 120), phone: str(body.emergency?.phone, 40), relation: str(body.emergency?.relation, 60) };
  const status = out.status ?? existing?.status;
  if (status === "terminated" && !(out.termination_date ?? existing?.termination_date)) out.termination_date = today();
  if (Object.keys(errors).length) invalid(errors);
  return out;
}
function nextEmployeeCode() {
  const nums = rows("employees").map((e) => Number(String(e.employee_code ?? "").replace(/\D/g, ""))).filter((n) => !isNaN(n));
  return `EMP-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0")}`;
}

// ------------------------------------------------------------------ payroll
function computePayslip(p: Row) {
  const allowances = (p.allowances as Row[]).reduce((s, a) => s + a.amount, 0);
  const fixed = (p.deductions as Row[]).reduce((s, d) => s + d.amount, 0);
  const perDay = p.working_days > 0 ? p.basic / p.working_days : 0;
  p.unpaid_deduction = money(Math.min(p.basic, perDay * p.unpaid_days));
  p.gross = money(p.basic + allowances + p.bonus);
  p.tax = money(Math.max(0, p.gross - p.unpaid_deduction) * (p.tax_rate / 100));
  p.total_deductions = money(fixed + p.unpaid_deduction + p.tax);
  p.net = money(Math.max(0, p.gross - p.total_deductions));
  return p;
}
function runTotals(run: Row) {
  const slips = rows("payslips").filter((p) => p.run_id === run.id);
  return { ...run, employees: slips.length, gross: money(slips.reduce((s, p) => s + p.gross, 0)), deductions: money(slips.reduce((s, p) => s + p.total_deductions, 0)), net: money(slips.reduce((s, p) => s + p.net, 0)) };
}
const formatPayslip = (p: Row) => ({ ...p, run_status: rows("payroll_runs").find((r) => r.id === p.run_id)?.status });

// ------------------------------------------------------------------ auth & account
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
async function hashPassword(password: string, salt?: string) {
  const s = salt ?? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(s), iterations: 150_000 }, key, 256);
  return { salt: s, hash: [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("") };
}
const strongPassword = (pw: string) => {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) invalid({ password: "Use at least 8 characters with letters and numbers." });
};
const DEFAULT_LEAVE_TYPES = [
  { name: "Annual leave", days_per_year: 14, paid: true },
  { name: "Sick leave", days_per_year: 10, paid: true },
  { name: "Unpaid leave", days_per_year: 30, paid: false },
];

// ------------------------------------------------------------------ dashboard & analytics
function headcountAt(k: string) {
  return rows("employees").filter((e) => employedOn(e, k)).length;
}
function dashboard(q: Q) {
  const t = today();
  const year = Number(q.year) || new Date().getFullYear();
  const emps = rows("employees");
  const current = emps.filter((e) => employedOn(e, t));
  const att = rows("attendance").filter((a) => a.date === t);
  const onLeave = current.filter((e) => leaveOn(e.id, t));
  const monthStart = t.slice(0, 8) + "01";
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const { start, end } = monthBounds(`${year}-${String(i + 1).padStart(2, "0")}`);
    return {
      month: i + 1,
      hires: emps.filter((e) => e.join_date >= start && e.join_date <= end).length,
      exits: emps.filter((e) => e.termination_date && e.termination_date >= start && e.termination_date <= end).length,
      headcount: end <= t || start <= t ? headcountAt(end < t ? end : t) : 0,
    };
  });
  // attendance for the last 14 working days
  const trend: Row[] = [];
  for (let k = t, guard = 0; trend.length < 14 && guard < 60; k = addDays(k, -1), guard++) {
    if (!isWorkingDay(k)) continue;
    const recs = rows("attendance").filter((a) => a.date === k);
    trend.unshift({
      date: k,
      present: recs.filter((a) => ["present", "late", "remote", "half_day"].includes(a.status)).length,
      absent: recs.filter((a) => a.status === "absent").length,
      on_leave: rows("employees").filter((e) => employedOn(e, k) && leaveOn(e.id, k)).length,
    });
  }
  const upcoming = (field: "date_of_birth" | "join_date") =>
    current
      .filter((e) => e[field])
      .map((e) => {
        const [, m, d] = String(e[field]).split("-");
        let next = `${t.slice(0, 4)}-${m}-${d}`;
        if (next < t) next = `${Number(t.slice(0, 4)) + 1}-${m}-${d}`;
        const years = Number(next.slice(0, 4)) - Number(String(e[field]).slice(0, 4));
        return { id: e.id, name: fullName(e), date: next, years };
      })
      .filter((x) => x.date <= addDays(t, 30) && (field === "date_of_birth" || x.years > 0))
      .sort((a, b) => a.date.localeCompare(b.date));
  const lastRun = rows("payroll_runs").sort((a, b) => b.period.localeCompare(a.period))[0];
  const openJobs = rows("jobs").filter((j) => j.status === "open");
  return {
    kpi: {
      headcount: current.length,
      new_hires_month: emps.filter((e) => e.join_date >= monthStart && e.join_date <= t).length,
      exits_year: emps.filter((e) => e.termination_date && e.termination_date.startsWith(String(year))).length,
      present_today: att.filter((a) => ["present", "late", "remote", "half_day"].includes(a.status)).length,
      absent_today: att.filter((a) => a.status === "absent").length,
      late_today: att.filter((a) => a.status === "late").length,
      not_marked_today: isWorkingDay(t) ? current.filter((e) => !att.some((a) => a.employee_id === e.id) && !leaveOn(e.id, t)).length : 0,
      on_leave_today: onLeave.length,
      pending_leave: rows("leave_requests").filter((l) => l.status === "pending").length,
      open_positions: openJobs.reduce((s, j) => s + Number(j.openings || 0), 0),
      candidates_active: rows("candidates").filter((c) => !["hired", "rejected"].includes(c.stage)).length,
      monthly_payroll: current.reduce((s, e) => s + (e.salary?.basic ?? 0) + (e.salary?.allowances ?? []).reduce((a: number, x: Row) => a + x.amount, 0), 0),
      working_day: isWorkingDay(t),
      holiday: holidayOn(t)?.name ?? null,
    },
    monthly,
    year,
    years: [...new Set([new Date().getFullYear(), ...emps.map((e) => Number(String(e.join_date).slice(0, 4)))])].sort((a, b) => b - a),
    attendance_trend: trend,
    departments: rows("departments").map((d) => ({ name: d.name, count: current.filter((e) => e.department_id === d.id).length })).concat(
      current.some((e) => !e.department_id) ? [{ name: "Unassigned", count: current.filter((e) => !e.department_id).length }] : [],
    ),
    pending_leave: rows("leave_requests").filter((l) => l.status === "pending").sort((a, b) => a.start_date.localeCompare(b.start_date)).slice(0, 5).map(formatLeave),
    on_leave_today: onLeave.map((e) => ({ id: e.id, name: fullName(e), type: leaveTypeName(leaveOn(e.id, t)!.leave_type_id) })),
    birthdays: upcoming("date_of_birth").slice(0, 5),
    anniversaries: upcoming("join_date").slice(0, 5),
    recent_hires: [...emps].sort((a, b) => b.join_date.localeCompare(a.join_date)).slice(0, 5).map((e) => ({ id: e.id, name: fullName(e), job_title: e.job_title, department: deptName(e.department_id), join_date: e.join_date })),
    interviews: rows("interviews").filter((i) => i.scheduled_at >= new Date(new Date().setHours(0, 0, 0, 0)).toISOString() && i.outcome === "pending" && !["hired", "rejected"].includes(rows("candidates").find((c) => c.id === i.candidate_id)?.stage)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)).slice(0, 5).map((i) => ({ ...i, candidate_name: rows("candidates").find((c) => c.id === i.candidate_id)?.name })),
    last_run: lastRun ? runTotals(lastRun) : null,
    company: { name: company().name, created_at: company().created_at, members: rows("members").length, departments: rows("departments").length },
  };
}

function analytics(q: Q) {
  const months = [6, 12, 24].includes(Number(q.months)) ? Number(q.months) : 12;
  const t = today();
  const emps = rows("employees");
  const current = emps.filter((e) => employedOn(e, t));
  const now = new Date();
  const series = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const period = dkey(d).slice(0, 7);
    const { start, end } = monthBounds(period);
    const recs = rows("attendance").filter((a) => a.date >= start && a.date <= end);
    const attended = recs.filter((a) => ["present", "late", "remote", "half_day"].includes(a.status)).length;
    const run = rows("payroll_runs").find((r) => r.period === period);
    return {
      period,
      headcount: headcountAt(end < t ? end : t),
      hires: emps.filter((e) => e.join_date >= start && e.join_date <= end).length,
      exits: emps.filter((e) => e.termination_date && e.termination_date >= start && e.termination_date <= end).length,
      attendance_rate: recs.length ? Math.round((attended / recs.length) * 1000) / 10 : null,
      payroll: run ? runTotals(run).net : null,
    };
  });
  const exits12 = emps.filter((e) => e.termination_date && e.termination_date >= addDays(t, -365)).length;
  const avgHead = series.slice(-12).reduce((s, m) => s + m.headcount, 0) / Math.max(1, Math.min(12, series.length));
  const tenures = current.map((e) => (parseKey(t).getTime() - parseKey(e.join_date).getTime()) / (365.25 * 86400_000));
  const count = (arr: Row[], key: (r: Row) => string) => {
    const m = new Map<string, number>();
    arr.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };
  const year = String(now.getFullYear());
  const leaveByType = new Map<string, number>();
  rows("leave_requests").filter((l) => l.status === "approved" && l.start_date.startsWith(year)).forEach((l) => leaveByType.set(leaveTypeName(l.leave_type_id), (leaveByType.get(leaveTypeName(l.leave_type_id)) ?? 0) + l.days));
  const hired = rows("candidates").filter((c) => c.stage === "hired" && c.hired_at);
  const reviews = rows("reviews").filter((r) => r.status === "completed");
  return {
    months,
    series,
    headcount: current.length,
    turnover_rate: avgHead ? Math.round((exits12 / avgHead) * 1000) / 10 : null,
    avg_tenure_years: tenures.length ? Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10 : null,
    by_department: count(current, (e) => deptName(e.department_id) ?? "Unassigned"),
    by_type: count(current, (e) => ({ full_time: "Full-time", part_time: "Part-time", contract: "Contract", intern: "Intern" } as Record<string, string>)[e.employment_type] ?? e.employment_type),
    by_gender: count(current.filter((e) => e.gender), (e) => e.gender),
    leave_by_type: [...leaveByType.entries()].map(([name, value]) => ({ name, value })),
    funnel: ["applied", "screening", "interview", "offer", "hired"].map((s, i, all) => ({ stage: s, count: rows("candidates").filter((c) => all.indexOf(c.stage) >= i || (c.stage === "rejected" && all.indexOf(c.rejected_from ?? "applied") >= i)).length })),
    time_to_hire_days: hired.length ? Math.round(hired.reduce((s, c) => s + (new Date(c.hired_at).getTime() - new Date(c.created_at).getTime()) / 86400_000, 0) / hired.length) : null,
    avg_review_score: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.overall, 0) / reviews.length) * 10) / 10 : null,
    reviews_completed: reviews.length,
  };
}

// ------------------------------------------------------------------ routes
const routes: [string, string, Handler][] = [
  // ---- auth
  ["GET", "/auth/csrf", () => ({ token: "local" })],
  ["POST", "/auth/register", async ({ body }) => {
    const name = str(body.name, 120);
    const email = (str(body.email, 191) ?? "").toLowerCase();
    const errors: Record<string, string> = {};
    if (!name || name.length < 2) errors.name = "This field is required.";
    if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
    if (Object.keys(errors).length) invalid(errors);
    strongPassword(String(body.password ?? ""));
    if (db().users.some((u) => u.email === email)) invalid({ email: "An account with this email already exists in this browser." });
    const { salt, hash } = await hashPassword(String(body.password));
    const uid = uuid();
    const wid = uuid();
    const t = nowIso();
    db().users.push({ id: uid, email, name, password_hash: hash, salt, email_verified_at: null, created_at: t, last_login_at: t, job_title: null, company: null, phone: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", currency: "USD", default_city: null, default_country: null, onboarded_at: null });
    const cname = str(body.workspace, 120) || `${name}'s Company`;
    db().workspaces.push({ id: wid, name: cname, slug: cname.toLowerCase().replace(/[^a-z0-9]+/g, "-"), owner_id: uid, settings: { work_start: "09:00", late_after_minutes: 15, work_days: [1, 2, 3, 4, 5] }, created_at: t });
    db().members.push({ id: uuid(), workspace_id: wid, user_id: uid, role: "owner", created_at: t });
    for (const lt of DEFAULT_LEAVE_TYPES) db().leave_types.push({ id: uuid(), workspace_id: wid, ...lt, created_at: t });
    save();
    setSession({ user_id: uid, workspace_id: wid });
    return { user_id: uid };
  }],
  ["POST", "/auth/login", async ({ body }) => {
    const user = db().users.find((u) => u.email === String(body.email ?? "").trim().toLowerCase());
    const check = await hashPassword(String(body.password ?? ""), user?.salt ?? "x");
    if (!user || check.hash !== user.password_hash) fail(401, "Incorrect email or password.");
    user!.last_login_at = nowIso();
    save();
    setSession({ user_id: user!.id, workspace_id: db().members.find((m) => m.user_id === user!.id)?.workspace_id });
    return {};
  }],
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
    const h = await hashPassword(String(body.password));
    Object.assign(user, { salt: h.salt, password_hash: h.hash });
    save();
    return { changed: true };
  }],
  ["POST", "/auth/forgot-password", () => fail(501, "Password reset by email isn't available — accounts are stored in this browser.")],
  ["POST", "/auth/reset-password", () => fail(501, "Password reset is not available in this edition.")],
  ["POST", "/auth/verify-email", () => fail(501, "Email verification is not available in this edition.")],
  ["POST", "/auth/resend-verification", () => fail(501, "Email verification is not available in this edition.")],

  // ---- company
  ["GET", "/workspace", () => ({ workspace: { ...company(), role: auth().role }, subscription: { plan: "free", status: "active", current_period_start: company().created_at }, counts: { members: rows("members").length, employees: rows("employees").filter((e) => employedOn(e, today())).length, departments: rows("departments").length }, usage: [] })],
  ["PATCH", "/workspace", ({ body }) => {
    requireRole("owner", "admin");
    const c = company();
    if ("name" in body) { const n = str(body.name, 120); if (!n || n.length < 2) invalid({ name: "Must be at least 2 characters." }); c.name = n; }
    if (body.settings) {
      const s = body.settings;
      const next = { ...settings() };
      if (s.work_start !== undefined) { if (!TIME.test(s.work_start)) invalid({ work_start: "Use HH:MM." }); next.work_start = s.work_start; }
      if (s.late_after_minutes !== undefined) next.late_after_minutes = num(s.late_after_minutes, 0, 240);
      if (Array.isArray(s.work_days)) { const d = [...new Set(s.work_days.map(Number).filter((x: number) => x >= 0 && x <= 6))]; if (!d.length) invalid({ work_days: "Choose at least one working day." }); next.work_days = d as number[]; }
      c.settings = next;
    }
    save();
    return { ...c, role: auth().role };
  }],
  ["GET", "/workspace/members", () => rows("members").map((m) => {
    const u = db().users.find((x) => x.id === m.user_id);
    return { id: m.id, role: m.role, created_at: m.created_at, user_id: m.user_id, name: u?.name, email: u?.email };
  })],
  ["POST", "/workspace/members", ({ body }) => {
    requireRole("owner", "admin");
    const u = db().users.find((x) => x.email === String(body.email ?? "").trim().toLowerCase());
    if (!u) invalid({ email: "No account with this email exists in this browser. Ask them to sign up here first." });
    if (rows("members").some((m) => m.user_id === u!.id)) invalid({ email: "This user is already a member." });
    db().members.push({ id: uuid(), workspace_id: ws(), user_id: u!.id, role: body.role === "admin" ? "admin" : "member", created_at: nowIso() });
    save();
    return {};
  }],
  ["DELETE", "/workspace/members/:id", ({ params }) => {
    requireRole("owner", "admin");
    const m = rows("members").find((x) => x.id === params.id);
    if (!m) fail(404, "Member not found");
    if (m!.role === "owner") fail(403, "The company owner cannot be removed.");
    remove("members", (x) => x.id === params.id);
    save();
    return {};
  }],

  // ---- departments
  ["GET", "/departments", () => {
    const t = today();
    return rows("departments").sort((a, b) => a.name.localeCompare(b.name)).map((d) => {
      const members = rows("employees").filter((e) => e.department_id === d.id && employedOn(e, t));
      return { ...d, head_name: fullName(rows("employees").find((e) => e.id === d.head_id)), headcount: members.length, payroll_cost: money(members.reduce((s, e) => s + (e.salary?.basic ?? 0), 0)) };
    });
  }],
  ["POST", "/departments", ({ body }) => {
    const name = str(body.name, 120);
    if (!name) invalid({ name: "This field is required." });
    if (rows("departments").some((d) => d.name.toLowerCase() === name!.toLowerCase())) invalid({ name: "A department with this name already exists." });
    const d = { id: uuid(), workspace_id: ws(), name, description: str(body.description, 1000), head_id: body.head_id ? find("employees", body.head_id, "Employee").id : null, created_at: nowIso() };
    db().departments.push(d);
    save();
    return d;
  }],
  ["PATCH", "/departments/:id", ({ params, body }) => {
    const d = find("departments", params.id, "Department");
    if ("name" in body) {
      const n = str(body.name, 120);
      if (!n) invalid({ name: "This field is required." });
      if (rows("departments").some((x) => x.id !== d.id && x.name.toLowerCase() === n!.toLowerCase())) invalid({ name: "A department with this name already exists." });
      d.name = n;
    }
    if ("description" in body) d.description = str(body.description, 1000);
    if ("head_id" in body) d.head_id = body.head_id ? find("employees", body.head_id, "Employee").id : null;
    save();
    return d;
  }],
  ["DELETE", "/departments/:id", ({ params }) => {
    find("departments", params.id, "Department");
    rows("employees").forEach((e) => { if (e.department_id === params.id) e.department_id = null; });
    rows("jobs").forEach((j) => { if (j.department_id === params.id) j.department_id = null; });
    remove("departments", (d) => d.id === params.id);
    save();
    return {};
  }],

  // ---- employees
  ["GET", "/employees", ({ query }) => {
    let items = rows("employees");
    const t = today();
    if (query.status === "current" || !query.status) items = items.filter((e) => e.status !== "terminated");
    else if (query.status !== "all") items = items.filter((e) => e.status === query.status);
    if (query.department_id) items = items.filter((e) => (query.department_id === "none" ? !e.department_id : e.department_id === query.department_id));
    if (query.type) items = items.filter((e) => e.employment_type === query.type);
    if (query.q) items = items.filter((e) => [fullName(e), e.email, e.phone, e.employee_code, e.job_title].some((v) => like(v, query.q!)));
    const sorters: Record<string, (a: Row, b: Row) => number> = {
      name: (a, b) => String(fullName(a)).localeCompare(String(fullName(b))),
      newest: (a, b) => b.join_date.localeCompare(a.join_date),
      oldest: (a, b) => a.join_date.localeCompare(b.join_date),
      code: (a, b) => String(a.employee_code).localeCompare(String(b.employee_code)),
    };
    items.sort(sorters[query.sort ?? "name"] ?? sorters.name);
    void t;
    const p = page(items, query, 25);
    return { ...p, items: p.items.map(formatEmployee) };
  }],
  ["GET", "/employees/export", () => {
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Employee ID", "First name", "Last name", "Email", "Phone", "Department", "Job title", "Manager", "Type", "Status", "Join date", "Termination date", "Basic salary"];
    const lines = rows("employees").sort((a, b) => String(a.employee_code).localeCompare(String(b.employee_code))).map((e) => {
      const f = formatEmployee(e);
      return [f.employee_code, f.first_name, f.last_name, f.email, f.phone, f.department_name, f.job_title, f.manager_name, f.employment_type, f.status, f.join_date, f.termination_date, f.salary?.basic];
    });
    return "﻿" + [header, ...lines].map((r) => r.map(esc).join(",")).join("\n");
  }],
  ["POST", "/employees", ({ body }) => {
    const data = employeeInput(body);
    const e: Row = {
      id: uuid(), workspace_id: ws(), employee_code: data.employee_code || nextEmployeeCode(), first_name: null, last_name: null, email: null, phone: null, gender: null, date_of_birth: null, address: null,
      department_id: null, job_title: null, manager_id: null, employment_type: "full_time", status: "active", join_date: today(), probation_end: null, termination_date: null,
      salary: { basic: 0, allowances: [], deductions: [], tax_rate: 0 }, bank: { bank_name: null, account_name: null, account_number: null }, emergency: { name: null, phone: null, relation: null }, notes: null, created_at: nowIso(),
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
    };
    if (!e.employee_code) e.employee_code = nextEmployeeCode();
    db().employees.push(e);
    logEvent(e.id, "joined", `Joined${e.job_title ? ` as ${e.job_title}` : ""}${e.department_id ? ` in ${deptName(e.department_id)}` : ""}`);
    save();
    return formatEmployee(e);
  }],
  ["GET", "/employees/:id", ({ params }) => {
    const e = find("employees", params.id, "Employee");
    const t = today();
    const from = addDays(t, -30);
    const att = rows("attendance").filter((a) => a.employee_id === e.id && a.date >= from).sort((a, b) => b.date.localeCompare(a.date));
    const summary = { present: 0, late: 0, remote: 0, half_day: 0, absent: 0, on_leave: 0 } as Record<string, number>;
    att.forEach((a) => (summary[a.status] = (summary[a.status] ?? 0) + 1));
    return {
      ...formatEmployee(e),
      reports: rows("employees").filter((x) => x.manager_id === e.id && x.status !== "terminated").map((x) => ({ id: x.id, full_name: fullName(x), job_title: x.job_title })),
      balances: balances(e.id, new Date().getFullYear()),
      attendance: att,
      attendance_summary: summary,
      leave_requests: rows("leave_requests").filter((l) => l.employee_id === e.id).sort((a, b) => b.start_date.localeCompare(a.start_date)).map(formatLeave),
      payslips: rows("payslips").filter((p) => p.employee_id === e.id).sort((a, b) => b.period.localeCompare(a.period)).map(formatPayslip),
      reviews: rows("reviews").filter((r) => r.employee_id === e.id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      goals: rows("goals").filter((g) => g.employee_id === e.id).sort((a, b) => String(a.due_date ?? "z").localeCompare(String(b.due_date ?? "z"))),
      events: rows("employee_events").filter((x) => x.employee_id === e.id).sort((a, b) => b.at.localeCompare(a.at)),
    };
  }],
  ["PATCH", "/employees/:id", ({ params, body }) => {
    const e = find("employees", params.id, "Employee");
    const data = employeeInput(body, e);
    if (data.department_id !== undefined && data.department_id !== e.department_id) logEvent(e.id, "department", `Moved to ${deptName(data.department_id) ?? "no department"}`);
    if (data.job_title !== undefined && data.job_title !== e.job_title && data.job_title) logEvent(e.id, "title", `Job title changed to ${data.job_title}`);
    if (data.salary && data.salary.basic !== e.salary?.basic) logEvent(e.id, "salary", `Basic salary updated`);
    if (data.status && data.status !== e.status) logEvent(e.id, "status", data.status === "terminated" ? `Employment ended${data.termination_date ? ` on ${data.termination_date}` : ""}` : `Status changed to ${data.status}`);
    if (data.status && data.status !== "terminated") data.termination_date = null;
    Object.assign(e, data);
    save();
    return formatEmployee(e);
  }],
  ["DELETE", "/employees/:id", ({ params }) => {
    find("employees", params.id, "Employee");
    const id = params.id;
    for (const t of ["attendance", "leave_requests", "employee_events", "reviews", "goals"] as const) remove(t, (r) => r.employee_id === id);
    rows("employees").forEach((e) => { if (e.manager_id === id) e.manager_id = null; });
    rows("departments").forEach((d) => { if (d.head_id === id) d.head_id = null; });
    remove("employees", (e) => e.id === id);
    save();
    return {};
  }],

  // ---- attendance
  ["GET", "/attendance", ({ query }) => {
    const date = query.date && DATE.test(query.date) ? query.date : today();
    const emps = rows("employees").filter((e) => employedOn(e, date)).sort((a, b) => String(fullName(a)).localeCompare(String(fullName(b))));
    const recs = rows("attendance").filter((a) => a.date === date);
    const out = emps.map((e) => {
      const leave = leaveOn(e.id, date);
      return { employee: { id: e.id, full_name: fullName(e), employee_code: e.employee_code, job_title: e.job_title, department_name: deptName(e.department_id) }, record: recs.find((a) => a.employee_id === e.id) ?? null, leave: leave ? { type: leaveTypeName(leave.leave_type_id) } : null };
    });
    const summary: Record<string, number> = { present: 0, late: 0, remote: 0, half_day: 0, absent: 0, on_leave: 0, unmarked: 0 };
    out.forEach((r) => (r.record ? summary[r.record.status]++ : r.leave ? summary.on_leave++ : summary.unmarked++));
    return { date, holiday: holidayOn(date)?.name ?? null, working_day: isWorkingDay(date), rows: out, summary };
  }],
  ["PUT", "/attendance", ({ body }) => {
    const entries: Row[] = Array.isArray(body.entries) ? body.entries.slice(0, 2000) : [];
    if (!entries.length) invalid({ entries: "Nothing to save." });
    const s = settings();
    const [sh, sm] = s.work_start.split(":").map(Number);
    const lateAfter = sh * 60 + sm + s.late_after_minutes;
    let saved = 0;
    for (const en of entries) {
      const e = find("employees", en.employee_id, "Employee");
      const date = dateOnly(en.date, "date", true)!;
      if (date > today()) invalid({ date: "Attendance can't be recorded for future dates." });
      const existing = rows("attendance").find((a) => a.employee_id === e.id && a.date === date);
      if (en.status === null) { if (existing) remove("attendance", (a) => a.id === existing.id); continue; }
      if (!["present", "late", "remote", "half_day", "absent", "on_leave"].includes(en.status)) invalid({ status: "Invalid attendance status." });
      const check_in = en.check_in && TIME.test(en.check_in) ? en.check_in : null;
      const check_out = en.check_out && TIME.test(en.check_out) ? en.check_out : null;
      if (check_in && check_out && check_out < check_in) invalid({ check_out: "Check-out must be after check-in." });
      let status = en.status;
      if (status === "present" && check_in) {
        const [h, m] = check_in.split(":").map(Number);
        if (h * 60 + m > lateAfter) status = "late";
      }
      const rec = { employee_id: e.id, date, status, check_in, check_out, note: str(en.note, 300) };
      if (existing) Object.assign(existing, rec);
      else db().attendance.push({ id: uuid(), workspace_id: ws(), ...rec });
      saved++;
    }
    save();
    return { saved };
  }],
  ["GET", "/attendance/month", ({ query }) => {
    const period = query.month && /^\d{4}-\d{2}$/.test(query.month) ? query.month : today().slice(0, 7);
    const { start, end } = monthBounds(period);
    const days: { date: string; working: boolean; holiday: string | null }[] = [];
    for (let k = start; k <= end; k = addDays(k, 1)) days.push({ date: k, working: isWorkingDay(k), holiday: holidayOn(k)?.name ?? null });
    const emps = rows("employees").filter((e) => e.join_date <= end && (!e.termination_date || e.termination_date >= start)).sort((a, b) => String(fullName(a)).localeCompare(String(fullName(b))));
    const recs = rows("attendance").filter((a) => a.date >= start && a.date <= end);
    return {
      month: period,
      days,
      employees: emps.map((e) => {
        const mine = recs.filter((a) => a.employee_id === e.id);
        const cells: Record<string, string> = {};
        mine.forEach((a) => (cells[a.date] = a.status));
        days.forEach((d) => { if (!cells[d.date] && leaveOn(e.id, d.date) && d.working) cells[d.date] = "on_leave"; });
        const totals: Record<string, number> = {};
        Object.values(cells).forEach((s) => (totals[s] = (totals[s] ?? 0) + 1));
        return { id: e.id, full_name: fullName(e), employee_code: e.employee_code, cells, totals };
      }),
    };
  }],

  // ---- leave
  ["GET", "/leave-types", () => rows("leave_types").sort((a, b) => a.name.localeCompare(b.name))],
  ["POST", "/leave-types", ({ body }) => {
    requireRole("owner", "admin");
    const name = str(body.name, 80);
    if (!name) invalid({ name: "This field is required." });
    const t = { id: uuid(), workspace_id: ws(), name, days_per_year: num(body.days_per_year, 0, 366), paid: body.paid !== false, created_at: nowIso() };
    db().leave_types.push(t);
    save();
    return t;
  }],
  ["PATCH", "/leave-types/:id", ({ params, body }) => {
    requireRole("owner", "admin");
    const t = find("leave_types", params.id, "Leave type");
    if ("name" in body) { const n = str(body.name, 80); if (!n) invalid({ name: "This field is required." }); t.name = n; }
    if ("days_per_year" in body) t.days_per_year = num(body.days_per_year, 0, 366);
    if ("paid" in body) t.paid = !!body.paid;
    save();
    return t;
  }],
  ["DELETE", "/leave-types/:id", ({ params }) => {
    requireRole("owner", "admin");
    find("leave_types", params.id, "Leave type");
    if (rows("leave_requests").some((l) => l.leave_type_id === params.id)) fail(409, "This leave type is used by existing requests and can't be deleted.");
    remove("leave_types", (t) => t.id === params.id);
    save();
    return {};
  }],
  ["GET", "/leave-requests", ({ query }) => {
    let items = rows("leave_requests");
    if (query.status) items = items.filter((l) => l.status === query.status);
    if (query.employee_id) items = items.filter((l) => l.employee_id === query.employee_id);
    if (query.q) items = items.filter((l) => like(fullName(rows("employees").find((e) => e.id === l.employee_id)), query.q!));
    items.sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.start_date.localeCompare(a.start_date));
    const all = rows("leave_requests");
    const p = page(items, query, 50);
    return { ...p, items: p.items.map(formatLeave), counts: { pending: all.filter((l) => l.status === "pending").length, approved: all.filter((l) => l.status === "approved").length, rejected: all.filter((l) => l.status === "rejected").length, on_leave_today: rows("employees").filter((e) => leaveOn(e.id, today())).length } };
  }],
  ["POST", "/leave-requests", ({ body }) => {
    const e = find("employees", body.employee_id, "Employee");
    const type = find("leave_types", body.leave_type_id, "Leave type");
    const start = dateOnly(body.start_date, "start_date", true)!;
    const end = body.half_day ? start : dateOnly(body.end_date, "end_date", true)!;
    if (end < start) invalid({ end_date: "End date must be on or after the start date." });
    const days = body.half_day ? 0.5 : workingDays(start, end);
    if (days === 0) invalid({ end_date: "The selected dates contain no working days." });
    if (rows("leave_requests").some((l) => l.employee_id === e.id && ["pending", "approved"].includes(l.status) && overlap(l.start_date, l.end_date, start, end))) invalid({ start_date: "This employee already has leave on some of these dates." });
    const bal = balances(e.id, Number(start.slice(0, 4))).find((b) => b.leave_type_id === type.id)!;
    if (days > bal.allowance - bal.used - bal.pending && !body.allow_negative) invalid({ leave_type_id: `Only ${Math.max(0, bal.allowance - bal.used - bal.pending)} day(s) of ${type.name} left this year.` });
    const status = body.status === "approved" ? "approved" : "pending";
    const l = { id: uuid(), workspace_id: ws(), employee_id: e.id, leave_type_id: type.id, start_date: start, end_date: end, half_day: !!body.half_day, days, reason: str(body.reason, 1000), status, decision_note: null, decided_at: status === "approved" ? nowIso() : null, created_at: nowIso() };
    db().leave_requests.push(l);
    logEvent(e.id, "leave", `${status === "approved" ? "Leave recorded" : "Leave requested"}: ${type.name}, ${days} day(s) from ${start}`);
    if (status === "pending") notify(`Leave request: ${fullName(e)}`, `${type.name} · ${days} day(s) from ${start}`, "/leave", "leave_request");
    save();
    return formatLeave(l);
  }],
  ["PATCH", "/leave-requests/:id", ({ params, body }) => {
    const l = find("leave_requests", params.id, "Leave request");
    if (!["approved", "rejected", "cancelled", "pending"].includes(body.status)) invalid({ status: "Invalid option selected." });
    if (body.status === "approved" && l.status !== "approved") {
      const bal = balances(l.employee_id, Number(l.start_date.slice(0, 4))).find((b) => b.leave_type_id === l.leave_type_id);
      if (bal && l.days > bal.allowance - bal.used && !body.allow_negative) invalid({ status: `Approving would exceed the ${bal.leave_type} allowance (${Math.max(0, bal.allowance - bal.used)} day(s) left).` });
    }
    l.status = body.status;
    l.decision_note = str(body.decision_note, 500);
    l.decided_at = body.status === "pending" ? null : nowIso();
    logEvent(l.employee_id, "leave", `Leave ${body.status}: ${leaveTypeName(l.leave_type_id)} from ${l.start_date}`);
    save();
    return formatLeave(l);
  }],
  ["DELETE", "/leave-requests/:id", ({ params }) => { find("leave_requests", params.id, "Leave request"); remove("leave_requests", (l) => l.id === params.id); save(); return {}; }],
  ["GET", "/leave/balances", ({ query }) => {
    const year = Number(query.year) || new Date().getFullYear();
    return rows("employees").filter((e) => e.status !== "terminated").sort((a, b) => String(fullName(a)).localeCompare(String(fullName(b)))).map((e) => ({ employee_id: e.id, employee_name: fullName(e), department_name: deptName(e.department_id), balances: balances(e.id, year) }));
  }],

  // ---- holidays
  ["GET", "/holidays", ({ query }) => rows("holidays").filter((h) => !query.year || h.date.startsWith(query.year)).sort((a, b) => a.date.localeCompare(b.date))],
  ["POST", "/holidays", ({ body }) => {
    const name = str(body.name, 120);
    const date = dateOnly(body.date, "date", true)!;
    if (!name) invalid({ name: "This field is required." });
    if (rows("holidays").some((h) => h.date === date)) invalid({ date: "There is already a holiday on this date." });
    const h = { id: uuid(), workspace_id: ws(), name, date, created_at: nowIso() };
    db().holidays.push(h);
    save();
    return h;
  }],
  ["DELETE", "/holidays/:id", ({ params }) => { find("holidays", params.id, "Holiday"); remove("holidays", (h) => h.id === params.id); save(); return {}; }],

  // ---- calendar
  ["GET", "/calendar", ({ query }) => {
    const from = query.from ?? today().slice(0, 8) + "01";
    const to = query.to ?? addDays(from, 41);
    const current = rows("employees").filter((e) => e.status !== "terminated");
    const yearly = (field: string) => current.flatMap((e) => {
      if (!e[field]) return [];
      const out: Row[] = [];
      for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
        const k = `${y}-${String(e[field]).slice(5)}`;
        if (k >= from && k <= to && (field === "date_of_birth" || y > Number(String(e[field]).slice(0, 4)))) out.push({ employee_id: e.id, name: fullName(e), date: k, years: y - Number(String(e[field]).slice(0, 4)) });
      }
      return out;
    });
    return {
      holidays: rows("holidays").filter((h) => h.date >= from && h.date <= to),
      leaves: rows("leave_requests").filter((l) => ["approved", "pending"].includes(l.status) && overlap(l.start_date, l.end_date, from, to)).map(formatLeave),
      interviews: rows("interviews").filter((i) => i.scheduled_at.slice(0, 10) >= from && i.scheduled_at.slice(0, 10) <= to && rows("candidates").find((c) => c.id === i.candidate_id)?.stage !== "rejected").map((i) => ({ ...i, candidate_name: rows("candidates").find((c) => c.id === i.candidate_id)?.name })),
      birthdays: yearly("date_of_birth"),
      anniversaries: yearly("join_date"),
    };
  }],

  // ---- payroll
  ["GET", "/payroll/runs", () => rows("payroll_runs").sort((a, b) => b.period.localeCompare(a.period)).map(runTotals)],
  ["POST", "/payroll/runs", ({ body }) => {
    requireRole("owner", "admin");
    const period = String(body.period ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) invalid({ period: "Choose a month." });
    if (rows("payroll_runs").some((r) => r.period === period)) invalid({ period: "A payroll run for this month already exists." });
    const { start, end } = monthBounds(period);
    const wd = workingDays(start, end);
    const emps = rows("employees").filter((e) => e.join_date <= end && (!e.termination_date || e.termination_date >= start) && (e.salary?.basic ?? 0) > 0);
    if (!emps.length) invalid({ period: "No employees with a salary were employed in this month. Add basic salaries on employee profiles first." });
    const run = { id: uuid(), workspace_id: ws(), period, status: "draft", created_at: nowIso(), finalized_at: null, paid_at: null };
    db().payroll_runs.push(run);
    for (const e of emps) {
      // Unpaid days: working days before joining / after leaving, approved unpaid leave, absences and half days.
      let unpaid = 0;
      for (let k = start; k <= end; k = addDays(k, 1)) {
        if (!isWorkingDay(k)) continue;
        if (!employedOn(e, k)) { unpaid++; continue; }
        const lv = leaveOn(e.id, k);
        if (lv && !rows("leave_types").find((t) => t.id === lv.leave_type_id)?.paid) { unpaid += lv.half_day ? 0.5 : 1; continue; }
        const a = rows("attendance").find((x) => x.employee_id === e.id && x.date === k);
        if (a?.status === "absent" && !lv) unpaid++;
        if (a?.status === "half_day" && !lv) unpaid += 0.5;
      }
      db().payslips.push(computePayslip({
        id: uuid(), workspace_id: ws(), run_id: run.id, period, employee_id: e.id,
        employee: { full_name: fullName(e), employee_code: e.employee_code, job_title: e.job_title, department_name: deptName(e.department_id), bank_name: e.bank?.bank_name ?? null, account_number: e.bank?.account_number ?? null },
        working_days: wd, unpaid_days: unpaid, basic: e.salary.basic, allowances: [...(e.salary.allowances ?? [])], bonus: 0, deductions: [...(e.salary.deductions ?? [])], tax_rate: e.salary.tax_rate ?? 0,
      }));
    }
    save();
    return runTotals(run);
  }],
  ["GET", "/payroll/runs/:id", ({ params }) => {
    const run = find("payroll_runs", params.id, "Payroll run");
    return { ...runTotals(run), payslips: rows("payslips").filter((p) => p.run_id === run.id).sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name)).map(formatPayslip) };
  }],
  ["POST", "/payroll/runs/:id/finalize", ({ params }) => {
    requireRole("owner", "admin");
    const run = find("payroll_runs", params.id, "Payroll run");
    if (run.status !== "draft") fail(409, "This payroll run is already finalized.");
    run.status = "finalized";
    run.finalized_at = nowIso();
    notify(`Payroll finalized for ${run.period}`, `${rows("payslips").filter((p) => p.run_id === run.id).length} payslips ready.`, `/payroll/${run.id}`, "payroll");
    save();
    return runTotals(run);
  }],
  ["POST", "/payroll/runs/:id/pay", ({ params }) => {
    requireRole("owner", "admin");
    const run = find("payroll_runs", params.id, "Payroll run");
    if (run.status !== "finalized") fail(409, "Finalize the payroll run before marking it as paid.");
    run.status = "paid";
    run.paid_at = nowIso();
    save();
    return runTotals(run);
  }],
  ["POST", "/payroll/runs/:id/reopen", ({ params }) => {
    requireRole("owner", "admin");
    const run = find("payroll_runs", params.id, "Payroll run");
    if (run.status !== "finalized") fail(409, "Only finalized (unpaid) runs can be reopened.");
    run.status = "draft";
    run.finalized_at = null;
    save();
    return runTotals(run);
  }],
  ["DELETE", "/payroll/runs/:id", ({ params }) => {
    requireRole("owner", "admin");
    const run = find("payroll_runs", params.id, "Payroll run");
    if (run.status === "paid") fail(409, "Paid payroll runs can't be deleted.");
    remove("payslips", (p) => p.run_id === run.id);
    remove("payroll_runs", (r) => r.id === run.id);
    save();
    return {};
  }],
  ["GET", "/payroll/payslips/:id", ({ params }) => formatPayslip(find("payslips", params.id, "Payslip"))],
  ["PATCH", "/payroll/payslips/:id", ({ params, body }) => {
    const p = find("payslips", params.id, "Payslip");
    if (rows("payroll_runs").find((r) => r.id === p.run_id)?.status !== "draft") fail(409, "Reopen the payroll run to edit payslips.");
    const items = (arr: unknown) => (Array.isArray(arr) ? arr : []).map((i: any) => ({ name: str(i?.name, 80) ?? "", amount: money(num(i?.amount)) })).filter((i) => i.name && i.amount > 0).slice(0, 20);
    if ("bonus" in body) p.bonus = money(num(body.bonus));
    if ("unpaid_days" in body) p.unpaid_days = num(body.unpaid_days, 0, p.working_days);
    if ("allowances" in body) p.allowances = items(body.allowances);
    if ("deductions" in body) p.deductions = items(body.deductions);
    if ("tax_rate" in body) p.tax_rate = num(body.tax_rate, 0, 100);
    computePayslip(p);
    save();
    return formatPayslip(p);
  }],

  // ---- recruitment
  ["GET", "/jobs", ({ query }) => {
    let items = rows("jobs");
    if (query.status) items = items.filter((j) => j.status === query.status);
    return items.sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.created_at.localeCompare(a.created_at)).map((j) => ({
      ...j, department_name: deptName(j.department_id), candidates: rows("candidates").filter((c) => c.job_id === j.id && !["hired", "rejected"].includes(c.stage)).length, hired: rows("candidates").filter((c) => c.job_id === j.id && c.stage === "hired").length,
    }));
  }],
  ["POST", "/jobs", ({ body }) => {
    const title = str(body.title, 160);
    if (!title) invalid({ title: "This field is required." });
    const j = { id: uuid(), workspace_id: ws(), title, department_id: body.department_id ? find("departments", body.department_id, "Department").id : null, location: str(body.location, 120), employment_type: EMP_TYPES.includes(body.employment_type) ? body.employment_type : "full_time", openings: Math.max(1, Math.round(num(body.openings, 1, 999))), description: str(body.description, 5000), status: ["open", "on_hold", "closed"].includes(body.status) ? body.status : "open", created_at: nowIso() };
    db().jobs.push(j);
    save();
    return j;
  }],
  ["PATCH", "/jobs/:id", ({ params, body }) => {
    const j = find("jobs", params.id, "Job");
    if ("title" in body) { const t = str(body.title, 160); if (!t) invalid({ title: "This field is required." }); j.title = t; }
    if ("department_id" in body) j.department_id = body.department_id ? find("departments", body.department_id, "Department").id : null;
    for (const k of ["location", "description"]) if (k in body) j[k] = str(body[k], k === "description" ? 5000 : 120);
    if (EMP_TYPES.includes(body.employment_type)) j.employment_type = body.employment_type;
    if ("openings" in body) j.openings = Math.max(1, Math.round(num(body.openings, 1, 999)));
    if (["open", "on_hold", "closed"].includes(body.status)) j.status = body.status;
    save();
    return j;
  }],
  ["DELETE", "/jobs/:id", ({ params }) => {
    find("jobs", params.id, "Job");
    rows("candidates").forEach((c) => { if (c.job_id === params.id) c.job_id = null; });
    remove("jobs", (j) => j.id === params.id);
    save();
    return {};
  }],
  ["GET", "/candidates", ({ query }) => {
    let items = rows("candidates");
    if (query.job_id) items = items.filter((c) => c.job_id === query.job_id);
    if (query.q) items = items.filter((c) => like(c.name, query.q!) || like(c.email, query.q!));
    const now = new Date().toISOString();
    return items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || b.created_at.localeCompare(a.created_at)).map((c) => ({
      ...c, job_title: rows("jobs").find((j) => j.id === c.job_id)?.title ?? null,
      next_interview_at: rows("interviews").filter((i) => i.candidate_id === c.id && i.outcome === "pending" && i.scheduled_at >= now).map((i) => i.scheduled_at).sort()[0] ?? null,
    }));
  }],
  ["POST", "/candidates", ({ body }) => {
    const name = str(body.name, 160);
    if (!name) invalid({ name: "This field is required." });
    const email = str(body.email, 191);
    if (email && !EMAIL.test(email)) invalid({ email: "Enter a valid email address." });
    const resume = str(body.resume_url, 500);
    if (resume && !/^https?:\/\//i.test(resume)) invalid({ resume_url: "Enter a link starting with http:// or https://" });
    const c = { id: uuid(), workspace_id: ws(), job_id: body.job_id ? find("jobs", body.job_id, "Job").id : null, name, email, phone: str(body.phone, 40), source: str(body.source, 80), stage: "applied", position: -Date.now(), rating: Math.round(num(body.rating, 0, 5)), notes: str(body.notes, 5000), resume_url: resume, hired_employee_id: null, created_at: nowIso(), updated_at: nowIso() };
    db().candidates.push(c);
    save();
    return c;
  }],
  ["GET", "/candidates/:id", ({ params }) => {
    const c = find("candidates", params.id, "Candidate");
    return { ...c, job_title: rows("jobs").find((j) => j.id === c.job_id)?.title ?? null, interviews: rows("interviews").filter((i) => i.candidate_id === c.id).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)) };
  }],
  ["PATCH", "/candidates/:id", ({ params, body }) => {
    const c = find("candidates", params.id, "Candidate");
    if ("name" in body) { const n = str(body.name, 160); if (!n) invalid({ name: "This field is required." }); c.name = n; }
    if ("email" in body) { const e = str(body.email, 191); if (e && !EMAIL.test(e)) invalid({ email: "Enter a valid email address." }); c.email = e; }
    if ("resume_url" in body) { const r = str(body.resume_url, 500); if (r && !/^https?:\/\//i.test(r)) invalid({ resume_url: "Enter a link starting with http:// or https://" }); c.resume_url = r; }
    for (const k of ["phone", "source", "notes"]) if (k in body) c[k] = str(body[k], k === "notes" ? 5000 : 80);
    if ("rating" in body) c.rating = Math.round(num(body.rating, 0, 5));
    if ("job_id" in body) c.job_id = body.job_id ? find("jobs", body.job_id, "Job").id : null;
    c.updated_at = nowIso();
    save();
    return c;
  }],
  ["POST", "/candidates/:id/move", ({ params, body }) => {
    const c = find("candidates", params.id, "Candidate");
    const stages = ["applied", "screening", "interview", "offer", "hired", "rejected"];
    if (!stages.includes(body.stage)) invalid({ stage: "Invalid stage." });
    if (body.stage === "hired" && !c.hired_employee_id) fail(409, "Use “Hire” on the candidate to create their employee record.");
    if (c.stage === "hired" && body.stage !== "hired") fail(409, "This candidate has already been hired.");
    if (body.stage === "rejected" && c.stage !== "rejected") c.rejected_from = c.stage;
    const col = rows("candidates").filter((x) => x.stage === body.stage && x.id !== c.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    col.splice(Math.max(0, Math.min(col.length, Number(body.index) || 0)), 0, c);
    c.stage = body.stage;
    col.forEach((x, i) => (x.position = i));
    c.updated_at = nowIso();
    save();
    return {};
  }],
  ["POST", "/candidates/:id/hire", ({ body, params }) => {
    const c = find("candidates", params.id, "Candidate");
    if (c.stage === "hired") fail(409, "This candidate has already been hired.");
    const job = c.job_id ? rows("jobs").find((j) => j.id === c.job_id) : null;
    const [first, ...rest] = c.name.split(" ");
    const data = employeeInput({
      first_name: first, last_name: rest.join(" ") || null, email: c.email, phone: c.phone,
      job_title: body.job_title ?? job?.title ?? null, department_id: body.department_id ?? job?.department_id ?? null,
      employment_type: body.employment_type ?? job?.employment_type ?? "full_time", join_date: body.join_date, status: "probation",
      probation_end: body.probation_end ?? null, salary: { basic: body.basic ?? 0, allowances: [], deductions: [], tax_rate: 0 },
    });
    const e: Row = { id: uuid(), workspace_id: ws(), employee_code: nextEmployeeCode(), gender: null, date_of_birth: null, address: null, manager_id: null, termination_date: null, bank: { bank_name: null, account_name: null, account_number: null }, emergency: { name: null, phone: null, relation: null }, notes: c.notes, created_at: nowIso(), ...data };
    db().employees.push(e);
    logEvent(e.id, "joined", `Hired from recruitment${e.job_title ? ` as ${e.job_title}` : ""}`);
    Object.assign(c, { stage: "hired", hired_employee_id: e.id, hired_at: nowIso(), updated_at: nowIso() });
    if (job) {
      const hiredCount = rows("candidates").filter((x) => x.job_id === job.id && x.stage === "hired").length;
      if (hiredCount >= job.openings) job.status = "closed";
    }
    notify(`New hire: ${c.name}`, e.job_title ? `Joining as ${e.job_title} on ${e.join_date}` : `Joining on ${e.join_date}`, `/employees/${e.id}`, "hire");
    save();
    return { employee_id: e.id };
  }],
  ["DELETE", "/candidates/:id", ({ params }) => { find("candidates", params.id, "Candidate"); remove("interviews", (i) => i.candidate_id === params.id); remove("candidates", (c) => c.id === params.id); save(); return {}; }],
  ["POST", "/candidates/:id/interviews", ({ params, body }) => {
    const c = find("candidates", params.id, "Candidate");
    const at = iso(body.scheduled_at);
    if (!at) invalid({ scheduled_at: "Enter a valid date and time." });
    const i = { id: uuid(), workspace_id: ws(), candidate_id: c.id, scheduled_at: at, interviewer: str(body.interviewer, 120), mode: ["onsite", "video", "phone"].includes(body.mode) ? body.mode : "onsite", notes: str(body.notes, 2000), outcome: "pending", created_at: nowIso() };
    db().interviews.push(i);
    if (["applied", "screening"].includes(c.stage)) c.stage = "interview";
    c.updated_at = nowIso();
    save();
    return i;
  }],
  ["PATCH", "/interviews/:id", ({ params, body }) => {
    const i = find("interviews", params.id, "Interview");
    if ("scheduled_at" in body) { const at = iso(body.scheduled_at); if (!at) invalid({ scheduled_at: "Enter a valid date and time." }); i.scheduled_at = at; }
    for (const k of ["interviewer", "notes"]) if (k in body) i[k] = str(body[k], 2000);
    if (["onsite", "video", "phone"].includes(body.mode)) i.mode = body.mode;
    if (["pending", "passed", "failed"].includes(body.outcome)) i.outcome = body.outcome;
    save();
    return i;
  }],
  ["DELETE", "/interviews/:id", ({ params }) => { find("interviews", params.id, "Interview"); remove("interviews", (i) => i.id === params.id); save(); return {}; }],

  // ---- performance
  ["GET", "/reviews", ({ query }) => {
    let items = rows("reviews");
    if (query.employee_id) items = items.filter((r) => r.employee_id === query.employee_id);
    if (query.status) items = items.filter((r) => r.status === query.status);
    return items.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ ...r, employee_name: fullName(rows("employees").find((e) => e.id === r.employee_id)) }));
  }],
  ["POST", "/reviews", ({ body }) => reviewSave(null, body)],
  ["PATCH", "/reviews/:id", ({ params, body }) => reviewSave(find("reviews", params.id, "Review"), body)],
  ["DELETE", "/reviews/:id", ({ params }) => { find("reviews", params.id, "Review"); remove("reviews", (r) => r.id === params.id); save(); return {}; }],
  ["GET", "/goals", ({ query }) => {
    let items = rows("goals");
    if (query.employee_id) items = items.filter((g) => g.employee_id === query.employee_id);
    if (query.status) items = items.filter((g) => g.status === query.status);
    return items.sort((a, b) => String(a.due_date ?? "z").localeCompare(String(b.due_date ?? "z"))).map((g) => ({ ...g, employee_name: fullName(rows("employees").find((e) => e.id === g.employee_id)) }));
  }],
  ["POST", "/goals", ({ body }) => goalSave(null, body)],
  ["PATCH", "/goals/:id", ({ params, body }) => goalSave(find("goals", params.id, "Goal"), body)],
  ["DELETE", "/goals/:id", ({ params }) => { find("goals", params.id, "Goal"); remove("goals", (g) => g.id === params.id); save(); return {}; }],

  // ---- dashboard, analytics, search, notifications
  ["GET", "/dashboard", ({ query }) => dashboard(query)],
  ["GET", "/analytics", ({ query }) => analytics(query)],
  ["GET", "/search", ({ query }) => {
    const q = (query.q ?? "").trim();
    if (q.length < 2) return { employees: [], candidates: [] };
    return {
      employees: rows("employees").filter((e) => [fullName(e), e.email, e.employee_code, e.job_title].some((v) => like(v, q))).slice(0, 6).map((e) => ({ id: e.id, name: fullName(e), detail: e.job_title ?? e.employee_code })),
      candidates: rows("candidates").filter((c) => like(c.name, q) || like(c.email, q)).slice(0, 4).map((c) => ({ id: c.id, name: c.name, detail: c.stage })),
    };
  }],
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

function reviewSave(existing: Row | null, body: any) {
  const e = find("employees", body.employee_id ?? existing?.employee_id, "Employee");
  const period = str(body.period ?? existing?.period, 60);
  if (!period) invalid({ period: "This field is required." });
  const ratings: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.ratings ?? existing?.ratings ?? {})) if (Number(v) >= 1 && Number(v) <= 5) ratings[String(k).slice(0, 60)] = Math.round(Number(v));
  const scores = Object.values(ratings);
  const status = body.status === "completed" ? "completed" : "draft";
  if (status === "completed" && !scores.length) invalid({ ratings: "Rate at least one area before completing the review." });
  const data = {
    employee_id: e.id, period, reviewer: str(body.reviewer, 120), ratings,
    overall: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
    strengths: str(body.strengths, 3000), improvements: str(body.improvements, 3000), status,
    completed_at: status === "completed" ? existing?.completed_at ?? nowIso() : null,
  };
  let r = existing;
  if (r) Object.assign(r, data);
  else {
    r = { id: uuid(), workspace_id: ws(), created_at: nowIso(), ...data };
    db().reviews.push(r);
  }
  if (status === "completed" && existing?.status !== "completed") logEvent(e.id, "review", `Performance review completed (${period}) — ${data.overall}/5`);
  save();
  return r;
}
function goalSave(existing: Row | null, body: any) {
  const e = find("employees", body.employee_id ?? existing?.employee_id, "Employee");
  const title = str(body.title ?? existing?.title, 200);
  if (!title) invalid({ title: "This field is required." });
  const progress = Math.round(num(body.progress ?? existing?.progress ?? 0, 0, 100));
  const data = { employee_id: e.id, title, description: str(body.description ?? existing?.description, 2000), due_date: dateOnly(body.due_date ?? existing?.due_date, "due_date"), progress, status: progress >= 100 ? "completed" : progress > 0 ? "in_progress" : "not_started" };
  let g = existing;
  if (g) Object.assign(g, data);
  else {
    g = { id: uuid(), workspace_id: ws(), created_at: nowIso(), ...data };
    db().goals.push(g);
  }
  save();
  return g;
}

/** Reminders that become due without user action (checked when notifications load). */
function syncDue() {
  const t = today();
  for (const e of rows("employees")) {
    if (e.status === "probation" && e.probation_end && e.probation_end <= addDays(t, 7) && e.probation_end >= t && e.notified_probation !== e.probation_end) {
      notify(`Probation ending: ${fullName(e)}`, `Probation ends on ${e.probation_end}. Confirm or extend it.`, `/employees/${e.id}`, "probation");
      e.notified_probation = e.probation_end;
    }
  }
  for (const i of rows("interviews")) {
    if (i.outcome === "pending" && i.scheduled_at.slice(0, 10) === t && !i.notified) {
      const c = rows("candidates").find((x) => x.id === i.candidate_id);
      notify(`Interview today: ${c?.name ?? "candidate"}`, `${new Date(i.scheduled_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${i.interviewer ? ` with ${i.interviewer}` : ""}`, "/recruitment/candidates", "interview");
      i.notified = true;
    }
  }
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
    const out = await r.handler({ body: (body as any) ?? {}, query: q, params });
    return (typeof out === "string" ? out : JSON.parse(JSON.stringify(out ?? null))) as T;
  }
  throw new ApiError(methodMatched ? 405 : 404, methodMatched ? "Method not allowed" : "Endpoint not found");
}
