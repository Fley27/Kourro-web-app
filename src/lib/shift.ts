// Shift opening / cash-gate logic — port of the cashier shift flow in App.tsx.
import { useCallback, useEffect, useState } from "react";
import { getDb } from "./db";
import type { User } from "./users";
import { palette } from "./theme";

export const STORE_ID = "demo-store-id";
export const PROGRAM_OPENING_VAL = 10000;
export const SUPERVISOR_IDS = ["owner-1", "admin-1", "manager-1"];

export type ShiftState = {
  activeShift: any | null;
  pendingShift: any | null;
  pendingDiscrepancy: any | null;
  version: number;
  bump: () => void;
  canSell: boolean;
};

export async function addShiftNotification(user: User, msg: string, type: string, refId: string) {
  try {
    const db = await getDb();
    for (const sup of SUPERVISOR_IDS) {
      await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
        [`notif-${Date.now()}-${sup}`, sup, type, refId, msg, "pending", new Date().toISOString()]);
    }
  } catch {}
}

export function useShiftGate(currentUser: User) {
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [pendingShift, setPendingShift] = useState<any | null>(null);
  const [pendingDiscrepancy, setPendingDiscrepancy] = useState<any | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const shifts = (await db.getAllAsync("SELECT * FROM shifts ORDER BY start_time DESC LIMIT 5")) as any[];
      const active = shifts.find((s: any) => s.status === "open" && s.cashier_id === currentUser.id) || shifts.find((s: any) => s.status === "open") || null;
      setActiveShift(active);
      setPendingShift(shifts.find((s: any) => s.status === "pending" && s.cashier_id === currentUser.id) || null);
      const cds = (await db.getAllAsync("SELECT * FROM cash_discrepancies")) as any[];
      const pending = cds.find((c: any) => c.status === "pending" || c.status === "reassigned");
      setPendingDiscrepancy(pending || null);
    } catch {}
  }, [currentUser.id]);

  useEffect(() => { load(); }, [load, version]);

  const bump = useCallback(() => setVersion(v => v + 1), []);
  const hasPendingDiscrepancy = !!pendingDiscrepancy && (pendingDiscrepancy.status === "pending" || pendingDiscrepancy.status === "reassigned");
  const isCashierConfirmed = !!activeShift && !!activeShift.cashier_confirmed;
  const canSell = currentUser.role !== "cashier" || (!!activeShift && isCashierConfirmed && !hasPendingDiscrepancy);

  return { activeShift, pendingShift, pendingDiscrepancy, version, bump, canSell, hasPendingDiscrepancy };
}

export async function beginShiftAgree(user: User): Promise<string> {
  const db = await getDb();
  const allShifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
  const existing = allShifts.find((s: any) => s.status === "open" && s.cashier_id === user.id);
  if (existing) return `✓ Kes la dakò a ${existing.opening_balance} HTG. Vant debloke — ou ka kòmanse vann kounye a.`;
  const ts = new Date().toISOString();
  const id = `shift-${Date.now()}`;
  await db.runAsync("INSERT INTO shifts (id, store_id, cashier_id, manager_id, opening_balance, status, start_time, end_time, cashier_confirmed, manager_confirmed, supervisor_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [id, STORE_ID, user.id, "manager-1", PROGRAM_OPENING_VAL, "open", ts, null, 1, 1, 1]);
  await addShiftNotification(user, `${user.name} konfime ${PROGRAM_OPENING_VAL} HTG nan kach la. Chanjman kòmanse epi vant debloke.`, "shift_opening", id);
  return `✓ Kes la dakò a ${PROGRAM_OPENING_VAL} HTG. Notification ale bay Owner/Admin/Manager. Vant debloke — ou ka kòmanse vann.`;
}

export async function fileShiftComplaint(user: User, statedAmount: number): Promise<string> {
  if (!(statedAmount > 0)) throw new Error("Antre montan");
  const db = await getDb();
  const ts = new Date().toISOString();
  const pendingShiftId = `shift-${Date.now()}`;
  await db.runAsync("INSERT INTO shifts (id, store_id, cashier_id, manager_id, opening_balance, status, start_time, end_time, cashier_confirmed, manager_confirmed, supervisor_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [pendingShiftId, STORE_ID, user.id, "manager-1", statedAmount, "pending", ts, null, 0, 0, 0]);
  await db.runAsync("INSERT INTO cash_discrepancies (id, shift_id, manager_amount, cashier_amount, difference, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [`cd-${Date.now()}`, pendingShiftId, PROGRAM_OPENING_VAL, statedAmount, PROGRAM_OPENING_VAL - statedAmount, "pending", user.id, ts]);
  await addShiftNotification(user, `${user.name} pa dakò: konte ${statedAmount} HTG olye de ${PROGRAM_OPENING_VAL} HTG. Vant ret bloke jiskaske sipèvizè revize.`, "shift_review", pendingShiftId);
  return `Ou konte ${statedAmount} HTG olye de ${PROGRAM_OPENING_VAL} HTG (diferans ${Math.abs(PROGRAM_OPENING_VAL - statedAmount)} HTG). Vant rete bloke — yon sipèvizè dwe rezoud tikit la anvan ou ka kòmanse.`;
}

export async function approveReassigned(cdId: string, shiftId: string, amount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE cash_discrepancies SET status = ? WHERE id = ?", ["approved", cdId]);
  await db.runAsync("UPDATE shifts SET opening_balance = ?, cashier_confirmed = 1, manager_confirmed = 1, supervisor_confirmed = 1, status = 'open', start_time = ? WHERE id = ?",
    [amount, new Date().toISOString(), shiftId]);
}

export function shiftGateStyles() {
  return {
    banner: { background: palette.warningBg, borderBottom: `0.5px solid ${palette.warningBd}`, padding: "11px 18px", display: "flex", alignItems: "center", gap: 10 },
  };
}

export async function resolvePendingDiscrepancy(cdId: string, action: "reassign" | "approve", opts: { reassignedAmount?: number } = {}) {
  const db = await getDb();
  if (action === "reassign") {
    await db.runAsync("UPDATE cash_discrepancies SET status = ?, reassigned_amount = ? WHERE id = ?", ["reassigned", opts.reassignedAmount ?? 0, cdId]);
  } else {
    await db.runAsync("UPDATE cash_discrepancies SET status = ? WHERE id = ?", ["approved", cdId]);
  }
}