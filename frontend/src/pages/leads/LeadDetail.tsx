import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardList,
  ExternalLink,
  FileSearch,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/use-auth";
import { useMutate } from "@/hooks/use-mutate";
import { ACTIVITY_TYPES, LEAD_STATUSES, PRIORITIES } from "@/lib/constants";
import { ago, dt, dtTime, money, relDay, safeUrl } from "@/lib/format";
import type { Activity, EmailTemplate, FollowUp, LeadDetail as LeadDetailT, LeadStatus, Priority, Task } from "@/lib/types";
import { Card } from "@/components/shared/PageHeader";
import { Pill, PriorityBadge, ScoreBreakdown, WebsiteBadge } from "@/components/shared/Badges";
import { ErrorState, Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LeadFormModal } from "./LeadFormModal";
import { ActivityFormModal } from "../crm/ActivityFormModal";
import { FollowUpFormModal } from "../crm/FollowUpFormModal";
import { TaskFormModal } from "../crm/TaskFormModal";
import { ContactFormModal } from "../crm/ContactFormModal";
import { EventFormModal } from "../crm/EventFormModal";

const ACT_ICON = { call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle, note: StickyNote, status_change: Check, system: ClipboardList };

export function fillTemplate(text: string, lead: LeadDetailT, myName: string) {
  const vars: Record<string, string> = {
    business_name: lead.name,
    city: lead.business?.city ?? "",
    category: lead.business?.category_label ?? lead.category ?? "",
    website: lead.website ?? "",
    phone: lead.phone ?? "",
    my_name: myName,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function ComposeEmail({ lead, open, onOpenChange }: { lead: LeadDetailT; open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useMe();
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.get<EmailTemplate[]>("/email-templates"), enabled: open });
  const [to, setTo] = useState(lead.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const log = useMutate((b: Record<string, unknown>) => api.post("/activities", b), { success: "Email logged on the lead", invalidate: [["lead"], ["activities"], ["dashboard"]] });
  const apply = (id: string) => {
    const t = templates.data?.find((x) => x.id === id);
    if (!t) return;
    setSubject(fillTemplate(t.subject, lead, me.user.name));
    setBody(fillTemplate(t.body, lead, me.user.name));
  };
  const send = () => {
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    log.mutate({ lead_id: lead.id, type: "email", direction: "outbound", subject, body });
    onOpenChange(false);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Compose email" description="Opens in your email app and logs the email on this lead." className="sm:max-w-2xl">
      <div className="space-y-4">
        <Field label="Template" hint={!templates.data?.length ? <Link to="/templates" className="text-brand-500">Create an email template</Link> : "Variables like {{business_name}} are filled automatically."}>
          <NativeSelect defaultValue="" onChange={(e) => apply(e.target.value)}>
            <option value="">— Start from scratch —</option>
            {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="To">
          <TextInput type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@business.com" />
        </Field>
        <Field label="Subject">
          <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
        </Field>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={!to || !subject}><Mail /> Open in email app</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function LeadDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { data: lead, isLoading, error, refetch } = useQuery({ queryKey: ["lead", id], queryFn: () => api.get<LeadDetailT>(`/leads/${id}`) });
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [activity, setActivity] = useState<null | "call" | "email" | "meeting" | "whatsapp" | "note">(null);
  const [fuOpen, setFuOpen] = useState<{ open: boolean; fu?: FollowUp | null }>({ open: false });
  const [taskOpen, setTaskOpen] = useState<{ open: boolean; task?: Task | null }>({ open: false });
  const [contactOpen, setContactOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");

  const inv = [["lead", id], ["leads"], ["dashboard"], ["pipeline"]];
  const update = useMutate((b: Record<string, unknown>) => api.patch(`/leads/${id}`, b), { invalidate: inv });
  const remove = useMutate(() => api.delete(`/leads/${id}`), { success: "Lead removed", invalidate: [["leads"], ["dashboard"], ["pipeline"]], onSuccess: () => nav("/leads") });
  const addNote = useMutate((body: string) => api.post(`/leads/${id}/notes`, { body }), { success: "Note added", invalidate: [["lead", id]], onSuccess: () => setNote("") });
  const delNote = useMutate((nid: string) => api.delete(`/leads/${id}/notes/${nid}`), { invalidate: [["lead", id]] });
  const delActivity = useMutate((aid: string) => api.delete(`/activities/${aid}`), { invalidate: [["lead", id], ["activities"]] });
  const fuStatus = useMutate(({ fid, status }: { fid: string; status: string }) => api.patch(`/follow-ups/${fid}`, { status }), { invalidate: [["lead", id], ["follow-ups"], ["dashboard"]] });
  const taskStatus = useMutate(({ tid, status }: { tid: string; status: string }) => api.patch(`/tasks/${tid}`, { status }), { invalidate: [["lead", id], ["tasks"]] });
  const delContact = useMutate((cid: string) => api.delete(`/contacts/${cid}`), { success: "Contact removed", invalidate: [["lead", id], ["contacts"]] });
  const audit = useMutate(() => api.post("/audits", { lead_id: id }), { success: "Audit complete", invalidate: [["lead", id], ["audits"]] });

  if (isLoading) return <Loading />;
  if (error || !lead) return <ErrorState error={error} onRetry={refetch} />;

  const setStatus = (s: LeadStatus) => {
    if (s === "lost") {
      setLostReason(lead.lost_reason ?? "");
      return setLostOpen(true);
    }
    update.mutate({ status: s });
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || lead.tags.includes(t)) return setTagInput("");
    update.mutate({ tags: [...lead.tags, t] });
    setTagInput("");
  };
  const web = safeUrl(lead.website);
  const pendingFu = lead.follow_ups.filter((f) => f.status === "pending");
  const wa = lead.contacts.find((c) => c.whatsapp)?.whatsapp ?? lead.phone;

  return (
    <>
      <div className="mb-6">
        <Link to="/leads" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400"><ArrowLeft className="size-4" /> All leads</Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{lead.name}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {lead.business?.category_label ?? lead.category ?? "Lead"} · added {ago(lead.created_at)}
              {lead.won_at && <> · won {dt(lead.won_at)}</>}
              {lead.lost_at && <> · lost {dt(lead.lost_at)}{lead.lost_reason ? ` (${lead.lost_reason})` : ""}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={lead.status} onChange={(e) => setStatus(e.target.value as LeadStatus)} className="h-10 w-44">
              {LEAD_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </NativeSelect>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-10"><Plus /> Log activity</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl dark:border-gray-800 dark:bg-gray-dark">
                {(["call", "email", "meeting", "whatsapp", "note"] as const).map((t) => {
                  const Icon = ACT_ICON[t];
                  return (
                    <DropdownMenuItem key={t} onClick={() => setActivity(t)} className="gap-2 rounded-lg">
                      <Icon className="size-4" /> {ACTIVITY_TYPES[t].label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-10" aria-label="More"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl dark:border-gray-800 dark:bg-gray-dark">
                <DropdownMenuItem onClick={() => setEdit(true)} className="gap-2 rounded-lg"><Pencil className="size-4" /> Edit lead</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEmailOpen(true)} className="gap-2 rounded-lg"><Mail className="size-4" /> Compose email</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEventOpen(true)} className="gap-2 rounded-lg"><CalendarPlus className="size-4" /> Schedule meeting</DropdownMenuItem>
                {lead.website && <DropdownMenuItem onClick={() => audit.mutate(undefined)} className="gap-2 rounded-lg"><FileSearch className="size-4" /> Run website audit</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => setDel(true)} className="gap-2 rounded-lg text-error-500"><Trash2 className="size-4" /> Delete lead</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Deal value", value: lead.deal_value ? money(lead.deal_value) : "—" },
              { label: "Priority", value: <PriorityBadge priority={lead.priority} /> },
              { label: "Next follow-up", value: pendingFu[0] ? relDay(pendingFu[0].due_at) : "None" },
              { label: "Last activity", value: lead.last_activity_at ? ago(lead.last_activity_at) : "None yet" },
            ].map((s) => (
              <div key={s.label} className="lf-card p-4">
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <div className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">{s.value}</div>
              </div>
            ))}
          </div>

          <div className="lf-card p-5 sm:p-6">
            <Tabs defaultValue="activity">
              <TabsList className="mb-5 h-auto flex-wrap justify-start gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
                {[
                  ["activity", `Activity (${lead.activities.length})`],
                  ["notes", `Notes (${lead.notes.length})`],
                  ["followups", `Follow-ups (${pendingFu.length})`],
                  ["tasks", `Tasks (${lead.tasks.filter((t) => t.status !== "done").length})`],
                  ["contacts", `Contacts (${lead.contacts.length})`],
                  ["audits", `Audits (${lead.audits.length})`],
                ].map(([v, l]) => (
                  <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="activity">
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button size="xs" variant="outline" onClick={() => setActivity("call")}><Phone /> Call</Button>
                  <Button size="xs" variant="outline" onClick={() => setEmailOpen(true)}><Mail /> Email</Button>
                  <Button size="xs" variant="outline" onClick={() => setActivity("meeting")}><Video /> Meeting</Button>
                  <Button size="xs" variant="outline" onClick={() => setActivity("whatsapp")}><MessageCircle /> WhatsApp</Button>
                </div>
                {lead.activities.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-500">No activity yet.</p>
                ) : (
                  <ol className="relative ml-4 border-l border-gray-200 dark:border-gray-800">
                    {lead.activities.map((a: Activity) => {
                      const Icon = ACT_ICON[a.type];
                      const editable = a.type !== "system" && a.type !== "status_change";
                      return (
                        <li key={a.id} className="group mb-5 ml-6">
                          <span className={`absolute -left-4 flex size-8 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900 ${ACTIVITY_TYPES[a.type].color}`}>
                            <Icon className="size-4" />
                          </span>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                                {a.type === "status_change" ? `Status: ${a.body}` : a.subject || ACTIVITY_TYPES[a.type].label}
                                {a.direction && <span className="ml-2 text-theme-xs font-normal capitalize text-gray-400">{a.direction}</span>}
                              </p>
                              {a.type !== "status_change" && a.body && <p className="mt-1 whitespace-pre-wrap text-theme-sm text-gray-600 dark:text-gray-300">{a.body}</p>}
                              <p className="mt-1 text-theme-xs text-gray-400">
                                {dtTime(a.occurred_at)}
                                {a.author && ` · ${a.author}`}
                                {a.contact_name && ` · with ${a.contact_name}`}
                                {a.outcome && ` · ${a.outcome}`}
                                {a.duration_minutes ? ` · ${a.duration_minutes} min` : ""}
                              </p>
                            </div>
                            {editable && (
                              <button onClick={() => delActivity.mutate(a.id)} className="invisible text-gray-400 hover:text-error-500 group-hover:visible" aria-label="Delete activity">
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="notes">
                <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(note.trim()); }} className="mb-5">
                  <TextArea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note…" rows={3} />
                  <div className="mt-2 flex justify-end"><Button size="sm" type="submit" disabled={!note.trim() || addNote.isPending}>Add note</Button></div>
                </form>
                {lead.notes.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No notes yet.</p>}
                <ul className="space-y-3">
                  {lead.notes.map((n) => (
                    <li key={n.id} className="group rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
                      <p className="whitespace-pre-wrap text-theme-sm text-gray-700 dark:text-gray-300">{n.body}</p>
                      <div className="mt-2 flex items-center justify-between text-theme-xs text-gray-400">
                        <span>{n.author ?? "Unknown"} · {dtTime(n.created_at)}</span>
                        <button onClick={() => delNote.mutate(n.id)} className="invisible hover:text-error-500 group-hover:visible">Delete</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="followups">
                <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setFuOpen({ open: true })}><CalendarClock /> Schedule follow-up</Button></div>
                {lead.follow_ups.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No follow-ups scheduled.</p>}
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lead.follow_ups.map((f) => {
                    const overdue = f.status === "pending" && new Date(f.due_at) < new Date();
                    return (
                      <li key={f.id} className="flex items-center gap-3 py-3">
                        <button
                          onClick={() => fuStatus.mutate({ fid: f.id, status: f.status === "pending" ? "done" : "pending" })}
                          className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${f.status !== "pending" ? "border-success-500 bg-success-500 text-white" : "border-gray-300 dark:border-gray-700"}`}
                          aria-label="Toggle done"
                        >
                          {f.status !== "pending" && <Check className="size-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-theme-sm font-medium capitalize ${f.status !== "pending" ? "text-gray-400 line-through" : "text-gray-800 dark:text-white/90"}`}>{f.channel}{f.note ? ` — ${f.note}` : ""}</p>
                          <p className={`text-theme-xs ${overdue ? "text-error-500" : "text-gray-500 dark:text-gray-400"}`}>{overdue ? "Overdue · " : ""}{dtTime(f.due_at)}</p>
                        </div>
                        {f.status === "pending" && <Button size="xs" variant="ghost" onClick={() => setFuOpen({ open: true, fu: { ...f, lead_name: lead.name } })}>Edit</Button>}
                      </li>
                    );
                  })}
                </ul>
              </TabsContent>

              <TabsContent value="tasks">
                <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setTaskOpen({ open: true })}><Plus /> New task</Button></div>
                {lead.tasks.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No tasks for this lead.</p>}
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lead.tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <button
                        onClick={() => taskStatus.mutate({ tid: t.id, status: t.status === "done" ? "todo" : "done" })}
                        className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${t.status === "done" ? "border-success-500 bg-success-500 text-white" : "border-gray-300 dark:border-gray-700"}`}
                        aria-label="Toggle done"
                      >
                        {t.status === "done" && <Check className="size-4" />}
                      </button>
                      <button onClick={() => setTaskOpen({ open: true, task: { ...t, lead_name: lead.name } })} className="min-w-0 flex-1 text-left">
                        <p className={`text-theme-sm font-medium ${t.status === "done" ? "text-gray-400 line-through" : "text-gray-800 dark:text-white/90"}`}>{t.title}</p>
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{t.due_at ? `Due ${relDay(t.due_at)}` : "No due date"}</p>
                      </button>
                      <PriorityBadge priority={t.priority} />
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="contacts">
                <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setContactOpen(true)}><Plus /> Add contact</Button></div>
                {lead.contacts.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Add the people you talk to at this business.</p>}
                <ul className="grid gap-3 sm:grid-cols-2">
                  {lead.contacts.map((c) => (
                    <li key={c.id} className="group rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15"><UserRound className="size-4" /></span>
                          <div>
                            <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</p>
                            {c.job_title && <p className="text-theme-xs text-gray-500">{c.job_title}</p>}
                          </div>
                        </div>
                        <button onClick={() => delContact.mutate(c.id)} className="invisible text-gray-400 hover:text-error-500 group-hover:visible" aria-label="Remove"><X className="size-4" /></button>
                      </div>
                      <div className="mt-3 space-y-1 text-theme-xs text-gray-600 dark:text-gray-400">
                        {c.email && <a href={`mailto:${c.email}`} className="block hover:text-brand-500">{c.email}</a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="block hover:text-brand-500">{c.phone}</a>}
                        {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="block hover:text-brand-500">WhatsApp {c.whatsapp}</a>}
                      </div>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="audits">
                {lead.website && <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => audit.mutate(undefined)} disabled={audit.isPending}><FileSearch /> {audit.isPending ? "Auditing…" : "Run audit"}</Button></div>}
                {lead.audits.length === 0 && <p className="py-6 text-center text-sm text-gray-500">{lead.website ? "No audits yet." : "Add a website to this lead to run an audit."}</p>}
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {lead.audits.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{a.final_url ?? a.url}</p>
                        <p className="text-theme-xs text-gray-500">{dtTime(a.created_at)} · {a.checks.filter((c) => !c.passed).length} issues</p>
                      </div>
                      <Link to={`/audit?id=${a.id}`} className="shrink-0 text-theme-sm font-semibold text-brand-500">{a.score}/100</Link>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="col-span-12 space-y-4 md:space-y-6 xl:col-span-4">
          <Card title="Details" actions={<Button size="xs" variant="ghost" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}>
            <dl className="space-y-3 text-theme-sm">
              <div className="flex gap-3"><Phone className="mt-0.5 size-4 text-gray-400" /><dd className="min-w-0 break-words">{lead.phone ? <a href={`tel:${lead.phone}`} className="text-gray-800 hover:text-brand-500 dark:text-white/90">{lead.phone}</a> : <span className="text-gray-400">No phone</span>}</dd></div>
              <div className="flex gap-3"><Mail className="mt-0.5 size-4 text-gray-400" /><dd className="min-w-0 break-words">{lead.email ? <a href={`mailto:${lead.email}`} className="text-gray-800 hover:text-brand-500 dark:text-white/90">{lead.email}</a> : <span className="text-gray-400">No email</span>}</dd></div>
              <div className="flex gap-3"><Globe className="mt-0.5 size-4 text-gray-400" /><dd className="min-w-0 break-words">{web ? <a href={web} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-500">{lead.website} <ExternalLink className="size-3" /></a> : <span className="text-gray-400">No website</span>}</dd></div>
              <div className="flex gap-3"><MapPin className="mt-0.5 size-4 text-gray-400" /><dd className="min-w-0 text-gray-800 dark:text-white/90">{lead.address ?? <span className="text-gray-400">No address</span>}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {lead.phone && <Button size="xs" variant="outline" asChild><a href={`tel:${lead.phone}`} onClick={() => setTimeout(() => setActivity("call"), 300)}><Phone /> Call</a></Button>}
              {wa && <Button size="xs" variant="outline" asChild><a href={`https://wa.me/${wa.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setActivity("whatsapp"), 300)}><MessageCircle /> WhatsApp</a></Button>}
              <Button size="xs" variant="outline" onClick={() => setEmailOpen(true)}><Mail /> Email</Button>
            </div>
            <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="mb-2 text-theme-xs font-medium text-gray-500 dark:text-gray-400">Priority</p>
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((p) => (
                  <button key={p.key} onClick={() => update.mutate({ priority: p.key as Priority })} className={`rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${lead.priority === p.key ? p.color + " ring-1 ring-current" : "bg-gray-50 text-gray-500 dark:bg-white/5"}`}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="mb-2 text-theme-xs font-medium text-gray-500 dark:text-gray-400">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <Pill key={t} className="bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300">
                    {t}
                    <button onClick={() => update.mutate({ tags: lead.tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`}><X className="size-3" /></button>
                  </Pill>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  onBlur={addTag}
                  placeholder="+ Add tag"
                  className="w-24 bg-transparent text-theme-xs text-gray-600 outline-none placeholder:text-gray-400 dark:text-gray-300"
                />
              </div>
            </div>
          </Card>

          {lead.business && (
            <Card title="Opportunity">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-theme-sm text-gray-500">Website status</span>
                <WebsiteBadge status={lead.business.website_status} note={lead.business.website_check_note} />
              </div>
              <ScoreBreakdown score={lead.business.score} items={lead.business.score_breakdown} />
              <Link to={`/discover?business=${lead.business.id}`} className="mt-4 inline-block text-theme-sm text-brand-500">View discovery record →</Link>
            </Card>
          )}
        </div>
      </div>

      <LeadFormModal open={edit} onOpenChange={setEdit} lead={lead} />
      <ActivityFormModal open={!!activity} onOpenChange={(o) => !o && setActivity(null)} leadId={lead.id} leadName={lead.name} contacts={lead.contacts} defaultType={activity ?? "call"} />
      <FollowUpFormModal open={fuOpen.open} onOpenChange={(o) => setFuOpen({ open: o })} followUp={fuOpen.fu} leadId={lead.id} leadName={lead.name} />
      <TaskFormModal open={taskOpen.open} onOpenChange={(o) => setTaskOpen({ open: o })} task={taskOpen.task} leadId={lead.id} leadName={lead.name} />
      <ContactFormModal open={contactOpen} onOpenChange={setContactOpen} leadId={lead.id} leadName={lead.name} />
      <EventFormModal open={eventOpen} onOpenChange={setEventOpen} leadId={lead.id} leadName={lead.name} />
      {emailOpen && <ComposeEmail lead={lead} open={emailOpen} onOpenChange={setEmailOpen} />}
      <Confirm open={del} onOpenChange={setDel} title="Delete this lead?" description="All notes, activities, tasks and follow-ups for this lead will be permanently deleted." onConfirm={() => remove.mutate(undefined)} />
      <Modal open={lostOpen} onOpenChange={setLostOpen} title="Mark as lost" description="Recording why deals are lost helps improve your pipeline.">
        <form onSubmit={(e) => { e.preventDefault(); update.mutate({ status: "lost", lost_reason: lostReason || null }); setLostOpen(false); }} className="space-y-4">
          <Field label="Reason (optional)">
            <TextInput value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="e.g. Budget, chose competitor, no response" maxLength={255} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button type="submit" variant="destructive">Mark as lost</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
