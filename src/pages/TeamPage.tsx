import React, { useMemo } from "react";
import { palette } from "../lib/theme";
import { useAuthStore } from "../lib/authStore";
import { useEmployees, type Employee } from "../lib/team";
import { USERS } from "../lib/users";
import { TeamPanel } from "../components/TeamPanel";

function seedEmployees(): Employee[] {
  return USERS.map(u => ({
    id: u.id,
    name: u.name,
    role: u.role,
    phone: u.phone ?? "",
    store: u.store ?? "Petyonvil",
    lastAction: u.role === "cashier" ? "Vente #VTE-1021 • il y a 12 min" : u.role === "manager" ? "Ajustement stock • il y a 1 h" : "Clôture caisse • hier",
    kpi: u.role === "cashier" ? "22 ventes • 1,540 HTG/panier" : "18 tâches • 98% précision",
    salary: u.role === "owner" ? "45,000 HTG" : u.role === "admin" ? "32,000 HTG" : u.role === "manager" ? "25,000 HTG" : "12,000 HTG",
    address: u.id === "owner-1" ? "Pétion-Ville, Rue Panaméricaine 12" : u.id === "admin-1" ? "Delmas 33, Impasse Lafleur" : u.id === "manager-1" ? "Carrefour, Bizoton 45" : "Kenscoff, Route de Furcy",
    isOnline: u.role === "owner" || u.role === "admin" ? true : Math.random() > 0.4,
    emergency: u.id === "owner-1" ? { name: "Marie Owner", address: "Pétion-Ville, Rue Clerveaux 8", phone: "+509 3100 0001" } : u.id === "admin-1" ? { name: "Jean Admin", address: "Delmas 31, Rue Tirlemont", phone: "+509 3100 0002" } : u.id === "manager-1" ? { name: "Sophie Manager", address: "Carrefour, Mahotière 12", phone: "+509 3100 0003" } : { name: "Luc Cashier", address: "Pétion-Ville, Laboule 10", phone: "+509 3100 0004" },
    active: true,
    secret: u.secret,
    password: `${u.id}-pass`,
  }));
}

export function TeamPage() {
  const { user, cached } = useAuthStore();
  const role = (user?.role ?? "cashier") as "owner" | "admin" | "manager" | "cashier";
  const activeStore = cached?.store ?? user?.store ?? "Petyonvil";
  const initial = useMemo(seedEmployees, []);
  const { employees, setEmployees } = useEmployees(initial);

  const currentUser = user ?? {
    id: cached?.userId ?? "",
    name: cached?.name ?? "Itilizatè",
    role,
    secret: cached?.pin ?? "",
    store: cached?.store ?? "Petyonvil",
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, color: palette.muted3, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>JESYON • EKIP</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: palette.ink, letterSpacing: -0.5, marginTop: 3 }}>Ekip</div>
        <div style={{ fontSize: 13, color: palette.muted2, marginTop: 3 }}>Gere anplwaye yo — wòl, kòd, maj aktivasyon.</div>
      </div>

      <TeamPanel
        employees={employees}
        setEmployees={setEmployees}
        currentUser={currentUser as any}
        role={role}
        activeStore={activeStore}
      />
    </div>
  );
}