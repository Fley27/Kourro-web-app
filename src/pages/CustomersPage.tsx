import { useEffect, useMemo, useState } from "react";
import { palette, radius, shadow } from "../lib/theme";
import { fmt, monoStyle } from "../lib/format";
import { getDb } from "../lib/db";
import { useAuthStore } from "../lib/authStore";
import { useResponsive } from "../lib/responsive";
import { Button, Field, ModalHeader, Overlay, TextInput, toast } from "../components/ui";

// ── Search header + segmented control (mirrors mobile SearchHeader) ──

function SearchHeader({
  search,
  setSearch,
  showDebtOnly,
  setShowDebtOnly,
  customers,
  debts,
}: {
  search: string;
  setSearch: (v: string) => void;
  showDebtOnly: boolean;
  setShowDebtOnly: (v: boolean) => void;
  customers: any[];
  debts: any[];
}) {
  return (
    <div style={{ background: palette.surface, borderBottom: `0.5px solid ${palette.hairline}`, padding: 12, gap: 10, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", backgroundColor: palette.surfaceGrouped, borderRadius: radius.sm, padding: "0 10px", border: `0.5px solid ${palette.hairline}`, height: 40 }}>
        <span style={{ fontSize: 13, color: palette.muted3, marginRight: 6 }}>⌕</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Chèche pa non, NIF/CIN, telefòn oswa adrès"
          style={{ flex: 1, fontSize: 13.5, color: palette.ink, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }}
        />
        {search.length > 0 && (
          <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", color: palette.muted2, fontSize: 12, fontWeight: 600, padding: 4 }}>✕</button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "row", background: palette.surfaceGrouped, borderRadius: radius.md, padding: 3, gap: 4 }}>
        <button
          onClick={() => setShowDebtOnly(false)}
          className="seg-btn"
          data-active={!showDebtOnly}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: radius.sm, border: "none", cursor: "pointer",
            background: !showDebtOnly ? "#fff" : "transparent", boxShadow: !showDebtOnly ? shadow.soft : "none", fontFamily: "inherit",
          }}
        >
          <span style={{ fontSize: 11, color: !showDebtOnly ? palette.ink : palette.muted }}>◯</span>
          <span style={{ fontWeight: 600, fontSize: 12, color: !showDebtOnly ? palette.ink : palette.muted }}>Tout</span>
          <span style={{ background: !showDebtOnly ? palette.ink : palette.surfaceGrouped, color: !showDebtOnly ? "#fff" : palette.muted, padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{customers.length}</span>
        </button>
        <button
          onClick={() => setShowDebtOnly(true)}
          data-active={showDebtOnly}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 0", borderRadius: radius.sm, border: "none", cursor: "pointer",
            background: showDebtOnly ? "#fff" : "transparent", boxShadow: showDebtOnly ? shadow.soft : "none", fontFamily: "inherit",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 3, background: showDebtOnly ? palette.warningDot : palette.muted3 }} />
          <span style={{ fontWeight: 600, fontSize: 12, color: showDebtOnly ? palette.ink : palette.muted }}>Ki gen dèt</span>
          <span style={{ background: showDebtOnly ? "#92400E" : palette.surfaceGrouped, color: showDebtOnly ? "#fff" : palette.muted, padding: "1px 6px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{debts.length}</span>
        </button>
      </div>
    </div>
  );
}

// ── Customer row card (master list item) ──

function CustomerRowCard({ item, debts, isSelected, onPress }: { item: any; debts: any[]; isSelected: boolean; onPress: () => void }) {
  const debtRows = debts.filter(d => d.customer_id === item.id && Number(d.balance) > 0);
  const mostOverdue = debtRows.map(d => (d.due_date ? new Date(d.due_date).getTime() : Number.MAX_SAFE_INTEGER)).sort((a, b) => a - b)[0] ?? null;
  const isDebtCustomer = debtRows.length > 0;
  const computedDebt = debtRows.reduce((s: number, d: any) => s + Number(d.balance ?? 0), 0);
  const totalDebt = Number(item.total_debt ?? 0) > 0 ? Number(item.total_debt) : computedDebt;
  return (
    <div
      onClick={onPress}
      style={{
        background: isSelected ? palette.ink : palette.surface,
        border: `0.5px solid ${isSelected ? palette.ink : isDebtCustomer ? palette.dangerBd : palette.successBd}`,
        borderRadius: radius.md,
        padding: 12,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        boxShadow: isSelected ? shadow.card : shadow.soft,
      }}
    >
      {isDebtCustomer && !isSelected && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: palette.dangerDot }} />}
      {!isDebtCustomer && !isSelected && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: palette.successDot }} />}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: isSelected ? palette.surface : isDebtCustomer ? palette.dangerBg : palette.successBg, border: `0.5px solid ${isSelected ? palette.surface : isDebtCustomer ? palette.dangerBd : palette.successBd}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? palette.ink : isDebtCustomer ? "#7F1D1D" : "#065F46" }}>{(item.name?.[0] ?? "•").toUpperCase()}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? "#fff" : palette.ink, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
            {isDebtCustomer ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: isSelected ? "rgba(255,255,255,0.14)" : palette.dangerBg, borderRadius: 20, padding: "1px 7px", flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: palette.dangerDot }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: isSelected ? "#fff" : "#7F1D1D" }}>{debtRows.length} dèt</span>
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: isSelected ? "rgba(255,255,255,0.14)" : palette.successBg, borderRadius: 20, padding: "1px 7px", flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: palette.successDot }} />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: isSelected ? "#fff" : "#065F46" }}>A jou</span>
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ background: isSelected ? "rgba(255,255,255,0.12)" : palette.surfaceGrouped, borderRadius: 20, padding: "1px 7px", fontSize: 10, color: isSelected ? "rgba(255,255,255,0.75)" : palette.muted, fontWeight: 500, whiteSpace: "nowrap" }}>ID {item.id_card_number || "—"}</span>
            {item.phone ? <span style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,0.6)" : palette.muted3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.phone}</span> : null}
          </div>
        </div>
        <div style={{ alignItems: "flex-end", gap: 2, minWidth: 78, display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 700, fontSize: 12.5, ...monoStyle, color: isSelected ? "#fff" : isDebtCustomer ? palette.danger : palette.success, whiteSpace: "nowrap" }}>{fmt(totalDebt)} HTG</span>
          <span style={{ fontSize: 10, color: isSelected ? "rgba(255,255,255,0.55)" : isDebtCustomer ? "#FCA5A5" : "#86EFAC", fontWeight: 600 }}>{isDebtCustomer ? `${debtRows.length} aktif` : "A jou"}</span>
        </div>
        <div style={{ width: 22, height: 22, borderRadius: 11, background: isSelected ? palette.surface : palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: isSelected ? palette.ink : palette.muted3 }}>{isSelected ? "✕" : isSelected ? "✕" : "›"}</span>
        </div>
      </div>
      {mostOverdue !== null && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: radius.sm, padding: "5px 8px" }}>
          <span style={{ fontSize: 10, color: palette.warning }}>◷</span>
          <span style={{ fontSize: 10.5, color: palette.warning, fontWeight: 500 }}>Pi reta: {new Date(mostOverdue).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}

function CustomerListEmpty() {
  return (
    <div style={{ background: palette.surface, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 28, alignItems: "center", marginTop: 8, textAlign: "center" }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
        <span style={{ fontSize: 18, color: palette.muted3 }}>◯</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, color: palette.inkSoft }}>Pa gen kliyan</div>
      <div style={{ color: palette.muted3, fontSize: 12, marginTop: 4 }}>Eseye yon lòt rechèch oswa ajoute yon nouvo kliyan</div>
    </div>
  );
}

// ── Detail cards (mirror CustomersShared) ──

function GeneralInfoView({ customer, canManageCustomers, onEdit }: { customer: any; canManageCustomers: boolean; onEdit: () => void }) {
  return (
    <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 14, boxShadow: shadow.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: palette.ink, letterSpacing: -0.1 }}>Enfòmasyon jeneral</div>
          <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>Lekti sèlman — tape Modifye si ou vle chanje</div>
        </div>
        {canManageCustomers && (
          <button onClick={onEdit} style={{ display: "flex", alignItems: "center", gap: 5, background: palette.ink2, borderRadius: 20, padding: "6px 12px", border: "none", cursor: "pointer" }}>
            <span style={{ color: "#fff", fontSize: 11 }}>✎</span>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 12 }}>Modifye</span>
          </button>
        )}
      </div>
      <div style={{ marginTop: 12, gap: 8, display: "flex", flexDirection: "column" }}>
        <div style={{ background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10 }}>
          <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 700, letterSpacing: 0.5 }}>NON KONPLÈ</div>
          <div style={{ fontSize: 14, color: palette.ink, fontWeight: 600, marginTop: 3 }}>{customer.name || "—"}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10 }}>
            <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 700 }}>NIF / CIN</div>
            <div style={{ fontSize: 13, color: palette.ink, fontWeight: 600, marginTop: 3 }}>{customer.id_card_number || "—"}</div>
          </div>
          <div style={{ flex: 1, background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10 }}>
            <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 700 }}>TELEFÒN</div>
            <div style={{ fontSize: 13, color: palette.ink, fontWeight: 600, marginTop: 3 }}>{customer.phone || "—"}</div>
          </div>
        </div>
        <div style={{ background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10 }}>
          <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 700 }}>ADRÈS</div>
          <div style={{ fontSize: 13, color: palette.ink, fontWeight: 600, marginTop: 3 }}>{customer.address || "—"}</div>
        </div>
      </div>
    </div>
  );
}

function CreditLimitViewCard({ customer, isManagerPlus, canManageCustomers }: { customer: any; isManagerPlus: boolean; canManageCustomers: boolean }) {
  return (
    <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 14, boxShadow: shadow.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: palette.ink }}>Limit kredi</span>
        {!isManagerPlus && (
          <span style={{ background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 600, color: palette.muted3 }}>Manager+</span>
        )}
      </div>
      <div style={{ marginTop: 8, background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 12, alignItems: "center", textAlign: "center" }}>
        <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 700, letterSpacing: 0.5 }}>LIMIT AKTYÈL</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: palette.ink, marginTop: 4 }}>{customer.credit_limit == null ? "San limit" : `${fmt(Number(customer.credit_limit))} HTG`}</div>
        {customer.credit_limit_source ? <div style={{ fontSize: 10, color: palette.muted3, marginTop: 2 }}>Sous: {customer.credit_limit_source}</div> : null}
      </div>
      {isManagerPlus && canManageCustomers && <div style={{ fontSize: 11, color: palette.muted3, marginTop: 8, textAlign: "center" }}>Tape Modifye anwo pou chanje limit</div>}
    </div>
  );
}

function ActiveDebtsCard({ customer, debts }: { customer: any; debts: any[] }) {
  const active = debts.filter(d => d.customer_id === customer.id && Number(d.balance) > 0);
  return (
    <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 14, boxShadow: shadow.card }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: palette.ink }}>Dèt aktif</span>
        <span style={{ background: active.length > 0 ? palette.dangerBg : palette.successBg, border: `0.5px solid ${active.length > 0 ? palette.dangerBd : palette.successBd}`, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700, color: active.length > 0 ? "#7F1D1D" : "#065F46" }}>{active.length} aktif</span>
      </div>
      {active.length === 0 ? (
        <div style={{ background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 14, marginTop: 10, alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 12, color: palette.muted3, fontWeight: 500 }}>Okenn dèt aktif</div>
          <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>Kliyan sa a pa gen balans</div>
        </div>
      ) : (
        active.map(d => {
          const due = d.due_date ? new Date(d.due_date) : null;
          const overdue = due ? due.getTime() < Date.now() : false;
          return (
            <div key={d.id} style={{ background: overdue ? palette.dangerBg : palette.warningBg, border: `0.5px solid ${overdue ? palette.dangerBd : palette.warningBd}`, borderRadius: radius.sm, padding: 12, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.sale_id ?? d.id}</span>
                <span style={{ background: overdue ? palette.danger : palette.warningDot, borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", ...monoStyle }}>{fmt(Number(d.balance))} HTG</span>
              </div>
              <div style={{ fontSize: 11, color: overdue ? "#7F1D1D" : palette.warning, marginTop: 4, fontWeight: 500 }}>{overdue ? "An reta" : "Poko rive"} · Echèans {due ? due.toLocaleDateString() : "—"}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

const payMeta = (m: string) => {
  const v = String(m ?? "").toLowerCase();
  if (v === "moncash") return { label: "MonCash", bg: palette.dangerBg, bd: palette.dangerBd, tx: "#7F1D1D", dot: palette.dangerDot };
  if (v === "natcash") return { label: "NatCash", bg: palette.blueBg, bd: palette.blueBd, tx: "#1E40AF", dot: palette.blue };
  return { label: "Kach", bg: palette.successBg, bd: palette.successBd, tx: "#065F46", dot: palette.successDot };
};

function PurchaseHistoryCard({ customer, pastCredits, pastSales, showPastCredits, onToggle }: { customer: any; pastCredits: any[]; pastSales: any[]; showPastCredits: boolean; onToggle: () => void }) {
  const filteredKredi = Array.from(new Map(pastCredits.filter((c: any) => c.customer_id === customer?.id).map(c => [c.id, c] as const)).values());
  const filteredOtherRaw = pastSales.filter((s: any) => s.customer_id === customer?.id && String(s.payment_method ?? "").toLowerCase() !== "credit");
  const filteredOther = Array.from(new Map(filteredOtherRaw.map(s => [s.id, s] as const)).values());
  const krediCount = filteredKredi.length;
  const otherCount = filteredOther.length;
  return (
    <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 14, boxShadow: shadow.card }}>
      <button
        onClick={onToggle}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <div style={{ flex: 1, paddingRight: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: palette.ink, letterSpacing: -0.1 }}>Istwa acha kliyan an</div>
          <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>{krediCount} Kredi · {otherCount} Kach/Mobil · {showPastCredits ? "devwale" : "tape pou wè"}</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, background: showPastCredits ? palette.ink : palette.surfaceGrouped, border: `0.5px solid ${showPastCredits ? palette.ink : palette.hairline}`, borderRadius: 20, padding: "5px 10px" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: showPastCredits ? "#fff" : palette.muted }}>{showPastCredits ? "Kache" : "Wè"}</span>
          <span style={{ fontSize: 10, color: showPastCredits ? "#fff" : palette.muted3 }}>{showPastCredits ? "▴" : "▾"}</span>
        </span>
      </button>

      {showPastCredits && (
        <div style={{ marginTop: 12, gap: 14, display: "flex", flexDirection: "column" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>💳</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#6D28D9", letterSpacing: 0.3 }}>KREDI</span>
              <span style={{ background: palette.violetBg, border: `0.5px solid ${palette.violetBd}`, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700, color: "#6D28D9" }}>{krediCount}</span>
              <div style={{ flex: 1, height: 1, background: "#EDE9FE" }} />
            </div>
            {krediCount === 0 ? (
              <div style={{ background: "#FAF5FF", border: `0.5px solid #E9D5FF`, borderRadius: radius.sm, padding: 14, alignItems: "center", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>Poko gen acha Kredi</div>
                <div style={{ fontSize: 11, color: "#A78BFA", marginTop: 2 }}>Okenn vant sou kredi pou kliyan sa a</div>
              </div>
            ) : (
              <div style={{ gap: 8, display: "flex", flexDirection: "column" }}>
                {filteredKredi.map((c: any) => {
                  const bal = Number(c.balance ?? 0);
                  const amt = Number(c.amount ?? 0);
                  const paid = Math.max(0, amt - bal);
                  const isPaid = bal <= 0.01;
                  const isPartial = !isPaid && paid > 0;
                  const badge = isPaid
                    ? { bg: palette.successBg, bd: palette.successBd, tx: "#065F46", label: "Peye" }
                    : isPartial
                      ? { bg: palette.warningBg, bd: palette.warningBd, tx: palette.warning, label: "Pasyèl" }
                      : { bg: palette.dangerBg, bd: palette.dangerBd, tx: "#7F1D1D", label: "Dwe" };
                  const due = c.due_date ? new Date(c.due_date) : null;
                  const dt = c.updated_at ?? c.created_at ?? null;
                  return (
                    <div key={c.id} style={{ background: "#fff", border: `0.5px solid #E9D5FF`, borderRadius: radius.sm, padding: 10, borderLeft: `3px solid #7C3AED` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: palette.violetBg, border: `0.5px solid ${palette.violetBd}`, borderRadius: 6, padding: "1px 6px", fontSize: 9, fontWeight: 700, color: "#6D28D9" }}>KREDI</span>
                            <span style={{ fontWeight: 600, fontSize: 11, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sale_id ?? c.id}</span>
                          </div>
                          <div style={{ fontSize: 11, color: palette.muted3, marginTop: 4 }}>{dt ? new Date(dt).toLocaleDateString() : "—"}{due ? ` · Echèans ${due.toLocaleDateString()}` : ""}</div>
                        </div>
                        <span style={{ background: badge.bg, border: `0.5px solid ${badge.bd}`, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: badge.tx, flexShrink: 0 }}>{badge.label}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "row", gap: 6, marginTop: 8 }}>
                        <div style={{ flex: 1, background: "#FAF5FF", border: `0.5px solid #E9D5FF`, borderRadius: radius.xs, padding: 8, alignItems: "center", textAlign: "center" }}>
                          <div style={{ fontSize: 9.5, color: "#7C3AED", fontWeight: 600, letterSpacing: 0.3 }}>MONTAN</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink, marginTop: 2, ...monoStyle }}>{fmt(amt)} HTG</div>
                        </div>
                        <div style={{ flex: 1, background: badge.bg, border: `0.5px solid ${badge.bd}`, borderRadius: radius.xs, padding: 8, alignItems: "center", textAlign: "center" }}>
                          <div style={{ fontSize: 9.5, color: badge.tx, fontWeight: 600, letterSpacing: 0.3 }}>RÈS</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: badge.tx, marginTop: 2, ...monoStyle }}>{fmt(bal)} HTG</div>
                        </div>
                        <div style={{ flex: 1, background: palette.surface, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.xs, padding: 8, alignItems: "center", textAlign: "center" }}>
                          <div style={{ fontSize: 9.5, color: palette.muted3, fontWeight: 600, letterSpacing: 0.3 }}>PEYE</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: palette.ink, marginTop: 2, ...monoStyle }}>{fmt(paid)} HTG</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12 }}>💵</span>
              <span style={{ fontWeight: 700, fontSize: 12, color: "#065F46", letterSpacing: 0.3 }}>KACH · MONCASH · NATCASH</span>
              <span style={{ background: palette.successBg, border: `0.5px solid ${palette.successBd}`, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700, color: "#065F46" }}>{otherCount}</span>
              <div style={{ flex: 1, height: 1, background: palette.successBd }} />
            </div>
            {otherCount === 0 ? (
              <div style={{ background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 14, alignItems: "center", textAlign: "center" }}>
                <div style={{ fontSize: 12, color: palette.muted, fontWeight: 500 }}>Poko gen acha Kach/Mobil</div>
                <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>Okenn vant comptant pou kliyan sa a</div>
              </div>
            ) : (
              <div style={{ gap: 8, display: "flex", flexDirection: "column" }}>
                {filteredOther.map((s: any) => {
                  const m = payMeta(s.payment_method);
                  const dt = s.updated_at ?? s.created_at ?? null;
                  return (
                    <div key={s.id} style={{ background: "#fff", border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10, borderLeft: `3px solid ${m.dot}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: m.bg, border: `0.5px solid ${m.bd}`, borderRadius: 6, padding: "1px 6px", fontSize: 9, fontWeight: 700, color: m.tx }}>{m.label.toUpperCase()}</span>
                            <span style={{ fontWeight: 600, fontSize: 11, color: palette.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sale_number ?? s.id}</span>
                          </div>
                          <div style={{ fontSize: 11, color: palette.muted3, marginTop: 4 }}>{dt ? new Date(dt).toLocaleDateString() : "—"} · {fmt(Number(s.total ?? s.amount ?? 0))} HTG</div>
                        </div>
                        <div style={{ alignItems: "flex-end", flexDirection: "column", display: "flex" }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: palette.ink, ...monoStyle }}>{fmt(Number(s.total ?? s.amount ?? 0))} HTG</div>
                          <div style={{ fontSize: 10, color: palette.muted, marginTop: 1 }}>{s.status ?? "completed"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModificationHistoryCard({ history }: { history: any[] }) {
  return (
    <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 14, boxShadow: shadow.card }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: palette.ink }}>Istwa modifikasyon</div>
      <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>10 dènye chanjman</div>
      {history.length === 0 ? (
        <div style={{ background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 14, marginTop: 10, alignItems: "center", textAlign: "center" }}>
          <span style={{ fontSize: 12, color: palette.muted3 }}>Poko gen istwa</span>
        </div>
      ) : (
        <div style={{ marginTop: 10, gap: 8, display: "flex", flexDirection: "column" }}>
          {history.map((h: any) => (
            <div key={h.id} style={{ display: "flex", gap: 10, background: palette.surface2, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.sm, padding: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: "#fff", border: `0.5px solid ${palette.hairline}`, alignItems: "center", justifyContent: "center", display: "flex", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: palette.muted }}>✎</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 12, color: palette.ink }}>{h.field_name}</span>
                  <span style={{ background: palette.ink, borderRadius: 6, padding: "0px 6px", fontSize: 9.5, fontWeight: 600, color: "#fff" }}>{h.action}</span>
                  <span style={{ fontSize: 10, color: palette.muted3 }}>{h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}</span>
                </div>
                <div style={{ fontSize: 11, color: palette.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Itilizatè {h.user_id}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <div style={{ flex: 1, background: "#fff", border: `0.5px solid ${palette.hairline}`, borderRadius: radius.xs, padding: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: palette.muted3, fontWeight: 700 }}>ANSYEN</div>
                    <div style={{ fontSize: 11, color: palette.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.old_value ?? "—"}</div>
                  </div>
                  <div style={{ flex: 1, background: palette.successBg, border: `0.5px solid ${palette.successBd}`, borderRadius: radius.xs, padding: 6, minWidth: 0 }}>
                    <div style={{ fontSize: 9, color: palette.success, fontWeight: 700 }}>NOUVO</div>
                    <div style={{ fontSize: 11, color: palette.ink, marginTop: 1, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.new_value ?? "—"}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──

export function CustomersPage() {
  const { user } = useAuthStore();
  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const isCashier = role === "cashier";
  const isManagerPlus = ["owner", "admin", "manager"].includes(role);
  const canManageCustomers = !isCashier;
  const { width, isTablet, isLandscape, padH } = useResponsive();
  const isDesktopWide = isTablet && isLandscape && width >= 900;

  const [customers, setCustomers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [pastCredits, setPastCredits] = useState<any[]>([]);
  const [pastSales, setPastSales] = useState<any[]>([]);
  const [showPastCredits, setShowPastCredits] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showDebtOnly, setShowDebtOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
  const [editPayload, setEditPayload] = useState({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);

  async function load() {
    try {
      const db = await getDb();
      const allCustomersRaw = (await db.getAllAsync("SELECT * FROM customers")) as any[];
      const allCustomers = Array.from(new Map(allCustomersRaw.map((c: any) => [c.id, c] as const)).values());
      const allDebts = (await db.getAllAsync("SELECT * FROM credits WHERE balance > 0")) as any[];
      const openDebts = allDebts.filter((d: any) => Number(d.balance) > 0);
      setCustomers(allCustomers);
      setDebts(openDebts);
    } catch (e) {
      console.log("[Customers load] failed:", e);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setPastCredits([]);
      setPastSales([]);
      setShowPastCredits(false);
      setCustomerHistory([]);
      return;
    }
    (async () => {
      try {
        const db = await getDb();
        const history = (await db.getAllAsync("SELECT * FROM customer_history WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10", [selectedCustomerId])) as any[];
        setCustomerHistory(history);
        const credits = (await db.getAllAsync("SELECT * FROM credits WHERE customer_id = ?", [selectedCustomerId])) as any[];
        setPastCredits([...credits].sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime()));
        const sales = (await db.getAllAsync("SELECT * FROM sales WHERE customer_id = ?", [selectedCustomerId])) as any[];
        setPastSales([...sales].sort((a: any, b: any) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime()));
        setShowPastCredits(false);
      } catch (e) {
        console.log("[Customers history] failed:", e);
      }
    })();
  }, [selectedCustomerId]);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) ?? null;

  useEffect(() => {
    if (selectedCustomer) {
      setEditPayload({
        name: selectedCustomer.name ?? "",
        id_card_number: selectedCustomer.id_card_number ?? "",
        phone: selectedCustomer.phone ?? "",
        address: selectedCustomer.address ?? "",
        credit_limit: selectedCustomer.credit_limit == null ? "" : String(selectedCustomer.credit_limit),
      });
    }
  }, [selectedCustomer]);

  const displayCustomers = useMemo(() => {
    const deduped = Array.from(new Map(customers.map(c => [c.id, c] as const)).values());
    let list = [...deduped];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c => (c.name ?? "").toLowerCase().includes(q) || (c.id_card_number ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q) || (c.address ?? "").toLowerCase().includes(q));
    }
    if (showDebtOnly) {
      const debtIds = new Set(debts.filter(d => Number(d.balance) > 0).map(d => d.customer_id));
      list = list.filter(c => debtIds.has(c.id));
      list.sort((a, b) => {
        const dueOf = (id: string) => debts.filter(d => d.customer_id === id && Number(d.balance) > 0).map(d => (d.due_date ? new Date(d.due_date).getTime() : Number.MAX_SAFE_INTEGER)).sort((x, y) => x - y)[0] ?? Number.MAX_SAFE_INTEGER;
        return dueOf(a.id) - dueOf(b.id);
      });
    }
    return list;
  }, [customers, debts, showDebtOnly, search]);

  async function logEdit(customerId: string, action: string, fieldName: string, oldValue: any, newValue: any) {
    try {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO customer_history (id, customer_id, user_id, action, field_name, old_value, new_value, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [`cust-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, customerId, user?.id ?? "unknown-user", action, fieldName, oldValue ?? null, newValue ?? null, new Date().toISOString()]
      );
    } catch (e) {
      console.log("[logEdit] failed:", e);
    }
  }

  async function handleAddCustomer() {
    if (isCashier) return toast("Pa gen dwa", "Kesye ka sèlman li lis kliyan yo. Li pa ka kreye nouvo klient.", "error");
    if (!newCustomer.name.trim()) return toast("Nom obligatwa");
    if (!newCustomer.id_card_number.trim()) return toast("ID obligatwa", "Nimewo kat idantite obligatwa", "warn");
    const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const parsedLimit = newCustomer.credit_limit.trim() === "" ? null : Number(newCustomer.credit_limit);
    if (newCustomer.credit_limit.trim() !== "" && (parsedLimit === null || !Number.isFinite(parsedLimit) || parsedLimit < 0)) {
      return toast("Limit pa valab", undefined, "warn");
    }
    try {
      const db = await getDb();
      const record = {
        id,
        store_id: "demo-store-id",
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        id_card_number: newCustomer.id_card_number.trim(),
        total_debt: 0,
        credit_limit: isManagerPlus ? (parsedLimit ?? null) : null,
        credit_limit_source: isManagerPlus && parsedLimit !== null ? "manual" : null,
        is_high_risk: false,
        open_debt_count: 0,
        created_at: new Date().toISOString(),
      };
      await db.runAsync(
        "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [record.id, record.store_id, record.name, record.phone, record.address, record.id_card_number, record.total_debt, record.credit_limit, record.credit_limit_source, record.is_high_risk ? 1 : 0, record.open_debt_count]
      );
      await logEdit(record.id, "created", "customer", null, `${record.name} / ${record.id_card_number}${record.address ? ` / ${record.address}` : ""}`);
      setCustomers(prev => (prev.some(c => c.id === record.id) ? prev : [record, ...prev]));
      setShowAddCustomer(false);
      setNewCustomer({ name: "", id_card_number: "", phone: "", address: "", credit_limit: "" });
      setSelectedCustomerId(record.id);
      toast("Kliyan ajoute", `${record.name} anrejistre. ${record.phone ? `Telefòn: ${record.phone}` : "Pa gen nimewo telefòn"}${record.address ? ` · Adrès: ${record.address}` : ""}`, "success");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Ajoute kliyan echwe", "error");
    }
  }

  async function handleSaveCustomer() {
    if (!selectedCustomer) return;
    if (isCashier) return toast("Pa gen dwa", "Kesye ka sèlman li dosye kliyan yo. Li pa ka modifye.", "error");
    const nextName = editPayload.name.trim();
    const nextIdCard = editPayload.id_card_number.trim();
    const nextPhone = editPayload.phone.trim();
    const nextAddress = editPayload.address.trim();
    const nextLimit = editPayload.credit_limit.trim() === "" ? null : Number(editPayload.credit_limit);
    if (!nextName) return toast("Nom obligatwa", undefined, "warn");
    if (!nextIdCard) return toast("ID obligatwa", undefined, "warn");
    if (editPayload.credit_limit.trim() !== "" && (nextLimit === null || !Number.isFinite(nextLimit) || nextLimit < 0)) {
      return toast("Limit pa valab", undefined, "warn");
    }
    try {
      const db = await getDb();
      const oldLimit = selectedCustomer.credit_limit == null ? null : Number(selectedCustomer.credit_limit);
      if (editPayload.credit_limit.trim() !== "" || selectedCustomer.credit_limit != null) {
        if (!isManagerPlus && nextLimit !== oldLimit) {
          return toast("Pa gen dwa", "Se sèlman Manager ak pi wo ka modifye limit kredi.", "error");
        }
      }
      await db.runAsync(
        "UPDATE customers SET name = ?, id_card_number = ?, phone = ?, address = ?, credit_limit = ?, credit_limit_source = ? WHERE id = ?",
        [nextName, nextIdCard, nextPhone || null, nextAddress || null, nextLimit, nextLimit === null ? null : (selectedCustomer.credit_limit_source ?? "manual"), selectedCustomer.id]
      );
      const fieldUpdates = [
        ["name", selectedCustomer.name, nextName],
        ["id_card_number", selectedCustomer.id_card_number, nextIdCard],
        ["phone", selectedCustomer.phone, nextPhone || null],
        ["address", selectedCustomer.address, nextAddress || null],
        ["credit_limit", selectedCustomer.credit_limit, nextLimit],
      ].filter(([, oldValue, newValue]) => String(oldValue ?? "") !== String(newValue ?? ""));
      for (const [fieldName, oldValue, newValue] of fieldUpdates) {
        await logEdit(selectedCustomer.id, "updated", fieldName as string, oldValue, newValue);
      }
      setCustomers(prev => prev.map(c => (c.id === selectedCustomer.id ? { ...c, name: nextName, id_card_number: nextIdCard, phone: nextPhone || null, address: nextAddress || null, credit_limit: nextLimit } : c)));
      setIsEditingCustomer(false);
      toast("Kliyan mete ajou", "Chanjman yo anrejistre nan istwa kliyan an.", "success");
    } catch (e: any) {
      toast("Erè", e?.message ?? "Mete kliyan ajou echwe", "error");
    }
  }

  const renderDetail = () => (
    <>
      {/* Profile header card */}
      <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, overflow: "hidden", boxShadow: shadow.card }}>
        <div style={{ padding: 16, display: "flex", gap: 12, alignItems: "center", borderBottom: `0.5px solid ${palette.hairline}`, flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, alignItems: "center", justifyContent: "center", display: "flex", flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: palette.ink }}>{(selectedCustomer?.name?.[0] ?? "•").toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: palette.ink, letterSpacing: -0.3 }}>{selectedCustomer?.name}</span>
              <span style={{ background: (debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0)).length > 0 ? palette.dangerBg : palette.successBg, border: `0.5px solid ${(debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0)).length > 0 ? palette.dangerBd : palette.successBd}`, borderRadius: 20, padding: "1px 7px", fontSize: 10.5, fontWeight: 600, color: (debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0)).length > 0 ? "#7F1D1D" : "#065F46" }}>
                {(debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0)).length > 0 ? `${(debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0)).length} dèt aktif` : "A jou"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: palette.muted, marginTop: 3 }}>
              NIF/CIN {selectedCustomer?.id_card_number || "—"} • {selectedCustomer?.phone || "Pa gen telefòn"}{selectedCustomer?.address ? ` • ${selectedCustomer.address}` : ""}
            </div>
          </div>
          {canManageCustomers && (
            <button onClick={() => setIsEditingCustomer(true)} style={{ background: palette.surface, border: `0.5px solid ${palette.hairlineStrong}`, borderRadius: 20, padding: "8px 14px", cursor: "pointer", boxShadow: shadow.soft, fontFamily: "inherit" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: palette.ink }}>✎ Modifye</span>
            </button>
          )}
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 140, background: palette.bgWarm, border: `0.5px solid ${palette.hairline}`, borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: palette.muted2, letterSpacing: 0.6 }}>DÈT TOTAL</div>
              <div style={{ fontWeight: 800, fontSize: 16, ...monoStyle, marginTop: 4, color: Number(selectedCustomer?.total_debt ?? 0) > 0 ? palette.danger : palette.success }}>{fmt(Number(selectedCustomer?.total_debt ?? 0) > 0 ? selectedCustomer?.total_debt : (debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0).reduce((s, d) => s + Number(d.balance ?? 0), 0)))} HTG</div>
              <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>{(selectedCustomer?.open_debt_count ?? debts.filter(d => d.customer_id === selectedCustomer?.id && Number(d.balance) > 0).length)} dèt ouvè</div>
            </div>
            <div style={{ flex: 1, minWidth: 140, background: palette.bgWarm, border: `0.5px solid ${palette.hairline}`, borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: palette.muted2, letterSpacing: 0.6 }}>LIMIT KREDI</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4, color: palette.ink }}>{selectedCustomer?.credit_limit == null ? "San limit" : `${fmt(Number(selectedCustomer.credit_limit))} HTG`}</div>
              {selectedCustomer?.credit_limit_source ? <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>Sous: {selectedCustomer.credit_limit_source}</div> : null}
            </div>
          </div>
        </div>
      </div>

      <ActiveDebtsCard customer={selectedCustomer} debts={debts} />
      <PurchaseHistoryCard customer={selectedCustomer} pastCredits={pastCredits} pastSales={pastSales} showPastCredits={showPastCredits} onToggle={() => setShowPastCredits(v => !v)} />
      <ModificationHistoryCard history={customerHistory} />
    </>
  );

  return (
    <div style={{ width: "100%" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 220, gap: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: palette.muted2 }}>CRM • ISTWA • LIMIT</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1, color: palette.ink, marginTop: 2 }}>Kliyan</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, borderRadius: 20, padding: "4px 8px", fontSize: 11, fontWeight: 700, color: palette.ink }}>{customers.length} kliyan • {debts.length} dèt aktif</span>
          {canManageCustomers && <Button label="＋ Nouvo Kliyan" onClick={() => setShowAddCustomer(true)} icon="user-add" />}
        </div>
      </div>

      {isDesktopWide ? (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Master list */}
          <div style={{ flex: 5, minWidth: 300, background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, overflow: "hidden", boxShadow: shadow.card }}>
            <SearchHeader search={search} setSearch={setSearch} showDebtOnly={showDebtOnly} setShowDebtOnly={setShowDebtOnly} customers={customers} debts={debts} />
            <div style={{ padding: 10, gap: 8, display: "flex", flexDirection: "column", background: palette.surface2 }}>
              {displayCustomers.length === 0 ? (
                <CustomerListEmpty />
              ) : (
                displayCustomers.map(item => (
                  <CustomerRowCard key={`${item.id}`} item={item} debts={debts} isSelected={item.id === selectedCustomerId} onPress={() => setSelectedCustomerId(item.id === selectedCustomerId ? null : item.id)} />
                ))
              )}
            </div>
          </div>

          {/* Inspector */}
          <div style={{ flex: 7, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {!selectedCustomer ? (
              <div style={{ background: palette.surface, borderRadius: radius.lg, border: `0.5px solid ${palette.hairline}`, padding: 28, alignItems: "center", justifyContent: "center", boxShadow: shadow.card, textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, alignItems: "center", justifyContent: "center", display: "flex", margin: "0 auto 10px" }}>
                  <span style={{ fontSize: 18, color: palette.muted2 }}>◯</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: palette.ink }}>Chwazi yon kliyan</div>
                <div style={{ color: palette.muted2, fontSize: 13, marginTop: 4 }}>Klike sou lis la pou wè dosye konplè — dèt, limit, istwa Kredi ak Kach separe.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {renderDetail()}
                <Button label="Fèmen" onClick={() => setSelectedCustomerId(null)} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <SearchHeader search={search} setSearch={setSearch} showDebtOnly={showDebtOnly} setShowDebtOnly={setShowDebtOnly} customers={customers} debts={debts} />
          <div style={{ marginTop: 10, gap: 10, display: "flex", flexDirection: "column" }}>
            {displayCustomers.length === 0 ? (
              <CustomerListEmpty />
            ) : (
              displayCustomers.map(item => (
                <CustomerRowCard key={`${item.id}`} item={item} debts={debts} isSelected={item.id === selectedCustomerId} onPress={() => setSelectedCustomerId(item.id === selectedCustomerId ? null : item.id)} />
              ))
            )}
          </div>
        </>
      )}

      {/* Detail sheet (phone/non-wide) */}
      {selectedCustomer && !isDesktopWide && (
        <Overlay onClose={() => setSelectedCustomerId(null)} align="center" width={640}>
          <ModalHeader title={selectedCustomer.name ?? "Kliyan"} onClose={() => setSelectedCustomerId(null)} sub={`ID ${selectedCustomer.id_card_number || "—"}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "68vh", overflowY: "auto", paddingRight: 2 }}>
            {renderDetail()}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <Button label="Fèmen" onClick={() => setSelectedCustomerId(null)} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {/* Edit customer modal */}
      {isEditingCustomer && selectedCustomer && (
        <Overlay onClose={() => setIsEditingCustomer(false)} width={520}>
          <ModalHeader title="Modifye enfòmasyon" onClose={() => setIsEditingCustomer(false)} sub="Chanje sèlman sa ou vle — rès ap konsève" />
          <Field label="Non konplè" required>
            <TextInput value={editPayload.name} onChange={v => setEditPayload(p => ({ ...p, name: v }))} placeholder="Non kliyan" />
          </Field>
          <Field label="Kat idantite (NIF/CIN)" required>
            <TextInput value={editPayload.id_card_number} onChange={v => setEditPayload(p => ({ ...p, id_card_number: v }))} placeholder="—" />
          </Field>
          <Field label="Telefòn">
            <TextInput value={editPayload.phone} onChange={v => setEditPayload(p => ({ ...p, phone: v }))} placeholder="+509 —" />
          </Field>
          <Field label="Adrès">
            <TextInput value={editPayload.address} onChange={v => setEditPayload(p => ({ ...p, address: v }))} placeholder="Eg. Delmas 33, Pétion-Ville" />
          </Field>
          <div style={{ background: palette.surface, borderRadius: radius.md, border: `0.5px solid ${isManagerPlus ? palette.violetBd : palette.hairline}`, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: palette.ink }}>Limit kredi</span>
              {!isManagerPlus && <span style={{ background: palette.surfaceGrouped, border: `0.5px solid ${palette.hairline}`, borderRadius: 20, padding: "1px 8px", fontSize: 10, fontWeight: 600, color: palette.muted3 }}>Manager+</span>}
            </div>
            <div style={{ marginTop: 6 }}>
              <TextInput
                value={editPayload.credit_limit}
                onChange={v => setEditPayload(p => ({ ...p, credit_limit: v }))}
                numeric
                disabled={!isManagerPlus}
                placeholder={selectedCustomer.credit_limit == null ? "San limit" : String(selectedCustomer.credit_limit)}
              />
            </div>
            <div style={{ fontSize: 11, color: palette.muted3, marginTop: 8 }}>{isManagerPlus ? "Kite vid pou san limit" : "Kesye pa ka modifye limit"}</div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button label="Anile" variant="ghost" onClick={() => setIsEditingCustomer(false)} style={{ flex: 1 }} />
            <Button label="Anrejistre" onClick={handleSaveCustomer} style={{ flex: 1 }} />
          </div>
        </Overlay>
      )}

      {/* Add customer modal */}
      {showAddCustomer && (
        <Overlay onClose={() => setShowAddCustomer(false)} width={520}>
          <ModalHeader title="Nouvo kliyan" onClose={() => setShowAddCustomer(false)} sub={canManageCustomers ? "Kreye dosye kliyan — verifye NIF/CIN" : ""} />
          <Field label="Non konplè" required>
            <TextInput value={newCustomer.name} onChange={v => setNewCustomer(p => ({ ...p, name: v }))} placeholder="Eg. Jean Pierre" />
          </Field>
          <Field label="NIF / CIN" required>
            <TextInput value={newCustomer.id_card_number} onChange={v => setNewCustomer(p => ({ ...p, id_card_number: v }))} placeholder="—" />
          </Field>
          <Field label="Telefòn">
            <TextInput value={newCustomer.phone} onChange={v => setNewCustomer(p => ({ ...p, phone: v }))} placeholder="+509 —" />
          </Field>
          <Field label="Adrès">
            <TextInput value={newCustomer.address} onChange={v => setNewCustomer(p => ({ ...p, address: v }))} placeholder="Eg. Delmas 33, Pétion-Ville" />
          </Field>
          {isManagerPlus && (
            <Field label="Limit kredi (opsyonèl)">
              <TextInput value={newCustomer.credit_limit} onChange={v => setNewCustomer(p => ({ ...p, credit_limit: v }))} numeric placeholder="San limit" />
              <div style={{ fontSize: 11, color: palette.muted3, marginTop: 6 }}>Kite vid pou san limit</div>
            </Field>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button label="Anile" variant="ghost" onClick={() => setShowAddCustomer(false)} style={{ flex: 1 }} />
            {canManageCustomers && <Button label="Kreye" onClick={handleAddCustomer} style={{ flex: 1 }} icon="checkmark" />}
          </div>
        </Overlay>
      )}
    </div>
  );
}

export default CustomersPage;