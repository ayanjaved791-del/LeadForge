import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useMutate } from "@/hooks/use-mutate";
import { GOAL_STATUS } from "@/lib/constants";
import { ago, dt } from "@/lib/format";
import type { Goal, Review } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ChipSelect } from "@/components/shared/Form";
import { Pill, Stars, StatusPill } from "@/components/shared/Badges";
import { Avatar } from "@/components/shared/EmployeePicker";
import { EmptyState, Loading } from "@/components/shared/States";
import { Confirm } from "@/components/shared/Modal";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoalFormModal, ReviewFormModal } from "./PerformanceForms";

export default function Performance() {
  const [tab, setTab] = useState("reviews");
  const [rStatus, setRStatus] = useState("");
  const [gStatus, setGStatus] = useState("");
  const [review, setReview] = useState<{ open: boolean; r?: Review | null }>({ open: false });
  const [goal, setGoal] = useState<{ open: boolean; g?: Goal | null }>({ open: false });
  const [delR, setDelR] = useState<Review | null>(null);
  const [delG, setDelG] = useState<Goal | null>(null);
  const reviews = useQuery({ queryKey: ["reviews", rStatus], queryFn: () => api.get<Review[]>("/reviews", { status: rStatus }) });
  const goals = useQuery({ queryKey: ["goals", gStatus], queryFn: () => api.get<Goal[]>("/goals", { status: gStatus }) });
  const inv = [["reviews"], ["goals"], ["employee"]];
  const removeR = useMutate((id: string) => api.delete(`/reviews/${id}`), { success: "Review deleted", invalidate: inv });
  const removeG = useMutate((id: string) => api.delete(`/goals/${id}`), { success: "Goal deleted", invalidate: inv });
  return (
    <>
      <PageHeader title="Performance" actions={tab === "reviews" ? <Button onClick={() => setReview({ open: true })}><Plus /> New review</Button> : <Button onClick={() => setGoal({ open: true })}><Plus /> Add goal</Button>} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5 h-auto gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          {[["reviews", "Reviews"], ["goals", "Goals"]].map(([v, l]) => <TabsTrigger key={v} value={v} className="rounded-md px-3 py-1.5 text-theme-sm data-[state=active]:bg-white data-[state=active]:shadow-theme-xs dark:data-[state=active]:bg-gray-800">{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="reviews">
          <div className="lf-card overflow-hidden">
            <div className="px-5 pt-5"><ChipSelect value={rStatus} onChange={setRStatus} options={[{ value: "", label: "All reviews" }, { value: "draft", label: "Drafts" }, { value: "completed", label: "Completed" }]} /></div>
            <div className="mt-4">
              {reviews.isLoading ? <Loading /> : !reviews.data?.length ? <EmptyState icon={Target} title="No reviews yet" description="Rate employees on job knowledge, quality, productivity, communication, teamwork and initiative." action={<Button onClick={() => setReview({ open: true })}><Plus /> New review</Button>} /> : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {reviews.data.map((r) => (
                    <li key={r.id} className="group flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                      <Avatar name={r.employee_name ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-theme-sm"><Link to={`/employees/${r.employee_id}`} className="font-medium text-gray-800 hover:text-brand-500 dark:text-white/90">{r.employee_name}</Link><span className="text-gray-500"> · {r.period}</span></p>
                        <p className="text-theme-xs text-gray-500">{r.reviewer ? `Reviewed by ${r.reviewer} · ` : ""}{r.status === "completed" ? `completed ${ago(r.completed_at)}` : `draft created ${ago(r.created_at)}`}</p>
                      </div>
                      <span className="flex items-center gap-2"><Stars value={Math.round(r.overall)} size="size-4" /><span className="w-8 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{r.overall || "—"}</span></span>
                      <Pill className={r.status === "completed" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400"}>{r.status === "completed" ? "Completed" : "Draft"}</Pill>
                      <div className="flex"><Button size="icon-sm" variant="ghost" onClick={() => setReview({ open: true, r })} aria-label="Edit"><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => setDelR(r)} aria-label="Delete"><Trash2 /></Button></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="goals">
          <div className="mb-4"><ChipSelect value={gStatus} onChange={setGStatus} options={[{ value: "", label: "All goals" }, { value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }]} /></div>
          {goals.isLoading ? <Loading /> : !goals.data?.length ? <div className="lf-card"><EmptyState icon={Target} title="No goals yet" description="Set measurable goals for your team and track their progress." action={<Button onClick={() => setGoal({ open: true })}><Plus /> Add goal</Button>} /></div> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {goals.data.map((g) => {
                const overdue = g.status !== "completed" && g.due_date && g.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <div key={g.id} className="lf-card group p-5">
                    <div className="flex items-start justify-between gap-3">
                      <StatusPill map={GOAL_STATUS} value={g.status} />
                      <div className="flex opacity-0 transition group-hover:opacity-100"><Button size="icon-sm" variant="ghost" onClick={() => setGoal({ open: true, g })} aria-label="Edit"><Pencil /></Button><Button size="icon-sm" variant="ghost" onClick={() => setDelG(g)} aria-label="Delete"><Trash2 /></Button></div>
                    </div>
                    <p className="mt-3 font-semibold text-gray-800 dark:text-white/90">{g.title}</p>
                    {g.description && <p className="mt-1 line-clamp-2 text-theme-sm text-gray-500">{g.description}</p>}
                    <div className="mt-4 flex items-center gap-3"><Progress value={g.progress} className="h-2 flex-1 bg-gray-100 dark:bg-white/5 [&>div]:bg-brand-500" /><span className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{g.progress}%</span></div>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-theme-xs dark:border-gray-800">
                      <Link to={`/employees/${g.employee_id}`} className="flex items-center gap-2 text-gray-600 hover:text-brand-500 dark:text-gray-400"><Avatar name={g.employee_name ?? "?"} className="size-6 text-[10px]" />{g.employee_name}</Link>
                      <span className={overdue ? "font-medium text-error-500" : "text-gray-400"}>{g.due_date ? `Due ${dt(g.due_date + "T00:00:00")}` : "No due date"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <ReviewFormModal open={review.open} onOpenChange={(o) => setReview({ open: o })} review={review.r} />
      <GoalFormModal open={goal.open} onOpenChange={(o) => setGoal({ open: o })} goal={goal.g} />
      <Confirm open={!!delR} onOpenChange={(o) => !o && setDelR(null)} title="Delete this review?" description="This performance review will be permanently removed." onConfirm={() => delR && removeR.mutate(delR.id)} />
      <Confirm open={!!delG} onOpenChange={(o) => !o && setDelG(null)} title="Delete this goal?" description="This goal will be permanently removed." onConfirm={() => delG && removeG.mutate(delG.id)} />
    </>
  );
}
