import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { dt } from "@/lib/format";
import type { Holiday } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect, Field, TextInput } from "@/components/shared/Form";
import { EmptyState, Loading } from "@/components/shared/States";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";

export default function Holidays() {
  const y = new Date().getFullYear();
  const [year, setYear] = useState(String(y));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", date: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({ queryKey: ["holidays", year], queryFn: () => api.get<Holiday[]>("/holidays", { year }) });
  const inv = [["holidays"], ["attendance"], ["calendar"], ["leave"], ["dashboard"]];
  const add = useMutate((b: typeof f) => api.post("/holidays", b), { success: "Holiday added", invalidate: inv, onFieldErrors: setErrors, onSuccess: () => { setOpen(false); setF({ name: "", date: "" }); } });
  const remove = useMutate((id: string) => api.delete(`/holidays/${id}`), { success: "Holiday removed", invalidate: inv });
  const today = new Date().toISOString().slice(0, 10);
  const submit = (e: FormEvent) => { e.preventDefault(); setErrors({}); add.mutate(f); };
  return (
    <>
      <PageHeader title="Holidays" description="Company holidays are skipped when counting leave days, attendance and payroll working days." actions={<><ChipSelect value={year} onChange={setYear} options={[y + 1, y, y - 1].map((v) => ({ value: String(v), label: String(v) }))} /><Button onClick={() => setOpen(true)}><Plus /> Add holiday</Button></>} />
      <div className="lf-card overflow-hidden">
        {isLoading ? <Loading /> : !data?.length ? (
          <EmptyState icon={Sparkles} title={`No holidays for ${year}`} description="Add public and company holidays so they aren't counted as working days." action={<Button onClick={() => setOpen(true)}><Plus /> Add holiday</Button>} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data.map((h) => (
              <li key={h.id} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <div className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-xl ${h.date >= today ? "bg-brand-50 text-brand-600 dark:bg-white/[0.08] dark:text-white" : "bg-gray-100 text-gray-500 dark:bg-white/5"}`}>
                  <span className="text-[10px] font-semibold uppercase">{dt(h.date + "T00:00:00", "MMM")}</span>
                  <span className="text-lg font-bold leading-none">{Number(h.date.slice(8))}</span>
                </div>
                <div className="flex-1"><p className="font-medium text-gray-800 dark:text-white/90">{h.name}</p><p className="text-theme-xs text-gray-500">{dt(h.date + "T00:00:00", "EEEE")}{h.date < today ? " · past" : ""}</p></div>
                <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(h.id)} aria-label="Delete"><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Add holiday">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name *" error={errors.name}><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Independence Day" /></Field>
          <Field label="Date *" error={errors.date}><TextInput type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={add.isPending}>Add</Button></div>
        </form>
      </Modal>
    </>
  );
}
