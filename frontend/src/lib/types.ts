export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type EmployeeStatus = "active" | "probation" | "terminated";
export type AttendanceStatus = "present" | "late" | "remote" | "half_day" | "absent" | "on_leave";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type CandidateStage = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";

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
export interface CompanySettings {
  work_start?: string;
  late_after_minutes?: number;
  work_days?: number[];
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  created_at: string;
  settings: CompanySettings | null;
}
export interface Me {
  user: User;
  workspace: Workspace;
  workspaces: { id: string; name: string; role: string }[];
  csrf: string;
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

export interface Department {
  id: string;
  name: string;
  description: string | null;
  head_id: string | null;
  head_name?: string | null;
  headcount?: number;
  payroll_cost?: number;
  created_at: string;
}

export interface PayItem {
  name: string;
  amount: number;
}
export interface Salary {
  basic: number;
  allowances: PayItem[];
  deductions: PayItem[];
  tax_rate: number;
}
export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  department_id: string | null;
  department_name?: string | null;
  job_title: string | null;
  manager_id: string | null;
  manager_name?: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  join_date: string;
  probation_end: string | null;
  termination_date: string | null;
  salary: Salary;
  bank: { bank_name: string | null; account_name: string | null; account_number: string | null };
  emergency: { name: string | null; phone: string | null; relation: string | null };
  notes: string | null;
  on_leave_today?: boolean;
  created_at: string;
}
export interface EmployeeEvent {
  id: string;
  type: string;
  text: string;
  at: string;
}
export interface LeaveBalance {
  leave_type_id: string;
  leave_type: string;
  allowance: number;
  used: number;
  pending: number;
  remaining: number;
  paid: boolean;
}
export interface EmployeeDetail extends Employee {
  reports: { id: string; full_name: string; job_title: string | null }[];
  balances: LeaveBalance[];
  attendance: Attendance[];
  attendance_summary: Record<AttendanceStatus, number>;
  leave_requests: LeaveRequest[];
  payslips: Payslip[];
  reviews: Review[];
  goals: Goal[];
  events: EmployeeEvent[];
}

export interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  note: string | null;
}
export interface AttendanceRow {
  employee: Pick<Employee, "id" | "full_name" | "employee_code" | "job_title" | "department_name">;
  record: Attendance | null;
  leave: { type: string } | null;
}
export interface AttendanceDay {
  date: string;
  holiday: string | null;
  working_day: boolean;
  rows: AttendanceRow[];
  summary: Record<string, number>;
}

export interface LeaveType {
  id: string;
  name: string;
  days_per_year: number;
  paid: boolean;
  created_at: string;
}
export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  department_name?: string | null;
  leave_type_id: string;
  leave_type?: string;
  paid?: boolean;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}
export interface Holiday {
  id: string;
  name: string;
  date: string;
}

export interface PayrollRun {
  id: string;
  period: string;
  status: "draft" | "finalized" | "paid";
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  created_at: string;
  finalized_at: string | null;
  paid_at: string | null;
}
export interface Payslip {
  id: string;
  run_id: string;
  period: string;
  run_status?: PayrollRun["status"];
  employee_id: string;
  employee: { full_name: string; employee_code: string; job_title: string | null; department_name: string | null; bank_name: string | null; account_number: string | null };
  working_days: number;
  unpaid_days: number;
  basic: number;
  allowances: PayItem[];
  bonus: number;
  deductions: PayItem[];
  unpaid_deduction: number;
  tax_rate: number;
  tax: number;
  gross: number;
  total_deductions: number;
  net: number;
}
export interface PayrollRunDetail extends PayrollRun {
  payslips: Payslip[];
}

export interface Job {
  id: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  location: string | null;
  employment_type: EmploymentType;
  openings: number;
  description: string | null;
  status: "open" | "on_hold" | "closed";
  candidates?: number;
  hired?: number;
  created_at: string;
}
export interface Interview {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  scheduled_at: string;
  interviewer: string | null;
  mode: "onsite" | "video" | "phone";
  notes: string | null;
  outcome: "pending" | "passed" | "failed";
}
export interface Candidate {
  id: string;
  job_id: string | null;
  job_title?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: CandidateStage;
  rating: number;
  notes: string | null;
  resume_url: string | null;
  hired_employee_id: string | null;
  interviews?: Interview[];
  next_interview_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  employee_id: string;
  employee_name?: string;
  period: string;
  reviewer: string | null;
  ratings: Record<string, number>;
  overall: number;
  strengths: string | null;
  improvements: string | null;
  status: "draft" | "completed";
  created_at: string;
  completed_at: string | null;
}
export interface Goal {
  id: string;
  employee_id: string;
  employee_name?: string;
  title: string;
  description: string | null;
  due_date: string | null;
  progress: number;
  status: "not_started" | "in_progress" | "completed";
  created_at: string;
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
