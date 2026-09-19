// Auth store (web) — same API as mobile, SecureStore → localStorage.
import { create } from "zustand";
import { supabase, isLiveSupabase } from "./supabase";
import { USERS, type Role, type User } from "./users";

export type AuthStatus = "loading" | "signedout" | "signedin";

export type CachedProfile = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  pin: string | null;
  store: string;
};

const PROFILE_KEY = "jm_profile_cache";

export function mapProfileToUser(p: CachedProfile): User {
  return {
    id: p.userId,
    name: p.name,
    role: p.role,
    secret: p.pin ?? "",
    store: p.store || "Petyonvil",
    store_id: "demo-store-id",
  };
}

export const DEMO_CREDENTIALS: CachedProfile[] = USERS.map(u => ({
  userId: u.id,
  email: `${u.role}@demo.magazen.ht`,
  name: u.name,
  role: u.role,
  pin: u.secret,
  store: u.store ?? "Petyonvil",
}));

export const demoProfile: CachedProfile = DEMO_CREDENTIALS.find(c => c.role === "cashier") ?? DEMO_CREDENTIALS[0];
export const demoUser: User = mapProfileToUser(demoProfile);

export async function cacheProfile(p: CachedProfile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
}
export async function readCachedProfile(): Promise<CachedProfile | null> {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as CachedProfile) : null;
  } catch { return null; }
}
async function clearCachedProfile() {
  try { localStorage.removeItem(PROFILE_KEY); } catch {}
}

async function hydrateFromSession(userId: string, cache: CachedProfile | null) {
  const { data: profile } = await supabase.from("profiles")
    .select("id,email,full_name,role,pin_code,organization_id")
    .eq("id", userId).maybeSingle();
  if (profile) {
    const orgId = (profile as any).organization_id;
    let storeName = cache?.store ?? "Petyonvil";
    if (orgId) {
      const { data: stores } = await supabase.from("stores")
        .select("name").eq("organization_id", orgId).limit(3);
      if (stores?.length) storeName = (stores[0] as any).name;
    }
    const cp: CachedProfile = {
      userId, email: (profile as any).email ?? "",
      name: (profile as any).full_name ?? "Itilizatè",
      role: (profile as any).role ?? "cashier",
      pin: (profile as any).pin_code ?? cache?.pin ?? null,
      store: storeName,
    };
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token ?? null;
    await cacheProfile(cp);
    useAuthStore.setState({ cached: cp, profile: cp, user: mapProfileToUser(cp), status: "signedin", accessToken: token, error: null });
  } else {
    useAuthStore.setState({ status: "signedout" });
  }
}

type AuthState = {
  status: AuthStatus;
  user: User | null;
  cached: CachedProfile | null;
  profile: CachedProfile | null;
  accessToken: string | null;
  error: string | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string, storeName: string) => Promise<{ ok: boolean; error?: string }>;
  unlockWithPin: (pin: string) => { ok: boolean; error?: string };
  demoSignIn: (userId?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  cached: null,
  profile: null,
  accessToken: null,
  error: null,

  signIn: async (email, password) => {
    set({ error: null });
    if (!isLiveSupabase) {
      const key = email.trim().toLowerCase();
      const cred = DEMO_CREDENTIALS.find(c => c.email.toLowerCase() === key)
        ?? DEMO_CREDENTIALS.find(c => key.startsWith(`${c.role}@demo.magazen.ht`))
        ?? demoProfile;
      await cacheProfile(cred);
      set({ cached: cred, profile: cred, user: mapProfileToUser(cred), status: "signedin", accessToken: null, error: null });
      return { ok: true };
    }
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) { set({ error: e.message }); return { ok: false, error: e.message }; }
    const uid = data.user?.id;
    if (!uid) { const m = "Imel la pa verifye."; set({ error: m }); return { ok: false, error: m }; }
    await hydrateFromSession(uid, null);
    return { ok: true };
  },

  signUp: async (email, password, name, storeName) => {
    set({ error: null });
    if (!isLiveSupabase) {
      const cred: CachedProfile = {
        userId: `owner-${Date.now()}`,
        email: email.trim().toLowerCase(),
        name: name.trim() || "Nouvo Pwopriyetè",
        role: "owner",
        pin: "1",
        store: storeName.trim() || "Petyonvil",
      };
      await cacheProfile(cred);
      set({ cached: cred, profile: cred, user: mapProfileToUser(cred), status: "signedin", accessToken: null, error: null });
      return { ok: true };
    }
    const { data, error: e } = await supabase.auth.signUp({ email, password });
    if (e) { set({ error: e.message }); return { ok: false, error: e.message }; }
    const uid = data.user?.id;
    if (!uid) { const m = "Kont pa kreye — verifye imel ou."; set({ error: m }); return { ok: false, error: m }; }
    try {
      await supabase.from("profiles").insert({
        id: uid, email, full_name: name, role: "owner", language: "ht", organization_id: null,
      });
      const { data: org, error: orgErr } = await supabase.from("organizations")
        .insert({ owner_id: uid, name: storeName, currency: "HTG" }).select().single();
      if (orgErr) throw orgErr;
      await supabase.from("profiles").update({ organization_id: org.id }).eq("id", uid);
      const { data: loc, error: locErr } = await supabase.from("stores").insert({
        name: storeName, owner_id: uid, organization_id: org.id, is_active: true,
      }).select().single();
      if (locErr) throw locErr;
      await supabase.from("store_members").insert({ store_id: loc.id, organization_id: org.id, user_id: uid, role: "owner" });
      await supabase.from("subscriptions").insert({
        organization_id: org.id, plan_code: "basic", status: "trial",
        trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      });
    } catch (err) {
      const m = `Eskè, nou pa t kapab kreye magazen ou: ${(err as any)?.message ?? err}`;
      set({ error: m });
      return { ok: false, error: m };
    }
    await hydrateFromSession(uid, null);
    return { ok: true };
  },

  unlockWithPin: (pin) => {
    const { cached } = useAuthStore.getState();
    if (!cached) return { ok: false, error: "Pa gen sesyon anrejistre." };
    if (cached.pin && cached.pin !== pin) return { ok: false, error: "PIN pa kòrèk." };
    set({ user: mapProfileToUser(cached), status: "signedin" });
    return { ok: true };
  },

  demoSignIn: async (userId?: string) => {
    const cred = DEMO_CREDENTIALS.find(c => c.userId === userId) ?? demoProfile;
    await cacheProfile(cred);
    set({ cached: cred, profile: cred, user: mapProfileToUser(cred), status: "signedin", accessToken: null, error: null });
  },

  signOut: async () => {
    await Promise.all([supabase.auth.signOut().catch(() => {}), clearCachedProfile()]);
    set({ user: null, cached: null, profile: null, accessToken: null, status: "signedout", error: null });
  },

  restore: async () => {
    if (!isLiveSupabase) {
      useAuthStore.setState({ status: "signedout", error: null, accessToken: null });
      return;
    }
    const cache = await readCachedProfile();
    if (cache) useAuthStore.setState({ cached: cache, profile: cache });
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await hydrateFromSession(session.user.id, cache);
    } else {
      useAuthStore.setState({ status: "signedout", accessToken: null });
    }
  },
}));

export function useAuthState(): AuthState {
  return useAuthStore();
}