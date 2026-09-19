import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb } from "../lib/db";
import { fmt, monoStyle } from "../lib/format";
import { palette, radius, shadow } from "../lib/theme";
import { useAuthStore } from "../lib/authStore";
import { getUserById } from "../lib/users";
import { PROGRAM_OPENING_VAL } from "../lib/shift";
import { findSaleDetail, changeSalePaymentMethod, salePaymentLabel, formatMoney, type SaleDetail } from "../lib/salesCorrection";
import { receiptToText, buildReceiptHtml, copyLabel, type ReceiptData } from "../lib/receipts";
import type { StoreItem } from "../lib/storeCodes";
import { notifyLocal } from "../lib/notifications";
import { salesEvents } from "../lib/salesEvents";
import { useResponsive, contentW } from "../lib/responsive";
import { Button, Card, Confirm, EmptyState, Field, ModalHeader, Overlay, SearchBar, Select, TextInput, toast } from "../components/ui";
import { Icon } from "../components/Icon";

const ACTIVE_STORE_KEY = "active_store_id";
const ACTIVE_CASHIER_PREFIX = "active_cashier_";
const PROGRAM_OPENING = PROGRAM_OPENING_VAL;

type Cashier = { id: string; name: string; phone?: string; active: boolean };

function num(v: any) { return Number(v ?? 0) || 0; }
function isToday(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}
function initials(n: string) {
  return (n || "?")
    .split(" ")
    .map(p => p?.[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function Money({ v }: { v: number }) {
  return <span className="num" style={monoStyle}>{fmt(v)} HTG</span>;
}

function toStoreItem(r: any): StoreItem {
  return {
    id: r.id,
    name: r.name ?? r.id,
    location: r.location ?? "",
    code: r.code ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    disabled: !!r.disabled,
    breachFlagged: !!r.breach_flagged,
    breachedAt: r.breached_at ?? undefined,
    revokedBy: r.revoked_by ?? undefined,
  };
}

async function metaGet(db: any, key: string): Promise<string | undefined> {
  try { const rows = (await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", [key])) as any[]; return rows?.[0]?.value; } catch { return undefined; }
}
async function metaSet(db: any, key: string, value: string) {
  await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", [key, value]);
}

export function StoresPage() {
  const { user, cached } = useAuthStore();
  const nav = useNavigate();
  const { isTablet, width } = useResponsive();

  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const isOwner = role === "owner";
  const isSupervisor = role === "owner" || role === "admin" || role === "manager";
  const canManageStore = isOwner || role === "admin";

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storeId, setStoreId] = useState("demo-store-id");
  const [ready, setReady] = useState(false);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [activeCashier, setActiveCashier] = useState<Cashier | null>(null);
  const [stats, setStats] = useState({ cashToday: 0, withdrawals: 0, deposits: 0 });
  const [shiftInfo, setShiftInfo] = useState<any | null>(null);

  const activeStore = stores.find(s => s.id === storeId) ?? stores[0];
  const blocked = !!activeStore?.disabled;

  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eLoc, setELoc] = useState("");

  const [verifyTarget, setVerifyTarget] = useState<StoreItem | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [codeErr, setCodeErr] = useState("");

  const [regOpen, setRegOpen] = useState(false);
  const [regView, setRegView] = useState<"ask" | "disagree" | "pending" | "setup" | "supervisor">("ask");
  const [regProgram, setRegProgram] = useState(String(PROGRAM_OPENING));
  const [regStated, setRegStated] = useState("");
  const [lockedCashiers, setLockedCashiers] = useState<string[]>([]);
  const [pendingChecks, setPendingChecks] = useState<any[]>([]);
  const [setupCashier, setSetupCashier] = useState("");
  const [setupLocked, setSetupLocked] = useState(false);
  const [activeCheckId, setActiveCheckId] = useState<string | null>(null);
  const [correctAmount, setCorrectAmount] = useState("");
  const [superUser, setSuperUser] = useState("");
  const [superSecret, setSuperSecret] = useState("");
  const [delegatedSupervisor, setDelegatedSupervisor] = useState<any | null>(null);
  const [supervisorEntry, setSupervisorEntry] = useState<"pending" | "disagree" | null>(null);

  const [cashAction, setCashAction] = useState<"" | "env" | "ret">("");
  const [cmCashier, setCmCashier] = useState("");
  const [cmAmt, setCmAmt] = useState("");
  const [cmComment, setCmComment] = useState("");
  const [cmSecret, setCmSecret] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [aName, setAName] = useState("");
  const [aPhone, setAPhone] = useState("");
  const [aAddr, setAAddr] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Cashier | null>(null);

  const [optOpen, setOptOpen] = useState(false);
  const [saleQuery, setSaleQuery] = useState("");
  const [saleError, setSaleError] = useState("");
  const [saleDetail, setSaleDetail] = useState<SaleDetail | null>(null);
  const [pendingChange, setPendingChange] = useState<"cash" | "credit" | null>(null);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const effectiveIsSupervisor = isSupervisor || !!delegatedSupervisor;
  const effectiveSupervisor = delegatedSupervisor ?? (isSupervisor ? user : null);
  const supervisorPool = getUserById ? [getUserById("owner-1"), getUserById("admin-1"), getUserById("manager-1")].filter(Boolean) : [];

  const loadChecks = useCallback(async () => {
    try {
      const db = await getDb();
      const all = (await db.getAllAsync("SELECT * FROM cash_register_checks")) as any[];
      const sid = storeId;
      setPendingChecks(all.filter((c: any) => (c.store_id ?? sid) === sid && c.status === "pending"));
      setLockedCashiers(all.filter((c: any) => (c.store_id ?? sid) === sid && c.action === "set_program").map((c: any) => c.cashier_id));
    } catch {}
  }, [storeId]);

  const loadCashierProgram = useCallback(async (cashierId?: string) => {
    if (!cashierId) { setRegProgram(String(PROGRAM_OPENING)); setSetupLocked(false); return; }
    try {
      const db = await getDb();
      const all = (await db.getAllAsync("SELECT * FROM cash_register_checks")) as any[];
      const program = all
        .filter((c: any) => (c.store_id ?? storeId) === storeId && c.action === "set_program" && c.cashier_id === cashierId)
        .sort((a: any, b: any) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
      setSetupLocked(!!program);
      setRegProgram(program && program.correct_amount != null ? String(program.correct_amount) : String(PROGRAM_OPENING));
    } catch { setRegProgram(String(PROGRAM_OPENING)); setSetupLocked(false); }
  }, [storeId]);

  const loadAll = useCallback(async () => {
    try {
      const db = await getDb();
      const st = (await db.getAllAsync("SELECT * FROM stores")) as any[];
      const mapped = (st ?? []).map(toStoreItem);
      setStores(mapped);

      let id = mappingActive(mapped, cached?.store ?? "Petyonvil");
      const pref = await metaGet(db, ACTIVE_STORE_KEY);
      if (pref && mapped.some(s => s.id === pref)) id = pref;
      if (mapped.length && (mapped.some(s => s.id === "demo-store-id")) && !id) id = "demo-store-id";
      if (!id && mapped.length) id = mapped[0].id;
      setStoreId(id || mapped[0]?.id || "demo-store-id");

      const emps = (await db.getAllAsync("SELECT * FROM employees")) as any[];
      const roster: Cashier[] = (emps ?? [])
        .filter((e: any) => String(e.role).toLowerCase() === "cashier")
        .map((e: any) => ({ id: e.id, name: e.full_name ?? e.id, phone: e.phone ?? "", active: !!e.is_active }));
      setCashiers(roster);

      const cur = await metaGet(db, `${ACTIVE_CASHIER_PREFIX}${id}`);
      const match = roster.find(c => c.id === cur && c.active) ?? roster.find(c => c.active) ?? roster[0] ?? null;
      setActiveCashier(match ?? null);

      const sales = (await db.getAllAsync("SELECT * FROM sales")) as any[];
      const movs = (await db.getAllAsync("SELECT * FROM cash_movements")) as any[];
      const cashToday = (sales ?? []).filter((s: any) => isToday(s.created_at) && String(s.payment_method ?? "cash").toLowerCase() === "cash").reduce((a: number, s: any) => a + num(s.total), 0);
      const withdrawals = (movs ?? []).filter((m: any) => isToday(m.created_at) && (m.type === "withdrawal" || m.type === "inventory")).reduce((a: number, m: any) => a + num(m.amount), 0);
      const deposits = (movs ?? []).filter((m: any) => isToday(m.created_at) && m.type === "deposit").reduce((a: number, m: any) => a + num(m.amount), 0);
      setStats({ cashToday, withdrawals, deposits });

      const shifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      setShiftInfo((shifts ?? []).find((s: any) => String(s.cashier_id) === user?.id && (s.status === "open" || s.status === "pending")) ?? null);

      await loadChecks();
    } catch {}
    setReady(true);
  }, [user?.id, cached?.store, loadChecks]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(loadAll); } catch {} })();
    return () => { if (unsub) unsub(); };
  }, [loadAll]);

  function mappingActive(stores: StoreItem[], storeName: string): string {
    const n = String(storeName || "").trim().toLowerCase();
    if (!n) return "";
    const found = stores.find(s => s.location?.trim().toLowerCase() === n || s.name?.trim().toLowerCase() === n);
    return found ? found.id : "";
  }

  async function selectStore(id: string) {
    const db = await getDb();
    await metaSet(db, ACTIVE_STORE_KEY, id);
    setStoreId(id);
    const cur = await metaGet(db, `${ACTIVE_CASHIER_PREFIX}${id}`);
    setActiveCashier(cashiers.find(c => c.id === cur && c.active) ?? cashiers.find(c => c.active) ?? null);
    await loadAll();
    toast("Magazen chanje ✓", stores.find(s => s.id === id)?.name);
  }

  function confirmSwitch() {
    if (!verifyTarget) return;
    if (verifyTarget.disabled) {
      setVerifyTarget(null);
      toast("Magazen bloke", "Kontakte Konsole Sipò pou rektifye.", "warn");
      return;
    }
    if (verifyCode.trim().toUpperCase() !== verifyTarget.code.toUpperCase()) {
      setCodeErr("Kòd sekrè pa kòrèk. Eseye ankò.");
      return;
    }
    selectStore(verifyTarget.id);
    setVerifyTarget(null); setVerifyCode(""); setCodeErr("");
  }

  async function saveEdit() {
    if (!activeStore) return;
    if (!eName.trim() || !eLoc.trim()) { toast("Antre non & lokal", "", "warn"); return; }
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync("UPDATE stores SET name = ?, location = ? WHERE id = ?", [eName.trim(), eLoc.trim(), activeStore.id]);
    await db.runAsync(
      "INSERT OR REPLACE INTO stores (id,name,location,code,currency,created_at,updated_at,disabled,breach_flagged,breached_at,revoked_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [activeStore.id, eName.trim(), eLoc.trim(), activeStore.code, "HTG", activeStore.createdAt, now, activeStore.disabled ? 1 : 0, activeStore.breachFlagged ? 1 : 0, activeStore.breachedAt ?? null, activeStore.revokedBy ?? null]
    );
    setStores(prev => prev.map(s => s.id === activeStore.id ? { ...s, name: eName.trim(), location: eLoc.trim() } : s));
    setEditOpen(false);
    notifyLocal("Magazen ajou", `${eName.trim()} — ${eLoc.trim()}`);
    toast("Magazen ajou ✓");
  }

  function openEdit() {
    if (!activeStore) return;
    setEName(activeStore.name);
    setELoc(activeStore.location);
    setEditOpen(true);
  }

  async function loadRoster() {
    try {
      const db = await getDb();
      const emps = (await db.getAllAsync("SELECT * FROM employees")) as any[];
      const roster: Cashier[] = (emps ?? [])
        .filter((e: any) => String(e.role).toLowerCase() === "cashier")
        .map((e: any) => ({ id: e.id, name: e.full_name ?? e.id, phone: e.phone ?? "", active: !!e.is_active }));
      setCashiers(roster);
      setActiveCashier(active => (roster.find(c => c.id === active?.id && c.active) ?? roster.find(c => c.active) ?? roster[0] ?? null));
    } catch {}
  }

  async function selectActiveCashier(id: string) {
    const db = await getDb();
    await metaSet(db, `${ACTIVE_CASHIER_PREFIX}${storeId}`, id);
    const c = cashiers.find(c => c.id === id) ?? null;
    setActiveCashier(c);
    notifyLocal("Kesye aktif", c ? `${c.name} se kesye aktif la.` : "Kesye chanje.");
    toast(c ? `Kesye aktif: ${c.name} ✓` : "Kesye chanje ✓");
  }

  async function addCashier() {
    if (!aName.trim()) { toast("Non obligatwa", "", "warn"); return; }
    const id = `emp-${Date.now()}`;
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO employees (id, store_id, full_name, role, phone, salary, address, is_active, online_status) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, storeId, aName.trim(), "cashier", aPhone.trim(), 0, aAddr.trim(), 1, 0]
    );
    setAddOpen(false); setAName(""); setAPhone(""); setAAddr("");
    notifyLocal("Kasye ajoute", aName.trim());
    toast("Kasye ajoute ✓");
    await loadRoster();
  }

  async function confirmRemoveCashier() {
    if (!removeTarget) return;
    const db = await getDb();
    await db.runAsync("UPDATE employees SET is_active = 0 WHERE id = ?", [removeTarget.id]);
    setRemoveTarget(null);
    notifyLocal("Kasye retire", removeTarget.name);
    toast("Kasye retire ✓");
    await loadRoster();
  }

  async function openRegister() {
    setRegStated(""); setCorrectAmount(""); setActiveCheckId(null);
    await loadChecks();
    if (isSupervisor) {
      setRegView("setup");
      setSetupCashier("");
      await loadCashierProgram(undefined);
    } else if (shiftInfo?.status === "pending") {
      setRegView("pending");
      await loadCashierProgram(user?.id);
    } else {
      setRegView("ask");
      await loadCashierProgram(user?.id);
    }
    setRegOpen(true);
  }

  async function agreeRegister() {
    if (!user) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    const program = parseFloat(regProgram) || PROGRAM_OPENING;
    try {
      const db = await getDb();
      const shifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      const existing = shifts.find((s: any) => s.status === "open" && String(s.cashier_id) === user.id);
      if (existing) {
        setRegOpen(false);
        toast("Chanjman kòmanse ✓", `Ou gen yon chanjman ouvè a ${fmt(existing.opening_balance)} HTG.`);
        return;
      }
      const ts = new Date().toISOString();
      const shiftId = `shift-${Date.now()}`;
      await db.runAsync(
        "INSERT INTO shifts (id, store_id, cashier_id, manager_id, opening_balance, status, start_time, end_time, cashier_confirmed, manager_confirmed, supervisor_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [shiftId, storeId, user.id, "manager-1", program, "open", ts, null, 1, 1, 1]
      );
      await db.runAsync(
        "INSERT INTO cash_register_checks (id, store_id, report_id, cashier_id, check_date, stated_amount, program_amount, status, action, set_by, set_by_role, is_default, approved_by, correct_amount, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [`reg-${Date.now()}`, storeId, "", user.id, ts.slice(0,10), program, program, "approved", "self_match", "owner-1", "owner", 1, null, null, ts]
      );
      const targets = supervisorsFor(activeStore?.name);
      for (const t of targets) {
        if (t.id === user.id) continue;
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${t.id}-${Math.random().toString(36).slice(2, 5)}`, t.id, "shift_opening", shiftId, `${user.name} kòmanse chanjman ak ${fmt(program)} HTG.`, "pending", ts]);
      }
      notifyLocal("Chanjman kòmanse", `Kes la dakò a ${fmt(program)} HTG. Ou ka kòmanse vann kounye a.`);
      toast("Dakò ✓", `Kes la konfime pou ${fmt(program)} HTG. Chanjman kòmanse.`);
      setRegStated(""); setRegView("ask"); setRegOpen(false);
      await loadChecks();
      await loadAll();
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  function disagreeRegister() { setRegView("disagree"); }

  async function fileRegisterComplaint() {
    if (!user) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    const stated = parseFloat(regStated);
    if (isNaN(stated) || stated < 0) { toast("Antre montan", "Antre montan kach ou reyèlman konte nan kes la", "warn"); return; }
    const program = parseFloat(regProgram) || PROGRAM_OPENING;
    try {
      const db = await getDb();
      const ts = new Date().toISOString();
      await db.runAsync(
        "INSERT INTO cash_register_checks (id, store_id, report_id, cashier_id, check_date, stated_amount, program_amount, status, action, set_by, set_by_role, is_default, approved_by, correct_amount, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [`reg-${Date.now()}`, storeId, "", user.id, ts.slice(0,10), stated, program, "pending", "complaint", "owner-1", "owner", 1, null, null, ts]
      );
      await db.runAsync(
        "INSERT INTO shifts (id, store_id, cashier_id, manager_id, opening_balance, status, start_time, end_time, cashier_confirmed, manager_confirmed, supervisor_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [`shift-${Date.now()}`, storeId, user.id, "manager-1", stated, "pending", ts, null, 0, 0, 0]
      );
      const targets = supervisorsFor(activeStore?.name);
      for (const t of targets) {
        if (t.id === user.id) continue;
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${t.id}-${Math.random().toString(36).slice(2, 5)}`, t.id, "reg_complaint", `reg-${Date.now()}`,
            `${user.name} pa dakò ak kes la: li konte ${fmt(stated)} HTG olye de ${fmt(program)} HTG. Chanjman an sispann (atant yo). Yon sipèvizè dwe revize.`, "pending", ts]);
      }
      notifyLocal("Plent Kach", `${user.name} pa dakò ak kes la (konte ${fmt(stated)} HTG, atann ${fmt(program)} HTG)`);
      toast("Plent voye", `Chanjman ou make "ap tann" — yon sipèvizè dwe konfime.`);
      setRegStated(""); setRegView("ask"); setRegOpen(false);
      await loadChecks();
      await loadAll();
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  function supervisorsFor(storeName?: string): any[] {
    const list = [getUserById("owner-1"), getUserById("admin-1"), getUserById("manager-1")].filter(Boolean) as any[];
    return list;
  }

  async function verifySupervisorAndEnterSetup() {
    const pick = [getUserById("owner-1"), getUserById("admin-1"), getUserById("manager-1")].find(u => u?.id === superUser);
    if (!pick) { toast("Chwazi sipèvizè", "Chwazi yon sipèvizè (Owner/Admin/Manadjè)", "warn"); return; }
    if (String(superSecret).trim() !== String(pick.secret).trim()) { toast("Kòd pa bon", "Kòd sekrè a pa kòrèk.", "error"); return; }
    setDelegatedSupervisor(pick);
    setSuperSecret("");
    setRegView("setup");
    await loadCashierProgram(undefined);
  }

  async function resolveCheck(checkId: string, action: "approve" | "disagree" | "set") {
    let actingUser: any = null;
    if (delegatedSupervisor) {
      actingUser = delegatedSupervisor;
    } else if (regView === "supervisor") {
      const pick = [getUserById("owner-1"), getUserById("admin-1"), getUserById("manager-1")].find(u => u?.id === superUser);
      if (!pick) { toast("Chwazi sipèvizè", "Chwazi yon sipèvizè (Owner/Admin/Manadjè)", "warn"); return; }
      if (String(superSecret).trim() !== String(pick.secret).trim()) { toast("Kòd pa bon", "Kòd sekrè a pa kòrèk.", "error"); return; }
      actingUser = pick;
    } else if (isSupervisor && user) {
      actingUser = user;
    } else {
      toast("Pa otorize", "Sèl yon sipèvizè (Owner/Admin/Manadjè) ka aprouve", "warn");
      return;
    }

    const check = pendingChecks.find(c => c.id === checkId);
    if (!check) return toast("Pa jwenn plent", "", "warn");

    let correctAmountValue: number | null = null;
    if (action === "set") {
      correctAmountValue = parseFloat(correctAmount);
      if (isNaN(correctAmountValue) || correctAmountValue < 0) { toast("Antre montan", "Antre montan kòrèk la", "warn"); return; }
    }

    try {
      const db = await getDb();
      const status = action === "disagree" ? "rejected" : "approved";
      await db.runAsync("UPDATE cash_register_checks SET status = ? WHERE id = ?", [status, checkId]);
      await db.runAsync("UPDATE cash_register_checks SET action = ? WHERE id = ?", [action, checkId]);
      await db.runAsync("UPDATE cash_register_checks SET approved_by = ? WHERE id = ?", [actingUser.id, checkId]);
      await db.runAsync("UPDATE cash_register_checks SET correct_amount = ? WHERE id = ?", [correctAmountValue, checkId]);

      const dayAmount = action === "set" ? (correctAmountValue ?? 0) : (parseFloat(check.stated_amount) || parseFloat(check.program_amount) || 0);
      let openedShiftId = "";
      const cashierId = check.cashier_id;
      const allShifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      const pendingShift = allShifts.find((s: any) => String(s.cashier_id) === cashierId && s.status === "pending");

      if (action === "disagree") {
        if (pendingShift) {
          openedShiftId = pendingShift.id;
          await db.runAsync("UPDATE shifts SET status = ?, end_time = ? WHERE id = ?", ["rejected", new Date().toISOString(), pendingShift.id]);
        }
      } else if (action === "approve" || action === "set") {
        const ts = new Date().toISOString();
        await db.runAsync(
          "INSERT INTO cash_register_checks (id, store_id, report_id, cashier_id, check_date, stated_amount, program_amount, status, action, set_by, set_by_role, is_default, approved_by, correct_amount, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [`reg-set-${Date.now()}`, storeId, "", cashierId, ts.slice(0,10), dayAmount, dayAmount, "approved", "set_program", actingUser.id, actingUser.role ?? "manager", 0, actingUser.id, dayAmount, ts]
        );
        if (pendingShift) {
          openedShiftId = pendingShift.id;
          await db.runAsync("UPDATE shifts SET status = ?, opening_balance = ?, cashier_confirmed = ?, manager_confirmed = ?, supervisor_confirmed = ?, start_time = ? WHERE id = ?",
            ["open", dayAmount, 1, 1, 1, pendingShift.start_time ?? ts, pendingShift.id]);
        } else {
          openedShiftId = `shift-${Date.now()}`;
          await db.runAsync("INSERT INTO shifts (id, store_id, cashier_id, manager_id, opening_balance, status, start_time, end_time, cashier_confirmed, manager_confirmed, supervisor_confirmed) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [openedShiftId, storeId, cashierId, "manager-1", dayAmount, "open", ts, null, 1, 1, 1]);
        }
      }

      const msg = action === "disagree"
        ? `${actingUser.name} pa dakò ak tikit ou. Kes ou rete fèmen — al kontakte sipèvizè a pou repati.`
        : action === "set"
          ? `${actingUser.name} fikse kes ou sou ${fmt(dayAmount)} HTG. Chanjman ou kòmanse — sales debloke.`
          : `${actingUser.name} konfime kes ou a ${fmt(dayAmount)} HTG. Chanjman ou kòmanse — sales debloke.`;
      for (const t of supervisorsFor(activeStore?.name)) {
        if (t.id === actingUser.id) continue;
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${t.id}-${Math.random().toString(36).slice(2, 5)}`, t.id, "reg_resolved", checkId, msg, "pending", new Date().toISOString()]);
      }
      if (check.cashier_id !== actingUser.id) {
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${check.cashier_id}-${Math.random().toString(36).slice(2, 5)}`, check.cashier_id, action === "disagree" ? "reg_rejected" : "shift_start", openedShiftId || checkId, msg, "pending", new Date().toISOString()]);
      }
      notifyLocal("Kes rezoud", msg);
      toast(action === "disagree" ? "Pa dakò ✓" : "Kes konfime ✓", msg);

      setSuperUser(""); setSuperSecret(""); setCorrectAmount(""); setActiveCheckId(null);
      const remaining = pendingChecks.filter(p => p.id !== checkId);
      if (remaining.length === 0) {
        setRegOpen(false); setRegView("ask"); setPendingChecks([]); setDelegatedSupervisor(null); setSupervisorEntry(null);
      } else {
        setPendingChecks(remaining); setRegView("setup");
      }
      await loadChecks();
      await loadAll();
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function saveProgramAmount() {
    const approver = effectiveSupervisor;
    if (!approver) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    if (!effectiveIsSupervisor) { toast("Sèl Sipèvizè", "Sèl Admin/Manadjè/Owner ka chanje montan pwogram nan", "warn"); return; }
    const cashier = cashiers.find(c => c.id === setupCashier);
    if (!cashier) { toast("Chwazi kesye", "Chwazi kesye a nan lis la anvan", "warn"); return; }
    if (setupLocked) { toast("Fiks", "Montan kes sa a te deja fikse.", "warn"); return; }
    const amount = parseFloat(regProgram);
    if (isNaN(amount) || amount < 0) { toast("Antre montan", "Antre yon montan pwogram valid", "warn"); return; }
    try {
      const db = await getDb();
      const ts2 = new Date().toISOString();
      await db.runAsync(
        "INSERT INTO cash_register_checks (id, store_id, report_id, cashier_id, check_date, stated_amount, program_amount, status, action, set_by, set_by_role, is_default, approved_by, correct_amount, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [`reg-${Date.now()}`, storeId, "", cashier.id, ts2.slice(0,10), amount, amount, "approved", "set_program", approver.id, approver.role ?? "manager", 0, approver.id, amount, ts2]
      );
      notifyLocal("Montan kes chanje", `${approver.name} mete montan ouvèti kes ${cashier.name} a sou ${fmt(amount)} HTG`);
      toast("Anrejistre ✓", `Montan ouvèti kes ${cashier.name} a fikse sou ${fmt(amount)} HTG.`);
      await loadChecks();
      setSetupCashier(""); setRegProgram(String(PROGRAM_OPENING)); setSetupLocked(false);
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function submitCashAction() {
    if (!user) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    if (!isSupervisor) { toast("Sèl Sipèvizè", "Sèl Owner/Admin/Manager ka anrejistre kach", "warn"); return; }
    const amt = parseFloat(cmAmt);
    if (!amt || isNaN(amt) || amt <= 0) { toast("Antre montan", "Antre yon montan valab", "warn"); return; }
    const cashier = cashiers.find(c => c.id === cmCashier) ?? (getUserById(cmCashier) as Cashier | undefined) ?? undefined;
    if (!cashier) { toast("Chwazi kesye", "Chwazi kesye k ap jere kach la", "warn"); return; }
    if (String(cmSecret).trim() !== String(user.secret).trim()) { toast("Kòd pa bon", "Kòd sekrè ou pa kòrèk.", "error"); return; }
    try {
      const db = await getDb();
      const shifts = (await db.getAllAsync("SELECT * FROM shifts")) as any[];
      const open = (shifts ?? []).find((s: any) => s.status === "open");
      const shiftId = open ? open.id : "";
      const type = cashAction === "ret" ? "inventory" : "deposit";
      const reason = cmComment.trim() || (cashAction === "ret" ? "Retrè kach" : "Envèştisman kach");
      const ts = new Date().toISOString();
      await db.runAsync(
        "INSERT INTO cash_movements (id, shift_id, store_id, type, amount, reason, created_by, taken_by, validated_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [`cm-${type}-${Date.now()}`, shiftId, storeId, type, amt, reason, user.id, cashier.id, user.name, ts]
      );
      for (const sup of ["owner-1", "admin-1", "manager-1"]) {
        if (sup === user.id) continue;
        await db.runAsync("INSERT INTO notifications (id, user_id, type, reference_id, message, status, created_at) VALUES (?,?,?,?,?,?,?)",
          [`notif-${Date.now()}-${sup}-${Math.random().toString(36).slice(2, 4)}`, sup, type, "", `${reason} — ${fmt(amt)} HTG depi kès ${cashier.name}`, "pending", ts]);
      }
      notifyLocal(cashAction === "ret" ? "Retire Kach" : "Envèştisman kach", `${fmt(amt)} HTG depi kès ${cashier.name} — ${reason}`);
      toast(cashAction === "ret" ? "Kach retire ✓" : "Kach envesti ✓", `${fmt(amt)} HTG anrejistre pa ${user.name}.`);
      setCmAmt(""); setCmComment(""); setCmSecret(""); setCmCashier(""); setCashAction("");
      await loadAll();
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function toggleAppAccess() {
    if (!activeStore) return;
    const next = !blocked;
    const db = await getDb();
    const now = new Date().toISOString();
    await db.runAsync("UPDATE stores SET disabled = ? WHERE id = ?", [next ? 1 : 0, activeStore.id]);
    await db.runAsync(
      "INSERT OR REPLACE INTO stores (id,name,location,code,currency,created_at,updated_at,disabled,breach_flagged,breached_at,revoked_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [activeStore.id, activeStore.name, activeStore.location, activeStore.code, "HTG", activeStore.createdAt, now, next ? 1 : 0, activeStore.breachFlagged ? 1 : 0, activeStore.breachedAt ?? null, activeStore.revokedBy ?? null]
    );
    setStores(prev => prev.map(s => s.id === activeStore.id ? { ...s, disabled: next } : s));
    notifyLocal(next ? "App dezaktive" : "App aktive", next ? `${activeStore.name} pase an "Li sèlman".` : `${activeStore.name} ouvri pou tout moun.`);
    toast(next ? "App dezaktive ✓" : "App aktive ✓", activeStore.name);
  }

  async function handleSaleSearch() {
    setSaleError(""); setSaleDetail(null); setPendingChange(null);
    const q = saleQuery.trim();
    if (!q) { setSaleError("Antre id oswa nimewo vant la"); return; }
    setSearching(true);
    try {
      const db = await getDb();
      const detail = await findSaleDetail(db, storeId, q);
      if (!detail) setSaleError("Vant pa jwenn — verifye id la");
      else setSaleDetail(detail);
    } catch (e: any) { setSaleError(String(e?.message ?? "Erè pandan rechèch")); }
    finally { setSearching(false); }
  }

  async function handleApplyChange() {
    if (!saleDetail || !pendingChange) return;
    setApplying(true);
    try {
      const db = await getDb();
      const res = await changeSalePaymentMethod(saleDetail, pendingChange, { db, storeId, storeName: activeStore?.name ?? "Magazen", currentUser: user });
      try { salesEvents.emit(); } catch {}
      notifyLocal("Koreksyon Vant ✓", `Vant ${res.sale.sale_number} chanje soti ${salePaymentLabel(res.previous)} → ${salePaymentLabel(res.target)}.`);
      toast("Koreksyon anrejistre ✓", `Vant ${res.sale.sale_number} • Resi: ${res.receiptNumber}.`);
      const rows = (await db.getAllAsync("SELECT * FROM receipts WHERE sale_id = ?", [saleDetail.sale.id])) as any[];
      const cust = (rows ?? []).find(r => r.copy_type === "customer");
      if (cust) {
        try { setReceipt(JSON.parse(cust.content)); } catch {}
      }
      setSaleDetail(null); setSaleQuery(""); setPendingChange(null); setOptOpen(false);
      await loadAll();
    } catch (e: any) {
      toast("Koreksyon echwe", String(e?.message ?? "Imposib fè koreksyon an"), "error");
    } finally { setApplying(false); }
  }

  function printReceipt() {
    if (!receipt) return;
    const w = window.open("", "_blank");
    if (w) { w.document.write(buildReceiptHtml(receipt)); w.document.close(); }
  }

  const available = PROGRAM_OPENING + stats.cashToday - stats.withdrawals;
  const statedDiff = regStated !== "" ? Math.abs((parseFloat(regStated) || 0) - (parseFloat(regProgram) || PROGRAM_OPENING)) : null;
  const shiftVerified = !isSupervisor && !!user && shiftInfo?.status === "open";

  return (
    <div style={{ width: "100%", maxWidth: contentW(isTablet, width), margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: palette.ink }}>Kòd magazen</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>Jesyon magazen • Kach • Kesye</div>
        </div>
        {canManageStore && (
          <Button label="Modifye magazen" icon="edit" variant="ghost" size="sm" onClick={openEdit} />
        )}
      </div>

      {blocked && (
        <Card accent="top" style={{ padding: 14, background: palette.dangerBg, borderColor: palette.dangerBd, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.surface, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="lock" size={18} color={palette.danger} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: palette.danger }}>Magazen bloke</div>
            <div style={{ fontSize: 11, color: palette.danger, marginTop: 2 }}>Sispann apre yon bès sekirite. Tout aktivite enfim. Kontakte Konsole Sipò.</div>
          </div>
        </Card>
      )}

      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: radius.md, background: palette.ink2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="store" size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: palette.ink, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeStore?.name ?? "Magazen"}</span>
              <PillBg>AKTIF</PillBg>
            </div>
            <div style={{ fontSize: 13, color: palette.muted2, marginTop: 2 }}>{activeStore?.location ?? "—"} • Depi {activeStore ? new Date(activeStore.createdAt).toLocaleDateString() : "—"}</div>
          </div>
          <Icon name="checkmark-circle" size={22} color={palette.ink} />
        </div>

        <div style={{ marginTop: 14, background: palette.surfaceGrouped, borderRadius: radius.md, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <Row label="ID magazen" value={`#${activeStore?.id ?? "—"}`} mono />
          <Row label="Lokal / site" value={activeStore?.location ?? "—"} />
          <Row label="Kòd magazen" value="•••• (pa vizib)" muted />
          {stores.length > 1 && (
            <div style={{ paddingTop: 6, borderTop: `0.5px solid ${palette.hairline}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Chanje magazen</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {stores.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (s.id === storeId) return;
                      if (s.disabled) { toast("Magazen bloke", "Kontakte Konsole Sipò.", "warn"); return; }
                      setVerifyTarget(s); setVerifyCode(""); setCodeErr("");
                    }}
                    style={{
                      padding: "7px 12px", borderRadius: radius.sm, border: `0.5px solid ${s.id === storeId ? palette.accentGold : palette.hairlineStrong}`,
                      background: s.id === storeId ? palette.accentGoldSoft : palette.surface, fontSize: 12, fontWeight: 700, color: s.id === storeId ? palette.accentGold : palette.ink,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card onClick={openRegister} style={{ marginTop: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: radius.md, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="briefcase" size={20} color={shiftVerified ? palette.muted2 : palette.accentGold} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: palette.ink, letterSpacing: -0.2 }}>Lajan Disponib</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>
            {shiftVerified ? "Vèrifye — Ou kòmanse chanjman" : "Lajan ki disponib pou chak kesye"}
          </div>
        </div>
        {shiftVerified ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: palette.successBg, borderRadius: radius.pill, padding: "4px 9px", fontSize: 12, fontWeight: 700, color: palette.success }}>
            <Icon name="checkmark-circle" size={14} /> Vèrifye
          </span>
        ) : pendingChecks.length > 0 ? (
          <div style={{ width: 24, height: 24, borderRadius: 12, background: palette.danger, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
            {pendingChecks.length}
          </div>
        ) : (
          <Icon name="chevron-right" size={18} color={palette.muted3} />
        )}
      </Card>

      <Card onClick={() => nav("/shift")} style={{ marginTop: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: radius.md, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="file-text" size={20} color={palette.ink} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: palette.ink, letterSpacing: -0.2 }}>Rapò Jounen</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>Chanjman • Vant • Retrè • Diskrepans — rapò chak jou</div>
        </div>
        <Icon name="chevron-right" size={18} color={palette.muted3} />
      </Card>

      <Card onClick={() => { setOptOpen(true); setSaleQuery(""); setSaleError(""); setSaleDetail(null); setPendingChange(null); }} style={{ marginTop: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: radius.md, background: palette.blueBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="receipt" size={20} color={palette.blue} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: palette.ink, letterSpacing: -0.2 }}>Opsyon Vant</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>Chèche yon vant pa id • View detay yo • Korekte Kach/Kredi</div>
        </div>
        <Icon name="chevron-right" size={18} color={palette.muted3} />
      </Card>

      {isSupervisor && (
        <Card style={{ marginTop: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Jesyon Kach</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button label="Envèştisman" icon="banknote" variant="soft" style={{ flex: 1 }} onClick={() => { setCashAction("env"); setCmCashier(""); setCmAmt(""); setCmComment(""); setCmSecret(""); }} />
            <Button label="Retrè" icon="cash" variant="soft" style={{ flex: 1 }} onClick={() => { setCashAction("ret"); setCmCashier(""); setCmAmt(""); setCmComment(""); setCmSecret(""); }} />
          </div>
          <div style={{ fontSize: 11, color: palette.muted2, marginTop: 8 }}>Envèştisman mete kach nan kès yon kesye. Retrè retire kach pou depans (envantè, faktirite…).</div>
        </Card>
      )}

      <Card style={{ marginTop: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="people" size={16} color={palette.muted2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>Kasye yo ({cashiers.length})</span>
          </div>
          {canManageStore && (
            <Button label="Ajoute" icon="user-add" size="sm" onClick={() => setAddOpen(true)} />
          )}
        </div>
        {cashiers.length === 0 ? (
          <EmptyState icon="people" title="Pa gen kesye" body="Ajoute yon kesye pou gade lis la." />
        ) : (
          cashiers.map(c => {
            const isActive = activeCashier?.id === c.id;
            const initialsBg = c.active ? palette.ink2 : palette.surfaceGrouped;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 6px", borderBottom: `0.5px solid ${palette.separatorSoft}`, opacity: c.active ? 1 : 0.55 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: initialsBg, color: c.active ? "#fff" : palette.muted2, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {initials(c.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: palette.ink }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: palette.muted2, marginTop: 1 }}>{c.phone || "Kesye"} {c.active ? "" : "• inaktif"}</div>
                </div>
                {isActive ? (
                  <span style={{ background: palette.successBg, color: palette.success, borderRadius: radius.pill, padding: "4px 9px", fontSize: 11, fontWeight: 700 }}>Aktif</span>
                ) : (
                  <Button label="Chwazi" size="sm" variant="ghost" disabled={!c.active} onClick={() => selectActiveCashier(c.id)} />
                )}
                {canManageStore && c.id !== user?.id && (
                  <button
                    onClick={() => setRemoveTarget(c)}
                    title="Retire kesye"
                    style={{ background: palette.dangerBg, border: "none", borderRadius: 9, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: palette.danger }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </Card>

      {canManageStore && (
        <Card style={{ marginTop: 12, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={blocked ? "lock" : "lock"} size={18} color={blocked ? palette.danger : palette.muted2} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: palette.ink }}>Aksè app</div>
            <div style={{ fontSize: 12, color: blocked ? palette.danger : palette.muted2, marginTop: 2 }}>{blocked ? "Li sèlman" : "Tout moun ka ekri"}</div>
          </div>
          <Button label={blocked ? "Aktive" : "Dezaktive"} variant={blocked ? "danger" : "primary"} onClick={toggleAppAccess} />
        </Card>
      )}

      {!isOwner && (
        <Card style={{ marginTop: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="info" size={16} color={palette.muted2} />
            <span style={{ fontSize: 13, color: palette.muted2, flex: 1 }}>Ou ap itilize magazen <b style={{ color: palette.ink, fontWeight: 700 }}>{activeStore?.name ?? "—"}</b>. Kontak sipò pou jere l.</span>
          </div>
        </Card>
      )}

      {editOpen && activeStore && (
        <Overlay onClose={() => setEditOpen(false)} width={460}>
          <ModalHeader title="Modifye magazen" onClose={() => setEditOpen(false)} sub={activeStore.name} />
          <Field label="Non magazen" required><TextInput value={eName} onChange={setEName} placeholder="Non magazen" /></Field>
          <Field label="Lokal / site" required><TextInput value={eLoc} onChange={setELoc} placeholder="Lokal / site" /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setEditOpen(false)} />
            <Button label="Anrejistre" style={{ flex: 1 }} onClick={saveEdit} />
          </div>
        </Overlay>
      )}

      {verifyTarget && (
        <Overlay onClose={() => setVerifyTarget(null)} width={440}>
          <ModalHeader title="Chanje magazen" onClose={() => setVerifyTarget(null)} />
          <div style={{ fontSize: 12.5, color: palette.muted, lineHeight: 1.5 }}>
            Ou pral chanje nan <b style={{ color: palette.ink }}>{verifyTarget.name}</b>. Antre kòd sekrè magazen sa a pou verifye aksè w.
          </div>
          <div style={{ marginTop: 12 }}>
            <TextInput value={verifyCode} onChange={v => { setVerifyCode(v); setCodeErr(""); }} placeholder="Kòd sekrè" numeric autoFocus />
          </div>
          {codeErr ? <div style={{ fontSize: 12, color: palette.danger, fontWeight: 700, marginTop: 8 }}>{codeErr}</div> : null}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setVerifyTarget(null)} />
            <Button label="Chanje" style={{ flex: 1 }} onClick={confirmSwitch} />
          </div>
        </Overlay>
      )}

      {cashAction && (
        <Overlay onClose={() => setCashAction("")} width={480} align="bottom">
          <ModalHeader
            title={cashAction === "env" ? "Envèştisman kach" : "Retrè kach"}
            onClose={() => setCashAction("")}
            sub={cashAction === "env" ? "Mete kach nan kès yon kesye" : "Retire kach depi kès yon kesye pou depans"}
          />
          <Field label="Kesye a" required>
            <Select
              value={cmCashier}
              onChange={setCmCashier}
              options={cashiers.map(c => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field label="Montan (HTG)" required>
            <TextInput value={cmAmt} onChange={setCmAmt} placeholder="5000" numeric />
          </Field>
          <Field label="Rezon / Kòmantè">
            <TextInput value={cmComment} onChange={setCmComment} placeholder="Fason yo pral itilize kach la (eg. envantè, faktirite)" />
          </Field>
          <div style={{ background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGoldSoft}`, borderRadius: radius.md, padding: 12, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: palette.accentGold, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="key" size={14} /> Kòd sekrè ou
            </div>
            <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>Sèlman sipèvizè ka anrejistre</div>
            <div style={{ marginTop: 8 }}>
              <TextInput value={cmSecret} onChange={setCmSecret} placeholder="Antre kòd sekrè ou" type="password" numeric />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setCashAction("")} />
            <Button label="Anrejistre" style={{ flex: 1 }} onClick={submitCashAction} />
          </div>
        </Overlay>
      )}

      {addOpen && (
        <Overlay onClose={() => setAddOpen(false)} width={460}>
          <ModalHeader title="Nouvo Kesye" onClose={() => setAddOpen(false)} sub={`Ajoute nan ${activeStore?.name ?? "magazen"}`} />
          <Field label="Non konplè" required><TextInput value={aName} onChange={setAName} placeholder="Non konplè" autoFocus /></Field>
          <Field label="Telefon"><TextInput value={aPhone} onChange={setAPhone} placeholder="+509 …" /></Field>
          <Field label="Adrès"><TextInput value={aAddr} onChange={setAAddr} placeholder="Adrès" /></Field>
          {!aName.trim() ? <div style={{ fontSize: 11, color: palette.muted3, marginTop: -6, marginBottom: 10 }}>Kesye sa a p ap ka jere chanjman jiskaske yon sipèvizè verifiede l.</div> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setAddOpen(false)} />
            <Button label="Ajoute kesye" style={{ flex: 1 }} onClick={addCashier} />
          </div>
        </Overlay>
      )}

      {removeTarget && (
        <Confirm
          title="Retire kesye?"
          message={`${removeTarget.name} pral gen aksè app nan magazen sa a. Ou ka re-aktive l nan Lis ekip ak aksè sivèpizè.`}
          confirmLabel="Retire"
          tone="danger"
          onConfirm={confirmRemoveCashier}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {regOpen && (
        <Overlay onClose={() => { setRegOpen(false); setDelegatedSupervisor(null); setSupervisorEntry(null); setSuperUser(""); setSuperSecret(""); }} width={540}>
          <ModalHeader
            title="Lajan Disponib"
            onClose={() => { setRegOpen(false); setDelegatedSupervisor(null); setSupervisorEntry(null); setSuperUser(""); setSuperSecret(""); }}
            sub={delegatedSupervisor ? `Aji kòm ${delegatedSupervisor.name} — menm ekran ak app sipèvizè a` : "Anvan kòmanse, kesye konte kach kes la epi fè l matche ak pwogram nan"}
          />

          {regView === "setup" ? (
            <div>
              {delegatedSupervisor && (
                <div style={{ background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGold}`, borderRadius: radius.md, padding: 10, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Icon name="shield-checkmark" size={16} color={palette.accentGold} />
                  <span style={{ fontSize: 12, color: palette.ink, fontWeight: 700 }}>Verifye kòm {delegatedSupervisor.name} ({delegatedSupervisor.role}).</span>
                </div>
              )}
              {pendingChecks.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon name="alert" size={17} color={palette.danger} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>Plent kesye yo</span>
                    </div>
                    <span style={{ background: palette.dangerBg, borderRadius: radius.pill, padding: "3px 9px", fontSize: 11, color: palette.danger, fontWeight: 800 }}>{pendingChecks.length} atant</span>
                  </div>
                  <div style={{ fontSize: 11, color: palette.muted2, marginTop: 4 }}>Kesye yo pa t dakò ak montan a. Rezoud chak plent anvan ou fikse montan kes.</div>
                  {pendingChecks.map(c => (
                    <div key={c.id} style={{ background: palette.surfaceGrouped, borderRadius: radius.md, padding: 12, borderTop: `3px solid ${palette.danger}`, marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: palette.accentGold }}>
                          {initials(getUserById(c.cashier_id)?.name ?? c.cashier_id)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>{getUserById(c.cashier_id)?.name ?? c.cashier_id}</div>
                          <div style={{ fontSize: 11, color: palette.muted2 }}>konte <Money v={num(c.stated_amount)} /> (pwogram atann)</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <Button size="sm" label="Konfime" variant="success" style={{ flex: 1 }} onClick={() => resolveCheck(c.id, "approve")} />
                        <Button size="sm" label="Pa dakò" variant="danger" style={{ flex: 1 }} onClick={() => resolveCheck(c.id, "disagree")} />
                        <Button size="sm" label="Fikse" variant="gold" onClick={() => { setActiveCheckId(activeCheckId === c.id ? null : c.id); setCorrectAmount(""); }} />
                      </div>
                      {activeCheckId === c.id && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                          <div style={{ flex: 1 }}>
                            <TextInput value={correctAmount} onChange={setCorrectAmount} placeholder="Nouvo montan" numeric />
                          </div>
                          <Button size="sm" label="Fikse montan" icon="lock" onClick={() => resolveCheck(c.id, "set")} disabled={!correctAmount} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <Field label="Kesye a">
                <Select value={setupCashier} onChange={v => { setSetupCashier(v); loadCashierProgram(v); }} options={cashiers.map(c => ({ value: c.id, label: `${c.name}${lockedCashiers.includes(c.id) ? " (Fiks)" : ""}` }))} />
              </Field>
              <Field label="Montan ouvèti kes la (HTG)" hint={setupLocked ? "Montan sa a fiks nan app la. Li te mete yon fwa — pèsonn pa ka chanje l oswa reset l ankò." : "Si ou pa chanje li, kesye a ap wè montan nòmal (anvan) a."}>
                <TextInput value={regProgram} onChange={setRegProgram} numeric disabled={!setupCashier || setupLocked} />
              </Field>
              {setupLocked ? (
                <div style={{ background: palette.successBg, border: `0.5px solid ${palette.success}`, borderRadius: radius.md, padding: 12, textAlign: "center", color: palette.success, fontWeight: 700, fontSize: 13 }}>
                  Fiks — Pa ka Chanje
                </div>
              ) : (
                <Button label="Anrejistre Montan Kes" icon="checkmark-circle" block disabled={!setupCashier} onClick={saveProgramAmount} />
              )}
              <Button label="Fèmen" variant="ghost" block style={{ marginTop: 8 }} onClick={() => setRegOpen(false)} />
            </div>
          ) : regView === "ask" ? (
            <div>
              <div style={{ background: palette.surfaceGrouped, borderRadius: radius.md, padding: 12, border: `0.5px solid ${palette.hairline}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, letterSpacing: 0.8, textTransform: "uppercase" }}>Montan pwogram nan atann</div>
                <div style={{ fontWeight: 900, fontSize: 18, color: palette.accentGold, marginTop: 2 }}><Money v={num(regProgram) || PROGRAM_OPENING} /></div>
                <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>Sa pwogram nan deklare kes la genyen kòm kach ouvèti</div>
              </div>
              <div style={{ marginTop: 12, background: palette.surface2, borderRadius: radius.md, padding: 12, border: `0.5px solid ${palette.hairline}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, letterSpacing: 0.8, textTransform: "uppercase" }}>Lajan Disponib aktyèl</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: palette.ink, marginTop: 2 }}><Money v={available} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: palette.muted2 }}>
                  <span>Vant kach jodi a</span><span className="num" style={monoStyle}>{fmt(stats.cashToday)} HTG</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: palette.muted2 }}>
                  <span>Retrè jodi a</span><span className="num" style={monoStyle}>− {fmt(stats.withdrawals)} HTG</span>
                </div>
              </div>

              <Field label="Ki kach ou konte? (HTG)">
                <TextInput value={regStated} onChange={setRegStated} placeholder="Konbyen ou konte tout bon" numeric />
              </Field>
              {statedDiff !== null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: statedDiff === 0 ? palette.successBg : palette.dangerBg, border: `0.5px solid ${statedDiff === 0 ? palette.successBd : palette.dangerBd}`, borderRadius: radius.md, padding: 10, marginBottom: 10 }}>
                  <Icon name={statedDiff === 0 ? "checkmark-circle" : "alert"} size={16} color={statedDiff === 0 ? palette.success : palette.danger} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: statedDiff === 0 ? palette.success : palette.danger }}>
                    {statedDiff === 0 ? "Koeeran — dakò ak pwogram nan" : `Estati flage — diferans ${fmt(statedDiff)} HTG`}
                  </span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <Button label="Pa dakò" variant="danger" style={{ flex: 1 }} onClick={disagreeRegister} />
                <Button label="Dakò" variant="gold" style={{ flex: 1 }} icon="checkmark-circle" onClick={agreeRegister} />
              </div>

              {pendingChecks.length > 0 && (
                <div style={{ marginTop: 14, background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.md, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: palette.danger, marginBottom: 6 }}>Plent kesye yo ({(pendingChecks.filter(p => p.cashier_id === user?.id)).length})</div>
                  {pendingChecks.filter(p => p.cashier_id === user?.id).map(c => (
                    <div key={c.id} style={{ background: palette.surface, borderRadius: radius.sm, padding: 10, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: palette.muted2 }}>
                        <span>Ou te konte</span><span className="num" style={monoStyle}>{fmt(c.stated_amount)} HTG</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: palette.muted2 }}>
                        <span>Diferans</span><span className="num" style={monoStyle}>{(num(c.program_amount) - num(c.stated_amount))} HTG</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : regView === "disagree" ? (
            <div>
              <Field label="Ki kach ou reyèlman konte? (HTG)" required>
                <TextInput value={regStated} onChange={setRegStated} placeholder="Konbyen ou konte tout bon" numeric autoFocus />
              </Field>
              <Button label="Voye Plent → Notifye Admin/Manadjè/Owner" icon="alert" block onClick={fileRegisterComplaint} />
              <div style={{ border: `1px dashed ${palette.accentGold}`, borderRadius: radius.md, padding: 12, marginTop: 14, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: palette.accentGold, fontWeight: 700 }}>Sipèvizè: Rezoud tikit yo depi isit</div>
                <Button label="Mwen se yon sipèvizè" variant="gold" size="sm" style={{ marginTop: 8 }} onClick={() => { setSupervisorEntry("disagree"); setRegView("supervisor"); setSuperUser(""); setSuperSecret(""); }} />
              </div>
              <Button label="Retounen" variant="ghost" block style={{ marginTop: 8 }} onClick={() => setRegView("ask")} />
            </div>
          ) : regView === "pending" ? (
            <div>
              <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.md, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: palette.danger, fontWeight: 700, fontSize: 13 }}>
                  <Icon name="clock" size={18} /> Tikit ou ap tann verifikasyon
                </div>
                <div style={{ fontSize: 12, color: palette.ink, marginTop: 6, lineHeight: 1.5 }}>
                  Ou pa dakò ak kes la. Chanjman ou make "ap tann" — ou pa ka kòmanse jiskaske yon sipèvizè jere tikit la.
                </div>
              </div>
              {pendingChecks.filter(p => p.cashier_id === user?.id).map(c => (
                <div key={c.id} style={{ background: palette.surfaceGrouped, borderRadius: radius.md, padding: 12, border: `0.5px solid ${palette.hairline}`, marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: palette.muted2, letterSpacing: 0.8, textTransform: "uppercase" }}>Plent ou</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: palette.muted2 }}>
                    <span>Ou te konte</span><span style={{ fontWeight: 800, color: palette.ink }}><Money v={num(c.stated_amount)} /></span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: palette.muted2 }}>
                    <span>Pwogram nan atann</span><span style={{ fontWeight: 800, color: palette.ink }}><Money v={num(c.program_amount)} /></span>
                  </div>
                </div>
              ))}
              <div style={{ background: palette.accentGoldSoft, borderRadius: radius.md, padding: 10, marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: palette.accentGold }}>Yon sipèvizè la bò kote w?</div>
                <div style={{ fontSize: 11, color: palette.muted2, marginTop: 4 }}>Li ka rezoud tikit la tou dwèt sou ekran sa a.</div>
              </div>
              <Button label="Sipèvizè: Rezoud tikit yo depi isit" variant="gold" block style={{ marginTop: 10 }} onClick={() => { setSupervisorEntry("pending"); setRegView("supervisor"); setSuperUser(""); setSuperSecret(""); }} />
              <Button label="Fèmen" variant="ghost" block style={{ marginTop: 8 }} onClick={() => setRegOpen(false)} />
            </div>
          ) : (
            <div>
              <div style={{ background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGoldSoft}`, borderRadius: radius.md, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: palette.accentGold }}>Rezoud tikit kesye a</div>
                <div style={{ fontSize: 11, color: palette.muted2, marginTop: 4 }}>Antre kòd sekrè w la — apre verifikasyon w ap wè menm ekran ak app sipèvizè a.</div>
              </div>
              <Field label="Kiyès sipèvizè a?">
                <Select
                  value={superUser}
                  onChange={setSuperUser}
                  options={(supervisorPool as any[]).map(u => ({ value: u.id, label: `${u.name} (${u.role})` }))}
                />
              </Field>
              <Field label="Kòd sekrè ou" hint="Sèlman sipèvizè ka aprouve">
                <TextInput value={superSecret} onChange={setSuperSecret} placeholder="Antre kòd sekrè ou" type="password" />
              </Field>
              <Button label="Verifye & Kontinye" icon="shield-checkmark" block onClick={verifySupervisorAndEnterSetup} disabled={!superUser || !superSecret} />
              <Button label="Retounen" variant="ghost" block style={{ marginTop: 8 }} onClick={() => setRegView(supervisorEntry ?? "ask")} />
            </div>
          )}
        </Overlay>
      )}

      {optOpen && (
        <Overlay onClose={() => setOptOpen(false)} width={560} align="bottom">
          <ModalHeader title="Opsyon Vant" onClose={() => setOptOpen(false)} sub="Chèche yon vant pa id oswa nimewo • View tout detay yo epi korije si sa nesesè" />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <SearchBar value={saleQuery} onChange={v => { setSaleQuery(v); setSaleError(""); }} placeholder="ID oswa nimewo vant (eg. sale-1725…)" />
            </div>
            <Button label={searching ? "…" : "Chèche"} onClick={handleSaleSearch} disabled={searching} />
          </div>
          {saleError && (
            <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.md, padding: 12, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="alert" size={16} color={palette.danger} />
              <span style={{ fontSize: 12, color: palette.danger, fontWeight: 600 }}>{saleError}</span>
            </div>
          )}

          {saleDetail && !pendingChange && (
            <div>
              <Card style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: palette.ink }}>Vant {saleDetail.sale.sale_number ?? saleDetail.sale.id}</div>
                    <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>{new Date(saleDetail.sale.created_at ?? new Date()).toLocaleDateString()} • {new Date(saleDetail.sale.created_at ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <PillBg>{salePaymentLabel(saleDetail.sale.payment_method)}</PillBg>
                </div>
                <div style={{ marginTop: 10, borderTop: `0.5px solid ${palette.hairline}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row label="Kesye" value={getUserById(saleDetail.sale.seller_id)?.name ?? saleDetail.sale.seller_id ?? "—"} />
                  <Row label="Kliyan" value={saleDetail.customer ? `${saleDetail.customer.name}${saleDetail.customer.id_card_number ? ` (${saleDetail.customer.id_card_number})` : ""}` : "Pa gen kliyan"} />
                  <Row label="Atik" value={`${saleDetail.items.length} atik`} />
                  <Row label="TOTAL" value={formatMoney(num(saleDetail.sale.total))} mono />
                  <Row label="Pe" value={formatMoney(num(saleDetail.sale.amount_paid))} mono />
                  {num(saleDetail.sale.amount_due) > 0 && <Row label="Reste dwe" value={formatMoney(num(saleDetail.sale.amount_due))} mono danger />}
                </div>
                {saleDetail.items.length > 0 && (
                  <div style={{ marginTop: 10, borderTop: `0.5px solid ${palette.hairline}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {saleDetail.items.map((it, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span className="num" style={{ ...monoStyle, fontSize: 11, color: palette.muted3, width: 40 }}>{it.quantity} ×</span>
                        <span style={{ flex: 1, fontSize: 11, color: palette.ink }}>{it.product_name ?? it.name}{it.variant && it.variant !== "Regular" ? ` · ${it.variant}` : ""}</span>
                        <span className="num" style={{ ...monoStyle, fontSize: 11, color: palette.ink, fontWeight: 700 }}>{formatMoney(num(it.line_total))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {saleDetail.sale.payment_method === "credit" && (
                  <Button label="Rektifye an Kach (vant te Kach)" icon="cash" variant="success" block onClick={() => setPendingChange("cash")} />
                )}
                {saleDetail.sale.payment_method === "cash" && effectiveIsSupervisor && (
                  <Button label="Chanje an Kredi (sipèvizè)" icon="pricetag" variant="soft" block onClick={() => setPendingChange("credit")} />
                )}
                {saleDetail.sale.payment_method === "cash" && !effectiveIsSupervisor && (
                  <div style={{ background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="lock" size={15} color={palette.muted2} />
                    <span style={{ fontSize: 11, color: palette.muted2 }}>Yon vant Kach pa ka vin Kredi pa yon kesye — sèl yon sipèvizè ka fè koreksyon sa.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {saleDetail && pendingChange && (
            <Card accent="top" style={{ marginTop: 12, padding: 14, background: saleDetail.sale.payment_method === "credit" ? palette.successBg : palette.accentGoldSoft }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: palette.ink }}>Konfime koreksyon</div>
              <div style={{ fontSize: 11, color: palette.muted2, marginTop: 3 }}>Koreksyon sa pral mete ajou analytics, rapò jounen an ak resi yo otomatikman.</div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                <Row label="Rejim aktyèl" value={salePaymentLabel(saleDetail.sale.payment_method)} />
                <Row label="Aprè koreksyon" value={pendingChange === "credit" ? "Kredi" : "Kach"} strong />
                <Row label="TOTAL" value={formatMoney(num(saleDetail.sale.total))} mono />
                {pendingChange === "cash" && saleDetail.credit && (
                  <Row label="Dèt retire nan kliyan" value={`− ${formatMoney(Math.max(0, num(saleDetail.credit.balance)))}`} danger mono />
                )}
                {pendingChange === "credit" && (
                  <Row label="Nouvo dèt kliyan" value={`+ ${formatMoney(num(saleDetail.sale.total))}`} danger mono />
                )}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setPendingChange(null)} />
                <Button label={applying ? "Aplike…" : "Konfime ✓"} style={{ flex: 1 }} onClick={handleApplyChange} disabled={applying} />
              </div>
            </Card>
          )}
        </Overlay>
      )}

      {receipt && (
        <Overlay onClose={() => setReceipt(null)} width={430}>
          <ModalHeader title="Resi" onClose={() => setReceipt(null)} sub={copyLabel(receipt.copyType)} />
          <pre style={{ ...monoStyle, whiteSpace: "pre-wrap", fontSize: 11.5, lineHeight: 1.5, background: palette.surface2, borderRadius: radius.md, padding: 14, margin: 0, color: palette.ink }}>
            {receiptToText(receipt)}
          </pre>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Button label="Imprime" icon="print" variant="soft" style={{ flex: 1 }} onClick={printReceipt} />
            <Button label="Fèmen" style={{ flex: 1 }} onClick={() => setReceipt(null)} />
          </div>
        </Overlay>
      )}

      {!ready && <div style={{ textAlign: "center", padding: 30, color: palette.muted2, fontSize: 13 }}>Ap chaje…</div>}
    </div>
  );
}

function Row({ label, value, mono, muted, strong, danger }: { label: string; value: React.ReactNode; mono?: boolean; muted?: boolean; strong?: boolean; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 11, color: palette.muted2 }}>{label}</span>
      <span
        className={mono ? "num" : undefined}
        style={{
          fontSize: 12.5, color: danger ? palette.danger : muted ? palette.muted3 : palette.ink,
          fontWeight: strong ? 800 : mono ? 700 : 600,
          ...(mono ? monoStyle : {}),
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PillBg({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ background: palette.successBg, borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 700, color: palette.success, letterSpacing: 0.3, flexShrink: 0 }}>
      {children}
    </span>
  );
}