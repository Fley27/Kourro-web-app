// ============================================================================
// Web data layer — direct port of mobile-app/src/db (memStore SQL-pattern
// engine) with localStorage persistence so the app survives reloads.
// All queries used by the ported app logic are handled here (same branches as
// the mobile fallback), so identical SQL strings work on web and native.
// ============================================================================

type Row = { [k: string]: any };
type Table = string;

const STORAGE_KEY = "jm_db_v3";

let db: any | null = null;
const memStore = new Map<Table, Row[]>();

// --- persistence -----------------------------------------------------------
let saveTimer: any = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj: Record<string, Row[]> = {};
      memStore.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // quota / private mode — best effort
    }
  }, 40);
}
function markDirty() {
  persist();
}
function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const obj = JSON.parse(raw) as Record<string, Row[]>;
    for (const k of Object.keys(obj)) memStore.set(k, Array.isArray(obj[k]) ? obj[k] : []);
    return true;
  } catch {
    return false;
  }
}

export function resetDb() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  memStore.clear();
  db = null;
}

// --- seeds: dev mock catalog mirrors packages/mock-catalog -------------------
// (mirrored at ../data/catalog.*.json by `npm run generate` — never hand-edit)
import CATALOG_CATS from "../data/catalog.categories.json";
import CATALOG_SUPS from "../data/catalog.suppliers.json";
import CATALOG_PRODS from "../data/catalog.products.json";
import CATALOG_COSTS from "../data/catalog.costs.json";

const avgCost = (pid: string) => {
  const rows = (CATALOG_COSTS as any[]).filter((c) => c.product_id === pid);
  return rows.length ? Math.round(rows.reduce((s, c) => s + c.cost, 0) / rows.length) : 0;
};

const mockProductsSeed = (CATALOG_PRODS as any[]).map((p) => ({
  id: p.id, store_id: "demo-store-id", sku: p.sku, barcode: p.barcode,
  name: p.name, name_ht: p.name_ht, unit: p.units?.[0]?.label ?? "Unit",
  cost_price: avgCost(p.id), selling_price: p.units?.[0]?.sell ?? 0,
  stock_quantity: p.stock ?? 0, current_amount_available: p.stock ?? 0,
  low_stock_threshold: p.low ?? 5,
}));

const mockCategoriesSeed = (CATALOG_CATS as any[]).map((c: any) => ({
  id: c.id, store_id: "demo-store-id", name: c.name, icon: c.icon, color: c.color,
  sort_order: c.sort_order ?? 0, created_at: new Date().toISOString(),
}));

const mockCategoryLinksSeed = (CATALOG_CATS as any[]).flatMap((c: any) =>
  (c.parents ?? []).map((parent: string) => ({ id: `${c.id}__${parent}`, child_id: c.id, parent_id: parent }))
);

const mockProdCatsSeed = (CATALOG_PRODS as any[]).flatMap((p: any) =>
  (p.categories ?? []).map((cid: string) => ({ product_id: p.id, category_id: cid }))
);

const mockUnitsSeed = (CATALOG_PRODS as any[]).flatMap((p: any) =>
  (p.units ?? []).map((u: any) => ({
    id: u.id, product_id: p.id, unit_name: u.label, condition: u.condition ?? null,
    conversion_factor: u.factor ?? 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }))
);

const variantFor = (condition: string | null) =>
  condition ? condition.charAt(0).toUpperCase() + condition.slice(1) : "Regular";

const mockPricesSeed = (CATALOG_PRODS as any[]).flatMap((p: any) =>
  (p.units ?? []).map((u: any) => ({
    id: `price-${u.id}`, unit_id: u.id, variant: variantFor(u.condition ?? null),
    price: u.sell ?? 0, updated_at: new Date().toISOString(),
  }))
);

const mockBundlesSeed = (CATALOG_PRODS as any[]).flatMap((p: any, pi: number) =>
  (p.bundles ?? []).map((b: any, i: number) => ({
    id: `bundle-${p.id}-${i}`, unit_id: b.unit_id, variant: b.variant,
    min_quantity: b.minQty ?? 0, bundle_price: b.price ?? 0, created_at: new Date().toISOString(),
  }))
);

const mockSuppliersSeed = (CATALOG_SUPS as any[]).map((s: any) => ({
  ...s, store_id: "demo-store-id", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_deleted: 0,
}));

const mockCostsSeed = (CATALOG_COSTS as any[]).map((c: any) => ({
  id: `psc-${c.product_id}-${c.supplier_id}-${c.unit_id}`.slice(0, 120),
  ...c, last_updated: new Date().toISOString(), updated_at: new Date().toISOString(), is_deleted: 0,
}));

const customersSeed = [
  { id: "cust-1", store_id: "demo-store-id", name: "Jean Baptiste", id_card_number: "004-123-4567", phone: "+509 3810 0001", address: "Delmas 33, Port-au-Prince", total_debt: 3500, credit_limit: 5000, credit_limit_source: "manual", is_high_risk: true, open_debt_count: 1 },
  { id: "cust-2", store_id: "demo-store-id", name: "Marie Claire", id_card_number: "004-987-6543", phone: "+509 3820 0002", address: "Pétion-Ville, Rue Panaméricaine", total_debt: 0, credit_limit: null, is_high_risk: false, open_debt_count: 0 },
  { id: "cust-3", store_id: "demo-store-id", name: "Frantz Delmas", id_card_number: "004-111-2222", phone: "+509 3833 0003", address: "Carrefour, Bizoton", total_debt: 0, credit_limit: null, is_high_risk: false, open_debt_count: 0 },
];

const creditsSeed = [
  { id: "debt-1", store_id: "demo-store-id", customer_id: "cust-1", sale_id: "sale-debt-1", amount: 3500, amount_paid: 0, balance: 3500, status: "pending", due_date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().slice(0, 10), created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() },
];

function seedIfEmpty() {
  if (memStore.size > 0) return;

  if (!memStore.has("products")) memStore.set("products", [...mockProductsSeed]);

  if (!memStore.has("stores")) {
    memStore.set("stores", [
      { id: "st-petyonvil", name: "Pétion-Ville", location: "Petyonvil", code: "PV-4821", created_at: new Date().toISOString(), disabled: 0, breach_flagged: 0, breached_at: null, revoked_by: null, currency: "HTG", updated_at: new Date().toISOString() },
      { id: "st-delma", name: "Delmas", location: "Dèlma", code: "DL-9034", created_at: new Date().toISOString(), disabled: 0, breach_flagged: 0, breached_at: null, revoked_by: null, currency: "HTG", updated_at: new Date().toISOString() },
    ]);
  }
  if (!memStore.has("categories")) {
    memStore.set("categories", [...mockCategoriesSeed]);
  }
  if (!memStore.has("category_links")) memStore.set("category_links", [...mockCategoryLinksSeed]);
  if (!memStore.has("suppliers")) memStore.set("suppliers", [...mockSuppliersSeed]);
  if (!memStore.has("product_supplier_costs")) memStore.set("product_supplier_costs", [...mockCostsSeed]);
  if (!memStore.has("product_categories")) memStore.set("product_categories", [...mockProdCatsSeed]);
  if (!memStore.has("suspended_sales")) memStore.set("suspended_sales", []);
  if (!memStore.has("suspended_sale_items")) memStore.set("suspended_sale_items", []);
  if (!memStore.has("suspended_sale_events")) memStore.set("suspended_sale_events", []);
  if (!memStore.has("product_units")) {
    memStore.set("product_units", [...mockUnitsSeed]);
  }
  if (!memStore.has("product_prices")) {
    memStore.set("product_prices", [...mockPricesSeed]);
  }
  if (!memStore.has("product_bundles")) {
    memStore.set("product_bundles", [...mockBundlesSeed]);
  }
  if (!memStore.has("stock_batches")) memStore.set("stock_batches", []);
  if (!memStore.has("stock_movements")) memStore.set("stock_movements", []);
  if (!memStore.has("_meta")) memStore.set("_meta", []);
  if (!memStore.has("receipts")) memStore.set("receipts", []);
  if (!memStore.has("report_reviews")) memStore.set("report_reviews", []);
  // Staging: partial pickup history (dormant when flag OFF)
  if (!memStore.has("sale_pickups")) memStore.set("sale_pickups", []);
  if (!memStore.has("customer_notes")) memStore.set("customer_notes", []);
  // Repair: rows with delivered=0 and no pickup history were fully taken together.
  try {
    const picks = memStore.get("sale_pickups") ?? [];
    const withHist = new Set(picks.map((p: any) => p.sale_item_id));
    for (const it of memStore.get("sale_items") ?? []) {
      if (Number(it.quantity_delivered ?? 0) === 0 && !withHist.has(it.id) && Number(it.quantity ?? 0) > 0) {
        it.quantity_delivered = it.quantity;
      }
    }
  } catch {}

  if (!memStore.has("sales")) {
    memStore.set("sales", []);
    memStore.set("sale_items", []);
    memStore.set("customers", [...customersSeed]);
    memStore.set("customer_history", []);
    memStore.set("employees", [
      { id: "emp-1", store_id: "demo-store-id", full_name: "Jacques Owner", role: "owner", phone: "+509 1000 0001", salary: 85000, address: "Delmas 33, Port-au-Prince", is_active: 1, online_status: 1 },
      { id: "emp-2", store_id: "demo-store-id", full_name: "Marie Admin", role: "admin", phone: "+509 1000 0002", salary: 65000, address: "Pétion-Ville, Rue Panaméricaine", is_active: 1, online_status: 1 },
      { id: "emp-3", store_id: "demo-store-id", full_name: "Pierre Manager", role: "manager", phone: "+509 1000 0003", salary: 45000, address: "Carrefour, Bizoton", is_active: 1, online_status: 0 },
      { id: "emp-4", store_id: "demo-store-id", full_name: "Sophie Cashier", role: "cashier", phone: "+509 1000 0004", salary: 25000, address: "Tabarre, Route de l'Aéroport", is_active: 1, online_status: 0 },
      { id: "emp-5", store_id: "demo-store-id", full_name: "Jean-Louis Dupont", role: "cashier", phone: "+509 3456 7890", salary: 22000, address: "Jacmel, Centre-Ville", is_active: 0, online_status: 0 },
      { id: "emp-6", store_id: "demo-store-id", full_name: "Marie-Claire Fontaine", role: "manager", phone: "+509 4567 8901", salary: 48000, address: "Cap-Haïtien, Bas-Rivière", is_active: 1, online_status: 1 },
      { id: "emp-7", store_id: "demo-store-id", full_name: "Robenson Saintil", role: "cashier", phone: "+509 5678 9012", salary: 20000, address: "Les Cayes, Boucan Rouge", is_active: 0, online_status: 0 },
      { id: "emp-8", store_id: "demo-store-id", full_name: "Tatiana Beaumont", role: "admin", phone: "+509 6789 0123", salary: 60000, address: "Pétion-Ville, Nazon", is_active: 1, online_status: 1 },
    ]);
    memStore.set("shifts", []);
    memStore.set("cash_movements", []);
    memStore.set("debt_collections", []);
    memStore.set("cash_requests", []);
    memStore.set("cash_discrepancies", []);
    memStore.set("notifications", []);
    memStore.set("daily_reports", []);
    memStore.set("cashier_deficits", []);
    memStore.set("monthly_losses", []);
    memStore.set("cash_register_checks", []);
    memStore.set("deficit_settlements", []);
    memStore.set("salary_deductions", []);
    memStore.set("credits", [...creditsSeed]);
    memStore.set("credit_payments", []);
  }
}

function uid(prefix = "id"): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rnd}`;
}

export async function getDb(): Promise<any> {
  if (db) return db;
  const loaded = loadStored();
  seedIfEmpty();
  if (!loaded) markDirty();
  // Repair (every load, incl. persisted stores): delivered=0 + no pickup history
  // means the sale went out fully together — not an open balance.
  try {
    const picks = memStore.get("sale_pickups") ?? [];
    const withHist = new Set(picks.map((p: any) => p.sale_item_id));
    let fixed = false;
    for (const it of memStore.get("sale_items") ?? []) {
      if (Number(it.quantity_delivered ?? 0) === 0 && !withHist.has(it.id) && Number(it.quantity ?? 0) > 0) {
        it.quantity_delivered = it.quantity;
        fixed = true;
      }
    }
    if (fixed) markDirty();
  } catch {}

  db = {
    execAsync: async () => {},
    runAsync: async (sql: string, params: any[]) => {
      // Every data mutation going through the engine is captured into the
      // outbox so the sync change-tracker sees creates, updates, and deletes
      // alike (not just newly inserted rows). Device-local / derived tables
      // are excluded so they never get replicated.
      const syncSkips = new Set([
        "_meta", "outbox", "notifications", "receipts", "price_history",
        "customer_history", "product_categories", "suspended_sales",
        "suspended_sale_items", "suspended_sale_events",
      ]);
      const captureChange = (table: string, op: "create" | "update" | "delete", rec: any) => {
        if (!rec || rec === undefined) return;
        if (syncSkips.has(table)) return;
        const outboxRows = memStore.get("outbox") ?? [];
        outboxRows.push({
          id: `${String(rec.id ?? "chg")}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`,
          table_name: table,
          operation: op,
          payload: JSON.stringify(rec),
          created_at: new Date().toISOString(),
        });
        memStore.set("outbox", outboxRows);
      };
      if (sql.includes("INSERT INTO outbox")) {
        const arr = memStore.get("outbox") ?? [];
        arr.push({ id: params[0], table_name: params[1], operation: params[2], payload: params[3], created_at: params[4] });
        memStore.set("outbox", arr);
      } else if (sql.includes("INSERT INTO products")) {
        const products = memStore.get("products") ?? [];
        const id = params[0];
        if (!products.some((p: any) => p.id === id)) {
          const rec = {
            id: params[0],
            store_id: params[1],
            sku: params[2],
            barcode: params[2],
            name: params[3],
            category_id: params[4],
            cost_price: Number(params[5] ?? 0),
            stock_quantity: Number(params[6] ?? 0),
            current_amount_available: Number(params[6] ?? 0),
            low_stock_threshold: Number(params[7] ?? 5),
            updated_at: new Date().toISOString(),
            is_deleted: 0,
            dirty: 1,
          };
          products.push(rec);
          memStore.set("products", products);
          captureChange("products", "create", rec);
        }
      } else if (sql.includes("INTO product_units")) {
        const arr = memStore.get("product_units") ?? [];
        const rec = { id: params[0], product_id: params[1], unit_name: params[2], conversion_factor: Number(params[3] ?? 1), created_at: params[4] ?? new Date().toISOString(), updated_at: params[5] ?? new Date().toISOString() };
        const ui = arr.findIndex((x: any) => x.id === rec.id);
        if (ui >= 0) arr[ui] = { ...arr[ui], ...rec }; else arr.push(rec);
        memStore.set("product_units", arr);
        captureChange("product_units", "create", rec);
      } else if (sql.includes("INTO product_prices")) {
        const arr = memStore.get("product_prices") ?? [];
        const rec = { id: params[0], unit_id: params[1], variant: params[2], price: Number(params[3] ?? 0), updated_at: params[4] ?? new Date().toISOString() };
        const ui = arr.findIndex((x: any) => x.id === rec.id);
        if (ui >= 0) arr[ui] = { ...arr[ui], ...rec }; else arr.push(rec);
        memStore.set("product_prices", arr);
        captureChange("product_prices", "create", rec);
      } else if (sql.includes("INTO product_bundles")) {
        const arr = memStore.get("product_bundles") ?? [];
        const rec = { id: params[0], unit_id: params[1], variant: params[2], min_quantity: Number(params[3] ?? 0), bundle_price: Number(params[4] ?? 0), created_at: params[5] ?? new Date().toISOString() };
        const ui = arr.findIndex((x: any) => x.id === rec.id);
        if (ui >= 0) arr[ui] = { ...arr[ui], ...rec }; else arr.push(rec);
        memStore.set("product_bundles", arr);
        captureChange("product_bundles", "create", rec);
      } else if (sql.includes("UPDATE product_prices SET") || sql.includes("UPDATE product_units SET")) {
        const target = sql.includes("UPDATE product_prices SET") ? "product_prices" : "product_units";
        const arr = memStore.get(target) ?? [];
        const id = params[params.length - 1];
        const rec = arr.find((x: any) => x.id === id);
        if (rec) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          setPart.split(",").forEach((c, i) => {
            const plain = c.trim().match(/^(\w+)\s*=\s*\?$/);
            if (plain && params[i] !== undefined) (rec as any)[plain[1]] = params[i];
          });
          rec.updated_at = new Date().toISOString();
          captureChange(target, "update", rec);
        }
      } else if (sql.includes("UPDATE products SET") && sql.includes("current_amount_available")) {
        const products = memStore.get("products") ?? [];
        const id = params[params.length - 1];
        const p = products.find((x: any) => x.id === id);
        if (p) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          setPart.split(",").forEach((c, i) => {
            const c2 = c.trim();
            const plus = c2.match(/^(\w+)\s*=\s*(\w+)\s*\+\s*\?$/);
            const minus = c2.match(/^(\w+)\s*=\s*(\w+)\s*-\s*\?$/);
            const plain = c2.match(/^(\w+)\s*=\s*\?$/);
            if (plus && plus[1] === plus[2]) p[plus[1]] = Number(p[plus[1]] ?? 0) + Number(params[i] ?? 0);
            else if (minus && minus[1] === minus[2]) p[minus[1]] = Number(p[minus[1]] ?? 0) - Number(params[i] ?? 0);
            else if (plain) p[plain[1]] = params[i];
          });
          p.updated_at = new Date().toISOString();
          captureChange("products", "update", p);
        }
      } else if (sql.includes("UPDATE stock_movements SET")) {
        const movs = memStore.get("stock_movements") ?? [];
        const id = params[params.length - 1];
        const m = movs.find((x: any) => x.id === id);
        if (m) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          setPart.split(",").forEach((c, i) => {
            const c2 = c.trim();
            const minus = c2.match(/^(\w+)\s*=\s*(\w+)\s*-\s*\?$/);
            const plain = c2.match(/^(\w+)\s*=\s*\?$/);
            if (minus && minus[1] === minus[2]) m[minus[1]] = Number(m[minus[1]] ?? 0) - Number(params[i] ?? 0);
            else if (plain) m[plain[1]] = params[i];
          });
          m.updated_at = new Date().toISOString();
          captureChange("stock_movements", "update", m);
        }
      } else if (sql.includes("UPDATE stock_batches SET")) {
        const batches = memStore.get("stock_batches") ?? [];
        const id = params[params.length - 1];
        const b = batches.find((x: any) => x.id === id);
        if (b) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          setPart.split(",").forEach((c, i) => {
            const c2 = c.trim();
            const plain = c2.match(/^(\w+)\s*=\s*\?$/);
            if (plain) b[plain[1]] = params[i];
          });
          b.updated_at = new Date().toISOString();
          captureChange("stock_batches", "update", b);
        }
      } else if (sql.includes("UPDATE products SET")) {
        const products = memStore.get("products") ?? [];
        if (sql.includes("stock_quantity")) {
          const qty = Number(params[0] ?? 0);
          const id = params[1];
          const p = products.find((x: any) => x.id === id);
          if (p) {
            if (sql.includes("stock_quantity + ?")) p.stock_quantity = (Number(p.stock_quantity ?? 0) + qty);
            else if (sql.includes("stock_quantity - ?")) p.stock_quantity = (Number(p.stock_quantity ?? 0) - qty);
            else p.stock_quantity = Number(params[0] ?? p.stock_quantity);
            p.updated_at = new Date().toISOString();
            captureChange("products", "update", p);
          }
        } else {
          const id = params[params.length - 1];
          const p = products.find((x: any) => x.id === id);
          if (p) {
            const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
            const cols = setPart.split(",").map(c => c.trim().replace(/\s*=\s*\??$/, "").trim());
            cols.forEach((col, i) => {
              if (params[i] !== undefined) (p as any)[col] = params[i];
            });
            p.updated_at = new Date().toISOString();
            captureChange("products", "update", p);
          }
        }
      } else if (sql.includes("INSERT INTO sales")) {
        const sales = memStore.get("sales") ?? [];
        let created_at = new Date().toISOString();
        let updated_at = new Date().toISOString();
        let seller_id = null, seller_role = null;
        const last = params[params.length - 1];
        if (typeof last === "string" && /\d{4}-\d{2}-\d{2}T/.test(last)) updated_at = last;
        if (params.length >= 12) seller_id = params[10] ?? null;
        if (params.length >= 12) seller_role = params[11] ?? null;
        if (params.length >= 13) created_at = params[12] ?? created_at;
        const saleRec = { id: params[0], store_id: params[1], sale_number: params[2], customer_id: params[3], status: params[4], payment_method: params[5], subtotal: params[6], total: params[7], amount_paid: params[8], amount_due: params[9], seller_id, seller_role, created_at, updated_at };
        sales.push(saleRec);
        memStore.set("sales", sales);
        captureChange("sales", "create", saleRec);
      } else if (sql.includes("INSERT INTO daily_reports")) {
        const arr = memStore.get("daily_reports") ?? [];
        arr.push({ id: params[0], store_id: params[1], report_date: params[2], role: params[3], user_id: params[4], status: params[5] ?? "pending", opening_balance: params[6] ?? 0, expected_cash: params[7] ?? 0, actual_cash: params[8] ?? null, cash_sales: params[9] ?? 0, moncash_sales: params[10] ?? 0, natcash_sales: params[11] ?? 0, credit_sales: params[12] ?? 0, credit_collected_cash: params[13] ?? 0, credit_collected_moncash: params[14] ?? 0, credit_collected_natcash: params[15] ?? 0, withdrawals_total: params[16] ?? 0, inventory_total: params[17] ?? 0, deficit: params[18] ?? 0, submitted_at: params[19] ?? null, closed_at: params[20] ?? null, created_at: params[21] ?? new Date().toISOString(), updated_at: params[22] ?? new Date().toISOString(), reviewed_by: params[23] ?? null, reviewed_at: params[24] ?? null });
        memStore.set("daily_reports", arr);
        captureChange("daily_reports", "create", arr[arr.length - 1]);
      } else if (sql.includes("INSERT INTO cashier_deficits")) {
        const arr = memStore.get("cashier_deficits") ?? [];
        const cd = { id: params[0], store_id: params[1], cashier_id: params[2], date: params[3], deficit: params[4] ?? 0, status: params[5] ?? "open", resolution: params[6] ?? null, resolved_by: params[7] ?? null, resolved_at: params[8] ?? null, notes: params[9] ?? null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (params.length === 7) { cd.status = params[5] ?? "open"; cd.created_at = params[6] ?? new Date().toISOString(); }
        arr.push(cd);
        memStore.set("cashier_deficits", arr);
        captureChange("cashier_deficits", "create", cd);
      } else if (sql.includes("INSERT INTO monthly_losses")) {
        const arr = memStore.get("monthly_losses") ?? [];
        const ml = { id: params[0], store_id: params[1], month: params[2], cashier_id: params[3], amount: params[4] ?? 0, origin: params[5] ?? null, reason: params[6] ?? null, registered_by: params[7] ?? null, created_at: params[8] ?? new Date().toISOString() };
        arr.push(ml);
        memStore.set("monthly_losses", arr);
        captureChange("monthly_losses", "create", ml);
      } else if (sql.includes("INSERT INTO report_reviews")) {
        const arr = memStore.get("report_reviews") ?? [];
        const rr = {
          id: params[0], store_id: params[1], report_id: params[2], cashier_id: params[3],
          report_date: params[4], deficit: Number(params[5] ?? 0), decision: params[6],
          decided_by: params[7] ?? null, decided_by_role: params[8] ?? null,
          decided_by_rank: Number(params[9] ?? 0), reason: params[10] ?? null,
          previous_review_id: params[11] ?? null, created_at: params[12] ?? new Date().toISOString(),
          lamport_clock: Number(params[13] ?? 0), updated_at: params[12] ?? new Date().toISOString(),
        };
        arr.push(rr);
        memStore.set("report_reviews", arr);
        captureChange("report_reviews", "create", rr);
      } else if (sql.includes("INSERT INTO cash_register_checks")) {
        const arr = memStore.get("cash_register_checks") ?? [];
        const ts = new Date().toISOString();
        let c: any;
        if (params.length >= 15 && sql.includes("check_date")) {
          c = { id: params[0], store_id: params[1], report_id: params[2], cashier_id: params[3], check_date: params[4] ?? ts.slice(0,10), stated_amount: params[5] ?? 0, program_amount: params[6] ?? 0, status: params[7] ?? "pending", action: params[8] ?? null, set_by: params[9] ?? "owner-1", set_by_role: params[10] ?? "owner", is_default: params[11] ?? 0, approved_by: params[12] ?? null, correct_amount: params[13] ?? null, created_at: params[14] ?? ts, updated_at: ts };
        } else if (params.length === 11) {
          const created = params[10] ?? ts;
          c = { id: params[0], store_id: params[1], report_id: params[2], cashier_id: params[3], check_date: created.slice(0,10), stated_amount: params[4] ?? 0, program_amount: params[5] ?? 0, status: params[6] ?? "pending", action: params[7] ?? null, set_by: "owner-1", set_by_role: "owner", is_default: 1, approved_by: params[8] ?? null, correct_amount: params[9] ?? null, created_at: created, updated_at: ts };
        } else {
          const created = params[8] ?? ts;
          c = { id: params[0], store_id: params[1], report_id: params[2], cashier_id: params[3], check_date: created.slice(0,10), stated_amount: params[4] ?? 0, program_amount: params[5] ?? 0, status: params[6] ?? "pending", action: params[7] ?? null, set_by: "owner-1", set_by_role: "owner", is_default: 1, approved_by: null, correct_amount: null, created_at: created, updated_at: ts };
          if (params.length === 9) { c.action = params[7] ?? null; c.created_at = params[8] ?? ts; c.updated_at = ts; }
        }
        arr.push(c);
        memStore.set("cash_register_checks", arr);
        captureChange("cash_register_checks", "create", c);
      } else if (sql.includes("INSERT INTO deficit_settlements")) {
        const arr = memStore.get("deficit_settlements") ?? [];
        const ts = new Date().toISOString();
        const s = { id: params[0], store_id: params[1], cashier_id: params[2], period_start: params[3], period_end: params[4], deficit_ids: params[5] ?? "[]", total: Number(params[6] ?? 0), paid: Number(params[7] ?? 0), status: params[8] ?? "open", created_by: params[9] ?? null, paid_by: params[10] ?? null, paid_at: params[11] ?? null, created_at: params[12] ?? ts, updated_at: ts };
        // FSM: derive initial status
        if (s.paid >= s.total && s.total > 0) s.status = "paid";
        else if (s.paid > 0) s.status = "partial";
        arr.push(s);
        memStore.set("deficit_settlements", arr);
        captureChange("deficit_settlements", "create", s);
      } else if (sql.includes("INSERT INTO salary_deductions")) {
        const arr = memStore.get("salary_deductions") ?? [];
        const sd = { id: params[0], store_id: params[1], cashier_id: params[2], amount: params[3] ?? 0, deficit_ids: params[4] ?? null, registered_by: params[5] ?? null, created_at: params[6] ?? new Date().toISOString() };
        arr.push(sd);
        memStore.set("salary_deductions", arr);
        captureChange("salary_deductions", "create", sd);
      } else if (sql.includes("INSERT INTO sale_items")) {
        const items = memStore.get("sale_items") ?? [];
        // Column-parsed (handles 12-col legacy + 13-col with quantity_delivered).
        // No pickup action = all products delivered together: delivered defaults to quantity.
        const colPart = (sql.match(/\(\s*id\s*,(.*?)\)\s*VALUES/i)?.[1] ?? "").split(",").map(s => s.trim());
        const at = (name: string): any => {
          const i = colPart.indexOf(name);
          return i >= 0 ? params[i + 1] : undefined;
        };
        const qty = Number(at("quantity") ?? params[7] ?? 0);
        const qd = at("quantity_delivered");
        const si = { id: params[0], store_id: params[1], sale_id: params[2], product_id: params[3], product_name: params[4], unit_id: params[5] ?? null, variant: params[6] ?? null, quantity: qty, unit_price: at("unit_price") ?? params[8], cost_price: at("cost_price") ?? params[9], line_total: at("line_total") ?? params[10], quantity_delivered: qd ?? qty, created_at: at("created_at") ?? at("updated_at") ?? params[11] ?? new Date().toISOString() };
        items.push(si);
        memStore.set("sale_items", items);
        captureChange("sale_items", "create", si);
      } else if (sql.includes("INTO sale_pickups")) {
        // Staging only: append-only pickup history. Dormant when flag OFF.
        const arr = memStore.get("sale_pickups") ?? [];
        arr.push({ id: params[0], store_id: params[1], sale_id: params[2], sale_item_id: params[3], quantity: Number(params[4] ?? 0), picked_up_by: params[5] ?? null, created_at: params[6] ?? new Date().toISOString() });
        memStore.set("sale_pickups", arr);
      } else if (sql.includes("UPDATE sale_items SET")) {
        // Staging only: quantity_delivered adjustments. Generic SET parser (dormant when OFF).
        const items = memStore.get("sale_items") ?? [];
        const id = params[params.length - 1];
        const it = items.find((x: any) => x.id === id);
        if (it) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
          cols.forEach((col, i) => { if (params[i] !== undefined) (it as any)[col] = params[i]; });
          captureChange("sale_items", "update", it);
        }
      } else if (sql.includes("INTO receipts")) {
        const arr = memStore.get("receipts") ?? [];
        const idx = arr.findIndex((x: any) => x.id === params[0]);
        const rec = { id: params[0], store_id: params[1], sale_id: params[2], copy_type: params[3], receipt_number: params[4], sale_number: params[5], cashier_id: params[6] ?? null, cashier_name: params[7] ?? null, cashier_role: params[8] ?? null, content: params[9], created_at: params[10] ?? new Date().toISOString() };
        if (idx >= 0) arr[idx] = rec; else arr.push(rec);
        memStore.set("receipts", arr);
      } else if (sql.includes("INSERT INTO credits")) {
        const credits = memStore.get("credits") ?? [];
        let creditRec: any;
        if (params.length >= 10 && sql.includes("due_date")) {
          creditRec = { id: params[0], store_id: params[1], sale_id: params[2], customer_id: params[3], amount: params[4], amount_paid: params[5], balance: params[6], status: params[7], due_date: params[8] ?? null, created_at: params[9] ?? new Date().toISOString(), updated_at: params[9] ?? new Date().toISOString() };
        } else if (params.length >= 9 && sql.includes("due_date")) {
          creditRec = { id: params[0], store_id: params[1], sale_id: params[2], customer_id: params[3], amount: params[4], balance: params[5], status: params[6], due_date: params[7] ?? null, created_at: params[8] ?? new Date().toISOString(), updated_at: params[8] ?? new Date().toISOString() };
        } else {
          creditRec = { id: params[0], store_id: params[1], sale_id: params[2], customer_id: params[3], amount: params[4], balance: params[5], status: params[6], created_at: params[7] ?? new Date().toISOString(), updated_at: params[7] ?? new Date().toISOString() };
        }
        credits.push(creditRec);
        memStore.set("credits", credits);
        captureChange("credits", "create", creditRec);
      } else if (sql.includes("INSERT INTO credit_payments")) {
        const payments = memStore.get("credit_payments") ?? [];
        const cp = {
          id: params[0],
          store_id: params[1],
          credit_id: params[2],
          debt_id: params[3],
          amount: params[4],
          payment_method: params[5],
          receipt_number: params[6],
          created_at: params[7] ?? new Date().toISOString(),
          collected_by: params[8] ?? null,
        };
        payments.push(cp);
        memStore.set("credit_payments", payments);
        captureChange("credit_payments", "create", cp);
      } else if (sql.includes("INSERT INTO shifts")) {
        const shifts = memStore.get("shifts") ?? [];
        const shiftRec = { id: params[0], store_id: params[1], cashier_id: params[2], manager_id: params[3], opening_balance: params[4], status: params[5], start_time: params[6], end_time: params[7], cashier_confirmed: params[8], manager_confirmed: params[9], supervisor_confirmed: params[10] };
        shifts.push(shiftRec);
        memStore.set("shifts", shifts);
        captureChange("shifts", "create", shiftRec);
      } else if (sql.includes("INSERT INTO cash_movements")) {
        const cms = memStore.get("cash_movements") ?? [];
        let cm: any;
        if (params.length === 10) {
          cm = { id: params[0], shift_id: params[1], store_id: params[2], type: params[3], amount: params[4], reason: params[5], created_by: params[6], taken_by: params[7], validated_by: params[8], created_at: params[9] };
        } else {
          cm = { id: params[0], shift_id: params[1], store_id: params[2], type: params[3], amount: params[4], reason: params[5], created_by: params[6], validated_by: params[7], created_at: params[8] };
        }
        cms.push(cm);
        memStore.set("cash_movements", cms);
        captureChange("cash_movements", "create", cm);
        if (cm.type === "withdrawal" || cm.type === "inventory") {
          const notifs = memStore.get("notifications") ?? [];
          const label = cm.type === "inventory" ? `Kach envantè ${cm.amount} HTG` : `Retrè ${cm.amount} HTG`;
          for (const sup of ["owner-1", "admin-1", "manager-1"]) {
            if (sup === cm.created_by) continue;
            notifs.push({ id: `notif-${Date.now()}-${sup}-${Math.random().toString(36).slice(2, 4)}`, user_id: sup, type: cm.type === "inventory" ? "inventory_pickup" : "withdrawal", reference_id: cm.id, message: `${label} — ${cm.reason ?? ""}`.trim(), status: "pending", created_at: new Date().toISOString() });
          }
          memStore.set("notifications", notifs);
        }
      } else if (sql.includes("INSERT INTO debt_collections")) {
        const dcs = memStore.get("debt_collections") ?? [];
        const dc = { id: params[0], shift_id: params[1], customer_id: params[2], amount: params[3], created_at: params[4] };
        dcs.push(dc);
        memStore.set("debt_collections", dcs);
        captureChange("debt_collections", "create", dc);
      } else if (sql.includes("INSERT INTO customer_history")) {
        const history = memStore.get("customer_history") ?? [];
        history.push({ id: params[0], customer_id: params[1], user_id: params[2], action: params[3], field_name: params[4], old_value: params[5], new_value: params[6], created_at: params[7] });
        memStore.set("customer_history", history);
      } else if (sql.includes("INSERT INTO cash_requests")) {
        const crs = memStore.get("cash_requests") ?? [];
        const cr = { id: params[0], shift_id: params[1], amount: params[2], reason: params[3], created_by: params[4], status: params[5], created_at: params[6] };
        crs.push(cr);
        memStore.set("cash_requests", crs);
        captureChange("cash_requests", "create", cr);
      } else if (sql.includes("INSERT INTO notifications")) {
        const notifs = memStore.get("notifications") ?? [];
        notifs.push({
          id: params[0],
          user_id: params[1],
          type: params[2],
          reference_id: params[3],
          message: params[4],
          status: params[5],
          created_at: params[6] ?? new Date().toISOString(),
        });
        memStore.set("notifications", notifs);
      } else if (sql.includes("INSERT INTO employees")) {
        const emps = memStore.get("employees") ?? [];
        const emp = { id: params[0], store_id: params[1], full_name: params[2], role: params[3], phone: params[4], salary: params[5], address: params[6], is_active: params[7], online_status: params[8], created_at: params[9] ?? new Date().toISOString() };
        emps.push(emp);
        memStore.set("employees", emps);
        captureChange("employees", "create", emp);
      } else if (sql.includes("UPDATE employees SET")) {
        const emps = memStore.get("employees") ?? [];
        const id = params[params.length - 1];
        const emp = emps.find((x: any) => x.id === id);
        if (emp) {
          if (sql.includes("full_name")) emp.full_name = params[0];
          if (sql.includes("role")) emp.role = params[0];
          if (sql.includes("phone")) emp.phone = params[0];
          if (sql.includes("salary")) emp.salary = params[0];
          if (sql.includes("address")) emp.address = params[0];
          if (sql.includes("is_active")) emp.is_active = params[0];
          if (sql.includes("online_status")) emp.online_status = params[0];
          emp.updated_at = new Date().toISOString();
          captureChange("employees", "update", emp);
        }
      } else if (sql.includes("INSERT INTO cash_discrepancies")) {
        const cds = memStore.get("cash_discrepancies") ?? [];
        const cd = { id: params[0], shift_id: params[1], manager_amount: params[2], cashier_amount: params[3], difference: params[4], status: params[5], created_by: params[6], reassigned_amount: params[7] ?? null, created_at: params[8] ?? new Date().toISOString() };
        cds.push(cd);
        memStore.set("cash_discrepancies", cds);
        captureChange("cash_discrepancies", "create", cd);
        const notifs = memStore.get("notifications") ?? [];
        for (const sup of ["owner-1", "admin-1", "manager-1"]) {
          notifs.push({ id: `notif-${Date.now()}-${sup}-${Math.random().toString(36).slice(2, 4)}`, user_id: sup, type: "cash_discrepancy", reference_id: params[0], message: `Kesye rapòte ${params[3]} HTG olye de ${params[2]} HTG — manke ${params[4]} HTG`, status: "pending", created_at: new Date().toISOString() });
        }
        memStore.set("notifications", notifs);
      } else if (sql.includes("UPDATE notifications SET")) {
        const notifs = memStore.get("notifications") ?? [];
        const id = params[params.length - 1];
        const notif = notifs.find((x: any) => x.id === id);
        if (notif) {
          if (sql.includes("status")) notif.status = params[0];
          if (sql.includes("message")) notif.message = params[0];
        }
      } else if (sql.includes("INSERT INTO customers")) {
        const customers = memStore.get("customers") ?? [];
        const newId = params[0];
        if (!customers.some((c: any) => c.id === newId)) {
          let cust: any;
          if (params.length === 11) {
            cust = { id: params[0], store_id: params[1], name: params[2], phone: params[3], address: params[4], id_card_number: params[5], total_debt: params[6], credit_limit: params[7], credit_limit_source: params[8], is_high_risk: params[9], open_debt_count: params[10], email: null };
          } else {
            cust = { id: params[0], store_id: params[1], name: params[2], phone: params[3], id_card_number: params[4], total_debt: params[5], credit_limit: params[6], credit_limit_source: params[7], is_high_risk: params[8], open_debt_count: params[9], address: null, email: null };
          }
          customers.push(cust);
          memStore.set("customers", customers);
          captureChange("customers", "create", cust);
        }
      } else if (sql.includes("UPDATE customers SET")) {
        const customers = memStore.get("customers") ?? [];
        const id = params[params.length - 1];
        const c = customers.find((x: any) => x.id === id);
        if (c) {
          const setPart = (sql.match(/SET\s+(.*?)(?:\s+WHERE|\s*$)/i)?.[1] ?? "").trim();
          const cols = Array.from(setPart.matchAll(/([A-Za-z_]\w*)\s*=\s*\?/g), m => m[1]);
          cols.forEach((col, i) => {
            if (params[i] !== undefined) (c as any)[col] = params[i];
          });
          captureChange("customers", "update", c);
        }
      } else if (sql.includes("UPDATE credits SET")) {
        const credits = memStore.get("credits") ?? [];
        const id = params[params.length - 1];
        const credit = credits.find((x: any) => x.id === id);
        if (credit) {
          const setPart = (sql.match(/SET\s+(.*?)(?:\s+WHERE|\s*$)/i)?.[1] ?? "").trim();
          const cols = Array.from(setPart.matchAll(/([A-Za-z_]\w*)\s*=\s*\?/g), m => m[1]);
          cols.forEach((col, i) => {
            if (params[i] !== undefined) (credit as any)[col] = params[i];
          });
          captureChange("credits", "update", credit);
        }
      } else if (sql.includes("UPDATE cash_requests SET")) {
        const crs = memStore.get("cash_requests") ?? [];
        const id = params[1];
        const cr = crs.find((x: any) => x.id === id);
        if (cr) {
          cr.status = params[0];
          captureChange("cash_requests", "update", cr);
        }
      } else if (sql.includes("UPDATE cash_discrepancies SET")) {
        const cds = memStore.get("cash_discrepancies") ?? [];
        const id = params[params.length - 1];
        const cd = cds.find((x: any) => x.id === id);
        if (cd) {
          if (sql.includes("status")) cd.status = params[0];
          if (sql.includes("reassigned_amount")) cd.reassigned_amount = params[0];
          if (sql.includes("cashier_amount") && params.length > 2) cd.cashier_amount = params[0];
          captureChange("cash_discrepancies", "update", cd);
        }
      } else if (sql.includes("UPDATE daily_reports SET")) {
        const arr = memStore.get("daily_reports") ?? [];
        const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
        const cols = setPart.split(",").map(p => p.trim().replace(/=\s*\?\s*,?$/, "").replace(/=$/, "").trim()).filter(Boolean);
        const tail = params.slice(cols.length);
        const whereSql = (sql.match(/WHERE\s+(.*)$/i)?.[1] ?? "").toLowerCase();
        let r: any | undefined;
        if (whereSql.includes("user_id")) {
          const [uid, rdate, sid] = tail;
          r = arr.find((x: any) => x.user_id === uid && x.report_date === rdate && (x.store_id ?? sid) === sid);
        } else if (tail.length > 0) {
          r = arr.find((x: any) => x.id === tail[tail.length - 1]);
        }
        if (r) {
          cols.forEach((col, i) => { if (params[i] !== undefined) r[col] = params[i]; });
          r.updated_at = new Date().toISOString();
          captureChange("daily_reports", "update", r);
        }
      } else if (sql.includes("UPDATE cashier_deficits SET")) {
        const arr = memStore.get("cashier_deficits") ?? [];
        const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
        const cols = setPart.split(",").map(p => p.trim().replace(/=\s*\?\s*,?$/, "").replace(/=$/, "").trim()).filter(Boolean);
        const tail = params.slice(cols.length);
        const d = arr.find((x: any) => x.id === tail[tail.length - 1]);
        if (d) {
          cols.forEach((col, i) => { if (params[i] !== undefined) d[col] = params[i]; });
          d.updated_at = new Date().toISOString();
          captureChange("cashier_deficits", "update", d);
        }
      } else if (sql.includes("UPDATE cash_register_checks SET")) {
        const arr = memStore.get("cash_register_checks") ?? [];
        const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
        const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
        const id = params[params.length - 1];
        const c = arr.find((x: any) => x.id === id);
        if (c) {
          // FSM guard: terminal states cannot transition
          const terminal = new Set(["approved","rejected","resolved"]);
          const newStatus = cols.includes("status") ? params[cols.indexOf("status")] : c.status;
          if (terminal.has(c.status) && newStatus !== c.status) { /* blocked */ }
          else {
            const allowed: Record<string,string[]> = { pending:["approved","contested","rejected"], contested:["approved","rejected","resolved"], approved:[], rejected:[], resolved:[] };
            if (newStatus !== c.status && !(allowed[c.status] ?? []).includes(newStatus)) { /* blocked - keep old */ }
            else cols.forEach((col,i)=>{ if(params[i]!==undefined) (c as any)[col]=params[i]; });
          }
          c.updated_at = new Date().toISOString();
          captureChange("cash_register_checks", "update", c);
        }
      } else if (sql.includes("UPDATE deficit_settlements SET")) {
        const arr = memStore.get("deficit_settlements") ?? [];
        const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
        const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
        const id = params[params.length - 1];
        const s = arr.find((x: any) => x.id === id);
        if (s) {
          const terminal = new Set(["paid","waived"]);
          if (terminal.has(s.status)) { /* no transitions */ }
          else {
            cols.forEach((col,i)=>{ if(params[i]!==undefined) (s as any)[col]=params[i]; });
            // auto-derive status from paid/total unless explicitly set to waived
            if (!cols.includes("status")) {
              if (s.status !== "waived") {
                if (s.paid >= s.total && s.total > 0) s.status = "paid";
                else if (s.paid > 0) s.status = "partial";
                else s.status = "open";
                if (s.status === "paid") s.paid_at = new Date().toISOString();
              }
            }
          }
          s.updated_at = new Date().toISOString();
          captureChange("deficit_settlements", "update", s);
        }
      } else if (sql.includes("UPDATE sales SET")) {
        const sales = memStore.get("sales") ?? [];
        const id = params[params.length - 1];
        const s = sales.find((x: any) => x.id === id);
        if (s) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
          cols.forEach((col, i) => {
            if (params[i] !== undefined) (s as any)[col] = params[i];
          });
          captureChange("sales", "update", s);
        }
      } else if (sql.includes("UPDATE shifts SET")) {
        const shifts = memStore.get("shifts") ?? [];
        const id = params[params.length - 1];
        const s = shifts.find((x: any) => x.id === id);
        if (s) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
          cols.forEach((col, i) => {
            if (params[i] !== undefined) (s as any)[col] = params[i];
          });
          captureChange("shifts", "update", s);
        }
      } else if (sql.includes("INTO categories")) {
        const cats = memStore.get("categories") ?? [];
        const id = params[0];
        const existingIdx = cats.findIndex((c: any) => c.id === id);
        const rec = { id: params[0], store_id: params[1], name: params[2], icon: params[3], color: params[4], sort_order: params[5] ?? cats.length + 1, created_at: params[6] ?? new Date().toISOString(), updated_at: params[7] ?? new Date().toISOString(), is_deleted: 0, dirty: 1 };
        if (sql.includes("OR REPLACE") && existingIdx >= 0) cats[existingIdx] = { ...cats[existingIdx], ...rec };
        else if (existingIdx >= 0) { /* ignore duplicate */ } else cats.push(rec);
        memStore.set("categories", cats);
        captureChange("categories", "create", rec);
      } else if (sql.includes("INTO stores")) {
        const stores = memStore.get("stores") ?? [];
        const id = params[0];
        const idx = stores.findIndex((s: any) => s.id === id);
        const rec: any = {};
        if (params.length >= 7) {
          rec.id = params[0]; rec.name = params[1]; rec.location = params[2]; rec.code = params[3]; rec.currency = params[4] ?? "HTG"; rec.created_at = params[5]; rec.updated_at = params[6]; rec.disabled = params[7] ?? 0; rec.breach_flagged = params[8] ?? 0; rec.breached_at = params[9] ?? null; rec.revoked_by = params[10] ?? null;
        } else {
          rec.id = params[0]; rec.name = params[1] ?? rec.id; rec.location = params[2] ?? ""; rec.code = params[3] ?? "";
        }
        if (idx >= 0) stores[idx] = { ...stores[idx], ...rec, updated_at: new Date().toISOString() };
        else stores.push(rec);
        memStore.set("stores", stores);
        captureChange("stores", idx >= 0 ? "update" : "create", stores[idx ?? stores.length - 1] ?? rec);
      } else if (sql.includes("INTO _meta") || sql.includes("INSERT OR REPLACE INTO _meta")) {
        const meta = memStore.get("_meta") ?? [];
        const key = params[0]; const value = params[1];
        const idx = meta.findIndex((m: any) => m.key === key);
        if (idx >= 0) meta[idx].value = value;
        else meta.push({ key, value });
        memStore.set("_meta", meta);
      } else if (sql.includes("UPDATE categories SET")) {
        const cats = memStore.get("categories") ?? [];
        const id = params[params.length - 1];
        const c = cats.find((x: any) => x.id === id);
        if (c) {
          if (sql.includes("name")) c.name = params[0];
          if (sql.includes("icon")) c.icon = params[0];
          c.updated_at = new Date().toISOString();
          captureChange("categories", "update", c);
        }
      } else if (sql.includes("UPDATE stores SET")) {
        const stores = memStore.get("stores") ?? [];
        const id = params[params.length - 1];
        const s = stores.find((x: any) => x.id === id);
        if (s) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
          cols.forEach((col, i) => { if (params[i] !== undefined) (s as any)[col] = params[i]; });
          s.updated_at = new Date().toISOString();
          captureChange("stores", "update", s);
        }
      } else if (sql.includes("UPDATE _meta SET")) {
        const meta = memStore.get("_meta") ?? [];
        const key = params[params.length - 1];
        const m = meta.find((x: any) => x.key === key);
        if (m) m.value = params[0];
      } else if (sql.includes("INTO product_categories")) {
        const pcs = memStore.get("product_categories") ?? [];
        if (!pcs.some((r: any) => r.product_id === params[0] && r.category_id === params[1])) {
          pcs.push({ product_id: params[0], category_id: params[1] });
          memStore.set("product_categories", pcs);
        }
      } else if (sql.includes("DELETE FROM product_categories")) {
        const pcs = memStore.get("product_categories") ?? [];
        if (sql.includes("category_id")) {
          memStore.set("product_categories", pcs.filter((r: any) => !(r.product_id === params[0] && r.category_id === params[1])));
        } else {
          memStore.set("product_categories", pcs.filter((r: any) => r.product_id !== params[0]));
        }
      } else if (sql.includes("INTO stock_batches")) {
        const batches = memStore.get("stock_batches") ?? [];
        const id = params[0];
        const rec = { id: params[0], store_id: params[1], reference: params[2], supplier: params[3], transport_cost: Number(params[4] ?? 0), notes: params[5], total_items_cost: Number(params[6] ?? 0), total_cost: Number(params[7] ?? 0), received_at: params[8] ?? null, created_by: params[9], created_at: params[10] ?? new Date().toISOString(), updated_at: params[11] ?? new Date().toISOString(), status: params[12] ?? "delivered", delivered_at: params[13] ?? null };
        const idx = batches.findIndex((b: any) => b.id === id);
        if (idx >= 0) batches[idx] = { ...batches[idx], ...rec };
        else batches.push(rec);
        memStore.set("stock_batches", batches);
        captureChange("stock_batches", idx >= 0 ? "update" : "create", batches[idx >= 0 ? idx : batches.length - 1]);
      } else if (sql.includes("INTO stock_movements")) {
        const movs = memStore.get("stock_movements") ?? [];
        const rec = { id: params[0], batch_id: params[1], store_id: params[2], product_id: params[3], type: params[4], quantity: Number(params[5] ?? 0), initial_qty: Number(params[6] ?? 0), remaining_qty: Number(params[7] ?? 0), unit_cost: Number(params[8] ?? 0), total_cost: Number(params[9] ?? 0), allocated_transport: Number(params[10] ?? 0), reason: params[11], status: params[14] ?? "delivered", delivered_at: params[15] ?? null, created_by: params[12], created_at: params[13] ?? new Date().toISOString() };
        movs.push(rec);
        memStore.set("stock_movements", movs);
        captureChange("stock_movements", "create", rec);
      } else if (sql.includes("DELETE FROM categories")) {
        const cats = memStore.get("categories") ?? [];
        const gone = cats.find((x: any) => x.id === params[0]);
        memStore.set("categories", cats.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("categories", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM stores")) {
        const stores = memStore.get("stores") ?? [];
        const gone = stores.find((x: any) => x.id === params[0]);
        memStore.set("stores", stores.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("stores", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM credits")) {
        const credits = memStore.get("credits") ?? [];
        const gone = credits.find((x: any) => x.id === params[0]);
        memStore.set("credits", credits.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("credits", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM credit_payments")) {
        const payments = memStore.get("credit_payments") ?? [];
        const gone = payments.find((x: any) => x.id === params[0]);
        memStore.set("credit_payments", payments.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("credit_payments", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM outbox")) {
        const outbox = memStore.get("outbox") ?? [];
        if (params?.length) memStore.set("outbox", outbox.filter((x: any) => x.id !== params[0]));
        else memStore.set("outbox", []); // DELETE FROM outbox (clear all)
      } else if (sql.includes("DELETE FROM product_bundles")) {
        const arr = memStore.get("product_bundles") ?? [];
        const gid = params[0];
        if (sql.includes("unit_id")) {
          const gone = arr.filter((x: any) => x.unit_id === gid);
          memStore.set("product_bundles", arr.filter((x: any) => x.unit_id !== gid));
          for (const g of gone) captureChange("product_bundles", "delete", { ...g, is_deleted: 1 });
        } else {
          const gone = arr.find((x: any) => x.id === gid);
          memStore.set("product_bundles", arr.filter((x: any) => x.id !== gid));
          if (gone) captureChange("product_bundles", "delete", { ...gone, is_deleted: 1 });
        }
      } else if (sql.includes("DELETE FROM product_prices")) {
        const arr = memStore.get("product_prices") ?? [];
        const gid = params[0];
        if (sql.includes("unit_id")) {
          const gone = arr.filter((x: any) => x.unit_id === gid);
          memStore.set("product_prices", arr.filter((x: any) => x.unit_id !== gid));
          for (const g of gone) captureChange("product_prices", "delete", { ...g, is_deleted: 1 });
        } else {
          const gone = arr.find((x: any) => x.id === gid);
          memStore.set("product_prices", arr.filter((x: any) => x.id !== gid));
          if (gone) captureChange("product_prices", "delete", { ...gone, is_deleted: 1 });
        }
      } else if (sql.includes("DELETE FROM products")) {
        const products = memStore.get("products") ?? [];
        const gone = products.find((x: any) => x.id === params[0]);
        memStore.set("products", products.filter((x: any) => x.id !== params[0]));
        if (gone) {
          captureChange("products", "delete", { ...gone, is_deleted: 1 });
          const uarr = memStore.get("product_units") ?? [];
          const goneUnits = uarr.filter((u: any) => u.product_id === params[0]);
          for (const g of goneUnits) captureChange("product_units", "delete", { ...g, is_deleted: 1 });
          const parr = memStore.get("product_prices") ?? [];
          const gonePrices = parr.filter((p: any) => {
            const un = (memStore.get("product_units") ?? []).find((u: any) => u.id === p.unit_id);
            return un?.product_id === params[0];
          });
          for (const g of gonePrices) captureChange("product_prices", "delete", { ...g, is_deleted: 1 });
        }
      } else if (sql.includes("DELETE FROM employees")) {
        const emps = memStore.get("employees") ?? [];
        const gone = emps.find((x: any) => x.id === params[0]);
        memStore.set("employees", emps.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("employees", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM stock_movements")) {
        const arr = memStore.get("stock_movements") ?? [];
        const gone = arr.filter((x: any) => x.id === params[0]);
        memStore.set("stock_movements", arr.filter((x: any) => x.id !== params[0]));
        for (const g of gone) captureChange("stock_movements", "delete", { ...g, is_deleted: 1 });
      } else if (sql.includes("DELETE FROM stock_batches")) {
        const arr = memStore.get("stock_batches") ?? [];
        const gone = arr.filter((x: any) => x.id === params[0]);
        memStore.set("stock_batches", arr.filter((x: any) => x.id !== params[0]));
        for (const g of gone) captureChange("stock_batches", "delete", { ...g, is_deleted: 1 });
      } else if (sql.includes("INTO suspended_sale_items")) {
        const arr = memStore.get("suspended_sale_items") ?? [];
        arr.push({ id: params[0], suspended_sale_id: params[1], store_id: params[2], product_id: params[3], product_name: params[4], unit_id: params[5] ?? null, unit_name: params[6] ?? null, factor: Number(params[7] ?? 1), variant: params[8] ?? null, quantity: Number(params[9] ?? 0), base_price: Number(params[10] ?? 0), unit_price: Number(params[11] ?? 0), line_total: Number(params[12] ?? 0), bundle_applied: params[13] ? 1 : 0, created_at: params[14] ?? new Date().toISOString() });
        memStore.set("suspended_sale_items", arr);
      } else if (sql.includes("INTO suspended_sale_events")) {
        const arr = memStore.get("suspended_sale_events") ?? [];
        arr.push({ id: params[0], suspended_sale_id: params[1], actor_id: params[2] ?? null, actor_name: params[3] ?? null, action: params[4], note: params[5] ?? null, created_at: params[6] ?? new Date().toISOString() });
        memStore.set("suspended_sale_events", arr);
      } else if (sql.includes("INTO suspended_sales")) {
        const arr = memStore.get("suspended_sales") ?? [];
        const rec = { id: params[0], store_id: params[1], label: params[2], customer_id: params[3] ?? null, cashier_id: params[4] ?? null, cashier_name: params[5] ?? null, seller_role: params[6] ?? null, status: params[7] ?? "open", total: Number(params[8] ?? 0), completed_sale_id: params[9] ?? null, device_id: params[10] ?? null, created_at: params[11] ?? new Date().toISOString(), updated_at: params[12] ?? new Date().toISOString() };
        const ui = arr.findIndex((x: any) => x.id === rec.id);
        if (ui >= 0) arr[ui] = { ...arr[ui], ...rec }; else arr.push(rec);
        memStore.set("suspended_sales", arr);
      } else if (sql.includes("UPDATE suspended_sales SET")) {
        const arr = memStore.get("suspended_sales") ?? [];
        const id = params[params.length - 1];
        const rec = arr.find((x: any) => x.id === id);
        if (rec) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          setPart.split(",").forEach((c, i) => {
            const plain = c.trim().match(/^(\w+)\s*=\s*\?$/);
            if (plain && params[i] !== undefined) (rec as any)[plain[1]] = params[i];
          });
          rec.updated_at = new Date().toISOString();
        }
      } else if (sql.includes("DELETE FROM product_units")) {
        const arr = memStore.get("product_units") ?? [];
        const gone = arr.find((x: any) => x.id === params[0]);
        memStore.set("product_units", arr.filter((x: any) => x.id !== params[0]));
        if (gone) captureChange("product_units", "delete", { ...gone, is_deleted: 1 });
      } else if (sql.includes("INTO customer_notes")) {
        const arr = memStore.get("customer_notes") ?? [];
        arr.push({ id: params[0], store_id: params[1], customer_id: params[2], text: params[3], created_by: params[4] ?? null, created_at: params[5] ?? new Date().toISOString() });
        memStore.set("customer_notes", arr);
      } else if (sql.includes("DELETE FROM suspended_sale_items")) {
        const arr = memStore.get("suspended_sale_items") ?? [];
        memStore.set("suspended_sale_items", arr.filter((x: any) => x.suspended_sale_id !== params[0]));
      } else if (sql.includes("UPDATE receipts SET")) {
        // Post-sale customer attach: patch stored receipt JSON content.
        const arr = memStore.get("receipts") ?? [];
        const id = params[params.length - 1];
        const rec = arr.find((x: any) => x.id === id);
        if (rec) {
          const setPart = (sql.match(/SET\s+(.*?)\s+WHERE/i)?.[1] ?? "").trim();
          const cols = setPart.split(",").map(p => p.trim().replace(/\s*=\s*\??$/, "").trim());
          cols.forEach((col, i) => { if (params[i] !== undefined) (rec as any)[col] = params[i]; });
        }
      } else if (sql.includes("DELETE FROM receipts")) {
        // "No receipt" choice: remove stored copies so no receipt exists at all.
        const arr = memStore.get("receipts") ?? [];
        if (sql.includes("WHERE sale_id")) {
          memStore.set("receipts", arr.filter((x: any) => x.sale_id !== params[0]));
        } else {
          memStore.set("receipts", arr.filter((x: any) => x.id !== params[0]));
        }
      }
      markDirty();
      return { lastInsertRowId: 0, changes: 1 };
    },
    getAllAsync: async (sql: string, params?: any[]) => {
      if (sql.includes("FROM outbox")) return memStore.get("outbox") ?? [];
      if (sql.includes("FROM products")) {
        const all = memStore.get("products") ?? [];
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        return all;
      }
      if (sql.includes("FROM sales")) {
        const all = memStore.get("sales") ?? [];
        if (sql.includes("WHERE customer_id")) {
          const cid = params?.[0];
          return all.filter((x: any) => x.customer_id === cid);
        }
        return all;
      }
      if (sql.includes("FROM sale_items")) {
        const all = memStore.get("sale_items") ?? [];
        if (sql.includes("WHERE sale_id")) {
          const saleId = params?.[0] ?? sql.match(/sale_id = '([^']+)'/)?.[1];
          return all.filter((x: any) => x.sale_id === saleId);
        }
        return all;
      }
      if (sql.includes("FROM sale_pickups")) {
        const all = memStore.get("sale_pickups") ?? [];
        if (sql.includes("WHERE sale_id")) {
          const saleId = params?.[0];
          return all.filter((x: any) => x.sale_id === saleId);
        }
        if (sql.includes("WHERE sale_item_id")) {
          const iid = params?.[0];
          return all.filter((x: any) => x.sale_item_id === iid);
        }
        return all;
      }
      if (sql.includes("FROM customer_notes")) {
        const arr = memStore.get("customer_notes") ?? [];
        if (sql.includes("WHERE customer_id")) {
          const cid = params?.[0];
          return arr.filter((x: any) => x.customer_id === cid);
        }
        return arr;
      }
      if (sql.includes("FROM receipts")) {
        const all = memStore.get("receipts") ?? [];
        if (sql.includes("WHERE sale_id")) {
          const saleId = params?.[0] ?? sql.match(/sale_id = '([^']+)'/)?.[1];
          return all.filter((x: any) => x.sale_id === saleId);
        }
        return all;
      }
      if (sql.includes("FROM customers")) return memStore.get("customers") ?? [];
      if (sql.includes("FROM employees")) return memStore.get("employees") ?? [];
      if (sql.includes("FROM customer_history")) {
        const history = memStore.get("customer_history") ?? [];
        if (sql.includes("WHERE customer_id")) {
          const cid = params?.[0];
          return history.filter((x: any) => x.customer_id === cid);
        }
        return history;
      }
      if (sql.includes("FROM credits")) {
        const all = memStore.get("credits") ?? [];
        if (sql.includes("WHERE customer_id")) {
          const cid = params?.[0];
          return all.filter((x: any) => x.customer_id === cid);
        }
        return all;
      }
      if (sql.includes("FROM credit_payments")) return memStore.get("credit_payments") ?? [];
      if (sql.includes("FROM shifts")) return memStore.get("shifts") ?? [];
      if (sql.includes("FROM cash_movements")) {
        const all = memStore.get("cash_movements") ?? [];
        if (sql.includes("WHERE shift_id")) {
          const sid = params?.[0];
          return all.filter((x: any) => x.shift_id === sid);
        }
        return all;
      }
      if (sql.includes("FROM debt_collections")) {
        const all = memStore.get("debt_collections") ?? [];
        if (sql.includes("WHERE shift_id")) {
          const sid = params?.[0];
          return all.filter((x: any) => x.shift_id === sid);
        }
        return all;
      }
      if (sql.includes("FROM cash_requests")) {
        const all = memStore.get("cash_requests") ?? [];
        if (sql.includes("WHERE shift_id")) {
          const sid = params?.[0];
          return all.filter((x: any) => x.shift_id === sid);
        }
        return all;
      }
      if (sql.includes("FROM cash_discrepancies")) {
        const all = memStore.get("cash_discrepancies") ?? [];
        if (sql.includes("WHERE shift_id")) {
          const sid = params?.[0];
          return all.filter((x: any) => x.shift_id === sid);
        }
        return all;
      }
      if (sql.includes("FROM notifications")) {
        const all = memStore.get("notifications") ?? [];
        if (sql.includes("WHERE user_id")) {
          const uid = params?.[0];
          return all.filter((x: any) => x.user_id === uid);
        }
        if (sql.includes("WHERE status")) {
          return all.filter((x: any) => x.status === "pending");
        }
        return all;
      }
      if (sql.includes("FROM daily_reports")) {
        const all = memStore.get("daily_reports") ?? [];
        if (sql.includes("WHERE user_id")) { const v = params?.[0]; return all.filter((x: any) => x.user_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE report_date")) { const v = params?.[0]; return all.filter((x: any) => x.report_date === v); }
        return all;
      }
      if (sql.includes("FROM cashier_deficits")) {
        const all = memStore.get("cashier_deficits") ?? [];
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE status")) { const v = params?.[0]; return all.filter((x: any) => x.status === v); }
        return all;
      }
      if (sql.includes("FROM report_reviews")) {
        const all = memStore.get("report_reviews") ?? [];
        if (sql.includes("WHERE report_id")) { const v = params?.[0]; return all.filter((x: any) => x.report_id === v); }
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        return all;
      }
      if (sql.includes("FROM monthly_losses")) {
        const all = memStore.get("monthly_losses") ?? [];
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE month")) { const v = params?.[0]; return all.filter((x: any) => x.month === v); }
        return all;
      }
      if (sql.includes("FROM deficit_settlements")) {
        const all = memStore.get("deficit_settlements") ?? [];
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE status")) { const v = params?.[0]; return all.filter((x: any) => x.status === v); }
        return all;
      }
      if (sql.includes("FROM cash_register_checks")) {
        const all = memStore.get("cash_register_checks") ?? [];
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE report_id")) { const v = params?.[0]; return all.filter((x: any) => x.report_id === v); }
        return all;
      }
      if (sql.includes("FROM salary_deductions")) {
        const all = memStore.get("salary_deductions") ?? [];
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0]; return all.filter((x: any) => x.cashier_id === v); }
        return all;
      }
      if (sql.includes("FROM categories")) {
        const all = memStore.get("categories") ?? [];
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        return all;
      }
      if (sql.includes("FROM product_categories")) {
        const all = memStore.get("product_categories") ?? [];
        if (sql.includes("WHERE product_id") && sql.includes("category_id")) { const pid = params?.[0]; const cid = params?.[1]; return all.filter((x: any) => x.product_id === pid && x.category_id === cid); }
        if (sql.includes("WHERE product_id")) { const v = params?.[0]; return all.filter((x: any) => x.product_id === v); }
        if (sql.includes("WHERE category_id")) { const v = params?.[0]; return all.filter((x: any) => x.category_id === v); }
        return all;
      }
      if (sql.includes("FROM stock_batches")) {
        const all = memStore.get("stock_batches") ?? [];
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        if (sql.includes("WHERE status")) { const v = params?.[0]; return all.filter((x: any) => x.status === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        return all;
      }
      if (sql.includes("FROM stock_movements")) {
        const all = memStore.get("stock_movements") ?? [];
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        if (sql.includes("WHERE batch_id")) { const v = params?.[0]; return all.filter((x: any) => x.batch_id === v); }
        if (sql.includes("WHERE product_id")) { const v = params?.[0]; return all.filter((x: any) => x.product_id === v); }
        if (sql.includes("WHERE store_id")) { const v = params?.[0]; return all.filter((x: any) => x.store_id === v); }
        return all;
      }
      if (sql.includes("FROM product_units")) {
        const all = memStore.get("product_units") ?? [];
        if (sql.includes("WHERE product_id")) { const v = params?.[0]; return all.filter((x: any) => x.product_id === v); }
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        return all;
      }
      if (sql.includes("FROM product_prices")) {
        const all = memStore.get("product_prices") ?? [];
        if (sql.includes("WHERE unit_id")) { const v = params?.[0]; return all.filter((x: any) => x.unit_id === v); }
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        return all;
      }
      if (sql.includes("FROM product_bundles")) {
        const all = memStore.get("product_bundles") ?? [];
        if (sql.includes("WHERE unit_id")) { const v = params?.[0]; return all.filter((x: any) => x.unit_id === v); }
        return all;
      }
      if (sql.includes("FROM suspended_sale_items")) {
        const all = memStore.get("suspended_sale_items") ?? [];
        if (sql.includes("WHERE suspended_sale_id")) { const v = params?.[0] ?? sql.match(/suspended_sale_id\s*=\s*'([^']+)'/i)?.[1]; return all.filter((x: any) => x.suspended_sale_id === v); }
        return all;
      }
      if (sql.includes("FROM suspended_sale_events")) {
        const all = memStore.get("suspended_sale_events") ?? [];
        if (sql.includes("WHERE suspended_sale_id")) { const v = params?.[0] ?? sql.match(/suspended_sale_id\s*=\s*'([^']+)'/i)?.[1]; return all.filter((x: any) => x.suspended_sale_id === v); }
        return all;
      }
      if (sql.includes("FROM suspended_sales")) {
        const all = memStore.get("suspended_sales") ?? [];
        if (sql.includes("WHERE id")) { const v = params?.[0] ?? sql.match(/WHERE id\s*=\s*'([^']+)'/i)?.[1]; return all.filter((x: any) => x.id === v); }
        if (sql.includes("WHERE cashier_id")) { const v = params?.[0] ?? sql.match(/cashier_id\s*=\s*'([^']+)'/i)?.[1]; return all.filter((x: any) => x.cashier_id === v); }
        if (sql.includes("WHERE status")) { const v = params?.[0] ?? sql.match(/status\s*=\s*'([^']+)'/i)?.[1]; return all.filter((x: any) => x.status === v); }
        return all;
      }
      if (sql.includes("FROM stores")) {
        const all = memStore.get("stores") ?? [];
        if (sql.includes("WHERE id")) { const v = params?.[0]; return all.filter((x: any) => x.id === v); }
        return all;
      }
      if (sql.includes("FROM _meta")) {
        const all = memStore.get("_meta") ?? [];
        if (sql.includes("WHERE key")) { const v = params?.[0]; return all.filter((x: any) => x.key === v); }
        return all;
      }
      return [];
    },
  };
  return db;
}

// Generic helpers (same as mobile)
export async function insertOutbox(table: string, operation: "create" | "update" | "delete", payload: any) {
  const d = await getDb();
  const id = `${payload.id ?? uid("outbox")}:${Date.now()}`;
  await d.runAsync(
    "INSERT INTO outbox (id, table_name, operation, payload, created_at) VALUES (?,?,?,?,?)",
    [id, table, operation, JSON.stringify(payload), new Date().toISOString()]
  );
}

export async function getDirtyChanges(): Promise<{ table: string; operation: string; payload: any }[]> {
  const d = await getDb();
  const rows = await d.getAllAsync("SELECT * FROM outbox ORDER BY created_at ASC LIMIT 100");
  return (rows as any[]).map(r => ({ table: r.table_name, operation: r.operation, payload: JSON.parse(r.payload) }));
}

export async function clearOutbox(ids: string[]) {
  const d = await getDb();
  for (const id of ids) await d.runAsync("DELETE FROM outbox WHERE id = ?", [id]);
}

export { uid }; 
export const seedIfFresh = loadStored;