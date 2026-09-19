import React, { useEffect } from "react";
import { palette } from "../lib/theme";
import { Icon } from "./Icon";
import { useSyncStore } from "../lib/syncStore";
import { useAuthStore } from "../lib/authStore";

export function SyncBadge({ compact }: { compact?: boolean }) {
  const { status, lastSync, lastError } = useSyncStore();
  const { user, accessToken } = useAuthStore();
  const run = useSyncStore(s => s.syncNow);

  useEffect(() => {
    // periodic auto-sync while a store is active
    if (!user || !user.store_id) return;
    run(user, accessToken);
    const iv = setInterval(() => run(user, accessToken), 60_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.store_id, accessToken]);

  const meta: { label: string; color: string; icon: string } =
    status === "offline" ? { label: "Offline", color: palette.dangerDot, icon: "wifi" }
    : status === "syncing" ? { label: "Synchronisation...", color: palette.blue, icon: "sync" }
    : status === "error" ? { label: "Erè synchro", color: palette.warning, icon: "warning" }
    : { label: lastSync ? `Synchronized ${new Date(lastSync).toLocaleTimeString()}` : "Synchronized", color: palette.success, icon: "checkmark-circle" };

  if (compact) return <Icon name={meta.icon} size={16} color={meta.color} title={meta.label} />;

  return (
    <button
      onClick={() => user && run(user, accessToken)}
      title={lastError ?? meta.label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`,
        borderRadius: 999, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: palette.inkSoft,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      <Icon name={meta.icon} size={14} color={meta.color} />
      {meta.label}
    </button>
  );
}