// Customer modal for the pay flow: search + recent 10 + shared New Customer
// form. Responsive: desktop centered card, tablet centered column (mobile
// tablet pattern), phone full-screen sheet (mobile phone pattern).
import React, { useMemo, useRef, useState } from "react";
import { palette, radius } from "../lib/theme";
import { useResponsive } from "../lib/responsive";
import { getDb } from "../lib/db";
import { Button, EmptyState, ModalHeader, Overlay, SearchBar, toast } from "./ui";
import { Icon } from "./Icon";
import CustomerForm, {
  EMPTY_CUSTOMER_FORM, fullNameOf, composeAddress, type CustomerFormData,
} from "./CustomerForm";

type Customer = {
  id: string;
  store_id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  id_card_number?: string | null;
  email?: string | null;
  total_debt?: number;
  first_name?: string | null;
  last_name?: string | null;
  birth_day?: string | null;
  birth_month?: string | null;
  birth_year?: string | null;
  country?: string | null;
  department?: string | null;
  commune?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  marketing_consent?: number | null;
};

export function CustomerModal({ storeId, customers, canAdd, onSelect, onClose, onAdded }: {
  storeId: string;
  customers: Customer[];
  canAdd: boolean;
  onSelect: (c: Customer | null) => void;
  onClose: () => void;
  onAdded?: (c: Customer) => void;
}) {
  const { isTablet, isDesktop } = useResponsive();
  // Phone (< tablet): full-screen sheet like mobile phone. Tablet: centered
  // column like mobile tablet. Desktop: wider centered card.
  const sheet = !isTablet;
  const [q, setQ] = useState("");
  const [view, setView] = useState<"list" | "new">("list");
  const [formKey, setFormKey] = useState(0);
  const [formValid, setFormValid] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<{ data: CustomerFormData; valid: boolean }>({ data: EMPTY_CUSTOMER_FORM, valid: false });

  const recent = useMemo(() => [...customers].reverse().slice(0, 10), [customers]);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return recent;
    return customers.filter(c =>
      c.name.toLowerCase().includes(needle) ||
      (c.phone ?? "").toLowerCase().includes(needle) ||
      (c.id_card_number ?? "").toLowerCase().includes(needle)
    );
  }, [customers, recent, q]);

  function pick(c: Customer) {
    onSelect(c);
    onClose();
  }

  async function save() {
    const { data, valid } = formRef.current;
    if (!valid) return;
    if (!canAdd) return;
    setSaving(true);
    try {
      const db = await getDb();
      const id = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const email = data.email.trim() || null;
      await db.runAsync(
        "INSERT INTO customers (id, store_id, name, phone, address, id_card_number, total_debt, credit_limit, credit_limit_source, is_high_risk, open_debt_count) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [id, storeId, fullNameOf(data), data.phone.trim() || null, composeAddress(data), data.idDoc.trim(), 0, null, null, 0, 0]
      );
      if (email) {
        try { await db.runAsync("UPDATE customers SET email = ? WHERE id = ?", [email, id]); } catch {}
      }
      const fresh: Customer = {
        id, store_id: storeId, name: fullNameOf(data),
        phone: data.phone.trim() || null, address: composeAddress(data),
        id_card_number: data.idDoc.trim(), email, total_debt: 0,
        first_name: data.firstName.trim(), last_name: data.lastName.trim(),
        birth_day: data.birthDay, birth_month: data.birthMonth, birth_year: data.birthYear,
        country: data.country, department: data.department.trim() || null,
        commune: data.commune.trim(), address_line1: data.line1.trim(),
        address_line2: data.line2.trim() || null,
        marketing_consent: data.marketingConsent ? 1 : 0,
      };
      onAdded?.(fresh);
      onSelect(fresh);
      onClose();
    } catch (e: any) {
      toast("Erè", e?.message ?? "Ajoute kliyan echwe", "error");
    } finally {
      setSaving(false);
    }
  }

  const body = view === "list" ? (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Chèche kliyan (non, NIF, telefòn)…" />
      {!q.trim() ? (
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: palette.muted2, margin: "12px 0 8px" }}>RECENTLY CREATED</div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", maxHeight: sheet ? undefined : 380, flex: sheet ? 1 : undefined }}>
        {results.length === 0 ? (
          <EmptyState icon="user" title="Pa jwenn kliyan" body="Eseye yon lòt rechèch oswa kreye nouvo kliyan." />
        ) : (
          results.map(c => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, background: palette.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: palette.inkSoft, flexShrink: 0 }}>
                {(c.name?.[0] ?? "•").toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: palette.muted2 }}>{c.phone ?? "—"} • {c.id_card_number ?? "—"}</div>
              </div>
              <Icon name="chevron-right" size={15} color={palette.muted3} />
            </button>
          ))
        )}
      </div>
    </>
  ) : (
    <div style={{ overflowY: "auto", flex: 1 }}>
      <CustomerForm
        key={`new-cust-${formKey}`}
        onState={(data, valid) => { formRef.current = { data, valid }; setFormValid(valid); }}
      />
    </div>
  );

  const head = view === "list" ? (
    <ModalHeader
      title="Kliyan"
      onClose={onClose}
      sub={canAdd ? undefined : "Kesye ka sèlman chwazi — pa ka kreye"}
    />
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <button onClick={() => setView("list")} style={{ width: 34, height: 34, borderRadius: 10, border: `0.5px solid ${palette.hairlineStrong}`, background: palette.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="arrow-left" size={16} />
      </button>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 800, textAlign: "center" }}>New Customer</div>
      <Button label={saving ? "…" : "Save"} disabled={!formValid || saving} onClick={save} />
    </div>
  );

  if (sheet) {
    // Phone: full-screen sheet, bottom Save bar (mobile phone pattern).
    return (
      <Overlay onClose={onClose} width={560} align="bottom">
        {head}
        {view === "list" && canAdd ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button label="＋ Nouvo" size="sm" onClick={() => { formRef.current = { data: EMPTY_CUSTOMER_FORM, valid: false }; setFormValid(false); setFormKey(k => k + 1); setView("new"); }} />
          </div>
        ) : null}
        {body}
        {view === "new" ? (
          <div style={{ display: "flex", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `0.5px solid ${palette.hairline}` }}>
            <Button label="Retounen" variant="ghost" style={{ flex: 1 }} onClick={() => setView("list")} />
            <Button label={saving ? "Ap anrejistre…" : "Save"} style={{ flex: 2 }} disabled={!formValid || saving} onClick={save} />
          </div>
        ) : null}
      </Overlay>
    );
  }

  // Tablet/desktop: centered card (mobile tablet pattern → desktop widths).
  return (
    <Overlay onClose={onClose} width={isDesktop ? 720 : 560}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {view === "new" ? (
          <button onClick={() => setView("list")} style={{ width: 34, height: 34, borderRadius: 10, border: `0.5px solid ${palette.hairlineStrong}`, background: palette.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="arrow-left" size={16} />
          </button>
        ) : null}
        <div style={{ flex: 1 }}>
          <ModalHeader title={view === "list" ? "Kliyan" : "New Customer"} onClose={onClose} sub={view === "list" && !canAdd ? "Kesye ka sèlman chwazi — pa ka kreye" : undefined} />
        </div>
        {view === "list" ? (
          canAdd ? (
            <Button label="＋ Nouvo" size="sm" onClick={() => { formRef.current = { data: EMPTY_CUSTOMER_FORM, valid: false }; setFormValid(false); setFormKey(k => k + 1); setView("new"); }} />
          ) : null
        ) : (
          <Button label={saving ? "…" : "Save"} disabled={!formValid || saving} onClick={save} />
        )}
      </div>
      {body}
      {view === "new" && !isDesktop ? (
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <Button label="Retounen" variant="ghost" style={{ flex: 1 }} onClick={() => setView("list")} />
          <Button label={saving ? "Ap anrejistre…" : "Save"} style={{ flex: 2 }} disabled={!formValid || saving} onClick={save} />
        </div>
      ) : null}
    </Overlay>
  );
}
