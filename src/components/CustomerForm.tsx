// Shared New Customer body form — THE general design for creating a customer
// anywhere in the web app. Same sections, order and validation as mobile.
// Body only: the caller renders Save and disables it from `valid`.
// Desktop: two-column rows. Tablet/phone: stacked (mobile patterns).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { palette, radius } from "../lib/theme";
import { useResponsive } from "../lib/responsive";
import { Field, TextInput, Select } from "./ui";
import { Icon } from "./Icon";
import COUNTRIES from "../lib/data/countries.json";
import DEPARTMENTS from "../lib/data/haitiDepartments.json";

export type CustomerFormData = {
  firstName: string;
  lastName: string;
  idDoc: string;
  phone: string;
  email: string;
  marketingConsent: boolean;
  country: string;
  department: string;
  commune: string;
  line1: string;
  line2: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
};

export const EMPTY_CUSTOMER_FORM: CustomerFormData = {
  firstName: "",
  lastName: "",
  idDoc: "",
  phone: "",
  email: "",
  marketingConsent: false,
  country: "HT",
  department: "",
  commune: "",
  line1: "",
  line2: "",
  birthDay: "",
  birthMonth: "",
  birthYear: "",
};

export const MONTHS = [
  { code: "01", name: "Janvier" }, { code: "02", name: "Février" },
  { code: "03", name: "Mars" }, { code: "04", name: "Avril" },
  { code: "05", name: "Mai" }, { code: "06", name: "Juin" },
  { code: "07", name: "Juillet" }, { code: "08", name: "Août" },
  { code: "09", name: "Septembre" }, { code: "10", name: "Octobre" },
  { code: "11", name: "Novembre" }, { code: "12", name: "Décembre" },
];

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function daysInMonth(y: string, m: string): number {
  const year = parseInt(y, 10);
  const month = parseInt(m, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return 31;
  return new Date(year, month, 0).getDate();
}

export function validateCustomerForm(d: CustomerFormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!d.firstName.trim()) errors.push("firstName");
  if (!d.lastName.trim()) errors.push("lastName");
  if (!d.idDoc.trim()) errors.push("idDoc");
  if (d.phone.replace(/[^0-9]/g, "").length < 7) errors.push("phone");
  if (d.email.trim() && !isValidEmail(d.email)) errors.push("email");
  if (!d.country) errors.push("country");
  if (d.country === "HT" && !d.department) errors.push("department");
  if (!d.commune.trim()) errors.push("commune");
  if (!d.line1.trim()) errors.push("line1");
  const day = parseInt(d.birthDay, 10);
  const year = parseInt(d.birthYear, 10);
  const nowYear = new Date().getFullYear();
  if (isNaN(day) || day < 1 || day > daysInMonth(d.birthYear, d.birthMonth)) errors.push("birthDay");
  if (!d.birthMonth) errors.push("birthMonth");
  if (isNaN(year) || d.birthYear.trim().length !== 4 || year < 1900 || year > nowYear) errors.push("birthYear");
  return { valid: errors.length === 0, errors };
}

type Opt = { code: string; name: string };

export function countryName(code: string): string {
  return (COUNTRIES as Opt[]).find(c => c.code === code)?.name ?? code;
}

export function deptName(code: string): string {
  return (DEPARTMENTS as Opt[]).find(d => d.code === code)?.name ?? code;
}

export function composeAddress(d: CustomerFormData): string {
  const parts = [
    d.line1.trim(),
    d.line2.trim(),
    d.commune.trim(),
    d.country === "HT" ? deptName(d.department) : d.department.trim(),
    countryName(d.country),
  ].filter(Boolean);
  return parts.join(", ");
}

export function fullNameOf(d: CustomerFormData): string {
  return `${d.firstName.trim()} ${d.lastName.trim()}`.trim();
}

function Bar() {
  return <div style={{ borderTop: `0.5px solid ${palette.hairline}`, margin: "14px 0" }} />;
}

export default function CustomerForm({ initial, onState }: {
  initial?: Partial<CustomerFormData>;
  onState?: (data: CustomerFormData, valid: boolean) => void;
}) {
  const { isDesktop, isLargeTablet } = useResponsive();
  const twoCol = isDesktop || isLargeTablet;
  const [d, setD] = useState<CustomerFormData>({ ...EMPTY_CUSTOMER_FORM, ...initial });
  const set = (k: keyof CustomerFormData) => (v: string | boolean) =>
    setD(prev => ({ ...prev, [k]: v }));
  const { valid } = useMemo(() => validateCustomerForm(d), [d]);
  const cb = useRef(onState);
  cb.current = onState;
  const last = useRef("");
  useEffect(() => {
    const key = JSON.stringify([d, valid]);
    if (key !== last.current) { last.current = key; cb.current?.(d, valid); }
  }, [d, valid]);

  const days = useMemo(() => {
    const max = daysInMonth(d.birthYear || "2000", d.birthMonth || "01");
    return [{ value: "", label: "JJ" }, ...Array.from({ length: max }, (_, i) => ({ value: String(i + 1).padStart(2, "0"), label: String(i + 1) }))];
  }, [d.birthYear, d.birthMonth]);

  const row = (a: React.ReactNode, b?: React.ReactNode) =>
    twoCol && b ? (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{a}{b}</div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column" }}>{a}{b}</div>
    );

  return (
    <div>
      {row(
        <Field label="FirstName" required><TextInput value={d.firstName} onChange={set("firstName")} placeholder="Ex. Marie" /></Field>,
        <Field label="LastName" required><TextInput value={d.lastName} onChange={set("lastName")} placeholder="Ex. Joseph" /></Field>
      )}
      {row(
        <Field label="CIN / NIF / Passport" required><TextInput value={d.idDoc} onChange={set("idDoc")} placeholder="Nimewo dokiman" /></Field>,
        <Field label="Phone Number" required><TextInput value={d.phone} onChange={v => set("phone")(v.replace(/[^0-9+ ]/g, ""))} numeric placeholder="+509 …" /></Field>
      )}
      <Field label="Email" hint="Opsyonèl"><TextInput value={d.email} onChange={set("email")} placeholder="kliyan@egzanp.com" /></Field>
      <button
        onClick={() => set("marketingConsent")(!d.marketingConsent)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 12, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, background: palette.surfaceGrouped, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
      >
        <span style={{ width: 38, height: 22, borderRadius: 11, background: d.marketingConsent ? palette.success : palette.muted3, position: "relative", flexShrink: 0, transition: "background .15s" }}>
          <span style={{ position: "absolute", top: 2, left: d.marketingConsent ? 18 : 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: palette.ink }}>Subscribe to marketing channel</span>
      </button>
      {d.marketingConsent ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8, background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: radius.md, padding: 10, fontSize: 11, color: palette.warning }}>
          <Icon name="info" size={14} /> Customer should be ask for consentment.
        </div>
      ) : null}

      <Bar />
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Address</div>
      <Field label="Country" required>
        <Select value={d.country} onChange={set("country")} options={(COUNTRIES as Opt[]).map(c => ({ value: c.code, label: c.name }))} />
      </Field>
      {d.country === "HT" ? (
        <Field label="Department / Province" required>
          <Select value={d.department} onChange={set("department")} options={[{ value: "", label: "Chwazi…" }, ...(DEPARTMENTS as Opt[]).map(x => ({ value: x.code, label: x.name }))]} />
        </Field>
      ) : (
        <Field label="Department / Province" required>
          <TextInput value={d.department} onChange={set("department")} placeholder="Pwovens / Eta" />
        </Field>
      )}
      {row(
        <Field label="Commune / City" required><TextInput value={d.commune} onChange={set("commune")} placeholder="Ex. Pétion-Ville" /></Field>,
        <Field label="Address line 1" required><TextInput value={d.line1} onChange={set("line1")} placeholder="Ex. Rue Panaméricaine 12" /></Field>
      )}
      <Field label="Address line 2" hint="Opsyonèl"><TextInput value={d.line2} onChange={set("line2")} placeholder="Apt, étage…" /></Field>

      <Bar />
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10 }}>Birthday</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 10 }}>
        <Field label="Day" required>
          <Select value={d.birthDay} onChange={set("birthDay")} options={days} />
        </Field>
        <Field label="Month" required>
          <Select value={d.birthMonth} onChange={set("birthMonth")} options={[{ value: "", label: "MM" }, ...MONTHS.map(m => ({ value: m.code, label: m.name }))]} />
        </Field>
        <Field label="Year" required>
          <TextInput value={d.birthYear} onChange={v => set("birthYear")(v.replace(/[^0-9]/g, "").slice(0, 4))} numeric placeholder="AAAA" maxLength={4} />
        </Field>
      </div>
    </div>
  );
}
