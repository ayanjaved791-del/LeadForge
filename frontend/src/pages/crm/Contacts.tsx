import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Contact as ContactIcon, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ago, initials } from "@/lib/format";
import type { Contact, Paged } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/Badges";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Pagination } from "@/components/shared/Pagination";
import { Confirm } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { ContactFormModal } from "./ContactFormModal";

export default function Contacts() {
  const [q, setQ] = useState("");
  const [deb, setDeb] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; contact?: Contact | null }>({ open: false });
  const [del, setDel] = useState<Contact | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { setDeb(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["contacts", deb, page], queryFn: () => api.get<Paged<Contact>>("/contacts", { q: deb, page, limit: 25 }) });
  const remove = useMutate((id: string) => api.delete(`/contacts/${id}`), { success: "Contact deleted", invalidate: [["contacts"], ["lead"]] });

  return (
    <>
      <PageHeader title="Contacts" description="People you talk to at your leads and clients." actions={<Button onClick={() => setForm({ open: true })}><Plus /> Add contact</Button>} />
      <div className="lf-card overflow-hidden">
        <div className="px-5 pt-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or company…" className="lf-input h-10 pl-10" />
          </div>
        </div>
        <div className="mt-4">
          {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.items.length ? (
            <EmptyState icon={ContactIcon} title={deb ? "No contacts match your search" : "No contacts yet"} description="Add decision makers and staff you speak with at each business." action={<Button onClick={() => setForm({ open: true })}><Plus /> Add contact</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-y border-gray-100 text-left text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Company / lead</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Phone / WhatsApp</th>
                    <th className="px-4 py-3 font-medium">Last contacted</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {data.items.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                    return (
                      <tr key={c.id} className="text-theme-sm">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-500 dark:bg-brand-500/15">{initials(name)}</span>
                            <div>
                              <p className="font-medium text-gray-800 dark:text-white/90">{name}</p>
                              {c.job_title && <p className="text-theme-xs text-gray-500">{c.job_title}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.lead_id ? (
                            <span className="flex items-center gap-2">
                              <Link to={`/leads/${c.lead_id}`} className="text-gray-700 hover:text-brand-500 dark:text-gray-300">{c.lead_name}</Link>
                              {c.lead_status && <StatusBadge status={c.lead_status} />}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">{c.email ? <a href={`mailto:${c.email}`} className="text-gray-600 hover:text-brand-500 dark:text-gray-400">{c.email}</a> : <span className="text-gray-400">—</span>}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                          {c.phone ?? "—"}
                          {c.whatsapp && <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="block text-theme-xs text-success-600">WhatsApp {c.whatsapp}</a>}
                        </td>
                        <td className="px-4 py-3 text-theme-xs text-gray-500">{c.last_contacted_at ? ago(c.last_contacted_at) : "Never"}</td>
                        <td className="px-5 py-3 text-right">
                          <Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, contact: c })} aria-label="Edit"><Pencil /></Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => setDel(c)} aria-label="Delete"><Trash2 /></Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {data && <Pagination page={page} total={data.total} limit={25} onPage={setPage} />}
      </div>
      <ContactFormModal open={form.open} onOpenChange={(o) => setForm({ open: o })} contact={form.contact} />
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete contact?" description={`${del?.first_name ?? ""} will be removed. Logged activities stay on the lead.`} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  );
}
