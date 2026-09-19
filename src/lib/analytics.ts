// Aggregated deviation / KPI helpers for the home Dashboard — port of the
// mobile home analytics logic.
import { palette } from "./theme";
import { fmt } from "./format";

export type RangeKey = "today" | "7d" | "28d" | "6m" | "1y" | "lifetime";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Aujourd'hui" },
  { key: "7d", label: "7 jours" },
  { key: "28d", label: "28 jours" },
  { key: "6m", label: "6 mois" },
  { key: "1y", label: "1 an" },
  { key: "lifetime", label: "Vitalité" },
];

export type TrendPoint = { d: string; v: number };
export type BestItem = { name: string; sku: string; qty: number; amount: number; icon: string; rank: number };
export type ProfitStats = { revenue: number; cost: number; profit: number; margin: number };
export type DayKPIs = { totalSales: number; transactionCount: number; avgBasket: number; cashAmount: number; creditAmount: number };
export type EmployeeKPI = { employeeId: string; name: string; role: string; isOnline?: boolean; today: DayKPIs; lastDay: (DayKPIs & { date: string }) | null };
export type TeamKPI = {
  cashSales: number;
  creditSales: number;
  mobileAmount: number;
  totalSales: number;
  transactionCount: number;
  totalCreditIssued: number;
  creditCollected: number;
  creditOutstanding: number;
  grossProfit: number;
  profitLabels: string[];
};

export const KR_RANGE: Record<string, string> = {
  today: "Jodi a",
  "7d": "7 jou",
  "28d": "28 jou",
  "6m": "6 mwa",
  "1y": "1 an",
  lifetime: "Vitalite",
};

export const ROLE_KR: Record<string, string> = {
  owner: "Patwon",
  admin: "Admin",
  manager: "Manadjè",
  cashier: "Kesye",
};

export function getRangeLabel(range: RangeKey): string {
  return KR_RANGE[range] ?? range;
}

export function getRangeShort(range: RangeKey): string {
  return ({ today: "08–20h", "7d": "7 jou", "28d": "4 semèn", "6m": "6 mwa", "1y": "12 mwa", lifetime: "Tout tan" } as Record<string, string>)[range] ?? range;
}

export type AnalyticsFocus = {
  tone: "warn" | "good";
  icon: string;
  title: string;
  body: string;
};

export function getFocus(args: { lowStockCount: number; lowStockValue: number; growthPct: number; profitStats: ProfitStats }): AnalyticsFocus {
  const { lowStockCount, lowStockValue, growthPct, profitStats } = args;
  if (lowStockCount > 0)
    return { tone: "warn", icon: "warning-outline", title: `${lowStockCount} pwodui nan dezespwa`, body: `Reyaprovizyonne kounye a (${fmt(lowStockValue)} HTG) pou pa pèdi vant.` };
  if (growthPct < 0)
    return { tone: "warn", icon: "trending-down", title: "Revni ap bese", body: `Bese ${Math.abs(growthPct)}%. Revize pri oswa lanse yon pwomosyon pou ranvèse tandans la.` };
  if (profitStats.margin < 10)
    return { tone: "warn", icon: "alert-circle", title: "Marj pwofi ba", body: `Marj ${profitStats.margin.toFixed(1)}%. Kontwole depans ak pri revand pou leve pwofi.` };
  return { tone: "good", icon: "checkmark-circle", title: "Bon rit travay", body: `Kontinye konsa — magazen an ap monte. Nivel pèfòmans sa rivalize gwo siksè yo.` };
}

export type AnalyticsPayment = { label: string; value: number; pct: number; c: string };
export type TopSeriesEntry = { name: string; c: string; w: number };

export function getPayments(args: { todayCash: number; todayCredit: number; todayMonCash: number; todayNatCash: number; todayCashPct: number; todayCreditPct: number; todayMonCashPct: number; todayNatCashPct: number }): AnalyticsPayment[] {
  return [
    { label: "Kach", value: args.todayCash, pct: args.todayCashPct, c: palette.success },
    { label: "Kredi", value: args.todayCredit, pct: args.todayCreditPct, c: palette.violet },
    { label: "MonCash", value: args.todayMonCash, pct: args.todayMonCashPct, c: palette.dangerDot },
    { label: "NatCash", value: args.todayNatCash, pct: args.todayNatCashPct, c: palette.blue },
  ];
}

export function getTopSeries(dynamicBestItems: BestItem[]): TopSeriesEntry[] {
  const colors = [palette.accentGold, palette.blue, palette.violet, palette.success, palette.dangerDot];
  const items = [...dynamicBestItems].sort((a, b) => b.rank - a.rank).reverse().slice(0, 5);
  const total = items.reduce((s, it) => s + it.amount, 0);
  return total > 0 ? items.map((it, i) => ({ name: it.name, c: colors[i % colors.length], w: it.amount / total })) : [];
}

export function getRankStyle(rank: number): { bg: string; tint: string } {
  if (rank === 1) return { bg: palette.warningBg, tint: palette.warning };
  if (rank === 2) return { bg: palette.surfaceGrouped, tint: palette.muted2 };
  if (rank === 3) return { bg: palette.dangerBg, tint: palette.danger };
  return { bg: palette.surfaceGrouped, tint: palette.muted2 };
}

/** Range filter on an ISO date. */
export function inRange(dateStr: string, range: RangeKey, now: Date = new Date()): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (range === "today") return diff < 1;
  if (range === "7d") return diff < 7;
  if (range === "28d") return diff < 28;
  if (range === "6m") return diff < 180;
  if (range === "1y") return diff < 365;
  return true;
}

/** Build per-facet trend buckets for the range (port of HomeScreen logic). */
export function buildTrend(salesSource: any[], range: RangeKey, todaySales: any[]): TrendPoint[] {
  const getAmt = (s: any) => Number(s.amount ?? s.total ?? 0);
  if (!salesSource || salesSource.length === 0) {
    const STATIC: Record<string, TrendPoint[]> = {
      today: [{ d: "08h", v: 4200 }, { d: "09h", v: 6800 }, { d: "11h", v: 9800 }, { d: "13h", v: 12500 }, { d: "15h", v: 15200 }, { d: "17h", v: 11200 }, { d: "19h", v: 5600 }],
      "7d": [{ d: "Lun", v: 32000 }, { d: "Mar", v: 41000 }, { d: "Mer", v: 38000 }, { d: "Jeu", v: 52000 }, { d: "Ven", v: 61000 }, { d: "Sam", v: 74000 }, { d: "Dim", v: 68000 }],
      "28d": [{ d: "S1", v: 42000 }, { d: "S2", v: 58000 }, { d: "S3", v: 47000 }, { d: "S4", v: 61000 }],
      "6m": [{ d: "Nov", v: 98000 }, { d: "Déc", v: 112000 }, { d: "Jan", v: 105000 }, { d: "Fév", v: 128000 }, { d: "Mar", v: 142000 }, { d: "Avr", v: 135000 }],
      "1y": [{ d: "Juil", v: 88000 }, { d: "Aoû", v: 105000 }, { d: "Sep", v: 98000 }, { d: "Oct", v: 112000 }, { d: "Nov", v: 108000 }, { d: "Déc", v: 125000 }, { d: "Jan", v: 118000 }, { d: "Fév", v: 130000 }, { d: "Mar", v: 142000 }, { d: "Avr", v: 138000 }, { d: "Mai", v: 150000 }, { d: "Jui", v: 145000 }],
      lifetime: [{ d: "2021", v: 320000 }, { d: "2022", v: 410000 }, { d: "2023", v: 480000 }, { d: "2024", v: 560000 }, { d: "2025", v: 620000 }],
    };
    return STATIC[range] ?? [];
  }
  const now = new Date();
  if (range === "today") {
    const buckets = ["08h", "09h", "11h", "13h", "15h", "17h", "19h"];
    const hours = [8, 9, 11, 13, 15, 17, 19];
    return buckets.map((label, i) => {
      const h = hours[i];
      const v = todaySales.filter(s => {
        const d = new Date((s as any).date);
        return d.getHours() === h || (h === 19 && d.getHours() >= 19) || (h === 8 && d.getHours() <= 8);
      }).reduce((sum, s) => sum + getAmt(s), 0);
      return { d: label, v: v || 0 };
    });
  }
  if (range === "7d") {
    const weekday = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const map: Record<string, number> = {};
    weekday.forEach(d => { map[d] = 0; });
    const src = salesSource.filter((s: any) => (now.getTime() - new Date((s as any).date).getTime()) / 86400000 < 7);
    for (const s of src) {
      const k = weekday[new Date((s as any).date).getDay()];
      map[k] = (map[k] || 0) + getAmt(s);
    }
    const order: string[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(now.getDate() - i); order.push(weekday[d.getDay()]); }
    const uniq = [...new Set(order)];
    return uniq.map(k => ({ d: k, v: map[k] || 0 }));
  }
  if (range === "28d") {
    const weeks = [{ d: "S1", v: 0 }, { d: "S2", v: 0 }, { d: "S3", v: 0 }, { d: "S4", v: 0 }];
    const src = salesSource.filter((s: any) => (now.getTime() - new Date((s as any).date).getTime()) / 86400000 < 28);
    for (const s of src) {
      const diff = Math.floor((now.getTime() - new Date((s as any).date).getTime()) / (7 * 86400000));
      const idx = Math.max(0, Math.min(3, 3 - diff));
      weeks[idx].v += getAmt(s);
    }
    return weeks;
  }
  if (range === "6m" || range === "1y") {
    const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jui", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const count = range === "6m" ? 6 : 12;
    const buckets = months.slice(0, count).map(() => 0);
    const src = salesSource.filter((s: any) => (now.getTime() - new Date((s as any).date).getTime()) / 86400000 < (range === "6m" ? 180 : 365));
    const startMonth = (now.getMonth() - count + 1 + 12) % 12;
    for (const s of src) {
      const m = new Date((s as any).date).getMonth();
      const idx = (m - startMonth + 12) % 12;
      if (idx >= 0 && idx < count) buckets[idx] += getAmt(s);
    }
    const labels: string[] = [];
    for (let i = 0; i < count; i++) labels.push(months[(startMonth + i) % 12]);
    return labels.map((d, i) => ({ d, v: buckets[i] || 0 }));
  }
  const years = ["2021", "2022", "2023", "2024", "2025"];
  return years.map(y => {
    const v = salesSource.filter((s: any) => String(new Date((s as any).date).getFullYear()) === y).reduce((sum, s) => sum + getAmt(s), 0);
    return { d: y, v: v || 0 };
  });
}