import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { Button } from "@/components/ui/button";

type Kind = "call" | "email" | "meeting" | "whatsapp" | "note";
const LABEL: Record<Kind, string> = { call: "Log call", email: "Log email", meeting: "Log meeting", whatsapp: "Log WhatsApp message", note: "Log note" };

export function ActivityFormModal({ open, onOpenChange, leadId, leadName, contacts = [], defaultType = "call" }: { open: boolean; onOpenChange: (v: boolean) => void; leadId?: string; leadName?: string; contacts?: Contact[]; defaultType?: Kind }) {
  const [f, setF] = useState({ type: defaultType as Kind, direction: "outbound", subject: "", body: "", outcome: "", duration_minutes: "", occurred_at: "", contact_id: "", lead_id: null as string | null, lead_name: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setErrors({});
      setF({ type: defaultType, direction: "outbound", subject: "", body: "", outcome: "", duration_minutes: "", occurred_at: toLocalInput(new Date().toISOString()), contact_id: "", lead_id: leadId ?? null, lead_name: leadName ?? null });
    }
  }, [open, defaultType, leadId, leadName]);
  const save = useMutate((b: Record<string, unknown>) => api.post("/activities", b), {
    success: "Activity logged",
    invalidate: [["lead"], ["activities"], ["dashboard"], ["leads"], ["pipeline"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.lead_id) return setErrors({ lead_id: "Choose a lead." });
    save.mutate({
      lead_id: f.lead_id,
      type: f.type,
      direction: f.type === "note" ? null : f.direction,
      subject: f.subject || null,
      body: f.body || null,
      outcome: f.outcome || null,
      duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null,
      occurred_at: fromLocalInput(f.occurred_at),
      contact_id: f.contact_id || null,
    });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={LABEL[f.type]}>
      <form onSubmit={submit} className="space-y-4">
        {!leadId && (
          <Field label="Lead *" error={errors.lead_id}>
            <LeadPicker value={f.lead_id} valueLabel={f.lead_name} onChange={(id, name) => setF({ ...f, lead_id: id, lead_name: name })} allowClear={false} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Kind })}>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="note">Note</option>
            </NativeSelect>
          </Field>
          {f.type !== "note" && (
            <Field label="Direction">
              <NativeSelect value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </NativeSelect>
            </Field>
          )}
          <Field label="When">
            <TextInput type="datetime-local" value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} />
          </Field>
          {(f.type === "call" || f.type === "meeting") && (
            <Field label="Duration (minutes)" error={errors.duration_minutes}>
              <TextInput type="number" min={0} max={1440} value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} />
            </Field>
          )}
          {contacts.length > 0 && (
            <Field label="Contact">
              <NativeSelect value={f.contact_id} onChange={(e) => setF({ ...f, contact_id: e.target.value })}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{[c.first_name, c.last_name].filter(Boolean).join(" ")}</option>)}
              </NativeSelect>
            </Field>
          )}
          {f.type !== "note" && (
            <Field label="Outcome">
              <TextInput value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} placeholder="e.g. Interested, call back" maxLength={120} />
            </Field>
          )}
        </div>
        <Field label="Subject">
          <TextInput value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} maxLength={255} />
        </Field>
        <Field label="Details">
          <TextArea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save activity</Button>
        </div>
      </form>
    </Modal>
  );
}
