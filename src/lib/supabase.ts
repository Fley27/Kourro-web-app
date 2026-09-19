// Web Supabase client with localStorage-backed session persistence.
import { createClient } from "@supabase/supabase-js";

export const supabaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL ?? "http://localhost:54321";
export const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "anon-key";
export const middlewareUrl =
  (import.meta as any).env?.VITE_MIDDLEWARE_URL ?? "http://localhost:4000";

export const isLiveSupabase = !supabaseUrl.includes("localhost") && supabaseAnonKey !== "anon-key";

const SB_SESSION_KEY = "jm_supabase_session";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: {
      getItem: (k) => {
        return Promise.resolve(localStorage.getItem(k));
      },
      setItem: (k, v) => {
        try { localStorage.setItem(k, v); } catch {}
        return Promise.resolve();
      },
      removeItem: (k) => {
        try { localStorage.removeItem(k); } catch {}
        return Promise.resolve();
      },
    },
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
if (typeof window !== "undefined" && !isLiveSupabase) {
  try { localStorage.removeItem(SB_SESSION_KEY); } catch {}
}