import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";

/** Mutation with toast feedback + cache invalidation. */
export function useMutate<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: { success?: string; invalidate?: string[][]; onSuccess?: (r: TRes, v: TVars) => void; onFieldErrors?: (f: Record<string, string>) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(opts.success);
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.fields).length && opts.onFieldErrors) {
        opts.onFieldErrors(e.fields);
        return;
      }
      toast.error(errorMessage(e));
    },
  });
}
