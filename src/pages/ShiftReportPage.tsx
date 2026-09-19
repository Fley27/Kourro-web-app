import { useCallback, useEffect, useState } from "react";
import { palette, radius, shadow } from "../lib/theme";
import { fmt, monoStyle } from "../lib/format";
import { getDb } from "../lib/db";
import { salesEvents } from "../lib/salesEvents";
import { USERS, getUserById } from "../lib/users";
import { useAuthStore } from "../lib/authStore";
import { beginShiftAgree, fileShiftComplaint, approveReassigned, resolvePendingDiscrepancy, shiftGateStyles, useShiftGate } from "../lib/shift";
import { notifyLocal } from "../lib/notifications";
import { Icon } from "../components/Icon";
import { Button, Card, EmptyState, Field, ModalHeader, Overlay, RowItem, TextInput, toast } from "../components/ui";

const RANK: Record<string, number> = { cashier: 0, stock: 0, manager: 1, admin: 2, owner: 3 };
const ROLE_ICON: Record<string, string> = { cashier: "user", manager: "briefcase", admin: "shield", owner: "store" };
const ROLE_LABEL: Record<string, string> = { owner: "Patwon", admin: "ADMIN", manager: "MANAGE", cashier: "KESYE", stock: "STOCK" };
// Decision vocabulary for the report_reviews audit trail.
const DECISION_INFO: Record<string, { label: string; icon: string; color: string }> = {
  debt: { label: "Dèt ouvè", icon: "briefcase", color: palette.warningDot },
  waived_negligible: { label: "Pèt neglij", icon: "warning", color: palette.accentGold },
  approved: { label: "Apwouve", icon: "checkmark-circle", color: palette.success },
  revoke_to_debt: { label: "Revoke → Dèt", icon: "refresh", color: palette.danger },
  approve_waive: { label: "Pèt konfime", icon: "shield-checkmark", color: palette.success },
};
const DECISION_MSG: Record<string, string> = {
  debt: "defisi RETRE SOU DÈT kesye a",
  waived_negligible: "defisi ABANDONE kòm pèt (neglij) — ap tann apwobasyon pi wo",
  approved: "apwouve (balanse)",
  revoke_to_debt: "PÈT REVOKE → tounen DÈT ouvè",
  approve_waive: "pèt konfime",
};
const initialsOf = (n: string) => n.split(" ").filter(Boolean).map((w: string) => w[0]?.toUpperCase()).slice(0, 2).join("") || "?";

function td(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function pickUserForRole(sid: string, r: string): string | null {
  const appUsers = USERS.filter(u => u.role === r);
  const sameStore = appUsers.find(u => u.store === sid);
  return sameStore?.id ?? appUsers[0]?.id ?? null;
}

export function ShiftReportPage() {
  const { user } = useAuthStore();
  const gate = useShiftGate(user ?? ({ id: "" } as any));
  const [sales, setSales] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shift, setShift] = useState<any | null>(null);
  const [myShiftToday, setMyShiftToday] = useState<any | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [inventoryPickups, setInventoryPickups] = useState<any[]>([]);
  const [debtCollections, setDebtCollections] = useState<any[]>([]);
  const [cashierDebts, setCashierDebts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [reviewReports, setReviewReports] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [showEnd, setShowEnd] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [pendingValidateId, setPendingValidateId] = useState<string | null>(null);
  const [managerPassword, setManagerPassword] = useState("");
  const [showComplaint, setShowComplaint] = useState(false);
  const [complaintAmount, setComplaintAmount] = useState("");
  const [confirmReassigned, setConfirmReassigned] = useState(false);
  const [reassignAmount, setReassignAmount] = useState("");
  // Supervisor review studio — Apple-style segmented workflow backed by report_reviews audit log
  const [reviews, setReviews] = useState<any[]>([]);
  const [revTab, setRevTab] = useState<"pending" | "waived" | "debt" | "journal">("pending");
  const [waiveFor, setWaiveFor] = useState<string | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  const storeId = "demo-store-id";
  const myRank = user ? (RANK[user.role] ?? 0) : 0;
  const isCashier = myRank === 0;
  const isSupervisor = myRank >= 1;
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const db = await getDb();
      const allSales = (await db.getAllAsync("SELECT * FROM sales")) as any[];
      const allItems = (await db.getAllAsync("SELECT * FROM sale_items")) as any[];
      const shifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      const cms = (await db.getAllAsync("SELECT * FROM cash_movements")) as any[];
      // Credit cash collected is recorded in credit_payments (payment_method "cash") —
// debt_collections is never written by any screen, so read the real table here.
      const dcs = ((await db.getAllAsync("SELECT * FROM credit_payments")) as any[]).filter((p: any) => (p.payment_method ?? "cash") === "cash");
      const cds = (await db.getAllAsync("SELECT * FROM cashier_deficits")) as any[];
      setReviews((((await db.getAllAsync("SELECT * FROM report_reviews")) as any[]) ?? [])
        .filter((rv: any) => (rv.store_id ?? storeId) === storeId)
        .sort((a: any, b: any) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))));
      const allReports = (await db.getAllAsync("SELECT * FROM daily_reports")) as any[];
      const allSets = (await db.getAllAsync("SELECT * FROM deficit_settlements")) as any[];

      const storeSales = allSales.filter((s: any) => (s.store_id ?? storeId) === storeId && String(s.created_at ?? "").slice(0, 10) === today);
      const storeShifts = shifts.filter((s: any) => (s.store_id ?? storeId) === storeId);
      const storeCMs = cms.filter((c: any) => (c.store_id ?? storeId) === storeId);
      const storeDCs = dcs.filter((d: any) => (d.store_id ?? storeId) === storeId);
      const storeCDs = cds.filter((c: any) => (c.store_id ?? storeId) === storeId);
      const storeReports = allReports.filter((r: any) => (r.store_id ?? storeId) === storeId && r.report_date === today);
      setReviewReports(allReports
        .filter((r: any) => (r.store_id ?? storeId) === storeId && r.status === "closed" && (RANK[r.role] ?? 0) === 0)
        .sort((a: any, b: any) => String(b.report_date ?? "").localeCompare(String(a.report_date ?? ""))));

      const myOpen = storeShifts.find((s: any) => s.status === "open" && (!s.cashier_id || s.cashier_id === user?.id));
      // This cashier's approved shift for today (open preferred, else latest) — its opening anchors the till.
      // Fallbacks (active open shift even if unattributed / started another UTC day) so the opening never silently drops to 0.
      const myOpenStrict = storeShifts.find((s: any) => s.status === "open" && (s.cashier_id ?? null) === (user?.id ?? null));
      const mineToday = storeShifts
        .filter((s: any) => (s.cashier_id ?? null) === (user?.id ?? null) && String(s.start_time ?? "").slice(0, 10) === today)
        .sort((a: any, b: any) => (((b.status === "open") ? 1 : 0) - ((a.status === "open") ? 1 : 0)) || String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")));
      // Cross-store fallback (parity with mobile): shifts written under a different
      // store_id must still anchor this cashier's till instead of dropping to 0.
      const mineTodayAny = shifts
        .filter((s: any) => (s.cashier_id ?? null) === (user?.id ?? null) && String(s.start_time ?? "").slice(0, 10) === today)
        .sort((a: any, b: any) => (((b.status === "open") ? 1 : 0) - ((a.status === "open") ? 1 : 0)) || String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")));
      const myOpenAny = shifts.find((s: any) => s.status === "open" && (s.cashier_id ?? null) === (user?.id ?? null));
      const resolvedShift = mineToday[0] ?? myOpenStrict ?? myOpen ?? mineTodayAny[0] ?? myOpenAny ?? storeShifts.find((s: any) => s.status === "open") ?? shifts.find((s: any) => s.status === "open") ?? null;
      setShift(myOpen || storeShifts.find((s: any) => s.status === "open") || myOpenAny || shifts.find((s: any) => s.status === "open") || null);
      setMyShiftToday(resolvedShift);
      const cmsForTill = resolvedShift
        ? storeCMs.concat(cms.filter((c: any) => (c as any).shift_id === (resolvedShift as any).id && !(storeCMs as any[]).includes(c)))
        : storeCMs;
      setWithdrawals(cmsForTill.filter((c: any) => c.type === "withdrawal"));
      setInventoryPickups(cmsForTill.filter((c: any) => c.type === "inventory"));
      setDebtCollections(storeDCs);
      setCashierDebts(storeCDs);
      setReports(storeReports);
      setSettlements(allSets.filter((s:any)=>(s.store_id??storeId)===storeId).sort((a:any,b:any)=>String(b.period_end).localeCompare(String(a.period_end))));

      setSales(storeSales);
      setItems(allItems);
    } catch {}
    setLoading(false);
  }, [user, storeId, isSupervisor, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(() => { load({ silent: true }); gate.bump(); }); } catch {} })();
    const id = setInterval(() => { load({ silent: true }); gate.bump(); }, 4000);
    return () => { clearInterval(id); if (unsub) unsub(); };
  }, [load, gate]);

  const salesFor = useCallback((rank: number) => sales.filter((s: any) => (RANK[s.seller_role ?? "cashier"] ?? 0) <= rank), [sales]);
  const rollupSales = user ? salesFor(myRank) : [];
  const cashSales = rollupSales.filter((s: any) => s.payment_method === "cash");
  const moncashSales = rollupSales.filter((s: any) => s.payment_method === "moncash");
  const natcashSales = rollupSales.filter((s: any) => s.payment_method === "natcash");
  const creditSales = rollupSales.filter((s: any) => s.payment_method === "credit");
  const cashTotal = cashSales.reduce((s: number, x: any) => s + Number(x.total), 0);
  const moncashTotal = moncashSales.reduce((s: number, x: any) => s + Number(x.total), 0);
  const natcashTotal = natcashSales.reduce((s: number, x: any) => s + Number(x.total), 0);
  const creditTotal = creditSales.reduce((s: number, x: any) => s + Number(x.total), 0);
  const salesTotal = cashTotal + moncashTotal + natcashTotal + creditTotal;
  const collectedTotal = debtCollections.filter((x: any) => String(x.created_at ?? "").slice(0, 10) === today).reduce((s: number, x: any) => s + Number(x.amount), 0) || 0;

  const inventoryTotal = inventoryPickups.filter((w: any) => w.validated_by).reduce((s: number, w: any) => s + Number(w.amount), 0);
  // Till math is person-scoped: this cashier's approved shift opening today
  // + their cash sales today + their cash credit-collections today − withdrawals from their register today.
  const meId = user?.id ?? null;
  const myOpening = Number(myShiftToday?.opening_balance ?? 0);
  const myCashTotal = rollupSales.filter((s: any) => s.payment_method === "cash" && (s.seller_id ?? null) === meId).reduce((s: number, x: any) => s + Number(x.total), 0);
  const myCollectedTotal = debtCollections.filter((x: any) => String(x.created_at ?? "").slice(0, 10) === today && (x.collected_by ?? null) === meId).reduce((s: number, x: any) => s + Number(x.amount), 0) || 0;
  const myWithdrawalsTotal = withdrawals
    .filter((w: any) => w.validated_by && String(w.created_at ?? "").slice(0, 10) === today && ((w.taken_by ?? null) === meId || (myShiftToday && (w as any).shift_id && (w as any).shift_id === (myShiftToday as any).id && !(w as any).taken_by)))
    .reduce((s: number, x: any) => s + Number(x.amount), 0) || 0;
  const submissions = reports.filter((r: any) => r.status === "closed");
  const myReportClosed = submissions.some((r: any) => r.user_id === user?.id);
  const reportRow = reports.find((r: any) => r.user_id === user?.id);
  const expectedCash = myOpening + myCashTotal + myCollectedTotal - myWithdrawalsTotal;
  // After close `shift` (open-only) is null — fall back to the closed shift today and
  // to the persisted report so the deficit banner stays visible (parity with mobile).
  const actualFromShift = (shift as any)?.actual_cash ?? (myShiftToday as any)?.actual_cash ?? null;
  const actual = (actualFromShift ?? (reportRow as any)?.actual_cash ?? null) as number | null;
  const deficit = actual !== null ? expectedCash - actual : null;

  async function ensureReport() {
    const db = await getDb();
    if (reports.some((r: any) => r.user_id === user?.id)) return;
    await db.runAsync(
      "INSERT INTO daily_reports (id, store_id, report_date, role, user_id, status, cash_sales, moncash_sales, natcash_sales, credit_sales, credit_collected_cash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [`rep-${user?.id}-${today}`, storeId, today, user?.role, user?.id, "pending", cashTotal, moncashTotal, natcashTotal, creditTotal, collectedTotal, new Date().toISOString()]
    );
  }

  async function openTabsForMe(): Promise<any[]> {
    try {
      const db = await getDb();
      const rows = (await db.getAllAsync("SELECT * FROM suspended_sales WHERE status = ?", ["open"]).catch(() => [])) as any[];
      return (rows ?? []).filter((t: any) => (t.cashier_id ?? null) === (user?.id ?? null));
    } catch { return []; }
  }

  async function endReport(counted?: number) {
    if (!user?.id) { toast("Sesi", "Ou dwe konekte yon itilizatè.", "warn"); return; }
    const myTabs = await openTabsForMe();
    if (myTabs.length) {
      toast("Tab ouvè — pa ka fèmen", `Ou gen ${myTabs.length} vant an atann (${myTabs.slice(0, 3).map((t: any) => t.label).join(" · ")}${myTabs.length > 3 ? "…" : ""}). Fèmen oswa anile yo nan Vant anvan ou fèmen chanjman an.`, "error");
      return;
    }
    const deficitAmt = isCashier && shift ? Math.max(0, expectedCash - (counted ?? actual ?? expectedCash)) : 0;
    try {
      const db = await getDb();
      await ensureReport();
      await db.runAsync(
        "UPDATE daily_reports SET status = ?, expected_cash = ?, actual_cash = ?, deficit = ?, submitted_at = ?, closed_at = ? WHERE user_id = ? AND report_date = ? AND store_id = ?",
        ["closed", expectedCash, counted ?? actual, deficitAmt, new Date().toISOString(), new Date().toISOString(), user.id, today, storeId]
      );
      if (isCashier && deficitAmt > 0) {
        const existing = (await db.getAllAsync("SELECT * FROM cashier_deficits WHERE status = ?", ["open"])) as any[];
        const todayRow = existing.find((d: any) => d.cashier_id === user.id && d.date === today && d.store_id === storeId);
        if (todayRow) {
          await db.runAsync("UPDATE cashier_deficits SET deficit = ?, updated_at = ? WHERE id = ?", [Number(todayRow.deficit) + deficitAmt, new Date().toISOString(), todayRow.id]);
        } else {
          await db.runAsync("INSERT INTO cashier_deficits (id, store_id, cashier_id, date, deficit, status, created_at) VALUES (?,?,?,?,?,?,?)",
            [`def-${user.id}-${today}`, storeId, user.id, today, deficitAmt, "open", new Date().toISOString()]);
        }
      }
      // Unified: notify every manager/admin of the cashier's store + every owner.
      const cashierStore = (user as any)?.store ?? null;
      let supervisorIds: string[] = USERS
        .filter(u => (u.role === "manager" || u.role === "admin" || u.role === "owner") && u.id !== user.id && (u.store === cashierStore || u.role === "owner"))
        .map(u => u.id);
      if (supervisorIds.length === 0) {
        supervisorIds = USERS.filter(u => (u.role === "manager" || u.role === "admin" || u.role === "owner") && u.id !== user.id).map(u => u.id);
      }
      const notifyIds = [...new Set(supervisorIds)];
      if (notifyIds.length > 0) {
        for (const uid of [...new Set(notifyIds)]) {
          if (uid === user.id) continue;
          await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
            [`notif-${Date.now()}-${uid}-${Math.random().toString(36).slice(2, 5)}`, uid, "report_closed", `rep-${user.id}-${today}`,
              `${user.name} (${(user.role ?? "cashier").toUpperCase()}) fèmen rapò jounen li. Atann ${fmt(expectedCash)} HTG, konte ${fmt(counted ?? actual ?? 0)} HTG — Defisi: ${fmt(deficitAmt)} HTG${deficitAmt>0?` (dèt anrejistre)`:""}`, "pending", new Date().toISOString()]);
        }
      }
      const supLabel = cashierStore ? `Manadjè/Admin (${cashierStore}) + Owner` : "Manadjè/Admin/Owner";
      toast("Rapò Fèmen", isSupervisor
        ? `Rapò ${(user.role ?? "CASHIER").toUpperCase()} fèmen. Notifikasyon voye bay ${supLabel}.`
        : `Rapò kesye fèmen. Atann ${fmt(expectedCash)} HTG, konte ${fmt(counted ?? actual ?? 0)} HTG — Defisi ${fmt(deficitAmt)} HTG. Notifikasyon voye bay ${supLabel}.`, "success");
      notifyLocal(deficitAmt > 0 ? `Rapò fèmen — Defisi ${fmt(deficitAmt)} HTG` : "Rapò fèmen", `${user.name} fèmen rapò jounen li (atann ${fmt(expectedCash)} HTG, konte ${fmt(counted ?? actual ?? 0)} HTG, defisi ${fmt(deficitAmt)} HTG)`);
      salesEvents.emit();
      load({ silent: true });
      gate.bump();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Fèmen rapò echwe", "error");
    }
  }

  // Same-store visibility: manager/admin sees only their store's cashiers; owner sees all.
  const visibleReport = (r: any) => {
    if (user?.role === "owner") return true;
    const cashier = getUserById(r.user_id);
    if (!cashier?.store) return true;
    return cashier.store === (user as any)?.store;
  };
  // Immutable audit trail → the current decision for a report is the last appended row.
  const latestByReport = new Map<string, any>();
  for (const rv of [...reviews].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))) latestByReport.set(rv.report_id, rv);
  const canOverride = (rv: any) => myRank > Number(rv.decided_by_rank ?? 0);
  const reviewStage = (r: any): "todo" | "waived" | "done" => {
    if (!visibleReport(r)) return "done";
    // Legacy reports decided before the audit trail existed stay locked as "done".
    if (r.reviewed_by && !latestByReport.has(r.id)) return "done";
    const latest = latestByReport.get(r.id);
    if (!latest) return "todo";
    if (latest.decision === "waived_negligible") return canOverride(latest) ? "waived" : "done";
    return "done";
  };
  const pendingReports = reviewReports.filter((r: any) => reviewStage(r) === "todo");
  const waivedReports = reviewReports.filter((r: any) => reviewStage(r) === "waived");
  const openDeficitOf = (r: any) => cashierDebts.find((d: any) => d.status === "open" && d.cashier_id === r.user_id && d.date === r.report_date);
  const totalDebtOf = (cashierId: string) => cashierDebts.filter((d: any) => (d.status === "open" || d.status === "partial") && d.cashier_id === cashierId).reduce((s, d) => s + Number(d.deficit ?? 0), 0);
  const openDebts = cashierDebts.filter((d: any) => (d.status === "open") && (d.store_id ?? storeId) === storeId);

  async function notifyCharges(msg: string) {
    try {
      const db = await getDb();
      const targets = USERS.filter(u => u.role === "manager" || u.role === "admin" || u.role === "owner");
      for (const t of targets) {
        if (t.id === user?.id) continue;
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${t.id}-${Math.random().toString(36).slice(2, 5)}`, t.id, "deficit", "deficit-resolution", msg, "pending", new Date().toISOString()]);
      }
    } catch {}
  }

  async function sendDeficitReminder() {
    if (openDebts.length === 0) { toast("Pa gen defisi", "Pa gen defisi kesye ouvè ki poko revize kounye a.", "warn"); return; }
    const total = openDebts.reduce((s, d) => s + Number(d.deficit ?? 0), 0);
    await notifyCharges(`Rapèl: gen ${openDebts.length} defisi kesye ouvè (total ${fmt(total)} HTG). Manadjè/Admin/Owner dwe revize anvan fèmen mwa.`);
    toast("Rapèl voye", `Rapèl defisi voye bay Manadjè/Admin/Owner (${openDebts.length} kesye).`, "success");
    load({ silent: true });
  }

  // Append to the audit trail + apply side effects. Never edits a previous review row.
  async function addReportReview(r: any, decision: string, reason?: string, previousReviewId?: string) {
    if (!user) return;
    if (myRank < 1) { toast("Sèl sipèvizè", "Se sèlman Manadjè/Admin/Owner ka revize yon rapò.", "warn"); return; }
    try {
      const db = await getDb();
      const ts = new Date().toISOString();
      const deficitAmt = Number(r.deficit ?? 0);
      const cashierName = getUserById(r.user_id)?.name ?? r.user_id;
      const meta = DECISION_INFO[decision];
      const id = `rev-${r.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await db.runAsync(
        "INSERT INTO report_reviews (id, store_id, report_id, cashier_id, report_date, deficit, decision, decided_by, decided_by_role, decided_by_rank, reason, previous_review_id, created_at, lamport_clock, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, storeId, r.id, r.user_id, r.report_date, deficitAmt, decision, user.id, user.role, myRank, reason ?? null, previousReviewId ?? null, ts, 1, ts]);
      await db.runAsync("UPDATE daily_reports SET reviewed_by = ?, reviewed_at = ? WHERE id = ?", [user.id, ts, r.id]);
      const cd = openDeficitOf(r);
      if (decision === "debt" || decision === "revoke_to_debt") {
        // Re-open the current open deficit, or reverse a previously waived one
        // (status resolved + waiver), or open a fresh row (never hard-delete).
        const waivedRow = cashierDebts.find((d: any) => d.cashier_id === r.user_id && d.date === r.report_date && d.status === "resolved" && d.resolution === "waived_negligible");
        if (cd || waivedRow) {
          const target = cd ?? waivedRow;
          await db.runAsync("UPDATE cashier_deficits SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", ["open", null, null, null, target.id]);
        } else {
          await db.runAsync("INSERT INTO cashier_deficits (id, store_id, cashier_id, date, deficit, status, created_at) VALUES (?,?,?,?,?,?,?)",
            [`def-${r.user_id}-${r.report_date}-${Date.now()}`, storeId, r.user_id, r.report_date, deficitAmt, "open", ts]);
        }
        if (decision === "revoke_to_debt" && previousReviewId) {
          // Reverse the waived loss with a compensating audit entry (never hard-delete loss rows).
          await db.runAsync("INSERT INTO monthly_losses (id, store_id, month, cashier_id, amount, origin, reason, registered_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [`loss-${Date.now()}`, storeId, String(r.report_date).slice(0, 7), r.user_id, -deficitAmt, "revocation_reversal", `Rektifikasyon apwobasyon ${previousReviewId}`, user.id, ts]);
        }
      } else if (decision === "waived_negligible") {
        if (cd) {
          await db.runAsync("UPDATE cashier_deficits SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", ["resolved", "waived_negligible", user.id, ts, cd.id]);
        }
        await db.runAsync("INSERT INTO monthly_losses (id, store_id, month, cashier_id, amount, origin, reason, registered_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          [`loss-${Date.now()}`, storeId, String(r.report_date).slice(0, 7), r.user_id, deficitAmt, "waived_negligible", reason ?? "Defisi negligeable", user.id, ts]);
      }
      await notifyCharges(`${cashierName}: ${DECISION_MSG[decision] ?? decision} (${deficitAmt} HTG) pa ${user.name ?? user.id}.`);
      notifyLocal("Revizyon rapò", `${cashierName} (${r.report_date}) · ${meta.label} · ${fmt(deficitAmt)} HTG — ${user.name ?? user.role}`);
      toast(meta.label, decision === "revoke_to_debt"
        ? `Dèt ${fmt(deficitAmt)} HTG reouvri pou ${cashierName}; pèt la konpense nan rejis la.`
        : decision === "debt"
          ? `Dèt total ${cashierName}: ${fmt(totalDebtOf(r.user_id))} HTG.`
          : `Rapò ${cashierName} (${r.report_date}) rekòde: ${meta.label}.`, "success");
      salesEvents.emit();
      load({ silent: true });
      gate.bump();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Revizyon rapò echwe", "error");
    }
  }

  async function submitDecision(r: any, decision: string, reason?: string, previousReviewId?: string) {
    if (decision === "waived_negligible" && !reason) { setWaiveFor(r.id); setWaiveReason(""); return; }
    setWaiveFor(null); setWaiveReason("");
    await addReportReview(r, decision, reason, previousReviewId);
  }

  // --- Deficit settlements FSM (period aggregation) ---
  const openSettlements = settlements.filter(s=>s.status!=="paid" && s.status!=="waived");
  async function createSettlement(cashierId: string) {
    if (!isSupervisor || !user) { toast("Sèl Sipèvizè","Sèl Manadjè/Admin/Owner ka kreye règleman","warn"); return; }
    const rows = cashierDebts.filter((d:any)=>d.cashier_id===cashierId && (d.status==="open" || d.status==="paid") && d.status!=="waived");
    // only unpaid opens should be grouped; use open ones
    const opens = cashierDebts.filter((d:any)=>d.cashier_id===cashierId && d.status==="open");
    if (opens.length===0) { toast("Pa gen dèt","Pa gen defisi ouvè pou kesye sa","warn"); return; }
    const total = opens.reduce((s:number,x:any)=>s+Number(x.deficit||0),0);
    const dates = opens.map((x:any)=>x.date).sort();
    const period_start = dates[0]; const period_end = dates[dates.length-1];
    const deficit_ids = JSON.stringify(opens.map((x:any)=>x.id));
    const db = await getDb(); const ts = new Date().toISOString();
    // avoid duplicate active settlement for same cashier/period
    const dup = settlements.find(s=>s.cashier_id===cashierId && s.period_start===period_start && s.period_end===period_end && s.status!=="paid" && s.status!=="waived");
    if (dup) { toast("Deja egziste","Gen yon règleman ouvè deja pou peryòd sa","warn"); return; }
    await db.runAsync("INSERT INTO deficit_settlements (id, store_id, cashier_id, period_start, period_end, deficit_ids, total, paid, status, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [`set-${Date.now()}`, storeId, cashierId, period_start, period_end, deficit_ids, total, 0, "open", user.id, ts]);
    toast("Règleman kreye", `${getUserById(cashierId)?.name ?? cashierId}: ${opens.length} dèt • ${fmt(total)} HTG • ${period_start} → ${period_end}`, "success");
    load({ silent: true }); gate.bump();
  }
  async function paySettlement(settlementId: string, amount: number) {
    if (!user) return;
    const s = settlements.find(x=>x.id===settlementId);
    if (!s) return;
    if (s.status==="paid" || s.status==="waived") { toast("Fèmen","Règleman sa deja fèmen","warn"); return; }
    if (amount<=0) { toast("Montan","Antre yon montan >0","warn"); return; }
    const newPaid = Number(s.paid||0)+amount;
    if (newPaid > Number(s.total)) { toast("Twòp","Peman depase total règleman an","warn"); return; }
    const db = await getDb();
    await db.runAsync("UPDATE deficit_settlements SET paid = ?, paid_by = ?, paid_at = ? WHERE id = ?", [newPaid, user.id, new Date().toISOString(), settlementId]);
    if (newPaid >= Number(s.total)) {
      const ids: string[] = JSON.parse(s.deficit_ids||"[]");
      for (const did of ids) { try { await db.runAsync("UPDATE cashier_deficits SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?", ["paid", user.id, new Date().toISOString(), did]); } catch {} }
      notifyLocal("Règleman peye","Règleman "+(getUserById(s.cashier_id)?.name ?? s.cashier_id)+" peye nèt — "+fmt(s.total)+" HTG");
    }
    toast(newPaid>=Number(s.total)?"Peye nèt":"Peman anrejistre", fmt(amount)+" HTG sou règleman "+(getUserById(s.cashier_id)?.name ?? s.cashier_id), "success");
    load({ silent: true }); gate.bump();
  }
  async function waiveSettlement(settlementId: string) {
    if (!isSupervisor || !user) return;
    await (await getDb()).runAsync("UPDATE deficit_settlements SET status = ? WHERE id = ?", ["waived", settlementId]);
    toast("Abandone","Règleman abandone","warn"); load({ silent: true });
  }

  async function validateWithdrawal() {
    if (!user || !pendingValidateId) return;
    const w = withdrawals.find((x: any) => x.id === pendingValidateId);
    const takenUser = getUserById(w?.taken_by ?? "");
    if (managerPassword.trim() !== String(takenUser?.secret ?? "").trim()) { toast("Kòd pa bon", "Kòd sekrè a pa kòrèk.", "error"); return; }
    try {
      const db = await getDb();
      await db.runAsync("UPDATE cash_movements SET validated_by = ? WHERE id = ?", [`${takenUser?.name} (valide)`, pendingValidateId]);
      toast("Valide", `Retrè ${w?.amount} HTG valide.`, "success");
      setPendingValidateId(null);
      setManagerPassword("");
      load({ silent: true });
      gate.bump();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Validasyon echwe", "error");
    }
  }

  async function onBeginAgree() {
    if (!user) return;
    const msg = await beginShiftAgree(user);
    toast("Chanjman kòmanse", msg.replace("✓ Kes", "Kes"), "success");
    setShowComplaint(false);
    gate.bump();
    load({ silent: true });
  }

  async function onFileComplaint() {
    if (!user) return;
    try {
      const msg = await fileShiftComplaint(user, Number(complaintAmount || "0"));
      toast("Plent anrejistre", msg, "warn");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Imposib anrejistre plent.", "error");
    }
    setShowComplaint(false);
    setComplaintAmount("");
    gate.bump();
    load({ silent: true });
  }

  async function supervisorApprove() {
    if (!user || !gate.pendingDiscrepancy) return;
    try {
      const db = await getDb();
      const cd = gate.pendingDiscrepancy;
      await resolvePendingDiscrepancy(cd.id, "approve");
      const shifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      const sh = shifts.find((s: any) => s.id === cd.shift_id && s.status === "pending");
      if (sh) {
        await db.runAsync(
          "UPDATE shifts SET status = ?, cashier_confirmed = 1, manager_confirmed = 1, supervisor_confirmed = 1, opening_balance = ?, start_time = ? WHERE id = ?",
          ["open", cd.cashier_amount, new Date().toISOString(), cd.shift_id]
        );
      }
      toast("Kesye konfime", `Kes la louvri ak ${fmt(cd.cashier_amount)} HTG (kesye te konte).`, "success");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Konfimasyon echwe", "error");
    }
    gate.bump();
    load({ silent: true });
  }

  async function supervisorReassign() {
    if (!user || !gate.pendingDiscrepancy) return;
    const amt = Number(reassignAmount || "0");
    if (!(amt > 0)) { toast("Antre montan", "Bay yon montan reasignasyon valid.", "warn"); return; }
    await resolvePendingDiscrepancy(gate.pendingDiscrepancy.id, "reassign", { reassignedAmount: amt });
    toast("Reasignasyon voye", `Kesye a dwe konfime ${fmt(amt)} HTG.`, "warn");
    setReassignAmount("");
    gate.bump();
    load({ silent: true });
  }

  async function supervisorReject() {
    if (!user || !gate.pendingDiscrepancy) return;
    try {
      const db = await getDb();
      await db.runAsync("UPDATE cash_discrepancies SET status = ? WHERE id = ?", ["rejected", gate.pendingDiscrepancy.id]);
      toast("Tikit rejte", "Diskrepans lan te rejte. Kesye a dwe rankòmanse.", "warn");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Rejt echwe", "error");
    }
    gate.bump();
    load({ silent: true });
  }

  async function confirmCashierReassigned() {
    if (!user || !gate.pendingDiscrepancy) return;
    if (managerPassword.trim() !== String(user.secret ?? "").trim()) { toast("Kòd pa bon", "Kòd sekrè a pa kòrèk.", "error"); return; }
    try {
      await approveReassigned(gate.pendingDiscrepancy.id, gate.pendingDiscrepancy.shift_id, Number(gate.pendingDiscrepancy.reassigned_amount ?? 0));
      toast("Konfime", "Kes la louvri ak montan reasignye a. Vant debloke.", "success");
      setConfirmReassigned(false);
      setManagerPassword("");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Konfimasyon echwe", "error");
    }
    gate.bump();
    load({ silent: true });
  }

  const completeCount = async () => {
    const amt = parseFloat(actualCash);
    if (isNaN(amt)) { toast("Antre montan", "Antre montan kach ou konte.", "warn"); return; }
    const myTabs = await openTabsForMe();
    if (myTabs.length) {
      toast("Tab ouvè — pa ka fèmen", `Ou gen ${myTabs.length} vant an atann. Fèmen oswa anile yo nan Vant anvan ou fèmen chanjman an.`, "error");
      return;
    }
    try {
      const db = await getDb();
      if (shift) {
        await db.runAsync("UPDATE shifts SET actual_cash = ?, status = ? WHERE id = ?", [amt, "closed", shift.id]);
      }
      setShowEnd(false);
      setActualCash("");
      await endReport(amt);
    } catch (e: any) {
      toast("Erè", e?.message ?? "Fèmen chanjman echwe", "error");
    }
  };

  if (loading) {
    return (
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
        <Card style={{ padding: 24, textAlign: "center", color: palette.muted2, fontSize: 13 }}>
          <Icon name="refresh" size={16} color={palette.accentGold} /> Ap chaje…
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
        <Card><EmptyState icon="briefcase" title="Konekte ou anvan" body="Ou dwe konekte pou wè rapò chanjman an." /></Card>
      </div>
    );
  }

  const todayStr = new Date().toLocaleDateString("fr-HT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const productMap = new Map<string, { name: string; qty: number; total: number }>();
  for (const it of items) {
    const cur = productMap.get(it.product_name) ?? { name: it.product_name, qty: 0, total: 0 };
    cur.qty += Number(it.quantity);
    cur.total += Number(it.line_total);
    productMap.set(it.product_name, cur);
  }
  if (productMap.size === 0 && sales.length > 0) {
    for (const s of sales) productMap.set(s.sale_number, { name: s.sale_number, qty: 1, total: Number(s.total) });
  }
  const productsSold = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty);

  const gateStyles = shiftGateStyles();
  const activePart = gate.activeShift ?? gate.pendingShift ?? null;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: palette.ink2, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <Icon name="briefcase" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: palette.ink, letterSpacing: -0.3 }}>{todayStr}</div>
          <div style={{ fontSize: 11, color: palette.muted2 }}>
            <span style={{ color: palette.accentGold, fontWeight: 700 }}>{ROLE_LABEL[user.role] ?? user.role.toUpperCase()}</span>
            <span className="num"> • {sales.length} vant jodi a</span>
          </div>
        </div>
        <Button label="Wechaje" size="sm" variant="soft" icon="refresh" onClick={() => { load(); gate.bump(); }} />
      </div>

      {gate.activeShift === null && gate.pendingShift === null && isCashier && (
        <Card accent="gold" style={{ padding: 16, textAlign: "center" }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, background: palette.accentGoldSoft, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <Icon name="clock" size={22} color={palette.accentGold} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: palette.ink, marginTop: 10 }}>Kòmanse Chanjman Mwen</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 4, maxWidth: 380, margin: "4px auto 0" }}>
            Antre kes ou a, konte kach la, epi konfime ouvèti a pou debloke vant.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
            <Button label="✓ Mwen dakò — Kes la byen" variant="success" icon="checkmark-circle" onClick={onBeginAgree} />
            <Button label="Mwen pa dakò" variant="danger" icon="alert" onClick={() => setShowComplaint(true)} />
          </div>
        </Card>
      )}

      {activePart && gate.hasPendingDiscrepancy && gate.pendingDiscrepancy?.status === "reassigned" && isCashier && (
        <div style={{ ...gateStyles.banner, borderRadius: radius.md, border: `0.5px solid ${palette.warningBd}`, background: palette.warningBg }}>
          <Icon name="alert" size={16} color={palette.warning} />
          <div style={{ flex: 1, fontSize: 12, color: palette.ink }}>
            <b>Sipèvizè reasigne {fmt(Number(gate.pendingDiscrepancy.reassigned_amount ?? 0))} HTG.</b> Vant rete bloke jiskaske ou konfime ak kòd sekrè w.
          </div>
          {!confirmReassigned ? (
            <Button label="Konfime kòd" size="sm" variant="ghost" icon="shield" onClick={() => setConfirmReassigned(true)} />
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <TextInput numeric value={managerPassword} onChange={setManagerPassword} placeholder="Kòd sekrè" style={{ width: 110, padding: "8px 10px" }} />
              <Button label="Valide" size="sm" variant="success" icon="checkmark" onClick={confirmCashierReassigned} />
            </div>
          )}
        </div>
      )}

      {activePart && gate.hasPendingDiscrepancy && isCashier && gate.pendingDiscrepancy?.status !== "reassigned" && (
        <div style={{ ...gateStyles.banner, borderRadius: radius.md, border: `0.5px solid ${palette.warningBd}`, background: palette.warningBg }}>
          <Icon name="clock" size={16} color={palette.warning} />
          <div style={{ flex: 1, fontSize: 12, color: palette.ink }}>
            <b>Tann konfimasyon sipèvizè.</b> Ou konte chanjman n'a <b>{gate.pendingShift?.opening_balance ?? "—"} HTG</b>. Vant bloke jiskaske yo deside.
          </div>
          <Button label="Anile plent" size="sm" variant="ghost" icon="close" onClick={() => setShowComplaint(true)} />
        </div>
      )}

      {isSupervisor && gate.pendingDiscrepancy && gate.pendingDiscrepancy.status === "pending" && (
        <Card accent="gold" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="alert" size={16} color={palette.warning} />
            <span style={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>Diskrepans Kach (pandan)</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 110, background: palette.surfaceGrouped, borderRadius: radius.md, padding: 10 }}>
              <div style={{ fontSize: 10, color: palette.muted2 }}>Manadjè bay</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: palette.ink }} className="num">{fmt(Number(gate.pendingDiscrepancy.manager_amount))} HTG</div>
            </div>
            <div style={{ flex: 1, minWidth: 110, background: palette.surfaceGrouped, borderRadius: radius.md, padding: 10 }}>
              <div style={{ fontSize: 10, color: palette.muted2 }}>Kesye di</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: palette.warning }} className="num">{fmt(Number(gate.pendingDiscrepancy.cashier_amount))} HTG</div>
            </div>
            <div style={{ flex: 1, minWidth: 110, background: palette.dangerBg, borderRadius: radius.md, padding: 10, border: `0.5px solid ${palette.dangerBd}` }}>
              <div style={{ fontSize: 10, color: palette.danger }}>Manke</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: palette.danger }} className="num">{fmt(Math.abs(Number(gate.pendingDiscrepancy.difference)))} HTG</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Button label="Konfime kesye" size="sm" variant="success" icon="checkmark-circle" onClick={supervisorApprove} />
            <Button label="Reasigne" size="sm" variant="ghost" icon="refresh" onClick={supervisorReassign} />
            <Button label="Rejte" size="sm" variant="danger" icon="close" onClick={supervisorReject} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <TextInput numeric value={reassignAmount} onChange={setReassignAmount} placeholder="Montan reasignasyon…" style={{ width: "100%" }} />
          </div>
        </Card>
      )}

      {isCashier && gate.hasPendingDiscrepancy && gate.activeShift && (
        <div style={{ ...gateStyles.banner, borderRadius: radius.md, border: `0.5px solid ${palette.dangerBd}`, background: palette.dangerBg }}>
          <Icon name="warning" size={16} color={palette.danger} />
          <div style={{ flex: 1, fontSize: 12, color: palette.danger }}>
            <b>Chanjman ap tann — Vant bloke.</b> Yon sipèvizè dwe rezoud tikit la anvan ou ka continue vann.
          </div>
        </div>
      )}

      <Card accent="gold" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: palette.successBg, border: `0.5px solid ${palette.successBd}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="cash" size={20} color={palette.success} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.7 }}>Total Vant Jodi a</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: palette.ink, letterSpacing: -0.5 }} className="num">{fmt(salesTotal)} <span style={{ fontSize: 15, color: palette.muted2 }}>HTG</span></div>
          </div>
          <div style={{ padding: "6px 12px", borderRadius: 999, background: palette.successBg }}>
            <span style={{ color: palette.success, fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>
              {isSupervisor ? (user.role === "owner" ? "Magazen" : "Sòm Ekip") : "Mwen"}
            </span>
          </div>
        </div>
        <div style={{ height: 0.5, background: palette.separator, marginTop: 14 }} />
        <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.7, marginTop: 10 }}>Repatisyon Peman</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {[{ k: "Kach", v: cashTotal, c: palette.success }, { k: "MonCash", v: moncashTotal, c: palette.blue }, { k: "NatCash", v: natcashTotal, c: palette.warningDot }, { k: "Kredi", v: creditTotal, c: palette.accentGold }, { k: "Kolekte Dèt", v: collectedTotal, c: palette.emerald }].map(x => {
            const pct = Math.max(0, Math.min(100, (x.v / (salesTotal || 1)) * 100));
            return (
              <div key={x.k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 9, height: 9, borderRadius: 5, background: x.c }} />
                <span style={{ fontSize: 12, color: palette.muted2, flex: 1 }}>{x.k}</span>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: palette.surfaceGrouped, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: 5, borderRadius: 3, background: x.c }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: x.c, minWidth: 84, textAlign: "right", ...monoStyle }} className="num">{fmt(x.v)} HTG</span>
              </div>
            );
          })}
        </div>
        <div style={{ height: 0.5, background: palette.separator, marginTop: 10 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: palette.muted }}>{user.role === "owner" ? "Total Magazen" : "Vant Total (Ekip ou)"}</span>
          <span style={{ color: palette.success, fontWeight: 800, fontSize: 19 }} className="num">{fmt(salesTotal)} HTG</span>
        </div>
      </Card>

      {(shift || myShiftToday) && (
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: palette.accentGoldSoft, border: `0.5px solid rgba(200,162,74,0.35)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="briefcase" size={17} color={palette.accentGold} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.7 }}>Kach Espere nan Kès</div>
              <div style={{ fontSize: 23, fontWeight: 900, color: palette.ink, letterSpacing: -0.3 }} className="num">{fmt(expectedCash)} <span style={{ fontSize: 13, color: palette.muted2 }}>HTG</span></div>
            </div>
          </div>
          <div style={{ height: 0.5, background: palette.separator, marginTop: 12 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {[{ lbl: "Ouvèti", v: myOpening, add: true }, { lbl: "Vant Kach", v: myCashTotal, add: true }, { lbl: "Kolekte Dèt", v: myCollectedTotal, add: true }, { lbl: "Retrè", v: myWithdrawalsTotal, add: false }].map(row => (
              <div key={row.lbl} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "Roboto, sans-serif", fontSize: 12, color: palette.muted }}>{row.lbl}</span>
                <span style={{ fontFamily: "Quicksand, sans-serif", fontWeight: 700, fontSize: 13, color: row.add ? palette.inkSoft : palette.danger }} className="num">{row.add ? "+" : "−"}{fmt(row.v)} HTG</span>
              </div>
            ))}
            <div style={{ fontSize: 9, color: palette.muted2, marginTop: 6 }} className="num">{myOpening} ouvèti + {myCashTotal} vant kach + {myCollectedTotal} kolekte − {myWithdrawalsTotal} retrè = kach espere</div>
            <div style={{ fontSize: 9, color: palette.muted3, marginTop: 4 }} className="num">Sous ouvèti: {myShiftToday ? `${myShiftToday.id} • ${String(myShiftToday.start_time ?? "?").slice(0, 16)} • ${myShiftToday.status} • kesye=${myShiftToday.cashier_id ?? "?"}` : "okenn chanjman jwenn"}</div>
          </div>
          <div style={{ height: 0.5, background: palette.separator, marginTop: 10 }} />
          {inventoryPickups.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 600 }}>Kach depans ({fmt(inventoryTotal)} HTG):</span>
              {inventoryPickups.map((w: any) => (
                <div key={w.id} style={{ display: "flex", justifyContent: "space-between", background: palette.warningBg, padding: 9, borderRadius: radius.md, border: `0.5px solid ${palette.warningBd}`, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }} className="num">Kach depans {fmt(Number(w.amount))} HTG — {w.reason}</div>
                    <div style={{ fontSize: 9, color: palette.muted2 }}>Depi kès {getUserById(w.taken_by ?? "")?.name ?? w.taken_by ?? "—"} • Anrejistre pa {getUserById(w.created_by)?.name ?? w.created_by}</div>
                  </div>
                  <span style={{ fontSize: 9, color: palette.success, fontWeight: 600 }}>✓ {w.validated_by ? "Valide" : "Pandan"}</span>
                </div>
              ))}
            </div>
          )}
          {withdrawals.length > 0 && <div style={{ fontSize: 10, color: palette.muted2, marginTop: 8 }} className="num">{withdrawals.length} retrè • Detay nan seksyon "Retrè Jounen" anba</div>}
        </Card>
      )}

      {actual !== null ? (
        <div style={{ marginTop: 0, display: "flex", justifyContent: "space-between", alignItems: "center", background: deficit === 0 ? palette.successBg : deficit! > 0 ? palette.dangerBg : palette.successBg, borderRadius: radius.lg, padding: 16, border: `0.5px solid ${deficit === 0 ? palette.successBd : palette.dangerBd}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: deficit === 0 ? palette.success : deficit! > 0 ? palette.danger : palette.success }}>
              {deficit === 0 ? "✓ Balanse" : deficit! > 0 ? `Defisi: ${fmt(deficit!)} HTG` : `✓ Sipè: ${fmt(Math.abs(deficit!))} HTG`}
            </div>
            <div style={{ fontSize: 11, color: deficit === 0 ? palette.success : palette.danger }} className="num">Espere {fmt(expectedCash)} HTG • Konte {fmt(actual)} HTG</div>
          </div>
          <Icon name={deficit === 0 ? "checkmark-circle" : "warning"} size={22} color={deficit === 0 ? palette.success : palette.danger} />
        </div>
      ) : shift ? (
        <div style={{ background: palette.ink2, borderRadius: radius.lg, padding: 18, textAlign: "center", border: `0.5px solid rgba(200,162,74,0.4)` }}>
          <div style={{ width: 50, height: 50, borderRadius: 17, background: palette.accentGoldSoft, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <Icon name="cash" size={23} color={palette.accentGold} />
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginTop: 10 }}>Konte Kach Ou Nan Kès La</div>
          <div style={{ color: palette.muted3, fontSize: 11, marginTop: 3 }}>Konte tout kòb ou genyen nan kès la, antre montan an. Dwe konpare ak {fmt(expectedCash)} HTG ki espere.</div>
          <Button label="Konte & Antre Montan Mwen" variant="success" icon="cash" onClick={() => setShowEnd(true)} style={{ marginTop: 12 }} />
        </div>
      ) : null}

      {isSupervisor && (
        <Card style={{ padding: 0, overflow: "hidden", marginTop: 4 }}>
          <div style={{ padding: "14px 14px 12px", background: palette.ink2, borderTop: `3px solid ${palette.accentGold}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="shield-checkmark" size={17} color={palette.accentGold} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: 0.2 }}>Kontwòl Rapò Kesye</div>
                <div style={{ color: palette.muted3, fontSize: 9.5, marginTop: 2 }}>
                  {pendingReports.length} pou revize · {waivedReports.length} apwobasyon · {openDebts.length} dèt ouvè
                </div>
              </div>
              <Button label="Rapèl" size="sm" variant="gold" icon="alert" onClick={sendDeficitReminder} style={{ flexShrink: 0 }} />
            </div>

            {/* Pill segmented control */}
            <div style={{ display: "flex", gap: 3, marginTop: 12, background: "rgba(255,255,255,0.07)", borderRadius: radius.sm, padding: 3 }}>
              {[
                { id: "pending", label: "Revizyon", icon: "clock", n: pendingReports.length },
                { id: "waived", label: "Apwobasyon", icon: "warning", n: waivedReports.length },
                { id: "debt", label: "Dèt", icon: "briefcase", n: openDebts.length },
                { id: "journal", label: "Jounal", icon: "list", n: reviews.length },
              ].map(t => {
                const on = revTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setRevTab(t.id as any)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "7px 4px", borderRadius: 9, border: "none", cursor: "pointer",
                      background: on ? palette.surface : "transparent",
                      boxShadow: on ? shadow.soft : "none", color: on ? palette.ink : "rgba(255,255,255,0.65)",
                      fontWeight: 700, fontSize: 10.5, letterSpacing: 0.2,
                    }}>
                    <Icon name={t.icon as any} size={13} color={on ? palette.ink : "rgba(255,255,255,0.55)"} />
                    {t.label}
                    {t.n > 0 && (
                      <span style={{ padding: "1px 7px", borderRadius: 999, background: on ? (t.id === "pending" ? palette.successBg : t.id === "waived" ? palette.warningBg : palette.surface2) : "rgba(255,255,255,0.14)", color: on ? (t.id === "pending" ? palette.success : t.id === "waived" ? palette.warning : palette.muted) : "#fff", fontSize: 9, fontWeight: 800 }}>{t.n}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* ── TAB: Revizyon (decide debt / waive / approve) ── */}
            {revTab === "pending" && (
              pendingReports.length === 0 ? (
                <div style={{ padding: 6 }}>
                  <EmptyState icon="checkmark-circle" title="Ryen pou revize kounye a."
                    body="Lè yon kesye fèmen chanjman li, rapò a vin isit la. Defisi ka vin Dèt ou Abandone kòm pèt (negli) — epi yon grad pi wo ka toujou revize desizyon an." />
                </div>
              ) : (
                pendingReports.map(r => {
                  const revAmt = Number(r.deficit ?? 0);
                  const cashierName = getUserById(r.user_id)?.name ?? r.user_id;
                  const cashierStore = getUserById(r.user_id)?.store ?? r.store_id ?? storeId;
                  const openCd = openDeficitOf(r);
                  const owe = Number(openCd?.deficit ?? revAmt);
                  const open = waiveFor === r.id;
                  return (
                    <div key={`rv-${r.id}`} style={{ background: palette.surface, border: `0.5px solid ${revAmt > 0 ? palette.warningBd : palette.hairline}`, borderRadius: radius.md, overflow: "hidden", boxShadow: shadow.soft }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px" }}>
                        <div style={{ width: 34, height: 34, borderRadius: 17, background: revAmt > 0 ? palette.warningBg : palette.successBg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: revAmt > 0 ? palette.warning : palette.success }}>
                          {initialsOf(cashierName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink }}>{cashierName} <span style={{ fontWeight: 600, color: palette.muted2, fontSize: 9.5 }}>KESYE · {(cashierStore ?? "").toUpperCase()}</span></div>
                          <div style={{ fontSize: 10, color: palette.muted2, marginTop: 1 }}>Rapò {r.report_date} · Fèmen {td(r.closed_at ?? r.submitted_at ?? r.created_at)}</div>
                        </div>
                        {revAmt > 0 ? (
                          <span className="num" style={{ padding: "3px 9px", borderRadius: 999, background: palette.warningBg, color: palette.warning, fontWeight: 800, fontSize: 10.5 }}>Defisi {fmt(revAmt)}</span>
                        ) : (
                          <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.successBg, color: palette.success, fontWeight: 800, fontSize: 10.5 }}>Balanse</span>
                        )}
                      </div>

                      {/* Expected / counted / deficit */}
                      <div style={{ display: "flex", borderTop: `0.5px solid ${palette.hairline}` }}>
                        <div style={{ flex: 1, padding: "9px 12px" }}>
                          <div style={{ fontSize: 9, color: palette.muted2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Atann</div>
                          <div className="num" style={{ fontSize: 12.5, fontWeight: 700, color: palette.ink, marginTop: 2 }}>{fmt(Number(r.expected_cash ?? 0))}</div>
                        </div>
                        <div style={{ width: 0.5, background: palette.hairline }} />
                        <div style={{ flex: 1, padding: "9px 12px" }}>
                          <div style={{ fontSize: 9, color: palette.muted2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>Konte</div>
                          <div className="num" style={{ fontSize: 12.5, fontWeight: 700, color: palette.ink, marginTop: 2 }}>{fmt(Number(r.actual_cash ?? 0))}</div>
                        </div>
                        <div style={{ width: 0.5, background: palette.hairline }} />
                        <div style={{ flex: 1, padding: "9px 12px", background: revAmt > 0 ? palette.warningBg : palette.surface2 }}>
                          <div style={{ fontSize: 9, color: revAmt > 0 ? palette.warning : palette.muted2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3 }}>Defisi</div>
                          <div className="num" style={{ fontSize: 12.5, fontWeight: 800, color: revAmt > 0 ? palette.warning : palette.success, marginTop: 2 }}>{revAmt > 0 ? `−${fmt(revAmt)}` : "0"}</div>
                        </div>
                      </div>

                      {/* Debt context */}
                      <div style={{ padding: "7px 12px", borderTop: `0.5px solid ${palette.hairline}`, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="briefcase" size={12} color={palette.muted2} />
                        <span style={{ fontSize: 10, color: palette.muted2 }}>
                          {openCd
                            ? <>Dèt ouvè kounye a: <b className="num" style={{ color: palette.warning }}>{fmt(owe)} HTG</b></>
                            : "Pa gen dèt ouvè pou jou sa a — dèt la pralouvri ak desizyon an."}
                        </span>
                      </div>

                      {revAmt > 0 ? (
                        open ? (
                          <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${palette.hairline}`, background: palette.accentGoldSoft }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: palette.inkSoft, marginBottom: 6 }}>
                              Abandone kòm pèt (neglij) — w ap ap tann apwobasyon yon grad pi wo.
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <TextInput value={waiveReason} onChange={setWaiveReason} placeholder="Rezon (opsyonèl)…" style={{ flex: 1 }} />
                              <Button label="Konfime" size="sm" variant="success" icon="checkmark" onClick={() => addReportReview(r, "waived_negligible", waiveReason.trim())} />
                              <Button label="Anile" size="sm" variant="soft" icon="close" onClick={() => setWaiveFor(null)} />
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 12px", borderTop: `0.5px solid ${palette.hairline}` }}>
                            <Button label={`Kreye Dèt — ${fmt(owe)} HTG`} size="sm" variant="gold" icon="briefcase" onClick={() => submitDecision(r, "debt")} />
                            <Button label="Abandone kòm pèt" size="sm" variant="soft" icon="close" onClick={() => submitDecision(r, "waived_negligible")} />
                          </div>
                        )
                      ) : (
                        <div style={{ padding: "10px 12px", borderTop: `0.5px solid ${palette.hairline}` }}>
                          <Button label="✓ Aprove Rapò" size="sm" variant="success" icon="checkmark-circle" onClick={() => submitDecision(r, "approved")} />
                        </div>
                      )}
                    </div>
                  );
                })
              )
            )}

            {/* ── TAB: Apwobasyon (higher rank confirms or revokes a waiver) ── */}
            {revTab === "waived" && (
              waivedReports.length === 0 ? (
                <div style={{ padding: 6 }}>
                  <EmptyState icon="shield-checkmark" title="Pa gen desizyon an atant."
                    body="Lè yon Manadjè/Admin abandone yon defisi kòm pèt, li vin isit la pou yon grad pi wo konfime (Apwouve) oswa ranvèse (Revoke → tounen dèt)." />
                </div>
              ) : (
                waivedReports.map(r => {
                  const rv = latestByReport.get(r.id);
                  const revAmt = Number(r.deficit ?? 0);
                  const cashierName = getUserById(r.user_id)?.name ?? r.user_id;
                  return (
                    <div key={`wa-${r.id}`} style={{ background: palette.surface, border: `0.5px solid ${palette.accentGold}55`, borderRadius: radius.md, overflow: "hidden", boxShadow: shadow.soft }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px" }}>
                        <div style={{ width: 34, height: 34, borderRadius: 17, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: palette.accentGold }}>
                          {initialsOf(cashierName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink }}>{cashierName} <span style={{ fontWeight: 600, color: palette.muted2, fontSize: 9.5 }}>KESYE</span></div>
                          <div style={{ fontSize: 10, color: palette.muted2, marginTop: 1 }}>Rapò {r.report_date}</div>
                        </div>
                        <span className="num" style={{ padding: "3px 9px", borderRadius: 999, background: palette.accentGoldSoft, color: palette.accentGold, fontWeight: 800, fontSize: 10.5 }}>Pèt {fmt(revAmt)} HTG</span>
                      </div>
                      <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${palette.hairline}`, background: palette.surface2 }}>
                        <div style={{ fontSize: 10, color: palette.muted }}>
                          Abandone pa <b style={{ color: palette.inkSoft }}>{getUserById(rv?.decided_by)?.name ?? rv?.decided_by ?? "?"}</b> ({rv?.decided_by_role?.toUpperCase()}) · <span className="num">{td(rv?.created_at)}</span>
                        </div>
                        {rv?.reason && <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>“{rv.reason}”</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 12px", borderTop: `0.5px solid ${palette.hairline}` }}>
                        <Button label="✓ Apwouve Pèt" size="sm" variant="success" icon="shield-checkmark" onClick={() => submitDecision(r, "approve_waive", rv?.reason, rv?.id)} />
                        <Button label="Revoke → Dèt" size="sm" variant="danger" icon="refresh" onClick={() => submitDecision(r, "revoke_to_debt", rv?.reason, rv?.id)} />
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* ── TAB: Dèt (open debt + period settlements) ── */}
            {revTab === "debt" && (() => {
              const opens = cashierDebts.filter((d: any) => d.status === "open");
              const byCashier: Record<string, any[]> = {};
              opens.forEach((d: any) => { (byCashier[d.cashier_id] ??= []).push(d); });
              const groups = Object.entries(byCashier).filter(([_, rows]: any) => rows.length > 0);
              return (
                <>
                  <div style={{ fontSize: 10, color: palette.muted2, lineHeight: 1.5 }}>Defisi ki poko peye — gwoup pa kesye. Kreye yon règleman pou yon peryòd (agrège) • FSM: open → partial → paid; waived fèmen. Lè règleman an rive "paid", dèt endividyèl yo pase "paid" otomatik.</div>
                  {groups.length === 0 ? (
                    <div style={{ padding: 4 }}>
                      <div style={{ fontSize: 12, color: palette.success, fontWeight: 700, display: "flex", gap: 6, alignItems: "center" }}><Icon name="checkmark-circle" size={14} color={palette.success} /> Pa gen defisi ouvè pou règleman.</div>
                    </div>
                  ) : groups.map(([cid, rows]: any) => {
                    const total = rows.reduce((s: number, x: any) => s + Number(x.deficit || 0), 0);
                    const dates = rows.map((x: any) => x.date).sort();
                    return (
                      <div key={cid} style={{ background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: radius.md, padding: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>
                            <span style={{ display: "inline-flex", width: 24, height: 24, borderRadius: 12, background: palette.surface, alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: palette.warning, marginRight: 6 }}>{initialsOf(getUserById(cid)?.name ?? cid)}</span>
                            {getUserById(cid)?.name ?? cid}
                          </div>
                          <div className="num" style={{ fontSize: 10, color: palette.muted2 }}>{rows.length} dèt · {fmt(total)} HTG · {dates[0]} → {dates[dates.length - 1]}</div>
                        </div>
                        <Button label="Kreye règleman" size="sm" variant="success" icon="checkmark" onClick={() => createSettlement(cid)} />
                      </div>
                    );
                  })}
                  {settlements.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, borderTop: `0.5px solid ${palette.separator}`, paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: palette.ink }}>Règleman yo ({settlements.length})</div>
                      {settlements.map((s: any) => (
                        <div key={s.id} style={{ background: s.status === "paid" ? palette.successBg : s.status === "waived" ? palette.surface2 : palette.surface, border: `0.5px solid ${s.status === "paid" ? palette.successBd : palette.hairline}`, borderRadius: radius.md, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700, fontSize: 12 }}>{getUserById(s.cashier_id)?.name ?? s.cashier_id}</span><span className="num" style={{ fontSize: 11, fontWeight: 700, color: s.status === "paid" ? palette.success : s.status === "partial" ? palette.warningDot : palette.muted }}>{s.status} · {fmt(s.paid)}/{fmt(s.total)} HTG</span></div>
                          <div style={{ fontSize: 10, color: palette.muted2 }}>{s.period_start} → {s.period_end} · {JSON.parse(s.deficit_ids || "[]").length} dèt · pa {getUserById(s.created_by)?.name ?? s.created_by}</div>
                          {s.status !== "paid" && s.status !== "waived" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              <Button label={`Peye rès ${fmt(Number(s.total) - Number(s.paid))}`} size="sm" variant="success" icon="cash" onClick={() => paySettlement(s.id, Number(s.total) - Number(s.paid))} />
                              <Button label="Peye 50%" size="sm" variant="soft" icon="cash" onClick={() => paySettlement(s.id, Math.ceil(Number(s.total) / 2))} />
                              <Button label="Abandone" size="sm" variant="soft" icon="close" onClick={() => waiveSettlement(s.id)} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* ── TAB: Jounal (append-only audit trail) ── */}
            {revTab === "journal" && (() => {
              const trail = [...reviews].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
              const dets = reviews.filter((v: any) => v.decision === "debt" || v.decision === "revoke_to_debt").length;
              const losses = reviews.filter((v: any) => v.decision === "approve_waive").length;
              const waives = reviews.filter((v: any) => v.decision === "waived_negligible").length;
              return (
                <>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.surface2, color: palette.muted, fontSize: 10, fontWeight: 700 }}>{reviews.length} desizyon total</span>
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.warningBg, color: palette.warning, fontSize: 10, fontWeight: 700 }}>{dets} dèt</span>
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.accentGoldSoft, color: palette.accentGold, fontSize: 10, fontWeight: 700 }}>{waives} pèt neglij</span>
                    <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.successBg, color: palette.success, fontSize: 10, fontWeight: 700 }}>{losses} pèt konfime</span>
                  </div>
                  {trail.length === 0 ? (
                    <div style={{ padding: 6 }}>
                      <EmptyState icon="list" title="Jounal la vid."
                        body="Chak desizyon sou yon rapò (dèt / pèt / apwobasyon / revoke) vin anrejistre isit la — janntan efase, pou trasabilite konplè." />
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {trail.map((v: any, i: number) => {
                        const meta = DECISION_INFO[v.decision] ?? { label: v.decision, icon: "file-text", color: palette.muted2 };
                        const act = getUserById(v.decided_by);
                        return (
                          <div key={v.id} style={{ display: "flex", gap: 10, padding: "9px 2px", borderTop: i === 0 ? "none" : `0.5px solid ${palette.hairline}` }}>
                            <div style={{ width: 28, height: 28, borderRadius: 9, background: `${meta.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Icon name={meta.icon} size={13} color={meta.color} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: palette.ink }}>{meta.label}</span>
                                <span className="num" style={{ fontSize: 11, fontWeight: 800, color: meta.color, flexShrink: 0 }}>{Number(v.deficit) > 0 ? `${fmt(Number(v.deficit))} HTG` : "—"}</span>
                              </div>
                              <div style={{ fontSize: 10, color: palette.muted2, marginTop: 1 }}>
                                {getUserById(v.cashier_id)?.name ?? v.cashier_id} · {v.report_date}
                              </div>
                              <div style={{ fontSize: 9.5, color: palette.muted3, marginTop: 1 }}>
                                {act?.name ?? act?.id ?? "?"} ({v.decided_by_role}) · <span className="num">{td(v.created_at)}</span>
                                {v.reason && <span> · “{v.reason}”</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </Card>
      )}

      {isSupervisor && (() => {
        const ledger = [...withdrawals, ...inventoryPickups]
          .filter((m: any) => !m.created_at || String(m.created_at).slice(0, 10) === today)
          .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        const ledgerTotal = ledger.reduce((s: number, m: any) => s + Number(m.amount), 0);
        const done = ledger.filter((m: any) => m.validated_by).length;
        return (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 13, borderBottom: `0.5px solid ${palette.separator}`, background: palette.ink2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="briefcase" size={16} color={palette.accentGold} />
                </div>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Retrè Jounen</span>
              </div>
              <div style={{ color: palette.muted3, fontSize: 10, marginTop: 4 }} className="num">{ledger.length} mouvman • Total −{fmt(ledgerTotal)} HTG • {done}/{ledger.length} valide</div>
            </div>
            {ledger.length === 0 ? (
              <div style={{ padding: 14 }}><EmptyState icon="cash" title="Pa gen retrè oswa kach depans jodi a." /></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
                {ledger.map((m: any) => {
                  const isInv = m.type === "inventory";
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", background: isInv ? palette.warningBg : palette.surface2, padding: 10, borderRadius: radius.md, border: `0.5px solid ${isInv ? palette.warningBd : palette.hairline}`, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }} className="num">{isInv ? "Kach depans" : "Retrè"} −{fmt(Number(m.amount))} HTG</div>
                        <div style={{ fontSize: 9, color: palette.muted2, marginTop: 2 }}>{m.reason}</div>
                        <div style={{ fontSize: 9, color: palette.muted2, marginTop: 2 }}>Anrejistre pa {getUserById(m.created_by)?.name ?? m.created_by}{m.taken_by ? ` • Pran pa ${getUserById(m.taken_by)?.name ?? m.taken_by}` : ""}</div>
                        <div style={{ fontSize: 9, color: palette.muted3, marginTop: 2 }}>{td(m.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: 8, alignItems: "flex-end" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: m.validated_by ? palette.success : palette.warning }}>{m.validated_by ? "✓ Valide" : "⏳ Pandan"}</span>
                        {!m.validated_by && !isInv && (
                          <Button label="Konfime" size="sm" variant="gold" icon="checkmark" onClick={() => { setPendingValidateId(m.id); setManagerPassword(""); }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })()}

      {pendingValidateId && (() => {
        const w = withdrawals.find((x: any) => x.id === pendingValidateId);
        const takenUser = getUserById(w?.taken_by ?? "");
        return (
          <Card style={{ padding: 11, background: palette.warningBg, border: `0.5px solid ${palette.warningBd}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.warning }} className="num">Konfime retrè {fmt(Number(w?.amount ?? 0))} HTG — se sèlman {takenUser?.name ?? w?.taken_by} ki ka valide ak kòd li.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <TextInput numeric value={managerPassword} onChange={setManagerPassword} placeholder="Kòd sekrè" style={{ flex: 1 }} />
              <Button label="Valide" variant="success" icon="checkmark" onClick={validateWithdrawal} />
              <Button label="Anile" variant="soft" icon="close" onClick={() => setPendingValidateId(null)} />
            </div>
          </Card>
        );
      })()}

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 13, borderBottom: `0.5px solid ${palette.separator}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="box" size={16} color={palette.ink} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>Pwodwi Vann yo</span>
          <span className="num" style={{ padding: "2px 8px", borderRadius: 999, background: palette.surface2, color: palette.muted2, fontSize: 10 }}>{productsSold.length}</span>
          <Button label="Wechaje" size="sm" variant="soft" icon="refresh" onClick={() => { load(); gate.bump(); }} style={{ marginLeft: "auto" }} />
        </div>
        {productsSold.length === 0 && <EmptyState icon="box" title="Pa gen pwodwi vann" body="Vant yo pral parèt isit la." />}
        {productsSold.map(p => (
          <div key={p.name} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: `0.5px solid ${palette.separatorSoft}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{p.name}</div>
              <div style={{ color: palette.muted2, fontSize: 10 }} className="num">Vann: {p.qty}</div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 12 }} className="num">{fmt(p.total)} HTG</span>
          </div>
        ))}
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 13, borderBottom: `0.5px solid ${palette.separator}` }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: palette.successBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="checkmark-circle" size={16} color={palette.success} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>Vant Jodi a</span>
          <span className="num" style={{ padding: "2px 8px", borderRadius: 999, background: palette.surface2, color: palette.muted2, fontSize: 10 }}>{sales.length}</span>
        </div>
        {sales.length === 0 && <EmptyState icon="receipt" title="Pa gen vant jodi a" />}
        {sales.map(s => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: `0.5px solid ${palette.separatorSoft}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }} className="num">{s.sale_number}</div>
              <div style={{ fontSize: 10, color: palette.muted2 }}>{td(s.created_at)} • {s.payment_method}{s.seller_role ? ` • ${s.seller_role}` : ""}</div>
            </div>
            <span style={{ fontWeight: 700, color: s.payment_method === "cash" ? palette.success : palette.accentGold }} className="num">{fmt(Number(s.total))} HTG</span>
          </div>
        ))}
      </Card>

      {showEnd && (
        <Overlay onClose={() => setShowEnd(false)} width={600}>
          <ModalHeader title="Fèmen Chanjman — Konte Kach" sub="Konbyen kach ou genyen kounye a?" onClose={() => setShowEnd(false)} />
          <div style={{ background: palette.surface2, borderRadius: radius.md, padding: 11, border: `0.5px solid ${palette.hairline}` }}>
            <div style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>KACH ESPERE</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: palette.accentGold }} className="num">{fmt(expectedCash)} HTG</div>
            <div style={{ fontSize: 9, color: palette.muted2 }} className="num">{fmt(myOpening)} ouvèti + {fmt(myCashTotal)} vant kach + {fmt(myCollectedTotal)} kolekte − {fmt(myWithdrawalsTotal)} retrè = kach espere</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <TextInput numeric value={actualCash} onChange={setActualCash} placeholder="Antre kach ou konte" autoFocus style={{ fontWeight: 700, fontSize: 18, textAlign: "center", border: `0.5px solid ${palette.success}` }} />
          </div>
          {actualCash ? (
            (() => {
              const v = parseFloat(actualCash);
              const isBal = v === expectedCash;
              const isDef = v < expectedCash;
              const col = isBal ? palette.success : isDef ? palette.danger : palette.blue;
              const bg = isBal ? palette.successBg : isDef ? palette.dangerBg : palette.blueBg;
              const bd = isBal ? palette.successBd : isDef ? palette.dangerBd : palette.blueBd;
              return (
                <div style={{ marginTop: 8, padding: 10, borderRadius: radius.md, background: bg, border: `0.5px solid ${bd}`, textAlign: "center", fontWeight: 700, color: col }}>
                  {isBal ? "✓ Balanse — pa gen defisi" : isDef ? `⚠️ Defisi: ${fmt(expectedCash - v)} HTG` : `Sipè: ${fmt(v - expectedCash)} HTG`}
                </div>
              );
            })()
          ) : null}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button label="Anile" variant="soft" icon="close" block onClick={() => setShowEnd(false)} />
            <Button label="Fèmen & Voye Rapò" variant="gold" icon="log-out" block onClick={completeCount} />
          </div>
        </Overlay>
      )}

      {showComplaint && isCashier && (
        <Overlay onClose={() => setShowComplaint(false)} width={520}>
          <ModalHeader title="Konplent Chanjman" sub="Kes la pa dakò ak ouvèti Pwogram nan." onClose={() => setShowComplaint(false)} />
          <div style={{ background: palette.warningBg, borderRadius: radius.md, padding: 11, border: `0.5px solid ${palette.warningBd}` }}>
            <div style={{ fontSize: 11, color: palette.muted2 }}>Pwogram nan bay:</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: palette.ink }} className="num">10000.00 HTG</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Kantite w konte" hint="Vant la rete bloke jiskaske yon sipèvizè rezoud tikit la.">
              <TextInput numeric value={complaintAmount} onChange={setComplaintAmount} placeholder="Antre montan ou konte" />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button label="Anile" variant="soft" icon="close" block onClick={() => { setShowComplaint(false); setComplaintAmount(""); }} />
            <Button label="Voye plent" variant="danger" icon="alert" block onClick={onFileComplaint} />
          </div>
        </Overlay>
      )}
    </div>
  );
}