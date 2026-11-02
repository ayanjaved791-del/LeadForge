import type { AttendanceStatus, CandidateStage, EmployeeStatus, EmploymentType, LeaveStatus } from "./types";

const NEUTRAL = "dark:bg-white/[0.08] dark:text-gray-200";

export const EMPLOYMENT_TYPES: Record<EmploymentType, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", intern: "Intern" };

export const EMPLOYEE_STATUS: Record<EmployeeStatus, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" },
  probation: { label: "Probation", color: `bg-warning-50 text-warning-600 ${NEUTRAL}` },
  terminated: { label: "Former", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

export const ATTENDANCE: Record<AttendanceStatus, { label: string; color: string; dot: string; short: string }> = {
  present: { label: "Present", short: "P", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500", dot: "bg-success-500" },
  late: { label: "Late", short: "L", color: `bg-warning-50 text-warning-600 ${NEUTRAL}`, dot: "bg-warning-500 dark:bg-gray-300" },
  remote: { label: "Remote", short: "R", color: `bg-brand-50 text-brand-600 ${NEUTRAL}`, dot: "bg-brand-500 dark:bg-gray-400" },
  half_day: { label: "Half day", short: "H", color: `bg-sky-50 text-sky-700 ${NEUTRAL}`, dot: "bg-sky-500 dark:bg-gray-500" },
  absent: { label: "Absent", short: "A", color: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500", dot: "bg-error-500" },
  on_leave: { label: "On leave", short: "OL", color: `bg-violet-50 text-violet-700 ${NEUTRAL}`, dot: "bg-violet-500 dark:bg-gray-600" },
};

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: `bg-warning-50 text-warning-600 ${NEUTRAL}` },
  approved: { label: "Approved", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" },
  rejected: { label: "Rejected", color: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

export const STAGES: { key: CandidateStage; label: string; dot: string }[] = [
  { key: "applied", label: "Applied", dot: "bg-gray-400" },
  { key: "screening", label: "Screening", dot: "bg-sky-500 dark:bg-gray-300" },
  { key: "interview", label: "Interview", dot: "bg-brand-500 dark:bg-gray-300" },
  { key: "offer", label: "Offer", dot: "bg-warning-500 dark:bg-gray-300" },
  { key: "hired", label: "Hired", dot: "bg-success-500" },
  { key: "rejected", label: "Rejected", dot: "bg-error-500" },
];

export const JOB_STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" },
  on_hold: { label: "On hold", color: `bg-warning-50 text-warning-600 ${NEUTRAL}` },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
};

export const REVIEW_CRITERIA = ["Job knowledge", "Quality of work", "Productivity", "Communication", "Teamwork", "Initiative"];

export const GOAL_STATUS: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not started", color: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" },
  in_progress: { label: "In progress", color: `bg-brand-50 text-brand-600 ${NEUTRAL}` },
  completed: { label: "Completed", color: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" },
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
