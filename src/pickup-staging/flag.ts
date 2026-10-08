// PICKUP: device-local toggle, open to every seller role.
// Delete this folder + gated lines marked STAGING-PICKUP to fully remove.
// Flag lives in _meta (never synced); missing key = enabled for everyone.
import { useEffect, useState } from "react";
import { getDb } from "../lib/db";

export const pickupFlagKey = (storeId: string) => `pickup_staging_${storeId || "demo-store-id"}`;

export async function getPickupEnabled(storeId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = (await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", [pickupFlagKey(storeId)])) as any[];
    if (!rows?.length) return true; // no key yet -> enabled for everyone
    return String(rows[0]?.value ?? "1") !== "0";
  } catch {
    return true;
  }
}

export async function setPickupEnabled(storeId: string, enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", [
    pickupFlagKey(storeId),
    enabled ? "1" : "0",
  ]);
}

export function isPickupManager(role?: string | null): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export function usePickupEnabled(storeId: string): boolean {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let alive = true;
    getPickupEnabled(storeId).then(v => { if (alive) setEnabled(v); }).catch(() => {});
    const id = window.setInterval(() => {
      getPickupEnabled(storeId).then(v => { if (alive) setEnabled(v); }).catch(() => {});
    }, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, [storeId]);
  return enabled;
}
