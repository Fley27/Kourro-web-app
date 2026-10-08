// STAGING-PICKUP: post-payment sheet + redemption. Web version.
import React, { useEffect, useState } from "react";
import { palette, radius } from "../lib/theme";
import { Button, Field, ModalHeader, Overlay, TextInput, toast } from "../components/ui";
import { findSaleForPickup, recordPickup, setTakenTotal, listOpenPickups, toNum, remainingOf } from "./store";
import { printPickupReceipt, type PickupReceiptLine } from "./receipt";
import { PAYMENT_LABELS } from "../lib/i18n";

export function PickupReceiptExtra({ items, saleId }: { items: any[]; saleId: string }) {
  const open = (items ?? []).filter(it => remainingOf(it) > 0);
  if (!open.length) return null;
  return (
    <div style={{ marginTop: 8, background: palette.warningBg, border: `1px solid ${palette.warningBd}`, borderRadius: radius.md, padding: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 11, color: palette.warning }}>RETE POU PRAN</div>
      {open.map(it => (
        <div key={it.id} style={{ fontSize: 11, color: palette.warning, marginTop: 2 }}>
          {it.product_name}: rete {remainingOf(it)}
        </div>
      ))}
      <div style={{ fontSize: 10, color: palette.muted2, marginTop: 4 }}>ID pou rekipere: {saleId}</div>
    </div>
  );
}

export function PickupSheet({ saleId, storeId, cashierId, storeName, cashierName, onClose, onSaved }: {
  saleId: string | null;
  storeId: string;
  cashierId?: string | null;
  storeName?: string | null;
  cashierName?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [lines, setLines] = useState<any[]>([]);
  const [saleNumber, setSaleNumber] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saleId) return;
    findSaleForPickup(storeId, saleId).then(found => {
      if (!found) { setLines([]); return; }
      setSaleNumber(found.sale.sale_number ?? found.sale.id);
      setLines(found.items);
      const init: Record<string, string> = {};
      for (const it of found.items) init[it.id] = String(toNum(it.quantity_delivered ?? it.quantity));
      setInputs(init);
    }).catch(() => {});
  }, [saleId, storeId]);
  if (!saleId) return null;
  function parsed(it: any): number | null {
    const raw = String(inputs[it.id] ?? "").trim();
    if (!raw) return toNum(it.quantity); // empty = taken all of this product
    return toNum(raw);
  }
  const hasError = lines.some(it => {
    const v = parsed(it);
    return v != null && (!(v >= 0) || v - toNum(it.quantity) > 0.000001);
  });
  async function save() {
    if (!saleId) return;
    setSaving(true);
    try {
      const taken: Record<string, number> = {};
      for (const it of lines) {
        const raw = String(inputs[it.id] ?? "").trim();
        taken[it.id] = raw ? toNum(raw) : toNum(it.quantity); // empty = taken all
      }
      const touched = await setTakenTotal({ storeId, saleId, taken, cashierId });
      // Success: reload ALL products (even fully taken) + sale totals,
      // print the receipt, then go back to sales for the next sale.
      const fresh = await findSaleForPickup(storeId, saleId).catch(() => null);
      const allItems = fresh?.items ?? lines;
      const sale = fresh?.sale ?? null;
      const receiptLines: PickupReceiptLine[] = allItems.map((it: any) => {
        const bought = toNum(it.quantity);
        const takenNow = toNum(it.quantity_delivered ?? bought);
        return {
          name: it.product_name ?? "—",
          bought,
          taken: Math.round(takenNow * 100) / 100,
          remaining: Math.max(0, Math.round((bought - takenNow) * 100) / 100),
          unitPrice: Number(it.unit_price ?? 0) || undefined,
          lineTotal: Number(it.line_total ?? 0) || undefined,
        };
      });
      const total = Number(sale?.total ?? 0);
      const paid = Number(sale?.amount_paid ?? total);
      const due = Number(sale?.amount_due ?? 0);
      const pm = String(sale?.payment_method ?? "");
      try {
        printPickupReceipt({
          kind: "partial",
          storeName: storeName ?? "Jesyon Magazen",
          saleNumber,
          saleId,
          createdAt: new Date().toISOString(),
          cashierName: cashierName ?? "Kesye",
          customerName: fresh?.customer?.name ?? null,
          lines: receiptLines,
          total,
          change: Math.max(0, Math.round((paid - total) * 100) / 100),
          balance: due,
          saleType: (PAYMENT_LABELS as any)[pm] ?? pm ?? "—",
          isCredit: pm === "credit",
        });
      } catch {}
      const still = touched.filter(t => t.remainingAfter > 0.000001);
      toast("Sove ✓ • Resi enprime", still.length
        ? `${still.map(t => `${t.product_name}: achte ${toNum(t.quantity)}, pran ${t.takenNow}, rete ${t.remainingAfter}`).join(", ")} • ID: ${saleId}`
        : "Tout pran. Balans 0.", "success");
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast("Bloke", e?.message ?? "Anrejistre echwe", "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Overlay onClose={onClose} width={560}>
      <ModalHeader title="Partial pickup" sub={`Vant ${saleNumber} • konbyen y ap pran avèk yo? (vid = tout)`} onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "50vh", overflow: "auto" }}>
        {lines.map(it => {
          const bought = toNum(it.quantity);
          const v = parsed(it);
          const over = v != null && v - bought > 0.000001;
          const invalid = v != null && !(v >= 0);
          const bal = v == null ? bought - toNum(it.quantity_delivered ?? bought) : bought - v;
          const bad = over || invalid;
          return (
            <div key={it.id} style={{ border: `1px solid ${bad ? palette.danger : palette.hairline}`, background: bad ? palette.dangerBg : "#fff", borderRadius: radius.md, padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{it.product_name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: palette.surfaceGrouped, borderRadius: radius.md, padding: "7px 10px", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 800, letterSpacing: 0.5 }}>ACHTE</span>
                <span className="num" style={{ fontWeight: 800, fontSize: 15 }}>{bought}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Field label="Pran avèk yo">
                  <TextInput numeric value={inputs[it.id] ?? ""} onChange={val => setInputs(p => ({ ...p, [it.id]: val }))} placeholder={String(bought)} />
                </Field>
              </div>
              {over ? (
                <div style={{ fontSize: 11, color: palette.danger, fontWeight: 700, marginTop: 4 }}>Pa ka depase {bought} achte.</div>
              ) : invalid ? (
                <div style={{ fontSize: 11, color: palette.danger, fontWeight: 700, marginTop: 4 }}>Kantite pa valab.</div>
              ) : (
                <div className="num" style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: bal > 0.000001 ? palette.warning : palette.success }}>
                  Balans: {Math.round(bal * 100) / 100}{bal > 0.000001 ? " (rete pou rekipere)" : " (tout pran)"}
                </div>
              )}
            </div>
          );
        })}
        {!lines.length ? <div style={{ color: palette.muted2, fontSize: 12, textAlign: "center" }}>Pa gen liy.</div> : null}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={onClose} />
        <Button label={saving ? "Ap anrejistre…" : "Anrejistre balans"} style={{ flex: 2 }} disabled={saving || hasError} onClick={save} />
      </div>
    </Overlay>
  );
}

export function RedeemPickup({ storeId, cashierId, storeName, cashierName, onClose }: {
  storeId: string;
  cashierId?: string | null;
  storeName?: string | null;
  cashierName?: string | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [saleNumber, setSaleNumber] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [openList, setOpenList] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function search() {
    const found = await findSaleForPickup(storeId, query).catch(() => null);
    if (!found) { toast("Pa jwenn", `Pa gen vant pou "${query}".`, "warn"); return; }
    const open = found.items.filter((it: any) => remainingOf(it) > 0);
    if (!open.length) { toast("Pa gen balans", "Tout machandiz vant sa a deja pran.", "warn"); return; }
    setSaleId(found.sale.id);
    setSaleNumber(found.sale.sale_number ?? found.sale.id);
    setLines(found.items);
    const init: Record<string, string> = {};
    for (const it of open) init[it.id] = String(remainingOf(it));
    setInputs(init);
  }
  async function searchOpen() {
    const rows = await listOpenPickups(storeId, { q: query }).catch(() => []);
    setOpenList(rows.slice(0, 20));
  }
  async function save() {
    if (!saleId) return;
    setSaving(true);
    try {
      const taken: Record<string, number> = {};
      for (const it of lines) {
        if (remainingOf(it) <= 0.000001) continue;
        const raw = String(inputs[it.id] ?? "").trim();
        // empty = taken all that remains of this product
        taken[it.id] = raw ? toNum(raw) : remainingOf(it);
      }
      const touched = await recordPickup({ storeId, saleId, taken, cashierId });
      // Success: reload ALL products (even fully taken) + sale totals,
      // print the receipt, then back to sales.
      const fresh = await findSaleForPickup(storeId, saleId).catch(() => null);
      const allItems = fresh?.items ?? lines;
      const sale = fresh?.sale ?? null;
      const receiptLines: PickupReceiptLine[] = allItems.map((it: any) => {
        const bought = toNum(it.quantity);
        const takenNow = toNum(it.quantity_delivered ?? bought);
        return {
          name: it.product_name ?? "—",
          bought,
          taken: Math.round(takenNow * 100) / 100,
          remaining: Math.max(0, Math.round((bought - takenNow) * 100) / 100),
          unitPrice: Number(it.unit_price ?? 0) || undefined,
          lineTotal: Number(it.line_total ?? 0) || undefined,
        };
      });
      const total = Number(sale?.total ?? 0);
      const paid = Number(sale?.amount_paid ?? total);
      const due = Number(sale?.amount_due ?? 0);
      const pm = String(sale?.payment_method ?? "");
      try {
        printPickupReceipt({
          kind: "redeem",
          storeName: storeName ?? "Jesyon Magazen",
          saleNumber,
          saleId,
          createdAt: new Date().toISOString(),
          cashierName: cashierName ?? "Kesye",
          customerName: fresh?.customer?.name ?? null,
          lines: receiptLines,
          total,
          change: Math.max(0, Math.round((paid - total) * 100) / 100),
          balance: due,
          saleType: (PAYMENT_LABELS as any)[pm] ?? pm ?? "—",
          isCredit: pm === "credit",
        });
      } catch {}
      const still = touched.filter(t => t.remainingAfter > 0);
      toast("Rekipere ✓ • Resi enprime", still.length
        ? `${touched.map(t => `${t.product_name}: achte ${toNum(t.quantity)}, pran ${t.takenNow}, rete ${t.remainingAfter}`).join(", ")} • ID: ${saleId}`
        : `Tout pran. Balans 0.`, "success");
      setLines([]); setSaleId(null); setInputs({}); setQuery("");
      onClose();
    } catch (e: any) {
      toast("Bloke", e?.message ?? "Rekipere echwe", "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Overlay onClose={onClose} width={560}>
      <ModalHeader title="Rekipere machandiz" sub="ID / VTE-… • ka repete jiskaske 0" onClose={onClose} />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><TextInput value={query} onChange={setQuery} placeholder="ID oswa VTE-…, non kliyan, pwodwi" /></div>
        <Button label="Chèche" onClick={search} />
      </div>
      <button onClick={searchOpen} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", color: palette.muted2, fontSize: 12, fontWeight: 700 }}>
        Pèdi resi? Lis vant ki gen balans
      </button>
      {openList.length > 0 ? (
        <div style={{ maxHeight: 140, overflow: "auto", marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          {openList.map(r => (
            <button key={r.sale.id} onClick={() => { setQuery(r.sale.sale_number ?? r.sale.id); setOpenList([]); }}
              style={{ textAlign: "left", padding: 10, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, background: "#fff", cursor: "pointer" }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>{r.sale.sale_number} • {r.customer?.name ?? "—"}</div>
              <div style={{ fontSize: 11, color: palette.muted2 }}>{r.openItems.map((it: any) => `${it.product_name} (rete ${remainingOf(it)})`).join(", ")}</div>
            </button>
          ))}
        </div>
      ) : null}
      {saleId ? (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflow: "auto" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Vant {saleNumber}</div>
          {lines.filter(it => remainingOf(it) > 0.000001).map(it => (
            <div key={it.id} style={{ border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{it.product_name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: palette.surfaceGrouped, borderRadius: radius.md, padding: "7px 10px", marginTop: 6 }}>
                <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 800, letterSpacing: 0.5 }}>ACHTE</span>
                <span className="num" style={{ fontWeight: 800, fontSize: 15 }}>{toNum(it.quantity)}</span>
              </div>
              <div style={{ fontSize: 11, color: palette.warning, fontWeight: 700, marginTop: 4 }}>Rete pou pran: {remainingOf(it)}</div>
              <div style={{ marginTop: 8 }}>
                <Field label="Kantite k ap pran kounye a">
                  <TextInput numeric value={inputs[it.id] ?? ""} onChange={v => setInputs(p => ({ ...p, [it.id]: v }))} placeholder="0" />
                </Field>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Button label="Fèmen" variant="ghost" style={{ flex: 1 }} onClick={onClose} />
        {saleId ? <Button label={saving ? "Ap anrejistre…" : "Konfime rekipere"} style={{ flex: 2 }} disabled={saving} onClick={save} /> : null}
      </div>
    </Overlay>
  );
}
