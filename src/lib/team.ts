// Team roster — hydrated from the `employees` table (mobile parity).
import { useCallback, useEffect, useState } from "react";
import { getDb } from "./db";

export type Employee = {
  id: string;
  name: string;
  role: string;
  phone?: string;
  address?: string;
  store?: string;
  salary: string;
  secret: string;
  password: string;
  lastAction: string;
  kpi: string;
  isOnline?: boolean;
  active: boolean;
  emergency?: { name: string; address: string; phone: string };
};

export const empStoreId = (store?: string) => store === "Dèlma" ? "st-delma" : "st-petyonvil";
export const empStoreName = (sid?: string) => sid === "st-delma" ? "Dèlma" : "Petyonvil";

export function useEmployees(initial: Employee[]) {
  const [employees, setEmployees] = useState<Employee[]>(initial);
  const [hydrated, setHydrated] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      const db = await getDb();
      const rows = (await db.getAllAsync("SELECT * FROM employees WHERE is_deleted=0 OR is_deleted IS NULL")) as any[];
      if (rows && rows.length > 0) {
        setEmployees(rows.map((r: any) => ({
          id: r.id,
          name: r.full_name,
          role: r.role,
          phone: r.phone ?? "",
          address: r.address ?? "",
          store: empStoreName(r.store_id),
          emergency: { name: "", address: "", phone: "" },
          secret: String(r.secret ?? ""),
          password: "",
          lastAction: "",
          kpi: "",
          salary: `${(Number(r.salary) || 0).toLocaleString()} HTG`,
          isOnline: !!r.online_status,
          active: !!r.is_active,
        })));
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        const db = await getDb();
        for (const e of employees) {
          await db.runAsync(
            "INSERT OR REPLACE INTO employees (id, store_id, full_name, role, phone, salary, address, secret, is_active, online_status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            [e.id, empStoreId(e.store), e.name, e.role, e.phone ?? "", parseInt(String(e.salary).replace(/[^0-9]/g, ""), 10) || 0, e.address ?? "", e.secret ?? "", e.active ? 1 : 0, e.isOnline ? 1 : 0, new Date().toISOString(), new Date().toISOString()]
          );
        }
        const existing = (await db.getAllAsync("SELECT id FROM employees")) as any[];
        const ids = new Set(employees.map(e => e.id));
        for (const r of existing || []) {
          if (!ids.has(r.id)) await db.runAsync("DELETE FROM employees WHERE id = ?", [r.id]);
        }
      } catch {}
    })();
  }, [employees, hydrated]);

  return { employees, setEmployees, hydrated };
}