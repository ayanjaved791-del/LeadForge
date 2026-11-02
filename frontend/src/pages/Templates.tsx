import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { ago } from "@/lib/format";
import type { EmailTemplate } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Loading } from "@/components/shared/States";
import { Confirm, Modal } from "@/components/shared/Modal";
import { Field, TextArea, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

const VARS = ["business_name", "city", "category", "website", "phone", "my_name"];

function TemplateForm({ open, onOpenChange, template }: { open: boolean; onOpenChange: (v: boolean) => void; template?: EmailTemplate | null }) {
  const [f, setF] = useState({ name: "", subject: "", body: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setF({ name: template?.name ?? "", subject: template?.subject ?? "", body: template?.body ?? "" });
    }
  }, [open, template]);
  const save = useMutate((b: typeof f) => (template ? api.patch(`/email-templates/${template.id}`, b) : api.post("/email-templates", b)), {
    success: "Template saved",
    invalidate: [["templates"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(f);
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={template ? "Edit template" : "New email template"} className="sm:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Template name *" error={errors.name}>
          <TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} placeholder="e.g. First outreach — no website" />
        </Field>
        <Field label="Subject *" error={errors.subject}>
          <TextInput value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required maxLength={255} />
        </Field>
        <Field label="Body *" error={errors.body}>
          <TextArea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required rows={10} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-theme-xs text-gray-500">Insert:</span>
          {VARS.map((v) => (
            <button type="button" key={v} onClick={() => setF({ ...f, body: `${f.body}{{${v}}}` })} className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600 hover:bg-brand-50 hover:text-brand-500 dark:bg-white/5 dark:text-gray-400">{`{{${v}}}`}</button>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save template</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Templates() {
  const [form, setForm] = useState<{ open: boolean; t?: EmailTemplate | null }>({ open: false });
  const [del, setDel] = useState<EmailTemplate | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["templates"], queryFn: () => api.get<EmailTemplate[]>("/email-templates") });
  const remove = useMutate((id: string) => api.delete(`/email-templates/${id}`), { success: "Template deleted", invalidate: [["templates"]] });
  return (
    <>
      <PageHeader title="Email Templates" description="Reusable outreach emails. Use them from any lead with “Compose email”." actions={<Button onClick={() => setForm({ open: true })}><Plus /> New template</Button>} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : !data?.length ? (
        <div className="lf-card"><EmptyState icon={Mail} title="No templates yet" description="Write your outreach emails once and personalise them automatically with variables like {{business_name}}." action={<Button onClick={() => setForm({ open: true })}><Plus /> New template</Button>} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 md:gap-6">
          {data.map((t) => (
            <div key={t.id} className="lf-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-800 dark:text-white/90">{t.name}</h3>
                  <p className="truncate text-theme-sm text-gray-500">{t.subject}</p>
                </div>
                <div className="flex shrink-0">
                  <Button size="icon-sm" variant="ghost" onClick={() => setForm({ open: true, t })} aria-label="Edit"><Pencil /></Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setDel(t)} aria-label="Delete"><Trash2 /></Button>
                </div>
              </div>
              <p className="mt-3 line-clamp-5 flex-1 whitespace-pre-wrap text-theme-sm text-gray-600 dark:text-gray-400">{t.body}</p>
              <p className="mt-4 text-theme-xs text-gray-400">Updated {ago(t.updated_at)}</p>
            </div>
          ))}
        </div>
      )}
      <TemplateForm open={form.open} onOpenChange={(o) => setForm({ open: o })} template={form.t} />
      <Confirm open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Delete template?" description={`“${del?.name}” will be permanently deleted.`} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  );
}
