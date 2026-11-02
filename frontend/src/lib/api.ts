// Typed fetch wrapper for the PHP API. Session cookies + synchronizer CSRF token.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
export const setCsrf = (t: string | null | undefined) => {
  if (t) csrfToken = t;
};

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: "include" });
  const json = await res.json();
  csrfToken = json.data.token as string;
  return csrfToken;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query): string {
  const qs = new URLSearchParams();
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ""}`;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = await ensureCsrf();
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the LeadForge API. Is Apache (XAMPP) running?");
  }
  let json: any = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, "The API returned an invalid response. Check the PHP error log.");
  }
  if (res.status === 419 && retry) {
    csrfToken = null;
    return request<T>(method, path, body, query, false);
  }
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/me") window.dispatchEvent(new Event("lf:unauthorized"));
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.fields ?? {});
  }
  if (json?.data && typeof json.data === "object" && "csrf" in json.data) setCsrf(json.data.csrf);
  return json?.data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** Downloads a CSV (cookie-authenticated GET). */
  download: async (path: string, query: Query, filename: string) => {
    const res = await fetch(buildUrl(path, query), { credentials: "include" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new ApiError(res.status, j?.error?.message ?? "Export failed");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
