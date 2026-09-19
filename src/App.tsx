import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./lib/authStore";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { POSPage } from "./pages/POSPage";
import { StockPage } from "./pages/StockPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PriceHistoryPage } from "./pages/PriceHistoryPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CreditsPage } from "./pages/CreditsPage";
import { SalesPage } from "./pages/SalesPage";
import { ShiftReportPage } from "./pages/ShiftReportPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { StoresPage } from "./pages/StoresPage";
import { TeamPage } from "./pages/TeamPage";
import { SecurityPage } from "./pages/SecurityPage";
import { AccountPage } from "./pages/AccountPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore(s => s.status);
  if (status === "loading") return null;
  if (status === "signedout") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#837b69" }}>Paj sa a ap konstrui — retounen pi tar.</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/price-history" element={<PriceHistoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/shift" element={<ShiftReportPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/security" element={<SecurityPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
