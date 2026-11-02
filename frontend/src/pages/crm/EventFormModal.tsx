import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import type { CalendarEvent } from "@/lib/types";
import { Modal } from "@/components/shared/Modal";
import { Field, NativeSelect, TextArea, TextInput } from "@/components/shared/Form";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { Button } from "@/components/ui/button";

export function EventFormModal({ open, onOpenChange, event, defaultDate, leadId, leadName }: { open: boolean; onOpenChange: (v: boolean) => void; event?: CalendarEvent | null; defaultDate?: Date | null; leadId?: string; leadName?: string }) {
  const [f, setF] = useState({ title: "", description: "", type: "meeting", location: "", starts_at: "", ends_at: "", lead_id: null as string | null, lead_name: null as string | null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setErrors({});
    const start = defaultDate ? new Date(defaultDate) : new Date();
    if (!event) start.setHours(defaultDate ? 10 : start.getHours() + 1, 0, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    setF({
      title: event?.title ?? "",
      description: event?.description ?? "",
      type: event?.type ?? "meeting",
      location: event?.location ?? "",
      starts_at: toLocalInput(event?.starts_at ?? start.toISOString()),
      ends_at: toLocalInput(event?.ends_at ?? end.toISOString()),
      lead_id: event?.lead_id ?? leadId ?? null,
      lead_name: event?.lead_name ?? leadName ?? null,
    });
  }, [open, event, defaultDate, leadId, leadName]);
  const save = useMutate((b: Record<string, unknown>) => (event ? api.patch(`/calendar/events/${event.id}`, b) : api.post("/calendar/events", b)), {
    success: event ? "Event updated" : "Event scheduled",
    invalidate: [["calendar"], ["lead"], ["activities"]],
    onFieldErrors: setErrors,
    onSuccess: () => onOpenChange(false),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({ title: f.title, description: f.description || null, type: f.type, location: f.location || null, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at), lead_id: f.lead_id });
  };
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={event ? "Edit event" : "Add event"}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title *" error={errors.title}>
          <TextInput value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts *" error={errors.starts_at}>
            <TextInput type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} required />
          </Field>
          <Field label="Ends *" error={errors.ends_at}>
            <TextInput type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} required />
          </Field>
          <Field label="Type">
            <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="meeting">Meeting</option>
              <option value="call">Call</option>
              <option value="demo">Demo</option>
              <option value="other">Other</option>
            </NativeSelect>
          </Field>
          <Field label="Location / link">
            <TextInput value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          </Field>
        </div>
        <Field label="Related lead">
          <LeadPicker value={f.lead_id} valueLabel={f.lead_name} onChange={(id, name) => setF({ ...f, lead_id: id, lead_name: name })} />
        </Field>
        <Field label="Description">
          <TextArea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save event</Button>
        </div>
      </form>
    </Modal>
  );
}
