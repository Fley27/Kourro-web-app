import React, { useCallback, useEffect, useState } from "react";
import { getDb } from "../lib/db";
import { palette, radius, shadow } from "../lib/theme";
import { generateUniqueCode, isSoftwareOwner, type StoreItem } from "../lib/storeCodes";
import { useResponsive, contentW } from "../lib/responsive";
import { Button, Card, Field, ModalHeader, Overlay, Pill, TextInput, toast } from "../components/ui";
import { Icon } from "../components/Icon";

function toStoreItem(r: any): StoreItem {
  return {
    id: r.id,
    name: r.name ?? r.id,
    location: r.location ?? "",
    code: r.code ?? "",
    createdAt: r.created_at ?? new Date().toISOString(),
    disabled: !!r.disabled,
    breachFlagged: !!r.breach_flagged,
    breachedAt: r.breached_at ?? undefined,
    revokedBy: r.revoked_by ?? undefined,
  };
}

export function SecurityPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [authKey, setAuthKey] = useState("");
  const [authError, setAuthError] = useState("");
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [activeStoreId, setActiveStoreId] = useState("demo-store-id");
  const [targetStore, setTargetStore] = useState<StoreItem | null>(null);
  const [action, setAction] = useState<"rotate" | "toggle" | null>(null);
  const [confirmKey, setConfirmKey] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [result, setResult] = useState<{ storeId: string; newCode?: string; disabled?: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const { isTablet, width } = useResponsive();

  const authenticate = () => {
    if (isSoftwareOwner(authKey)) {
      setUnlocked(true);
      setAuthError("");
      toast("Aksè otorize ✓", "Konsole Sipò (Software Owner) aktive.");
    } else {
      setAuthError("Kle Sistèm pa bon — AKSÈ REFIZE.");
    }
  };

  const loadStores = useCallback(async () => {
    try {
      const db = await getDb();
      const st = (await db.getAllAsync("SELECT * FROM stores")) as any[];
      const mapped = (st ?? []).map(toStoreItem);
      setStores(mapped);
      const rows = (await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", ["active_store_id"])) as any[];
      const pref = rows?.[0]?.value;
      const pick = pref && mapped.some(s => s.id === pref) ? pref : (mapped.find(s => !s.disabled)?.id ?? mapped[0]?.id ?? "demo-store-id");
      setActiveStoreId(pick);
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const confirmed = async () => {
    if (!targetStore) return;
    if (!isSoftwareOwner(confirmKey)) {
      setConfirmError("Kle Sistèm pa bon — aksyon an anile.");
      return;
    }
    try {
      const db = await getDb();
      const ts = new Date().toISOString();
      if (action === "rotate") {
        const newCode = generateUniqueCode(stores.map(s => s.id === targetStore.id ? { ...s, code: "" } : s));
        await db.runAsync(
          "UPDATE stores SET code = ?, breach_flagged = 1, breached_at = ?, revoked_by = ? WHERE id = ?",
          [newCode, ts, "SYS-OWNER", targetStore.id]
        );
        setStores(prev => prev.map(s => s.id === targetStore.id ? { ...s, code: newCode, breachFlagged: true, breachedAt: ts, revokedBy: "SYS-OWNER" } : s));
        setResult({ storeId: targetStore.id, newCode });
      } else if (action === "toggle") {
        const disabled = !targetStore.disabled;
        await db.runAsync(
          "UPDATE stores SET disabled = ?, breach_flagged = ?, breached_at = ?, revoked_by = ? WHERE id = ?",
          [disabled ? 1 : 0, disabled ? 1 : 0, disabled ? ts : null, disabled ? "SYS-OWNER" : null, targetStore.id]
        );
        setStores(prev => prev.map(s => s.id === targetStore.id ? { ...s, disabled, breachFlagged: disabled ? true : s.breachFlagged, breachedAt: disabled ? ts : s.breachedAt, revokedBy: disabled ? "SYS-OWNER" : undefined } : s));
        if (disabled && activeStoreId === targetStore.id) {
          const safe = stores.find(s => s.id !== targetStore.id && !s.disabled);
          if (safe) {
            setActiveStoreId(safe.id);
            await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", ["active_store_id", safe.id]);
          }
        }
        setResult({ storeId: targetStore.id, disabled });
      }
      toast(action === "rotate" ? "Kòd chanje avèk siksè ✓" : targetStore.disabled ? "Magazen reaktive ✓" : "Magazen bloke ✓");
    } catch (e: any) {
      toast("Erè", String(e?.message ?? e), "error");
    }
    setTargetStore(null);
    setAction(null);
    setConfirmKey("");
    setConfirmError("");
  };

  return (
    <div style={{ width: "100%", maxWidth: contentW(isTablet, width), margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: palette.ink }}>Zòn Sekirite</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2 }}>Konsole Sipò • Software Owner</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: palette.accentGoldSoft, borderRadius: radius.pill, padding: "5px 10px", fontSize: 11, fontWeight: 800, color: palette.accentGold }}>
          <Icon name="shield-checkmark" size={13} /> SISTÈM
        </span>
      </div>

      {result ? (() => {
        const s = stores.find(x => x.id === result.storeId);
        return (
          <Card style={{ padding: 20, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: radius.md, background: palette.successBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <Icon name="shield-checkmark" size={28} color={palette.success} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 17, color: palette.ink, marginTop: 12, letterSpacing: -0.3 }}>
              {result.newCode ? "Kòd chanje avèk siksè" : result.disabled ? "Magazen bloke" : "Magazen reaktive"}
            </div>
            <div style={{ fontSize: 12, color: palette.muted2, textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>
              {result.newCode
                ? `Kòd sekrè pou ${s?.name} te chanje. Ansyen kòd la pa valab ankò.`
                : result.disabled
                  ? `Tout aktivite sou ${s?.name} te sispann.`
                  : `${s?.name} ka fonksyone ankò.`}
            </div>
            {result.newCode && (
              <div style={{ marginTop: 14, background: palette.ink2, borderRadius: radius.md, padding: "14px 24px", textAlign: "center" }}>
                <div style={{ color: palette.muted3, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Nouvo kòd (yon sèl fwa)</div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 24, letterSpacing: 4, marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{result.newCode}</div>
              </div>
            )}
            <Button label="Fèmen" icon="checkmark" block style={{ marginTop: 16 }} onClick={() => setResult(null)} />
          </Card>
        );
      })() : !unlocked ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: palette.ink2, borderRadius: radius.lg, padding: 16, boxShadow: shadow.elevated }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="shield-checkmark" size={18} color={palette.warningDot} />
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: -0.3 }}>Konsole Sipò (Software Owner)</span>
            </div>
            <div style={{ color: palette.muted3, marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
              Zòn sekirite sistèm. Sèlman Software Owner ka chanje operasyon sou kòd sekrè magazen. Store Owner pa gen pouvwa sa a.
            </div>
          </div>

          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="key" size={15} color={palette.ink} />
              <span style={{ fontWeight: 800, fontSize: 13, color: palette.ink }}>Antre Kle Sistèm</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <TextInput
                value={authKey}
                onChange={v => { setAuthKey(v); if (authError) setAuthError(""); }}
                placeholder="Kle Sistèm Software Owner"
                type="password"
              />
            </div>
            {authError ? <div style={{ fontSize: 12, color: palette.danger, fontWeight: 700, marginTop: 8 }}>{authError}</div> : null}
            <Button label="Verifye aksè" icon="shield-checkmark" block style={{ marginTop: 12 }} onClick={authenticate} />
          </Card>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card style={{ padding: 14, background: palette.warningBg, borderColor: palette.warningBd }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="warning" size={15} color={palette.warning} />
              <span style={{ fontWeight: 800, fontSize: 12, color: palette.warning }}>Konsèy sekirite</span>
            </div>
            <div style={{ fontSize: 11, color: palette.warning, marginTop: 4, lineHeight: 1.5 }}>
              Chak kòd sekrè inik pou tout magazen yo. Si gen bès sekirite, chanje kòd la (ansyen an vini pa valab) oswa bloke magazen an nèt.
            </div>
          </Card>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 12, borderBottom: `0.5px solid ${palette.separator}`, background: palette.surface2, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="store" size={15} color={palette.ink} />
              <span style={{ fontWeight: 900, fontSize: 13, color: palette.ink }}>Magazen yo ({stores.length})</span>
            </div>
            {stores.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: palette.muted2, fontSize: 12 }}>Pa gen magazen anrejistre.</div>
            ) : stores.map(s => {
              const isActive = s.id === activeStoreId;
              return (
                <div key={s.id} style={{ padding: 12, borderBottom: `0.5px solid ${palette.separatorSoft}`, background: s.disabled ? palette.dangerBg : palette.surface }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: s.disabled ? palette.dangerBg : palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name="store" size={18} color={s.disabled ? palette.danger : palette.muted2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {isActive && <Pill tone="success">AKTIF</Pill>}
                        {s.disabled && <Pill tone="danger">BLOKE</Pill>}
                        {s.breachFlagged && !s.disabled && <Pill tone="warn">BÈS</Pill>}
                      </div>
                      <div style={{ fontSize: 11, color: palette.muted2, marginTop: 1 }}>{s.location} • Depi {new Date(s.createdAt).toLocaleDateString()}</div>
                    </div>
                    <Icon name={s.disabled ? "lock" : "shield-checkmark"} size={18} color={s.disabled ? palette.danger : palette.success} />
                  </div>
                  <div style={{ marginTop: 8, background: palette.surface2, border: `0.5px solid ${palette.separator}`, borderRadius: radius.sm, padding: 8, display: "flex", alignItems: "center" }}>
                    <Icon name="lock" size={13} color={palette.muted2} />
                    <span style={{ fontSize: 11, color: palette.muted2, fontWeight: 700, marginLeft: 6 }}>Kòd sekrè</span>
                    <div style={{ marginLeft: "auto", background: palette.surfaceGrouped, padding: "2px 6px", borderRadius: 4 }}>
                      <span style={{ fontSize: 11, color: palette.muted2, fontWeight: 700, letterSpacing: 2 }}>••••</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <Button
                      label="Chanje kòd"
                      icon="refresh"
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => { setTargetStore(s); setAction("rotate"); setConfirmKey(""); setConfirmError(""); }}
                    />
                    <Button
                      label={s.disabled ? "Reaktive" : "Bloke magazen"}
                      icon={s.disabled ? "checkmark-circle" : "lock"}
                      variant={s.disabled ? "success" : "danger"}
                      size="sm"
                      style={{ flex: 1 }}
                      onClick={() => { setTargetStore(s); setAction("toggle"); setConfirmKey(""); setConfirmError(""); }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>

          <Card style={{ padding: 16, background: palette.surface2, borderColor: palette.separator }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="info" size={15} color={palette.muted2} />
              <span style={{ fontWeight: 800, fontSize: 12, color: palette.muted2 }}>Rezime operasyon</span>
            </div>
            <div style={{ fontSize: 11, color: palette.muted3, marginTop: 4, lineHeight: 1.5 }}>
              Chanje yon kòd fèt yon sèl fwa epi ansyen an p ap valab pou lajan — menm kesye ki gen l p ap ka jwenn aksè. Bloke yon magazen sispann tout aktivite li nèt.
            </div>
          </Card>
        </div>
      )}

      {targetStore && (
        <Overlay onClose={() => { setTargetStore(null); setConfirmKey(""); setConfirmError(""); }} width={480}>
          <ModalHeader
            title={action === "rotate" ? "Chanje kòd sekrè" : targetStore.disabled ? "Reaktive magazen" : "Bloke magazen"}
            sub={action === "rotate"
              ? `${targetStore.name}: yon nouvo kòd inik ap généré epi ansyen an p ap valab ankò.`
              : `${targetStore.name} ap ${targetStore.disabled ? "reaktive" : "bloke"}. Aksyon sa a mande Kle Sistèm.`}
            onClose={() => { setTargetStore(null); setConfirmKey(""); setConfirmError(""); }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: radius.md, background: action === "rotate" ? palette.warningBg : palette.dangerBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={action === "rotate" ? "refresh" : "lock"} size={22} color={action === "rotate" ? palette.warningDot : palette.danger} />
            </div>
            <div style={{ fontSize: 12.5, color: palette.muted, lineHeight: 1.5 }}>Rekonfime aksyon sa a avèk Kle Sistèm Software Owner.</div>
          </div>
          <Field label="Rekonfime Kle Sistèm" required>
            <TextInput
              value={confirmKey}
              onChange={v => { setConfirmKey(v); if (confirmError) setConfirmError(""); }}
              placeholder="Kle Sistèm (SYS-OWNER)"
              type="password"
              autoFocus
            />
          </Field>
          {confirmError ? <div style={{ fontSize: 12, color: palette.danger, fontWeight: 700, marginTop: 8 }}>{confirmError}</div> : null}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => { setTargetStore(null); setConfirmKey(""); setConfirmError(""); }} />
            <Button label="Konfime" icon="shield-checkmark" style={{ flex: 1 }} onClick={confirmed} />
          </div>
        </Overlay>
      )}

      {!ready && <div style={{ textAlign: "center", padding: 30, color: palette.muted2, fontSize: 13 }}>Ap chaje…</div>}
    </div>
  );
}