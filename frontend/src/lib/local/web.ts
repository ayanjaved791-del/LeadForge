// Website checks from the browser.
// Browsers do not let a page read other websites (CORS), so the frontend-only edition can only tell
// whether a site answers over HTTPS and how fast. Status codes and page content are not readable, so
// results are labelled cautiously and content checks are marked as unavailable.

export function normalizeUrl(raw: string | null | undefined): string | null {
  let v = (raw ?? "").trim().split(";")[0];
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "http://" + v.replace(/^\/+/, "");
  try {
    const u = new URL(v);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i;

async function probe(url: string, timeoutMs = 10000): Promise<{ ok: boolean; ms: number; timeout: boolean }> {
  const start = performance.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", redirect: "follow", signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    return { ok: true, ms: Math.round(performance.now() - start), timeout: false };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start), timeout: ctrl.signal.aborted };
  } finally {
    clearTimeout(t);
  }
}

export function initial(website: string | null, socials: Record<string, string>) {
  if (website && normalizeUrl(website)) return { status: "unknown", note: "Website listed in OpenStreetMap — not verified yet." };
  if (Object.keys(socials ?? {}).length) return { status: "needs_review", note: "No website listed, but social profiles exist. The business may use social media instead of a website." };
  return { status: "no_website", note: "No website listed in OpenStreetMap. This is not proof that none exists — verify before outreach." };
}

export async function check(website: string): Promise<{ status: string; note: string; https: boolean; ms: number }> {
  const url = normalizeUrl(website);
  if (!url) return { status: "needs_review", note: "Listed website value is not a valid URL.", https: false, ms: 0 };
  const u = new URL(url);
  if (PRIVATE_HOST.test(u.hostname)) return { status: "needs_review", note: "Not checked: the address points to a private or local network.", https: false, ms: 0 };
  // Pages served over HTTPS cannot load plain-HTTP URLs, so always test the HTTPS version.
  u.protocol = "https:";
  const r = await probe(u.toString());
  if (r.ok) return { status: "available", note: `Responded over HTTPS in ${r.ms} ms (browser check — HTTP status is not visible).`, https: true, ms: r.ms };
  if (r.timeout) return { status: "needs_review", note: "The website did not respond within 10 seconds. Verify manually.", https: false, ms: r.ms };
  return {
    status: "needs_review",
    note: "No response over HTTPS. The site may be offline, HTTP-only, or blocking browser checks — verify manually.",
    https: false,
    ms: r.ms,
  };
}

export async function audit(input: string) {
  const url = normalizeUrl(input);
  if (!url) throw new Error("Enter a valid website URL.");
  const u = new URL(url);
  if (PRIVATE_HOST.test(u.hostname)) throw new Error("Private and local network addresses are not allowed.");
  const res = await check(url);
  const reachable = res.status === "available";
  const unavailable = "Not available in the browser-only edition (browsers block reading other websites).";
  const checks = [
    { key: "reachable", label: "Website is reachable", passed: reachable, weight: 40, detail: reachable ? "Responded to an HTTPS request" : res.note },
    { key: "https", label: "Uses HTTPS", passed: reachable, weight: 40, detail: reachable ? "Secure connection works" : "No working HTTPS connection detected" },
    { key: "speed", label: "Response time under 2s", passed: reachable && res.ms < 2000, weight: 20, detail: `${res.ms} ms` },
    ...[
      ["title", "Page title"],
      ["meta", "Meta description"],
      ["viewport", "Mobile viewport"],
      ["favicon", "Favicon"],
      ["h1", "Single H1 heading"],
      ["canonical", "Canonical URL"],
    ].map(([key, label]) => ({ key, label, passed: false, skipped: true, weight: 0, detail: unavailable })),
  ];
  const score = checks.filter((c) => !("skipped" in c) && c.passed).reduce((s, c) => s + c.weight, 0);
  return {
    url,
    final_url: reachable ? `https://${u.host}${u.pathname}${u.search}` : url,
    status_code: null,
    is_reachable: reachable,
    uses_https: reachable,
    response_time_ms: res.ms,
    page_title: null,
    meta_description: null,
    has_viewport: false,
    has_favicon: false,
    has_canonical: false,
    h1_count: 0,
    html_lang: null,
    page_bytes: null,
    score,
    checks,
    error: reachable ? null : res.note,
  };
}
