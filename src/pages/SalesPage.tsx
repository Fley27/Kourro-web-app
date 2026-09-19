import { useCallback, useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { palette, radius } from "../lib/theme";
import { fmt } from "../lib/format";
import { getDb } from "../lib/db";
import { salesEvents } from "../lib/salesEvents";
import { useAuthStore } from "../lib/authStore";
import { buildReceipts, buildReceiptHtml, ReceiptData } from "../lib/receipts";
import { findSaleDetail, describeChange, changeSalePaymentMethod, salePaymentLabel, SaleDetail, PaymentMethod } from "../lib/salesCorrection";
import { Icon } from "../components/Icon";
import { Button, Card, Confirm, EmptyState, Field, KpiMini, ModalHeader, Overlay, RowItem, SearchBar, SectionTitle, Segmented, Select, TextInput, toast } from "../components/ui";

type Line = { productId: string; name: string; qty: number; price: number };

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function td(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function printHtml(html: string) {
  const f = document.createElement("iframe");
  f.style.position = "fixed";
  f.style.right = "0";
  f.style.bottom = "0";
  f.style.width = "0";
  f.style.height = "0";
  f.style.border = "0";
  document.body.appendChild(f);
  const d = f.contentDocument;
  if (!d) return;
  d.open();
  d.write(html);
  d.close();
  f.onload = () => {
    const w = f.contentWindow || window;
    w.focus();
    w.print();
    setTimeout(() => {
      try { document.body.removeChild(f); } catch {}
    }, 800);
  };
}

const PAY: { k: PaymentMethod; color: string }[] = [
  { k: "cash", color: palette.success },
  { k: "moncash", color: palette.blue },
  { k: "natcash", color: palette.violet },
  { k: "credit", color: palette.warning },
];

const PAYMENT_OPTS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Kach" },
  { value: "moncash", label: "MonCash" },
  { value: "natcash", label: "NatCash" },
  { value: "credit", label: "Kredi" },
];

function ReceiptViewer({ saleId, storeName, onClose }: { saleId: string; storeName: string; onClose: () => void }) {
  const [receipts, setReceipts] = useState<{ data: ReceiptData; copy: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const rows = (await db.getAllAsync("SELECT * FROM receipts WHERE sale_id = ?", [saleId])) as any[];
        setReceipts(rows.map(r => {
          let data: ReceiptData;
          try { data = JSON.parse(r.content ?? ""); } catch { data = null as any; }
          return { data, copy: r.copy_type ?? "customer" };
        }).filter(x => x.data));
      } catch {}
    })();
  }, [saleId]);

  return (
    <Overlay onClose={onClose} width={560}>
      <ModalHeader title="Resi" sub={saleId} onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "60vh", overflow: "auto", padding: 2 }}>
        {receipts.length === 0 ? (
          <EmptyState icon="receipt" title="Pa gen resi" body="Pa gen resi anrejistre pou vant sa a." />
        ) : (
          receipts.map(({ data, copy }, i) => (
            <div key={i} style={{ border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: palette.surfaceGrouped, borderBottom: `0.5px solid ${palette.separatorSoft}` }}>
                <Icon name="receipt" size={14} color={palette.accentGold} />
                <span style={{ fontSize: 11, fontWeight: 700, color: palette.ink }}>{copy === "store" ? "Kopi Magazen" : "Kopi Kliyan"}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: palette.muted2 }} className="num">{data.receiptNumber}</span>
              </div>
              <div style={{ background: "#fff", padding: 10 }} dangerouslySetInnerHTML={{ __html: buildReceiptHtml(data) }} />
              <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `0.5px solid ${palette.separatorSoft}` }}>
                <Button label="Imprime" size="sm" variant="gold" icon="print" onClick={() => printHtml(buildReceiptHtml(data))} />
                {i === 0 && <Button label="Kopi Magazen" size="sm" variant="soft" icon="copy" onClick={() => setReceipts(prev => prev.length > 1 ? prev : prev)} />}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <Button label="Fèmen" variant="soft" icon="close" onClick={onClose} />
      </div>
    </Overlay>
  );
}

export function SalesPage() {
  const { user } = useAuthStore();
  const [sales, setSales] = useState<any[]>([]);
  const [todaySales, setTodaySales] = useState<any[]>([]);
  const [debtCollected, setDebtCollected] = useState(0);
  const [storeName, setStoreName] = useState("Jesyon Magazen");
  const [storeId, setStoreId] = useState("demo-store-id");
  const [products, setProducts] = useState<any[]>([]);

  const [cart, setCart] = useState<Line[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [given, setGiven] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [akompte, setAkompte] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [convertTarget, setConvertTarget] = useState<"cash" | "credit" | null>(null);
  const [receiptSale, setReceiptSale] = useState<string | null>(null);
  const [openSale, setOpenSale] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const db = await getDb();
      const stores = (await db.getAllAsync("SELECT * FROM stores")) as any[];
      if (stores.length > 0) {
        setStoreName(stores[0].name ?? "Jesyon Magazen");
        setStoreId(stores[0].id ?? "demo-store-id");
      }
      const all = (await db.getAllAsync("SELECT * FROM sales")) as any[];
      const today = all.filter((s: any) => String(s.created_at ?? "").startsWith(todayStr()));
      today.sort((a: any, b: any) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
      setSales(today);
      setTodaySales(today);
      const coll = ((await db.getAllAsync("SELECT * FROM credit_payments")) as any[]).filter((c: any) => (c.payment_method ?? "cash") === "cash" && String(c.created_at ?? "").startsWith(todayStr()));
      setDebtCollected(coll.reduce((a: number, c: any) => a + Number(c.amount ?? 0), 0));
      setCustomers((await db.getAllAsync("SELECT * FROM customers")) as any[]);
      setProducts((await db.getAllAsync("SELECT * FROM products")) as any[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(load); } catch {} })();
    const id = setInterval(load, 3000);
    return () => { clearInterval(id); if (unsub) unsub(); };
  }, [load]);

  const totals = useMemo(() => {
    const t = { cash: 0, moncash: 0, natcash: 0, credit: 0 };
    todaySales.forEach(s => {
      const k = String(s.payment_method ?? "").toLowerCase();
      if (k === "cash") t.cash += Number(s.total ?? 0);
      else if (k === "moncash") t.moncash += Number(s.total ?? 0);
      else if (k === "natcash") t.natcash += Number(s.total ?? 0);
      else if (k === "credit") t.credit += Number(s.total ?? 0);
    });
    return { ...t, grand: t.cash + t.moncash + t.natcash + t.credit };
  }, [todaySales]);

  const carts = useMemo(() => {
    const t = { cash: 0, moncash: 0, natcash: 0, credit: 0 };
    sales.forEach(s => {
      const k = String(s.payment_method ?? "").toLowerCase();
      if (k in t) t[k as keyof typeof t] += Number(s.total ?? 0);
    });
    return t;
  }, [sales]);

  const pieData = useMemo(() =>
    PAY.filter(p => totals[p.k] > 0).map(p => ({ name: salePaymentLabel(p.k), value: totals[p.k], color: p.color })),
  [totals]);

  const subtotal = useMemo(() => cart.reduce((a, l) => a + l.qty * l.price, 0), [cart]);
  const change = payMethod === "cash" ? Math.max(0, Number(given || "0") - subtotal) : 0;
  const akompteNum = payMethod === "credit" ? Math.min(subtotal, Math.max(0, Number(akompte || "0"))) : 0;
  const amountDue = payMethod === "credit" ? subtotal - akompteNum : 0;

  async function searchDetail() {
    if (!q.trim()) return;
    try {
      const db = await getDb();
      const d = await findSaleDetail(db, storeId, q.trim());
      setDetail(d);
      if (!d) toast("Pa twouve", `Pa gen vant pou "${q}".`, "warn");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Imposib chèche.", "error");
    }
  }

  async function applyConvert() {
    if (!detail || !convertTarget || !user) return;
    setSaving(true);
    try {
      const db = await getDb();
      const res = await changeSalePaymentMethod(detail, convertTarget, { db, storeId: "demo-store-id", storeName, currentUser: user });
      toast("Koreksyon fè", `${res.previous} → ${res.target}. Resi ${res.receiptNumber}.`, "success");
      salesEvents.emit();
      setDetail(null);
      setConvertTarget(null);
      setReceiptSale(detail.sale.id);
    } catch (e: any) {
      toast("Koreksyon bloke", e?.message ?? "Imposib konvèti.", "error");
    }
    setSaving(false);
  }

  function addToCart(p: any) {
    setCart(prev => {
      const ex = prev.find(l => l.productId === p.id);
      if (ex) return prev.map(l => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { productId: p.id, name: p.name ?? "—", qty: 1, price: Number(p.selling_price ?? 0) }];
    });
  }

  function bumpQty(id: string, delta: number) {
    setCart(prev => prev.map(l => (l.productId === id ? { ...l, qty: Math.max(1, l.qty + delta) } : l)));
  }

  function removeLine(id: string) {
    setCart(prev => prev.filter(l => l.productId !== id));
  }

  async function completeSale() {
    if (!user) return;
    if (cart.length === 0) { toast("Panye vid", "Ajoute pwodwi anvan peye.", "warn"); return; }
    if (payMethod === "credit" && !customerId) { toast("Kliyan obligatwa", "Chwazi yon kliyan pou vant kredi.", "warn"); return; }
    if (payMethod === "credit" && subtotal <= 0) { toast("Mantan envalid", "Antre yon montan pozitif.", "warn"); return; }
    if (payMethod === "cash" && given && Number(given) < subtotal) { toast("Kòb ensifizan", "Kliyan lan bay mwens pase total la.", "warn"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      const id = `sale-${Date.now()}`;
      const now = new Date().toISOString();
      const seq = todaySales.length + 1;
      const saleNumber = `${now.slice(0, 10).replace(/-/g, "")}-${String(seq).padStart(3, "0")}`;
      let amountPaid = subtotal;
      let amountDueV = 0;
      let status = "completed";
      if (payMethod === "credit") {
        amountPaid = akompteNum;
        amountDueV = amountDue;
        status = amountDue > 0 ? "pending" : "completed";
      } else if (payMethod === "cash" && given) {
        amountPaid = subtotal;
      }
      await db.runAsync(
        "INSERT INTO sales (id,store_id,sale_number,customer_id,status,payment_method,subtotal,total,amount_paid,amount_due,seller_id,seller_role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, "demo-store-id", saleNumber, payMethod === "credit" ? customerId : null, status, payMethod, subtotal, subtotal, amountPaid, amountDueV, user.id, user.role, now, now]
      );
      const items: any[] = [];
      for (const l of cart) {
        items.push({
          id: `si-${Date.now()}-${l.productId}`,
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitPrice: l.price,
          lineTotal: l.qty * l.price,
        });
        await db.runAsync(
          "INSERT INTO sale_items (id,store_id,sale_id,product_id,product_name,unit_id,variant,quantity,unit_price,cost_price,line_total,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [`si-${Date.now()}-${l.productId}`, "demo-store-id", id, l.productId, l.name, null, null, l.qty, l.price, 0, l.qty * l.price, now]
        );
        try { await db.runAsync("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?", [l.qty, l.productId]); } catch {}
      }
      let dueDate: string | null = null;
      if (payMethod === "credit") {
        const dd = new Date(); dd.setDate(dd.getDate() + 30);
        dueDate = dd.toISOString().slice(0, 10);
        const creditId = `cr_${id}`;
        const cstat = amountDue > 0 ? "pending" : "paid";
        await db.runAsync(
          "INSERT INTO credits (id,store_id,sale_id,customer_id,amount,amount_paid,balance,status,due_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [creditId, "demo-store-id", id, customerId, subtotal, akompteNum, amountDue, cstat, dueDate, now]
        );
        if (akompteNum > 0) {
          await db.runAsync(
            "INSERT INTO credit_payments (id,store_id,credit_id,debt_id,amount,payment_method,receipt_number,created_at,collected_by) VALUES (?,?,?,?,?,?,?,?,?)",
            [`cp-${Date.now()}`, "demo-store-id", creditId, creditId, akompteNum, "cash", `REC-${saleNumber}`, now, user?.id ?? null]
          );
        }
        await db.runAsync(
          "UPDATE customers SET total_debt = COALESCE(total_debt,0) + ?, is_high_risk = 1, open_debt_count = COALESCE(open_debt_count,0) + 1 WHERE id = ?",
          [amountDue, customerId]
        );
      }
      const cashierName = user.name ?? "Kesye";
      const receipts = buildReceipts({
        saleId: id,
        saleNumber,
        storeName,
        createdAt: now,
        cashier: { id: user.id, name: cashierName, role: user.role ?? "cashier" },
        customer: payMethod === "credit" ? (customers.find(c => c.id === customerId) ?? null) : null,
        items: items.map(it => ({ name: it.name, variant: null, unitName: null, qty: it.qty, unitPrice: it.unitPrice, lineTotal: it.lineTotal })),
        subtotal,
        discount: 0,
        total: subtotal,
        paymentMethod: payMethod,
        amountPaid,
        amountDue: amountDueV,
        change,
        dueDate: dueDate ?? null,
      });
      for (const r of [receipts.customer, receipts.store]) {
        await db.runAsync(
          "INSERT OR REPLACE INTO receipts (id,store_id,sale_id,copy_type,receipt_number,sale_number,cashier_id,cashier_name,cashier_role,content,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [r.id, "demo-store-id", id, r.copyType, r.receiptNumber, saleNumber, r.cashier.id, r.cashier.name, r.cashier.role, JSON.stringify(r), r.createdAt]
        );
      }
      salesEvents.emit();
      setCart([]);
      setGiven("");
      setAkompte("");
      setCustomerId("");
      setCartOpen(false);
      setReceiptSale(id);
      toast("Vant anrejistre", `${saleNumber} · ${fmt(subtotal)} HTG (${salePaymentLabel(payMethod)}).`, "success");
      await load();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Imposib finalize vant la.", "error");
    }
    setSaving(false);
  }

  if (!user) {
    return (
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
        <Card><EmptyState icon="cash" title="Konekte ou anvan" body="Ou dwe konekte pou wè vant yo." /></Card>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: palette.surfaceGrouped, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="cash" size={18} color={palette.accentGold} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: palette.ink, letterSpacing: -0.3 }}>Vant</div>
          <div style={{ fontSize: 11, color: palette.muted2 }}>{new Date().toLocaleDateString()} • {todaySales.length} vant</div>
        </div>
        <Button label="Nouvo Vant" variant="gold" icon="plus" onClick={() => setCartOpen(true)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiMini label="Total Vant" value={<span className="num">{fmt(totals.grand)}</span>} icon="trending-up" color={palette.ink2} sub="HTG" />
        <KpiMini label="Kach" value={<span className="num">{fmt(totals.cash)}</span>} icon="cash" color={palette.success} sub="peman kach" />
        <KpiMini label="Kredi" value={<span className="num">{fmt(totals.credit)}</span>} icon="tag" color={palette.warning} sub="vant kredi" />
        <KpiMini label="Dèt Kolekte" value={<span className="num">{fmt(debtCollected)}</span>} icon="checkmark-circle" color={palette.blue} sub="jodi a" />
      </div>

      <Card style={{ padding: 14 }}>
        <SectionTitle icon="trending-up" right={<span style={{ fontSize: 11, color: palette.muted3 }}>Jodi a</span>}>Repatisyon Peman</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {PAY.map(p => {
            const val = totals[p.k];
            const pct = totals.grand > 0 ? (val / totals.grand) * 100 : 0;
            return (
              <div key={p.k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 70, fontSize: 11, fontWeight: 700, color: palette.muted2 }}>{salePaymentLabel(p.k)}</div>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: palette.surfaceGrouped, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: p.color, borderRadius: 4, transition: "width .3s ease" }} />
                </div>
                <div style={{ width: 90, textAlign: "right", fontSize: 11, fontWeight: 700, color: palette.ink }} className="num">{fmt(val)}</div>
              </div>
            );
          })}
        </div>
        {pieData.length > 0 && (
          <div style={{ height: 180, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={66} paddingAngle={2} stroke="#fff" strokeWidth={1}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${fmt(Number(v))} HTG`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card style={{ padding: 14 }}>
        <SectionTitle icon="search">Opsyon Vant</SectionTitle>
        <SearchBar value={q} onChange={setQ} placeholder="Nimewo vant… (egz. 260913-001)" />
        {detail && (
          <div style={{ marginTop: 10, border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: radius.md, padding: 12, background: palette.surfaceGrouped }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800, color: palette.ink }}>
              <Icon name="receipt" size={14} color={palette.accentGold} />
              Vant {detail.sale.sale_number ?? detail.sale.id}
              <span style={{ marginLeft: "auto", fontSize: 11, color: palette.muted2 }}>{salePaymentLabel(detail.sale.payment_method)}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: palette.ink, margin: "6px 0" }} className="num">{fmt(Number(detail.sale.total ?? 0))} HTG</div>
            <div style={{ fontSize: 11, color: palette.muted2 }}>{detail.items?.length ?? 0} atik • {detail.items?.reduce((a: number, i: any) => a + Number(i.quantity ?? 0), 0) ?? 0} kantite</div>
            {detail.customer && <div style={{ fontSize: 11, color: palette.blue, marginTop: 4 }}>Kliyan: {detail.customer.name}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {(() => {
                const isSupervisor = user && (user.role === "owner" || user.role === "admin" || user.role === "manager");
                return (
                  <>
                    {isSupervisor && (
                      <Button
                        label="Konvèti an Kredi"
                        size="sm"
                        icon="tag"
                        disabled={String(detail.sale.payment_method).toLowerCase() === "credit"}
                        onClick={() => setConvertTarget("credit")}
                      />
                    )}
                    <Button
                      label="Konvèti an Kach"
                      size="sm"
                      icon="cash"
                      disabled={String(detail.sale.payment_method).toLowerCase() !== "credit"}
                      onClick={() => setConvertTarget("cash")}
                    />
                    <Button label="Gade resi" size="sm" variant="soft" icon="print" onClick={() => setReceiptSale(detail.sale.id)} />
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </Card>

      <Card style={{ padding: 14 }}>
        <SectionTitle icon="receipt" right={<span style={{ fontSize: 11, color: palette.muted3 }} className="num">{todaySales.length} vant</span>}>Vant Jodi A</SectionTitle>
        {todaySales.length === 0 ? (
          <EmptyState icon="receipt" title="Pa gen vant" body="Yo pral parèt isit la pandan w fè vant." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            {todaySales.map(s => {
              const k = String(s.payment_method ?? "cash").toLowerCase();
              const c = PAY.find(p => p.k === k)?.color ?? palette.muted2;
              return (
                <RowItem
                  key={s.id}
                  icon="receipt"
                  iconColor={c}
                  title={<span className="num">{fmt(Number(s.total ?? 0))} HTG</span>}
                  sub={<span className="num">{s.sale_number ?? s.id} • {td(s.created_at)} • {s.items?.length ?? 0} atik</span>}
                  right={<span style={{ fontSize: 11, fontWeight: 700, color: c }}>{salePaymentLabel(k)}</span>}
                  onClick={() => setOpenSale(s)}
                />
              );
            })}
          </div>
        )}
      </Card>

      {cartOpen && (
        <Overlay onClose={() => setCartOpen(false)} width={820}>
          <ModalHeader title="Nouvo Vant" sub={`${cart.length} liy • ${fmt(subtotal)} HTG`} onClose={() => setCartOpen(false)} />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <SectionTitle icon="box">Pwodwi</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8, maxHeight: 300, overflow: "auto", padding: 2 }}>
                {products.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    style={{ textAlign: "left", border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 10, background: palette.surface, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{p.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: palette.accentGold, marginTop: 3 }} className="num">{fmt(Number(p.selling_price ?? 0))} HTG</div>
                    <div style={{ fontSize: 10, color: palette.muted3, marginTop: 2 }} className="num">{Number(p.stock_quantity ?? 0)} an stòk</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <SectionTitle icon="cart">Panye</SectionTitle>
              {cart.length === 0 ? (
                <EmptyState icon="cart" title="Panye vid" body="Klike sou yon pwodwi pou ajoute l." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflow: "auto", padding: 2 }}>
                  {cart.map(l => (
                    <div key={l.productId} style={{ display: "flex", alignItems: "center", gap: 8, border: `0.5px solid ${palette.separatorSoft}`, borderRadius: radius.md, padding: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{l.name}</div>
                        <div style={{ fontSize: 10, color: palette.muted3 }} className="num">{fmt(l.price)} HTG × {l.qty}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Button label="−" size="sm" variant="soft" onClick={() => bumpQty(l.productId, -1)} />
                        <span style={{ width: 26, textAlign: "center", fontSize: 13, fontWeight: 800 }} className="num">{l.qty}</span>
                        <Button label="+" size="sm" variant="soft" onClick={() => bumpQty(l.productId, +1)} />
                      </div>
                      <button onClick={() => removeLine(l.productId)} style={{ border: "none", background: "transparent", cursor: "pointer", color: palette.danger }}>
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <Segmented value={payMethod} onChange={setPayMethod} options={PAYMENT_OPTS} />
                {payMethod === "credit" && (
                  <Field label="Kliyan" required>
                    <Select value={customerId} onChange={setCustomerId} options={[{ value: "", label: "— Chwazi kliyan —" }, ...customers.map(c => ({ value: c.id, label: c.name }))]} />
                  </Field>
                )}
                {payMethod === "credit" && (
                  <Field label="Akompte (opsyonèl)">
                    <TextInput numeric value={akompte} onChange={setAkompte} placeholder="0" />
                  </Field>
                )}
                {payMethod === "cash" && (
                  <Field label="Kòb kliyan bay" hint={change > 0 ? `Monnen: ${fmt(change)} HTG` : undefined}>
                    <TextInput numeric value={given} onChange={setGiven} placeholder={fmt(subtotal)} />
                  </Field>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", borderTop: `0.5px solid ${palette.separatorSoft}`, paddingTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: palette.muted2 }}>TOTAL</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: palette.ink }} className="num">{fmt(subtotal)} HTG</div>
                    {payMethod === "credit" && <div style={{ fontSize: 11, color: palette.warning }} className="num">Rès dèt: {fmt(amountDue)} HTG</div>}
                  </div>
                  <Button label={saving ? "Sa ap trete…" : "Valide Vant"} variant="gold" icon="checkmark" disabled={saving || cart.length === 0} onClick={completeSale} />
                </div>
              </div>
            </div>
          </div>
        </Overlay>
      )}

      {openSale && (
        <Overlay onClose={() => setOpenSale(null)} width={520}>
          <ModalHeader title="Detay Vant" sub={openSale.sale_number ?? openSale.id} onClose={() => setOpenSale(null)} />
          <div style={{ fontSize: 26, fontWeight: 900, color: palette.ink }} className="num">{fmt(Number(openSale.total ?? 0))} HTG</div>
          <div style={{ fontSize: 11, color: palette.muted2, marginBottom: 8 }}>
            {salePaymentLabel(openSale.payment_method)} • {td(openSale.created_at)} • {openSale.seller_name ?? "Kesye"}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Button label="Gade resi" size="sm" variant="gold" icon="print" onClick={() => { setReceiptSale(openSale.id); setOpenSale(null); }} />
            <Button label="Koreksyon peman" size="sm" variant="soft" icon="edit" onClick={() => { setQ(openSale.sale_number ?? openSale.id); setOpenSale(null); searchDetail(); }} />
          </div>
          <EmptyState icon="info" title="Avi" body="Atik yo disponib nan kopi resi a. Ou ka kolekte dèt la soti nan pòtay Kredi a." />
        </Overlay>
      )}

      {convertTarget && (
        <Confirm
          title={`Konfime konvèsyon an ${convertTarget === "cash" ? "Kach" : "Kredi"}?`}
          message={detail ? `${describeChange(detail, convertTarget).fromLabel} → ${describeChange(detail, convertTarget).toLabel} • Total ${fmt(Number(detail.sale.total ?? 0))} HTG` : undefined}
          confirmLabel="Konfime"
          cancelLabel="Anile"
          tone={convertTarget === "cash" ? "danger" : "primary"}
          onConfirm={applyConvert}
          onCancel={() => setConvertTarget(null)}
        />
      )}

      {receiptSale && <ReceiptViewer saleId={receiptSale} storeName={storeName} onClose={() => setReceiptSale(null)} />}
    </div>
  );
}