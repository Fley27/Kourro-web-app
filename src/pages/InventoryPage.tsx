import React, { useEffect, useState } from "react";
import { getDb } from "../lib/db";
import { useAuthStore } from "../lib/authStore";
import { palette, radius, shadow } from "../lib/theme";
import { fmt, monoStyle } from "../lib/format";
import { salesEvents } from "../lib/salesEvents";
import { useResponsive } from "../lib/responsive";
import {
  loadPricing, ensurePricingForProducts, getUnitsForProduct,
  getDefaultUnit, getDisplayPrice, DEFAULT_VARIANT, type PricingMaps, type ProductUnit,
} from "../lib/pricing";
import { Button, Card, EmptyState, Field, ModalHeader, Overlay, SearchBar, TextInput, toast } from "../components/ui";
import { Icon } from "../components/Icon";

type Category = { id: string; name: string; icon: string; color: string };
type Product = { id: string; name: string; sku?: string; barcode?: string; category_id?: string; unit?: string; cost_price: number; selling_price?: number; stock_quantity: number };
type InvBubble = { productId: string; name: string; sku?: string; unitId: string; unitName: string; factor: number; unit?: string; qty: number; costPrice: number; sellPrice: number };
type PriceReviewRow = { unitId: string; unitName: string; variant: string; priceId: string | null; price: string };
type PriceReviewProduct = { productId: string; name: string; rows: PriceReviewRow[] };

const STORE_ID = "demo-store-id";

// ── Desktop header + stepper ──

function StepIndicator({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, title: "Chwazi pwodwi", desc: "Ajoute atik & pri" },
    { n: 2, title: "Detay livrezon", desc: "Founisè, transpò, dat" },
  ] as const;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      {steps.map((s, i) => {
        const state = step === s.n ? "active" : step > s.n ? "done" : "idle";
        return (
          <React.Fragment key={s.n}>
            {i > 0 ? <div style={{ width: 44, height: 2, borderRadius: 1, background: step > 1 ? palette.accentGold : palette.separator }} /> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                background: state === "active" ? palette.ink2 : state === "done" ? palette.accentGold : palette.surfaceGrouped,
                color: state === "idle" ? palette.muted3 : "#fff", fontWeight: 800, fontSize: 11.5, flexShrink: 0,
              }}>
                {state === "done" ? <Icon name="checkmark" size={13} color="#fff" /> : s.n}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: state === "idle" ? palette.muted2 : palette.ink, whiteSpace: "nowrap" }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: palette.muted3, marginTop: 1, whiteSpace: "nowrap" }}>{s.desc}</div>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PageHeader({ step, canInventory, onClear }: { step: 1 | 2; canInventory: boolean; onClear: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 10.5, color: palette.accentGold, fontWeight: 800, letterSpacing: 1.1, textTransform: "uppercase" }}>Stòk • Livrezon</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: palette.ink, letterSpacing: -0.5, marginTop: 3 }}>Antre stòk</div>
        <div style={{ fontSize: 12.5, color: palette.muted, marginTop: 3 }}>Ajoute livrezon — pwodwi, kantite, pri acha & transpò.</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        <StepIndicator step={step} />
        {!canInventory ? (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: palette.warning, background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: 999, padding: "4px 10px" }}>
            Rejim lecture — Owner/Admin/Manager sèlman
          </span>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: palette.muted2, background: palette.surfaceGrouped, borderRadius: 999, padding: "4px 10px" }}>
            {step === 1 ? "Etap 1/2 · Pwodwi" : "Etap 2/2 · Detay"}
          </span>
        )}
      </div>
    </div>
  );
}

function ProductCardView({ p, pcats, inShip, onClick, canInventory, price }: {
  p: Product; pcats: Category[]; inShip: boolean; onClick: () => void; canInventory: boolean; price: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 11, background: palette.surface,
        borderRadius: radius.md, border: `1px solid ${inShip ? "rgba(200,162,74,0.65)" : palette.hairline}`,
        padding: 12, boxShadow: shadow.soft, cursor: canInventory ? "pointer" : "default", textAlign: "left",
        fontFamily: "inherit", height: "100%", transition: "border-color .12s ease, transform .06s ease",
      }}
      onMouseEnter={e => { if (canInventory) (e.currentTarget as HTMLElement).style.borderColor = "rgba(200,162,74,0.55)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = inShip ? "rgba(200,162,74,0.65)" : palette.hairline; }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: inShip ? palette.accentGoldSoft : palette.surfaceGrouped, border: `0.5px solid ${inShip ? palette.accentGold : palette.separatorSoft}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="box" size={17} color={inShip ? palette.accentGold : palette.muted2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9.5, color: palette.muted, fontWeight: 600 }}>{p.sku}</span>
          {pcats.slice(0, 2).map(c => (
            <span key={c.id} style={{ background: palette.surfaceGrouped, borderRadius: 6, padding: "2px 5px", fontSize: 9, fontWeight: 600, color: palette.muted2 }}>{c.name}</span>
          ))}
        </div>
      </div>
      <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: palette.ink, textAlign: "right", ...monoStyle }} className="num">{price}</span>
        <span style={{ fontSize: 9, color: palette.muted, marginTop: 1 }} className="num">{p.stock_quantity} pcs</span>
      </div>
      {inShip ? (
        <span style={{ background: palette.accentGold, borderRadius: 8, padding: "3px 7px", color: "#fff", fontSize: 9.5, fontWeight: 800, flexShrink: 0 }}>✓</span>
      ) : (
        <span style={{ width: 24, height: 24, borderRadius: 999, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="plus" size={14} color={palette.ink2} />
        </span>
      )}
    </button>
  );
}

// ── Cart panel (desktop right rail) ──

function CartRail({ bubbles, canEdit, onEdit, onRemove, onClear, onNext, stepAccount }: {
  bubbles: InvBubble[]; canEdit: boolean; onEdit: (idx: number, b: InvBubble) => void; onRemove: (idx: number) => void;
  onClear: () => void; onNext?: () => void; stepAccount: "add" | "finish";
}) {
  const totalItems = bubbles.reduce((s, b) => s + b.qty * b.costPrice, 0);
  return (
    <Card style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name="layers" size={16} color={palette.accentGold} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: palette.ink, letterSpacing: -0.2 }}>Livrezon an</div>
          <div style={{ fontSize: 10.5, color: palette.muted2 }} className="num">{bubbles.length} pwodwi · {fmt(bubbles.reduce((s, b) => s + b.qty, 0))} atik</div>
        </div>
        {bubbles.length > 0 ? (
          <button onClick={onClear} style={{ display: "flex", alignItems: "center", gap: 4, background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, borderRadius: 999, padding: "5px 10px", fontSize: 10.5, fontWeight: 700, color: palette.danger, cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="trash" size={12} /> Vide
          </button>
        ) : null}
      </div>

      {bubbles.length === 0 ? (
        <div style={{ padding: "22px 10px", textAlign: "center" }}>
          <Icon name="package" size={24} color={palette.muted3} />
          <div style={{ fontSize: 12, fontWeight: 600, color: palette.muted2, marginTop: 6 }}>Panyen vid — ajoute pwodwi nan livrezon an.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 360, overflowY: "auto", paddingRight: 2 }}>
            {bubbles.map((b, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, background: palette.surfaceGrouped, borderRadius: radius.sm, border: `0.5px solid ${palette.hairline}`, padding: "8px 10px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: palette.muted, marginTop: 1 }} className="num">
                    {b.qty} {b.unitName ?? b.unit ?? "pcs"} <span style={{ color: palette.muted3 }}>×</span> {fmt(b.costPrice)} HTG{Number(b.factor) > 1 ? ` (${fmt(b.qty * Number(b.factor))} baz)` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: palette.ink, ...monoStyle }} className="num">{fmt(b.qty * b.costPrice)}</span>
                {b.sellPrice > 0 ? <span style={{ background: palette.accentGoldSoft, borderRadius: 6, padding: "2px 6px", fontSize: 9.5, fontWeight: 700, color: palette.accentGold, whiteSpace: "nowrap" }} className="num">vann {fmt(b.sellPrice)}</span> : null}
                {canEdit ? (
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => onEdit(idx, b)} style={{ width: 26, height: 26, borderRadius: 8, background: "#fff", border: `0.5px solid ${palette.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Modifye">
                      <Icon name="edit" size={12} color={palette.ink} />
                    </button>
                    <button onClick={() => onRemove(idx)} style={{ width: 26, height: 26, borderRadius: 8, background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Retire">
                      <Icon name="trash" size={12} color={palette.danger} />
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ borderTop: `0.5px solid ${palette.hairline}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>Sou-total atik</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: palette.ink, ...monoStyle }} className="num">{fmt(totalItems)} HTG</span>
            </div>
            {stepAccount === "add" ? (
              <Button label="Founisè & Transpò →" icon="arrow-right" variant="primary" block disabled={bubbles.length === 0} onClick={onNext} />
            ) : null}
          </div>
        </>
      )}
    </Card>
  );
}

export function InventoryPage() {
  const { width, isTablet, padH } = useResponsive();
  const wide = width >= 900;
  const { user } = useAuthStore();
  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const canInventory = role === "owner" || role === "admin" || role === "manager";
  const currentUser = user;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCategories, setProductCategories] = useState<{ product_id: string; category_id: string }[]>([]);
  const [pricing, setPricing] = useState<PricingMaps>({ units: [], prices: [], bundles: [] });

  const [invStep, setInvStep] = useState<1 | 2>(1);
  const [invBubbles, setInvBubbles] = useState<InvBubble[]>([]);
  const [invSelectedProduct, setInvSelectedProduct] = useState<Product | null>(null);
  const [invSelUnitId, setInvSelUnitId] = useState("");
  const [invInputQty, setInvInputQty] = useState("");
  const [invInputCost, setInvInputCost] = useState("");
  const [invInputSell, setInvInputSell] = useState("");
  const [invEditIdx, setInvEditIdx] = useState<number | null>(null);
  const [invShowCart, setInvShowCart] = useState(false);
  const [invError, setInvError] = useState("");
  const [invSupplier, setInvSupplier] = useState("");
  const [invTransport, setInvTransport] = useState("");
  const [invDate, setInvDate] = useState<Date>(new Date());
  const [invShowDatePicker, setInvShowDatePicker] = useState(false);
  const [invReference, setInvReference] = useState<string>(() => `LIV-${Date.now().toString().slice(-6)}`);
  const [invNotes, setInvNotes] = useState("");
  const [invProductSearch, setInvProductSearch] = useState("");
  const [priceReview, setPriceReview] = useState<PriceReviewProduct[] | null>(null);
  const [priceReviewSummary, setPriceReviewSummary] = useState("");

  function emitChange() {
    try { salesEvents.emit(); } catch {}
  }

  async function load() {
    const db = await getDb();
    try {
      const rows = (await db.getAllAsync("SELECT * FROM products WHERE is_deleted=0 OR is_deleted IS NULL")) as Product[];
      setProducts(rows);
      const pc = (await db.getAllAsync("SELECT * FROM product_categories")) as any[];
      setProductCategories(pc);
      const cats = (await db.getAllAsync("SELECT * FROM categories")) as any[];
      setCategories(cats);
      try {
        const pm = await ensurePricingForProducts(db, rows);
        setPricing(pm);
      } catch {}
    } catch {}
  }
  useEffect(() => {
    load();
    let unsub: (() => void) | null = null;
    try { unsub = salesEvents.subscribe(load); } catch {}
    return () => { if (unsub) unsub(); };
  }, []);

  function displayPriceFor(p: Product): string {
    const d = getDisplayPrice(pricing, p.id);
    if (d && d.price > 0) return `${fmt(d.price)} HTG`;
    const legacy = Number(p.selling_price ?? 0) || 0;
    return legacy > 0 ? `${fmt(legacy)} HTG` : "—";
  }
  function unitsFor(productId: string): ProductUnit[] {
    return getUnitsForProduct(pricing, productId);
  }
  function selUnit(): ProductUnit | null {
    if (!invSelectedProduct) return null;
    const us = unitsFor(invSelectedProduct.id);
    return us.find(u => u.id === invSelUnitId) ?? getDefaultUnit(us);
  }
  function unitSellPrice(unitId: string): string {
    if (!unitId) return "";
    const rows = pricing.prices.filter(r => r.unit_id === unitId);
    const row = rows.find(r => r.variant === DEFAULT_VARIANT) ?? rows[0];
    return row && Number(row.price) > 0 ? String(row.price) : "";
  }
  function getProductCats(productId: string): string[] {
    const linked = productCategories.filter(pc => pc.product_id === productId).map(pc => pc.category_id);
    if (linked.length) return linked;
    const prod = products.find(p => p.id === productId);
    if (prod?.category_id) return [prod.category_id];
    return [];
  }
  function getProductCategoriesDisplay(productId: string): Category[] {
    const ids = getProductCats(productId);
    return ids.map(id => categories.find(c => c.id === id)).filter(Boolean) as Category[];
  }

  function invTotalItemsCost() {
    return invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0);
  }
  function invTotalTransport() {
    return parseFloat(invTransport) || 0;
  }

  async function handleCreateInventory() {
    if (!canInventory) { setInvError("Pa gen dwa — se sèlman Owner/Admin/Manager ka fè antre stòk"); return; }
    if (invBubbles.length === 0) { setInvError("Ajoute omwen yon pwodwi nan livrezon an"); return; }
    for (const b of invBubbles) {
      if (isNaN(b.qty) || b.qty <= 0) { setInvError(`Kantite pa valab pou ${b.name}`); return; }
      if (isNaN(b.costPrice) || b.costPrice < 0) { setInvError(`Pri acha pa valab pou ${b.name}`); return; }
    }
    const transport = invTotalTransport();
    if (transport < 0) { setInvError("Frè transpò pa valab"); return; }
    const totalItems = invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0);
    const batchId = `batch-${Date.now()}`;
    const reference = invReference.trim() || `LIV-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    const receivedAt = invDate.toISOString();
    const totalCost = totalItems + transport;
    try {
      const db = await getDb();
      await db.runAsync("INSERT INTO stock_batches (id, store_id, reference, supplier, transport_cost, notes, total_items_cost, total_cost, received_at, created_by, created_at, updated_at, status, delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [batchId, STORE_ID, reference, invSupplier.trim() || null, transport, invNotes.trim() || null, totalItems, totalCost, receivedAt, currentUser?.id ?? "system", now, now, "pending", null]);
      for (const b of invBubbles) {
        const qty = b.qty;
        const factor = Number(b.factor) || 1;
        const baseQty = qty * factor;
        const unitCost = factor > 0 ? b.costPrice / factor : b.costPrice;
        const lineTotal = qty * b.costPrice;
        const allocated = totalItems > 0 ? (lineTotal / totalItems) * transport : (transport / invBubbles.length);
        const totalLine = lineTotal + allocated;
        const movId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await db.runAsync("INSERT INTO stock_movements (id, batch_id, store_id, product_id, type, quantity, initial_qty, remaining_qty, unit_cost, total_cost, allocated_transport, reason, created_by, created_at, status, delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [movId, batchId, STORE_ID, b.productId, "in", baseQty, baseQty, baseQty, unitCost, totalLine, allocated, invNotes.trim() || null, currentUser?.id ?? "system", now, "pending", null]);
        if (!isNaN(b.sellPrice) && b.sellPrice > 0) {
          try {
            const punits = ((await db.getAllAsync("SELECT * FROM product_units WHERE product_id = ?", [b.productId])) as any[]) ?? [];
            let punit = punits.find((u: any) => u.id === b.unitId) ?? punits.find((u: any) => Number(u.conversion_factor) === 1) ?? punits[0];
            if (!punit) {
              const nuid = `unit-${b.productId}-base`;
              await db.runAsync("INSERT OR REPLACE INTO product_units (id, product_id, unit_name, conversion_factor, created_at, updated_at) VALUES (?,?,?,?,?,?)", [nuid, b.productId, b.unitName ?? "Unit", 1, now, now]);
              punit = { id: nuid };
            }
            const prows = ((await db.getAllAsync("SELECT * FROM product_prices WHERE unit_id = ?", [punit.id])) as any[]) ?? [];
            const prow = prows.find((r: any) => r.variant === DEFAULT_VARIANT) ?? prows[0];
            if (prow) {
              await db.runAsync("UPDATE product_prices SET price = ?, updated_at = ? WHERE id = ?", [b.sellPrice, now, prow.id]);
            } else {
              const newPid = `price-${b.productId}-regular`;
              await db.runAsync("INSERT INTO product_prices (id, unit_id, variant, price, updated_at) VALUES (?,?,?,?,?)", [newPid, punit.id, DEFAULT_VARIANT, b.sellPrice, now]);
            }
          } catch {}
        }
      }
      const summary = `${reference} • ${invBubbles.length} pwodwi • ${fmt(totalCost)} HTG (transpò ${fmt(transport)} HTG) • dat ${invDate.toLocaleDateString()}. Stòk la parèt nan "Livrezon" jouk li rive.`;
      const review: PriceReviewProduct[] = [];
      for (const b of invBubbles) {
        const units = ((await db.getAllAsync("SELECT * FROM product_units WHERE product_id = ?", [b.productId])) as any[]) ?? [];
        const rows: PriceReviewRow[] = [];
        for (const u of units) {
          const prs = ((await db.getAllAsync("SELECT * FROM product_prices WHERE unit_id = ?", [u.id])) as any[]) ?? [];
          if (!prs.length) rows.push({ unitId: u.id, unitName: u.unit_name, variant: DEFAULT_VARIANT, priceId: null, price: "" });
          else for (const r of prs) rows.push({ unitId: u.id, unitName: u.unit_name, variant: r.variant, priceId: r.id, price: String(r.price ?? "") });
        }
        if (rows.length) review.push({ productId: b.productId, name: b.name, rows });
      }
      setInvBubbles([]);
      setInvSupplier(""); setInvTransport(""); setInvNotes("");
      setInvReference(`LIV-${Date.now().toString().slice(-6)}`);
      setInvStep(1);
      try { setPricing(await loadPricing(db)); } catch {}
      await emitChange();
      if (review.length) { setPriceReviewSummary(summary); setPriceReview(review); }
      else toast("Livrezon anrejistre ✓", summary, "success");
    } catch (e: any) {
      setInvError(`Erè baz done: ${e?.message ?? String(e)}`);
    }
  }

  function setReviewRowPrice(pi: number, ri: number, v: string) {
    setPriceReview(prev => prev ? prev.map((p, i) => i === pi ? { ...p, rows: p.rows.map((r, j) => j === ri ? { ...r, price: v.replace(/[^0-9.]/g, "") } : r) } : p) : prev);
  }

  async function finishPriceReview(save: boolean) {
    if (save && priceReview) {
      try {
        const db = await getDb();
        const now = new Date().toISOString();
        for (const p of priceReview) {
          for (const r of p.rows) {
            const v = parseFloat(r.price);
            if (isNaN(v) || v < 0) continue;
            if (r.priceId) {
              await db.runAsync("UPDATE product_prices SET price = ?, updated_at = ? WHERE id = ?", [v, now, r.priceId]);
            } else if (v > 0) {
              const newPid = `price-${r.unitId}-${Date.now().toString().slice(-6)}`;
              await db.runAsync("INSERT INTO product_prices (id, unit_id, variant, price, updated_at) VALUES (?,?,?,?,?)", [newPid, r.unitId, r.variant, v, now]);
            }
          }
        }
        toast("Pri yo sove ✓", undefined, "success");
      } catch {}
    }
    setPriceReview(null);
    await emitChange();
  }

  function invOpenAddSheet(p: Product) {
    if (!canInventory) { setInvError("Pa gen dwa — se sèlman Owner/Admin/Manager ka fè antre stòk"); return; }
    setInvSelectedProduct(p);
    setInvEditIdx(null);
    const units = unitsFor(p.id);
    const du = getDefaultUnit(units);
    setInvSelUnitId(du?.id ?? "");
    setInvInputQty("");
    setInvInputCost(p.cost_price ? String(p.cost_price) : "");
    const dp = getDisplayPrice(pricing, p.id);
    setInvInputSell(dp && dp.price > 0 ? String(dp.price) : (p.selling_price ? String(p.selling_price) : ""));
    setInvError("");
  }
  function invOpenEditSheet(idx: number, bubble: InvBubble) {
    const p = products.find(pr => pr.id === bubble.productId) ?? null;
    setInvSelectedProduct(p);
    setInvEditIdx(idx);
    setInvSelUnitId(bubble.unitId ?? "");
    setInvInputQty(String(bubble.qty));
    setInvInputCost(String(bubble.costPrice));
    setInvInputSell(String(bubble.sellPrice > 0 ? bubble.sellPrice : unitSellPrice(bubble.unitId ?? "")));
    setInvError("");
    setInvShowCart(false);
  }
  function invCloseAddSheet() {
    setInvSelectedProduct(null);
    setInvEditIdx(null);
    setInvSelUnitId("");
    setInvInputQty(""); setInvInputCost(""); setInvInputSell("");
  }
  function handleInvAjoute() {
    if (!invSelectedProduct) return;
    const qty = parseFloat(invInputQty) || 0;
    const cost = parseFloat(invInputCost) || 0;
    const sell = parseFloat(invInputSell) || 0;
    if (qty <= 0) { setInvError("Antre yon kantite valid (> 0)"); return; }
    if (cost < 0) { setInvError("Pri acha pa ka negatif"); return; }
    if (sell < 0) { setInvError("Pri vann pa ka negatif"); return; }
    const units = unitsFor(invSelectedProduct.id);
    const u = units.find(x => x.id === invSelUnitId) ?? getDefaultUnit(units);
    const unitId = u?.id ?? "";
    const unitName = u?.unit_name ?? invSelectedProduct.unit ?? "Unit";
    const factor = Number(u?.conversion_factor) || 1;
    const bubble: InvBubble = { productId: invSelectedProduct.id, name: invSelectedProduct.name, sku: invSelectedProduct.sku, unitId, unitName, factor, unit: unitName, qty, costPrice: cost, sellPrice: sell };
    if (invEditIdx !== null) {
      setInvBubbles(prev => prev.map((b, i) => i === invEditIdx ? bubble : b));
    } else {
      const existing = invBubbles.findIndex(b => b.productId === bubble.productId && (b.unitId || "") === (bubble.unitId || ""));
      if (existing >= 0) setInvBubbles(prev => prev.map((b, i) => i === existing ? { ...b, qty: b.qty + bubble.qty, costPrice: bubble.costPrice, sellPrice: bubble.sellPrice } : b));
      else setInvBubbles(prev => [...prev, bubble]);
    }
    invCloseAddSheet();
  }
  function handleInvRemoveBubble(idx: number) {
    setInvBubbles(prev => prev.filter((_, i) => i !== idx));
  }

  const filtered = products.filter(p => {
    const qq = invProductSearch.toLowerCase();
    if (!qq) return true;
    return p.name.toLowerCase().includes(qq) || (p.sku ?? "").toLowerCase().includes(qq) || (p.barcode ?? "").toLowerCase().includes(qq);
  });

  const sel = invSelectedProduct;
  const qtyLine = (parseFloat(invInputQty) || 0) * (parseFloat(invInputCost) || 0);

  const clearCart = () => { setInvBubbles([]); setInvShowCart(false); };

  return (
    <div style={{ minHeight: "100vh", background: palette.bg, position: "relative" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: padH, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <PageHeader step={invStep} canInventory={canInventory} onClear={clearCart} />

        {!canInventory ? (
          <div style={{ background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.warning, marginTop: 14 }}>
            Rejim lecture — se sèlman Owner/Admin/Manager ka fè antre stòk.
          </div>
        ) : null}
        {invError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginTop: 8 }}>{invError}</div> : null}

        {/* ── STEP 1 — catalog + live cart rail ── */}
        {invStep === 1 ? (
          wide ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start", marginTop: 16 }}>
              <section>
                <SearchBar value={invProductSearch} onChange={v => { setInvProductSearch(v); if (invError) setInvError(""); }} placeholder="Chèche pwodwi nan katalòg..." />
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                  {filtered.map(p => (
                    <ProductCardView
                      key={p.id}
                      p={p}
                      pcats={getProductCategoriesDisplay(p.id)}
                      inShip={invBubbles.some(b => b.productId === p.id)}
                      onClick={() => canInventory && invOpenAddSheet(p)}
                      canInventory={canInventory}
                      price={displayPriceFor(p)}
                    />
                  ))}
                </div>
                {filtered.length === 0 && (
                  <div style={{ display: "flex", alignItems: "center", padding: 48, justifyContent: "center" }}>
                    <EmptyState icon="box" title={products.length === 0 ? "Katalòg vid" : "Pwodwi pa jwenn"} body={products.length === 0 ? "Kreye pwodwi anvan nan paj Stock la" : `Pa gen pwodwi pou "${invProductSearch}"`} />
                  </div>
                )}
              </section>
              <aside style={{ position: "sticky", top: 74 }}>
                <CartRail
                  bubbles={invBubbles}
                  canEdit={canInventory}
                  onEdit={invOpenEditSheet}
                  onRemove={handleInvRemoveBubble}
                  onClear={clearCart}
                  onNext={() => setInvStep(2)}
                  stepAccount="add"
                />
              </aside>
            </div>
          ) : (
            <>
              <div style={{ marginTop: 14 }}>
                <SearchBar value={invProductSearch} onChange={v => { setInvProductSearch(v); if (invError) setInvError(""); }} placeholder="Chèche pwodwi nan katalòg..." />
              </div>
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginTop: 12 }}>
                {filtered.map(p => (
                  <ProductCardView
                    key={p.id}
                    p={p}
                    pcats={getProductCategoriesDisplay(p.id)}
                    inShip={invBubbles.some(b => b.productId === p.id)}
                    onClick={() => canInventory && invOpenAddSheet(p)}
                    canInventory={canInventory}
                    price={displayPriceFor(p)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div style={{ display: "flex", alignItems: "center", padding: 40, justifyContent: "center" }}>
                    <EmptyState icon="box" title={products.length === 0 ? "Katalòg vid" : "Pwodwi pa jwenn"} body={products.length === 0 ? "Kreye pwodwi anvan nan paj Stock la" : `Pa gen pwodwi pou "${invProductSearch}"`} />
                  </div>
                )}
              </div>
            </>
          )
        ) : (
          /* ── STEP 2 — delivery details ── */
          wide ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 16, alignItems: "start", marginTop: 16 }}>
              <section style={{ background: palette.surface, borderRadius: radius.md, border: `1px solid ${palette.hairline}`, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="pricetag" size={16} color={palette.accentGold} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: palette.ink, letterSpacing: -0.2 }}>Detay livrezon</div>
                    <div style={{ fontSize: 10.5, color: palette.muted2 }}>Referans, founisè, transpò & dat arive.</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}><Field label="Referans"><TextInput value={invReference} onChange={setInvReference} placeholder="LIV-123456" /></Field></div>
                  <div style={{ flex: 1, minWidth: 200 }}><Field label="Founisè"><TextInput value={invSupplier} onChange={setInvSupplier} placeholder="Eg. Haiti Import" /></Field></div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Field label="Frè transpò HTG" hint="Reparti otomatik sou chak pwodwi">
                      <TextInput value={invTransport} onChange={v => { setInvTransport(v); if (invError) setInvError(""); }} numeric placeholder="0" />
                    </Field>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <Field label="Dat arive *">
                      <button onClick={() => setInvShowDatePicker(!invShowDatePicker)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: radius.md, padding: "12px 14px", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                        <Icon name="package" size={15} color={palette.accentGold} />
                        <span style={{ color: palette.ink, fontWeight: 600, fontSize: 14, flex: 1, textAlign: "left" }}>{invDate.toLocaleDateString()}</span>
                        <Icon name="chevron-down" size={14} color={palette.muted} />
                      </button>
                      {invShowDatePicker && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {[{ label: "Jodi a", delta: 0 }, { label: "Yè", delta: -1 }, { label: "2 jou", delta: -2 }].map(o => (
                            <button key={o.label} onClick={() => { const d = new Date(); d.setDate(d.getDate() + o.delta); setInvDate(d); setInvShowDatePicker(false); }} style={{ background: palette.surfaceGrouped, padding: "6px 10px", borderRadius: radius.pill, border: `1px solid ${palette.hairline}`, fontSize: 11, fontWeight: 600, color: palette.ink, cursor: "pointer", fontFamily: "inherit" }}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>
                </div>
                <Field label="Nòt (opsyonèl)">
                  <TextInput value={invNotes} onChange={setInvNotes} placeholder="Eg. Livrezon maten, wout Delmas" />
                </Field>
              </section>

              <aside style={{ position: "sticky", top: 74, display: "flex", flexDirection: "column", gap: 10 }}>
                <CartRail
                  bubbles={invBubbles}
                  canEdit={false}
                  onEdit={() => {}}
                  onRemove={() => {}}
                  onClear={() => {}}
                  stepAccount="finish"
                />
                {invTotalItemsCost() > 0 && invTotalTransport() > 0 && (
                  <div style={{ background: palette.ink2, borderRadius: radius.md, padding: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>REPARTISYON TRANSPÒ — preview</div>
                    <div style={{ height: 10, display: "flex", borderRadius: 5, overflow: "hidden", marginTop: 8, background: "rgba(255,255,255,0.15)" }}>
                      {invBubbles.map((b, idx) => {
                        const total = invTotalItemsCost();
                        const pct = total > 0 ? (b.qty * b.costPrice) / total * 100 : 0;
                        const colors = [palette.accentGold, palette.successDot, palette.warningDot, "#8B5CF6", "#EC4899"];
                        return <div key={idx} style={{ width: `${pct}%`, background: colors[idx % colors.length] }} />;
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }} className="num">Atik {fmt(invTotalItemsCost())} HTG</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: palette.accentGold }} className="num">+ {fmt(invTotalTransport())} HTG → {fmt(invTotalItemsCost() + invTotalTransport())} HTG revient</span>
                    </div>
                  </div>
                )}
                <Card style={{ padding: 12, display: "flex", gap: 8 }}>
                  <Button label="Retounen" variant="soft" onClick={() => setInvStep(1)} style={{ flex: 1 }} />
                  <Button label="✓ Anrejistre livrezon" variant="primary" onClick={handleCreateInventory} style={{ flex: 2 }} />
                </Card>
              </aside>
            </div>
          ) : (
            <>
              <div style={{ background: palette.surface, borderRadius: radius.md, border: `1px solid ${palette.hairline}`, padding: 12, display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><Field label="Referans"><TextInput value={invReference} onChange={setInvReference} placeholder="LIV-123456" /></Field></div>
                  <div style={{ flex: 1, minWidth: 0 }}><Field label="Founisè"><TextInput value={invSupplier} onChange={setInvSupplier} placeholder="Eg. Haiti Import" /></Field></div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Field label="Frè transpò HTG" hint="Reparti otomatik sou chak pwodwi">
                      <TextInput value={invTransport} onChange={v => { setInvTransport(v); if (invError) setInvError(""); }} numeric placeholder="0" />
                    </Field>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Field label="Dat arive *">
                      <button onClick={() => setInvShowDatePicker(!invShowDatePicker)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: radius.md, padding: "12px 14px", background: palette.surface, cursor: "pointer", fontFamily: "inherit" }}>
                        <Icon name="package" size={15} color={palette.accentGold} />
                        <span style={{ color: palette.ink, fontWeight: 600, fontSize: 14, flex: 1, textAlign: "left" }}>{invDate.toLocaleDateString()}</span>
                        <Icon name="chevron-down" size={14} color={palette.muted} />
                      </button>
                      {invShowDatePicker && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          {[{ label: "Jodi a", delta: 0 }, { label: "Yè", delta: -1 }, { label: "2 jou", delta: -2 }].map(o => (
                            <button key={o.label} onClick={() => { const d = new Date(); d.setDate(d.getDate() + o.delta); setInvDate(d); setInvShowDatePicker(false); }} style={{ background: palette.surfaceGrouped, padding: "6px 10px", borderRadius: radius.pill, border: `1px solid ${palette.hairline}`, fontSize: 11, fontWeight: 600, color: palette.ink, cursor: "pointer", fontFamily: "inherit" }}>
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Field>
                  </div>
                </div>
                <Field label="Nòt (opsyonèl)">
                  <TextInput value={invNotes} onChange={setInvNotes} placeholder="Eg. Livrezon maten, wout Delmas" />
                </Field>
              </div>
              {invTotalItemsCost() > 0 && invTotalTransport() > 0 && (
                <div style={{ background: palette.ink2, borderRadius: radius.sm, padding: 10, marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.4 }}>REPARTISYON TRANSPÒ — preview</div>
                  <div style={{ height: 10, display: "flex", borderRadius: 5, overflow: "hidden", marginTop: 8, background: "rgba(255,255,255,0.15)" }}>
                    {invBubbles.map((b, idx) => {
                      const total = invTotalItemsCost();
                      const pct = total > 0 ? (b.qty * b.costPrice) / total * 100 : 0;
                      const colors = [palette.accentGold, palette.successDot, palette.warningDot, "#8B5CF6", "#EC4899"];
                      return <div key={idx} style={{ width: `${pct}%`, background: colors[idx % colors.length] }} />;
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }} className="num">Total atik {fmt(invTotalItemsCost())} HTG</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: palette.accentGold }} className="num">+ {fmt(invTotalTransport())} HTG → {fmt(invTotalItemsCost() + invTotalTransport())} HTG revient</span>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 18 }}>
                <Button label="Retounen" variant="soft" onClick={() => setInvStep(1)} style={{ flex: 1 }} />
                <Button label="✓ Anrejistre livrezon" variant="primary" onClick={handleCreateInventory} style={{ flex: 2 }} />
              </div>
            </>
          )
        )}
      </div>

      {!wide && invStep === 1 && invBubbles.length > 0 && (
        <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", width: `min(calc(100% - 28px), ${isTablet ? 560 : 390}px)`, background: palette.ink, borderRadius: 16, padding: "10px 12px", display: "flex", alignItems: "center", boxShadow: shadow.card, zIndex: 50 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: palette.accentGold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontWeight: 900, color: "#fff", fontSize: 13 }} className="num">{invBubbles.length}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: 12 }} className="num">{invBubbles.length} pwodwi nan livrezon</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 1 }}>Tape pou wè detay · retire · modifye</div>
          </div>
          <div style={{ alignItems: "flex-end", display: "flex", flexDirection: "column" }}>
            <span style={{ color: palette.accentGold, fontWeight: 800, fontSize: 14, textAlign: "right", ...monoStyle }} className="num">{fmt(invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0))} HTG</span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>pri acha</span>
          </div>
          <button onClick={() => setInvShowCart(true)} style={{ background: "transparent", border: "none", cursor: "pointer", marginLeft: 8, display: "flex", alignItems: "center", fontFamily: "inherit" }}>
            <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.7)" style={{ transform: "rotate(90deg)" }} />
          </button>
        </div>
      )}

      {sel && (
        <Overlay onClose={invCloseAddSheet} align="center" fit blur>
          <ModalHeader title={<>Detay pwodwi <span style={{ background: palette.accentGold, color: "#fff", borderRadius: 8, padding: "2px 7px", fontSize: 9, fontWeight: 800, marginLeft: 6, verticalAlign: "middle" }}>{invEditIdx !== null ? "MODIFYE" : "NOUVO"}</span></>} sub={`${sel.sku ?? ""} ${invEditIdx !== null ? "· TAP PRAN KANTITE" : ""}`} onClose={invCloseAddSheet} />
          {invError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginBottom: 10 }}>{invError}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {unitsFor(sel.id).map(u => {
              const active = (invSelUnitId || selUnit()?.id) === u.id;
              return (
                <button key={u.id} onClick={() => { setInvSelUnitId(u.id); setInvInputSell(unitSellPrice(u.id)); }} style={{ padding: "8px 12px", borderRadius: 10, background: active ? palette.ink2 : palette.surfaceGrouped, border: `1px solid ${active ? palette.ink2 : palette.hairline}`, color: active ? "#fff" : palette.ink, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {u.unit_name}{Number(u.conversion_factor) > 1 ? ` ×${u.conversion_factor}` : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Field label={`Kantite${selUnit() ? ` (${selUnit()!.unit_name})` : ""} *`}><TextInput value={invInputQty} onChange={v => { setInvInputQty(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" /></Field></div>
            <div style={{ flex: 1 }}><Field label={`Pri achte HTG${selUnit() ? ` / ${selUnit()!.unit_name}` : ""} *`}><TextInput value={invInputCost} onChange={v => { setInvInputCost(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" /></Field></div>
          </div>
          <Field label={`Pri vann${selUnit() ? ` (${selUnit()!.unit_name})` : ""} HTG`} hint="Pre-ranpli: pri aktyèl katalòg la. Chanje = mete ajou pou tout magazen.">
            <TextInput value={invInputSell} onChange={v => { setInvInputSell(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {invEditIdx !== null && (
              <button onClick={() => { handleInvRemoveBubble(invEditIdx); invCloseAddSheet(); }} style={{ padding: "13px 14px", background: palette.dangerBg, borderRadius: radius.sm, border: `1px solid ${palette.dangerBd}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>
                <Icon name="trash" size={16} color={palette.danger} />
              </button>
            )}
            <button onClick={handleInvAjoute} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, background: palette.ink2, borderRadius: radius.sm, border: `1px solid rgba(200,162,74,0.4)`, boxShadow: shadow.card, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              {invEditIdx !== null ? "✓ Mete ajou" : "✓ Ajoute"}
              {(parseFloat(invInputQty) || 0) > 0 && (parseFloat(invInputCost) || 0) > 0 ? (
                <span style={{ background: palette.accentGold, borderRadius: 8, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 900 }} className="num">{fmt(qtyLine)} HTG</span>
              ) : null}
            </button>
          </div>
        </Overlay>
      )}

      {invShowCart && (
        <Overlay onClose={() => setInvShowCart(false)} align="bottom" width={640}>
          <ModalHeader title={<>Atik nan livrezon <span style={{ background: palette.accentGold, color: "#fff", borderRadius: 8, padding: "2px 7px", fontSize: 9, fontWeight: 800, marginLeft: 6, verticalAlign: "middle" }}>{invBubbles.length}</span></>} sub="Tape yon atik pou modifye" onClose={() => setInvShowCart(false)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {invBubbles.map((b, idx) => (
              <button key={idx} onClick={() => invOpenEditSheet(idx, b)} style={{ display: "flex", alignItems: "center", gap: 10, background: palette.surface, border: `1px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
                    {b.sellPrice > 0 ? <span style={{ fontSize: 9, fontWeight: 700, color: palette.muted2 }} className="num">vann {fmt(b.sellPrice)} HTG</span> : null}
                  </div>
                  <span style={{ fontSize: 10, color: palette.muted, marginTop: 2, display: "block" }} className="num">{b.qty} {b.unitName ?? b.unit ?? "pcs"} × {fmt(b.costPrice)} HTG = {fmt(b.qty * b.costPrice)} HTG{Number(b.factor) > 1 ? ` (${fmt(b.qty * Number(b.factor))} inite baz)` : ""}</span>
                </div>
                <span style={{ background: palette.accentGoldSoft, borderRadius: 8, padding: "4px 8px", color: palette.accentGold, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" }} className="num">{b.qty} {b.unitName ?? b.unit ?? "pcs"}</span>
                <Icon name="edit" size={13} color={palette.ink2} />
                <span onClick={e => { e.stopPropagation(); handleInvRemoveBubble(idx); }} style={{ width: 30, height: 30, borderRadius: 8, background: palette.dangerBg, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                  <Icon name="trash" size={13} color={palette.danger} />
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button label="Kontinye" variant="soft" onClick={() => setInvShowCart(false)} style={{ flex: 1 }} />
            <Button label="Founisè/Transpò →" variant="primary" onClick={() => { setInvShowCart(false); setInvStep(2); }} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {priceReview && (
        <Overlay onClose={() => finishPriceReview(false)} align="bottom" width={640}>
          <ModalHeader title="Livrezon anrejistre ✓" sub={`${priceReviewSummary}`} onClose={() => finishPriceReview(false)} />
          <div style={{ fontSize: 11, color: palette.muted2 }}>Mete pri vann yo ajou pou tout variant — opsyonèl. Vid = kenbe pri aktyèl la.</div>
          {priceReview.map((p, pi) => (
            <div key={p.productId} style={{ marginTop: 12, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10, border: `0.5px solid ${palette.hairline}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              {p.rows.map((r, ri) => (
                <div key={`${r.unitId}-${r.variant}`} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.unitName} · {r.variant}</span>
                  </div>
                  <TextInput value={r.price} onChange={v => setReviewRowPrice(pi, ri, v)} numeric placeholder="—" style={{ width: 110 }} />
                </div>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button label="Kite konsa" variant="soft" onClick={() => finishPriceReview(false)} style={{ flex: 1 }} />
            <Button label="✓ Sove pri yo" variant="primary" onClick={() => finishPriceReview(true)} style={{ flex: 2 }} />
          </div>
        </Overlay>
      )}
    </div>
  );
}