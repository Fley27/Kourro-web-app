import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SyncBadge } from "./SyncBadge";
import { ToastHost } from "./ui";
import { palette } from "../lib/theme";
import { useResponsive } from "../lib/responsive";

export function Layout() {
  const { isDesktop } = useResponsive();
  return (
    <div style={{ minHeight: "100vh", background: palette.bg }}>
      <Sidebar mobile={!isDesktop} />
      <div style={{ marginLeft: isDesktop ? 236 : 0, minHeight: "100vh" }}>
        <header
          style={{
            position: "sticky", top: 0, zIndex: 950,
            background: palette.bg,
            borderBottom: `0.5px solid ${palette.hairline}`,
            padding: `12px ${isDesktop ? 28 : 74}px 10px ${isDesktop ? 28 : 16}px`,
            display: "flex", alignItems: "center", gap: 10,
          }}
        >
          <div style={{ flex: 1 }} />
          <SyncBadge />
        </header>
        <main style={{ padding: isDesktop ? 26 : 18, paddingBottom: 80, maxWidth: 1180, margin: "0 auto" }}>
          <Outlet />
        </main>
      </div>
      <ToastHost />
    </div>
  );
}