import React, { useEffect, useMemo, useState } from "react";
import { getDb } from "../lib/db";
import { palette, radius, shadow } from "../lib/theme";
import { fmt, monoStyle, shortDate, shortTime } from "../lib/format";
import { contentW, useResponsive } from "../lib/responsive";
import { EmptyState, SearchBar, Select, Segmented } from "../components/ui";
import { Icon } from "../components/Icon";

type Product = { id: string; name: string; sku?: string };
type PriceChange = {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  oldPrice: number;
  newPrice: number;
  changedBy?: string;
  createdAt: string;
};
type RangeFilter = "30j" | "90j" | "tout";

function KpiMini({ accent, label, value, sub, valueColor }: { accent: string; label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: palette.surface, border: `0.5px solid ${palette.hairline}`, borderRadius: radius.md, padding: 12, overflow: "hidden", boxShadow: shadow.soft, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2.5, background: accent }} />
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.9, color: palette.muted2 }}>{label}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.8, color: valueColor ?? palette.ink, marginTop: 7, ...monoStyle }} className="num">{value}</div>
      <div style={{ fontSize: 10.5, color: palette.muted, marginTop: 3 }}>{sub}</div>
    </div>
  );
}

export function PriceHistoryPage() {
  const { width, isTablet, padH } = useResponsive();
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<RangeFilter>("30j");
  const [byProduct, setByProduct] = useState(true);

  async function load() {
    const db = await getDb();
    try {
      const products = ((await db.getAllAsync("SELECT * FROM products")) as Product[]) ?? [];
      const nameOf = new Map<string, string>();
      const skuOf = new Map<string, string>();
      for (const p of products) { nameOf.set(p.id, p.name); skuOf.set(p.id, p.sku ?? ""); }
      const rows: PriceChange[] = [];
      const seen = new Set<string>();
      try {
        const ph = ((await db.getAllAsync("SELECT * FROM price_history ORDER BY created_at DESC")) as any[]) ?? [];
        for (const r of ph) {
          if (!r.product_id) continue;
          const key = r.id ?? `${r.product_id}-${r.created_at}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            id: key,
            productId: r.product_id,
            productName: nameOf.get(r.product_id) ?? (r.product_name ?? ""),
            sku: skuOf.get(r.product_id),
            oldPrice: Number(r.old_price ?? 0) || 0,
            newPrice: Number(r.new_price ?? 0) || 0,
            createdAt: r.created_at ?? new Date().toISOString(),
          });
        }
      } catch {}
      try {
        const outbox = ((await db.getAllAsync("SELECT * FROM outbox")) as any[]) ?? [];
        for (const o of outbox) {
          if (o.table_name !== "price_history" || o.operation !== "create") continue;
          let payload: any = {};
          try { payload = JSON.parse(o.payload ?? "{}"); } catch { payload = {}; }
          if (!payload.product_id) continue;
          const key = payload.id ?? `${payload.product_id}-${payload.created_at ?? o.created_at}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            id: key,
            productId: payload.product_id,
            productName: nameOf.get(payload.product_id) ?? payload.product_name ?? "",
            sku: skuOf.get(payload.product_id),
            oldPrice: Number(payload.old_price ?? 0) || 0,
            newPrice: Number(payload.new_price ?? 0) || 0,
            changedBy: payload.changed_by ?? payload.created_by ?? "",
            createdAt: payload.created_at ?? o.created_at ?? new Date().toISOString(),
          });
        }
      } catch {}
      rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setChanges(rows);
    } catch {}
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, []);

  const cutoff = useMemo(() => {
    if (range === "tout") return 0;
    const days = range === "30j" ? 30 : 90;
    return new Date().getTime() - days * 86400000;
  }, [range]);

  const visible = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return changes.filter(c => {
      if (cutoff && new Date(c.createdAt).getTime() < cutoff) return false;
      if (!qq) return true;
      return c.productName.toLowerCase().includes(qq) || (c.sku ?? "").toLowerCase().includes(qq);
    });
  }, [changes, cutoff, q]);

  const stats = useMemo(() => {
    let ups = 0, downs = 0, net = 0;
    for (const c of visible) {
      const d = c.newPrice - c.oldPrice;
      net += d;
      if (d > 0) ups++;
      else if (d < 0) downs++;
    }
    const unique = new Set(visible.map(c => c.productId)).size;
    const last = visible.length ? visible[0].createdAt : "";
    return { count: visible.length, ups, downs, net, unique, last };
  }, [visible]);

  const grouped = useMemo(() => {
    if (!byProduct) return [] as { name: string; sku?: string; items: PriceChange[] }[];
    const m = new Map<string, { name: string; sku?: string; items: PriceChange[] }>();
    for (const c of visible) {
      const key = c.productId;
      if (!m.has(key)) m.set(key, { name: c.productName, sku: c.sku, items: [] });
      m.get(key)!.items.push(c);
    }
    return [...m.values()].sort((a, b) => new Date(b.items[0].createdAt).getTime() - new Date(a.items[0].createdAt).getTime());
  }, [visible, byProduct]);

  const list = byProduct ? grouped : (() => {
    const m = new Map<string, { name: string; sku?: string; items: PriceChange[] }>();
    const g = [...visible].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    for (const c of g) {
      const key = c.createdAt.slice(0, 10);
      if (!m.has(key)) m.set(key, { name: shortDate(new Date(c.createdAt).getTime()), sku: undefined, items: [] });
      m.get(key)!.items.push(c);
    }
    return [...m.values()];
  })();

  return (
    <div style={{ minHeight: "100vh", background: palette.bg, position: "relative" }}>
      <div style={{ maxWidth: contentW(isTablet, width, 880), margin: "0 auto", padding: padH, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: palette.accentGoldSoft, border: `0.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="pricetag" size={20} color={palette.accentGold} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: palette.ink, letterSpacing: -0.4 }}>Istwa pri</div>
            <div style={{ fontSize: 11.5, color: palette.muted }}>Chak chanjman pri sou pwodwi, soti pi resan pou rive pi ansyen.</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <KpiMini accent={palette.blue} label="TOTAL CHANJMAN" value={`${stats.count}`} sub={`${stats.ups} moute · ${stats.downs} desann`} />
          <KpiMini accent={palette.emerald} label="PWODWI TOUCHE" value={`${stats.unique}`} sub="pwodwi ki te chanje pri" />
          <KpiMini accent={stats.net >= 0 ? palette.success : palette.danger} label="DELTA NÈT" value={`${stats.net >= 0 ? "+" : ""}${fmt(stats.net)} HTG`} valueColor={stats.net >= 0 ? palette.success : palette.danger} sub="òmòmpri vs nouvo pri" />
          <KpiMini accent={palette.accentGold} label="DÈNYE CHANJMAN" value={stats.last ? shortDate(new Date(stats.last).getTime()) : "—"} sub={stats.last ? shortTime(new Date(stats.last).getTime()) : "pa ankò"} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SearchBar value={q} onChange={setQ} placeholder="Filtre pa non pwodwi oswa SKU..." />
          </div>
          <div style={{ width: 220 }}>
            <Select
              value={range}
              onChange={v => setRange(v as RangeFilter)}
              options={[
                { value: "30j", label: "30 dènye jou" },
                { value: "90j", label: "90 dènye jou" },
                { value: "tout", label: "Tout tan" },
              ]}
            />
          </div>
          <div style={{ width: 280 }}>
            <Segmented value={byProduct ? "pwodwi" : "dat"} onChange={v => setByProduct(v === "pwodwi")} options={[{ value: "pwodwi", label: "Pa pwodwi" }, { value: "dat", label: "Pa dat" }]} />
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {list.length === 0 && (
            <EmptyState icon="pricetag" title="Pa gen istwa pri" body={changes.length === 0 && !q && range === "30j" ? "Vide — chanje pri yon pwodwi nan paj Stock la pou li parèt isit la epi atann senti a.\n(Apèsi baz web la pa kenbe price_history; list la soti nan outbox la.)" : "Pa gen chanjman ki matche filtè a."} />
          )}
          {list.map(g => (
            <div key={g.name} style={{ background: palette.surface, borderRadius: radius.md, border: `0.5px solid ${palette.hairline}`, boxShadow: shadow.soft, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", background: palette.surfaceGrouped, borderBottom: `0.5px solid ${palette.hairline}` }}>
                <Icon name="tag" size={13} color={palette.accentGold} />
                <span style={{ fontWeight: 800, fontSize: 12.5, color: palette.ink, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {g.name}
                </span>
                <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 700 }} className="num">{g.items.length} chanjman</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {g.items.map((c, i) => {
                  const delta = c.newPrice - c.oldPrice;
                  const pct = c.oldPrice > 0 ? (delta / c.oldPrice) * 100 : 0;
                  const up = delta > 0;
                  const down = delta < 0;
                  const tone = up ? { label: "Moute", c: palette.success, bg: palette.successBg, bd: palette.successBd } : down ? { label: "Desann", c: palette.danger, bg: palette.dangerBg, bd: palette.dangerBd } : { label: "Menm", c: palette.muted2, bg: palette.surfaceGrouped, bd: palette.hairline };
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: i > 0 ? `0.5px solid ${palette.separatorSoft}` : "none" }}>
                      <span style={{ minWidth: 78, fontSize: 10.5, color: palette.muted2, fontWeight: 600 }}>
                        {shortDate(new Date(c.createdAt).getTime())}<br />
                        <span style={{ color: palette.muted3 }}>{shortTime(new Date(c.createdAt).getTime())}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: palette.muted, textDecoration: "line-through", ...monoStyle }} className="num">{fmt(c.oldPrice)}</span>
                        <Icon name="chevron-right" size={12} color={palette.muted3} />
                        <span style={{ fontSize: 14, fontWeight: 800, color: palette.ink, ...monoStyle }} className="num">{fmt(c.newPrice)} HTG</span>
                        {delta !== 0 ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: tone.bg, border: `0.5px solid ${tone.bd}`, borderRadius: radius.pill, padding: "2px 7px", fontSize: 10, fontWeight: 800, color: tone.c }} className="num">
                            {up ? "▲" : "▼"} {fmt(Math.abs(delta))} HTG · {fmt(Math.abs(pct), 1)}%
                          </span>
                        ) : null}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: tone.c, background: tone.bg, padding: "3px 8px", borderRadius: radius.pill }}>
                        {tone.label}
                      </span>
                      {c.changedBy ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: palette.muted2, whiteSpace: "nowrap" }}>
                          <Icon name="edit" size={11} color={palette.muted3} />
                          {c.changedBy}
                        </span>
                      ) : c.sku ? (
                        <span style={{ fontSize: 10, color: palette.muted3, whiteSpace: "nowrap" }}>{c.sku}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}