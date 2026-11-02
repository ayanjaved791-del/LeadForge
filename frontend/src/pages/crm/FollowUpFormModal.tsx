import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { FollowUp } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextInput } from "@/components/shared/Form";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { Button } from "@/components/ui/button";

export function FollowUpFormModal({ open, onOpenChange, followUp, leadId, leadName }: { open: boolean; onOpenChange: (v: boolean) => void; followUp?: FollowUp | null; leadId?: string; leadName?: string }) {
  const [f, setF] = useState({ due_at: "", channel: "call", note: "", lead_id: null as string | null, lead_name: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(10, 0, 0, 0);
    setF({
      due_at: toLocalInput(followUp?.due_at ?? tomorrow.toISOString()),
      channel: followUp?.channel ?? "call",
      note: followUp?.note ?? "",
      lead_id: followUp?.lead_id ?? leadId ?? null,
      lead_name: followUp?.lead_name ?? leadName ?? null,
    });
  }, [open, followUp, leadId, leadName]);
  const save = useMutate((b: Record<string, unknown>) => (followUp ? api.patch(`/follow-ups/${followUp.id}`, b) : api.post("/follow-ups", b)), {
    success: followUp ? "Follow-up updated" : "Follow-up scheduled",
    invalidate: [["follow-ups"], ["lead"], ["calendar"], ["dashboard"], ["leads"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.lead_id) return setErrors({ lead_id: "Choose a lead." });
    save.mutate({ lead_id: f.lead_id, due_at: fromLocalInput(f.due_at), channel: f.channel, note: f.note || null });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={followUp ? "Edit follow-up" : "Schedule follow-up"}>
      <form onSubmit={submit} className="space-y-4">
        {!followUp && (
          <Field label="Lead *" error={errors.lead_id}>
            <LeadPicker value={f.lead_id} valueLabel={f.lead_name} onChange={(id, name) => setF({ ...f, lead_id: id, lead_name: name })} allowClear={false} />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When *" error={errors.due_at}>
            <TextInput type="datetime-local" value={f.due_at} onChange={(e) => setF({ ...f, due_at: e.target.value })} required />
          </Field>
          <Field label="Channel">
            <NativeSelect value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="other">Other</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Note">
          <TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} placeholder="What to discuss" />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
