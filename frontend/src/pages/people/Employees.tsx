import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, LayoutGrid, List, Plus, Search, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPES } from "@/lib/constants";
import { dt } from "@/lib/format";
import type { Department, Employee, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { Pill, StatusPill } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmployeeFormModal } from "./EmployeeFormModal";

export default function Employees() {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [params] = useSearchParams();
  const [dept, setDept] = useState(params.get("dept") ?? "");
  const [status, setStatus] = useState("current");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "grid">(() => (localStorage.getItem("hellohr:emp-view") as "list" | "grid") || "list");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setDeb(q.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    try { localStorage.setItem("hellohr:emp-view", view); } catch { /* ignore */ }
  }, [view]);
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments") });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["employees", deb, dept, status, type, sort, page],
    queryFn: () => api.get<Paged<Employee>>("/employees", { q: deb, department_id: dept, status, type, sort, page, limit: view === "grid" ? 24 : 25 }),
  });
  const exportCsv = async () => {
    try { await api.download("/employees/export", {}, `hellohr-employees-${new Date().toISOString().slice(0, 10)}.csv`); } catch (e) { toast.error(errorMessage(e)); }
  };
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };
  const filtered = !!(deb || dept || type || status !== "current");

  return (
    <>
      <PageHeader
        title="Employees"
        description={data ? `${data.total} ${status === "terminated" ? "former" : ""} employee${data.total === 1 ? "" : "s"}` : undefined}
        actions={<><Button variant="outline" onClick={exportCsv}><Download /> Export</Button><Button onClick={() => setOpen(true)}><Plus /> Add employee</Button></>}
      />
      <div className="lf-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, ID or job title…" className="lf-input h-10 pl-10" />
          </div>
          <ChipSelect value={dept} onChange={reset(setDept)} options={[{ value: "", label: "All departments" }, ...(depts.data?.map((d) => ({ value: d.id, label: d.name })) ?? []), { value: "none", label: "No department" }]} />
          <ChipSelect value={status} onChange={reset(setStatus)} options={[{ value: "current", label: "Current staff" }, { value: "active", label: "Active" }, { value: "probation", label: "On probation" }, { value: "terminated", label: "Former" }, { value: "all", label: "Everyone" }]} />
          <ChipSelect value={type} onChange={reset(setType)} options={[{ value: "", label: "All types" }, ...Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => ({ value: k, label: v }))]} />
          <ChipSelect value={sort} onChange={reset(setSort)} options={[{ value: "name", label: "Name A–Z" }, { value: "newest", label: "Newest joiners" }, { value: "oldest", label: "Longest serving" }, { value: "code", label: "Employee ID" }]} />
          <div className="flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-800">
            {([["list", List], ["grid", LayoutGrid]] as const).map(([v, Icon]) => (
              <button key={v} onClick={() => setView(v)} className={cn("rounded-md p-1.5", view === v ? "bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white" : "text-gray-400")} aria-label={`${v} view`}><Icon className="size-4" /></button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.items.length ? (
            <EmptyState icon={UsersRound} title={filtered ? "No employees match these filters" : "No employees yet"} description={filtered ? "Try a different search or filter." : "Add your team to start tracking attendance, leave and payroll."} action={!filtered && <Button onClick={() => setOpen(true)}><Plus /> Add employee</Button>} />
          ) : view === "grid" ? (
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((e) => (
                <Link key={e.id} to={`/employees/${e.id}`} className="group rounded-2xl border border-gray-200 p-5 text-center transition hover:-translate-y-0.5 hover:shadow-theme-md dark:border-gray-800 dark:hover:bg-white/[0.02]">
                  <Avatar name={e.full_name} className="mx-auto size-14 text-base" />
                  <p className="mt-3 truncate font-semibold text-gray-800 group-hover:text-brand-500 dark:text-white/90">{e.full_name}</p>
                  <p className="truncate text-theme-sm text-gray-500 dark:text-gray-400">{e.job_title ?? "—"}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                    {e.department_name && <Pill className="bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400">{e.department_name}</Pill>}
                    {e.on_leave_today ? <Pill className="bg-violet-50 text-violet-700 dark:bg-white/[0.08] dark:text-gray-200">On leave</Pill> : <StatusPill map={EMPLOYEE_STATUS} value={e.status} />}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Manager</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.items.map((e) => (
                    <tr key={e.id} className="text-theme-sm hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <Link to={`/employees/${e.id}`} className="flex items-center gap-3">
                          <Avatar name={e.full_name} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{e.full_name}</span>
                            <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{e.job_title ?? "No job title"} · {e.employee_code}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.department_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{EMPLOYMENT_TYPES[e.employment_type]}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{e.manager_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{dt(e.join_date + "T00:00:00")}</td>
                      <td className="px-5 py-3">{e.on_leave_today ? <Pill className="bg-violet-50 text-violet-700 dark:bg-white/[0.08] dark:text-gray-200">On leave</Pill> : <StatusPill map={EMPLOYEE_STATUS} value={e.status} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {data && <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      </div>
      <EmployeeFormModal open={open} onOpenChange={setOpen} />
    </>
  );
}
