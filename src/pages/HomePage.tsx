import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { palette } from "../lib/theme";
import { fmt } from "../lib/format";
import { getDb } from "../lib/db";
import { salesEvents } from "../lib/salesEvents";
import type { RangeKey, TeamKPI, BestItem, TrendPoint, EmployeeKPI } from "../lib/analytics";
import { RANGES, getRangeLabel, getRangeShort, getFocus, getPayments, getTopSeries, getRankStyle, buildTrend, KR_RANGE } from "../lib/analytics";
import { Icon } from "../components/Icon";
import { Card } from "../components/ui";
import { useAuthStore } from "../lib/authStore";
import { getUserById } from "../lib/users";

const BRAND = { ink: "#16130c", gold: "#C8A24A", goldBg: "#efe7d2", red: "#C0392B" };
const BEST_ITEMS_FALLBACK: BestItem[] = [
  { name: "Riz 25kg", sku: "RICE-25KG", qty: 42, amount: 134400, icon: "🍚", rank: 1 },
  { name: "Prestige 330ml", sku: "PREST-330", qty: 38, amount: 3800, icon: "🍺", rank: 2 },
  { name: "Lwil 5L", sku: "OIL-5L", qty: 27, amount: 29700, icon: "🫒", rank: 3 },
  { name: "Farine 25kg", sku: "FARIN-25KG", qty: 21, amount: 58800, icon: "🌾", rank: 4 },
  { name: "Sik 10kg", sku: "SIK-10KG", qty: 19, amount: 18050, icon: "🍬", rank: 5 },
];

function num(s: any) { return Number(s ?? 0) || 0; }
function getAmt(s: any) { return num(s.amount ?? s.total ?? 0); }
function getPay(s: any) { return String(s.pay ?? s.payment_method ?? "cash").toLowerCase(); }
function getDate(s: any) { return s?.date ?? s?.created_at ?? s?.updated_at; }

type SalesRow = { id: string; sale_number: string; date: string; customer: string; amount: number; pay: string; status: string; raw: any };

export function HomePage() {
  const nav = useNavigate();
  const { user, cached } = useAuthStore();
  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const [tab, setTab] = useState<"analytics" | "sales">("analytics");
  const [range, setRange] = useState<RangeKey>("today");

  const [dbSales, setDbSales] = useState<SalesRow[]>([]);
  const [allSaleItems, setAllSaleItems] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [priceByProduct, setPriceByProduct] = useState<Record<string, number>>({});
  const [credits, setCredits] = useState<any[]>([]);
  const [creditPayments, setCreditPayments] = useState<any[]>([]);
  const [employeeKPIs, setEmployeeKPIs] = useState<EmployeeKPI[]>([]);

  const loadSales = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = (await db.getAllAsync("SELECT * FROM sales ORDER BY created_at DESC, updated_at DESC")) as any[];
      const custs = (await db.getAllAsync("SELECT * FROM customers")) as any[];
      const items = (await db.getAllAsync("SELECT * FROM sale_items")) as any[];
      const products = (await db.getAllAsync("SELECT * FROM products")) as any[];
      let creditRows: any[] = []; let creditPaymentRows: any[] = [];
      try { creditRows = (await db.getAllAsync("SELECT * FROM credits")) as any[]; } catch {}
      try { creditPaymentRows = (await db.getAllAsync("SELECT * FROM credit_payments")) as any[]; } catch {}
      setCredits(creditRows ?? []);
      setCreditPayments(creditPaymentRows ?? []);
      setLowStockProducts((products ?? []).filter((p: any) => Number(p.stock_quantity) <= Number(p.low_stock_threshold)));
      try {
        const { loadPricing, getDisplayPrice } = await import("../lib/pricing");
        const pm = await loadPricing(db);
        const map: Record<string, number> = {};
        for (const p of products ?? []) {
          const d = getDisplayPrice(pm, p.id);
          map[p.id] = d && d.price > 0 ? d.price : num(p.selling_price);
        }
        setPriceByProduct(map);
      } catch {}
      setAllSaleItems(items ?? []);
      if (rows?.length) {
        const custMap = new Map((custs ?? []).map((c: any) => [c.id, c.name]));
        setDbSales(rows.map((r: any) => ({
          id: r.id, sale_number: r.sale_number ?? r.id, date: r.created_at ?? r.updated_at ?? new Date().toISOString(),
          customer: custMap.get(r.customer_id) ?? r.customer_id ?? "—", amount: num(r.total ?? r.amount ?? r.subtotal),
          pay: String(r.payment_method ?? r.pay ?? "cash").toLowerCase(), status: String(r.status ?? "completed").toLowerCase(), raw: r,
        })));
      } else setDbSales([]);
    } catch {}
  }, []);

  useEffect(() => { loadSales(); }, [loadSales, tab, range]);
  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(loadSales); } catch {} })();
    const id = setInterval(loadSales, 2500);
    return () => { clearInterval(id); if (unsub) unsub(); };
  }, [loadSales]);

  const filteredSales = useMemo(() => {
    const now = new Date();
    const src = dbSales;
    return src
      .filter(s => {
        const d = new Date(s.date);
        const diff = (now.getTime() - d.getTime()) / 86400000;
        const ok = ["completed", "paid", "pending", "credit"].includes(s.status);
        if (!ok || isNaN(d.getTime())) return false;
        if (range === "today") return diff < 1;
        if (range === "7d") return diff < 7;
        if (range === "28d") return diff < 28;
        if (range === "6m") return diff < 180;
        if (range === "1y") return diff < 365;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [range, dbSales]);

  const todaySales = useMemo(() => dbSales.filter(s => { const d = new Date(s.date); return !isNaN(d.getTime()) && (Date.now() - d.getTime()) / 86400000 < 1; }), [dbSales]);
  const yesterdayTotal = useMemo(() => dbSales.filter(s => { const d = new Date(s.date); const diff = (Date.now() - d.getTime()) / 86400000; return !isNaN(d.getTime()) && diff >= 1 && diff < 2; }).reduce((a, b) => a + getAmt(b), 0), [dbSales]);
  const todayTotal = todaySales.reduce((a, b) => a + getAmt(b), 0);
  const todayCount = todaySales.length;
  const todayCash = todaySales.filter(s => getPay(s) === "cash").reduce((a, b) => a + getAmt(b), 0);
  const todayCredit = todaySales.filter(s => getPay(s) === "credit").reduce((a, b) => a + getAmt(b), 0);
  const todayMonCash = todaySales.filter(s => getPay(s) === "moncash").reduce((a, b) => a + getAmt(b), 0);
  const todayNatCash = todaySales.filter(s => getPay(s) === "natcash").reduce((a, b) => a + getAmt(b), 0);
  const todayCashPct = todayTotal ? Math.round((todayCash / todayTotal) * 100) : 0;
  const todayCreditPct = todayTotal ? Math.round((todayCredit / todayTotal) * 100) : 0;
  const todayMonCashPct = todayTotal ? Math.round((todayMonCash / todayTotal) * 100) : 0;
  const todayNatCashPct = todayTotal ? Math.round((todayNatCash / todayTotal) * 100) : 0;
  const avgBasket = todayCount ? Math.round(todayTotal / todayCount) : 0;
  const growthPct = yesterdayTotal ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : todayTotal > 0 ? 100 : 0;
  const lowStockCount = lowStockProducts.length;
  const lowStockValue = lowStockProducts.reduce((sum, p) => sum + num(priceByProduct[p.id] ?? p.selling_price) * num(p.stock_quantity), 0);

  const profitStats = useMemo(() => {
    const revenue = filteredSales.reduce((a, b) => a + getAmt(b), 0) || 0;
    const ids = new Set(filteredSales.map(s => s.id));
    let cost = 0;
    for (const it of allSaleItems) if (ids.has(it.sale_id)) cost += num(it.cost_price);
    if (cost === 0 && revenue > 0) cost = revenue * 0.65;
    const profit = revenue - cost;
    return { revenue, cost, profit, margin: revenue ? (profit / revenue) * 100 : 0 };
  }, [filteredSales, allSaleItems]);

  const dynamicBestItems = useMemo<BestItem[]>(() => {
    if (!allSaleItems?.length) return BEST_ITEMS_FALLBACK;
    const map = new Map<string, { name: string; sku: string; qty: number; amount: number }>();
    for (const it of allSaleItems) {
      const key = String(it.product_name || it.product_id || "Unknown");
      const cur = map.get(key) ?? { name: key, sku: String(it.product_id || key).slice(0, 12), qty: 0, amount: 0 };
      cur.qty += num(it.quantity);
      cur.amount += num(it.line_total || num(it.quantity) * num(it.unit_price));
      map.set(key, cur);
    }
    const sorted = Array.from(map.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);
    if (!sorted.length) return BEST_ITEMS_FALLBACK;
    const icons = ["🍚", "🍺", "🫒", "🌾", "🍬"];
    return sorted.map((it, i) => ({ name: it.name, sku: it.sku, qty: it.qty, amount: it.amount, icon: icons[i] ?? "📦", rank: i + 1 }));
  }, [allSaleItems]);

  const dynamicTrend = useMemo<TrendPoint[]>(() => buildTrend(dbSales, range, todaySales.map(s => ({ date: s.date, amount: s.amount } as any))), [dbSales, range, todaySales]);

  const teamKPI = useMemo<TeamKPI>(() => {
    const now = new Date();
    const inRange = (ds: string) => {
      const d = new Date(ds); if (isNaN(d.getTime())) return false;
      const diff = (now.getTime() - d.getTime()) / 86400000;
      if (range === "today") return diff < 1;
      if (range === "7d") return diff < 7;
      if (range === "28d") return diff < 28;
      if (range === "6m") return diff < 180;
      if (range === "1y") return diff < 365;
      return true;
    };
    const src = dbSales;
    const rangeSales = src.filter(s => (["completed", "paid", "pending", "credit"].includes(s.status)) && inRange(s.date));
    const totalSales = rangeSales.reduce((a, b) => a + getAmt(b), 0);
    const cashSales = rangeSales.filter(s => getPay(s) === "cash").reduce((a, b) => a + getAmt(b), 0);
    const creditSales = rangeSales.filter(s => getPay(s) === "credit").reduce((a, b) => a + getAmt(b), 0);
    const monCash = rangeSales.filter(s => getPay(s) === "moncash").reduce((a, b) => a + getAmt(b), 0);
    const natCash = rangeSales.filter(s => getPay(s) === "natcash").reduce((a, b) => a + getAmt(b), 0);
    const rangeCredits = (credits ?? []).filter((c: any) => inRange(getDate(c)));
    const totalCreditIssued = rangeCredits.reduce((a, c) => a + num(c.amount), 0);
    const creditIds = new Set(rangeCredits.map((c: any) => c.id));
    const creditCollected = (creditPayments ?? []).filter((p: any) => creditIds.has(p.credit_id) || creditIds.has(p.debt_id)).reduce((a, p) => a + num(p.amount), 0);
    const creditOutstanding = Math.max(0, totalCreditIssued - creditCollected);
    const rangeIds = new Set(rangeSales.map(s => s.id));
    let cost = 0;
    for (const it of allSaleItems) if (rangeIds.has(it.sale_id)) cost += num(it.cost_price);
    const grossProfit = totalSales - (cost || Math.round(totalSales * 0.65));
    return { cashSales, creditSales, mobileAmount: monCash + natCash, totalSales, transactionCount: rangeSales.length, totalCreditIssued, creditCollected, creditOutstanding, grossProfit, profitLabels: [RANGES.find(r => r.key === range)?.label ?? range] };
  }, [range, dbSales, credits, creditPayments, allSaleItems]);

  useEffect(() => {
    // Build employee KPIs from today's sales grouped by cashier
    (async () => {
      try {
        const emps = (await (await getDb()).getAllAsync("SELECT * FROM employees WHERE is_active=1 OR is_active IS NULL")) as any[];
        const d = await getDb();
        const rows = (await d.getAllAsync("SELECT * FROM sales ORDER BY created_at DESC")) as any[];
        const today = rows.filter(r => { const dt = new Date(r.created_at ?? r.updated_at); return !isNaN(dt.getTime()) && (Date.now() - dt.getTime()) / 86400000 < 1; });
        const sids = new Set(today.map((r: any) => r.id));
        const items = allSaleItems.filter(it => sids.has(it.sale_id));
        const grouped = new Map<string, any[]>();
        for (const r of today) {
          const key = r.cashier_id ?? r.user_id ?? "emp-4";
          grouped.set(key, [...(grouped.get(key) ?? []), r]);
        }
        const byName = new Map<string, SalesRow & { cashier_id: string }>();
        void byName;
        const kpis: EmployeeKPI[] = Array.from(grouped.entries()).map(([empId, list]) => {
          const total = (list as any[]).reduce((a, b) => a + num(b.total ?? b.amount), 0);
          const cash = (list as any[]).filter((r: any) => String(r.payment_method ?? "cash").toLowerCase() === "cash").reduce((a, b) => a + num(b.total ?? b.amount), 0);
          const credit = (list as any[]).filter((r: any) => String(r.payment_method ?? "").toLowerCase() === "credit").reduce((a, b) => a + num(b.total ?? b.amount), 0);
          const emp = emps.find((e: any) => e.id === empId) ?? getUserById(empId);
          return {
            employeeId: empId,
            name: emp?.full_name ?? emp?.name ?? empId,
            role: emp?.role ?? "cashier",
            isOnline: !!emp?.online_status,
            today: { totalSales: total, transactionCount: list.length, avgBasket: list.length ? Math.round(total / list.length) : 0, cashAmount: cash, creditAmount: credit },
            lastDay: null,
          };
        });
        let empCost = 0;
        for (const it of items) empCost += num(it.cost_price);
        void empCost;
        setEmployeeKPIs(kpis);
      } catch {}
    })();
  }, [allSaleItems, dbSales]);

  const rangeLabel = getRangeLabel(range);
  const focus = getFocus({ lowStockCount, lowStockValue, growthPct, profitStats });
  const payments = getPayments({ todayCash, todayCredit, todayMonCash, todayNatCash, todayCashPct, todayCreditPct, todayMonCashPct, todayNatCashPct });
  const mixTotal = todayCash + todayCredit + todayMonCash + todayNatCash;
  const topSeries = getTopSeries(dynamicBestItems);
  const displayName = (cached?.name ?? user?.name ?? "").split(" ")[0];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 3, background: palette.surfaceGrouped, borderRadius: 16, padding: 3, border: "0.5px solid " + palette.hairline }}>
        {([["analytics", "Analytics"], ["sales", "KPI"]] as const).filter(t => t[0] !== "sales" || role !== "cashier").map(([k, l]) => {
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 6px", borderRadius: 12, border: "none", background: active ? "#fff" : "transparent", color: active ? palette.ink : palette.muted2, fontWeight: active ? 700 : 500, fontSize: 13, boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none", cursor: "pointer" }}>
              {l}
            </button>
          );
        })}
        <button onClick={() => nav("/team")} style={{ flex: 1, padding: "9px 6px", borderRadius: 12, border: "none", background: "transparent", color: palette.muted2, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>Team</button>
        <button onClick={() => nav("/stores")} style={{ flex: 1, padding: "9px 6px", borderRadius: 12, border: "none", background: "transparent", color: palette.muted2, fontWeight: 500, fontSize: 13, cursor: "pointer" }}>Store</button>
      </div>

      {tab === "analytics" && (
        <>
          <AnalyticsView
            displayName={displayName} role={role} range={range} setRange={setRange}
            todayTotal={todayTotal} todayCount={todayCount} growthPct={growthPct} avgBasket={avgBasket}
            todayCash={todayCash} todayCredit={todayCredit} todayMonCash={todayMonCash} todayNatCash={todayNatCash}
            todayCashPct={todayCashPct} todayCreditPct={todayCreditPct} todayMonCashPct={todayMonCashPct} todayNatCashPct={todayNatCashPct}
            profitStats={profitStats} filteredSalesCount={filteredSales.length} lowStockCount={lowStockCount} lowStockValue={lowStockValue}
            dynamicTrend={dynamicTrend} dynamicBestItems={dynamicBestItems} dbSalesLength={dbSales.length}
            rangeLabel={rangeLabel} focus={focus} payments={payments} mixTotal={mixTotal} topSeries={topSeries} rangeShort={getRangeShort(range)} employeeKPIs={employeeKPIs}
          />
        </>
      )}

      {tab === "sales" && (
        <KPIView teamKPI={teamKPI} range={range} setRange={setRange} />
      )}
    </div>
  );
}

function AnalyticsView(props: {
  displayName: string; role: string; range: RangeKey; setRange: (r: RangeKey) => void;
  todayTotal: number; todayCount: number; growthPct: number; avgBasket: number;
  todayCash: number; todayCredit: number; todayMonCash: number; todayNatCash: number;
  todayCashPct: number; todayCreditPct: number; todayMonCashPct: number; todayNatCashPct: number;
  profitStats: { revenue: number; cost: number; profit: number; margin: number };
  filteredSalesCount: number; lowStockCount: number; lowStockValue: number;
  dynamicTrend: TrendPoint[]; dynamicBestItems: BestItem[]; dbSalesLength: number;
  rangeLabel: string; focus: any; payments: any[]; mixTotal: number; topSeries: any[]; rangeShort: string;
  employeeKPIs: EmployeeKPI[];
}) {
  const { displayName, role, range, setRange } = props;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: palette.ink2, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${palette.accentGold}`, color: "#fff", fontWeight: 700, fontSize: 15 }}>
          {(displayName || role).slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: palette.ink }}>Bonjou{displayName ? `, ${displayName}` : ""}</div>
          <div style={{ fontSize: 11, color: palette.muted2 }}>{KR_RANGE[role] ?? role} • Panèl Desizyon</div>
        </div>
        <div style={{ fontSize: 10, color: palette.muted2, textTransform: "capitalize" }}>{new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {RANGES.map(r => {
          const active = range === r.key;
          return (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ paddingBottom: 4, border: "none", background: "none", borderBottom: active ? `2px solid ${palette.accentGold}` : "2px solid transparent", fontWeight: active ? 700 : 500, fontSize: 13, color: active ? palette.ink : palette.muted2, cursor: "pointer" }}>
              {KR_RANGE[r.key] ?? r.label}
            </button>
          );
        })}
      </div>

      {/* Hero */}
      <Card style={{ padding: 18, borderTop: `3px solid ${palette.accentGold}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="cash" size={19} color={palette.accentGold} />
          </div>
          <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Revni Jodi a</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.8, marginTop: 6, textAlign: "right" }} className="num">{fmt(props.todayTotal)} <span style={{ fontSize: 15, color: palette.muted2 }}>HTG</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ padding: "4px 9px", borderRadius: 999, background: props.growthPct >= 0 ? palette.successBg : palette.dangerBg, fontSize: 12, fontWeight: 700, color: props.growthPct >= 0 ? palette.success : palette.danger }}>
            {props.growthPct >= 0 ? "↗" : "↘"} {props.growthPct >= 0 ? `+${props.growthPct}%` : `${props.growthPct}%`}
          </span>
          <span style={{ fontSize: 12, color: palette.muted2 }}>{props.todayCount} antre • {props.dbSalesLength ? "live" : "demo"}</span>
        </div>
        <div style={{ height: 0.5, background: palette.separator, margin: "16px -18px 0" }} />
        <div style={{ display: "flex", background: palette.surface2, borderRadius: 16, padding: 12, marginTop: 12 }}>
          <KStat label="Mwayèn Dekòk" value={`${fmt(props.avgBasket)} HTG`} />
          <VDiv />
          <KStat label="Bòdwo" value={String(props.todayCount)} />
          <VDiv />
          <KStat label="Kwasans" value={`${props.growthPct >= 0 ? "+" : ""}${props.growthPct}%`} color={props.growthPct >= 0 ? palette.success : palette.danger} />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <FocusBanner focus={props.focus} />
          <ProfitCard profitStats={props.profitStats} rangeLabel={props.rangeLabel} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <MiniStat bg={palette.blueBg} dot={palette.blue} label="Tranzaksyon" value={String(props.filteredSalesCount)} sub={`${props.rangeLabel} • live`} color={palette.blue} />
            <MiniStat bg={props.lowStockCount ? palette.warningBg : palette.successBg} dot={props.lowStockCount ? palette.warningDot : palette.success} label="Dezespwa" value={String(props.lowStockCount)} sub={`${fmt(props.lowStockValue)} HTG`} color={props.lowStockCount ? palette.warning : palette.success} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {/* Trend */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Tandans</div>
              <span style={{ padding: "4px 9px", borderRadius: 999, background: palette.surface2, fontSize: 10, fontWeight: 600, color: palette.muted2 }}>{props.rangeShort} • Top Vant</span>
            </div>
            <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>Seri plizyè KPI — kontribisyon chak pwodui nan revni a.</div>
            <div style={{ height: 150, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={props.dynamicTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="d" tick={{ fontSize: 10, fill: palette.muted2 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip formatter={(v: any) => fmt(Number(v)) + " HTG"} contentStyle={{ borderRadius: 12, border: "0.5px solid " + palette.hairline, fontSize: 12 }} />
                  {props.topSeries.length ? (
                    props.topSeries.map((s: any, i: number) => (
                      <Bar key={i} dataKey={() => undefined} stackId="a" fill={s.c} radius={i === props.topSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))
                  ) : (
                    <Bar dataKey="v" fill={palette.surfaceGrouped} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {props.topSeries.map((s: any) => (
                <span key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: palette.muted2, maxWidth: 150 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.c }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                </span>
              ))}
            </div>
          </Card>

          {/* Best items */}
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Top Pwodui</span>
              <span style={{ padding: "3px 9px", borderRadius: 999, background: palette.surfaceGrouped, fontSize: 10, fontWeight: 600, color: palette.muted2 }}>TOP 5</span>
            </div>
            <div style={{ height: 0.5, background: palette.separator }} />
            {props.dynamicBestItems.map((it, idx, arr) => {
              const rs = getRankStyle(it.rank);
              return (
                <div key={it.sku} style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, borderBottom: idx === arr.length - 1 ? "none" : `0.5px solid ${palette.separatorSoft}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: rs.bg, color: rs.tint, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10 }}>#{it.rank}</div>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{it.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: palette.muted2, marginTop: 1 }}>{it.sku} • {it.qty} vann</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }} className="num">{fmt(it.amount)} HTG</div>
                    <div style={{ fontSize: 10, color: palette.muted2 }} className="num">{(it.amount / Math.max(1, it.qty)).toFixed(0)} /u</div>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      {/* Payment mix + employees */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Peye pa Mwayen</div>
          <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>{props.rangeLabel}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {props.payments.map(p => {
              const pct = props.mixTotal ? Math.round((p.value / props.mixTotal) * 100) : 0;
              return (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 5, background: p.c }} />
                  <span style={{ fontSize: 12, color: palette.muted2, width: 70 }}>{p.label}</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: palette.surfaceGrouped }}>
                    <div style={{ width: `${pct}%`, height: 5, borderRadius: 3, background: p.c }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: p.c, minWidth: 40, textAlign: "right" }}>{p.pct}%</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: palette.ink, minWidth: 80, textAlign: "right" }} className="num">{p.value ? fmt(p.value) : "—"}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {props.employeeKPIs.length ? (
          <Card style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Pèfòmans Ekip</div>
            <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>{KR_RANGE.today}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {props.employeeKPIs.map(e => (
                <div key={e.employeeId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "0.5px solid " + palette.separatorSoft }}>
                  <div style={{ width: 28, height: 28, borderRadius: 9, background: palette.ink2, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11 }}>
                    {e.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: palette.muted2 }}>{e.today.transactionCount} vant</div>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12, color: palette.ink }} className="num">{fmt(e.today.totalSales)} HTG</span>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function KPIView({ teamKPI, range, setRange }: { teamKPI: TeamKPI; range: RangeKey; setRange: (r: RangeKey) => void }) {
  const total = teamKPI.cashSales + teamKPI.creditSales;
  const mobileTotal = teamKPI.cashSales + teamKPI.mobileAmount;
  const collected = Math.min(teamKPI.creditCollected, teamKPI.totalCreditIssued || teamKPI.creditCollected);
  const goal = teamKPI.totalCreditIssued;
  const pct = goal > 0 ? Math.round((collected / goal) * 100) : 0;
  const outstanding = Math.max(0, goal - collected);
  const seg = { cashSales: teamKPI.cashSales, collectedCredit: teamKPI.creditCollected, outstandingCredit: outstanding };
  const barTotal = seg.cashSales + seg.collectedCredit + seg.outstandingCredit;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        {RANGES.map(r => {
          const active = range === r.key;
          return (
            <button key={r.key} onClick={() => setRange(r.key)} style={{ paddingBottom: 6, border: "none", background: "none", borderBottom: active ? `2.5px solid ${palette.ink}` : "2.5px solid transparent", fontWeight: active ? 700 : 400, fontSize: 13, color: active ? palette.ink : palette.muted2, cursor: "pointer" }}>
              {r.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <CardHead title="Cash / Crédit" subtitle="Répartition des ventes" />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 160, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={total > 0 ? [{ v: teamKPI.cashSales, c: BRAND.ink }, { v: teamKPI.creditSales, c: BRAND.gold }] : [{ v: 1, c: BRAND.goldBg }]} dataKey="v" innerRadius={0} outerRadius={60}>
                    {[BRAND.ink, BRAND.gold].map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <LegendItem color={BRAND.ink} label="Cash" value={teamKPI.cashSales} total={total} />
              <LegendItem color={BRAND.gold} label="Crédit" value={teamKPI.creditSales} total={total} />
            </div>
          </div>
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, marginTop: 6 }} className="num">{fmt(total)} HTG</div>
        </Card>

        <Card style={{ padding: 16 }}>
          <CardHead title="Cash vs Mobile" subtitle="Ventes encaissées vs paiement mobile" />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 160, height: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={mobileTotal > 0 ? [{ v: teamKPI.cashSales, c: BRAND.ink }, { v: teamKPI.mobileAmount, c: BRAND.gold }] : [{ v: 1, c: BRAND.goldBg }]} dataKey="v" innerRadius={45} outerRadius={60}>
                    {[BRAND.ink, BRAND.gold].map((c, i) => <Cell key={i} fill={c} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <LegendItem color={BRAND.ink} label="Cash" value={teamKPI.cashSales} total={mobileTotal} />
              <LegendItem color={BRAND.gold} label="Mobile" value={teamKPI.mobileAmount} total={mobileTotal} />
            </div>
          </div>
          <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, marginTop: 6 }} className="num">{fmt(mobileTotal)} HTG</div>
        </Card>

        <Card style={{ padding: 16 }}>
          <CardHead title="Recouvrement du Crédit" subtitle={`Objectif : ${fmt(goal)} HTG émis`} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 130 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5 }}>{goal > 0 ? `${pct}%` : "—"}</div>
              <div style={{ fontSize: 11, color: palette.muted2 }}>{goal > 0 ? "collecté" : "aucun crédit"}</div>
            </div>
          </div>
          <div style={{ height: 12, borderRadius: 6, background: BRAND.goldBg, overflow: "hidden" }}>
            <div style={{ height: 12, borderRadius: 6, background: BRAND.gold, width: `${goal > 0 ? pct : 0}%` }} />
          </div>
          <LegendRow>
            <LegendItem color={BRAND.gold} label="Collecté" value={collected} unit="HTG" />
            <LegendItem color="#8A6A35" label="Restant" value={outstanding} unit="HTG" />
          </LegendRow>
          <div style={{ background: palette.surfaceGrouped, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: palette.muted }}>Total émis : {fmt(goal)} HTG</div>
        </Card>

        <Card style={{ padding: 16 }}>
          <CardHead title="Valeur brute (Profit)" subtitle="Cash sales + crédit (collecté + restant)" right={`${fmt(barTotal)} HTG`} />
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ label: teamKPI.profitLabels[0] ?? range, c: seg.cashSales || 0, g: seg.collectedCredit || 0, r: seg.outstandingCredit || 0 }]} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.muted2 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Bar dataKey="c" stackId="a" fill={BRAND.ink} />
                <Bar dataKey="g" stackId="a" fill={BRAND.gold} />
                <Bar dataKey="r" stackId="a" fill={BRAND.red} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <LegendRow>
            <LegendItem color={BRAND.ink} label="Ventes Cash" value={seg.cashSales} unit="HTG" />
            <LegendItem color={BRAND.gold} label="Crédit collecté" value={seg.collectedCredit} unit="HTG" />
            <LegendItem color={BRAND.red} label="Crédit restant" value={seg.outstandingCredit} unit="HTG" />
          </LegendRow>
        </Card>
      </div>
    </div>
  );
}

function CardHead({ title, subtitle, right }: { title: string; subtitle?: string; right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: palette.ink }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>{subtitle}</div> : null}
      </div>
      {right ? <div style={{ fontSize: 13, fontWeight: 700, color: palette.ink }}>{right}</div> : null}
    </div>
  );
}

function LegendItem({ color, label, value, total, unit }: { color: string; label: string; value: number; total?: number; unit?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 12, color: palette.muted, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: palette.ink2 }} className="num">{fmt(value)}{unit ? ` ${unit}` : ""}{total !== undefined ? ` • ${pct}%` : ""}</span>
    </div>
  );
}
function LegendRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0" }}>{children}</div>;
}

function KStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: 1, alignItems: "center", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 9, color: palette.muted2, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? palette.ink, marginTop: 2 }} className="num">{value}</div>
    </div>
  );
}
function VDiv() {
  return <div style={{ width: 1, background: palette.separator }} />;
}
function FocusBanner({ focus }: { focus: any }) {
  const good = focus.tone === "good";
  const bg = good ? palette.successBg : palette.warningBg;
  const fg = good ? palette.success : palette.warning;
  return (
    <div style={{ background: bg, borderRadius: 20, padding: 14, border: `0.5px solid ${good ? palette.successBd : palette.warningBd}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={focus.icon} size={19} color={fg} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: fg }}>{focus.title}</div>
        <div style={{ fontSize: 11, color: fg, marginTop: 2 }}>{focus.body}</div>
      </div>
    </div>
  );
}

function ProfitCard({ profitStats, rangeLabel }: { profitStats: { revenue: number; cost: number; profit: number; margin: number }; rangeLabel: string }) {
  const good = profitStats.profit >= 0;
  const m = profitStats.margin;
  const pill = m >= 20 ? { bg: palette.successBg, fg: palette.success } : m >= 10 ? { bg: palette.warningBg, fg: palette.warning } : { bg: palette.dangerBg, fg: palette.danger };
  return (
    <Card style={{ padding: 16, borderTop: `3px solid ${good ? palette.success : palette.dangerDot}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: good ? palette.successBg : palette.dangerBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={good ? "checkmark-circle" : "warning"} size={18} color={good ? palette.success : palette.danger} />
          </div>
          <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7 }}>Pwofi • {rangeLabel}</span>
        </div>
        <span style={{ padding: "5px 10px", borderRadius: 999, background: pill.bg, fontSize: 11, fontWeight: 700, color: pill.fg }}>{m.toFixed(1)}% marj</span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, marginTop: 8, color: good ? palette.ink : palette.danger }} className="num">{fmt(profitStats.profit)} HTG</div>
      <div style={{ height: 0.5, background: palette.separator, margin: "12px -16px 8px" }} />
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.3 }}>Revni</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }} className="num">{fmt(profitStats.revenue)} HTG</div></div>
        <div style={{ width: 1, background: palette.separator }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.3 }}>Depans</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }} className="num">{fmt(profitStats.cost)} HTG</div></div>
        <div style={{ width: 1, background: palette.separator }} />
        <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.3 }}>Marj</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 3 }}>{m.toFixed(1)}%</div></div>
      </div>
    </Card>
  );
}

function MiniStat({ bg, dot, label, value, sub, color }: { bg: string; dot: string; label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ background: bg, borderRadius: 20, padding: 14, border: `0.5px solid ${dot}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: dot }} />
        <span style={{ fontSize: 9, color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 11, color, marginTop: 2 }}>{sub}</div>
    </div>
  );
}