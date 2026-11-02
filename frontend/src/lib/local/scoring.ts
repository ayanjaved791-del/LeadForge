// Transparent rule-based opportunity scoring (same rules as the PHP edition).
export const RULES: Record<string, { label: string; points: number; description: string }> = {
  no_website: { label: "No website found", points: 40, description: "No website listed in OpenStreetMap or social profiles (not proof that none exists)." },
  website_inactive: { label: "Website unreachable", points: 20, description: "A listed website failed to load." },
  needs_review: { label: "Website status uncertain", points: 10, description: "Website check was ambiguous or the business relies on social media only." },
  no_https: { label: "Website not using HTTPS", points: 10, description: "The website could not be reached over a secure connection." },
  no_phone: { label: "No phone number listed", points: 5, description: "No phone number in public data." },
  no_email: { label: "No email address listed", points: 5, description: "No email address in public data." },
  no_social: { label: "No social media listed", points: 5, description: "No social profiles in public data." },
  no_hours: { label: "No opening hours listed", points: 5, description: "Opening hours are missing from public listings." },
  audit_slow: { label: "Slow response", points: 5, description: "Latest audit measured a response time above 3 seconds." },
};

export const BANDS = [
  { min: 75, key: "very_high", label: "Very High Opportunity" },
  { min: 50, key: "high", label: "High Opportunity" },
  { min: 25, key: "medium", label: "Medium Opportunity" },
  { min: 0, key: "low", label: "Low Opportunity" },
];

export const band = (score: number) => (BANDS.find((b) => score >= b.min) ?? BANDS[3]).key;

export function rules(overrides: Record<string, number> = {}) {
  const out: typeof RULES = {};
  for (const [k, r] of Object.entries(RULES)) out[k] = { ...r, points: k in overrides ? Math.max(0, Math.min(100, Number(overrides[k]))) : r.points };
  return out;
}

export function score(b: Record<string, any>, audit: Record<string, any> | null, overrides: Record<string, number> = {}) {
  const r = rules(overrides);
  const hits: string[] = [];
  const status = b.website_status ?? "unknown";
  if (status === "no_website") hits.push("no_website");
  if (status === "inactive") hits.push("website_inactive");
  if (status === "needs_review") hits.push("needs_review");
  if (!b.phone) hits.push("no_phone");
  if (!b.email) hits.push("no_email");
  if (!b.socials || !Object.keys(b.socials).length) hits.push("no_social");
  if (!b.opening_hours) hits.push("no_hours");
  if (audit && audit.is_reachable) {
    if (!audit.uses_https) hits.push("no_https");
    if ((audit.response_time_ms ?? 0) > 3000) hits.push("audit_slow");
  }
  const items = [...new Set(hits)].filter((k) => r[k].points > 0).map((k) => ({ rule: k, label: r[k].label, points: r[k].points }));
  const total = Math.min(100, items.reduce((s, i) => s + i.points, 0));
  return { score: total, band: band(total), items };
}
