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
const Discover = lazy(() => import("@/pages/discovery/Discover"));
const MapExplorer = lazy(() => import("@/pages/discovery/MapExplorer"));
const SavedSearches = lazy(() => import("@/pages/discovery/SavedSearches"));
const Leads = lazy(() => import("@/pages/leads/Leads"));
const LeadDetail = lazy(() => import("@/pages/leads/LeadDetail"));
const Pipeline = lazy(() => import("@/pages/leads/Pipeline"));
const Contacts = lazy(() => import("@/pages/crm/Contacts"));
const Activities = lazy(() => import("@/pages/crm/Activities"));
const FollowUps = lazy(() => import("@/pages/crm/FollowUps"));
const Tasks = lazy(() => import("@/pages/crm/Tasks"));
const Calendar = lazy(() => import("@/pages/crm/Calendar"));
const Audit = lazy(() => import("@/pages/Audit"));
const Templates = lazy(() => import("@/pages/Templates"));
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
            <Route path="discover" element={<L><Discover /></L>} />
            <Route path="map" element={<L><MapExplorer /></L>} />
            <Route path="saved-searches" element={<L><SavedSearches /></L>} />
            <Route path="leads" element={<L><Leads /></L>} />
            <Route path="leads/:id" element={<L><LeadDetail /></L>} />
            <Route path="pipeline" element={<L><Pipeline /></L>} />
            <Route path="contacts" element={<L><Contacts /></L>} />
            <Route path="activities" element={<L><Activities /></L>} />
            <Route path="follow-ups" element={<L><FollowUps /></L>} />
            <Route path="tasks" element={<L><Tasks /></L>} />
            <Route path="calendar" element={<L><Calendar /></L>} />
            <Route path="audit" element={<L><Audit /></L>} />
            <Route path="templates" element={<L><Templates /></L>} />
            <Route path="notifications" element={<L><Notifications /></L>} />
            <Route path="settings" element={<L><Settings /></L>} />
            <Route path="*" element={<L><NotFound /></L>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
