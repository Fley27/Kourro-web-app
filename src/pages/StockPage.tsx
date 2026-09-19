import React, { useEffect, useMemo, useState } from "react";
import { getDb, insertOutbox } from "../lib/db";
import { useAuthStore } from "../lib/authStore";
import { palette, radius, shadow } from "../lib/theme";
import { fmt, monoStyle, shortDate } from "../lib/format";
import { salesEvents } from "../lib/salesEvents";
import { useResponsive } from "../lib/responsive";
import {
  loadPricing, ensurePricingForProducts, getUnitsForProduct, getPricesForUnit,
  getDefaultUnit, getDisplayPrice, DEFAULT_VARIANT, type PricingMaps, type ProductUnit, type ProductPrice,
} from "../lib/pricing";
import { Button, EmptyState, Field, ModalHeader, Overlay, SearchBar, Segmented, TextInput, Select, toast } from "../components/ui";
import { Icon } from "../components/Icon";

type Category = { id: string; name: string; icon: string; color: string };
type Product = { id: string; name: string; sku?: string; barcode?: string; category_id?: string; unit?: string; cost_price: number; selling_price?: number; stock_quantity: number; low_stock_threshold: number };
type StockBatch = { id: string; reference: string; supplier?: string; transport_cost: number; notes?: string; total_items_cost: number; total_cost: number; received_at?: string; status?: string; delivered_at?: string; created_by?: string; created_at: string };
type StockMovement = { id: string; batch_id?: string; product_id: string; type: string; quantity: number; unit_cost: number; total_cost: number; allocated_transport: number; status?: string; delivered_at?: string; created_at: string };
type StockTab = "store" | "incoming";
type InvBubble = { productId: string; name: string; sku?: string; unitId: string; unitName: string; factor: number; unit?: string; qty: number; costPrice: number; sellPrice: number };
type PriceReviewRow = { unitId: string; unitName: string; variant: string; priceId: string | null; price: string };
type PriceReviewProduct = { productId: string; name: string; rows: PriceReviewRow[] };

const STORE_ID = "demo-store-id";
const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Manje", icon: "🍚", color: palette.ink2 },
  { id: "drinks", name: "Bwason", icon: "🥤", color: palette.ink2 },
  { id: "household", name: "Kay", icon: "🧴", color: palette.ink2 },
  { id: "dairy", name: "Letye", icon: "🥛", color: palette.ink2 },
  { id: "bakery", name: "Boulanjri", icon: "🥐", color: palette.ink2 },
  { id: "produce", name: "Lejume", icon: "🥬", color: palette.ink2 },
];

type StockStatus = { label: string; border: string; bg: string; text: string; dot: string; accent: string; sub: string; bar: string };

function getStockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return { label: "EPUIZE", border: palette.dangerBd, bg: palette.dangerBg, text: palette.danger, dot: palette.dangerDot, accent: palette.danger, sub: "#FCA5A5", bar: palette.danger };
  if (qty <= threshold) return { label: "FÈB", border: palette.warningBd, bg: palette.warningBg, text: palette.warning, dot: palette.warningDot, accent: palette.warning, sub: "#FDBA74", bar: palette.warningDot };
  return { label: "DISPONIB", border: palette.successBd, bg: palette.successBg, text: palette.success, dot: palette.successDot, accent: palette.success, sub: "#86EFAC", bar: palette.success };
}

function StatusPill({ status, large }: { status: StockStatus; large?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: large ? 5 : 4, background: status.bg, border: `1px solid ${status.border}`, borderRadius: radius.pill, padding: large ? "5px 10px" : "3px 8px" }}>
      <span style={{ width: large ? 7 : 6, height: large ? 7 : 6, borderRadius: large ? 4 : 3, background: status.dot }} />
      <span style={{ fontSize: large ? 11 : 10, fontWeight: 800, color: status.text, letterSpacing: 0.3 }}>{status.label}</span>
    </span>
  );
}

function KpiMini({ accent, label, value, sub, valueColor }: { accent: string; label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: palette.surface, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 12, overflow: "hidden", boxShadow: shadow.soft, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2.5, background: accent }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.9, color: palette.muted2 }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.8, color: valueColor ?? palette.ink, marginTop: 7, ...monoStyle }}>{value}</div>
      <div style={{ fontSize: 10.5, color: palette.muted, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

function getCategoryForProduct(p: Product): string {
  const name = (p.name ?? "").toLowerCase();
  if (name.includes("rice") || name.includes("flour") || name.includes("sugar") || name.includes("pasta") || name.includes("corn") || name.includes("salt") || name.includes("mayi") || name.includes("sèl") || name.includes("sik") || name.includes("farin")) return "food";
  if (name.includes("beer") || name.includes("cola") || name.includes("water") || name.includes("dlo") || name.includes("kola") || name.includes("prestige")) return "drinks";
  if (name.includes("soap") || name.includes("savon") || name.includes("detergent") || name.includes("colgate") || name.includes("pat")) return "household";
  if (name.includes("milk") || name.includes("lèt") || name.includes("coffee") || name.includes("kafe")) return "dairy";
  if (name.includes("biscuit") || name.includes("bisk")) return "bakery";
  if (name.includes("tomato") || name.includes("tomat") || name.includes("sardine")) return "produce";
  return "food";
}

function slugify(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

export function StockPage() {
  const { isTablet, isLargeTablet, padH, fabRight } = useResponsive();
  const { user } = useAuthStore();
  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const canEdit = role !== "cashier";
  const canAddMore = role === "owner" || role === "admin" || role === "manager";
  const canDelete = role === "owner";
  const currentUser = user;

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([{ id: "all", name: "Tout", icon: "⊞", color: palette.ink2 }]);
  const [productCategories, setProductCategories] = useState<{ product_id: string; category_id: string }[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [pricing, setPricing] = useState<PricingMaps>({ units: [], prices: [], bundles: [] });
  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cat, setCat] = useState("all");
  const [stockTab, setStockTab] = useState<StockTab>("store");
  const [detail, setDetail] = useState<Product | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [nameEdit, setNameEdit] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [unitEdit, setUnitEdit] = useState(false);
  const [unitInput, setUnitInput] = useState("");
  const [priceEdit, setPriceEdit] = useState(false);
  const [priceInput, setPriceInput] = useState("");

  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [catError, setCatError] = useState("");
  const [newCategory, setNewCategory] = useState({ name: "", icon: "◈" });
  const [np, setNp] = useState({ name: "", sku: "", categoryId: "all", unitLabel: "Unit", buying: "", selling: "", stock: "0", low: "5" });

  const [showDeliver, setShowDeliver] = useState(false);
  const [deliverBatch, setDeliverBatch] = useState<StockBatch | null>(null);
  const [deliverFee, setDeliverFee] = useState("");
  const [delivering, setDelivering] = useState(false);

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
  const [invProductSearch, setInvProductSearch] = useState("");
  const [invSupplier, setInvSupplier] = useState("");
  const [invTransport, setInvTransport] = useState("");
  const [invReference, setInvReference] = useState<string>(() => `LIV-${Date.now().toString().slice(-6)}`);
  const [invNotes, setInvNotes] = useState("");
  const [priceReview, setPriceReview] = useState<PriceReviewProduct[] | null>(null);
  const [priceReviewSummary, setPriceReviewSummary] = useState("");

  async function load() {
    try {
      const db = await getDb();
      const rows = (await db.getAllAsync("SELECT * FROM products WHERE is_deleted=0 OR is_deleted IS NULL")) as any[];
      setProducts(rows ?? []);
      try {
        const pm = await ensurePricingForProducts(db, rows ?? []);
        setPricing(pm);
      } catch {}
      try {
        const catRows = (await db.getAllAsync("SELECT * FROM categories")) as any[];
        const dbCats = (catRows ?? []).filter((r: any) => !r.is_deleted).sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((r: any) => ({ id: r.id, name: r.name, icon: r.icon ?? "◈", color: r.color ?? "#0f172a" }));
        setCategories([{ id: "all", name: "Tout", icon: "⊞", color: palette.ink2 }, ...dbCats]);
      } catch {}
      try { setProductCategories(((await db.getAllAsync("SELECT * FROM product_categories")) as any[]) ?? []); } catch { setProductCategories([]); }
      try { setBatches(((await db.getAllAsync("SELECT * FROM stock_batches")) as any[]) ?? []); } catch { setBatches([]); }
      try { setMovements(((await db.getAllAsync("SELECT * FROM stock_movements")) as any[]) ?? []); } catch { setMovements([]); }
    } catch {}
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(load); } catch {} })();
    const id = setInterval(load, 2500);
    return () => { clearInterval(id); if (unsub) unsub(); };
  }, []);

  function defaultUnitOf(productId: string): ProductUnit | null {
    return getDefaultUnit(getUnitsForProduct(pricing, productId));
  }
  function displayPriceOf(p: Product): number {
    const d = getDisplayPrice(pricing, p.id);
    if (d && d.price > 0) return d.price;
    return Number(p.selling_price ?? 0) || 0;
  }
  function transportTotal(): number {
    return parseFloat(invTransport) || 0;
  }
  function getProductCats(productId: string): string[] {
    const linked = productCategories.filter(pc => pc.product_id === productId).map(pc => pc.category_id);
    if (linked.length) return linked;
    const prod = products.find(p => p.id === productId);
    if (prod?.category_id) return [prod.category_id];
    if (prod) return [getCategoryForProduct(prod)];
    return [];
  }
  function getProductCategoriesDisplay(productId: string): Category[] {
    return getProductCats(productId).map(id => categories.find(c => c.id === id)).filter(Boolean) as Category[];
  }

  const filtered = useMemo(() => products.filter(p => {
    const matchQ = !q || (p.name ?? "").toLowerCase().includes(q.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").toLowerCase().includes(q.toLowerCase());
    const prodCats = getProductCats(p.id);
    const matchCat = cat === "all" || prodCats.includes(cat);
    const matchBarcode = !barcode || ((p.barcode ?? p.sku ?? "") as string).toLowerCase() === barcode.toLowerCase();
    return matchQ && matchCat && (!barcode || matchBarcode);
  }), [products, q, cat, barcode, productCategories, categories]);

  const lowCount = products.filter(p => p.stock_quantity <= p.low_stock_threshold).length;
  const lowList = products.filter(p => p.stock_quantity <= p.low_stock_threshold);
  const totalValue = products.reduce((s, p) => s + p.stock_quantity * displayPriceOf(p), 0);
  const totalCostValue = products.reduce((s, p) => s + p.stock_quantity * p.cost_price, 0);
  const marginPct = totalValue > 0 ? ((totalValue - totalCostValue) / totalValue) * 100 : 0;
  const avgTransportShare = useMemo(() => {
    const withTransport = movements.filter(m => m.allocated_transport > 0);
    if (!withTransport.length) return 0;
    const totalAlloc = withTransport.reduce((s, m) => s + m.allocated_transport, 0);
    const totalCost = withTransport.reduce((s, m) => s + m.total_cost, 0);
    return totalCost ? (totalAlloc / totalCost) * 100 : 0;
  }, [movements]);
  const pendingBatches = useMemo(() => batches.filter(b => (b.status ?? "pending") === "pending"), [batches]);
  const deliveredBatches = useMemo(() => batches.filter(b => (b.status ?? "pending") === "delivered" && !((b.reference ?? "").startsWith("AJOUT-") || (b.reference ?? "").startsWith("RETIRE-"))), [batches]);

  function infoUnitsOf(p: Product): ProductUnit[] { return getUnitsForProduct(pricing, p.id); }
  function infoPricesOf(p: Product): ProductPrice[] {
    const out: ProductPrice[] = [];
    for (const u of infoUnitsOf(p)) out.push(...getPricesForUnit(pricing, u.id));
    return out;
  }
  function recentMovesOf(p: Product): StockMovement[] {
    return movements.filter(m => m.product_id === p.id && (m.status ?? "delivered") !== "pending");
  }
  function lastDeliveredOf(p: Product): StockMovement | null {
    return recentMovesOf(p).find(m => m.type === "in") ?? null;
  }

  async function emitChange() {
    salesEvents.emit();
  }

  async function handleChangeName() {
    if (!detail) return;
    const name = nameInput.trim();
    if (!name) { toast("Non obligatwa", "Non pwodwi pa ka vid", "warn"); return; }
    if (name === detail.name) { toast("Pa gen chanjman", undefined, "info"); return; }
    if (products.some(p => p.id !== detail.id && (p.name ?? "").trim().toLowerCase() === name.toLowerCase())) { toast("Non deja egziste", `"${name}" deja nan katalòg`, "error"); return; }
    try {
      const db = await getDb();
      await db.runAsync("UPDATE products SET name = ? WHERE id = ?", [name, detail.id]);
      toast("Non chanje ✓", `${detail.name} → ${name}`, "success");
      setNameEdit(false);
      await emitChange();
    } catch {}
  }

  async function handleChangeUnit() {
    if (!detail) return;
    const unit = unitInput.trim();
    if (!unit) { toast("Inite obligatwa", "Antre yon inite", "warn"); return; }
    const u = defaultUnitOf(detail.id);
    if (!u) { toast("Pa gen inite", "Kreye yon inite avant", "warn"); return; }
    try {
      const db = await getDb();
      await db.runAsync("UPDATE product_units SET unit_name = ?, updated_at = ? WHERE id = ?", [unit, new Date().toISOString(), u.id]);
      await db.runAsync("UPDATE products SET unit = ? WHERE id = ?", [unit, detail.id]);
      toast("Inite chanje ✓", `${detail.name} • ${unit}`, "success");
      setUnitEdit(false);
      await Promise.all([loadPricing(db).then(setPricing).catch(() => {}), emitChange()]);
    } catch {}
  }

  async function handleChangePrice() {
    if (!detail) return;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) { toast("Pri pa valab", "Antre yon pri ki >= 0", "warn"); return; }
    const u = defaultUnitOf(detail.id) ?? (getUnitsForProduct(pricing, detail.id)[0] ?? null);
    if (!u) { toast("Pa gen inite", "Kreye yon inite avant", "warn"); return; }
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      const rows = getPricesForUnit(pricing, u.id);
      const row = rows.find(r => r.variant === DEFAULT_VARIANT) ?? rows[0];
      const oldPrice = row ? Number(row.price) : 0;
      const phId = `pricehist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (row) {
        await db.runAsync("UPDATE product_prices SET price = ?, updated_at = ? WHERE id = ?", [price, now, row.id]);
      } else {
        await db.runAsync("INSERT INTO product_prices (id, unit_id, variant, price, updated_at) VALUES (?,?,?,?,?)", [`price-${detail.id}-regular`, u.id, DEFAULT_VARIANT, price, now]);
      }
      await db.runAsync("UPDATE products SET selling_price = ? WHERE id = ?", [price, detail.id]);
      await db.runAsync("INSERT INTO price_history (id, store_id, product_id, old_cost, new_cost, old_price, new_price, created_at) VALUES (?,?,?,?,?,?,?,?)", [phId, STORE_ID, detail.id, detail.cost_price ?? 0, detail.cost_price ?? 0, oldPrice, price, now]);
      await insertOutbox("price_history", "create", { id: phId, store_id: STORE_ID, product_id: detail.id, old_price: oldPrice, new_price: price, created_at: now, changed_by: currentUser?.name ?? "" });
      toast("Pri chanje ✓", `${fmt(oldPrice)} HTG → ${fmt(price)} HTG`, "success");
      setPriceEdit(false);
      await Promise.all([loadPricing(db).then(setPricing).catch(() => {}), emitChange()]);
    } catch {}
  }

  async function handleDeliver() {
    if (!deliverBatch) return;
    const db = await getDb();
    const batchMovs = movements.filter(m => m.batch_id === deliverBatch.id && m.type === "in");
    if (!batchMovs.length) { setShowDeliver(false); return; }
    const now = new Date().toISOString();
    const extra = Math.max(0, parseFloat(deliverFee) || 0);
    setDelivering(true);
    try {
      if (extra > 0) {
        const totalItems = batchMovs.reduce((s, m) => s + ((m.total_cost || 0) - (m.allocated_transport || 0)), 0);
        for (const m of batchMovs) {
          const lineItems = (m.total_cost || 0) - (m.allocated_transport || 0);
          const add = totalItems > 0 ? extra * (lineItems / totalItems) : extra / batchMovs.length;
          const newAlloc = (m.allocated_transport || 0) + add;
          await db.runAsync("UPDATE stock_movements SET allocated_transport = ?, total_cost = ? WHERE id = ?", [Math.round(newAlloc * 100) / 100, Math.round((lineItems + newAlloc) * 100) / 100, m.id]);
        }
        await db.runAsync("UPDATE stock_batches SET transport_cost = ?, total_cost = ?, status = ?, delivered_at = ? WHERE id = ?", [(deliverBatch.transport_cost || 0) + extra, (deliverBatch.total_cost || 0) + extra, "delivered", now, deliverBatch.id]);
      } else {
        await db.runAsync("UPDATE stock_batches SET status = ?, delivered_at = ? WHERE id = ?", ["delivered", now, deliverBatch.id]);
      }
      for (const m of batchMovs) {
        await db.runAsync("UPDATE stock_movements SET status = ?, delivered_at = ? WHERE id = ?", ["delivered", now, m.id]);
        const qty = Number(m.quantity || 0);
        if (qty <= 0) continue;
        try {
          const cur = (await db.getAllAsync("SELECT * FROM products WHERE id = ?", [m.product_id])) as any[];
          if (cur[0]) {
            const prevQty = Number(cur[0].stock_quantity ?? 0);
            const prevCost = Number(cur[0].cost_price ?? 0);
            const newQty = prevQty + qty;
            const newAvg = newQty > 0 ? (prevQty * prevCost + (m.total_cost || 0)) / newQty : 0;
            await db.runAsync("UPDATE products SET stock_quantity = stock_quantity + ?, current_amount_available = current_amount_available + ?, cost_price = ? WHERE id = ?", [qty, qty, Math.round(newAvg * 100) / 100, m.product_id]);
          }
        } catch {}
      }
      toast("Livrezon rive ✓", `${deliverBatch.reference} • ${batchMovs.length} atik ajoute nan stòk${extra > 0 ? ` • +${fmt(extra)} HTG frè anplis` : ""}`, "success");
      setShowDeliver(false);
      setDeliverBatch(null);
      setDeliverFee("");
      await emitChange();
    } catch {}
    setDelivering(false);
  }

  async function handleCreateCategory() {
    const label = newCategory.name.trim();
    if (!label) { setCatError("Non kategori obligatwa."); return; }
    if (label.length < 2) { setCatError("Mete omwen 2 lèt."); return; }
    const id = slugify(label);
    if (!id || id === "all") { setCatError("Non pa valab."); return; }
    if (categories.some(c => c.id === id) || categories.some(c => c.name.toLowerCase() === label.toLowerCase())) { setCatError("Kategori sa egziste deja."); return; }
    const next: Category = { id, name: label, icon: (newCategory.icon.trim() || "◈").slice(0, 2), color: "#0f172a" };
    try {
      const db = await getDb();
      const now = new Date().toISOString();
      await db.runAsync("INSERT OR REPLACE INTO categories (id, store_id, name, icon, color, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", [next.id, STORE_ID, next.name, next.icon, next.color, categories.length, now, now]);
      setCategories(prev => [...prev, next]);
      setNewCategory({ name: "", icon: "◈" });
      setCatError("");
      setShowAddCategory(false);
      setCat(id);
      toast("Kategori kreye ✓", next.name, "success");
      await emitChange();
    } catch {}
  }

  async function handleCreateProduct() {
    const name = np.name.trim();
    if (!name) { toast("Non obligatwa", "Non pwodwi obligatwa pou katalòg", "warn"); return; }
    const sku = np.sku.trim() || `prod-${Date.now()}`;
    const skuNorm = sku.toLowerCase();
    if (products.some(p => ((p.sku ?? "") as string).trim().toLowerCase() === skuNorm || ((p.barcode ?? "") as string).trim().toLowerCase() === skuNorm)) { toast("SKU deja egziste", "Chak pwodwi dwe gen yon SKU inik", "error"); return; }
    if (products.some(p => (p.name ?? "").trim().toLowerCase() === name.toLowerCase())) { toast("Non deja egziste", `"${name}" deja nan katalòg`, "error"); return; }
    const buying = parseFloat(np.buying) || 0;
    const selling = parseFloat(np.selling) || 0;
    const stockQty = parseFloat(np.stock) || 0;
    const low = parseInt(np.low, 10) || 5;
    const unitLabel = np.unitLabel.trim() || "Unit";
    const id = `prod-${Date.now()}`;
    const now = new Date().toISOString();
    const phId = `pricehist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      const db = await getDb();
      await db.runAsync("INSERT INTO products (id, store_id, sku, name, category_id, cost_price, stock_quantity, low_stock_threshold) VALUES (?,?,?,?,?,?,?,?)", [id, STORE_ID, sku, name, np.categoryId && np.categoryId !== "all" ? np.categoryId : null, buying, stockQty, low]);
      await db.runAsync("UPDATE products SET selling_price = ? WHERE id = ?", [selling, id]);
      const unitId = `unit-${id}-base`;
      await db.runAsync("INSERT OR REPLACE INTO product_units (id, product_id, unit_name, conversion_factor, created_at, updated_at) VALUES (?,?,?,?,?,?)", [unitId, id, unitLabel, 1, now, now]);
      const priceId = `price-${id}-regular`;
      await db.runAsync("INSERT OR REPLACE INTO product_prices (id, unit_id, variant, price, updated_at) VALUES (?,?,?,?,?)", [priceId, unitId, DEFAULT_VARIANT, selling, now]);
      if (np.categoryId && np.categoryId !== "all") {
        await db.runAsync("INSERT INTO product_categories (product_id, category_id) VALUES (?,?)", [id, np.categoryId]);
      }
      await db.runAsync("INSERT INTO price_history (id, store_id, product_id, old_cost, new_cost, old_price, new_price, created_at) VALUES (?,?,?,?,?,?,?,?)", [phId, STORE_ID, id, 0, buying, 0, selling, now]);
      await insertOutbox("price_history", "create", { id: phId, store_id: STORE_ID, product_id: id, old_price: 0, new_price: selling, created_at: now, changed_by: currentUser?.name ?? "" });
      setNp({ name: "", sku: "", categoryId: "all", unitLabel: "Unit", buying: "", selling: "", stock: "0", low: "5" });
      setShowAddProduct(false);
      toast("Katalòg kreye ✓", `${name} • ${fmt(stockQty)} pcs • ${fmt(selling)} HTG`, "success");
      await emitChange();
    } catch {}
  }

  function invUnitsFor(productId: string): ProductUnit[] { return getUnitsForProduct(pricing, productId); }
  function invSelUnit() {
    if (!invSelectedProduct) return null;
    const us = invUnitsFor(invSelectedProduct.id);
    return us.find(u => u.id === invSelUnitId) ?? getDefaultUnit(us);
  }
  function invUnitSellPrice(unitId: string): string {
    if (!unitId) return "";
    const rows = pricing.prices.filter(r => r.unit_id === unitId);
    const row = rows.find(r => r.variant === DEFAULT_VARIANT) ?? rows[0];
    return row && Number(row.price) > 0 ? String(row.price) : "";
  }
  function invOpenAddSheet(p: Product) {
    setInvSelectedProduct(p);
    setInvEditIdx(null);
    const du = getDefaultUnit(invUnitsFor(p.id));
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
    setInvInputSell(String(bubble.sellPrice > 0 ? bubble.sellPrice : invUnitSellPrice(bubble.unitId ?? "")));
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
    const us = invUnitsFor(invSelectedProduct.id);
    const u = us.find(x => x.id === invSelUnitId) ?? getDefaultUnit(us);
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
  async function handleCreateInventory() {
    if (invBubbles.length === 0) { setInvError("Ajoute omwen yon pwodwi nan livrezon an"); return; }
    for (const b of invBubbles) {
      if (isNaN(b.qty) || b.qty <= 0) { setInvError(`Kantite pa valab pou ${b.name}`); return; }
      if (isNaN(b.costPrice) || b.costPrice < 0) { setInvError(`Pri acha pa valab pou ${b.name}`); return; }
    }
    const transport = parseFloat(invTransport) || 0;
    if (transport < 0) { setInvError("Frè transpò pa valab"); return; }
    const totalItems = invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0);
    const batchId = `batch-${Date.now()}`;
    const reference = invReference.trim() || `LIV-${Date.now().toString().slice(-6)}`;
    const now = new Date().toISOString();
    const totalCost = totalItems + transport;
    try {
      const db = await getDb();
      await db.runAsync("INSERT INTO stock_batches (id, store_id, reference, supplier, transport_cost, notes, total_items_cost, total_cost, received_at, created_by, created_at, updated_at, status, delivered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [batchId, STORE_ID, reference, invSupplier.trim() || null, transport, invNotes.trim() || null, totalItems, totalCost, now, currentUser?.id ?? "system", now, now, "pending", null]);
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
      const summary = `${reference} • ${invBubbles.length} pwodwi • ${fmt(totalCost)} HTG (transpò ${fmt(transport)} HTG). Stòk la parèt nan "Livrezon" jouk li rive.`;
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
      setShowAddDelivery(false);
      try { setPricing(await loadPricing(db)); } catch {}
      if (review.length) { setPriceReviewSummary(summary); setPriceReview(review); }
      else toast("Livrezon anrejistre ✓", summary, "success");
      await emitChange();
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

  const detailUnits = detail ? infoUnitsOf(detail) : [];
  const detailPrices = detail ? infoPricesOf(detail) : [];

  const inspector = detail ? (
    <div style={{ background: palette.surface, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, boxShadow: shadow.soft, overflow: "hidden" }}>
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: palette.ink2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>{(detail.name ?? "?")[0]?.toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: palette.ink, letterSpacing: -0.2 }}>{detail.name}</div>
            <div style={{ color: palette.muted, fontSize: 12, marginTop: 1 }}>{detail.sku ?? "—"}</div>
          </div>
          {canAddMore && (
            <button onClick={() => { setPriceEdit(v => !v); setPriceInput(String(displayPriceOf(detail))); }} style={{ border: `0.5px solid ${palette.hairline}`, background: palette.surfaceGrouped, color: palette.inkSoft, borderRadius: radius.sm, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} title="Chanje pri">
              <Icon name="edit" size={14} />
            </button>
          )}
          {isLargeTablet ? (
            <button onClick={() => setDetail(null)} style={{ border: "none", background: palette.surfaceGrouped, borderRadius: 16, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Icon name="close" size={15} color={palette.muted} />
            </button>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 24, color: getStockStatus(detail.stock_quantity, detail.low_stock_threshold).accent, ...monoStyle }}>{detail.stock_quantity} <span style={{ fontSize: 12, fontWeight: 600 }}>{defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"}</span></span>
          <StatusPill status={getStockStatus(detail.stock_quantity, detail.low_stock_threshold)} large />
        </div>
        <div style={{ fontSize: 11, color: palette.muted, marginTop: 6 }}>Seuil fèb: {detail.low_stock_threshold} {defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"}</div>
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Pri</div>
        {priceEdit && canAddMore ? (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <TextInput value={priceInput} onChange={v => setPriceInput(v.replace(/[^0-9.]/g, ""))} numeric placeholder="Prix" />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button label="Voye" variant="primary" size="sm" onClick={handleChangePrice} style={{ flex: 1 }} />
                <Button label="Anile" variant="ghost" size="sm" onClick={() => setPriceEdit(false)} style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10 }}>
              <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 800, letterSpacing: 0.8 }}>PRI VANT</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: palette.ink, marginTop: 2, ...monoStyle }}>{displayPriceOf(detail) ? `${fmt(displayPriceOf(detail))} HTG` : "—"}</div>
            </div>
            {canEdit ? (
              <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10 }}>
                <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 800, letterSpacing: 0.8 }}>KOUT</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: palette.muted, marginTop: 2, ...monoStyle }}>{detail.cost_price ? `${fmt(detail.cost_price)} HTG` : "—"}</div>
              </div>
            ) : null}
          </div>
        )}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10 }}>
              <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 800, letterSpacing: 0.8 }}>MAJ</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: palette.ink, marginTop: 2, ...monoStyle }}>{(() => {
                const pr = displayPriceOf(detail);
                const mg = pr > 0 ? ((pr - (Number(detail.cost_price) || 0)) / pr) * 100 : null;
                return mg !== null ? `${mg.toFixed(1)}%` : "—";
              })()}</div>
            </div>
            <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10 }}>
              <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 800, letterSpacing: 0.8 }}>STÒK</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: getStockStatus(detail.stock_quantity, detail.low_stock_threshold).accent, marginTop: 2, ...monoStyle }}>{detail.stock_quantity} {defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"}</div>
            </div>
          </div>
        )}
        {detailPrices.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {detailPrices.map(r => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingBlock: 9, borderTop: `0.5px solid ${palette.hairline}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: palette.inkSoft }}>{detailUnits.find(x => x.id === r.unit_id)?.unit_name ?? "?"}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: palette.ink, flex: 1 }}>{r.variant}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: palette.ink, ...monoStyle }}>{fmt(Number(r.price))} HTG</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Inite ({detailUnits.length})</div>
        <div style={{ marginTop: 4 }}>
          {detailUnits.map(u => (
            <div key={u.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBlock: 9, borderTop: `0.5px solid ${palette.hairline}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: palette.ink }}>{u.unit_name}</span>
              <span style={{ fontSize: 11, color: palette.muted, ...monoStyle }}>×{u.conversion_factor}</span>
            </div>
          ))}
          {detailUnits.length === 0 && <div style={{ fontSize: 12, color: palette.muted, paddingBlock: 9 }}>{defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"} ×1</div>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {getProductCategoriesDisplay(detail.id).map(c => (
            <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: palette.surfaceGrouped, border: `0.5px solid ${palette.separatorSoft}`, borderRadius: radius.pill, padding: "5px 9px" }}>
              <span style={{ fontSize: 11 }}>{c.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: palette.ink }}>{c.name}</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: "0 14px 14px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Dènye livrezon</div>
        {(() => {
          const last = lastDeliveredOf(detail);
          const tRecent = recentMovesOf(detail).slice(0, 5);
          if (!last) return <div style={{ fontSize: 12, color: palette.muted, marginTop: 8 }}>Poko gen livrezon pou pwodwi sa.</div>;
          const batch = batches.find(x => x.id === last.batch_id);
          return (
            <>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{batch?.reference ?? last.batch_id ?? "—"}</div>
                <div style={{ fontSize: 11, color: palette.muted, marginTop: 2 }}>{batch?.supplier ?? "—"} · {last.quantity} pcs · {fmt(Math.round(last.total_cost))} HTG</div>
              </div>
              {tRecent.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {tRecent.map(m => {
                    const isIn = m.type === "in";
                    return (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBlock: 9, borderTop: `0.5px solid ${palette.hairline}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ background: isIn ? palette.successBg : palette.dangerBg, border: `0.5px solid ${isIn ? palette.successBd : palette.dangerBd}`, borderRadius: radius.pill, padding: "4px 8px", fontSize: 11, fontWeight: 800, color: isIn ? palette.success : palette.danger }}>{m.type === "in" ? "+" : "-"}{m.quantity}</span>
                          <span style={{ fontSize: 11, color: palette.muted }}>pcs</span>
                        </div>
                        <span style={{ fontSize: 11, color: palette.muted, ...monoStyle }}>{fmt(Math.round(m.total_cost))} HTG</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div style={{ padding: 14, borderTop: `0.5px solid ${palette.hairline}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <Button label="Fèmen" variant="primary" block onClick={() => { setDetail(null); setShowDetail(false); }} />
        {canEdit && (
          <>
            <Button label={nameEdit ? "2. Sove non" : "Chanje non"} variant="soft" block onClick={() => { setNameEdit(v => !v); setNameInput(detail.name); }} />
            {nameEdit && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <TextInput value={nameInput} onChange={setNameInput} placeholder={detail.name} />
                <Button label="Sove non" variant="primary" size="sm" onClick={handleChangeName} />
              </div>
            )}
            <Button label={unitEdit ? "2. Sove inite" : `Chanje inite (${defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"})`} variant="soft" block onClick={() => { setUnitEdit(v => !v); setUnitInput(defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"); }} />
            {unitEdit && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {["pcs", "sack", "kg", "L", "box"].map(u0 => {
                    const active = unitInput === u0;
                    return (
                      <button key={u0} onClick={() => setUnitInput(u0)} style={{ padding: "8px 13px", borderRadius: radius.pill, background: active ? palette.ink2 : palette.surface, border: `1px solid ${active ? palette.ink2 : palette.hairline}`, color: active ? "#fff" : palette.ink, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{u0}</button>
                    );
                  })}
                </div>
                <TextInput value={unitInput} onChange={setUnitInput} placeholder={defaultUnitOf(detail.id)?.unit_name ?? detail.unit ?? "pcs"} />
                <Button label="Sove inite" variant="primary" size="sm" onClick={handleChangeUnit} />
              </div>
            )}
            {canDelete && (
              <Button label="Efase pwodwi" variant="danger" block onClick={() => { (async () => {
                try {
                  const db = await getDb();
                  await db.runAsync("DELETE FROM products WHERE id = ?", [detail.id]);
                  await db.runAsync("DELETE FROM product_categories WHERE product_id = ?", [detail.id]);
                  toast("Pwodwi efase", detail.name, "success");
                  setDetail(null); setShowDetail(false);
                  await emitChange();
                } catch {}
              })(); }} />
            )}
          </>
        )}
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, background: palette.surface, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, boxShadow: shadow.soft, padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <Icon name="cube" size={28} color={palette.muted3} />
      <div style={{ fontWeight: 700, fontSize: 14, color: palette.ink, marginTop: 10, textAlign: "center" }}>Chwazi yon pwodwi pou wè detay</div>
      <div style={{ fontSize: 12, color: palette.muted, marginTop: 4, textAlign: "center" }}>Tape yon pwodwi nan lis la</div>
    </div>
  );

  const renderStoreList = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: palette.muted3, display: "flex" }}><Icon name="search" size={16} /></span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chèche pwodwi oswa sku..." style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, background: palette.surface, fontSize: 13.5, outline: "none", fontFamily: "inherit", color: palette.ink }} />
        </div>
        <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Bakod egzak" style={{ width: 150, padding: "11px 14px", borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, background: palette.surface, fontSize: 13.5, outline: "none", fontFamily: "inherit", color: palette.ink }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, marginBottom: 4 }}>
        {categories.map(c => {
          const active = cat === c.id;
          return (
            <button key={c.id} onClick={() => setCat(c.id)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: radius.pill, border: `1px solid ${active ? palette.ink2 : palette.hairline}`, background: active ? palette.ink2 : palette.surface, color: active ? "#fff" : palette.ink, fontWeight: active ? 700 : 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              <span>{c.icon === "⊞" ? "" : c.icon}</span>
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>
      {filtered.map(item => {
        const status = getStockStatus(item.stock_quantity, item.low_stock_threshold);
        const price = displayPriceOf(item);
        const unitName = defaultUnitOf(item.id)?.unit_name ?? item.unit ?? "pcs";
        const onClick = () => { setDetail(item); setShowDetail(true); setNameEdit(false); setNameInput(item.name); setUnitEdit(false); setUnitInput(defaultUnitOf(item.id)?.unit_name ?? item.unit ?? "pcs"); setPriceEdit(false); };
        return (
          <div key={item.id} onClick={onClick} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12, borderWidth: 0.5, borderRadius: radius.md, padding: 13, borderColor: palette.hairline, background: palette.surface, boxShadow: shadow.soft, marginBottom: 8, borderStyle: "solid" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <StatusPill status={status} />
                <span style={{ fontSize: 11, fontWeight: 600, color: palette.muted }}>{item.stock_quantity} {unitName} an stòk</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: palette.ink, marginTop: 6, letterSpacing: -0.2 }}>{item.name}</div>
              <div style={{ color: palette.muted, fontSize: 12, marginTop: 3 }}>
                {item.sku ?? "—"} · {canEdit ? <span style={{ color: palette.muted3 }}>{item.cost_price ? `${fmt(item.cost_price)} HTG →` : "— →"}</span> : null} <span style={{ color: palette.ink, fontWeight: 600, ...monoStyle }}>{price ? `${fmt(price)} HTG` : "—"}</span>
              </div>
            </div>
            <div style={{ alignItems: "flex-end", justifyContent: "center", minWidth: 64, textAlign: "right" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: status.accent, letterSpacing: -0.6, ...monoStyle }}>{item.stock_quantity}</div>
              <div style={{ fontSize: 10, color: status.sub, fontWeight: 700, letterSpacing: 0.6, marginTop: 2 }}>NAN STÒK</div>
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <EmptyState icon="box" title="Pa gen pwodwi" body="Eseye yon lòt chèche oswa kategori" />
      )}
      {products.length === 0 && (
        <div style={{ background: palette.surface, border: `0.5px solid ${palette.separatorSoft}`, borderRadius: radius.md, padding: 26, textAlign: "center", color: palette.muted2 }}>
          <Icon name="package" size={30} color={palette.muted3} style={{ margin: "0 auto 10px" }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: palette.inkSoft }}>Katalòg vid</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Ajoute yon pwodwi via AJOUTE</div>
        </div>
      )}
    </>
  );

  const renderIncoming = (
    <>
      {pendingBatches.length + deliveredBatches.length === 0 ? (
        <div style={{ background: palette.surface, border: `0.5px solid ${palette.separatorSoft}`, borderRadius: radius.md, padding: 28, textAlign: "center", boxShadow: shadow.soft }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon name="download" size={26} color={palette.accentGold} /></div>
          <div style={{ fontWeight: 700, fontSize: 14, color: palette.ink, marginTop: 10 }}>Poko gen livrezon ap vini</div>
          <div style={{ fontSize: 12, color: palette.muted, marginTop: 4, lineHeight: 17 }}>Kreye yon livrezon via AJOUTE → Nouvo Livrezon (Inventaire). Stòk la ap parèt nan "Nan magazen" sèlman lè li rive.</div>
        </div>
      ) : (
        [...pendingBatches, ...deliveredBatches].map(b => {
          const isPending = (b.status ?? "pending") === "pending";
          const movs = movements.filter(m => m.batch_id === b.id);
          const totalQty = movs.reduce((s, m) => s + (m.quantity || 0), 0);
          return (
            <div key={b.id} style={{ background: palette.surface, borderRadius: radius.md, borderWidth: 0.5, borderColor: isPending ? palette.accentGold : palette.successBd, padding: 14, boxShadow: shadow.soft, overflow: "hidden", position: "relative", marginBottom: 10, borderStyle: "solid" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: isPending ? palette.accentGold : palette.success }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: palette.ink, letterSpacing: -0.2 }}>{b.reference}</span>
                    {isPending ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGold}`, borderRadius: radius.pill, padding: "3px 8px" }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: palette.accentGold }} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: palette.accentGold, letterSpacing: 0.3 }}>AP VINI</span>
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: palette.successBg, border: `0.5px solid ${palette.successBd}`, borderRadius: radius.pill, padding: "3px 8px" }}>
                        <Icon name="checkmark" size={9} color={palette.success} />
                        <span style={{ fontSize: 10, fontWeight: 800, color: palette.success, letterSpacing: 0.3 }}>RIVE</span>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: palette.muted, marginTop: 3 }}>{b.supplier ? `${b.supplier} · ` : ""}{movs.length} atik · {fmt(totalQty)} pcs{!isPending && b.delivered_at ? ` · Rive ${b.delivered_at ? new Date(b.delivered_at).toLocaleDateString() : ""}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 600 }}>Stòk</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>{fmt(totalQty)} pcs</div>
                </div>
                <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 600 }}>Transpò</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>{fmt(Math.round(b.transport_cost ?? 0))} HTG</div>
                </div>
                <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: palette.muted3, fontWeight: 600 }}>Pri total</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isPending ? palette.accentGold : palette.success }}>{fmt(Math.round(b.total_cost ?? 0))} HTG</div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {movs.slice(0, 3).map(m => {
                  const prod = products.find(p => p.id === m.product_id);
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: "7px 10px" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: palette.ink }}>{prod?.name ?? m.product_id} <span style={{ color: palette.muted3, fontWeight: 500 }}>× {m.quantity}</span></span>
                      <span style={{ fontSize: 11, color: palette.muted }}>{fmt(Math.round(m.total_cost))} HTG</span>
                    </div>
                  );
                })}
                {movs.length > 3 && <div style={{ fontSize: 11, color: palette.muted3, textAlign: "center" }}>+{movs.length - 3} lòt atik</div>}
              </div>
              {isPending ? (
                <Button label="Livrezon rive ✓" variant="success" block style={{ marginTop: 10 }} onClick={() => { setDeliverBatch(b); setDeliverFee(""); setShowDeliver(true); }} />
              ) : (
                <div style={{ marginTop: 10, background: palette.successBg, borderRadius: radius.sm, paddingBlock: 10, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `0.5px solid ${palette.successBd}` }}>
                  <Icon name="checkmark-circle" size={15} color={palette.success} />
                  <span style={{ color: palette.success, fontWeight: 700, fontSize: 12 }}>Nan stòk depi {b.delivered_at ? new Date(b.delivered_at).toLocaleDateString() : "kounye a"}</span>
                </div>
              )}
            </div>
          );
        })
      )}
      {avgTransportShare > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGold}`, borderRadius: radius.pill, padding: "7px 12px", marginBottom: 8 }}>
          <Icon name="trending-up" size={13} color={palette.accentGold} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: palette.accentGold }}>Mwayèn transpò: {avgTransportShare.toFixed(1)}% nan pri acha</span>
        </div>
      )}
    </>
  );

  const header = (
    <div style={{ padding: `14px ${padH}px 2px` }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: palette.muted2 }}>ESTÒK • ENVANTÈ</div>
      <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: -0.4, color: palette.ink, marginTop: 4 }}>Stòk & Envantè</div>
      <div style={{ fontSize: 13, color: palette.muted, marginTop: 4 }}>Filtre kategori, bakod, valè total, maj, ak mouvman.</div>
      <div style={{ display: "flex", marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: palette.surface, border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: radius.pill, padding: "6px 12px" }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: lowCount > 0 ? palette.dangerDot : palette.successDot }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{products.length} pwodwi • {lowCount} fèb</span>
        </div>
      </div>
    </div>
  );

  const kpiStrip = (
    <div style={{ display: "flex", gap: 8, padding: `10px ${padH}px 0` }}>
      <KpiMini accent={palette.successDot} label="ATIK TOTAL" value={String(products.length)} sub={`${filtered.length} vizib • ${categories.length - 1} kategori`} />
      <KpiMini accent={palette.blue} label="VALÈ TOTAL" value={`${fmt(Math.round(totalValue))} HTG`} sub="Pri vant × kantite" />
      <KpiMini accent={palette.warningDot} label="MAJ %" value={`${marginPct.toFixed(1)}%`} valueColor={marginPct >= 20 ? palette.success : palette.warning} sub={`Pwofi ${fmt(Math.round(totalValue - totalCostValue))} HTG`} />
      <KpiMini accent={lowCount > 0 ? palette.danger : palette.violet} label="STÒK FÈB" value={String(lowCount)} valueColor={lowCount > 0 ? palette.danger : palette.ink} sub={lowCount > 0 ? lowList.slice(0, 2).map(x => x.name).join(", ") + (lowCount > 2 ? ` +${lowCount - 2}` : "") : "Tout atik stab"} />
    </div>
  );

  const tabStrip = (
    <div style={{ padding: `10px ${padH}px 0`, maxWidth: "100%" }}>
      <Segmented value={stockTab} onChange={setStockTab} options={[{ value: "store", label: "Nan magazen" }, { value: "incoming", label: "Livrezon" }]} />
    </div>
  );

  const addButton = canEdit ? (
    <button onClick={() => setShowAddChoice(true)} style={{ position: "fixed", bottom: 20, right: fabRight, zIndex: 50, display: "flex", alignItems: "center", gap: 8, background: palette.ink2, border: "1px solid #3D3D40", borderRadius: 12, padding: "12px 16px", color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.4, cursor: "pointer", boxShadow: shadow.elevated, fontFamily: "inherit" }}>
      <span style={{ fontSize: 16, color: palette.accentGold, fontWeight: 600 }}>+</span>
      <span>AJOUTE</span>
    </button>
  ) : null;

  return (
    <div style={{ minHeight: "100vh", background: palette.bg, position: "relative" }}>
      {header}
      {kpiStrip}
      {tabStrip}
      <div style={{ flex: 1, display: "flex", gap: 12, padding: padH, alignItems: "flex-start" }}>
        <div style={{ flex: isLargeTablet ? 3 : 1, minWidth: 0 }}>
          {stockTab === "store" ? renderStoreList : renderIncoming}
        </div>
        {isLargeTablet && (
          <div style={{ flex: 2, minWidth: 300, maxWidth: 560 }}>{inspector}</div>
        )}
      </div>
      {addButton}

      {!isLargeTablet && showDetail && detail && (
        <Overlay onClose={() => setShowDetail(false)} align="bottom">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: palette.ink }}>{detail.name}</div>
              <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>{detail.sku ?? "—"}</div>
            </div>
            <button onClick={() => setShowDetail(false)} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: palette.surfaceGrouped, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={palette.muted} /></button>
          </div>
          {inspector}
        </Overlay>
      )}

      {showAddChoice && (
        <Overlay onClose={() => setShowAddChoice(false)} align="bottom" width={560}>
          <ModalHeader title="Ajoute — chwazi aksyon" sub="Katalòg ≠ Stòk — pwodwi defini, inventaire anrejistre arivaj ak frè transpò" onClose={() => setShowAddChoice(false)} />
          <div onClick={() => { setShowAddChoice(false); setShowAddProduct(true); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderBottom: `0.5px solid ${palette.separatorSoft}`, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: palette.ink2, border: "0.5px solid rgba(200,162,74,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="pricetag" size={20} color={palette.accentGold} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Nouvo pwodwi (Katalòg)</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 1 }}>Non, sku, kategori, inite, pri acha & pri vann</div>
            </div>
            <Icon name="chevron-right" size={14} color={palette.muted2} />
          </div>
          <div onClick={() => { setShowAddChoice(false); setCatError(""); setNewCategory({ name: "", icon: "◈" }); setShowAddCategory(true); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderBottom: `0.5px solid ${palette.separatorSoft}`, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: palette.accentGoldSoft, border: "0.5px solid rgba(200,162,74,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="tag" size={19} color={palette.accentGold} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Nouvo kategori</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 1 }}>Manje, Bwason, Kay — pou òganize katalòg</div>
            </div>
            <Icon name="chevron-right" size={14} color={palette.muted2} />
          </div>
          <div onClick={() => { setShowAddChoice(false); setInvBubbles([]); setInvSupplier(""); setInvTransport(""); setInvNotes(""); setInvError(""); setInvReference(`LIV-${Date.now().toString().slice(-6)}`); setInvStep(1); setShowAddDelivery(true); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: palette.successBg, border: "0.5px solid rgba(16,185,129,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="layers" size={19} color={palette.success} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>Nouvo Livrezon (Inventaire)</div>
              <div style={{ fontSize: 11, color: palette.muted, marginTop: 1 }}>Chwazi pwodwi → kantite/pri → detay pakè + transpò</div>
            </div>
            <Icon name="chevron-right" size={14} color={palette.muted2} />
          </div>
        </Overlay>
      )}

      {showAddProduct && (
        <Overlay onClose={() => setShowAddProduct(false)} width={540}>
          <ModalHeader title="Nouvo pwodwi (Katalòg)" sub="Defini atik la — stock & pri via Inventaire" onClose={() => setShowAddProduct(false)} />
          <Field label="Non pwodwi *" required>
            <TextInput value={np.name} onChange={v => setNp(p => ({ ...p, name: v }))} placeholder="Ex. Pasta 500g" />
          </Field>
          <Field label="SKU" hint="Globally inik — si vid, otomatik">
            <TextInput value={np.sku} onChange={v => setNp(p => ({ ...p, sku: v }))} placeholder="Ex. PASTA-500" />
          </Field>
          <Field label="Kategori">
            <Select value={np.categoryId} onChange={v => setNp(p => ({ ...p, categoryId: v }))} options={categories.map(c => ({ value: c.id, label: c.id === "all" ? "—" : `${c.icon} ${c.name}` }))} />
          </Field>
          <Field label="Inite vant" hint="Inite baz konvèsyon ×1">
            <TextInput value={np.unitLabel} onChange={v => setNp(p => ({ ...p, unitLabel: v }))} placeholder="Unit" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Pri acha HTG">
                <TextInput value={np.buying} onChange={v => setNp(p => ({ ...p, buying: v.replace(/[^0-9.]/g, "") }))} numeric placeholder="0" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Pri vann HTG">
                <TextInput value={np.selling} onChange={v => setNp(p => ({ ...p, selling: v.replace(/[^0-9.]/g, "") }))} numeric placeholder="0" />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Field label="Kantite an stòk">
                <TextInput value={np.stock} onChange={v => setNp(p => ({ ...p, stock: v.replace(/[^0-9.]/g, "") }))} numeric placeholder="0" />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Seuil fèb">
                <TextInput value={np.low} onChange={v => setNp(p => ({ ...p, low: v.replace(/[^0-9]/g, "") }))} numeric placeholder="5" />
              </Field>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" onClick={() => setShowAddProduct(false)} style={{ flex: 1 }} />
            <Button label="+ Kreye pwodwi" variant="primary" onClick={handleCreateProduct} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {showAddCategory && (
        <Overlay onClose={() => setShowAddCategory(false)} width={440}>
          <ModalHeader title="Nouvo kategori" sub="Pou òganize katalòg pwodwi" onClose={() => setShowAddCategory(false)} />
          {catError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginBottom: 10 }}>{catError}</div> : null}
          <Field label="Non kategori *">
            <TextInput value={newCategory.name} onChange={v => { setNewCategory(c => ({ ...c, name: v })); setCatError(""); }} placeholder="Ex. Frijidè" />
          </Field>
          <Field label="Ikon" hint="Emoji oswa senbòl">
            <TextInput value={newCategory.icon} onChange={v => setNewCategory(c => ({ ...c, icon: v }))} placeholder="◈" maxLength={2} />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" onClick={() => setShowAddCategory(false)} style={{ flex: 1 }} />
            <Button label="+ Kreye kategori" variant="primary" onClick={handleCreateCategory} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {showAddDelivery && (
        <Overlay onClose={() => setShowAddDelivery(false)} align="bottom" width={640}>
          {invStep === 1 ? (
            <>
              <ModalHeader title={<>Livrezon — Chwazi pwodwi <span style={{ background: palette.accentGold, color: "#fff", borderRadius: 8, padding: "2px 7px", fontSize: 9, fontWeight: 800, marginLeft: 6, verticalAlign: "middle" }}>1/2</span></>} sub="Tape yon pwodwi → kantite, pri acha & pri vann → Ajoute" onClose={() => setShowAddDelivery(false)} />
              <SearchBar value={invProductSearch} onChange={setInvProductSearch} placeholder="Chèche pwodwi nan katalòg..." />
              {invError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginTop: 10 }}>{invError}</div> : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {products.filter(p => {
                  const qq = invProductSearch.toLowerCase();
                  if (!qq) return true;
                  return (p.name ?? "").toLowerCase().includes(qq) || (p.sku ?? "").toLowerCase().includes(qq) || (p.barcode ?? "").toLowerCase().includes(qq);
                }).map(p => {
                  const pcats = getProductCategoriesDisplay(p.id);
                  const inShip = invBubbles.some(b => b.productId === p.id);
                  const dp = getDisplayPrice(pricing, p.id);
                  const priceTxt = dp && dp.price > 0 ? `${fmt(dp.price)} HTG` : (Number(p.selling_price ?? 0) > 0 ? `${fmt(Number(p.selling_price))} HTG` : "—");
                  return (
                    <div key={p.id} onClick={() => invOpenAddSheet(p)} style={{ display: "flex", alignItems: "center", gap: 10, background: palette.surface, borderRadius: radius.md, border: `1px solid ${inShip ? "rgba(200,162,74,0.6)" : palette.hairline}`, padding: 10, cursor: "pointer", boxShadow: shadow.soft }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: inShip ? palette.accentGoldSoft : palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", border: `0.5px solid ${inShip ? palette.accentGold : palette.separatorSoft}` }}><Icon name="cube" size={17} color={inShip ? palette.accentGold : palette.muted2} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>{p.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: palette.muted, fontWeight: 600 }}>{p.sku}</span>
                          {pcats.slice(0, 2).map(c => <span key={c.id} style={{ background: palette.surfaceGrouped, borderRadius: 6, padding: "2px 5px", fontSize: 9, fontWeight: 600, color: palette.muted2 }}>{c.name}</span>)}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: palette.ink, ...monoStyle }}>{priceTxt}</div>
                        <div style={{ fontSize: 9, color: palette.muted, marginTop: 1 }}>{p.stock_quantity} pcs</div>
                      </div>
                      {inShip ? <div style={{ background: palette.accentGold, borderRadius: 8, padding: "3px 6px", fontSize: 9, fontWeight: 800, color: "#fff" }}>✓</div> : <Icon name="plus" size={20} color={palette.ink2} />}
                    </div>
                  );
                })}
                {products.length === 0 && <EmptyState icon="cube" title="Katalòg vid" body="Kreye pwodwi anvan" />}
              </div>
              {invBubbles.length > 0 && (
                <div style={{ position: "sticky", bottom: 0, marginTop: 14, background: palette.ink, borderRadius: 16, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", boxShadow: shadow.card }} onClick={() => setInvShowCart(true)}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: palette.accentGold, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontWeight: 900, color: "#fff", fontSize: 13 }}>{invBubbles.length}</span></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "#fff", fontSize: 12 }}>{invBubbles.length} pwodwi nan livrezon</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 1 }}>Tape pou wè detay · retire · modifye</div>
                  </div>
                  <div style={{ fontSize: 14, color: palette.accentGold, fontWeight: 800, ...monoStyle }}>{fmt(invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0))} HTG</div>
                  <Icon name="chevron-down" size={16} color="rgba(255,255,255,0.7)" />
                </div>
              )}
            </>
          ) : (
            <>
              <ModalHeader title={<>Detay livrezon <span style={{ background: palette.accentGold, color: "#fff", borderRadius: 8, padding: "2px 7px", fontSize: 9, fontWeight: 800, marginLeft: 6, verticalAlign: "middle" }}>2/2</span></>} sub={`${invBubbles.length} pwodwi · ${fmt(invBubbles.reduce((s, b) => s + b.qty, 0))} total atik`} onClose={() => setShowAddDelivery(false)} />
              {invError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginBottom: 10 }}>{invError}</div> : null}
              <div style={{ background: palette.surface, borderRadius: radius.md, border: `1px solid ${palette.hairline}`, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}><Field label="Referans"><TextInput value={invReference} onChange={setInvReference} placeholder="LIV-123456" /></Field></div>
                  <div style={{ flex: 1 }}><Field label="Founisè"><TextInput value={invSupplier} onChange={setInvSupplier} placeholder="Eg. Haiti Import" /></Field></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Field label="Frè transpò HTG" hint="Reparti otomatik sou chak pwodwi">
                      <TextInput value={invTransport} onChange={v => { setInvTransport(v); if (invError) setInvError(""); }} numeric placeholder="0" />
                    </Field>
                  </div>
                  <div style={{ flex: 1 }}><Field label="Nòt (opsyonèl)"><TextInput value={invNotes} onChange={setInvNotes} placeholder="Eg. wout Delmas" /></Field></div>
                </div>
                {(invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0)) > 0 && transportTotal() > 0 && (
                  <div style={{ background: palette.ink2, borderRadius: radius.sm, padding: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.4 }}>REPARTISYON TRANSPÒ — preview</div>
                    <div style={{ height: 10, display: "flex", borderRadius: 5, overflow: "hidden", marginTop: 8, background: "rgba(255,255,255,0.15)" }}>
                      {invBubbles.map((b, idx) => {
                        const total = invBubbles.reduce((s, x) => s + x.qty * x.costPrice, 0);
                        const pct = total > 0 ? (b.qty * b.costPrice) / total * 100 : 0;
                        const colors = [palette.accentGold, palette.successDot, palette.warningDot, "#8B5CF6", "#EC4899"];
                        return <div key={idx} style={{ width: `${pct}%`, background: colors[idx % colors.length] }} />;
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>Total atik {fmt(invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0))} HTG</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: palette.accentGold }}>+ {fmt(transportTotal())} HTG → {fmt(invBubbles.reduce((s, b) => s + b.qty * b.costPrice, 0) + transportTotal())} HTG revient</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <Button label="Retounen" variant="soft" onClick={() => setInvStep(1)} style={{ flex: 1 }} />
                <Button label="✓ Anrejistre livrezon" variant="primary" onClick={handleCreateInventory} style={{ flex: 2 }} />
              </div>
            </>
          )}
        </Overlay>
      )}

      {invSelectedProduct && (
        <Overlay onClose={invCloseAddSheet} align="bottom" width={640}>
          <ModalHeader title={invSelectedProduct.name} sub={`${invSelectedProduct.sku ?? ""}${invEditIdx !== null ? " · MODIFYE" : ""}`} onClose={invCloseAddSheet} />
          {invError ? <div style={{ background: palette.dangerBg, border: `0.5px solid ${palette.dangerBd}`, borderRadius: radius.sm, padding: 10, fontSize: 12, fontWeight: 600, color: palette.danger, marginBottom: 10 }}>{invError}</div> : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {invUnitsFor(invSelectedProduct.id).map(u => {
              const active = (invSelUnitId || invSelUnit()?.id) === u.id;
              return (
                <button key={u.id} onClick={() => { setInvSelUnitId(u.id); setInvInputSell(invUnitSellPrice(u.id)); }} style={{ padding: "8px 12px", borderRadius: 10, background: active ? palette.ink2 : palette.surfaceGrouped, border: `1px solid ${active ? palette.ink2 : palette.hairline}`, color: active ? "#fff" : palette.ink, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  {u.unit_name}{Number(u.conversion_factor) > 1 ? ` ×${u.conversion_factor}` : ""}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><Field label={`Kantite${invSelUnit() ? ` (${invSelUnit()!.unit_name})` : ""} *`}><TextInput value={invInputQty} onChange={v => { setInvInputQty(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" /></Field></div>
            <div style={{ flex: 1 }}><Field label={`Pri achte HTG${invSelUnit() ? ` / ${invSelUnit()!.unit_name}` : ""} *`}><TextInput value={invInputCost} onChange={v => { setInvInputCost(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" /></Field></div>
          </div>
          <Field label={`Pri vann${invSelUnit() ? ` (${invSelUnit()!.unit_name})` : ""} HTG`} hint="Pre-ranpli: pri aktyèl katalòg la">
            <TextInput value={invInputSell} onChange={v => { setInvInputSell(v.replace(/[^0-9.]/g, "")); if (invError) setInvError(""); }} numeric placeholder="0" />
          </Field>
          <div style={{ display: "flex", gap: 8 }}>
            {invEditIdx !== null && (
              <Button label="Effase" variant="danger" onClick={() => { if (invEditIdx !== null) handleInvRemoveBubble(invEditIdx); invCloseAddSheet(); }} />
            )}
            <Button label={invEditIdx !== null ? "✓ Mete ajou" : "✓ Ajoute"} variant="primary" onClick={handleInvAjoute} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {invShowCart && (
        <Overlay onClose={() => setInvShowCart(false)} align="bottom" width={640}>
          <ModalHeader title="Atik nan livrezon" sub={`${invBubbles.length} pwodwi · Tape pou modifye`} onClose={() => setInvShowCart(false)} />
          {invBubbles.map((b, idx) => (
            <div key={idx} onClick={() => invOpenEditSheet(idx, b)} style={{ display: "flex", alignItems: "center", gap: 10, background: palette.surface, border: `1px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10, cursor: "pointer", marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink }}>{b.name}</span>
                  {b.sellPrice > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: palette.muted2 }}>vann {fmt(b.sellPrice)} HTG</span>}
                </div>
                <div style={{ fontSize: 10, color: palette.muted, marginTop: 2 }}>{b.qty} {b.unitName ?? b.unit ?? "pcs"} × {fmt(b.costPrice)} HTG = {fmt(b.qty * b.costPrice)} HTG{Number(b.factor) > 1 ? ` (${fmt(b.qty * Number(b.factor))} inite baz)` : ""}</div>
              </div>
              <span style={{ background: palette.accentGoldSoft, borderRadius: 8, padding: "4px 8px", fontSize: 10, fontWeight: 800, color: palette.accentGold }}>{b.qty} {b.unitName ?? b.unit ?? "pcs"}</span>
              <button onClick={e => { e.stopPropagation(); handleInvRemoveBubble(idx); }} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: palette.dangerBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="trash" size={13} color={palette.danger} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button label="Kontinye" variant="ghost" onClick={() => setInvShowCart(false)} style={{ flex: 1 }} />
            <Button label="Founisè/Transpò →" variant="primary" onClick={() => { setInvShowCart(false); setInvStep(2); }} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {showDeliver && deliverBatch && (
        <Overlay onClose={() => { setShowDeliver(false); setDeliverBatch(null); }} width={440}>
          <ModalHeader title="Konfime livrezon ✓" sub={`${deliverBatch.reference} • ${movements.filter(m => m.batch_id === deliverBatch.id && m.type === "in").length} atik ap antre nan stòk`} onClose={() => { setShowDeliver(false); setDeliverBatch(null); }} />
          <Field label="Frè transpò anplis (HTG)" hint="Opsyonèl — repati sou chak pwodwi">
            <TextInput value={deliverFee} onChange={v => setDeliverFee(v.replace(/[^0-9.]/g, ""))} numeric placeholder="0" />
          </Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" onClick={() => { setShowDeliver(false); setDeliverBatch(null); }} style={{ flex: 1 }} />
            <Button label="✓ Konfime livrezon" variant="success" onClick={handleDeliver} disabled={delivering} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {priceReview && (
        <Overlay onClose={() => finishPriceReview(false)} align="bottom" width={640}>
          <ModalHeader title="Livrezon anrejistre ✓" sub={priceReviewSummary} onClose={() => finishPriceReview(false)} />
          <div style={{ fontSize: 11, color: palette.muted2, marginTop: 4, marginBottom: 8 }}>Mete pri vann yo ajou pou tout variant — opsyonèl. Vid = kenbe pri aktyèl la.</div>
          {priceReview.map((p, pi) => (
            <div key={p.productId} style={{ marginTop: 10, background: palette.surfaceGrouped, borderRadius: radius.sm, padding: 10, border: `0.5px solid ${palette.hairline}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: palette.ink }}>{p.name}</div>
              {p.rows.map((r, ri) => (
                <div key={`${r.unitId}-${r.variant}`} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1 }}><span style={{ fontWeight: 600, fontSize: 12, color: palette.ink }}>{r.unitName} · {r.variant}</span></div>
                  <input value={r.price} onChange={e => setReviewRowPrice(pi, ri, e.target.value)} placeholder="—" style={{ width: 110, border: `1px solid ${palette.hairline}`, borderRadius: radius.sm, padding: "9px 10px", textAlign: "center", fontWeight: 700, fontSize: 14, color: palette.ink, background: "#fff", outline: "none", fontFamily: "inherit" }} />
                </div>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button label="Kite konsa" variant="ghost" onClick={() => finishPriceReview(false)} style={{ flex: 1 }} />
            <Button label="✓ Sove pri yo" variant="primary" onClick={() => finishPriceReview(true)} style={{ flex: 2 }} />
          </div>
        </Overlay>
      )}
    </div>
  );
}