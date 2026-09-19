import React from "react";
import { palette } from "../lib/theme";

export function LoadScreen({ label = "Chargement…" }: { label?: string }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: palette.bg, gap: 12 }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "#fff", border: "0.5px solid rgba(200,162,74,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}>
        <img src="/kourro-logo.png" alt="Kourro" style={{ width: 36, height: 36, objectFit: "contain" }} />
      </div>
      <div style={{ fontSize: 12, color: palette.muted2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}