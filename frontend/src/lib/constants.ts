import type { ActivityType, Band, LeadStatus, Priority, WebsiteStatus } from "./types";

export const LEAD_STATUSES: { key: LeadStatus; label: string; color: string; dot: string }[] = [
  { key: "new", label: "New", color: "bg-brand-50 text-brand-600 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-brand-500 dark:bg-gray-300" },
  { key: "contacted", label: "Contacted", color: "bg-sky-50 text-sky-700 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-sky-500 dark:bg-gray-300" },
  { key: "interested", label: "Interested", color: "bg-violet-50 text-violet-700 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-violet-500 dark:bg-gray-300" },
  { key: "qualified", label: "Qualified", color: "bg-indigo-50 text-indigo-700 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-indigo-500 dark:bg-gray-300" },
  { key: "proposal_sent", label: "Proposal Sent", color: "bg-warning-50 text-warning-600 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-warning-500 dark:bg-gray-300" },
  { key: "negotiation", label: "Negotiation", color: "bg-orange-50 text-orange-700 dark:bg-white/[0.08] dark:text-gray-200", dot: "bg-orange-500 dark:bg-gray-300" },
  { key: "won", label: "Won", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500", dot: "bg-success-500" },
  { key: "lost", label: "Lost", color: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500", dot: "bg-error-500" },
];
export const statusMeta = (s: LeadStatus) => LEAD_STATUSES.find((x) => x.key === s) ?? LEAD_STATUSES[0];

export const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: "low", label: "Low", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
  { key: "medium", label: "Medium", color: "bg-brand-50 text-brand-600 dark:bg-white/[0.08] dark:text-gray-200" },
  { key: "high", label: "High", color: "bg-warning-50 text-warning-600 dark:bg-white/[0.08] dark:text-gray-200" },
  { key: "urgent", label: "Urgent", color: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500" },
];
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.key === p) ?? PRIORITIES[1];

export const WEBSITE_STATUS: Record<WebsiteStatus, { label: string; color: string; hint: string }> = {
  available: { label: "Website Available", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500", hint: "A listed website responded successfully." },
  no_website: { label: "No Website Found", color: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500", hint: "No website in OpenStreetMap. This is not proof that none exists — verify before outreach." },
  inactive: { label: "Website Inactive", color: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400", hint: "A listed website failed to load." },
  needs_review: { label: "Needs Review", color: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400", hint: "The check was ambiguous — verify manually." },
  unknown: { label: "Unknown", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400", hint: "A website is listed but hasn't been checked yet." },
};

export const BANDS: Record<Band, { label: string; color: string; bar: string }> = {
  low: { label: "Low Opportunity", color: "text-gray-600 bg-gray-100 dark:bg-white/5 dark:text-gray-400", bar: "bg-gray-400" },
  medium: { label: "Medium Opportunity", color: "text-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:text-brand-400", bar: "bg-brand-500" },
  high: { label: "High Opportunity", color: "text-warning-600 bg-warning-50 dark:bg-warning-500/15 dark:text-orange-400", bar: "bg-warning-500" },
  very_high: { label: "Very High Opportunity", color: "text-success-600 bg-success-50 dark:bg-success-500/15 dark:text-success-500", bar: "bg-success-500" },
};
export const bandFor = (score: number): Band => (score >= 75 ? "very_high" : score >= 50 ? "high" : score >= 25 ? "medium" : "low");

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; color: string }> = {
  call: { label: "Call", color: "bg-brand-50 text-brand-500 dark:bg-white/[0.08] dark:text-gray-200" },
  email: { label: "Email", color: "bg-sky-50 text-sky-600 dark:bg-white/[0.08] dark:text-gray-200" },
  meeting: { label: "Meeting", color: "bg-violet-50 text-violet-600 dark:bg-white/[0.08] dark:text-gray-200" },
  whatsapp: { label: "WhatsApp", color: "bg-success-50 text-success-600 dark:bg-white/[0.08] dark:text-gray-200" },
  note: { label: "Note", color: "bg-warning-50 text-warning-600 dark:bg-white/[0.08] dark:text-gray-200" },
  status_change: { label: "Status", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
  system: { label: "System", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

export const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahrain","Bangladesh","Belarus","Belgium","Bolivia",
  "Bosnia and Herzegovina","Brazil","Bulgaria","Cambodia","Cameroon","Canada","Chile","China","Colombia","Costa Rica","Croatia","Cyprus","Czechia",
  "Denmark","Dominican Republic","Ecuador","Egypt","Estonia","Ethiopia","Finland","France","Georgia","Germany","Ghana","Greece","Guatemala","Hong Kong",
  "Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Latvia",
  "Lebanon","Lithuania","Luxembourg","Malaysia","Maldives","Malta","Mexico","Morocco","Nepal","Netherlands","New Zealand","Nigeria","North Macedonia",
  "Norway","Oman","Pakistan","Panama","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal",
  "Serbia","Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sweden","Switzerland","Taiwan","Tanzania","Thailand",
  "Tunisia","Turkey","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Zambia","Zimbabwe",
];
