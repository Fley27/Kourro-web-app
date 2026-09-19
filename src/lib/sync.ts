// Web SyncManager — cloud + LAN paths (port of mobile sync/syncManager).
import { getDb, getDirtyChanges } from "./db";
import { middlewareUrl } from "./supabase";

export class SyncManager {
  storeId: string;
  deviceId: string;
  lastSyncedAt: string | null = null;
  onStatus: (s: "offline" | "syncing" | "synced" | "error", msg?: string | null) => void;
  private accessToken: string | null = null;

  constructor(storeId: string, deviceId: string, onStatus?: SyncManager["onStatus"]) {
    this.storeId = storeId;
    this.deviceId = deviceId;
    this.onStatus = onStatus ?? (() => {});
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };
    if (this.accessToken) h["Authorization"] = `Bearer ${this.accessToken}`;
    return h;
  }

  private async readLastSynced() {
    try {
      const db = await getDb();
      const meta = await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", ["last_synced_at"]);
      if (meta?.length) this.lastSyncedAt = meta[0].value;
    } catch {}
  }

  async pushToCloud(): Promise<void> {
    const changesRaw = await getDirtyChanges();
    if (!changesRaw.length) { this.onStatus("synced"); return; }
    this.onStatus("syncing");
    const payload = {
      store_id: this.storeId,
      device_id: this.deviceId,
      changes: changesRaw.map(c => ({ table: c.table, operation: c.operation, record: c.payload })),
      last_synced_at: this.lastSyncedAt,
    };
    const res = await fetch(`${middlewareUrl}/api/sync/push`, {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`push failed ${res.status}`);
    const data = await res.json();
    const db = await getDb();
    await db.runAsync("DELETE FROM outbox");
    this.lastSyncedAt = data.server_time ?? new Date().toISOString();
    await db.runAsync("INSERT OR REPLACE INTO _meta (key,value) VALUES (?,?)", ["last_synced_at", this.lastSyncedAt!]);
    this.onStatus("synced", this.lastSyncedAt);
  }

  async pullFromCloud(): Promise<void> {
    await this.readLastSynced();
    const since = this.lastSyncedAt ?? new Date(0).toISOString();
    const url = `${middlewareUrl}/api/sync/pull?store_id=${this.storeId}&device_id=${this.deviceId}&since=${encodeURIComponent(since)}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`pull failed ${res.status}`);
    const { changes, server_time } = await res.json();
    await this.applyChanges(changes ?? []);
    this.lastSyncedAt = server_time ?? new Date().toISOString();
    this.onStatus("synced", this.lastSyncedAt);
  }

  async applyChanges(changes: any[]): Promise<void> {
    const db = await getDb();
    for (const ch of changes) {
      const r = ch?.record ?? ch;
      if (!r || !r.id) continue;
      try {
        if (ch?.table === "products") {
          await db.runAsync(
            `INSERT OR REPLACE INTO products (id,store_id,sku,name,cost_price,stock_quantity,current_amount_available,low_stock_threshold,lamport_clock,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [r.id, r.store_id, r.sku ?? "", r.name, r.cost_price, r.stock_quantity, r.current_amount_available ?? r.stock_quantity, r.low_stock_threshold ?? 5, r.lamport_clock ?? 0, r.updated_at ?? new Date().toISOString()]
          );
        }
      } catch (e) { console.warn("apply error", e); }
    }
  }

  // LAN P2P — connect to hub WebSocket (best-effort; offline apps ignore failure).
  connectLAN(hubUrl: string): WebSocket | null {
    try {
      const wsUrl = hubUrl.replace("http", "ws") + `/lan?store_id=${this.storeId}&device_id=${this.deviceId}`;
      const ws = new WebSocket(wsUrl);
      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.changes) await this.applyChanges(msg.changes);
        } catch {}
      };
      return ws;
    } catch { return null; }
  }

  async fullSync(): Promise<void> {
    try { await this.pushToCloud(); } catch (e) { this.onStatus("error", "push offline / failed"); }
    try { await this.pullFromCloud(); } catch (e) { this.onStatus("error", "pull offline / failed"); }
  }
}