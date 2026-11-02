import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loading, FullPageLoader } from "@/components/shared/States";
import Login from "@/pages/auth/Login";
import Register from "@/pages/auth/Register";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import VerifyEmail from "@/pages/auth/VerifyEmail";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";

const Analytics = lazy(() => import("@/pages/Analytics"));
const Employees = lazy(() => import("@/pages/people/Employees"));
const EmployeeDetail = lazy(() => import("@/pages/people/EmployeeDetail"));
const Departments = lazy(() => import("@/pages/people/Departments"));
const Attendance = lazy(() => import("@/pages/time/Attendance"));
const Leave = lazy(() => import("@/pages/time/Leave"));
const Holidays = lazy(() => import("@/pages/time/Holidays"));
const Calendar = lazy(() => import("@/pages/time/Calendar"));
const Payroll = lazy(() => import("@/pages/payroll/Payroll"));
const PayrollRun = lazy(() => import("@/pages/payroll/PayrollRun"));
const Payslip = lazy(() => import("@/pages/payroll/Payslip"));
const Jobs = lazy(() => import("@/pages/talent/Jobs"));
const Candidates = lazy(() => import("@/pages/talent/Candidates"));
const Performance = lazy(() => import("@/pages/talent/Performance"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const L = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<L><Analytics /></L>} />
            <Route path="employees" element={<L><Employees /></L>} />
            <Route path="employees/:id" element={<L><EmployeeDetail /></L>} />
            <Route path="departments" element={<L><Departments /></L>} />
            <Route path="attendance" element={<L><Attendance /></L>} />
            <Route path="leave" element={<L><Leave /></L>} />
            <Route path="holidays" element={<L><Holidays /></L>} />
            <Route path="calendar" element={<L><Calendar /></L>} />
            <Route path="payroll" element={<L><Payroll /></L>} />
            <Route path="payroll/:id" element={<L><PayrollRun /></L>} />
            <Route path="payroll/payslip/:id" element={<L><Payslip /></L>} />
            <Route path="recruitment/jobs" element={<L><Jobs /></L>} />
            <Route path="recruitment/candidates" element={<L><Candidates /></L>} />
            <Route path="performance" element={<L><Performance /></L>} />
            <Route path="notifications" element={<L><Notifications /></L>} />
            <Route path="settings" element={<L><Settings /></L>} />
            <Route path="*" element={<L><NotFound /></L>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
