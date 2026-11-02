export type LeadStatus = "new" | "contacted" | "interested" | "qualified" | "proposal_sent" | "negotiation" | "won" | "lost";
export type Priority = "low" | "medium" | "high" | "urgent";
export type WebsiteStatus = "available" | "no_website" | "inactive" | "needs_review" | "unknown";
export type Band = "low" | "medium" | "high" | "very_high";
export type ActivityType = "call" | "email" | "meeting" | "whatsapp" | "note" | "status_change" | "system";

export interface User {
  id: string;
  email: string;
  name: string;
  email_verified_at: string | null;
  created_at: string;
  job_title: string | null;
  company: string | null;
  phone: string | null;
  timezone: string;
  currency: string;
  default_city: string | null;
  default_country: string | null;
  onboarded_at: string | null;
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  settings: Record<string, unknown> | null;
}
export interface Me {
  user: User;
  workspace: Workspace;
  workspaces: { id: string; name: string; role: string }[];
  csrf: string;
}

export interface ScoreItem {
  rule: string;
  label: string;
  points: number;
}
export interface Business {
  id: string;
  osm_type: string;
  osm_id: number;
  osm_url: string;
  name: string;
  category: string;
  category_label: string;
  address: string | null;
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
  website_status: WebsiteStatus;
  website_status_label: string;
  website_check_note: string | null;
  website_http_status: number | null;
  website_checked_at: string | null;
  score: number;
  band: Band;
  score_breakdown: ScoreItem[];
  lead_id: string | null;
  discovered_at: string;
  latest_audit?: Audit | null;
}
export interface SearchResult {
  center: { lat: number; lng: number; display_name: string };
  radius: number;
  count: number;
  businesses: Business[];
  attribution: string;
}
export interface SearchParams {
  category: string;
  country?: string;
  city?: string;
  area?: string;
  radius: number;
  lat?: number;
  lng?: number;
}
export interface SavedSearch {
  id: string;
  name: string;
  params: SearchParams;
  result_count: number | null;
  last_run_at: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  business_id: string | null;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: LeadStatus;
  priority: Priority;
  deal_value: number;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  opportunity_score: number | null;
  website_status: WebsiteStatus | null;
  lat: number | null;
  lng: number | null;
  next_follow_up_at: string | null;
  last_activity_at: string | null;
  tags: string[];
}
export interface Note {
  id: string;
  body: string;
  author: string | null;
  created_at: string;
}
export interface Activity {
  id: string;
  lead_id: string;
  lead_name?: string;
  contact_id: string | null;
  contact_name?: string | null;
  type: ActivityType;
  direction: "inbound" | "outbound" | null;
  subject: string | null;
  body: string | null;
  outcome: string | null;
  duration_minutes: number | null;
  occurred_at: string;
  author: string | null;
}
export interface FollowUp {
  id: string;
  lead_id: string;
  lead_name?: string;
  lead_status?: LeadStatus;
  lead_phone?: string | null;
  lead_email?: string | null;
  due_at: string;
  channel: "call" | "email" | "meeting" | "whatsapp" | "other";
  note: string | null;
  status: "pending" | "done" | "skipped";
  completed_at: string | null;
}
export interface Task {
  id: string;
  lead_id: string | null;
  lead_name?: string | null;
  assigned_to: string | null;
  assignee_name?: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  status: "todo" | "in_progress" | "done";
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}
export interface Contact {
  id: string;
  lead_id: string | null;
  lead_name?: string | null;
  lead_status?: LeadStatus | null;
  first_name: string;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notes: string | null;
  last_contacted_at?: string | null;
  created_at: string;
}
export interface CalendarEvent {
  id: string;
  lead_id: string | null;
  lead_name?: string | null;
  title: string;
  description: string | null;
  type: "meeting" | "call" | "demo" | "other";
  location: string | null;
  starts_at: string;
  ends_at: string;
}
export interface AuditCheck {
  key: string;
  label: string;
  passed: boolean;
  weight: number;
  detail: string;
}
export interface Audit {
  id: string;
  business_id: string | null;
  lead_id: string | null;
  business_name?: string | null;
  lead_name?: string | null;
  url: string;
  final_url: string | null;
  status_code: number | null;
  is_reachable: boolean;
  uses_https: boolean;
  response_time_ms: number | null;
  page_title: string | null;
  meta_description: string | null;
  has_viewport: boolean;
  has_favicon: boolean;
  has_canonical: boolean;
  h1_count: number;
  html_lang: string | null;
  page_bytes: number | null;
  score: number;
  checks: AuditCheck[];
  error: string | null;
  created_at: string;
}
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  updated_at: string;
}
export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
export interface Paged<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}
export interface UsageRow {
  metric: string;
  used: number;
  limit: number;
}

export interface LeadDetail extends Lead {
  business: Business | null;
  notes: Note[];
  activities: Activity[];
  follow_ups: FollowUp[];
  tasks: Task[];
  contacts: Contact[];
  audits: Audit[];
}
