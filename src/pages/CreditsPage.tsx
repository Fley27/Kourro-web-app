import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb } from "../lib/db";
import { fmt, fmtHTG, monoStyle } from "../lib/format";
import { useAuthStore } from "../lib/authStore";
import { useResponsive } from "../lib/responsive";
import { buildCreditPaymentReceipts, type ReceiptData } from "../lib/receipts";
import { ReceiptModal } from "../components/ReceiptModal";
import { Button, Overlay, TextInput, toast } from "../components/ui";

const LUX = {
  bg: "#fffdfd",
  ink: "#16130c",
  body: "#3D3D40",
  muted: "#837b69",
  faint: "#98989D",
  surface: "#efe7d2",
  surface2: "#EBEBEF",
  white: "#FFFFFF",
  hairline: "#E2E2E7",
  hairline2: "#D1D1D6",
  gold: "#C8A24A",
  goldSoft: "#F0EDE6",
  goldDeep: "#8A6A35",
  goldDark: "#5C4A26",
  goldBg: "#F7F5F0",
  goldBd: "#E2D9C3",
  green: "#2F7D5B",
  greenDeep: "#1F5F45",
  greenBg: "#EEF5F1",
  greenBd: "#C9DED2",
  purple: "#7C3AED",
  purpleDeep: "#5B21B6",
  purpleBg: "#F3EFFC",
  purpleBd: "#D6CCF5",
  purpleDot: "#8B5CF6",
  red: "#9C3B3B",
  redDeep: "#7A2E2E",
  redBg: "#F5ECEC",
  redBd: "#E5CECE",
  redBd2: "#D9B0AA",
  redBg2: "#F2E4E2",
  shadow: "#3E3630",
};

const WEB = {
  successBg: "#EAF6EE",
  successBd: "#A7D8B5",
  successTx: "#065F46",
  successDeep: "#064E3B",
  successSub: "#0A7C3E",
  dangerBg: "#FFF1F2",
  dangerBd: "#FECDD3",
  dangerTx: "#7F1D1D",
  warnBg: "#FFFBEB",
  warnBd: "#FDE68A",
  warnTx: "#92400E",
  amberBg: "#FFF7ED",
  amberBd: "#FED7AA",
  amberLabel: "#9A3412",
  amberValue: "#7C2D12",
  amberSub: "#C2410C",
  groupedBg: "#F9F9FB",
  groupedBd: "#E8E8EC",
  trackBg: "#FEE2E2",
  barGreen: "#0A7C3E",
  dotPink: "#FCA5A5",
  barRed: "#FF3B30",
  barAmber: "#FF9F0A",
  ink: "#16130c",
};

type RangeKey = "today" | "7d" | "28d" | "180d" | "all";
type CreditsView = "all" | "delinquent" | "current" | "paid";

type AnalyticsState = {
  creditGiven: number;
  creditPaid: number;
  paidPercent: number;
  unpaidPercent: number;
  totalOutstanding: number;
};

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Jodi a" },
  { key: "7d", label: "7 jou" },
  { key: "28d", label: "28 jou" },
  { key: "180d", label: "6 mwa" },
  { key: "all", label: "Tout tan" },
];

const FILTER_CHIPS = [
  { id: "all", label: "Tout" },
  { id: "delinquent", label: "Anreta" },
  { id: "current", label: "Pako Rive" },
  { id: "paid", label: "Peye Deja" },
] as const;

function getRangeStart(range: RangeKey) {
  const now = new Date();
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "7d") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "28d") {
    start.setDate(now.getDate() - 27);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (range === "180d") {
    start.setDate(now.getDate() - 179);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  return new Date(0);
}

function isWithinRange(dateValue: string | null | undefined, range: RangeKey) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (range === "all") return true;
  return date >= getRangeStart(range);
}

function Donut({ paidPercent, unpaidPercent }: { paidPercent: number; unpaidPercent: number }) {
  const paid = Math.min(100, Math.max(0, paidPercent));
  const unpaid = Math.min(100, Math.max(0, unpaidPercent));
  return (
    <div
      style={{
        width: 92,
        height: 92,
        borderRadius: 46,
        background: `conic-gradient(${LUX.green} 0deg ${paid * 3.6}deg, ${LUX.redBg} ${paid * 3.6}deg ${(paid + unpaid) * 3.6}deg, #fff ${(paid + unpaid) * 3.6}deg 360deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div style={{ width: 68, height: 68, borderRadius: 34, background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: LUX.ink, letterSpacing: -0.5 }}>{Math.round(paid)}%</span>
        <span style={{ fontSize: 8, color: LUX.faint, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 1 }}>peye</span>
      </div>
    </div>
  );
}

function CreditsMetrics({ analytics, ringTrace, rangeLabel }: { analytics: AnalyticsState; ringTrace: { paidPercent: number; unpaidPercent: number }; rangeLabel: string }) {
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: LUX.hairline, padding: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
        <div style={{ flex: 1, borderRadius: 12, padding: 12, backgroundColor: LUX.purpleBg, borderTopWidth: 3, borderTopColor: LUX.purple, borderTopStyle: "solid" }}>
          <div style={{ fontSize: 9, color: LUX.purpleDeep, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>Kredi Bay</div>
          <div style={{ fontWeight: 800, color: LUX.purpleDeep, fontSize: 17, marginTop: 6, letterSpacing: -0.4, ...monoStyle }}>{fmtHTG(analytics.creditGiven)}</div>
          <div style={{ fontSize: 9, color: LUX.purpleDeep, marginTop: 2, opacity: 0.75 }}>{rangeLabel.toLowerCase() === "tout tan" ? "tout aktivite" : "nan peryòd sa a"}</div>
        </div>
        <div style={{ flex: 1, borderRadius: 12, padding: 12, backgroundColor: LUX.greenBg, borderTopWidth: 3, borderTopColor: LUX.green, borderTopStyle: "solid" }}>
          <div style={{ fontSize: 9, color: LUX.greenDeep, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>Kredi Peye</div>
          <div style={{ fontWeight: 800, color: LUX.greenDeep, fontSize: 17, marginTop: 6, letterSpacing: -0.4, ...monoStyle }}>{fmtHTG(analytics.creditPaid)}</div>
          <div style={{ fontSize: 9, color: LUX.greenDeep, marginTop: 2, opacity: 0.75 }}>{fmtHTG(Math.max(0, analytics.creditGiven - analytics.creditPaid))} rete</div>
        </div>
        <div style={{ flex: 1, borderRadius: 12, padding: 12, backgroundColor: LUX.goldBg, borderTopWidth: 3, borderTopColor: LUX.gold, borderTopStyle: "solid" }}>
          <div style={{ fontSize: 9, color: LUX.goldDeep, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }}>Sòti</div>
          <div style={{ fontWeight: 800, color: LUX.goldDeep, fontSize: 17, marginTop: 6, letterSpacing: -0.4, ...monoStyle }}>{fmtHTG(analytics.totalOutstanding)}</div>
          <div style={{ fontSize: 9, color: LUX.goldDeep, marginTop: 2, opacity: 0.75 }}>ann dèt</div>
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: LUX.hairline, borderTopStyle: "solid", display: "flex", flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Donut paidPercent={ringTrace.paidPercent} unpaidPercent={ringTrace.unpaidPercent} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: LUX.green }} />
            <div style={{ fontSize: 12, color: LUX.body, fontWeight: 600 }}>Peye <span style={{ color: LUX.greenDeep, fontWeight: 800 }}>{Math.round(ringTrace.paidPercent)}%</span></div>
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: LUX.redBg }} />
            <div style={{ fontSize: 12, color: LUX.body, fontWeight: 600 }}>Pa peye <span style={{ color: LUX.redDeep, fontWeight: 800 }}>{Math.round(ringTrace.unpaidPercent)}%</span></div>
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <div style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: LUX.gold }} />
            <div style={{ fontSize: 12, color: LUX.body, fontWeight: 600 }}>Rète <span style={{ color: LUX.goldDeep, fontWeight: 800, ...monoStyle }}>{fmtHTG(analytics.totalOutstanding)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditsSearchBar({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  return (
    <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline2, borderRadius: 12, display: "flex", flexDirection: "row", alignItems: "center", padding: "0 12px" }}>
      <span style={{ fontSize: 14, color: LUX.body, fontWeight: 600 }}>⌕</span>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Chèche pa non, NIF/CIN, telefòn oswa adrès"
        style={{ flex: 1, padding: "12px 8px", background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: LUX.ink, fontFamily: "inherit" }}
      />
      {search.length > 0 && (
        <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: LUX.body, padding: 6, fontSize: 14, fontWeight: 600 }}>✕</button>
      )}
    </div>
  );
}

function CustomerSuggestions({ suggestions, onSelect }: { suggestions: any[]; onSelect: (c: any) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderRadius: 16 }}>
      {suggestions.map(c => (
        <button key={c.id} onClick={() => onSelect(c)} style={{ width: "100%", display: "block", textAlign: "left", padding: 12, borderBottomWidth: 1, borderBottomColor: LUX.surface2, borderBottomStyle: "solid", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: LUX.ink }}>{c.name}</div>
          <div style={{ fontSize: 11, color: LUX.muted, marginTop: 2 }}>{c.id_card_number || "Pa gen NIF/CIN"} • {c.phone || "Pa gen telefòn"}</div>
          <div style={{ fontSize: 11, color: LUX.faint, marginTop: 1 }}>{c.address || "Pa gen adrès"}</div>
        </button>
      ))}
    </div>
  );
}

function CreditsFilterChips({ view, setView }: { view: CreditsView; setView: (v: CreditsView) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {FILTER_CHIPS.map(chip => {
        const active = view === chip.id;
        const statusStyle =
          chip.id === "delinquent"
            ? { bg: LUX.redBg, border: LUX.redBd, text: LUX.redDeep }
            : chip.id === "current"
            ? { bg: LUX.surface, border: LUX.hairline2, text: LUX.ink }
            : chip.id === "paid"
            ? { bg: LUX.greenBg, border: LUX.greenBd, text: LUX.greenDeep }
            : { bg: LUX.surface2, border: LUX.hairline2, text: LUX.ink };
        return (
          <button
            key={chip.id}
            onClick={() => setView(chip.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              backgroundColor: active ? statusStyle.bg : "#fff",
              borderWidth: 1,
              borderColor: active ? statusStyle.border : LUX.hairline,
              borderStyle: "solid",
              minWidth: 64,
              fontWeight: active ? 700 : 500,
              fontSize: 12,
              color: active ? statusStyle.text : LUX.muted,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function CreditsEmptyState({ view }: { view: CreditsView }) {
  return (
    <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderRadius: 16, padding: 24, textAlign: "center" }}>
      <span style={{ color: LUX.faint, fontSize: 13, fontWeight: 500 }}>{view === "delinquent" ? "Pa gen dèt anreta." : view === "current" ? "Pa gen dèt Pako Rive." : view === "paid" ? "Pa gen dèt peye." : "Pa gen dèt."}</span>
    </div>
  );
}

function DebtCard({ debt: d, customer: cust, allPayments, isTablet, onPress }: { debt: any; customer?: any; allPayments: any[]; isTablet: boolean; onPress: () => void }) {
  const initialAmount = Number(d.amount || 0);
  const paymentsForCard = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id);
  const totalPaid = paymentsForCard.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, initialAmount - totalPaid);
  const isPaid = balance <= 0.01;
  const isOverdue = !isPaid && d.due_date && new Date(d.due_date) < new Date();
  const cardStatus = isPaid
    ? { dot: LUX.green, dotBg: LUX.greenBg, dotBd: LUX.greenBd, text: LUX.greenDeep, badgeText: LUX.greenDeep, label: "PAYE", border: LUX.greenBd, bar: LUX.green }
    : isOverdue
    ? { dot: LUX.red, dotBg: LUX.redBg, dotBd: LUX.redBd, text: LUX.redDeep, badgeText: LUX.redDeep, label: "AN RETA", border: "#ff002b", bar: LUX.red }
    : { dot: LUX.gold, dotBg: LUX.goldBg, dotBd: LUX.goldBd, text: LUX.ink, badgeText: LUX.goldDeep, label: "POKO RIVE", border: LUX.hairline, bar: LUX.gold };
  const pctPaid = initialAmount > 0 ? Math.min(100, Math.round((totalPaid / initialAmount) * 100)) : 0;
  const daysMeta = (() => {
    if (isPaid || !d.due_date) return null;
    const diff = Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86400000);
    if (diff < 0) return { text: `${Math.abs(diff)} jou reta`, color: LUX.redDeep };
    if (diff === 0) return { text: "Jodi a", color: LUX.goldDeep };
    return { text: `${diff} jou rete`, color: LUX.goldDeep };
  })();
  return (
    <button
      onClick={onPress}
      style={{
        width: "100%",
        textAlign: "left",
        fontFamily: "inherit",
        flex: isTablet ? 1 : undefined,
        backgroundColor: "#fff",
        borderRadius: 20,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: cardStatus.border,
        borderStyle: "solid",
        padding: 14,
        boxShadow: "0 3px 10px rgba(0,0,0,0.04)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: LUX.ink, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{cust?.name ?? "Kliyan enkoni"}</span>
            <span style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: cardStatus.dotBg, borderWidth: 1, borderColor: cardStatus.dotBd, borderStyle: "solid", borderRadius: 20, padding: "2px 8px" }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cardStatus.dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: cardStatus.badgeText, letterSpacing: 0.3 }}>{cardStatus.label}</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <span style={{ color: LUX.muted, fontSize: 11, fontWeight: 600 }}>{cust?.id_card_number || "—"}</span>
            <span style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: cardStatus.dot }} />
            <span style={{ color: cardStatus.text, fontSize: 11, fontWeight: 600 }}>{daysMeta ? daysMeta.text : d.due_date ? `Echèans ${new Date(d.due_date).toLocaleDateString()}` : "San echèans"}</span>
          </div>
          {cust?.phone ? <span style={{ color: LUX.faint, fontSize: 11, marginTop: 2, fontWeight: 500 }}>{cust.phone}</span> : null}
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: LUX.surface2, overflow: "hidden" }}>
              <div style={{ width: `${pctPaid}%`, height: 5, backgroundColor: cardStatus.bar }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: cardStatus.text }}>{pctPaid}%</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
          <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>Rès</span>
          <span style={{ fontWeight: 900, color: cardStatus.text, fontSize: 16, letterSpacing: -0.4, ...monoStyle }}>{fmtHTG(balance)}</span>
          <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: LUX.ink, fontWeight: 700 }}>Detay</span>
            <span style={{ fontSize: 12, color: cardStatus.dot, fontWeight: 800 }}>›</span>
          </span>
        </div>
      </div>
    </button>
  );
}

function DebtCustomerHeader({ customer, onClose }: { customer: any; onClose: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: LUX.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer?.name ?? "—"}</div>
        <div style={{ fontSize: 11, color: LUX.body, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer?.id_card_number || "—"} • {customer?.phone || "Pa gen telefòn"}</div>
        <div style={{ fontSize: 11, color: LUX.muted, fontWeight: 500, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer?.address || "Pa gen adrès"}</div>
        <div style={{ fontSize: 11, color: LUX.muted, marginTop: 1 }}>Limit {customer?.credit_limit == null ? "—" : `${fmt(customer.credit_limit)} HTG`} • Dèt total {customer ? <span style={monoStyle}>{fmtHTG(Number(customer.total_debt || 0))}</span> : "—"}</div>
      </div>
      <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LUX.surface2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 14, color: LUX.body, fontWeight: 700 }}>✕</span>
      </button>
    </div>
  );
}

function DebtDetailBlock({ debt: d, allPayments, allSaleItems, historyExpanded, articlesExpanded, onToggleHistory, onToggleArticles }: { debt: any; allPayments: any[]; allSaleItems: any[]; historyExpanded: boolean; articlesExpanded: boolean; onToggleHistory: () => void; onToggleArticles: () => void }) {
  const payments = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const initialAmount = Number(d.amount || 0);
  const paidDisplay = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const currentDue = Math.max(0, initialAmount - paidDisplay);
  const isPaid = currentDue <= 0.01;
  const isOverdue = !isPaid && d.due_date && new Date(d.due_date) < new Date();
  const saleItems = allSaleItems.filter(it => it.sale_id === d.sale_id);
  return (
    <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: isPaid ? LUX.greenBd : isOverdue ? LUX.redBd : LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ backgroundColor: isPaid ? LUX.greenBg : isOverdue ? LUX.redBg : LUX.goldBg, borderWidth: 1, borderColor: isPaid ? LUX.greenBd : isOverdue ? LUX.redBd : LUX.goldSoft, borderStyle: "solid", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700, color: isPaid ? LUX.greenDeep : isOverdue ? LUX.redDeep : LUX.goldDeep }}>{isPaid ? "Paye Deja" : isOverdue ? "Anreta" : "Pako Rive"}</span>
        <span style={{ fontSize: 10, color: LUX.faint, fontWeight: 500 }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}{d.due_date ? ` • Echèans ${new Date(d.due_date).toLocaleDateString()}` : ""}</span>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "row", gap: 8 }}>
        <div style={{ flex: 1, backgroundColor: LUX.surface, borderRadius: 16, padding: 10, textAlign: "center", borderWidth: 1, borderColor: LUX.surface2, borderStyle: "solid" }}>
          <div style={{ fontSize: 10, color: LUX.muted, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>Montan inisyal</div>
          <div style={{ fontSize: 13, color: LUX.ink, fontWeight: 800, marginTop: 4, ...monoStyle }}>{fmtHTG(initialAmount)}</div>
        </div>
        <div style={{ flex: 1, backgroundColor: currentDue <= 0.01 ? LUX.greenBg : LUX.goldBg, borderRadius: 16, padding: 10, textAlign: "center", borderWidth: 1, borderColor: currentDue <= 0.01 ? LUX.greenBd : LUX.goldSoft, borderStyle: "solid" }}>
          <div style={{ fontSize: 10, color: currentDue <= 0.01 ? LUX.greenDeep : LUX.goldDeep, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>Rès aktyèl</div>
          <div style={{ fontSize: 13, color: currentDue <= 0.01 ? LUX.greenDeep : LUX.goldDeep, fontWeight: 800, marginTop: 4, ...monoStyle }}>{fmtHTG(currentDue)}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "row", gap: 8 }}>
        <div style={{ flex: 1, backgroundColor: LUX.surface, borderRadius: 16, padding: 10, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: LUX.surface2, borderStyle: "solid" }}>
          <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Peye</span>
          <span style={{ fontSize: 12, color: LUX.greenDeep, fontWeight: 800, ...monoStyle }}>{fmtHTG(paidDisplay)}</span>
        </div>
        <div style={{ flex: 1, backgroundColor: LUX.surface, borderRadius: 16, padding: 10, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: LUX.surface2, borderStyle: "solid" }}>
          <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Fwa peye</span>
          <span style={{ fontSize: 12, color: LUX.ink, fontWeight: 800 }}>{payments.length}</span>
        </div>
      </div>
      <button onClick={onToggleHistory} style={{ marginTop: 10, width: "100%", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: LUX.body }}>Istwa peman {payments.length > 0 ? `• ${payments.length}` : ""}</span>
        <span style={{ fontSize: 12, color: LUX.body, fontWeight: 700 }}>{historyExpanded ? "▾ Kache" : "▸ Wè"}</span>
      </button>
      {historyExpanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.surface2, borderStyle: "solid", borderRadius: 16, padding: 8 }}>
          {payments.length === 0 ? (
            <span style={{ fontSize: 11, color: LUX.faint, textAlign: "center", padding: 8 }}>Poko gen peman pasyèl.</span>
          ) : (
            payments.map(p => (
              <div key={p.id} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottomWidth: 1, borderBottomColor: LUX.surface, borderBottomStyle: "solid" }}>
                <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LUX.green }} />
                  <span style={{ fontSize: 11, color: LUX.body, fontWeight: 500 }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: LUX.ink, ...monoStyle }}>{fmtHTG(Number(p.amount || 0))}</span>
              </div>
            ))
          )}
        </div>
      )}
      <button onClick={onToggleArticles} style={{ marginTop: 8, width: "100%", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: LUX.body }}>Atik yo {saleItems.length > 0 ? `• ${saleItems.length} atik` : ""}</span>
        <span style={{ fontSize: 12, color: LUX.body, fontWeight: 700 }}>{articlesExpanded ? "▾ Kache" : "▸ Wè"}</span>
      </button>
      {articlesExpanded && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.surface2, borderStyle: "solid", borderRadius: 16, padding: 8 }}>
          {saleItems.length === 0 ? (
            <span style={{ fontSize: 11, color: LUX.faint, textAlign: "center", padding: 8 }}>Poko gen detay atik pou vant sa — gade sale_items.</span>
          ) : (
            saleItems.map(it => (
              <div key={it.id} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottomWidth: 1, borderBottomColor: LUX.surface, borderBottomStyle: "solid" }}>
                <span style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: LUX.ink, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.product_name ?? it.product_id}</span>
                  <span style={{ fontSize: 11, color: LUX.muted }}>{it.quantity} × <span style={monoStyle}>{fmtHTG(Number(it.unit_price || 0))}</span></span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: LUX.ink, ...monoStyle }}>{fmtHTG(Number(it.line_total ?? it.quantity * it.unit_price))}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabletPageHeader({ filteredCount, openCount, canManageCustomer, onNewCreditPress }: { filteredCount: number; openCount: number; canManageCustomer: boolean; onNewCreditPress?: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: LUX.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>JESYON DÈT • PEMAN • RÈS</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: WEB.ink, letterSpacing: -0.5, marginTop: 4 }}>Kredi / Dèt</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
        {canManageCustomer && onNewCreditPress ? (
          <button onClick={onNewCreditPress} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: WEB.ink, borderWidth: 1, borderColor: "#3D3D40", borderStyle: "solid", borderRadius: 12, padding: "12px 16px", cursor: "pointer", boxShadow: "0 5px 10px rgba(0,0,0,0.18)", fontFamily: "inherit" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>＋ Nouvo Kredi</span>
          </button>
        ) : null}
        <span style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline2, borderStyle: "solid", borderRadius: 16, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: WEB.ink, letterSpacing: 0.2 }}>
          {filteredCount} dèt • {openCount} ouvè
        </span>
      </div>
    </div>
  );
}

function TabletAnalyticsCard({ analytics, ringTrace, range, setRange, filteredCount, openCount }: { analytics: AnalyticsState; ringTrace: { paidPercent: number; unpaidPercent: number }; range: RangeKey; setRange: (r: RangeKey) => void; filteredCount: number; openCount: number }) {
  const paidPct = Math.round(ringTrace.paidPercent);
  const unpaidPct = Math.round(ringTrace.unpaidPercent);
  return (
    <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#837b69", ...monoStyle }}>{filteredCount} dèt • {openCount} ouvè • {fmtHTG(analytics.totalOutstanding)} dwe</span>
        <span style={{ display: "flex", flexDirection: "row", backgroundColor: WEB.groupedBg, borderWidth: 1, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: 4, gap: 2 }}>
          {RANGE_OPTIONS.map(option => {
            const isSelected = range === option.key;
            return (
              <button key={option.key} onClick={() => setRange(option.key)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", backgroundColor: isSelected ? WEB.ink : "transparent", fontWeight: isSelected ? 700 : 500, fontSize: 11, color: isSelected ? "#fff" : LUX.muted, cursor: "pointer", fontFamily: "inherit" }}>
                {option.label}
              </button>
            );
          })}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "row", gap: 12, marginTop: 12 }}>
        <div style={{ flex: 1, backgroundColor: WEB.amberBg, borderWidth: 0.5, borderColor: WEB.amberBd, borderStyle: "solid", borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: WEB.amberLabel }}>KREDI BAY</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: WEB.amberValue, marginTop: 6, letterSpacing: -0.3, ...monoStyle }}>{fmtHTG(analytics.creditGiven)}</div>
          <div style={{ fontSize: 11, color: WEB.amberSub, marginTop: 2 }}>nan peryòd sa a</div>
        </div>
        <div style={{ flex: 1, backgroundColor: WEB.successBg, borderWidth: 0.5, borderColor: WEB.successBd, borderStyle: "solid", borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: WEB.successTx }}>KREDI PEYE</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: WEB.successDeep, marginTop: 6, letterSpacing: -0.3, ...monoStyle }}>{fmtHTG(analytics.creditPaid)}</div>
          <div style={{ fontSize: 11, color: WEB.successSub, marginTop: 2 }}>{paidPct}% ranbouse</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 14, padding: 12, marginTop: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: WEB.dotPink, borderStyle: "solid", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: WEB.successSub }}>{paidPct}%</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: WEB.ink }}>To ranbousman</div>
          <div style={{ marginTop: 6, height: 6, backgroundColor: WEB.trackBg, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.max(0, ringTrace.paidPercent))}%`, height: 6, backgroundColor: WEB.barGreen }} />
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
            <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: WEB.barGreen }} />
              <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Peye {paidPct}%</span>
            </span>
            <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: WEB.dotPink }} />
              <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Pa peye {unpaidPct}%</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabletDebtRow({ debt: d, customer: cust, allPayments, selected, onPress }: { debt: any; customer?: any; allPayments: any[]; selected: boolean; onPress: () => void }) {
  const initialAmount = Number(d.amount || 0);
  const paymentsForCard = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id);
  const totalPaid = paymentsForCard.reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.max(0, initialAmount - totalPaid);
  const isPaid = balance <= 0.01;
  const isOverdue = !isPaid && d.due_date && new Date(d.due_date) < new Date();
  const cardBg = selected ? WEB.ink : isPaid ? WEB.successBg : isOverdue ? WEB.dangerBg : WEB.warnBg;
  const cardBd = selected ? WEB.ink : isPaid ? WEB.successBd : isOverdue ? WEB.dangerBd : WEB.warnBd;
  const strongTx = selected ? "#FFFFFF" : isPaid ? WEB.successTx : isOverdue ? WEB.dangerTx : WEB.warnTx;
  const softTx = selected ? "rgba(255,255,255,0.64)" : "#837b69";
  const faintTx = selected ? "rgba(255,255,255,0.54)" : "#837b69";
  const barColor = isPaid ? WEB.barGreen : isOverdue ? WEB.barRed : WEB.barAmber;
  const pctPaid = initialAmount > 0 ? Math.min(100, Math.round((totalPaid / initialAmount) * 100)) : 0;
  const dueLabel = d.due_date ? new Date(d.due_date).toLocaleDateString() : "—";
  const pillBg = selected ? "rgba(255,255,255,0.14)" : isPaid ? WEB.successBg : isOverdue ? WEB.dangerBg : WEB.warnBg;
  const pillBd = selected ? "rgba(255,255,255,0.18)" : cardBd;
  const pillTx = selected ? "#fff" : strongTx;
  const avatarLetter = (cust?.name ?? "K")?.charAt(0)?.toUpperCase() ?? "K";
  return (
    <button onClick={onPress} style={{ width: "100%", textAlign: "left", fontFamily: "inherit", backgroundColor: cardBg, borderWidth: 0.5, borderColor: cardBd, borderStyle: "solid", borderRadius: 16, padding: 14, marginBottom: 10, cursor: "pointer", boxShadow: selected ? "0 4px 16px rgba(0,0,0,0.12)" : "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: selected ? WEB.ink : strongTx, flexShrink: 0 }}>{avatarLetter}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: selected ? "#fff" : WEB.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{cust?.name ?? "Kliyan enkoni"}</span>
            <span style={{ backgroundColor: pillBg, borderWidth: 0.5, borderColor: pillBd, borderStyle: "solid", padding: "2px 6px", borderRadius: 999, fontSize: 10, fontWeight: 700, color: pillTx }}>{isPaid ? "PAYE" : isOverdue ? "AN RETA" : "POKO RIVE"}</span>
          </span>
          <span style={{ fontSize: 11, color: softTx, marginTop: 2, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cust?.id_card_number || "—"} • {cust?.phone || "Pa gen telefòn"}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: selected ? "#FFFFFF" : strongTx, ...monoStyle }}>{fmtHTG(balance)}</span>
          <span style={{ fontSize: 11, color: faintTx, marginTop: 1, ...monoStyle }}>sou {fmtHTG(initialAmount)}</span>
        </span>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "row", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: faintTx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70%" }}>{d.sale_id || d.id} • Echèans {dueLabel}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: selected ? "#fff" : WEB.ink }}>{pctPaid}% peye</span>
      </div>
      <div style={{ marginTop: 8, height: 4, backgroundColor: selected ? "rgba(255,255,255,0.14)" : "#FFFFFF", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pctPaid}%`, height: 4, backgroundColor: barColor }} />
      </div>
    </button>
  );
}

function TabletInspector({ customer, debt: d, allPayments, allSaleItems, historyExpanded, articlesExpanded, onToggleHistory, onToggleArticles, onClose, onPayNow }: { customer: any; debt: any; allPayments: any[]; allSaleItems: any[]; historyExpanded: boolean; articlesExpanded: boolean; onToggleHistory: () => void; onToggleArticles: () => void; onClose: () => void; onPayNow: () => void }) {
  const payments = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const initialAmount = Number(d.amount || 0);
  const paidDisplay = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const currentDue = Math.max(0, initialAmount - paidDisplay);
  const isPaid = currentDue <= 0.01;
  const isOverdue = !isPaid && d.due_date && new Date(d.due_date) < new Date();
  const saleItems = allSaleItems.filter(it => it.sale_id === d.sale_id);
  const statusBg = isPaid ? WEB.successBg : isOverdue ? WEB.dangerBg : WEB.warnBg;
  const statusBd = isPaid ? WEB.successBd : isOverdue ? WEB.dangerBd : WEB.warnBd;
  const statusTx = isPaid ? WEB.successTx : isOverdue ? WEB.dangerTx : WEB.warnTx;
  const dueLabel = d.due_date ? new Date(d.due_date).toLocaleDateString() : "—";
  return (
    <div style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", overflow: "hidden", position: "sticky", top: 0 }}>
      <div style={{ padding: 16, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: WEB.groupedBd, borderBottomStyle: "solid", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: WEB.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer?.name ?? "—"}</div>
          <div style={{ fontSize: 11, color: LUX.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{customer?.id_card_number || "—"} • {customer?.phone || "Pa gen telefòn"} • Limit {customer?.credit_limit == null ? "—" : `${fmt(customer.credit_limit)} HTG`}</div>
        </div>
        <span style={{ backgroundColor: statusBg, borderWidth: 0.5, borderColor: statusBd, borderStyle: "solid", borderRadius: 999, padding: "4px 10px", fontSize: 10, fontWeight: 800, color: statusTx, letterSpacing: 0.4, flexShrink: 0 }}>{isPaid ? "PAYE" : isOverdue ? "AN RETA" : "POKO RIVE"}</span>
      </div>
      <div style={{ padding: 16, paddingBottom: 8, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "row", gap: 10 }}>
          <div style={{ flex: 1, backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 14, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#837b69" }}>MONTAN INISYAL</div>
            <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4, color: WEB.ink, ...monoStyle }}>{fmtHTG(initialAmount)}</div>
          </div>
          <div style={{ flex: 1, backgroundColor: isPaid ? WEB.successBg : isOverdue ? WEB.dangerBg : WEB.warnBg, borderWidth: 0.5, borderColor: isPaid ? WEB.successBd : isOverdue ? WEB.dangerBd : WEB.warnBd, borderStyle: "solid", borderRadius: 14, padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: statusTx }}>RÈS AKTYÈL</div>
            <div style={{ fontWeight: 800, fontSize: 15, color: statusTx, marginTop: 4, ...monoStyle }}>{fmtHTG(currentDue)}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
          <div style={{ flex: 1, backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: 10, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Peye</span>
            <span style={{ fontWeight: 800, fontSize: 12, color: WEB.successSub, ...monoStyle }}>{fmtHTG(paidDisplay)}</span>
          </div>
          <div style={{ flex: 1, backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: 10, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>Echèans</span>
            <span style={{ fontWeight: 700, fontSize: 12, color: WEB.ink }}>{dueLabel}</span>
          </div>
        </div>
        <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: WEB.ink }}>
              Istwa peman {payments.length > 0 ? <span style={{ fontSize: 10, fontWeight: 800, color: LUX.muted, ...monoStyle }}>• {payments.length} resi</span> : null}
            </span>
            <button onClick={onToggleHistory} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: LUX.body, fontWeight: 700, fontFamily: "inherit" }}>{historyExpanded ? "▾ Kache" : "▸ Wè"}</button>
          </div>
          {historyExpanded ? (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {payments.length === 0 ? (
                <div style={{ backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: 12, color: "#837b69", fontSize: 12, textAlign: "center" }}>Poko gen peman pasyèl.</div>
              ) : (
                payments.map(p => (
                  <div key={p.id} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: LUX.body, flex: 1, paddingRight: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"} • {p.payment_method || "Kach"} • {p.receipt_number || p.receipt || "—"}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: WEB.ink, ...monoStyle }}>{fmtHTG(Number(p.amount || 0))}</span>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
        <button onClick={onToggleArticles} style={{ width: "100%", display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: WEB.groupedBg, borderWidth: 0.5, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: LUX.body }}>Atik yo {saleItems.length > 0 ? `• ${saleItems.length} atik` : ""}</span>
          <span style={{ fontSize: 12, color: LUX.body, fontWeight: 700 }}>{articlesExpanded ? "▾ Kache" : "▸ Wè"}</span>
        </button>
        {articlesExpanded && (
          <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#fff", borderWidth: 1, borderColor: WEB.groupedBd, borderStyle: "solid", borderRadius: 12, padding: "0 8px", overflow: "hidden" }}>
            {saleItems.length === 0 ? (
              <span style={{ fontSize: 11, color: LUX.faint, textAlign: "center", padding: 12 }}>Poko gen detay atik pou vant sa — gade sale_items.</span>
            ) : (
              saleItems.map((it, idx) => (
                <div key={it.id} style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottomWidth: idx === saleItems.length - 1 ? 0 : 0.5, borderBottomColor: WEB.groupedBd, borderBottomStyle: "solid" }}>
                  <span style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: WEB.ink, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.product_name ?? it.product_id}</span>
                    <span style={{ fontSize: 11, color: LUX.muted }}>{it.quantity} × <span style={monoStyle}>{fmtHTG(Number(it.unit_price || 0))}</span></span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: WEB.ink, ...monoStyle }}>{fmtHTG(Number(it.line_total ?? it.quantity * it.unit_price))}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div style={{ padding: 16, paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onPayNow} style={{ width: "100%", backgroundColor: WEB.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 12, padding: "13px 0", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 8px rgba(29,29,31,0.25)" }}>
          <span style={{ fontWeight: 800, color: LUX.goldSoft, fontSize: 13, letterSpacing: 0.2 }}>PEYE KOUNYE A</span>
        </button>
        <button onClick={onClose} style={{ width: "100%", backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 12, padding: "12px 0", cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Fèmen</span>
        </button>
      </div>
    </div>
  );
}

const STORE_ID = "demo-store-id";

export function CreditsPage() {
  const navigate = useNavigate();
  const { width, isTablet, isLandscape, padH } = useResponsive();
  const { user, cached } = useAuthStore();
  const role = user?.role ?? cached?.role ?? "cashier";
  const myId = user?.id ?? null;
  const myName = user?.name ?? cached?.name ?? role;
  const storeName = user?.store ?? cached?.store ?? "Jesyon Magazen";
  const wide = isTablet && isLandscape && width >= 900;

  const [customers, setCustomers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [range, setRange] = useState<RangeKey>("28d");
  const [showPay, setShowPay] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [view, setView] = useState<CreditsView>("all");
  const [allDebts, setAllDebts] = useState<any[]>([]);
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [modalCustomer, setModalCustomer] = useState<any | null>(null);
  const [allPayments, setAllPayments] = useState<any[]>([]);
  const [allSaleItems, setAllSaleItems] = useState<any[]>([]);
  const [expandedHistoryDebtId, setExpandedHistoryDebtId] = useState<string | null>(null);
  const [expandedArticlesDebtId, setExpandedArticlesDebtId] = useState<string | null>(null);
  const [modalPayStep, setModalPayStep] = useState<"details" | "choice" | "pay">("details");
  const [modalPayDebt, setModalPayDebt] = useState<any | null>(null);
  const [modalPayAmount, setModalPayAmount] = useState("");
  const [modalSelectedDebtId, setModalSelectedDebtId] = useState<string | null>(null);
  const [showNewCreditModal, setShowNewCreditModal] = useState(false);
  const [newCreditSearch, setNewCreditSearch] = useState("");
  const [isNewCreditFlow, setIsNewCreditFlow] = useState(false);
  const [search, setSearch] = useState("");
  const [payDebtId, setPayDebtId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payIdCard, setPayIdCard] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
  const [analytics, setAnalytics] = useState<AnalyticsState>({ creditGiven: 0, creditPaid: 0, paidPercent: 0, unpaidPercent: 0, totalOutstanding: 0 });
  const [lastReceipts, setLastReceipts] = useState<{ customer: ReceiptData; store: ReceiptData } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  const canManageCustomer = role !== "cashier";

  async function load() {
    try {
      const db = await getDb();
      const custsRaw = (await db.getAllAsync("SELECT * FROM customers")) as any[];
      const custs = Array.from(new Map(custsRaw.map((c: any) => [c.id, c] as const)).values());
      const allCredits = (await db.getAllAsync("SELECT * FROM credits")) as any[];
      const paymentsAll = (await db.getAllAsync("SELECT * FROM credit_payments")) as any[];
      let saleItemsAll: any[] = [];
      try { saleItemsAll = (await db.getAllAsync("SELECT * FROM sale_items")) as any[]; } catch { saleItemsAll = []; }
      const openDebts = allCredits.filter(d => Number(d.balance) > 0);

      setCustomers(custs);
      setDebts(openDebts);
      setAllDebts(allCredits);
      setAllPayments(paymentsAll);
      setAllSaleItems(saleItemsAll);

      const creditGiven = allCredits
        .filter(d => isWithinRange(d.created_at ?? d.updated_at ?? null, range))
        .reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const creditPaid = paymentsAll
        .filter(p => isWithinRange(p.created_at ?? null, range))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalOutstanding = allCredits
        .filter(d => isWithinRange(d.created_at ?? d.updated_at ?? null, range))
        .reduce((sum, d) => sum + Number(d.balance || 0), 0);
      const paidShare = creditGiven > 0 ? (creditPaid / creditGiven) * 100 : 0;
      const unpaidShare = 100 - paidShare;

      setAnalytics({
        creditGiven,
        creditPaid,
        paidPercent: Number.isFinite(paidShare) ? paidShare : 0,
        unpaidPercent: Number.isFinite(unpaidShare) ? unpaidShare : 0,
        totalOutstanding,
      });
    } catch (e) {
      console.log("[Credits load] failed:", e);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const openDebts = debts.filter(d => Number(d.balance) > 0);
  const getComputedDue = (debt: any) => {
    const paid = allPayments.filter(p => p.debt_id === debt.id || p.credit_id === debt.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    return Math.max(0, Number(debt.amount || 0) - paid);
  };

  function openDebtModal(c: any, debtId?: string) {
    setModalCustomer(c);
    setModalSelectedDebtId(debtId ?? null);
    setExpandedHistoryDebtId(null);
    setExpandedArticlesDebtId(null);
    setModalPayStep("details");
    setModalPayDebt(null);
    setModalPayAmount("");
    setShowDebtModal(true);
  }
  function closeDebtModal() {
    setShowDebtModal(false);
    setExpandedHistoryDebtId(null);
    setExpandedArticlesDebtId(null);
    setModalSelectedDebtId(null);
    setModalPayStep("details");
    setModalPayDebt(null);
    setModalPayAmount("");
  }

  async function showPaymentReceipt(p: { payId: string; receiptNumber: string; debt: any; cust: any; amount: number; finalBalance: number; createdAt: string; paymentMethod: string; previousBalance?: number }) {
    const receipts = buildCreditPaymentReceipts({
      payId: p.payId,
      receiptNumber: p.receiptNumber,
      debtId: p.debt.id,
      storeName,
      createdAt: p.createdAt,
      cashier: { id: myId, name: myName, role: user?.role ?? role },
      customer: { name: p.cust.name, idCard: p.cust.id_card_number ?? null, phone: p.cust.phone ?? null },
      debtTotal: Number(p.debt.amount),
      previousBalance: p.previousBalance ?? Number(p.debt.balance ?? p.debt.amount),
      amount: p.amount,
      finalBalance: p.finalBalance,
      paymentMethod: p.paymentMethod,
      dueDate: p.debt.due_date ?? null,
    });
    try {
      const db = await getDb();
      for (const r of [receipts.customer, receipts.store]) {
        await db.runAsync(
          "INSERT INTO receipts (id,store_id,sale_id,copy_type,receipt_number,sale_number,cashier_id,cashier_name,cashier_role,content,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [r.id, STORE_ID, p.payId, r.copyType, r.receiptNumber, p.debt.id, r.cashier.id, r.cashier.name, r.cashier.role, JSON.stringify(r), r.createdAt]
        );
      }
    } catch {}
    setLastReceipts(receipts);
    setTimeout(() => setShowReceipt(true), 380);
  }

  async function handleCreateCustomerFromSearch() {
    if (!canManageCustomer) {
      toast("Pa gen dwa", "Kesye ka sèlman li lis kliyan yo. Li pa ka kreye nouvo kliyan.", "error");
      return;
    }
    if (!newCustomer.name.trim()) { toast("Non obligatwa"); return; }
    if (!newCustomer.id_card_number.trim()) { toast("NIF/CIN obligatwa", "Nimewo kat idantite obligatwa pou distenge kliyan ki gen menm non.", "warn"); return; }
    try {
      const db = await getDb();
      const parsedLimit = newCustomer.credit_limit.trim() === "" ? null : Number(newCustomer.credit_limit);
      if (newCustomer.credit_limit.trim() !== "" && (parsedLimit === null || Number.isNaN(parsedLimit) || parsedLimit < 0)) {
        toast("Limit kredi pa valab", "", "error");
        return;
      }
      const customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        store_id: "demo-store-id",
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        id_card_number: newCustomer.id_card_number.trim(),
        total_debt: 0,
        credit_limit: parsedLimit,
        credit_limit_source: parsedLimit !== null ? "manual" : null,
        is_high_risk: false,
        open_debt_count: 0,
        created_at: new Date().toISOString(),
      };
      await db.runAsync(
        "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [customer.id, customer.store_id, customer.name, customer.phone, customer.address, customer.id_card_number, customer.total_debt, customer.credit_limit, customer.credit_limit_source, customer.is_high_risk ? 1 : 0, customer.open_debt_count]
      );
      setCustomers(prev => {
        const map = new Map(prev.map(c => [c.id, c] as const));
        if (!map.has(customer.id)) return [customer, ...prev];
        return prev;
      });
      setSearch(customer.name);
      setShowAddCustomer(false);
      setNewCustomer({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
      toast("Kliyan ajoute", `${customer.name} anrejistre avèk NIF/CIN ${customer.id_card_number}.`, "success");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Ajoute kliyan echwe", "error");
    }
  }

  async function handlePay() {
    if (!payDebtId.trim()) { toast("Debt ID obligatwa", "Kliyan bay Debt ID li (eg. debt-1) pou peye", "warn"); return; }
    const debt = debts.find(d => d.id === payDebtId.trim());
    if (!debt) { toast("Debt ID pa jwenn", `Pa gen dèt ak ID ${payDebtId}`); return; }
    const cust = customers.find(c => c.id === debt.customer_id);
    if (!cust) { toast("Kliyan pa jwenn", "Peye dèt sa a pa asosye ak okenn kliyan valab", "warn"); return; }
    if (payIdCard.trim() && cust.id_card_number !== payIdCard.trim()) {
      toast("ID pa koresponn", `Kat ${payIdCard} pa koresponn ak kliyan ${cust.name} (${cust.id_card_number}) — verifye kat idantite`, "error");
      return;
    }
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) { toast("Montan pa valab"); return; }
    if (amt > Number(debt.balance)) { toast("Montan twòp", `Dèt sa a se sèlman ${fmtHTG(Number(debt.balance))}`); return; }
    try {
      const db = await getDb();
      const receipt = `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const payId = `pay-${Date.now()}`;
      const createdAt = new Date().toISOString();
      await db.runAsync("INSERT INTO credit_payments (id, store_id, credit_id, debt_id, amount, payment_method, receipt_number, created_at, collected_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [payId, debt.store_id, debt.id, debt.id, amt, "cash", receipt, createdAt, user?.id ?? null]);
      const newPaid = Number(debt.amount_paid) + amt;
      const newBal = Number(debt.amount) - newPaid;
      const finalBalance = Math.max(0, newBal);
      await db.runAsync("UPDATE credits SET amount_paid = ?, balance = ?, status = ? WHERE id = ?", [newPaid, finalBalance, finalBalance <= 0 ? "paid" : "partial", debt.id]);
      const newTotal = Math.max(0, Number(cust.total_debt) - amt);
      await db.runAsync("UPDATE customers SET total_debt = ?, is_high_risk = ? WHERE id = ?", [newTotal, newTotal > 0 ? 1 : 0, cust.id]);

      const wasOverdue = debt.due_date && new Date(debt.due_date) < new Date();
      const existingLimit = cust.credit_limit === null || cust.credit_limit === undefined || cust.credit_limit === 0 ? null : Number(cust.credit_limit);
      if (wasOverdue && finalBalance === 0) {
        const overdueAmount = Number(debt.amount) - amt;
        const penaltyCut = existingLimit !== null ? Math.max(0, existingLimit * 0.25) : Math.max(0, overdueAmount * 0.25);
        const nextLimit = existingLimit !== null ? Math.max(0, existingLimit - penaltyCut) : Math.max(0, overdueAmount * 0.75);
        await db.runAsync("UPDATE customers SET credit_limit = ?, credit_limit_source = ? WHERE id = ?", [nextLimit, "auto", cust.id]);
        toast("Limit otomatik redwi", `Peman dèt fini. Limit ${cust.name} redwi a ${fmtHTG(nextLimit)} (25% pou reta san avi).`, "warn");
      }

      setPayDebtId(""); setPayAmount(""); setPayIdCard(""); setShowPay(false);
      await showPaymentReceipt({ payId, receiptNumber: receipt, debt, cust, amount: amt, finalBalance, createdAt, paymentMethod: "cash" });
      load();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Peman echwe", "error");
    }
  }

  async function processModalPayment(targetDebt: any, amount: number) {
    if (!modalCustomer) return;
    const cust = customers.find(c => c.id === targetDebt.customer_id) || modalCustomer;
    if (!cust) { toast("Kliyan pa jwenn"); return; }
    if (amount <= 0) { toast("Montan pa valab"); return; }
    const paidForTarget = allPayments.filter(p => p.debt_id === targetDebt.id || p.credit_id === targetDebt.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const computedDue = Math.max(0, Number(targetDebt.amount || 0) - paidForTarget);
    if (amount > computedDue) { toast("Montan twòp", `Rès dèt sa a se sèlman ${fmtHTG(computedDue)}`); return; }
    try {
      const db = await getDb();
      const receipt = `REC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const payId = `pay-${Date.now()}`;
      const createdAt = new Date().toISOString();
      await db.runAsync("INSERT INTO credit_payments (id, store_id, credit_id, debt_id, amount, payment_method, receipt_number, created_at, collected_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [payId, targetDebt.store_id, targetDebt.id, targetDebt.id, amount, "cash", receipt, createdAt, user?.id ?? null]);
      const newPaid = paidForTarget + amount;
      const newBal = Number(targetDebt.amount) - newPaid;
      const finalBalance = Math.max(0, newBal);
      await db.runAsync("UPDATE credits SET amount_paid = ?, balance = ?, status = ? WHERE id = ?", [newPaid, finalBalance, finalBalance <= 0 ? "paid" : "partial", targetDebt.id]);
      const newTotal = Math.max(0, Number(cust.total_debt) - amount);
      await db.runAsync("UPDATE customers SET total_debt = ?, is_high_risk = ? WHERE id = ?", [newTotal, newTotal > 0 ? 1 : 0, cust.id]);
      const wasOverdue = targetDebt.due_date && new Date(targetDebt.due_date) < new Date();
      const existingLimit = cust.credit_limit === null || cust.credit_limit === undefined || cust.credit_limit === 0 ? null : Number(cust.credit_limit);
      if (wasOverdue && finalBalance === 0) {
        const overdueAmount = Number(targetDebt.amount) - amount;
        const penaltyCut = existingLimit !== null ? Math.max(0, existingLimit * 0.25) : Math.max(0, overdueAmount * 0.25);
        const nextLimit = existingLimit !== null ? Math.max(0, existingLimit - penaltyCut) : Math.max(0, overdueAmount * 0.75);
        await db.runAsync("UPDATE customers SET credit_limit = ?, credit_limit_source = ? WHERE id = ?", [nextLimit, "auto", cust.id]);
      }
      closeDebtModal();
      await showPaymentReceipt({ payId, receiptNumber: receipt, debt: targetDebt, cust, amount, finalBalance, createdAt, paymentMethod: "cash", previousBalance: Number(computedDue) });
      load();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Peman echwe", "error");
    }
  }

  function handleModalPayNowPress() {
    if (!modalCustomer || !modalSelectedDebtId) { toast("Pa gen dèt chwazi"); return; }
    const targetDebt = allDebts.find(d => d.id === modalSelectedDebtId);
    if (!targetDebt) { toast("Dèt pa jwenn"); return; }
    const paidForTarget = allPayments.filter(p => p.debt_id === targetDebt.id || p.credit_id === targetDebt.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const balance = Math.max(0, Number(targetDebt.amount || 0) - paidForTarget);
    if (balance <= 0.01) { toast("Deja peye", "Dèt sa a peye deja nèt."); return; }
    if (role === "cashier") {
      processModalPayment(targetDebt, balance);
    } else {
      setModalPayDebt(targetDebt);
      setModalPayAmount("");
      setModalPayStep("choice");
    }
  }

  async function handleModalConfirmPay(payFull: boolean = false) {
    if (!modalPayDebt) return;
    const paidForPayDebt = allPayments.filter(p => p.debt_id === modalPayDebt.id || p.credit_id === modalPayDebt.id).reduce((s, p) => s + Number(p.amount || 0), 0);
    const balance = Math.max(0, Number(modalPayDebt.amount || 0) - paidForPayDebt);
    const amt = payFull ? balance : parseFloat(modalPayAmount) || 0;
    if (amt <= 0) { toast("Montan pa valab"); return; }
    if (amt > balance) { toast("Montan twòp", `Ou pa ka peye plis pase ${fmtHTG(balance)}`); return; }
    await processModalPayment(modalPayDebt, amt);
  }

  const newCreditQuery = newCreditSearch.trim().toLowerCase();
  const filteredNewCreditCustomers = useMemo(() => {
    if (!newCreditQuery) return customers.slice(0, 20);
    return customers.filter(c => {
      const name = (c.name ?? "").toLowerCase();
      const idCard = (c.id_card_number ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const address = (c.address ?? "").toLowerCase();
      return name.includes(newCreditQuery) || idCard.includes(newCreditQuery) || phone.includes(newCreditQuery) || address.includes(newCreditQuery);
    }).slice(0, 20);
  }, [customers, newCreditQuery]);

  function handleSelectNewCreditCustomer(c: any) {
    setShowNewCreditModal(false);
    setNewCreditSearch("");
    navigate(`/pos?customer=${encodeURIComponent(c.id)}&credit=1`);
  }

  async function handleCreateNewCreditCustomer() {
    if (!canManageCustomer) { toast("Pa gen dwa", "Kesye ka sèlman li lis kliyan yo. Li pa ka kreye nouvo kliyan.", "error"); return; }
    if (!newCustomer.name.trim()) { toast("Non obligatwa"); return; }
    if (!newCustomer.id_card_number.trim()) { toast("NIF/CIN obligatwa", "Nimewo kat idantite obligatwa pou distenge kliyan ki gen menm non.", "warn"); return; }
    try {
      const db = await getDb();
      const parsedLimit = newCustomer.credit_limit.trim() === "" ? null : Number(newCustomer.credit_limit);
      if (newCustomer.credit_limit.trim() !== "" && (parsedLimit === null || Number.isNaN(parsedLimit) || parsedLimit < 0)) { toast("Limit kredi pa valab", "", "error"); return; }
      const customer = {
        id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        store_id: "demo-store-id",
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        id_card_number: newCustomer.id_card_number.trim(),
        total_debt: 0,
        credit_limit: parsedLimit,
        credit_limit_source: parsedLimit !== null ? "manual" : null,
        is_high_risk: false,
        open_debt_count: 0,
        created_at: new Date().toISOString(),
      };
      await db.runAsync(
        "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [customer.id, customer.store_id, customer.name, customer.phone, customer.address, customer.id_card_number, customer.total_debt, customer.credit_limit, customer.credit_limit_source, customer.is_high_risk ? 1 : 0, customer.open_debt_count]
      );
      setCustomers(prev => {
        const map = new Map(prev.map(c => [c.id, c] as const));
        if (!map.has(customer.id)) return [customer, ...prev];
        return prev;
      });
      setShowNewCreditModal(false);
      setShowAddCustomer(false);
      setIsNewCreditFlow(false);
      setNewCustomer({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
      setNewCreditSearch("");
      toast("Kliyan kreye", `${customer.name} • ${customer.id_card_number} — ap ale nan lavant`, "success");
      navigate(`/pos?customer=${encodeURIComponent(customer.id)}&credit=1`);
    } catch (e: any) {
      toast("Erè", e?.message ?? "Kreye kliyan echwe", "error");
    }
  }

  const query = search.trim().toLowerCase();
  const customerSuggestions = query
    ? customers.filter(c => {
        const name = (c.name ?? "").toLowerCase();
        const idCard = (c.id_card_number ?? "").toLowerCase();
        const phone = (c.phone ?? "").toLowerCase();
        const address = (c.address ?? "").toLowerCase();
        return name.includes(query) || idCard.includes(query) || phone.includes(query) || address.includes(query);
      }).slice(0, 8)
    : [];

  const filteredDebts = useMemo(() => {
    const q = query;
    const getCurrentDue = (d: any) => {
      const paid = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      return Math.max(0, Number(d.amount || 0) - paid);
    };
    const base = (() => {
      if (view === "paid") return allDebts.filter(d => getCurrentDue(d) <= 0.01);
      if (view === "delinquent") return allDebts.filter(d => getCurrentDue(d) > 0.01 && d.due_date && new Date(d.due_date) < new Date());
      if (view === "current") return allDebts.filter(d => getCurrentDue(d) > 0.01 && (!d.due_date || new Date(d.due_date) >= new Date()));
      return allDebts.filter(d => getCurrentDue(d) > 0.01);
    })();
    if (!q) return base;
    return base.filter(d => {
      const cust = customers.find(c => c.id === d.customer_id);
      const custName = (cust?.name ?? "").toLowerCase();
      const custIdCard = (cust?.id_card_number ?? "").toLowerCase();
      const custPhone = (cust?.phone ?? "").toLowerCase();
      const custAddress = (cust?.address ?? "").toLowerCase();
      const debtId = (d.id ?? "").toLowerCase();
      const saleId = (d.sale_id ?? "").toLowerCase();
      return custName.includes(q) || custIdCard.includes(q) || custPhone.includes(q) || custAddress.includes(q) || debtId.includes(q) || saleId.includes(q);
    });
  }, [customers, allDebts, allPayments, view, query]);

  const ringTrace = useMemo(() => ({
    paidPercent: Math.min(100, Math.max(0, analytics.paidPercent)),
    unpaidPercent: Math.min(100, Math.max(0, analytics.unpaidPercent)),
  }), [analytics.paidPercent, analytics.unpaidPercent]);

  const rangeLabel = RANGE_OPTIONS.find(o => o.key === range)?.label ?? "";

  const selectedDebt = modalSelectedDebtId ? allDebts.find(dd => dd.id === modalSelectedDebtId) : null;

  const handleOpenFromRow = (d: any) => {
    const cust = customers.find(c => c.id === d.customer_id);
    if (cust) openDebtModal(cust, d.id);
    else {
      const paidForFallback = allPayments.filter(p => p.debt_id === d.id || p.credit_id === d.id).reduce((s, p) => s + Number(p.amount || 0), 0);
      const fallbackBalance = Math.max(0, Number(d.amount || 0) - paidForFallback);
      openDebtModal({ id: d.customer_id, name: "Enkoni", id_card_number: "—", phone: "—", total_debt: fallbackBalance, credit_limit: null }, d.id);
    }
  };

  const modalContent = (() => {
    if (modalPayStep === "details") {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <DebtCustomerHeader customer={modalCustomer} onClose={closeDebtModal} />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10, maxHeight: 460, overflowY: "auto", paddingBottom: 24 }}>
            {(() => {
              if (!modalCustomer) return <span style={{ color: LUX.faint, textAlign: "center", marginTop: 24, fontSize: 12 }}>Pa gen kliyan chwazi.</span>;
              if (!selectedDebt) return <div style={{ backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 16, textAlign: "center" }}><span style={{ color: LUX.muted, fontSize: 12, fontWeight: 600 }}>Pa gen dèt chwazi.</span></div>;
              return (
                <DebtDetailBlock
                  debt={selectedDebt}
                  allPayments={allPayments}
                  allSaleItems={allSaleItems}
                  historyExpanded={expandedHistoryDebtId === selectedDebt.id}
                  articlesExpanded={expandedArticlesDebtId === selectedDebt.id}
                  onToggleHistory={() => setExpandedHistoryDebtId(expandedHistoryDebtId === selectedDebt.id ? null : selectedDebt.id)}
                  onToggleArticles={() => setExpandedArticlesDebtId(expandedArticlesDebtId === selectedDebt.id ? null : selectedDebt.id)}
                />
              );
            })()}
          </div>
          <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 12 }}>
            <button onClick={closeDebtModal} style={{ flex: 1, backgroundColor: LUX.surface2, borderRadius: 16, padding: "13px 0", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Fèmen</span>
            </button>
            <button onClick={handleModalPayNowPress} style={{ flex: 1, backgroundColor: LUX.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, padding: "13px 0", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 8px rgba(29,29,31,0.25)" }}>
              <span style={{ fontWeight: 800, color: LUX.goldSoft, fontSize: 13, letterSpacing: 0.2 }}>PEYE KOUNYE A</span>
            </button>
          </div>
        </div>
      );
    }
    if (modalPayStep === "choice") {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <button onClick={() => setModalPayStep("details")} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LUX.surface2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: LUX.body }}>‹</span></button>
            <span style={{ fontWeight: 800, fontSize: 15, color: LUX.ink }}>Peye dèt</span>
            <div style={{ flex: 1 }} />
            <button onClick={closeDebtModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LUX.surface2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: LUX.body, fontWeight: 700 }}>✕</span></button>
          </div>
          {modalPayDebt && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ backgroundColor: LUX.goldBg, borderWidth: 1, borderColor: LUX.goldSoft, borderStyle: "solid", borderRadius: 16, padding: 12, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1, paddingRight: 12 }}>
                  <div style={{ fontSize: 11, color: LUX.body, fontWeight: 600, ...monoStyle }}>Due {fmtHTG(getComputedDue(modalPayDebt))} • Inisyal {fmtHTG(Number(modalPayDebt.amount))}</div>
                  <div style={{ fontSize: 11, color: LUX.muted, marginTop: 2 }}>Vant {modalPayDebt.sale_id || "—"} • {modalPayDebt.status || "ouvè"}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 11, color: LUX.goldDeep, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>Rès aktyèl</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: LUX.goldDeep, marginTop: 2, ...monoStyle }}>{fmtHTG(getComputedDue(modalPayDebt))}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: LUX.body, fontWeight: 600, textAlign: "center", marginTop: 2 }}>Chwazi kalite peman</div>
              <button onClick={() => handleModalConfirmPay(true)} style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: LUX.hairline2, borderStyle: "solid", borderRadius: 16, padding: 14, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
                <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.goldSoft, borderStyle: "solid", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 14, color: LUX.goldDark, fontWeight: 800 }}>✓</span>
                  </span>
                  <span>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 13, color: LUX.ink }}>Peye tout</span>
                    <span style={{ display: "block", fontSize: 11, color: LUX.muted, marginTop: 1, ...monoStyle }}>{fmtHTG(getComputedDue(modalPayDebt))} • Clear debt at once</span>
                  </span>
                </span>
                <span style={{ fontSize: 14, color: LUX.ink, fontWeight: 700 }}>›</span>
              </button>
              <button onClick={() => setModalPayStep("pay")} style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 14, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
                <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 12, color: LUX.body, fontWeight: 700 }}>₲</span>
                  </span>
                  <span>
                    <span style={{ display: "block", fontWeight: 800, fontSize: 13, color: LUX.ink }}>Peye yon pati</span>
                    <span style={{ display: "block", fontSize: 11, color: LUX.muted, marginTop: 1, ...monoStyle }}>Enter custom amount ≤ {fmtHTG(getComputedDue(modalPayDebt))}</span>
                  </span>
                </span>
                <span style={{ fontSize: 14, color: LUX.body, fontWeight: 700 }}>›</span>
              </button>
              <button onClick={() => setModalPayStep("details")} style={{ backgroundColor: LUX.surface2, borderRadius: 16, padding: "12px 0", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Retounen</span>
              </button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <button onClick={() => setModalPayStep("choice")} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LUX.surface2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: LUX.body }}>‹</span></button>
          <span style={{ fontWeight: 800, fontSize: 15, color: LUX.ink }}>Peye yon pati</span>
          <div style={{ flex: 1 }} />
          <button onClick={closeDebtModal} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: LUX.surface2, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 14, color: LUX.body, fontWeight: 700 }}>✕</span></button>
        </div>
        {modalPayDebt && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 12, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ fontSize: 11, color: LUX.body, fontWeight: 600, ...monoStyle }}>Due {fmtHTG(getComputedDue(modalPayDebt))} • Inisyal {fmtHTG(Number(modalPayDebt.amount))}</div>
                <div style={{ fontSize: 11, color: LUX.muted, marginTop: 2 }}>Vant {modalPayDebt.sale_id || "—"} • {modalPayDebt.status || "ouvè"}</div>
              </div>
              <button onClick={() => setModalPayAmount(String(Math.round(Number(modalPayDebt.balance))))} style={{ backgroundColor: LUX.greenBg, borderWidth: 1, borderColor: LUX.greenBd, borderStyle: "solid", borderRadius: 16, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: LUX.greenDeep, ...monoStyle }}>Tout: {fmtHTG(getComputedDue(modalPayDebt))}</span>
              </button>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 11, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Montan koutim (HTG)</div>
              <div style={{ marginTop: 8 }}>
                <TextInput
                  value={modalPayAmount}
                  onChange={setModalPayAmount}
                  numeric
                  placeholder={modalPayDebt ? String(Math.round(getComputedDue(modalPayDebt))) : "Antre montan"}
                  style={{ marginTop: 0, textAlign: "center", fontSize: 16, fontWeight: 700, borderWidth: 1.5, borderColor: Number(modalPayAmount) > getComputedDue(modalPayDebt) ? LUX.redBd2 : LUX.hairline, background: "#fff" }}
                />
              </div>
              <div style={{ fontSize: 11, color: Number(modalPayAmount) > getComputedDue(modalPayDebt) ? LUX.red : LUX.muted, marginTop: 6, textAlign: "center", fontWeight: 500 }}>
                {Number(modalPayAmount) > getComputedDue(modalPayDebt) ? `Pa ka depase ${fmtHTG(getComputedDue(modalPayDebt))}` : `Pa depase ${fmtHTG(getComputedDue(modalPayDebt))}`}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 4 }}>
              <button onClick={() => setModalPayStep("choice")} style={{ flex: 1, backgroundColor: LUX.surface2, borderRadius: 16, padding: "13px 0", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Retounen</span>
              </button>
              <button onClick={() => handleModalConfirmPay(false)} style={{ flex: 1, backgroundColor: LUX.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, padding: "13px 0", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 8px rgba(29,29,31,0.25)" }}>
                <span style={{ color: LUX.goldSoft, fontWeight: 800, fontSize: 13 }}>PEYE</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  })();

  const debtModalVisible = showDebtModal && (modalPayStep !== "details" || !wide);

  return (
    <div style={{ background: LUX.bg, minHeight: "100%" }}>
      {wide ? (
        <div style={{ padding: `16px ${padH} 12px`, display: "flex", flexDirection: "column", gap: 12 }}>
          <TabletPageHeader
            filteredCount={filteredDebts.length}
            openCount={openDebts.length}
            canManageCustomer={canManageCustomer}
            onNewCreditPress={() => { setIsNewCreditFlow(true); setShowNewCreditModal(true); }}
          />
          <div style={{ display: "flex", flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 3, minWidth: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                <TabletAnalyticsCard analytics={analytics} ringTrace={ringTrace} range={range} setRange={setRange} filteredCount={filteredDebts.length} openCount={openDebts.length} />
                <div style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <CreditsSearchBar search={search} setSearch={setSearch} />
                  {query && customerSuggestions.length === 0 && canManageCustomer && (
                    <button onClick={() => setShowAddCustomer(true)} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 12, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "dashed", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ fontSize: 16, color: LUX.ink, fontWeight: 700 }}>＋</span>
                      <span style={{ color: LUX.ink, fontWeight: 700, fontSize: 13 }}>New Customer</span>
                    </button>
                  )}
                  <CustomerSuggestions suggestions={customerSuggestions} onSelect={c => setSearch(c.name)} />
                  <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1 }}>
                      <CreditsFilterChips view={view} setView={setView} />
                    </div>
                    <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>{filteredDebts.length} rezilta</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: LUX.ink, letterSpacing: 0.2, textTransform: "uppercase" }}>Dèt</span>
                  <span style={{ fontSize: 11, color: LUX.muted, fontWeight: 600 }}>{filteredDebts.length} rezilta</span>
                </div>
              </div>
              {filteredDebts.length === 0 ? (
                <CreditsEmptyState view={view} />
              ) : (
                filteredDebts.map(d => (
                  <TabletDebtRow key={d.id} debt={d} customer={customers.find(c => c.id === d.customer_id)} allPayments={allPayments} selected={modalSelectedDebtId === d.id} onPress={() => handleOpenFromRow(d)} />
                ))
              )}
            </div>
            <div style={{ flex: 2, minWidth: 300 }}>
              {modalCustomer && modalSelectedDebtId && selectedDebt ? (
                <TabletInspector
                  customer={modalCustomer}
                  debt={selectedDebt}
                  allPayments={allPayments}
                  allSaleItems={allSaleItems}
                  historyExpanded={expandedHistoryDebtId === selectedDebt.id}
                  articlesExpanded={expandedArticlesDebtId === selectedDebt.id}
                  onToggleHistory={() => setExpandedHistoryDebtId(expandedHistoryDebtId === selectedDebt.id ? null : selectedDebt.id)}
                  onToggleArticles={() => setExpandedArticlesDebtId(expandedArticlesDebtId === selectedDebt.id ? null : selectedDebt.id)}
                  onClose={closeDebtModal}
                  onPayNow={handleModalPayNowPress}
                />
              ) : (
                <div style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", padding: 28, textAlign: "center" }}>
                  <div style={{ fontSize: 22, color: LUX.hairline2 }}>◇</div>
                  <div style={{ color: LUX.muted, fontSize: 13, fontWeight: 700, textAlign: "center", marginTop: 8 }}>Chwazi yon dèt pou wè detay</div>
                  <div style={{ color: LUX.faint, fontSize: 11, textAlign: "center", marginTop: 4 }}>Klike sou yon dèt pou wè detay, istwa peman, atik, ak bouton peman.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <CreditsSearchBar search={search} setSearch={setSearch} />
          {query && customerSuggestions.length === 0 && canManageCustomer && (
            <button onClick={() => setShowAddCustomer(true)} style={{ backgroundColor: "#fff", borderRadius: 16, padding: 12, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "dashed", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 16, color: LUX.ink, fontWeight: 700 }}>＋</span>
              <span style={{ color: LUX.ink, fontWeight: 700, fontSize: 13 }}>New Customer</span>
            </button>
          )}
          <CustomerSuggestions suggestions={customerSuggestions} onSelect={c => setSearch(c.name)} />
          <CreditsFilterChips view={view} setView={setView} />
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <span style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <span style={{ width: 3, height: 18, borderRadius: 2, backgroundColor: LUX.purpleDot }} />
                <span>
                  <span style={{ display: "block", fontSize: 9, color: LUX.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Portefeyo dèt</span>
                  <span style={{ display: "block", fontSize: 12, color: LUX.body, fontWeight: 600, marginTop: 1 }}>{filteredDebts.length} dèt • {openDebts.length} ouvè</span>
                </span>
              </span>
              <span style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline2, borderStyle: "solid", borderRadius: 16, padding: "6px 12px", fontSize: 11, fontWeight: 700, color: LUX.ink, letterSpacing: 0.2 }}>{rangeLabel}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "row", backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 12, padding: 4 }}>
              {RANGE_OPTIONS.map(option => {
                const isSelected = range === option.key;
                return (
                  <button key={option.key} onClick={() => setRange(option.key)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", backgroundColor: isSelected ? LUX.ink : "transparent", fontWeight: isSelected ? 700 : 500, fontSize: 12, color: isSelected ? "#fff" : LUX.muted, cursor: "pointer", fontFamily: "inherit" }}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            <CreditsMetrics analytics={analytics} ringTrace={ringTrace} rangeLabel={rangeLabel} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredDebts.length === 0 ? (
              <CreditsEmptyState view={view} />
            ) : (
              filteredDebts.map(d => (
                <DebtCard key={d.id} debt={d} customer={customers.find(c => c.id === d.customer_id)} allPayments={allPayments} isTablet={false} onPress={() => handleOpenFromRow(d)} />
              ))
            )}
          </div>
        </div>
      )}

      {canManageCustomer && !wide && (
        <div style={{ position: "fixed", bottom: 20, right: 16, zIndex: 900 }}>
          <button onClick={() => { setIsNewCreditFlow(true); setShowNewCreditModal(true); }} style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: LUX.ink, borderWidth: 1, borderColor: "#3D3D40", borderStyle: "solid", borderRadius: 12, padding: "12px 16px", cursor: "pointer", boxShadow: "0 5px 10px rgba(0,0,0,0.18)", fontFamily: "inherit" }}>
            <span style={{ fontSize: 16, color: LUX.gold, fontWeight: 600, marginTop: -1 }}>+</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>NOUVO KREDI</span>
          </button>
        </div>
      )}

      {debtModalVisible && (
        <Overlay onClose={closeDebtModal} align="bottom" width={640}>
          <div style={{ width: "100%" }}>{modalContent}</div>
        </Overlay>
      )}

      {showNewCreditModal && (
        <Overlay onClose={() => setShowNewCreditModal(false)} align="bottom" width={640}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: LUX.hairline, alignSelf: "center", marginBottom: 12 }} />
            <div style={{ fontWeight: 800, fontSize: 16, color: LUX.ink, textAlign: "center" }}>Nouvo Kredi — Chwazi Kliyan</div>
            <div style={{ fontSize: 11, color: LUX.muted, textAlign: "center", marginTop: 4 }}>Chèche pa NIF/CIN (Government ID) oswa chwazi nan lis la</div>
            <div style={{ marginTop: 14, backgroundColor: "#fff", borderWidth: 1.5, borderColor: LUX.hairline2, borderStyle: "solid", borderRadius: 16, display: "flex", flexDirection: "row", alignItems: "center", padding: "0 12px", boxShadow: "0 3px 8px rgba(62,54,48,0.07)" }}>
              <span style={{ fontSize: 14, color: LUX.body, fontWeight: 600 }}>⌕</span>
              <input
                value={newCreditSearch}
                onChange={e => setNewCreditSearch(e.target.value)}
                placeholder="NIF/CIN, non, telefòn oswa adrès"
                style={{ flex: 1, padding: "12px 8px", background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 500, color: LUX.ink, fontFamily: "inherit" }}
              />
              {newCreditSearch.length > 0 && (
                <button onClick={() => setNewCreditSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: LUX.body, padding: 6, fontSize: 14, fontWeight: 600 }}>✕</button>
              )}
            </div>
            <div style={{ maxHeight: 260, marginTop: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4 }}>
              {filteredNewCreditCustomers.length === 0 ? (
                <div style={{ backgroundColor: LUX.surface, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 16, textAlign: "center" }}>
                  <div style={{ color: LUX.muted, fontSize: 12, fontWeight: 600, textAlign: "center" }}>{newCreditSearch.trim() ? "Pa jwenn kliyan" : "Pa gen kliyan — kreye youn"}</div>
                  <div style={{ color: LUX.faint, fontSize: 11, marginTop: 4, textAlign: "center" }}>Antre NIF/CIN oswa itilize bouton anba a</div>
                </div>
              ) : (
                filteredNewCreditCustomers.map(c => (
                  <button key={c.id} onClick={() => handleSelectNewCreditCustomer(c)} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: 12, display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>
                    <span style={{ flex: 1, paddingRight: 8, minWidth: 0, textAlign: "left" }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: LUX.ink }}>{c.name}</span>
                      <span style={{ display: "block", fontSize: 11, color: LUX.body, fontWeight: 600, marginTop: 2 }}>{c.id_card_number || "Pa gen NIF/CIN"} • {c.phone || "Pa gen telefòn"}</span>
                      <span style={{ display: "block", fontSize: 11, color: LUX.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.address || "Pa gen adrès"}</span>
                      <span style={{ display: "block", fontSize: 11, color: c.total_debt > 0 ? LUX.redDeep : LUX.greenDeep, marginTop: 1, fontWeight: 600, ...monoStyle }}>{c.total_debt > 0 ? `${fmtHTG(Number(c.total_debt))} due • ${c.credit_limit == null ? "San limit" : `Limit ${fmt(c.credit_limit)} HTG`}` : "Pa gen dèt • Pare pou kredi"}</span>
                    </span>
                    <span style={{ backgroundColor: LUX.goldSoft, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, padding: "6px 10px", fontSize: 11, fontWeight: 800, color: LUX.goldDeep, flexShrink: 0 }}>Chwazi ›</span>
                  </button>
                ))
              )}
            </div>
            <div style={{ marginTop: 12, backgroundColor: LUX.goldBg, borderWidth: 1, borderColor: LUX.goldSoft, borderStyle: "solid", borderRadius: 16, padding: 10 }}>
              <div style={{ fontSize: 11, color: LUX.goldDeep, fontWeight: 600, textAlign: "center" }}>Chwazi kliyan an → w ap ale nan lavant pou chwazi pwodwi. Enfòmasyon kliyan ap rete.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 12 }}>
              <button onClick={() => { setShowNewCreditModal(false); setNewCreditSearch(""); setIsNewCreditFlow(false); }} style={{ flex: 1, backgroundColor: LUX.surface2, borderWidth: 1, borderColor: LUX.hairline, borderStyle: "solid", borderRadius: 16, padding: "12px 0", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Anile</span>
              </button>
              {canManageCustomer && (
                <button onClick={() => { setShowNewCreditModal(false); setIsNewCreditFlow(true); setShowAddCustomer(true); }} style={{ flex: 1, backgroundColor: LUX.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, padding: "12px 0", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <span style={{ color: LUX.goldSoft, fontWeight: 800, fontSize: 13 }}>＋ Kreye Kliyan</span>
                </button>
              )}
            </div>
            {canManageCustomer && <div style={{ fontSize: 10, color: LUX.faint, textAlign: "center", marginTop: 8 }}>Kreye ak ID + NIF/CIN, apre chwazi pwodwi nan lavant</div>}
          </div>
        </Overlay>
      )}

      {showPay && (
        <Overlay onClose={() => setShowPay(false)} align="bottom" width={640}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: LUX.hairline, alignSelf: "center", marginBottom: 14 }} />
            <div style={{ fontWeight: 800, textAlign: "center", fontSize: 15, color: LUX.ink }}>Peman dèt</div>
            <div style={{ fontSize: 12, color: LUX.muted, textAlign: "center", marginTop: 4 }}>Verifye ID dèt & NIF/CIN • Resi ap bay otomatikman</div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 16, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>ID dèt *</div>
            <div style={{ marginTop: 6 }}>
              <TextInput placeholder="debt-1" value={payDebtId} onChange={setPayDebtId} style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Kat idantite (verifikasyon)</div>
            <div style={{ marginTop: 6 }}>
              <TextInput placeholder="004-123-4567" value={payIdCard} onChange={setPayIdCard} style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Montan (HTG)</div>
            <div style={{ marginTop: 6 }}>
              <TextInput placeholder="500" value={payAmount} onChange={setPayAmount} numeric style={{ background: "#fff", fontSize: 13, fontWeight: 700, borderWidth: 1, borderColor: LUX.ink, borderStyle: "solid" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowPay(false)} style={{ flex: 1, padding: "13px 0", backgroundColor: LUX.surface2, borderRadius: 16, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Anile</span>
              </button>
              <button onClick={handlePay} style={{ flex: 1, padding: "13px 0", backgroundColor: LUX.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ color: LUX.goldSoft, fontWeight: 800, fontSize: 13 }}>PEYE & BAY RESI</span>
              </button>
            </div>
            <div style={{ fontSize: 10, color: LUX.faint, textAlign: "center", marginTop: 10 }}>Peman ajoute nan revni jodi a • Resi: REC-YYYYMMDD-XXXX</div>
          </div>
        </Overlay>
      )}

      {showAddCustomer && (
        <Overlay onClose={() => setShowAddCustomer(false)} align="bottom" width={640}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: LUX.hairline, alignSelf: "center", marginBottom: 14 }} />
            <div style={{ fontWeight: 800, textAlign: "center", fontSize: 15, color: LUX.ink }}>Ajoute nouvo kliyan</div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 16, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Non</div>
            <div style={{ marginTop: 6 }}>
              <TextInput value={newCustomer.name} onChange={v => setNewCustomer(p => ({ ...p, name: v }))} style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>NIF/CIN</div>
            <div style={{ marginTop: 6 }}>
              <TextInput value={newCustomer.id_card_number} onChange={v => setNewCustomer(p => ({ ...p, id_card_number: v }))} style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Telefòn</div>
            <div style={{ marginTop: 6 }}>
              <TextInput value={newCustomer.phone} onChange={v => setNewCustomer(p => ({ ...p, phone: v }))} style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Adrès</div>
            <div style={{ marginTop: 6 }}>
              <TextInput value={newCustomer.address} onChange={v => setNewCustomer(p => ({ ...p, address: v }))} placeholder="Delmas 33, Pòtoprens" style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, marginTop: 12, color: LUX.body, letterSpacing: 0.3, textTransform: "uppercase" }}>Limit kredi (opsyonèl)</div>
            <div style={{ marginTop: 6 }}>
              <TextInput value={newCustomer.credit_limit} onChange={v => setNewCustomer(p => ({ ...p, credit_limit: v }))} numeric style={{ background: LUX.surface, fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "row", gap: 10, marginTop: 18 }}>
              <button onClick={() => setShowAddCustomer(false)} style={{ flex: 1, backgroundColor: LUX.surface2, borderRadius: 16, padding: "13px 0", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <span style={{ fontWeight: 700, color: LUX.body, fontSize: 13 }}>Anile</span>
              </button>
              {canManageCustomer && (
                <button onClick={() => { if (isNewCreditFlow) handleCreateNewCreditCustomer(); else handleCreateCustomerFromSearch(); }} style={{ flex: 1, backgroundColor: LUX.ink, borderWidth: 1, borderColor: LUX.gold, borderStyle: "solid", borderRadius: 16, padding: "13px 0", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ color: LUX.goldSoft, fontWeight: 800, fontSize: 13 }}>{showNewCreditModal ? "Kreye & Ale nan lavant" : "KREYE"}</span>
                </button>
              )}
            </div>
          </div>
        </Overlay>
      )}

      {showReceipt && lastReceipts && (
        <ReceiptModal receipts={lastReceipts} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}