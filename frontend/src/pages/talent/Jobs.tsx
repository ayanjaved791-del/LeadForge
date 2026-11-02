import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, MapPin, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { EMPLOYMENT_TYPES, JOB_STATUS } from "@/lib/constants";
import { ago } from "@/lib/format";
import type { Department, Job } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect, Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { Pill, StatusPill } from "@/components/shared/Badges";
import { EmptyState, Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";

function JobForm({ open, onOpenChange, job }: { open: boolean; onOpenChange: (v: boolean) => void; job?: Job | null }) {
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments"), enabled: open });
  const [f, setF] = useState({ title: "", department_id: "", location: "", employment_type: "full_time", openings: "1", status: "open", description: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) { setErrors({}); setF({ title: job?.title ?? "", department_id: job?.department_id ?? "", location: job?.location ?? "", employment_type: job?.employment_type ?? "full_time", openings: String(job?.openings ?? 1), status: job?.status ?? "open", description: job?.description ?? "" }); }
  }, [open, job]);
  const save = useMutate((b: Record<string, unknown>) => (job ? api.patch(`/jobs/${job.id}`, b) : api.post("/jobs", b)), { success: job ? "Job updated" : "Job opening created", invalidate: [["jobs"], ["dashboard"]], onFieldErrors: setErrors, onSuccess: () => onOpenChange(false) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ ...f, department_id: f.department_id || null, location: f.location || null, description: f.description || null, openings: Number(f.openings) }); };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={job ? "Edit job opening" : "New job opening"} className="sm:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Job title *" error={errors.title}><TextInput value={f.title} onChange={set("title")} required placeholder="e.g. Senior Accountant" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department"><NativeSelect value={f.department_id} onChange={set("department_id")}><option value="">—</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Field>
          <Field label="Location"><TextInput value={f.location} onChange={set("location")} placeholder="e.g. Lahore · Hybrid" /></Field>
          <Field label="Employment type"><NativeSelect value={f.employment_type} onChange={set("employment_type")}>{Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
          <Field label="Openings"><TextInput type="number" min={1} value={f.openings} onChange={set("openings")} /></Field>
          <Field label="Status"><NativeSelect value={f.status} onChange={set("status")}><option value="open">Open</option><option value="on_hold">On hold</option><option value="closed">Closed</option></NativeSelect></Field>
        </div>
        <Field label="Description"><TextArea value={f.description} onChange={set("description")} rows={5} placeholder="Responsibilities, requirements…" /></Field>
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

export default function Jobs() {
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ open: boolean; job?: Job | null }>({ open: false });
  const [del, setDel] = useState<Job | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["jobs", status], queryFn: () => api.get<Job[]>("/jobs", { status }) });
  const remove = useMutate((id: string) => api.delete(`/jobs/${id}`), { success: "Job deleted", invalidate: [["jobs"], ["candidates"], ["dashboard"]] });
  return (
    <>
      <PageHeader title="Job Openings" actions={<><ChipSelect value={status} onChange={setStatus} options={[{ value: "", label: "All jobs" }, { value: "open", label: "Open" }, { value: "on_hold", label: "On hold" }, { value: "closed", label: "Closed" }]} /><Button onClick={() => setForm({ open: true })}><Plus /> New opening</Button></>} />
      {isLoading ? <Loading /> : !data?.length ? (
        <div className="lf-card"><EmptyState icon={Briefcase} title="No job openings" description="Create an opening, then track applicants in the candidate pipeline." action={<Button onClick={() => setForm({ open: true })}><Plus /> New opening</Button>} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-6">
          {data.map((j) => (
            <div key={j.id} className="lf-card group flex flex-col p-5 transition hover:shadow-theme-md">
              <div className="flex items-start justify-between gap-3">
                <StatusPill map={JOB_STATUS} value={j.status} />
                <div className="flex opacity-0 transition group-hover:opacity-100"><Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, job: j })} aria-label="Edit"><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => setDel(j)} aria-label="Delete"><Trash2 /></Button></div>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-gray-800 dark:text-white/90">{j.title}</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-theme-sm text-gray-500 dark:text-gray-400">
                {j.department_name && <span>{j.department_name}</span>}
                {j.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" />{j.location}</span>}
                <span>{EMPLOYMENT_TYPES[j.employment_type]}</span>
              </p>
              {j.description && <p className="mt-3 line-clamp-3 text-theme-sm text-gray-500">{j.description}</p>}
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800" style={{ marginTop: "1.25rem" }}>
                <Link to={`/recruitment/candidates?job=${j.id}`} className="flex items-center gap-1.5 text-theme-sm font-medium text-brand-500"><UsersRound className="size-4" />{j.candidates} active candidate{j.candidates === 1 ? "" : "s"}</Link>
                <Pill className="bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400">{j.hired}/{j.openings} hired</Pill>
              </div>
              <p className="mt-2 text-theme-xs text-gray-400">Posted {ago(j.created_at)}</p>
            </div>
          ))}
        </div>
      )}
      <JobForm open={form.open} onOpenChange={(o) => setForm({ open: o })} job={form.job} />
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Delete ${del?.title}?`} description="Candidates who applied stay in the pipeline without a linked job." onConfirm={() => del && remove.mutate(del.id)} />
    </>
  );
}
