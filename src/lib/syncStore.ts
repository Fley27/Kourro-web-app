import { create } from "zustand";
import { SyncManager } from "./sync";
import type { User } from "./users";

type SyncStatus = "idle" | "offline" | "syncing" | "synced" | "error";

export const useSyncStore = create<{
  status: SyncStatus;
  lastSync: string | null;
  lastError: string | null;
  syncNow: (user: User | null, token?: string | null) => Promise<void>;
}>((set, get) => {
  let manager: SyncManager | null = null;

  return {
    status: "idle",
    lastSync: null,
    lastError: null,
    syncNow: async (user, token) => {
      if (!user?.store_id) {
        set({ status: "offline" });
        return;
      }
      try {
        if (!manager) {
          manager = new SyncManager(user.store_id, "web-browser", s => set({ status: s === "error" ? "error" : s }));
          if (token) manager.setAccessToken(token);
        } else if (manager.storeId !== user.store_id) {
          manager = new SyncManager(user.store_id, "web-browser", s => set({ status: s === "error" ? "error" : s }));
          if (token) manager.setAccessToken(token);
        }
        set({ status: "syncing", lastError: null });
        await manager.fullSync();
        const last = manager.lastSyncedAt;
        set({ status: "synced", lastSync: last ?? new Date().toISOString() });
      } catch (e) {
        set({ status: "error", lastError: e instanceof Error ? e.message : String(e) });
        setTimeout(() => set(s => (s.status === "error" ? { status: "offline" } : {})), 8000);
      }
    },
  };
});