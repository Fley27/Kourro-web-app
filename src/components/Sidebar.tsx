import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { palette } from "../lib/theme";
import { Icon } from "./Icon";
import { useAuthStore } from "../lib/authStore";

export type SidebarItem = { to: string; label: string; icon: string; admin?: boolean; inventory?: boolean };

const NAV: { group: string; items: SidebarItem[] }[] = [
  {
    group: "Jounen an",
    items: [
      { to: "/", label: "Dashboard", icon: "home" },
      { to: "/pos", label: "Vant (POS)", icon: "cart" },
    ],
  },
  {
    group: "Envanntè",
    items: [
      { to: "/stock", label: "Stock", icon: "cube" },
      { to: "/inventory", label: "Achè & Invantè", icon: "layers", inventory: true },
      { to: "/price-history", label: "Istwa pri", icon: "pricetag" },
    ],
  },
  {
    group: "Kliyan & Kredi",
    items: [
      { to: "/customers", label: "Kliyan", icon: "people" },
      { to: "/credits", label: "Vant ak Kredi", icon: "card" },
    ],
  },
  {
    group: "Rapò",
    items: [
      { to: "/sales", label: "Vant & Koreksyon", icon: "receipt" },
      { to: "/shift", label: "Rakont Mòn", icon: "clock" },
    ],
  },
  {
    group: "Jesyon",
    items: [
      { to: "/notifications", label: "Notifikasyon", icon: "bell" },
      { to: "/team", label: "Ekip", icon: "user-add", admin: true },
      { to: "/stores", label: "Kòd magazen", icon: "store", admin: true },
      { to: "/security", label: "Sekirite", icon: "shield", admin: true },
      { to: "/account", label: "Kont", icon: "user" },
    ],
  },
];

function SidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const { user, cached, signOut } = useAuthStore();
  const nav = useNavigate();
  const loc = useLocation();
  const isAdminish = user?.role === "owner" || user?.role === "admin";
  const isInventoryish = user?.role === "owner" || user?.role === "admin" || user?.role === "manager";
  const displayName = cached?.name ?? user?.name ?? "Opsyon";
  const displaySub = cached?.store ?? user?.role ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: 236, background: palette.ink2, color: "#fff" }}>
      <div style={{ padding: "22px 18px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(200,162,74,0.18)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <img src="/kourro-logo.png" alt="Kourro" style={{ width: 30, height: 30, objectFit: "contain" }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: -0.3 }}>Kabinè</div>
          <div style={{ fontSize: 9.5, color: "rgba(246,241,228,0.55)", letterSpacing: 0.4 }}>RETAIL MANAGEMENT</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 20px" }}>
        {NAV.map(g => (
          <div key={g.group} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "rgba(246,241,228,0.5)", padding: "0 10px 6px" }}>{g.group}</div>
            {g.items
              .filter(i => (!i.admin || isAdminish) && (!i.inventory || isInventoryish))
              .map(i => {
                const active = loc.pathname === i.to || (i.to !== "/" && loc.pathname.startsWith(i.to));
                return (
                  <button
                    key={i.to}
                    onClick={() => { nav(i.to); onNavigate(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      padding: "9px 12px", marginBottom: 2, borderRadius: 12, border: "none",
                      background: active ? "rgba(200,162,74,0.16)" : "transparent",
                      color: active ? palette.accentGold : "rgba(246,241,228,0.72)",
                      fontWeight: active ? 700 : 500, fontSize: 13,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background .12s ease",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <Icon name={i.icon} size={17} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.label}</span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      <div style={{ padding: 14, borderTop: "0.5px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 50, background: palette.accentGold, color: palette.ink, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, textTransform: "uppercase" }}>
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
            <div style={{ fontSize: 10, color: "rgba(246,241,228,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displaySub}</div>
          </div>
          <button onClick={() => { signOut(); nav("/login"); }} title="Dekonekte" style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(246,241,228,0.72)", cursor: "pointer", width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="log-out" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ mobile }: { mobile: boolean }) {
  if (mobile) {
    // renders inside a full-screen drawer (state managed by Layout)
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          style={{ position: "fixed", top: 12, left: 12, zIndex: 980, width: 38, height: 38, borderRadius: 12, background: palette.ink2, border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          aria-label="Meni"
        >
          <Icon name="menu" size={19} />
        </button>
        {open ? (
          <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(22,19,12,0.5)", zIndex: 1200 }} onClick={() => setOpen(false)} />
            <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 1210 }}>
              <SidebarBody onNavigate={() => setOpen(false)} />
            </div>
          </>
        ) : null}
      </>
    );
  }
  return (
    <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 236, zIndex: 900 }}>
      <SidebarBody onNavigate={() => {}} />
    </div>
  );
}