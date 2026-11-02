import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function Modal({ open, onOpenChange, title, description, children, className }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto rounded-3xl border-gray-200 p-6 sm:max-w-lg sm:p-8 dark:border-gray-800 dark:bg-gray-900", className)}>
        <DialogHeader className="mb-2">
          <DialogTitle className="text-xl font-semibold text-gray-800 dark:text-white/90">{title}</DialogTitle>
          {description && <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function Confirm({ open, onOpenChange, title, description, confirmLabel = "Delete", onConfirm }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description: string; confirmLabel?: string; onConfirm: () => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl dark:border-gray-800 dark:bg-gray-900">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-gray-800 dark:text-white/90">{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
          <AlertDialogAction className="rounded-lg bg-error-500 text-white hover:bg-error-600" onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
