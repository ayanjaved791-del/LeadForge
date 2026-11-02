import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { LEAD_STATUSES, PRIORITIES } from "@/lib/constants";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { Lead, LeadDetail } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { Button } from "@/components/ui/button";

const empty = { name: "", category: "", phone: "", email: "", website: "", address: "", status: "new", priority: "medium", deal_value: "", tags: "", follow_up_at: "", note: "" };

export function LeadFormModal({ open, onOpenChange, lead }: { open: boolean; onOpenChange: (v: boolean) => void; lead?: Lead | null }) {
  const nav = useNavigate();
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(
      lead
        ? { ...empty, name: lead.name, category: lead.category ?? "", phone: lead.phone ?? "", email: lead.email ?? "", website: lead.website ?? "", address: lead.address ?? "", status: lead.status, priority: lead.priority, deal_value: String(lead.deal_value || ""), tags: lead.tags.join(", "), follow_up_at: toLocalInput(null) }
        : empty,
    );
  }, [open, lead]);

  const save = useMutate(
    (body: Record<string, unknown>) => (lead ? api.patch<LeadDetail>(`/leads/${lead.id}`, body) : api.post<LeadDetail>("/leads", body)),
    {
      success: lead ? "Lead updated" : "Lead created",
      invalidate: [["leads"], ["lead"], ["dashboard"], ["pipeline"]],
      onFieldErrors: setErrors,
      onSuccess: (r) => {
        onOpenChange(false);
        if (!lead) nav(`/leads/${r.id}`);
      },
    },
  );

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: f.name,
      category: f.category || null,
      phone: f.phone || null,
      email: f.email || null,
      website: f.website ? (/^https?:\/\//i.test(f.website) ? f.website : `https://${f.website}`) : null,
      address: f.address || null,
      status: f.status,
      priority: f.priority,
      deal_value: Number(f.deal_value || 0),
      tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (!lead) {
      if (f.follow_up_at) body.follow_up_at = fromLocalInput(f.follow_up_at);
      if (f.note) body.note = f.note;
    }
    save.mutate(body);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={lead ? "Edit lead" : "Add lead"} description={lead ? undefined : "Add a lead manually. Leads from discovery are created with one click from the search results."} className="sm:max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business / lead name *" error={errors.name} className="sm:col-span-2">
            <TextInput value={f.name} onChange={set("name")} required />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <TextInput value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Website" error={errors.website}>
            <TextInput value={f.website} onChange={set("website")} placeholder="example.com" />
          </Field>
          <Field label="Category" error={errors.category}>
            <TextInput value={f.category} onChange={set("category")} placeholder="e.g. restaurant" />
          </Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2">
            <TextInput value={f.address} onChange={set("address")} />
          </Field>
          <Field label="Status">
            <NativeSelect value={f.status} onChange={set("status")}>
              {LEAD_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priority">
            <NativeSelect value={f.priority} onChange={set("priority")}>
              {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Deal value" error={errors.deal_value}>
            <TextInput type="number" min={0} step="0.01" value={f.deal_value} onChange={set("deal_value")} placeholder="0.00" />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <TextInput value={f.tags} onChange={set("tags")} placeholder="web design, priority" />
          </Field>
          {!lead && (
            <>
              <Field label="First follow-up" className="sm:col-span-2">
                <TextInput type="datetime-local" value={f.follow_up_at} onChange={set("follow_up_at")} />
              </Field>
              <Field label="Note" className="sm:col-span-2">
                <TextArea value={f.note} onChange={set("note")} rows={3} />
              </Field>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{lead ? "Save changes" : "Create lead"}</Button>
        </div>
      </form>
    </Modal>
  );
}
