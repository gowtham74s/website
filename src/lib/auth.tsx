"use client";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { clearLocalData, setCurrentUser } from "./data";

const Ctx = createContext<{ session: Session | null; loading: boolean }>({ session: null, loading: true });
export const useSession = () => useContext(Ctx);

const LAST_USER = "forge-last-user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const apply = (s: Session | null) => {
      const id = s?.user.id ?? null;
      try {
        const last = localStorage.getItem(LAST_USER);
        if (id && last && last !== id) clearLocalData(); // never show one user's cached data to another
        if (id) localStorage.setItem(LAST_USER, id);
      } catch { /* storage blocked */ }
      setCurrentUser(id);
      setSession(s);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => apply(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{ session, loading }}>{children}</Ctx.Provider>;
}

export async function signOut() {
  await supabase.auth.signOut();
  clearLocalData();
  try { localStorage.removeItem(LAST_USER); } catch { /* ignore */ }
}
