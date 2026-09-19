import { useCallback, useEffect, useMemo, useState } from "react";
import { palette, radius, shadow } from "../lib/theme";
import { fmt } from "../lib/format";
import { getDb } from "../lib/db";
import { salesEvents } from "../lib/salesEvents";
import { markAllNotifsRead, notifyLocal } from "../lib/notifications";
import { useAuthStore } from "../lib/authStore";
import { Icon } from "../components/Icon";
import { Button, Card, EmptyState, KpiMini, Pill, Segmented } from "../components/ui";

function td(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  if (isNaN(d.getTime())) return "—";
  const same = d.toDateString() === new Date().toDateString();
  return same
    ? `Jodi a ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function notifMeta(n: any): { icon: string; color: string; label: string } {
  const t = String(n?.type ?? "");
  if (t === "shift_opening" || t === "shift_start" || t === "shift_review" || t === "shift" || t === "cash_confirm_yes")
    return { icon: "clock", color: palette.accentGold, label: "Chanjman" };
  if (t === "report_closed") return { icon: "file-text", color: palette.blue, label: "Rapò" };
  if (t === "deficit") return { icon: "warning", color: palette.danger, label: "Defisi" };
  if (t === "cash_discrepancy" || t === "reg_complaint") return { icon: "warning", color: palette.warning, label: "Diskrepans" };
  if (t === "reg_resolved" || t === "reg_rejected") return { icon: "shield-checkmark", color: palette.success, label: "Kes" };
  if (t === "withdrawal") return { icon: "cash", color: palette.success, label: "Retrè" };
  if (t === "inventory_pickup" || t === "inventory") return { icon: "box", color: palette.accentGold, label: "Envantè" };
  if (t === "low_stock") return { icon: "alert", color: palette.danger, label: "Stòk" };
  if (t === "credit") return { icon: "tag", color: palette.violet, label: "Kredi" };
  if (t === "withdrawal_request" || t === "cash_request") return { icon: "cash", color: palette.blue, label: "Demann" };
  return { icon: "bell", color: palette.muted2, label: "Sistèm" };
}

export function NotificationsPage() {
  const { user } = useAuthStore();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [tab, setTab] = useState<"all" | "pending" | "read">("all");

  const isSupervisor = !!user && (user.role === "owner" || user.role === "admin" || user.role === "manager");

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const db = await getDb();
      const mine = (await db.getAllAsync("SELECT * FROM notifications WHERE user_id = ?", [user.id])) as any[];
      let all: any[] = [...mine];
      if (isSupervisor) {
        const storePending = (await db.getAllAsync("SELECT * FROM notifications WHERE status = ?", ["pending"])) as any[];
        all = [...all, ...storePending];
      }
      const seen = new Set<string>();
      setNotifs(all.filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; }).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))));
    } catch {}
  }, [user, isSupervisor]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    (async () => { try { unsub = salesEvents.subscribe(load); } catch {} })();
    const id = setInterval(load, 2500);
    return () => { clearInterval(id); if (unsub) unsub(); };
  }, [load]);

  const pendingCount = useMemo(() => notifs.filter(n => String(n.status ?? "pending") === "pending").length, [notifs]);
  const readCount = notifs.length - pendingCount;
  const discrepancyCount = useMemo(() => notifs.filter(n => String(n.type ?? "").includes("discrepancy")).length, [notifs]);
  const deficitCount = useMemo(() => notifs.filter(n => String(n.type ?? "") === "deficit").length, [notifs]);

  const visible = useMemo(() => {
    if (tab === "all") return notifs;
    if (tab === "pending") return notifs.filter(n => String(n.status ?? "pending") === "pending");
    return notifs.filter(n => String(n.status ?? "pending") === "read");
  }, [tab, notifs]);

  async function markAllRead() {
    if (!user) return;
    try {
      const db = await getDb();
      await markAllNotifsRead(db, user.id);
      setNotifs(prev => prev.map(n => (String(n.status) === "pending" ? { ...n, status: "read" } : n)));
      notifyLocal("Notifikasyon", `${pendingCount} notifikasyon make li.`);
    } catch {}
  }

  async function markOneRead(n: any) {
    if (String(n.status ?? "pending") === "read") return;
    try {
      const db = await getDb();
      await db.runAsync("UPDATE notifications SET status = ? WHERE id = ?", ["read", n.id]);
      setNotifs(prev => prev.map(x => (x.id === n.id ? { ...x, status: "read" } : x)));
    } catch {}
  }

  if (!user) {
    return (
      <div style={{ width: "100%", maxWidth: 620, margin: "0 auto" }}>
        <Card><EmptyState icon="bell" title="Konekte ou anvan" body="Ou dwe konekte pou wè notifikasyon yo." /></Card>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: palette.ink2, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <Icon name="bell" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: palette.ink, letterSpacing: -0.3 }}>Notifikasyon</div>
          <div style={{ fontSize: 11, color: palette.muted2 }}>{notifs.length} mesaj • {pendingCount} pandan</div>
        </div>
        <Button
          label="Make tout li"
          variant="soft"
          size="sm"
          icon="checkmark"
          disabled={pendingCount === 0}
          onClick={markAllRead}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <KpiMini label="Pandan" value={<span className="num">{pendingCount}</span>} icon="clock" color={palette.warning} sub={pendingCount ? "pou revize" : "tout li"} />
        <KpiMini label="Li" value={<span className="num">{readCount}</span>} icon="checkmark-circle" color={palette.success} sub="make li" />
        <KpiMini label="Diskrepans" value={<span className="num">{discrepancyCount}</span>} icon="warning" color={palette.danger} sub="kach" />
        <KpiMini label="Defisi" value={<span className="num">{deficitCount}</span>} icon="alert" color={palette.violet} sub="kesye" />
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: `Tout (${notifs.length})` },
          { value: "pending", label: `Pandan (${pendingCount})` },
          { value: "read", label: `Li (${readCount})` },
        ]}
      />

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "13px 14px", borderBottom: `0.5px solid ${palette.separator}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: palette.accentGoldSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="bell" size={15} color={palette.accentGold} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, color: palette.ink }}>{isSupervisor ? "Tout Aktivite (Store)" : "Mesaj Apre Mwen"}</span>
          <div style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 999, background: palette.surface2, fontSize: 10, fontWeight: 700, color: palette.muted2 }}>
            <span className="num">{visible.length}</span>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon="checkmark-circle" title="Pa gen notifikasyon" body="Kite aktivite yo vini — nou ap voye lè li nesesè." />
        ) : (
          visible.map(n => {
            const m = notifMeta(n);
            const pending = String(n.status ?? "pending") === "pending";
            return (
              <button
                key={n.id}
                onClick={() => markOneRead(n)}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
                  border: "none", borderBottom: `0.5px solid ${palette.separatorSoft}`, cursor: "pointer", background: "transparent",
                  textAlign: "left", fontFamily: "inherit",
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 11, background: pending ? `${m.color}18` : palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon name={m.icon} size={15} color={pending ? m.color : palette.muted2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: 0.4 }}>{m.label}</span>
                    {pending && <span style={{ width: 7, height: 7, borderRadius: 4, background: palette.warningDot }} />}
                  </div>
                  <div style={{ fontSize: 12, color: palette.inkSoft, marginTop: 2, lineHeight: 1.45 }}>{n.message ?? "—"}</div>
                  <div style={{ fontSize: 10, color: palette.muted3, marginTop: 3 }} className="num">{td(n.created_at)}</div>
                </div>
                <Pill tone={pending ? "warn" : "neutral"}>{pending ? "Pandan" : "Li"}</Pill>
              </button>
            );
          })
        )}
      </Card>

      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10, color: palette.muted2 }}>
        <Icon name="info" size={13} color={palette.muted3} />
        <span>Notifikasyon yo kenbe nan aparèy la (lokal) — "Make tout li" fèmen yo pandan ke chanjman elimeni yo ka toujou rive.</span>
      </div>
    </div>
  );
}