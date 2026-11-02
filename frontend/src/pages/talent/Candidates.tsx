import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, GripVertical, Mail, Phone, Plus, Trash2, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { EMPLOYMENT_TYPES, STAGES } from "@/lib/constants";
import { dtTime, fromLocalInput, relDay, toLocalInput } from "@/lib/format";
import type { Candidate, CandidateStage, Department, Job } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect, Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { Pill, Stars } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const inv = [["candidates"], ["candidate"], ["jobs"], ["dashboard"], ["calendar"]];

function CandidateForm({ open, onOpenChange, jobs, defaultJob }: { open: boolean; onOpenChange: (v: boolean) => void; jobs: Job[]; defaultJob?: string }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", job_id: "", source: "", resume_url: "", rating: 0, notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setErrors({}); setF({ name: "", email: "", phone: "", job_id: defaultJob ?? "", source: "", resume_url: "", rating: 0, notes: "" }); } }, [open, defaultJob]);
  const save = useMutate((b: Record<string, unknown>) => api.post("/candidates", b), { success: "Candidate added", invalidate: inv, onFieldErrors: setErrors, onSuccess: () => onOpenChange(false) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]))); };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add candidate">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name *" error={errors.name}><TextInput value={f.name} onChange={set("name")} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={errors.email}><TextInput type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Applying for"><NativeSelect value={f.job_id} onChange={set("job_id")}><option value="">General application</option>{jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}</NativeSelect></Field>
          <Field label="Source"><TextInput value={f.source} onChange={set("source")} placeholder="Referral, LinkedIn…" /></Field>
        </div>
        <Field label="CV / portfolio link" error={errors.resume_url}><TextInput value={f.resume_url} onChange={set("resume_url")} placeholder="https://…" /></Field>
        <Field label="Initial rating"><Stars value={f.rating} onChange={(v) => setF({ ...f, rating: v })} /></Field>
        <Field label="Notes"><TextArea value={f.notes} onChange={set("notes")} rows={3} /></Field>
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Add candidate</Button></div>
      </form>
    </Modal>
  );
}

function HireModal({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  const nav = useNavigate();
  const depts = useQuery({ queryKey: ["departments"], queryFn: () => api.get<Department[]>("/departments"), enabled: !!candidate });
  const jobs = useQuery({ queryKey: ["jobs", ""], queryFn: () => api.get<Job[]>("/jobs"), enabled: !!candidate });
  const job = jobs.data?.find((j) => j.id === candidate?.job_id);
  const [f, setF] = useState({ job_title: "", department_id: "", employment_type: "full_time", join_date: "", probation_end: "", basic: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!candidate) return;
    const join = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const prob = new Date(Date.now() + 104 * 86400000).toISOString().slice(0, 10);
    setErrors({});
    setF({ job_title: job?.title ?? "", department_id: job?.department_id ?? "", employment_type: job?.employment_type ?? "full_time", join_date: join, probation_end: prob, basic: "" });
  }, [candidate, job]);
  const hire = useMutate((b: Record<string, unknown>) => api.post<{ employee_id: string }>(`/candidates/${candidate!.id}/hire`, b), {
    success: `${candidate?.name} hired`, invalidate: [...inv, ["employees"], ["notifications"]], onFieldErrors: setErrors, onSuccess: (r) => { onClose(); nav(`/employees/${r.employee_id}`); },
  });
  return (
    <Modal open={!!candidate} onOpenChange={(o) => !o && onClose()} title={`Hire ${candidate?.name ?? ""}`} description="Creates an employee record on probation. You can complete their profile afterwards.">
      <form onSubmit={(e) => { e.preventDefault(); hire.mutate({ ...f, department_id: f.department_id || null, probation_end: f.probation_end || null, basic: Number(f.basic || 0) }); }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title"><TextInput value={f.job_title} onChange={(e) => setF({ ...f, job_title: e.target.value })} /></Field>
          <Field label="Department"><NativeSelect value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">—</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Field>
          <Field label="Employment type"><NativeSelect value={f.employment_type} onChange={(e) => setF({ ...f, employment_type: e.target.value })}>{Object.entries(EMPLOYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
          <Field label="Basic salary (monthly)"><TextInput type="number" min={0} step="0.01" value={f.basic} onChange={(e) => setF({ ...f, basic: e.target.value })} /></Field>
          <Field label="Start date *" error={errors.join_date}><TextInput type="date" value={f.join_date} onChange={(e) => setF({ ...f, join_date: e.target.value })} required /></Field>
          <Field label="Probation ends"><TextInput type="date" value={f.probation_end} onChange={(e) => setF({ ...f, probation_end: e.target.value })} /></Field>
        </div>
        {Object.entries(errors).filter(([k]) => k !== "join_date").map(([k, v]) => <p key={k} className="text-xs text-error-500">{v}</p>)}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={hire.isPending}><UserCheck /> Hire & create employee</Button></div>
      </form>
    </Modal>
  );
}

function CandidateSheet({ id, onClose, onHire }: { id: string | null; onClose: () => void; onHire: (c: Candidate) => void }) {
  const { data: c } = useQuery({ queryKey: ["candidate", id], queryFn: () => api.get<Candidate>(`/candidates/${id}`), enabled: !!id });
  const [notes, setNotes] = useState("");
  const [iv, setIv] = useState({ scheduled_at: "", interviewer: "", mode: "onsite" });
  const [del, setDel] = useState(false);
  useEffect(() => { if (c) setNotes(c.notes ?? ""); }, [c]);
  const update = useMutate((b: Record<string, unknown>) => api.patch(`/candidates/${id}`, b), { invalidate: inv });
  const move = useMutate((stage: CandidateStage) => api.post(`/candidates/${id}/move`, { stage, index: 0 }), { invalidate: inv });
  const addIv = useMutate((b: Record<string, unknown>) => api.post(`/candidates/${id}/interviews`, b), { success: "Interview scheduled", invalidate: inv, onSuccess: () => setIv({ scheduled_at: "", interviewer: "", mode: "onsite" }) });
  const ivOutcome = useMutate(({ iid, outcome }: { iid: string; outcome: string }) => api.patch(`/interviews/${iid}`, { outcome }), { invalidate: inv });
  const ivDelete = useMutate((iid: string) => api.delete(`/interviews/${iid}`), { invalidate: inv });
  const remove = useMutate(() => api.delete(`/candidates/${id}`), { success: "Candidate deleted", invalidate: inv, onSuccess: onClose });
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-lg dark:border-gray-800 dark:bg-gray-900">
        {!c ? <Loading /> : (
          <>
            <SheetHeader className="border-b border-gray-100 p-6 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Avatar name={c.name} className="size-12 text-sm" />
                <div className="min-w-0"><SheetTitle className="text-gray-800 dark:text-white/90">{c.name}</SheetTitle><p className="text-theme-sm text-gray-500">{c.job_title ?? "General application"}{c.source && ` · via ${c.source}`}</p></div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <NativeSelect value={c.stage} disabled={c.stage === "hired"} onChange={(e) => move.mutate(e.target.value as CandidateStage)} className="h-9 w-40">
                  {STAGES.filter((s) => s.key !== "hired" || c.stage === "hired").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </NativeSelect>
                {c.stage !== "hired" && c.stage !== "rejected" && <Button size="sm" onClick={() => onHire(c)}><UserCheck /> Hire</Button>}
                {c.stage === "hired" && c.hired_employee_id && <Button size="sm" variant="outline" asChild><Link to={`/employees/${c.hired_employee_id}`}>View employee</Link></Button>}
                <Button size="icon-sm" variant="ghost" onClick={() => setDel(true)} aria-label="Delete"><Trash2 /></Button>
              </div>
            </SheetHeader>
            <div className="space-y-6 p-6">
              <div className="space-y-2 text-theme-sm">
                {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-gray-700 hover:text-brand-500 dark:text-gray-300"><Mail className="size-4 text-gray-400" />{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-2 text-gray-700 hover:text-brand-500 dark:text-gray-300"><Phone className="size-4 text-gray-400" />{c.phone}</a>}
                {c.resume_url && <a href={c.resume_url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-2 text-brand-500"><ExternalLink className="size-4" />CV / portfolio</a>}
                <div className="flex items-center gap-2 pt-1"><span className="text-gray-500">Rating</span><Stars value={c.rating} onChange={(v) => update.mutate({ rating: v })} /></div>
              </div>
              <section>
                <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Interviews</h4>
                <ul className="space-y-2">
                  {c.interviews?.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                      <CalendarClock className="size-4 shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1"><p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{dtTime(i.scheduled_at)}</p><p className="text-theme-xs capitalize text-gray-500">{i.mode}{i.interviewer && ` · ${i.interviewer}`}</p></div>
                      <NativeSelect value={i.outcome} onChange={(e) => ivOutcome.mutate({ iid: i.id, outcome: e.target.value })} className="h-8 w-28 text-xs"><option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option></NativeSelect>
                      <button onClick={() => ivDelete.mutate(i.id)} className="text-gray-400 hover:text-error-500" aria-label="Delete interview"><XCircle className="size-4" /></button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={(e) => { e.preventDefault(); if (iv.scheduled_at) addIv.mutate({ ...iv, scheduled_at: fromLocalInput(iv.scheduled_at) }); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <TextInput type="datetime-local" className="h-10" value={iv.scheduled_at} min={toLocalInput(new Date().toISOString())} onChange={(e) => setIv({ ...iv, scheduled_at: e.target.value })} required />
                  <TextInput className="h-10" placeholder="Interviewer" value={iv.interviewer} onChange={(e) => setIv({ ...iv, interviewer: e.target.value })} />
                  <Button type="submit" size="sm" className="h-10" disabled={addIv.isPending}><Plus /> Schedule</Button>
                </form>
              </section>
              <section>
                <h4 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white/90">Notes</h4>
                <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} onBlur={() => notes !== (c.notes ?? "") && update.mutate({ notes })} placeholder="Interview feedback, salary expectations…" />
                <p className="mt-1 text-theme-xs text-gray-400">Saved automatically when you click away.</p>
              </section>
            </div>
            <Confirm open={del} onOpenChange={setDel} title={`Delete ${c.name}?`} description="The candidate and their interviews will be removed." onConfirm={() => remove.mutate(undefined)} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Candidates() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [job, setJob] = useState(params.get("job") ?? "");
  const [openId, setOpenId] = useState<string | null>(params.get("open"));
  const [adding, setAdding] = useState(false);
  const [hiring, setHiring] = useState<Candidate | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ stage: CandidateStage; index: number } | null>(null);
  const jobs = useQuery({ queryKey: ["jobs", ""], queryFn: () => api.get<Job[]>("/jobs") });
  const key = ["candidates", job];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Candidate[]>("/candidates", { job_id: job }) });
  const columns = useMemo(() => {
    const m = new Map<CandidateStage, Candidate[]>(STAGES.map((s) => [s.key, []]));
    data?.forEach((c) => m.get(c.stage)?.push(c));
    return m;
  }, [data]);
  const drop = async (stage: CandidateStage, index: number) => {
    const id = dragId;
    setDragId(null);
    setOver(null);
    if (!id || !data) return;
    const cand = data.find((c) => c.id === id)!;
    if (stage === "hired" && cand.stage !== "hired") return setHiring(cand);
    try {
      await api.post(`/candidates/${id}/move`, { stage, index });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const cardOver = (e: DragEvent, stage: CandidateStage, i: number) => {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOver({ stage, index: i + (e.clientY > r.top + r.height / 2 ? 1 : 0) });
  };
  return (
    <>
      <PageHeader title="Candidates" description="Drag candidates between stages. Drop on Hired (or use Hire) to create their employee record." actions={<><ChipSelect value={job} onChange={(v) => { setJob(v); params.delete("job"); setParams(params, { replace: true }); }} options={[{ value: "", label: "All jobs" }, ...(jobs.data?.map((j) => ({ value: j.id, label: j.title })) ?? [])]} /><Button onClick={() => setAdding(true)}><Plus /> Add candidate</Button></>} />
      {isLoading ? <Loading /> : (
        <div className="custom-scrollbar -mx-4 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
          <div className="flex min-w-max gap-4">
            {STAGES.map((s) => {
              const list = columns.get(s.key)!;
              return (
                <div key={s.key} className={cn("flex w-[280px] flex-col rounded-2xl border border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-white/[0.02]", over?.stage === s.key && "border-brand-300 dark:border-gray-600")}
                  onDragOver={(e) => { e.preventDefault(); if (!list.length || over?.stage !== s.key) setOver({ stage: s.key, index: over?.stage === s.key ? over.index : list.length }); }}
                  onDrop={(e) => { e.preventDefault(); drop(s.key, over?.stage === s.key ? over.index : list.length); }}>
                  <div className="flex items-center gap-2 px-4 pb-3 pt-4 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                    <span className={cn("size-2 rounded-full", s.dot)} />{s.label}
                    <span className="rounded-full bg-white px-2 py-0.5 text-theme-xs font-medium text-gray-500 shadow-theme-xs dark:bg-gray-800 dark:text-gray-400">{list.length}</span>
                  </div>
                  <div className="flex min-h-[120px] flex-1 flex-col gap-3 px-3 pb-3">
                    {list.map((c, i) => (
                      <div key={c.id}>
                        {over?.stage === s.key && over.index === i && dragId && dragId !== c.id && <div className="mb-3 h-1 rounded-full bg-brand-500" />}
                        <div draggable={c.stage !== "hired"} onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setDragId(null); setOver(null); }} onDragOver={(e) => cardOver(e, s.key, i)} onClick={() => setOpenId(c.id)}
                          className={cn("group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:shadow-theme-md dark:border-gray-800 dark:bg-[#0d0d0d]", dragId === c.id && "opacity-40")}>
                          <div className="flex items-start gap-3">
                            <Avatar name={c.name} />
                            <div className="min-w-0 flex-1"><p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{c.name}</p><p className="truncate text-theme-xs text-gray-500">{c.job_title ?? "General"}</p></div>
                            {c.stage !== "hired" && <GripVertical className="size-4 shrink-0 text-gray-300" />}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <Stars value={c.rating} size="size-3.5" />
                            {c.next_interview_at ? <Pill className="bg-warning-50 text-warning-600 dark:bg-white/[0.08] dark:text-gray-200"><CalendarClock className="size-3" />{relDay(c.next_interview_at)}</Pill> : c.source ? <span className="text-theme-xs text-gray-400">{c.source}</span> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                    {over?.stage === s.key && over.index >= list.length && dragId && <div className="h-1 rounded-full bg-brand-500" />}
                    {!list.length && <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-theme-xs text-gray-400 dark:border-gray-800">{s.key === "applied" ? "Add candidates to start" : "Drop here"}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <CandidateForm open={adding} onOpenChange={setAdding} jobs={jobs.data?.filter((j) => j.status !== "closed") ?? []} defaultJob={job || undefined} />
      <CandidateSheet id={openId} onClose={() => { setOpenId(null); if (params.get("open")) { params.delete("open"); setParams(params, { replace: true }); } }} onHire={(c) => { setOpenId(null); setHiring(c); }} />
      <HireModal candidate={hiring} onClose={() => setHiring(null)} />
    </>
  );
}
