import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { palette, radius, shadow } from "../lib/theme";
import { buildReceiptHtml, receiptToText, fmtDateTime, type ReceiptData, type ReceiptCustomer } from "../lib/receipts";
import { fmt, monoStyle } from "../lib/format";
import { getDb } from "../lib/db";
import { Button, ModalHeader, Overlay, TextInput, toast } from "./ui";
import { Icon } from "./Icon";
// STAGING-PICKUP: single gated import — delete this + the STAGING block below to remove.
import { usePickupEnabled, PickupSheet, useOnline, isValidEmail } from "../pickup-staging";

function SumRow({ label, value, strong, tint }: { label: string; value: string; strong?: boolean; tint?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, padding: "2px 0" }}>
      <span style={{ color: palette.muted2 }}>{label}</span>
      <span className="num" style={{ fontWeight: strong ? 800 : 600, color: tint ?? palette.ink }}>{value}</span>
    </div>
  );
}

function statusOf(r: ReceiptData): { label: string; tint: string } | null {
  if (r.paymentMethod === "credit") return { label: `Kredi • Balance ${fmt(Number(r.amountDue ?? 0))} HTG`, tint: palette.danger };
  if (Number(r.amountDue ?? 0) > 0) return { label: `Balance ${fmt(Number(r.amountDue ?? 0))} HTG`, tint: palette.warning };
  return null;
}

export function ReceiptModal({
  receipts,
  onClose,
  width = 720,
  staging,
  title,
  printLabel,
}: {
  receipts: { customer: ReceiptData; store: ReceiptData } | null;
  onClose: () => void;
  title?: string;
  width?: number;
  printLabel?: string;
  staging?: { storeId: string; cashierId?: string | null; customerId?: string | null };
}) {
  void title; void printLabel;
  const [printing, setPrinting] = useState(false);
  // STAGING-PICKUP: pickup section dormant when flag OFF. Delete block to remove.
  const stagingOn = usePickupEnabled(staging?.storeId ?? "demo-store-id");
  const online = useOnline();
  const [showPickup, setShowPickup] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuView, setMenuView] = useState<"main" | "add" | "view">("main");
  const [custDetail, setCustDetail] = useState<any | null>(null);
  const [custDebt, setCustDebt] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newIdCard, setNewIdCard] = useState("");
  const [savingCust, setSavingCust] = useState(false);

  const r = receipts?.customer ?? null;
  const saleId = r?.saleId ?? "";
  const custId = r?.customerId ?? staging?.customerId ?? null;
  const [custOverride, setCustOverride] = useState<ReceiptCustomer | null>(null);
  const customer = custOverride ?? r?.customer ?? null;
  const hasCustomer = !!customer;
  const isSale = (r?.kind ?? "sale") === "sale";

  useEffect(() => {
    setShowPickup(false);
    setSavedEmail(receipts?.customer?.customer?.email ?? null);
    setCustOverride(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleId]);
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => setPrinting(false), 1200);
    return () => {
      window.removeEventListener("afterprint", done);
      window.clearTimeout(t);
    };
  }, [printing]);
  if (!receipts || !r) return null;
  const { customer: customerCopy, store } = receipts;
  const st = statusOf(r);
  const rr: ReceiptData = r;

  function doPrint() {
    setPrinting(true);
    window.setTimeout(() => {
      window.print();
    }, 80);
  }

  const printArea = printing
    ? createPortal(
        <>
          <style>
            {`@media print {
  body { background: #fff; }
  body * { visibility: hidden; }
  #jm-print-area, #jm-print-area * { visibility: visible; }
  #jm-print-area { position: absolute; left: 0; top: 0; width: 80mm; max-width: 100%; background: #fff; }
}`}
          </style>
          <div
            id="jm-print-area"
            style={{ position: "fixed", left: 0, top: 0, width: "80mm", maxWidth: "100%", background: "#fff" }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html:
                  buildReceiptHtml(customerCopy) +
                  '<div style="page-break-after: always"></div>' +
                  buildReceiptHtml(store),
              }}
            />
          </div>
        </>,
        document.body
      )
    : null;

  function finishPrint() {
    setPrinting(false);
  }

  async function shareReceipt() {
    const text = receiptToText({ ...rr, customer });
    try {
      const nav: any = window.navigator as any;
      if (nav?.share) {
        await nav.share({ title: `Resi ${rr.receiptNumber}`, text });
        return;
      }
      throw new Error("share-unavailable");
    } catch (e: any) {
      if (String(e?.name ?? "") === "AbortError") return;
      try {
        await window.navigator.clipboard.writeText(text);
        toast("Kopye ✓", "Resi a kopye — kole l kote ou vle.", "success");
      } catch {
        toast("Pataje", "Pataje pa disponib sou aparèy sa a.", "warn");
      }
    }
  }

  async function emailReceipt(to: string, rr: ReceiptData) {
    const subject = `Resi ${rr.receiptNumber} - ${rr.storeName}`;
    const url = `mailto:${to.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(receiptToText(rr))}`;
    window.location.href = url;
  }

  async function openMenu() {
    setMenuView("main");
    setCustDetail(null);
    setCustDebt(null);
    setNewName(""); setNewPhone(""); setNewEmail(""); setNewIdCard("");
    if (custId) {
      try {
        const db = await getDb();
        const rows = (await db.getAllAsync("SELECT * FROM customers WHERE id = ?", [custId])) as any[];
        if (rows?.length) setCustDetail(rows[0]);
        // Debt is calculated live: sum of open credit balances, not the stored label.
        const credits = ((await db.getAllAsync("SELECT * FROM credits WHERE customer_id = ?", [custId])) as any[]) ?? [];
        const open = credits.filter((c: any) => String(c.status ?? "") !== "paid");
        setCustDebt(open.reduce((s: number, c: any) => s + Number(c.balance ?? 0), 0));
      } catch {}
    }
    setMenuVisible(true);
  }

  async function saveCustomer() {
    const name = newName.trim();
    if (!name) { toast("Non obligatwa", "Antre non kliyan an.", "warn"); return; }
    if (newEmail.trim() && !isValidEmail(newEmail.trim())) { toast("Email pa valab", "Antre yon adrès email valab.", "warn"); return; }
    const storeId = staging?.storeId ?? "demo-store-id";
    const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setSavingCust(true);
    try {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [id, storeId, name, newPhone.trim() || null, null, newIdCard.trim() || null, 0, null, null, 0, 0]
      );
      if (newEmail.trim()) {
        try { await db.runAsync("UPDATE customers SET email = ? WHERE id = ?", [newEmail.trim(), id]); } catch {}
      }
      try { await db.runAsync("UPDATE sales SET customer_id = ? WHERE id = ?", [id, saleId]); } catch {}
      const snapshot: ReceiptCustomer = {
        name,
        idCard: newIdCard.trim() || null,
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      };
      setCustOverride(snapshot);
      if (snapshot.email) setSavedEmail(snapshot.email);
      try {
        const rows = (await db.getAllAsync("SELECT * FROM receipts WHERE sale_id = ?", [saleId])) as any[];
        for (const row of rows) {
          try {
            const data = JSON.parse(row.content ?? "{}");
            data.customer = snapshot;
            data.customerId = id;
            await db.runAsync("UPDATE receipts SET content = ? WHERE id = ?", [JSON.stringify(data), row.id]);
          } catch {}
        }
      } catch {}
      try {
        const rows = (await db.getAllAsync("SELECT * FROM customers WHERE id = ?", [id])) as any[];
        if (rows?.length) setCustDetail(rows[0]);
        setCustDebt(0);
      } catch {}
      setMenuView("main");
      toast("Kliyan ajoute ✓", name, "success");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Ajoute kliyan echwe", "error");
    } finally {
      setSavingCust(false);
    }
  }

  async function paVleResi() {
    try {
      const db = await getDb();
      await db.runAsync("DELETE FROM receipts WHERE sale_id = ?", [saleId]);
    } catch {}
    setShowPickup(false);
    onClose();
  }

  return (
    <Overlay onClose={onClose} width={width}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button
          onClick={openMenu}
          title="Plis opsyon"
          style={{ width: 36, height: 36, borderRadius: 18, border: `0.5px solid ${palette.hairline}`, background: palette.surface, cursor: "pointer", fontSize: 16, fontWeight: 800, color: palette.ink, letterSpacing: 2, paddingLeft: 4 }}
        >
          •••
        </button>
        <button
          onClick={() => { finishPrint(); onClose(); }}
          title="Fèmen"
          style={{ width: 36, height: 36, borderRadius: 18, border: "none", background: palette.ink2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="checkmark" size={17} color="#fff" />
        </button>
      </div>

      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, maxHeight: "72vh", paddingRight: 4 }}>
        {/* Hero — total, centered */}
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 11, color: palette.muted2, fontWeight: 800, letterSpacing: 1.2 }}>TOTAL</div>
          <div className="num" style={{ fontWeight: 900, fontSize: 40, color: palette.ink, letterSpacing: -1.5, marginTop: 4 }}>{fmt(Number(r.total ?? 0))} HTG</div>
          {st ? <div style={{ fontSize: 14, fontWeight: 800, color: st.tint, marginTop: 6 }}>{st.label}</div> : null}
          {Number(r.change ?? 0) > 0 ? (
            <div className="num" style={{ fontSize: 14, color: palette.blue, fontWeight: 800, marginTop: 6 }}>Remèt {fmt(Number(r.change ?? 0))} HTG</div>
          ) : null}
          {Number(r.total ?? 0) !== Number(r.amountPaid ?? 0) ? (
            <div className="num" style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>Peye {fmt(Number(r.amountPaid ?? 0))} HTG</div>
          ) : null}
        </div>

        {/* STAGING-PICKUP: partial pickup option. Delete block to remove. */}
        {isSale && stagingOn && staging?.storeId ? (
          <div>
            <Button label="Partial pickup" icon="box" variant="soft" block onClick={() => setShowPickup(true)} />
            {showPickup ? (
              <PickupSheet saleId={r.saleId} storeId={staging.storeId} cashierId={staging.cashierId ?? null} storeName={r.storeName} cashierName={r.cashier.name} onClose={() => setShowPickup(false)} onSaved={onClose} />
            ) : null}
          </div>
        ) : null}

        {hasCustomer && savedEmail && !online ? (
          <div style={{ fontSize: 11, color: palette.muted2, textAlign: "center" }}>Offline — email indisponib</div>
        ) : null}

        {/* Receipt options */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: palette.muted2, textAlign: "center", letterSpacing: 0.2 }}>
            Kijan ou vle resi a?
          </div>
          {hasCustomer && savedEmail && online ? (
            <Button label={`Email • ${savedEmail}`} icon="external" block onClick={() => emailReceipt(savedEmail, { ...r, customer })} />
          ) : null}
          <Button label="Print receipt" icon="print" variant="soft" block onClick={doPrint} />
          <Button label="Share" icon="upload" variant="soft" block onClick={shareReceipt} />
          {isSale ? <Button label="Pa vle resi" icon="close" variant="danger" block onClick={paVleResi} /> : null}
        </div>
      </div>
      {printArea}

      {/* Options menu — customer actions */}
      {menuVisible ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(22,19,12,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setMenuVisible(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: palette.surface, borderRadius: `${radius.lg} ${radius.lg} 0 0`, width: "min(560px, 100%)", padding: 18, paddingBottom: 28, display: "flex", flexDirection: "column", gap: 12, maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ width: 36, height: 4, background: palette.hairlineStrong, borderRadius: 2, alignSelf: "center" }} />
            {menuView === "main" ? (
              <>
                {hasCustomer ? (
                  <Button label="View customer" icon="user" block onClick={() => setMenuView("view")} />
                ) : (
                  <Button label="Add customer" icon="user-add" block onClick={() => setMenuView("add")} />
                )}
                <Button label="Fèmen" variant="ghost" block onClick={() => setMenuVisible(false)} />
              </>
            ) : menuView === "view" ? (
              <>
                <ModalHeader title={customer?.name ?? "Kliyan"} onClose={() => setMenuVisible(false)} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6, background: palette.surfaceGrouped, borderRadius: radius.md, padding: 12 }}>
                  {customer?.phone ? <SumRow label="Tel" value={customer.phone} /> : null}
                  {savedEmail ?? customer?.email ? <SumRow label="Email" value={savedEmail ?? customer?.email ?? ""} /> : null}
                  {customer?.idCard ? <SumRow label="ID" value={customer.idCard} strong /> : null}
                  {custDebt != null && custDebt > 0 ? <SumRow label="Dèt" value={`${fmt(custDebt)} HTG`} strong tint={palette.danger} /> : null}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button label="Retounen" variant="ghost" style={{ flex: 1 }} onClick={() => setMenuView("main")} />
                  <Button label="OK" style={{ flex: 1 }} onClick={() => setMenuVisible(false)} />
                </div>
              </>
            ) : (
              <>
                <ModalHeader title="Add customer" onClose={() => setMenuVisible(false)} />
                <TextInput value={newName} onChange={setNewName} placeholder="Non konplè *" />
                <TextInput value={newPhone} onChange={setNewPhone} numeric placeholder="Telefòn" />
                <TextInput value={newEmail} onChange={setNewEmail} placeholder="Email" />
                <TextInput value={newIdCard} onChange={setNewIdCard} placeholder="Nimewo kat idantite" />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button label="Retounen" variant="ghost" style={{ flex: 1 }} onClick={() => setMenuView("main")} />
                  <Button label={savingCust ? "…" : "Anrejistre"} style={{ flex: 2 }} disabled={savingCust} onClick={saveCustomer} />
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </Overlay>
  );
}
