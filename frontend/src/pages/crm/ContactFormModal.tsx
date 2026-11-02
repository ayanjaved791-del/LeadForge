import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import type { Contact } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, TextArea, TextInput } from "@/components/shared/Form";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { Button } from "@/components/ui/button";

export function ContactFormModal({ open, onOpenChange, contact, leadId, leadName }: { open: boolean; onOpenChange: (v: boolean) => void; contact?: Contact | null; leadId?: string; leadName?: string }) {
  const [f, setF] = useState({ first_name: "", last_name: "", job_title: "", email: "", phone: "", whatsapp: "", notes: "", lead_id: null as string | null, lead_name: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      first_name: contact?.first_name ?? "",
      last_name: contact?.last_name ?? "",
      job_title: contact?.job_title ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      whatsapp: contact?.whatsapp ?? "",
      notes: contact?.notes ?? "",
      lead_id: contact?.lead_id ?? leadId ?? null,
      lead_name: contact?.lead_name ?? leadName ?? null,
    });
  }, [open, contact, leadId, leadName]);
  const save = useMutate((b: Record<string, unknown>) => (contact ? api.patch(`/contacts/${contact.id}`, b) : api.post("/contacts", b)), {
    success: contact ? "Contact updated" : "Contact added",
    invalidate: [["contacts"], ["lead"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const { lead_name: _n, ...rest } = f;
    save.mutate(Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === "" ? null : v])));
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={contact ? "Edit contact" : "Add contact"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name *" error={errors.first_name}>
            <TextInput value={f.first_name} onChange={set("first_name")} required />
          </Field>
          <Field label="Last name">
            <TextInput value={f.last_name} onChange={set("last_name")} />
          </Field>
          <Field label="Job title">
            <TextInput value={f.job_title} onChange={set("job_title")} />
          </Field>
          <Field label="Email" error={errors.email}>
            <TextInput type="email" value={f.email} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <TextInput value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="WhatsApp">
            <TextInput value={f.whatsapp} onChange={set("whatsapp")} placeholder="+92…" />
          </Field>
        </div>
        {!leadId && (
          <Field label="Company / lead">
            <LeadPicker value={f.lead_id} valueLabel={f.lead_name} onChange={(id, name) => setF({ ...f, lead_id: id, lead_name: name })} />
          </Field>
        )}
        <Field label="Notes">
          <TextArea value={f.notes} onChange={set("notes")} rows={3} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save contact</Button>
        </div>
      </form>
    </Modal>
  );
}
