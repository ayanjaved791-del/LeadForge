import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, setCsrf } from "@/lib/api";
import { setCurrency } from "@/lib/format";
import type { Me } from "@/lib/types";

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const me = await api.get<Me>("/auth/me");
        setCsrf(me.csrf);
        setCurrency(me.user.currency);
        return me;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    const onUnauth = () => qc.setQueryData(["me"], null);
    window.addEventListener("lf:unauthorized", onUnauth);
    return () => window.removeEventListener("lf:unauthorized", onUnauth);
  }, [qc]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    qc.clear();
    qc.setQueryData(["me"], null);
  }, [qc]);

  return <Ctx.Provider value={{ me: q.data ?? null, loading: q.isLoading, refresh: q.refetch, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}

/** For pages inside the authenticated layout. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("Not authenticated");
  return me;
}
