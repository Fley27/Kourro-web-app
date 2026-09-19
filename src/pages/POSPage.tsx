import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getDb } from "../lib/db";
import { ht } from "../lib/i18n";
import { palette, radius, shadow } from "../lib/theme";
import {
  loadPricing, ensurePricingForProducts, getUnitsForProduct, getPricesForUnit,
  getDefaultUnit, getBasePrice, resolveLinePrice, getDisplayPrice,
  DEFAULT_VARIANT, type PricingMaps, type LinePrice, type ProductUnit,
} from "../lib/pricing";
import { fmt, monoStyle } from "../lib/format";
import { useAuthStore } from "../lib/authStore";
import { useResponsive } from "../lib/responsive";
import { salesEvents } from "../lib/salesEvents";
import { buildReceipts, type ReceiptData } from "../lib/receipts";
import { Button, Card, Overlay, ModalHeader, TextInput, toast } from "../components/ui";
import { Icon } from "../components/Icon";
import { ReceiptModal } from "../components/ReceiptModal";

const STORE_ID = "demo-store-id";
const DEVICE_ID = "web-pos";

type Product = {
  id: string;
  store_id?: string;
  sku?: string;
  barcode?: string;
  name: string;
  name_ht?: string;
  unit?: string;
  category_id?: string;
  cost_price: number;
  selling_price?: number;
  stock_quantity: number;
  current_amount_available: number;
  low_stock_threshold?: number;
};

type PendingSel = { unitId: string | null; unitName: string | null; factor: number; variant: string };

type CartItem = {
  key: string;
  id: string;
  name: string;
  unitId: string | null;
  unitName: string | null;
  variant: string;
  factor: number;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  bundleApplied: boolean;
  basePrice: number;
};

type PendingState = { product: Product; qty: number; remaining: number; sel: PendingSel };
type SearchMode = "name" | "barcode" | "category";
type PaymentMethod = "cash" | "mobile" | "credit";
type MobileProvider = "moncash" | "natcash";
type Customer = {
  id: string;
  store_id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  id_card_number?: string | null;
  total_debt?: number;
  credit_limit?: number | null;
  credit_limit_source?: string | null;
  is_high_risk?: boolean | number;
  open_debt_count?: number;
};

const CATS = [
  { id: "Tout", label: "Tout" },
  { id: "manje", label: "Manje" },
  { id: "bwason", label: "Bwason" },
  { id: "kay", label: "Kay" },
  { id: "letye", label: "Letye" },
] as const;

const CAT_KEYWORDS: Record<string, string[]> = {
  letye: ["lèt", "let", "lait", "milk", "fromaj", "fromage"],
  bwason: ["prestige", "biè", "bier", "beer", "kola", "cola", "dlo", "eau", "water", "jus", "guarana", "soda"],
  kay: ["savon", "savon", "colgate", "pat", "toothpaste", "detergent", "poud", "sèl", "sel", "epin", "netwayaj"],
  manje: ["diri", "rice", "farin", "farine", "flour", "lwil", "huile", "oil", "sik", "sucr", "sugar", "pasta", "spaghetti", "tomat", "tomato", "sardine", "mayi", "corn", "biskè", "biscuit", "kafe", "coffee", "bokit", "pwa", "pât"],
};

function catFor(p: Product): string {
  const hay = `${p.name_ht ?? ""} ${p.name} ${p.sku ?? ""} ${p.unit ?? ""}`.toLowerCase();
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    if (kws.some(kw => kw && hay.includes(kw))) return cat;
  }
  return "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toNum(v: string | number | boolean | null | undefined): number {
  const n = Number(String(v ?? "").replace(",", ".") || 0);
  return isNaN(n) ? 0 : n;
}

function maxQtyFor(product: Product, sel: PendingSel | null): number {
  const base = Math.max(0, toNum(product.current_amount_available ?? product.stock_quantity));
  if (base <= 0) return 0;
  const factor = Math.max(1, toNum(sel?.factor ?? 1)) || 1;
  return Math.max(1, Math.floor(base / factor));
}

function cartKeyFor(sel: PendingSel): string {
  return `${sel.unitId ?? "none"}|${sel.variant ?? "Regular"}`;
}

export function POSPage() {
  const [searchParams] = useSearchParams();
  const { isLargeTablet } = useResponsive();
  const wide = isLargeTablet;
  const { user, cached } = useAuthStore();
  const role = user?.role ?? cached?.role ?? "cashier";
  const myId = user?.id ?? cached?.userId ?? null;
  const myName = user?.name ?? cached?.name ?? role;
  const storeName = user?.store ?? cached?.store ?? "Petyonvil";
  const isManagerPlus = ["owner", "admin", "manager"].includes(role);
  const canProcessCreditSale = isManagerPlus;

  const [products, setProducts] = useState<Product[]>([]);
  const [pricing, setPricing] = useState<PricingMaps>({ units: [], prices: [], bundles: [] });
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [cat, setCat] = useState("Tout");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState("");
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceVal, setEditingPriceVal] = useState("");
  const [pending, setPending] = useState<PendingState | null>(null);
  const [pendingInput, setPendingInput] = useState("");

  const [showPay, setShowPay] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [mobileProvider, setMobileProvider] = useState<MobileProvider>("moncash");
  const [amountGiven, setAmountGiven] = useState("");
  const [clientLegalName, setClientLegalName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [akompte, setAkompte] = useState("");
  const [rabè, setRabè] = useState("");
  const [showCashCustomer, setShowCashCustomer] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: "", idCard: "", phone: "", limit: "" });
  const [creditDueOption, setCreditDueOption] = useState("30");
  const [creditDueDate, setCreditDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); });
  const [creditDueCustom, setCreditDueCustom] = useState("");

  const [lastReceipts, setLastReceipts] = useState<{ customer: ReceiptData; store: ReceiptData } | null>(null);

  useEffect(() => {
    if (searchParams.get("credit") !== "1") return;
    const cid = searchParams.get("customer");
    if (!cid) return;
    const match = customers.find(c => c.id === cid);
    if (!match) return;
    setSelectedCustomer(match);
    setPayment("credit");
    toast("Kredi preselectione", `${match.name} • payment kredi. Ajoute pwodwi epi peye.`, "success");
  }, [customers, searchParams]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let pm: PricingMaps = { units: [], prices: [], bundles: [] };
      try {
        const db = await getDb();
        const rows = ((await db.getAllAsync("SELECT * FROM products").catch(() => [])) ?? []) as any[];
        const prods: Product[] = (rows.length ? rows : []).map((p: any) => ({
          id: p.id,
          store_id: p.store_id,
          sku: p.sku ?? "",
          barcode: p.barcode ?? p.sku ?? "",
          name: p.name,
          name_ht: p.name_ht,
          unit: p.unit ?? "Unit",
          category_id: p.category_id,
          cost_price: toNum(p.cost_price),
          selling_price: toNum(p.selling_price),
          stock_quantity: toNum(p.stock_quantity),
          current_amount_available: toNum(p.current_amount_available),
          low_stock_threshold: toNum(p.low_stock_threshold),
        }));
        if (mounted) setProducts(prods);
        pm = (await ensurePricingForProducts(db, prods).catch(() => null)) ?? pm;
        if (!pm?.units?.length) pm = (await loadPricing(db).catch(() => pm)) ?? pm;
        if (mounted) setPricing(pm);
        const custs = ((await db.getAllAsync("SELECT * FROM customers").catch(() => [])) ?? []) as Customer[];
        if (mounted) setCustomers(custs);
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const iv = window.setInterval(() => {
      setPending(prev => {
        if (!prev) return prev;
        if (prev.remaining <= 1) {
          const sel = { unitId: prev.sel.unitId, unitName: prev.sel.unitName, factor: prev.sel.factor, variant: prev.sel.variant };
          const prod = prev.product;
          setCart(c => mergeLine(c, prod, sel, Math.max(1, prev.qty)));
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => window.clearInterval(iv);
  }, [pending?.product.id, pending?.sel.unitId, pending?.sel.variant, pending?.qty]);

  function unitsFor(product: Product): ProductUnit[] {
    return getUnitsForProduct(pricing, product.id).filter(u =>
      getPricesForUnit(pricing, u.id).some(r => toNum(r.price) > 0)
    );
  }

  function buildSelFor(product: Product, unitId?: string | null, variant?: string | null): PendingSel {
    const units = unitsFor(product);
    const unit = units.find(u => u.id === unitId) ?? getDefaultUnit(units) ?? units[0] ?? null;
    const rows = unit ? getPricesForUnit(pricing, unit.id).filter(r => toNum(r.price) > 0) : [];
    const row = rows.find(r => r.variant === (variant && variant !== DEFAULT_VARIANT ? variant : DEFAULT_VARIANT)) ?? rows.find(r => r.variant === DEFAULT_VARIANT) ?? rows[0];
    if (!unit || !row) return { unitId: null, unitName: null, factor: 1, variant: DEFAULT_VARIANT };
    return { unitId: unit.id, unitName: unit.unit_name, factor: toNum(unit.conversion_factor) || 1, variant: row.variant };
  }

  function priceFor(product: Product, sel: PendingSel | null, qty: number): LinePrice {
    const hasPricedUnits = unitsFor(product).length > 0;
    if (!hasPricedUnits) {
      const price = toNum(product.selling_price);
      return { unitPrice: price, lineTotal: round2(price * qty), bundleApplied: false };
    }
    if (!sel || !sel.unitId) return { unitPrice: 0, lineTotal: 0, bundleApplied: false };
    return resolveLinePrice(pricing, sel.unitId, sel.variant, qty);
  }

  function displayPriceFor(p: Product): { price: number; unitName: string; variant: string } | null {
    const d = getDisplayPrice(pricing, p.id);
    if (d && d.price > 0) return d;
    const price = toNum(p.selling_price);
    if (price <= 0) return null;
    return { price, unitName: p.unit ?? "Unit", variant: DEFAULT_VARIANT };
  }

  function makeLine(product: Product, sel: PendingSel, qty: number): CartItem {
    const lp = priceFor(product, sel, qty);
    const base = sel.unitId ? toNum(getBasePrice(pricing, sel.unitId, sel.variant)) : toNum(product.selling_price);
    return {
      key: cartKeyFor(sel),
      id: product.id,
      name: product.name,
      unitId: sel.unitId,
      unitName: sel.unitName,
      variant: sel.variant,
      factor: sel.factor,
      qty: Math.max(1, qty),
      unitPrice: lp.unitPrice,
      lineTotal: lp.lineTotal,
      bundleApplied: lp.bundleApplied,
      basePrice: base > 0 ? base : lp.unitPrice,
    };
  }

  function mergeLine(cartIn: CartItem[], product: Product, sel: PendingSel, qty: number, forceNew = false): CartItem[] {
    const key = cartKeyFor(sel);
    const max = maxQtyFor(product, sel);
    const existing = cartIn.find(it => it.key === key);
    if (!existing) {
      const target = Math.max(1, Math.min(qty, max || qty));
      const it = makeLine(product, sel, target);
      return [...cartIn, it];
    }
    const nextRaw = forceNew ? qty : existing.qty + Math.max(1, qty);
    const next = max ? Math.min(nextRaw, max) : nextRaw;
    if (next <= 0) return cartIn.filter(it => it.key !== key);
    return cartIn.map(it => {
      if (it.key !== key) return it;
      const lp = sel.unitId
        ? resolveLinePrice(pricing, sel.unitId, sel.variant, next, existing.basePrice || existing.unitPrice)
        : { unitPrice: existing.unitPrice, lineTotal: round2(existing.unitPrice * next), bundleApplied: false };
      return { ...it, qty: next, unitPrice: lp.unitPrice, lineTotal: lp.lineTotal, bundleApplied: lp.bundleApplied };
    });
  }

  function incQty(key: string) {
    const it = cart.find(c => c.key === key);
    if (!it) return;
    const product = products.find(p => p.id === it.id);
    if (!product) return;
    const sel = { unitId: it.unitId, unitName: it.unitName, factor: it.factor, variant: it.variant };
    const max = maxQtyFor(product, sel);
    const next = it.qty + 1;
    if (max && next > max) {
      toast("Limit stock", `Stock maksimòm: ${max} × ${it.unitName ?? ""}`.trim(), "warn");
      return;
    }
    setCart(c => mergeLine(c, product, sel, 1));
  }

  function decQty(key: string) {
    const it = cart.find(c => c.key === key);
    if (!it) return;
    if (it.qty <= 1) return removeFromCart(key);
    const product = products.find(p => p.id === it.id);
    if (!product) return;
    const sel = { unitId: it.unitId, unitName: it.unitName, factor: it.factor, variant: it.variant };
    setCart(c => c.map(l => {
      if (l.key !== key) return l;
      const lp = l.unitId
        ? resolveLinePrice(pricing, l.unitId, l.variant, l.qty - 1, l.basePrice || l.unitPrice)
        : { unitPrice: l.unitPrice, lineTotal: round2(l.unitPrice * (l.qty - 1)), bundleApplied: false };
      return { ...l, qty: l.qty - 1, unitPrice: lp.unitPrice, lineTotal: lp.lineTotal, bundleApplied: lp.bundleApplied };
    }));
  }

  function removeFromCart(key: string) {
    setCart(c => c.filter(x => x.key !== key));
  }

  function clearCart() {
    setCart([]);
  }

  function setCustomQty(key: string, v: string) {
    const it = cart.find(c => c.key === key);
    if (!it) return;
    const product = products.find(p => p.id === it.id);
    if (!product) return;
    const sel = { unitId: it.unitId, unitName: it.unitName, factor: it.factor, variant: it.variant };
    const parsed = Math.floor(toNum(v));
    const max = maxQtyFor(product, sel);
    const next = max ? Math.min(parsed, max) : parsed;
    if (!next || next <= 0) return;
    setCart(c => c.map(l => {
      if (l.key !== key) return l;
      const lp = l.unitId
        ? resolveLinePrice(pricing, l.unitId, l.variant, next, l.basePrice || l.unitPrice)
        : { unitPrice: l.unitPrice, lineTotal: round2(l.unitPrice * next), bundleApplied: false };
      return { ...l, qty: next, unitPrice: lp.unitPrice, lineTotal: lp.lineTotal, bundleApplied: lp.bundleApplied };
    }));
  }

  function setLinePrice(key: string, price: number) {
    setCart(c => c.map(l => {
      if (l.key !== key) return l;
      return { ...l, unitPrice: round2(Math.max(0, price)), lineTotal: round2(Math.max(0, price) * l.qty), bundleApplied: false };
    }));
  }

  function commitPending(product: Product, qty: number, sel?: PendingSel | null) {
    const s = sel ?? pending?.sel ?? buildSelFor(product);
    const max = maxQtyFor(product, s);
    const target = max ? Math.min(Math.max(1, qty), max) : Math.max(1, qty);
    setCart(c => mergeLine(c, product, s, target));
    setPending(null);
    setPendingInput("");
  }

  function commitPendingWithInput() {
    if (!pending) return;
    commitPending(pending.product, Math.max(1, Math.floor(toNum(pendingInput)) || pending.qty));
  }

  function handleProductPress(product: Product) {
    const sel = buildSelFor(product, null, DEFAULT_VARIANT);
    const max = maxQtyFor(product, sel);
    if (max <= 0) {
      toast("Pa gen stock", "Ateri envanntè anvan ou vann", "warn");
      return;
    }
    if (pending && pending.product.id === product.id && pending.qty < max) {
      setPending(p => !p ? null : { ...p, qty: Math.min(max, p.qty + 1), remaining: 10 });
      return;
    }
    if (pending) commitPending(pending.product, pending.qty);
    const firstSel = buildSelFor(product, sel.unitId, sel.variant);
    setPending({ product, qty: 1, remaining: 10, sel: firstSel });
    setPendingInput("");
  }

  const subtotal = round2(cart.reduce((s, it) => s + it.lineTotal, 0));
  const discountNum = Math.min(toNum(rabè), subtotal);
  const total = round2(Math.max(0, subtotal - discountNum));
  const cartCount = cart.reduce((s, it) => s + it.qty, 0);
  const pendingLine = pending ? priceFor(pending.product, pending.sel, pending.qty) : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (cat !== "Tout" && catFor(p) !== cat) return false;
      if (!q) return true;
      if (searchMode === "barcode") return (p.barcode ?? p.sku ?? "").toLowerCase().includes(q);
      if (searchMode === "category") {
        const c = catFor(p);
        return c.includes(q) || (p.category_id ?? "").toLowerCase().includes(q);
      }
      return `${p.name} ${p.name_ht ?? ""}`.toLowerCase().includes(q);
    });
  }, [products, search, searchMode, cat]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.id_card_number ?? "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  function openPay() {
    if (pending) commitPending(pending.product, pending.qty);
    setShowPay(true);
  }

  function selectPayment(m: PaymentMethod) {
    if (m === "credit" && !canProcessCreditSale) {
      toast("Pa gen dwa", "Se Manager ak pi wo ka fè vant sou kredi. Kesye pa ka fè vant sou kredi.", "warn");
      return;
    }
    setPayment(m);
  }

  function confirmPay() {
    if (!cart.length) {
      toast(ht.emptyCart, "Ajoute pwodwi anvan ou peye", "warn");
      return;
    }
    if (pending) commitPending(pending.product, pending.qty);
    let finalCart = cart;
    if (pending) {
      const s = { unitId: pending.sel.unitId, unitName: pending.sel.unitName, factor: pending.sel.factor, variant: pending.sel.variant };
      finalCart = mergeLine(cart, pending.product, s, pending.qty);
      setCart(finalCart);
    }
    if (!finalCart.length) {
      toast(ht.emptyCart, "Ajoute pwodwi anvan ou peye", "warn");
      return;
    }
    const finalSubtotal = round2(finalCart.reduce((s, it) => s + it.lineTotal, 0));
    const disc = Math.min(toNum(rabè), finalSubtotal);
    const finalTotal = round2(Math.max(0, finalSubtotal - disc));
    const isCashLike = payment === "cash" || payment === "mobile";
    const akompteNum = payment === "credit" ? Math.min(Math.max(toNum(akompte), 0), finalTotal) : 0;
    const amountGivenNum = toNum(amountGiven);

    if (payment === "cash" && amountGiven && amountGivenNum < finalTotal) {
      toast("Kòb ensifizan", `${fmt(amountGivenNum)} HTG bay, rezerve ${fmt(finalTotal)} HTG. Rès: ${fmt(finalTotal - amountGivenNum)} HTG`, "warn");
      return;
    }
    if (payment === "mobile" && (!clientLegalName.trim() || !clientPhone.trim())) {
      toast("Enfòmasyon kliyan obligatwa", "Non legal ak telefòn obligatwa pou MonCash/NatCash.", "warn");
      return;
    }
    if (payment === "credit" && !canProcessCreditSale) {
      toast("Pa gen dwa", "Se Manager ak pi wo ka fè vant sou kredi.", "warn");
      return;
    }
    if (payment === "credit") {
      if (!selectedCustomer) {
        toast("Kliyan obligatwa", "Chwazi yon kliyan anrejistre anvan vant kredi", "warn");
        return;
      }
      if (!selectedCustomer.id_card_number) {
        toast("ID obligatwa", "Kliyan sa a pa gen nimewo kat idantite.", "warn");
        return;
      }
      const bal = toNum(selectedCustomer.total_debt);
      const lim = selectedCustomer.credit_limit === null || selectedCustomer.credit_limit === undefined || toNum(selectedCustomer.credit_limit) === 0 ? null : toNum(selectedCustomer.credit_limit);
      if (bal < 0) {
        toast("Balans negatif", `${selectedCustomer.name} gen dèt negatif (${fmt(bal)} HTG). Sistèm bloke kredi.`, "warn");
        return;
      }
      if (lim !== null && bal + finalTotal > lim) {
        toast("Depase limit kredi — BLOKE", `${selectedCustomer.name} • Limit: ${fmt(lim)} HTG • Dèt: ${fmt(bal)} HTG`, "error");
        return;
      }
      if (!creditDueDate || isNaN(new Date(creditDueDate).getTime())) {
        toast("Echèans obligatwa", "Chwazi dat echèans (7/15/30/60 jou oswa lòt dat)", "warn");
        return;
      }
      if (akompte.trim() !== "" && (toNum(akompte) < 0 || toNum(akompte) > finalTotal)) {
        toast("Akompte pa valab", `Akompte a dwe ant 0 ak ${fmt(finalTotal)} HTG`, "warn");
        return;
      }
    }

    const amountPaid = isCashLike ? (amountGiven ? amountGivenNum : finalTotal) : akompteNum;
    const amountDue = round2(Math.max(0, finalTotal - amountPaid));
    const finalChange = payment === "cash" && amountGiven ? round2(Math.max(0, amountGivenNum - finalTotal)) : 0;
    const pm: string = payment === "mobile" ? mobileProvider : payment;
    const now = new Date().toISOString();
    const saleId = `sale_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const saleNumber = `VTE-${Date.now().toString().slice(-6)}`;

    const sale = {
      id: saleId, store_id: STORE_ID, sale_number: saleNumber,
      customer_id: selectedCustomer?.id ?? null,
      status: payment === "credit" ? "credit" : "completed",
      payment_method: pm, subtotal: finalSubtotal, discount: round2(disc), total: finalTotal,
      amount_paid: round2(amountPaid), amount_due: amountDue,
      seller_id: myId, seller_role: role,
      device_id: DEVICE_ID, lamport_clock: Date.now(), created_at: now, updated_at: now, is_deleted: 0,
    };

    (async () => {
      const db = await getDb();
      try {
        await db.runAsync(
          "INSERT INTO sales (id,store_id,sale_number,customer_id,status,payment_method,subtotal,total,amount_paid,amount_due,seller_id,seller_role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [sale.id, sale.store_id, sale.sale_number, sale.customer_id, sale.status, sale.payment_method, sale.subtotal, sale.total, sale.amount_paid, sale.amount_due, sale.seller_id, sale.seller_role, sale.created_at, sale.updated_at]
        );

        for (let i = 0; i < finalCart.length; i++) {
          const it = finalCart[i];
          const itemId = `${saleId}_${i}_${it.id}`;
          const baseQty = it.qty * (it.factor || 1);
          let remainingToSell = baseQty;
          let consumedCost = 0;
          const batchRows = ((((await db.getAllAsync(
            "SELECT * FROM stock_movements WHERE product_id = ? AND type = 'in' AND remaining_qty > 0 AND status = 'delivered' ORDER BY created_at ASC, id ASC",
            [it.id]
          )) ?? []) as any[])
            .filter((br: any) => br && br.type === "in" && toNum(br.remaining_qty) > 0 && br.status === "delivered")
            .sort((a: any, b: any) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || (a.id ?? "").localeCompare(b.id ?? "")));
          for (const br of batchRows) {
            if (remainingToSell <= 0) break;
            const consume = Math.min(toNum(br.remaining_qty), remainingToSell);
            const uc = toNum(br.quantity) > 0 && toNum(br.allocated_transport)
              ? (toNum(br.unit_cost) + toNum(br.allocated_transport) / toNum(br.quantity))
              : toNum(br.unit_cost);
            consumedCost += consume * uc;
            await db.runAsync("UPDATE stock_movements SET remaining_qty = remaining_qty - ? WHERE id = ?", [consume, br.id]);
            remainingToSell -= consume;
          }
          await db.runAsync(
            "INSERT INTO sale_items (id,store_id,sale_id,product_id,product_name,unit_id,variant,quantity,unit_price,cost_price,line_total,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [itemId, STORE_ID, saleId, it.id, it.name, it.unitId || null, it.variant, it.qty, round2(it.unitPrice), round2(consumedCost), it.lineTotal, now]
          );
          await db.runAsync(
            "UPDATE products SET stock_quantity = stock_quantity - ?, current_amount_available = current_amount_available - ? WHERE id = ?",
            [baseQty, baseQty, it.id]
          );
          const base = it.basePrice || it.unitPrice;
          const prodCost = toNum((products.find(p => p.id === it.id) as any)?.cost_price);
          if (it.unitPrice > 0 && Math.abs(it.unitPrice - base) > 0.005) {
            await db.runAsync(
              "INSERT INTO price_history (id,store_id,product_id,old_cost,new_cost,old_price,new_price,created_at) VALUES (?,?,?,?,?,?,?,?)",
              [`ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, STORE_ID, it.id, prodCost, prodCost, round2(base), round2(it.unitPrice), now]
            );
          }
        }

        if (payment === "credit" && selectedCustomer?.id) {
          const creditBalance = Math.max(0, finalTotal - akompteNum);
          const credit = {
            id: `cr_${saleId}`, store_id: STORE_ID, sale_id: saleId, customer_id: selectedCustomer.id,
            amount: finalTotal, amount_paid: akompteNum, balance: creditBalance,
            status: creditBalance <= 0 ? "paid" : (akompteNum > 0 ? "partial" : "pending"),
            due_date: creditDueDate, updated_at: now,
          };
          await db.runAsync(
            "INSERT INTO credits (id,store_id,sale_id,customer_id,amount,amount_paid,balance,status,due_date,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [credit.id, credit.store_id, credit.sale_id, credit.customer_id, credit.amount, credit.amount_paid, credit.balance, credit.status, credit.due_date, credit.updated_at]
          );
          if (akompteNum > 0) {
            const receiptNum = `REC-${now.slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            await db.runAsync(
              "INSERT INTO credit_payments (id, store_id, credit_id, debt_id, amount, payment_method, receipt_number, created_at, collected_by) VALUES (?,?,?,?,?,?,?,?,?)",
              [`pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, STORE_ID, credit.id, credit.id, akompteNum, "cash", receiptNum, now, myId]
            );
          }
          const cust = selectedCustomer;
          const newTotalDebt = toNum(cust.total_debt) + creditBalance;
          const newOpen = toNum(cust.open_debt_count) + (creditBalance > 0 ? 1 : 0);
          await db.runAsync("UPDATE customers SET total_debt = ? WHERE id = ?", [newTotalDebt, cust.id]);
          await db.runAsync("UPDATE customers SET is_high_risk = ? WHERE id = ?", [creditBalance > 0 ? 1 : 0, cust.id]);
          await db.runAsync("UPDATE customers SET open_debt_count = ? WHERE id = ?", [newOpen, cust.id]);
          setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, total_debt: newTotalDebt, is_high_risk: creditBalance > 0 ? 1 : 0, open_debt_count: newOpen } : c));
          setSelectedCustomer(prev => prev && prev.id === cust.id ? { ...prev, total_debt: newTotalDebt, is_high_risk: creditBalance > 0 ? 1 : 0, open_debt_count: newOpen } : prev);
        }

        let receiptCustomer: { name: string; idCard?: string | null; phone?: string | null } | null = null;
        if (selectedCustomer?.id) {
          receiptCustomer = { name: selectedCustomer.name, idCard: selectedCustomer.id_card_number ?? null, phone: selectedCustomer.phone ?? null };
        } else if (payment === "mobile" && clientLegalName.trim()) {
          receiptCustomer = { name: clientLegalName.trim(), idCard: null, phone: clientPhone.trim() || null };
        }

        const receipts = buildReceipts({
          saleId,
          saleNumber,
          storeName,
          createdAt: now,
          cashier: { id: myId, name: myName, role },
          customer: receiptCustomer,
          items: finalCart.map(it => ({
            name: it.name,
            variant: it.variant !== DEFAULT_VARIANT ? it.variant : null,
            unitName: it.unitName ?? null,
            qty: it.qty,
            unitPrice: it.unitPrice,
            lineTotal: it.lineTotal,
          })),
          subtotal: finalSubtotal,
          discount: disc,
          total: finalTotal,
          paymentMethod: pm,
          amountPaid: round2(amountPaid),
          amountDue,
          change: finalChange,
          dueDate: payment === "credit" ? creditDueDate : null,
        });
        for (const r of [receipts.customer, receipts.store]) {
          await db.runAsync(
            "INSERT OR REPLACE INTO receipts (id,store_id,sale_id,copy_type,receipt_number,sale_number,cashier_id,cashier_name,cashier_role,content,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [r.id, STORE_ID, saleId, r.copyType, r.receiptNumber, saleNumber, r.cashier.id, r.cashier.name, r.cashier.role, JSON.stringify(r), r.createdAt]
          );
        }

        try { salesEvents.emit(); } catch {}

        setProducts(prev => prev.map(p => {
          const line = finalCart.filter(it => it.id === p.id);
          if (!line.length) return p;
          const baseQ = line.reduce((s, it) => s + it.qty * (it.factor || 1), 0);
          return {
            ...p,
            stock_quantity: Math.max(0, p.stock_quantity - baseQ),
            current_amount_available: Math.max(0, p.current_amount_available - baseQ),
          };
        }));

        setCart([]);
        clearCart();
        setAmountGiven("");
        setClientLegalName("");
        setClientPhone("");
        setAkompte("");
        setRabè("");
        setShowPay(false);
        setSelectedCustomer(null);
        setCustomerSearch("");
        setCreditDueOption("30");
        const d = new Date(); d.setDate(d.getDate() + 30);
        setCreditDueDate(d.toISOString().slice(0, 10));
        setCreditDueCustom("");
        setLastReceipts(receipts);
      } catch (e: any) {
        toast("Erè", e?.message ?? "Vant lan echwe — verifye epi re-eseye.", "error");
      }
    })();
  }

  const paymentLabel: string =
    payment === "mobile" ? (mobileProvider === "moncash" ? "Peman Mobil — MonCash" : "Peman Mobil — NatCash")
    : payment === "credit" ? "Kredi"
    : "Kach";

  const limitedPayment = (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      {(["cash", "mobile", "credit"] as const)
        .filter(m => m !== "credit" || canProcessCreditSale)
        .map(m => {
        const active = payment === m;
        const lock = m === "credit" && !canProcessCreditSale;
        const label = m === "cash" ? "Kach" : m === "mobile" ? "Peman Mobil" : "Kredi";
        return (
          <button
            key={m}
            onClick={() => selectPayment(m)}
            style={{
              flex: 1,
              padding: "11px 8px",
              borderRadius: radius.md,
              border: `0.5px solid ${active ? "transparent" : palette.hairlineStrong}`,
              background: active ? palette.ink2 : palette.surface,
              color: active ? "#fff" : palette.inkSoft,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: lock ? "not-allowed" : "pointer",
              opacity: lock && !active ? 0.55 : 1,
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name={m === "cash" ? "cash" : m === "mobile" ? "banknote" : "receipt"} size={15} />
            {label}
            {lock ? <span style={{ fontSize: 9 }}>🔒</span> : null}
          </button>
        );
      })}
    </div>
  );

  function doAddCustomer() {
    if (!newCust.name.trim()) {
      toast("Non obligatwa", "Bay non kliyan an", "warn");
      return;
    }
    if (!isManagerPlus) {
      toast("Pa gen dwa", "Se Manager ak pi wo ka ajoute kliyan", "warn");
      return;
    }
    (async () => {
      const db = await getDb();
      try {
        const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const lim = newCust.limit.trim() === "" ? null : toNum(newCust.limit);
        await db.runAsync(
          "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [id, STORE_ID, newCust.name.trim(), newCust.phone.trim() || null, null, newCust.idCard.trim() || null, 0, lim, lim === null ? null : "manual", 0, 0]
        );
        const fresh: Customer = { id, store_id: STORE_ID, name: newCust.name.trim(), phone: newCust.phone.trim() || null, id_card_number: newCust.idCard.trim() || null, total_debt: 0, credit_limit: lim, credit_limit_source: lim === null ? null : "manual", is_high_risk: 0, open_debt_count: 0 };
        setCustomers(prev => prev.some(c => c.id === id) ? prev : [...prev, fresh]);
        setSelectedCustomer(fresh);
        setCustomerSearch("");
        setShowAddCustomer(false);
        setNewCust({ name: "", idCard: "", phone: "", limit: "" });
      } catch (e: any) {
        toast("Erè", e?.message ?? "Ajoute kliyan echwe", "error");
      }
    })();
  }

  const qtySelector = (
    selected: string,
    setSelected: (v: string) => void,
    opts: { value: string; label: string }[]
  ) => (
    <select
      value={selected}
      onChange={e => setSelected(e.target.value)}
      style={{
        border: `0.5px solid ${palette.hairlineStrong}`,
        borderRadius: radius.md,
        padding: "7px 10px",
        fontSize: 12,
        background: palette.surface,
        color: palette.ink,
        outline: "none",
        fontFamily: "inherit",
      }}
    >
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  const pendingUsesSel = pending && unitsFor(pending.product).length > 1;

  const pendingHero = pending ? (
    <div style={{ display: "flex", gap: 12, marginTop: 12, padding: 14, borderRadius: radius.lg, background: "#053B2A", color: "#fff", boxShadow: shadow.elevated, alignItems: "stretch" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(200,162,74,0.85)", color: "#16130c", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
            {pending.product.name.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{pending.product.name}</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", marginTop: 1 }}>
              {toNum(pending.product.current_amount_available ?? pending.product.stock_quantity)} bokit disponib • {pendingLine ? `${fmt(pendingLine.unitPrice)} HTG × ${pending.qty}` : ""}
            </div>
          </div>
        </div>
        {pendingUsesSel ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {unitsFor(pending.product).length > 1
              ? qtySelector(pending.sel.unitId ?? "", v => {
                  const u = getUnitsForProduct(pricing, pending.product.id).find(x => x.id === v);
                  if (!u) return;
                  const sel = buildSelFor(pending.product, u.id, pending.sel.variant);
                  setPending(p => !p ? null : { ...p, sel, qty: 1, remaining: 10 });
                }, unitsFor(pending.product).map(u => ({ value: u.id ?? "", label: `${u.unit_name}${toNum(u.conversion_factor) > 1 ? ` ×${u.conversion_factor}` : ""}` })))
              : null}
            {pending.sel.unitId && getPricesForUnit(pricing, pending.sel.unitId).filter(r => toNum(r.price) > 0).length > 1
              ? qtySelector(pending.sel.variant, v => {
                  const sel = { ...pending.sel, variant: v };
                  setPending(p => !p ? null : { ...p, sel, qty: 1, remaining: 10 });
                }, getPricesForUnit(pricing, pending.sel.unitId).filter(r => toNum(r.price) > 0).map(r => ({ value: r.variant, label: `${r.variant} · ${fmt(toNum(r.price))} HTG` })))
              : null}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button onClick={() => setPending(p => p ? { ...p, qty: Math.max(1, p.qty - 1), remaining: 10 } : p)} style={ctlBtn("#fff")}><Icon name="minus" size={16} /></button>
          <input
            value={pendingInput || String(pending.qty)}
            onChange={e => setPendingInput(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={e => { if (e.key === "Enter") commitPendingWithInput(); }}
            inputMode="numeric"
            style={{ ...monoStyle, width: 56, textAlign: "center", padding: "8px 4px", borderRadius: radius.md, border: "none", background: "rgba(255,255,255,0.14)", color: "#fff", fontWeight: 800, outline: "none" }}
          />
          <button onClick={() => setPending(p => {
            if (!p) return p;
            const max = maxQtyFor(p.product, p.sel);
            return { ...p, qty: max ? Math.min(max, p.qty + 1) : p.qty + 1, remaining: 10 };
          })} style={ctlBtn("#fff")}><Icon name="plus" size={16} /></button>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginLeft: 4 }}>Oto nan {pending.remaining}s</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={commitPendingWithInput}
            style={{ padding: "9px 16px", borderRadius: radius.md, background: "#fff", color: "#053B2A", fontWeight: 800, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 13 }}
          >
            <Icon name="checkmark" size={15} /> Ajoute • {fmt(pendingLine?.lineTotal ?? pending.qty * (pendingLine?.unitPrice ?? 0))} HTG
          </button>
        </div>
      </div>
    </div>
  ) : null;

  function ctlBtn(fg: string): React.CSSProperties {
    return {
      width: 30, height: 30, borderRadius: 10, border: "none", background: "rgba(255,255,255,0.14)", color: fg,
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
    };
  }

  const paySheet = (
    <Overlay onClose={() => setShowPay(false)} width={620}>
      <ModalHeader title="Peye ✓" onClose={() => setShowPay(false)} sub={`${fmt(total)} HTG • ${paymentLabel}`} />
      {limitedPayment}
      {payment === "cash" ? (
        <div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>{ht.amountGiven}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <TextInput value={amountGiven} onChange={setAmountGiven} numeric placeholder={`${fmt(total)}`} autoFocus />
              <Button label="Egzak" variant="ghost" onClick={() => setAmountGiven(String(total))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.md, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase" }}>TOTAL</div>
              <div style={{ fontSize: 17, fontWeight: 800 }} className="num">{fmt(total)} HTG</div>
            </div>
            <div style={{ flex: 1, background: palette.surfaceGrouped, borderRadius: radius.md, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase" }}>{ht.change}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: palette.success }} className="num">{fmt(Math.max(0, toNum(amountGiven) - total))} HTG</div>
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowCashCustomer(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: palette.blue, fontSize: 12, fontWeight: 700 }}>
              <Icon name={selectedCustomer ? "checkmark-circle" : "user"} size={14} />
              {selectedCustomer ? `Kliyan: ${selectedCustomer.name}` : "Asosye ak yon kliyan"}
            </button>
            {showCashCustomer || selectedCustomer ? (
              <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <select
                    value={selectedCustomer?.id ?? ""}
                    onChange={e => {
                      const id = e.target.value;
                      setSelectedCustomer(customers.find(c => c.id === id) ?? null);
                    }}
                    style={{ width: "100%", border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: radius.md, padding: "10px 12px", fontSize: 13, background: palette.surface, color: palette.ink, outline: "none", fontFamily: "inherit" }}
                  >
                    <option value="">Chwazi kliyan...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {selectedCustomer ? (
                  <button onClick={() => setSelectedCustomer(null)} style={ctlBtn(palette.danger)}><Icon name="close" size={14} /></button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {payment === "mobile" ? (
        <div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {(["moncash", "natcash"] as const).map(prov => (
              <button
                key={prov}
                onClick={() => setMobileProvider(prov)}
                style={{
                  flex: 1, padding: "11px", borderRadius: radius.md, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                  border: `0.5px solid ${mobileProvider === prov ? "transparent" : palette.hairlineStrong}`,
                  background: mobileProvider === prov ? palette.ink2 : palette.surface,
                  color: mobileProvider === prov ? "#fff" : palette.inkSoft,
                }}
              >
                {prov === "moncash" ? "MonCash (Digicel)" : "NatCash (Natcom)"}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Non legal kliyan</div>
            <TextInput value={clientLegalName} onChange={setClientLegalName} placeholder="Non legal jan parèt nan kont mobil" />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Telefòn</div>
            <TextInput value={clientPhone} onChange={setClientPhone} numeric placeholder="+509 ..." />
          </div>
          <div style={{ marginTop: 14, background: palette.surfaceGrouped, borderRadius: radius.md, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase" }}>Pou peye</div>
            <div style={{ fontSize: 17, fontWeight: 800 }} className="num">{fmt(total)} HTG</div>
          </div>
        </div>
      ) : null}

      {payment === "credit" ? (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>Kliyan</div>
            <Icon name="people" size={14} color={palette.muted2} />
            <div style={{ flex: 1 }} />
            <button onClick={() => setShowAddCustomer(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: palette.blue, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="plus" size={13} /> Nouvo kliyan
            </button>
          </div>
          {showAddCustomer ? (
            <Card style={{ marginTop: 10, padding: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <TextInput value={newCust.name} onChange={v => setNewCust(s => ({ ...s, name: v }))} placeholder="Non konplè" />
                <TextInput value={newCust.idCard} onChange={v => setNewCust(s => ({ ...s, idCard: v }))} placeholder="Nimewo kat idantite (NIF/CIN)" />
                <TextInput value={newCust.phone} onChange={v => setNewCust(s => ({ ...s, phone: v }))} numeric placeholder="Telefòn" />
                <TextInput value={newCust.limit} onChange={v => setNewCust(s => ({ ...s, limit: v }))} numeric placeholder="Limit kredi (HTG)" />
                <Button label="Anrejistre kliyan" icon="checkmark" onClick={doAddCustomer} />
              </div>
            </Card>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <TextInput value={customerSearch} onChange={setCustomerSearch} placeholder="Chèche kliyan pa non, ID oswa telefòn..." />
          </div>
          <div style={{ maxHeight: 190, overflowY: "auto", marginTop: 10, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md }}>
            {filteredCustomers.map(c => {
              const active = selectedCustomer?.id === c.id;
              const risk = toNum(c.is_high_risk) === 1 || toNum(c.total_debt) > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomer(active ? null : c)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", fontFamily: "inherit", textAlign: "left",
                    background: active ? "#E7F0FF" : "transparent", color: palette.ink, border: "none", borderBottom: `0.5px solid ${palette.separatorSoft}`, cursor: "pointer",
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: risk ? palette.dangerBg : palette.successBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="user" size={15} color={risk ? palette.danger : palette.success} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: palette.muted2 }}>{c.id_card_number ?? "—"} {c.phone ? ` • ${c.phone}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: risk ? palette.danger : palette.success }} className="num">{fmt(toNum(c.total_debt))} HTG</div>
                    <div style={{ fontSize: 9.5, color: palette.muted2 }}>dèt</div>
                  </div>
                  {active ? <Icon name="checkmark-circle" size={17} color={palette.blue} /> : null}
                </button>
              );
            })}
            {!filteredCustomers.length ? <div style={{ padding: 16, textAlign: "center", color: palette.muted2, fontSize: 12 }}>Pa gen kliyan — ajoute youn an wo a.</div> : null}
          </div>

          {selectedCustomer ? (
            <div style={{ marginTop: 12, padding: 12, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, background: palette.surfaceGrouped }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{selectedCustomer.name}</div>
              <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>
                Limit: {selectedCustomer.credit_limit === null || selectedCustomer.credit_limit === undefined || toNum(selectedCustomer.credit_limit) === 0 ? "San limit" : `${fmt(toNum(selectedCustomer.credit_limit))} HTG`} • Dèt: {fmt(toNum(selectedCustomer.total_debt))} HTG
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {(["7", "15", "30", "60"] as const).map(d => (
              <button
                key={d}
                onClick={() => {
                  setCreditDueOption(d);
                  const d2 = new Date(); d2.setDate(d2.getDate() + toNum(d));
                  setCreditDueDate(d2.toISOString().slice(0, 10));
                  setCreditDueCustom("");
                }}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: radius.md, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11.5,
                  border: `0.5px solid ${creditDueOption === d ? "transparent" : palette.hairlineStrong}`,
                  background: creditDueOption === d ? palette.ink2 : palette.surface,
                  color: creditDueOption === d ? "#fff" : palette.inkSoft,
                }}
              >
                {d} jou
              </button>
            ))}
            <button
              onClick={() => setCreditDueOption("custom")}
              style={{
                padding: "8px 12px", borderRadius: radius.md, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11.5,
                border: `0.5px solid ${creditDueOption === "custom" ? "transparent" : palette.hairlineStrong}`,
                background: creditDueOption === "custom" ? palette.ink2 : palette.surface,
                color: creditDueOption === "custom" ? "#fff" : palette.inkSoft,
              }}
            >
              Lòt
            </button>
          </div>
          {creditDueOption === "custom" ? (
            <div style={{ marginTop: 10 }}>
              <TextInput value={creditDueCustom} onChange={v => { setCreditDueCustom(v); setCreditDueDate(v); }} numeric placeholder="Dat echèans (AAAA-MM-JJ)" />
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, color: palette.muted2 }}>Echèans: <span className="num">{creditDueDate}</span></div>
          )}

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Akompte (premye peman)</div>
            <TextInput value={akompte} onChange={setAkompte} numeric placeholder={`0 — {fmt(total)} HTG`} />
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `0.5px solid ${palette.hairline}` }}>
        <Button label={`Konfime Peye • ${fmt(total)} HTG`} icon="checkmark-circle" variant="success" block size="lg" onClick={confirmPay} />
        <Button label="Retounen" variant="ghost" block style={{ marginTop: 8 }} onClick={() => setShowPay(false)} />
      </div>
    </Overlay>
  );

  const searchCard = (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={ht.search}
            style={{
              width: "100%", padding: "12px 14px 12px 38px", borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`,
              background: palette.surface, fontSize: 13.5, outline: "none", fontFamily: "inherit", color: palette.ink,
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
        {CATS.map(c => {
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              style={{
                padding: "7px 14px", borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12,
                border: `0.5px solid ${active ? "transparent" : palette.hairlineStrong}`,
                background: active ? palette.ink2 : palette.surface,
                color: active ? "#fff" : palette.inkSoft,
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {(["name", "barcode", "category"] as const).map(m => (
          <button
            key={m}
            onClick={() => setSearchMode(m)}
            style={{
              padding: "5px 11px", borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 11,
              border: `0.5px solid ${searchMode === m ? "transparent" : palette.hairline}`,
              background: searchMode === m ? palette.surfaceGrouped : "transparent",
              color: searchMode === m ? palette.ink : palette.muted2,
            }}
          >
            {m === "name" ? "Non" : m === "barcode" ? "Kòd (SKU/bar)" : "Kategori"}
          </button>
        ))}
      </div>
    </div>
  );

  const productGrid = (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(auto-fill, minmax(180px, 1fr))" : "1fr", gap: 12, marginTop: 12 }}>
      {filtered.map(p => {
        const disp = displayPriceFor(p);
        const available = toNum(p.current_amount_available ?? p.stock_quantity);
        const low = toNum(p.low_stock_threshold) > 0 && available <= toNum(p.low_stock_threshold);
        const inCart = cart.find(c => c.id === p.id);
        return (
          <button
            key={p.id}
            onClick={() => handleProductPress(p)}
            style={{
              textAlign: "left", padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: radius.lg,
            }}
          >
            <Card style={{ padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: palette.ink2, flexShrink: 0 }}>
                  <Icon name="box" size={17} color={palette.ink} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: palette.muted2, marginTop: 1 }}>{p.sku}</div>
                </div>
                {inCart ? <span style={{ background: palette.successBg, color: palette.success, borderRadius: radius.pill, padding: "2px 7px", fontSize: 10, fontWeight: 800 }}>×{inCart.qty}</span> : null}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
                <div>
                  {disp ? (
                    <>
                      <div style={{ fontWeight: 800, fontSize: 14, color: palette.ink }} className="num">{fmt(disp.price)} HTG</div>
                      <div style={{ fontSize: 9.5, color: palette.muted2 }}>par {disp.unitName}</div>
                    </>
                  ) : <div style={{ fontSize: 10, color: palette.muted2 }}>Pa gen pri</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: low ? palette.danger : (available <= 0 ? palette.danger : palette.success) }}>
                    {available <= 0 ? "Pa gen stock" : `${available} dispo`}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        );
      })}
      {!filtered.length ? (
        <div style={{ padding: 30, textAlign: "center", color: palette.muted2, fontSize: 13 }}>Pa gen pwodwi matche rechèch la.</div>
      ) : null}
    </div>
  );

  const cartPanel = (
    <Card style={{ padding: 14, display: "flex", flexDirection: "column", minHeight: wide ? 420 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="cart" size={17} color={palette.muted2} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>{ht.cart}</span>
        <span style={{ fontSize: 11, color: palette.muted2 }}>{cartCount} pcs • {cart.length} atik</span>
        <div style={{ flex: 1 }} />
        {cart.length ? (
          <button onClick={clearCart} style={{ background: "none", border: "none", cursor: "pointer", color: palette.danger, fontWeight: 700, fontSize: 11.5, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
            <Icon name="trash" size={14} /> Vide
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10, borderTop: `0.5px solid ${palette.hairline}` }}>
        {cart.map(it => {
          const editingQty = editingQtyId === it.key;
          const editingPrice = editingPriceId === it.key;
          return (
            <div key={it.key} style={{ padding: "10px 0", borderBottom: `0.5px solid ${palette.separatorSoft}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                  <div style={{ fontSize: 9.5, color: palette.muted2, marginTop: 1 }}>
                    {it.variant} {it.unitName ? `· ${it.unitName}` : ""}
                  </div>
                  {!editingPrice ? (
                    <button
                      onClick={() => {
                        setEditingPriceId(it.key);
                        setEditingPriceVal(String(it.unitPrice));
                      }}
                      style={{ ...monoStyle, fontSize: 11.5, fontWeight: 800, marginTop: 3, background: "none", border: "none", cursor: "pointer", color: palette.ink, padding: 0, textAlign: "left", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      {fmt(it.unitPrice)} HTG/en<Icon name="edit" size={11} />
                    </button>
                  ) : null}
                  {editingPrice ? (
                    <input
                      autoFocus
                      value={editingPriceVal}
                      onChange={e => setEditingPriceVal(e.target.value.replace(/[^0-9.,]/g, ""))}
                      onBlur={() => {
                        const v = toNum(editingPriceVal);
                        if (v > 0) setLinePrice(it.key, v); else setEditingPriceId(null);
                      }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingPriceId(null); }}
                      inputMode="decimal"
                      style={{ ...monoStyle, width: 74, fontSize: 12.5, padding: "5px 8px", borderRadius: radius.sm, border: `0.5px solid ${palette.hairlineStrong}`, outline: "none", fontFamily: "inherit" }}
                    />
                  ) : null}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button onClick={() => decQty(it.key)} style={ctlBtn(palette.ink)}><Icon name="minus" size={13} /></button>
                  {editingQty ? (
                    <input
                      autoFocus
                      value={editingQtyVal || String(it.qty)}
                      onChange={e => setEditingQtyVal(e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={() => { if (editingQtyVal) setCustomQty(it.key, editingQtyVal); setEditingQtyId(null); }}
                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingQtyId(null); }}
                      inputMode="numeric"
                      style={{ ...monoStyle, width: 40, textAlign: "center", fontSize: 13, padding: "6px 2px", borderRadius: radius.sm, border: `0.5px solid ${palette.hairlineStrong}`, outline: "none" }}
                    />
                  ) : (
                    <button onClick={() => { setEditingQtyId(it.key); setEditingQtyVal(String(it.qty)); }} style={{ ...monoStyle, minWidth: 30, fontSize: 13, fontWeight: 800, background: palette.surfaceGrouped, border: "none", borderRadius: radius.sm, padding: "6px 2px", color: palette.ink, cursor: "pointer" }}>
                      {it.qty}
                    </button>
                  )}
                  <button onClick={() => incQty(it.key)} style={ctlBtn(palette.ink)}><Icon name="plus" size={13} /></button>
                </div>
                <div style={{ fontWeight: 800, fontSize: 12.5, color: palette.ink, minWidth: 66, textAlign: "right" }} className="num">
                  {fmt(it.lineTotal)} HTG
                </div>
                <button onClick={() => removeFromCart(it.key)} style={{ background: "none", border: "none", cursor: "pointer", color: palette.danger, display: "flex" }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {it.bundleApplied ? <div style={{ fontSize: 9.5, color: palette.accentGold, fontWeight: 700, marginTop: 2 }}>Atik pakè (rabè)</div> : null}
            </div>
          );
        })}
        {!cart.length ? (
          <div style={{ padding: 26, textAlign: "center", color: palette.muted2 }}>
            <Icon name="cart" size={28} color={palette.muted3} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13, fontWeight: 700 }}>{ht.emptyCart}</div>
            <div style={{ fontSize: 11, marginTop: 3 }}>Tape yon pwodwi pou ajoute li nan panyen.</div>
          </div>
        ) : null}
      </div>

      {cart.length ? (
        <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `0.5px solid ${palette.hairline}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: palette.muted2 }}>Rabè (−)</span>
            <div style={{ flex: 1 }}>
              <input
                value={rabè}
                onChange={e => setRabè(e.target.value.replace(/[^0-9.,]/g, ""))}
                inputMode="decimal"
                placeholder="0"
                style={{ ...monoStyle, width: "100%", textAlign: "right", fontSize: 13, padding: "8px 10px", borderRadius: radius.md, border: `0.5px solid ${palette.hairlineStrong}`, outline: "none", fontFamily: "inherit", background: palette.surface }}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5 }}>
            <span style={{ color: palette.muted2, fontWeight: 600 }}>Sous-total</span>
            <span className="num" style={{ fontWeight: 700 }}>{fmt(subtotal)} HTG</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12.5 }}>
            <span style={{ color: palette.muted2, fontWeight: 600 }}>Rabè</span>
            <span className="num" style={{ fontWeight: 700, color: palette.danger }}>− {fmt(discountNum)} HTG</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTop: `0.5px solid ${palette.hairline}` }}>
            <span style={{ fontWeight: 800, fontSize: 15 }}>{ht.total}</span>
            <span className="num" style={{ fontWeight: 900, fontSize: 16 }}>{fmt(total)} HTG</span>
          </div>
          <Button label={`Peye • ${fmt(total)} HTG`} icon="checkmark-circle" variant="success" size="lg" block style={{ marginTop: 12 }} onClick={openPay} />
          <Button label="Nouvo Vant" variant="ghost" block style={{ marginTop: 8 }} onClick={() => { clearCart(); setSelectedCustomer(null); }} />
        </div>
      ) : null}
    </Card>
  );

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: palette.bg, color: palette.ink }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: palette.accentGold }}>Vant • POS</div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.6, marginTop: 2 }}>Kès vit & presi</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: palette.surface, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.pill, padding: "6px 12px", boxShadow: shadow.card }}>
            <div style={{ width: 28, height: 28, borderRadius: 50, background: palette.accentGold, color: palette.ink, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
              {myName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{myName}</div>
              <div style={{ fontSize: 9.5, color: palette.muted2 }}>{role} • {storeName}</div>
            </div>
          </div>
        </div>

        {wide ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: 3, minWidth: 0 }}>
              {searchCard}
              {pendingHero}
              {productGrid}
            </div>
            <div style={{ flex: 2, minWidth: 0, maxWidth: 430, position: "sticky", top: 16 }}>
              {cartPanel}
            </div>
          </div>
        ) : (
          <div>
            {searchCard}
            {pendingHero}
            {productGrid}
            <div style={{ marginTop: 16 }}>{cartPanel}</div>
            {cart.length ? (
              <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", background: palette.surface, borderTop: `0.5px solid ${palette.hairline}`, boxShadow: shadow.elevated, zIndex: 950 }}>
                <Button label={`Peye • ${fmt(total)} HTG`} icon="checkmark-circle" variant="success" size="lg" block onClick={openPay} />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showPay ? paySheet : null}
      {lastReceipts ? (
        <ReceiptModal
          receipts={lastReceipts}
          onClose={() => setLastReceipts(null)}
        />
      ) : null}
    </div>
  );
}