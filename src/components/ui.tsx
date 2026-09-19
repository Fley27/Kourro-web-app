import React, { useEffect } from "react";
import { create } from "zustand";
import { palette, radius, shadow } from "../lib/theme";
import { Icon } from "./Icon";
import clsx from "clsx";

export function cx(...xs: (string | false | null | undefined)[]) {
  return clsx(...xs);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type BtnVariant = "primary" | "gold" | "ghost" | "danger" | "success" | "soft" | "light";
export function Button({
  label,
  onClick,
  variant = "primary",
  icon,
  size = "md",
  block,
  disabled,
  type,
  style,
  className,
}: {
  label?: React.ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  icon?: string;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: React.CSSProperties;
  className?: string;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    fontWeight: 700,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "opacity .15s ease, transform .05s ease",
    fontFamily: "inherit",
    fontSize: size === "sm" ? 11 : size === "lg" ? 15 : 13,
    padding: size === "sm" ? "7px 12px" : size === "lg" ? "14px 22px" : "11px 18px",
    ...style,
  };
  if (block) base.width = "100%";
  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: palette.accent, color: palette.emberInk, boxShadow: "0 4px 14px rgba(255,77,0,0.32)" },
    gold: { background: "transparent", color: palette.accentGold, border: `1px solid ${palette.accentGold}` },
    ghost: { background: "transparent", color: palette.ink, border: `1px solid ${palette.hairlineStrong}` },
    danger: { background: palette.danger, color: "#fff" },
    success: { background: palette.success, color: "#fff" },
    soft: { background: palette.surfaceGrouped, color: palette.ink },
    light: { background: "#fff", color: "#16130c", border: "1px solid rgba(22,19,12,0.12)" },
  };
  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      onClick={onClick}
      className={className}
      style={{ ...base, ...variants[variant] }}
    >
      {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Cards & layout
// ---------------------------------------------------------------------------
export function Card({ children, style, className, onClick, accent }: { children: React.ReactNode; style?: React.CSSProperties; className?: string; onClick?: () => void; accent?: "top" | "gold" }) {
  return (
    <div
      onClick={onClick}
      className={cx("card", className)}
      style={{
        background: palette.surface,
        borderRadius: radius.xl,
        border: `0.5px solid ${palette.hairline}`,
        boxShadow: shadow.card,
        ...(accent === "gold" || accent === "top" ? { borderTop: `3px solid ${palette.accentGold}` } : {}),
        ...(onClick ? { cursor: "pointer" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, icon, right }: { children: React.ReactNode; icon?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, width: "100%" }}>
      {icon ? <Icon name={icon} size={16} color={palette.muted2} /> : null}
      <span style={{ fontSize: 13, fontWeight: 700, color: palette.ink, letterSpacing: -0.2 }}>{children}</span>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

export function EmptyState({ icon = "box", title, body }: { icon?: string; title: string; body?: string }) {
  return (
    <div style={{ padding: 26, textAlign: "center", color: palette.muted2 }}>
      <Icon name={icon} size={30} color={palette.muted3} style={{ margin: "0 auto 10px" }} />
      <div style={{ fontSize: 13, fontWeight: 700, color: palette.inkSoft }}>{title}</div>
      {body ? <div style={{ fontSize: 12, marginTop: 4 }}>{body}</div> : null}
    </div>
  );
}

export function KpiMini({ label, value, icon, color = palette.ink, sub }: { label: string; value: React.ReactNode; icon?: string; color?: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {icon ? (
        <div style={{ width: 30, height: 30, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}14`, marginBottom: 6 }}>
          <Icon name={icon} size={15} color={color} />
        </div>
      ) : null}
      <div style={{ fontSize: 9, color: palette.muted2, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2, letterSpacing: -0.4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 10, color: palette.muted3 }}>{sub}</div> : null}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warn" | "danger" | "gold" }) {
  const tones: Record<string, React.CSSProperties> = {
    neutral: { background: palette.surface2, color: palette.muted2 },
    success: { background: palette.successBg, color: palette.success, border: `1px solid ${palette.successBd}` },
    warn: { background: palette.warningBg, color: palette.warning, border: `1px solid ${palette.warningBd}` },
    danger: { background: palette.dangerBg, color: palette.danger, border: `1px solid ${palette.dangerBd}` },
    gold: { background: "rgba(200,162,74,0.16)", color: palette.accentGold, border: `1px solid rgba(200,162,74,0.4)` },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: radius.pill, fontSize: 10, fontWeight: 700, ...tones[tone] }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------
export function Field({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label} {required ? <span style={{ color: palette.danger }}>*</span> : null}
      </span>
      <div style={{ marginTop: 6 }}>{children}</div>
      {hint ? <span style={{ fontSize: 10, color: palette.muted3, marginTop: 4, display: "block" }}>{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  numeric,
  style,
  autoFocus,
  disabled,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  numeric?: boolean;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      type={type}
      inputMode={numeric ? "decimal" : undefined}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%",
        border: `0.5px solid ${palette.hairlineStrong}`,
        borderRadius: radius.md,
        padding: "12px 14px",
        fontSize: 14,
        background: palette.surface,
        color: palette.ink,
        outline: "none",
        fontFamily: "inherit",
        ...(numeric ? { fontVariant: "tabular-nums", fontWeight: 700 } : {}),
        ...style,
      }}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  style?: React.CSSProperties;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: "100%",
        border: `0.5px solid ${palette.hairlineStrong}`,
        borderRadius: radius.md,
        padding: "12px 14px",
        fontSize: 14,
        background: palette.surface,
        color: palette.ink,
        outline: "none",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div style={{ display: "flex", background: palette.surface2, borderRadius: radius.md, padding: 3, border: `0.5px solid ${palette.hairline}`, gap: 2 }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: "8px 6px",
              borderRadius: radius.sm,
              border: "none",
              background: active ? palette.surface2 : "transparent",
              color: active ? palette.ink : palette.muted2,
              fontWeight: active ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: active ? "0 2px 8px rgba(22,19,12,0.22)" : "none",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal / Sheet
// ---------------------------------------------------------------------------
export function Overlay({ onClose, children, align = "center", width = 540, blur = false, fit = false }: { onClose?: () => void; children: React.ReactNode; align?: "center" | "bottom" | "right"; width?: number; blur?: boolean; fit?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && onClose) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(22,19,12,0.42)", zIndex: 1000,
        display: "flex",
        alignItems: align === "center" ? "center" : "flex-end",
        justifyContent: "center",
        padding: align === "center" ? 20 : 0,
        backdropFilter: blur ? "blur(10px)" : undefined,
        WebkitBackdropFilter: blur ? "blur(10px)" : undefined,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: palette.surface,
          borderRadius: align === "center" ? radius.lg : `${radius.lg} ${radius.lg} 0 0`,
          width: fit ? "fit-content" : align === "right" ? Math.min(width, "90vw" as any) : align === "center" ? Math.min(width, `calc(100vw - 40px)` as any) : "100%",
          maxHeight: align === "right" ? "100vh" : "85vh",
          maxWidth: fit ? "min(560px, calc(100vw - 40px))" : align === "center" ? `calc(100vw - 40px)` : undefined,
          overflowY: "auto",
          boxShadow: shadow.elevated,
          padding: 18,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, onClose, sub }: { title: React.ReactNode; onClose: () => void; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: palette.ink, letterSpacing: -0.3 }}>{title}</div>
        {sub ? <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>{sub}</div> : null}
      </div>
      <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: palette.surfaceGrouped, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="close" size={16} color={palette.muted} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog (replaces Alert.alert with two buttons)
// ---------------------------------------------------------------------------
export function Confirm({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "Anile",
  tone = "primary",
  onConfirm,
  onCancel,
  input,
}: {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: BtnVariant;
  onConfirm: () => void;
  onCancel: () => void;
  input?: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string };
}) {
  return (
    <Overlay onClose={onCancel} width={440}>
      <div style={{ fontSize: 15, fontWeight: 700, color: palette.ink }}>{title}</div>
      {message ? <div style={{ fontSize: 12.5, color: palette.muted, marginTop: 6, lineHeight: 1.5 }}>{message}</div> : null}
      {input ? (
        <div style={{ marginTop: 12 }}>
          <TextInput value={input.value} onChange={input.onChange} placeholder={input.placeholder} type={input.type ?? "text"} autoFocus />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <Button label={cancelLabel} variant="ghost" onClick={onCancel} style={{ flex: 1 }} />
        <Button label={confirmLabel} variant={tone} onClick={onConfirm} style={{ flex: 1 }} />
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------------------
// Toast host
// ---------------------------------------------------------------------------
type Toast = { id: number; title: string; body: string; tone: "info" | "success" | "warn" | "error" };
export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, "id">) => void; dismiss: (id: number) => void }>(set => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })), 4200);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}));

export const toast = (title: string, body = "", tone: "info" | "success" | "warn" | "error" = "info") =>
  useToasts.getState().push({ title, body, tone });

export function ToastHost() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  const colors: Record<string, string> = { info: palette.blue, success: palette.success, warn: palette.warningDot, error: palette.danger };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          style={{ background: palette.ink2, color: "#f6f1e4", borderRadius: radius.md, padding: "12px 14px", boxShadow: shadow.elevated, borderLeft: `3px solid ${colors[t.tone]}`, cursor: "pointer", opacity: 0.97 }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t.title}</div>
          {t.body ? <div style={{ fontSize: 11, color: palette.muted3, marginTop: 2 }}>{t.body}</div> : null}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row list item
// ---------------------------------------------------------------------------
export function RowItem({ icon, iconBg, title, sub, right, onClick, tone }: { icon?: string; iconBg?: string; iconColor?: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; onClick?: () => void; tone?: "success" | "danger" | "warn" | "gold" }) {
  const tones: Record<string, string> = {
    success: palette.successBg, danger: palette.dangerBg, warn: palette.warningBg, gold: palette.accentGoldSoft,
  };
  const ic = tone ? tones[tone] : palette.surfaceGrouped;
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 11, padding: "11px 12px",
        borderBottom: `0.5px solid ${palette.separatorSoft}`, cursor: onClick ? "pointer" : "default",
        background: "transparent", transition: "background .12s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = palette.surface2; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {icon ? (
        <div style={{ width: 36, height: 36, borderRadius: 11, background: ic, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={icon} size={17} color={tone === "success" ? palette.success : tone === "danger" ? palette.danger : tone === "warn" ? palette.warning : palette.ink} />
        </div>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: palette.inkSoft }}>{title}</div>
        {sub ? <div style={{ fontSize: 11, color: palette.muted2, marginTop: 2 }}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search bar
// ---------------------------------------------------------------------------
export function SearchBar({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: palette.muted3, display: "flex" }}>
        <Icon name="search" size={16} />
      </span>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Chèche..."}
        style={{
          width: "100%",
          padding: "11px 14px 11px 38px",
          borderRadius: radius.md,
          border: `0.5px solid ${palette.hairline}`,
          background: palette.surface,
          fontSize: 13.5,
          outline: "none",
          fontFamily: "inherit",
          color: palette.ink,
        }}
      />
    </div>
  );
}