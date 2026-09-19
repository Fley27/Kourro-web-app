import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDb } from "../lib/db";
import { palette, radius } from "../lib/theme";
import { generateUniqueCode, type StoreItem } from "../lib/storeCodes";
import { cacheProfile, useAuthStore } from "../lib/authStore";
import type { Role } from "../lib/users";
import { useResponsive, contentW } from "../lib/responsive";
import { notifyLocal } from "../lib/notifications";
import { Button, Card, Confirm, Field, ModalHeader, Overlay, Pill, RowItem, TextInput, toast } from "../components/ui";
import { Icon } from "../components/Icon";

const MAX_STORES = 3;

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: "OWNER", color: "#7A5C10", bg: palette.accentGoldSoft },
  admin: { label: "ADMIN", color: "#1E40AF", bg: "#EFF6FF" },
  manager: { label: "MANAGER", color: "#92400E", bg: "#FFFBEB" },
  cashier: { label: "KESYE", color: "#6D28D9", bg: "#F5F3FF" },
};

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

function initials(n: string) {
  return (n || "?")
    .split(" ")
    .map(p => p?.[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.cashier;
  return (
    <span style={{ background: m.bg, borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 700, color: m.color, letterSpacing: 0.3 }}>
      {m.label}
    </span>
  );
}

export function AccountPage() {
  const { user, cached, signOut } = useAuthStore();
  const nav = useNavigate();
  const { isTablet, width } = useResponsive();

  const role = (user?.role ?? "cashier") as Role;
  const isOwner = role === "owner";
  const displayName = cached?.name ?? user?.name ?? "Itilizatè";
  const displayStore = cached?.store ?? user?.store ?? "Petyonvil";

  const [ready, setReady] = useState(false);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [activeStoreId, setActiveStoreId] = useState("demo-store-id");
  const [appDisabled, setAppDisabled] = useState(false);
  const [justSwitched, setJustSwitched] = useState<string | null>(null);

  const [editProfile, setEditProfile] = useState(false);
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pwOpen, setPwOpen] = useState(false);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [confirmSignout, setConfirmSignout] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [verifyStore, setVerifyStore] = useState<StoreItem | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const active = stores.find(s => s.id === activeStoreId) ?? stores[0];
  const todayStr = new Date().toLocaleDateString("fr-HT", { year: "numeric", month: "long", day: "numeric" });

  const loadAll = useCallback(async () => {
    try {
      const db = await getDb();
      const st = (await db.getAllAsync("SELECT * FROM stores")) as any[];
      const mapped = (st ?? []).map(toStoreItem);
      setStores(mapped);
      const prefRows = (await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", ["active_store_id"])) as any[];
      const pref = prefRows?.[0]?.value;
      const pick = pref && mapped.some(s => s.id === pref) ? pref : (mapped.find(s => !s.disabled)?.id ?? mapped[0]?.id ?? "demo-store-id");
      setActiveStoreId(pick);
      const appRows = (await db.getAllAsync("SELECT * FROM _meta WHERE key = ?", ["app_disabled"])) as any[];
      setAppDisabled((appRows?.[0]?.value ?? "0") === "1");
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function saveProfile() {
    if (!cached && !user) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    const name = pName.trim() || displayName;
    const phone = pPhone.trim();
    const next = cached ? { ...cached, name } : null;
    try {
      if (next) {
        await cacheProfile(next);
        useAuthStore.setState({ cached: next, user: user ? { ...user, name, phone: phone || user.phone } : user });
      }
      const db = await getDb();
      await db.runAsync("UPDATE employees SET full_name = ? WHERE id = ?", [cached?.userId ?? user?.id ?? "", name]);
      if (phone) await db.runAsync("UPDATE employees SET phone = ? WHERE id = ?", [phone, cached?.userId ?? user?.id ?? ""]);
      setEditProfile(false);
      notifyLocal("Pwofil ajou", name);
      toast("Pwofil ajou ✓");
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function savePin() {
    if (!cached && !user) { toast("Sesi", "Ou dwe konekte yon itilizatè", "warn"); return; }
    if (pinCurrent.trim() !== (cached?.pin ?? user?.secret ?? "")) { toast("Kòd aktyèl pa bon", "Verifye kòd sekrè ou aktyèl la.", "error"); return; }
    if (!pinNew.trim()) { toast("Antre nouvo kòd", "", "warn"); return; }
    try {
      const next = cached ? { ...cached, pin: pinNew.trim() } : null;
      if (next) {
        await cacheProfile(next);
        useAuthStore.setState({ cached: next, user: user ? { ...user, secret: pinNew.trim() } : user });
      }
      setPinOpen(false); setPinCurrent(""); setPinNew("");
      notifyLocal("Kòd chanje", "Kòd sekrè ou ajou.");
      toast("Kòd chanje ✓");
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function savePassword() {
    if (!pwNew.trim()) { toast("Antre modpas", "", "warn"); return; }
    if (pwNew !== pwConfirm) { toast("Modpas pa matche", "De modpas yo dwe idantik.", "error"); return; }
    try { localStorage.setItem("jm_web_password", pwNew); } catch {}
    setPwOpen(false); setPwNew(""); setPwConfirm("");
    notifyLocal("Modpas chanje", "Nouvo modpas anrejistre.");
    toast("Modpas chanje ✓");
  }

  async function createStore() {
    if (!newName.trim() || !newLocation.trim()) { setError("Non ak lokal obligatwa."); return; }
    if (stores.length >= MAX_STORES) { setError("Ou rive nan limit maksimòm (3 magazen). Pou plis, ou bezwen aksè espesyal."); return; }
    try {
      const code = generateUniqueCode(stores);
      const id = `st-${Date.now()}`;
      const ts = new Date().toISOString();
      const db = await getDb();
      await db.runAsync(
        "INSERT OR REPLACE INTO stores (id,name,location,code,currency,created_at,updated_at,disabled,breach_flagged,breached_at,revoked_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [id, newName.trim(), newLocation.trim(), code, "HTG", ts, ts, 0, 0, null, null]
      );
      await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", ["active_store_id", id]);
      setStores(prev => [...prev, { id, name: newName.trim(), location: newLocation.trim(), code, createdAt: ts }]);
      setActiveStoreId(id);
      setJustSwitched(id);
      setTimeout(() => setJustSwitched(null), 2500);
      setShowCreate(false); setNewName(""); setNewLocation(""); setError("");
      setCreatedCode(code);
      notifyLocal("Magazen kreye", `${newName.trim()} — kòd sekrè te généré otomatikman.`);
    } catch (e: any) { setError(String(e?.message ?? e)); }
  }

  async function confirmSwitch() {
    if (!verifyStore) return;
    if (verifyStore.disabled) {
      setVerifyStore(null);
      toast("Magazen bloke", "Magazen sa a sispann apre yon bès sekirite. Kontakte Konsole Sipò pou rektifye.", "warn");
      return;
    }
    const input = verifyCode.trim().toUpperCase();
    if (input !== verifyStore.code.toUpperCase()) { setCodeError("Kòd sekrè pa kòrèk. Eseye ankò."); return; }
    try {
      const db = await getDb();
      await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", ["active_store_id", verifyStore.id]);
      setActiveStoreId(verifyStore.id);
      setJustSwitched(verifyStore.id);
      setTimeout(() => setJustSwitched(null), 2500);
      setVerifyStore(null); setVerifyCode(""); setCodeError("");
      notifyLocal("Magazen chanje", `Aktif kounye a: ${verifyStore.name}.`);
      toast("Magazen chanje ✓", verifyStore.name);
    } catch (e: any) { toast("Erè", String(e?.message ?? e), "error"); }
  }

  async function toggleAppAccess() {
    const next = !appDisabled;
    setAppDisabled(next);
    try {
      const db = await getDb();
      await db.runAsync("INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", ["app_disabled", next ? "1" : "0"]);
      notifyLocal(next ? "App dezaktive" : "App aktive", next ? "Li sèlman pwopriyetè a." : "Tout manm ka ekri.");
      toast(next ? "App dezaktive ✓" : "App aktive ✓");
    } catch {}
  }

  return (
    <div style={{ width: "100%", maxWidth: contentW(isTablet, width), margin: "0 auto" }}>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: palette.ink, marginBottom: 14 }}>Kont mwen</div>

      <Card style={{ padding: 16, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: palette.ink2, border: `1.5px solid ${palette.accentGold}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 17 }}>
            {initials(displayName)}
          </div>
          <span style={{ position: "absolute", right: 0, bottom: 0, width: 15, height: 15, borderRadius: 8, background: role === "cashier" ? "#C7C7CC" : "#34C759", border: "2.5px solid #fff" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</span>
            <RoleBadge role={role} />
          </div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cached?.email ?? "—"}</div>
          <div style={{ fontSize: 12, color: palette.muted2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.phone ? `${user.phone} • ` : ""}Magazen: {displayStore}</div>
        </div>
        <Button label="Modifye" icon="edit" variant="ghost" size="sm" onClick={() => { setPName(displayName); setPPhone(user?.phone ?? ""); setEditProfile(true); }} />
      </Card>

      <Card style={{ marginTop: 12, padding: 4 }}>
        <div style={{ padding: "10px 12px 2px", fontSize: 13, fontWeight: 700, color: palette.muted2, textTransform: "uppercase", letterSpacing: 0.6 }}>Sekirite</div>
        <RowItem icon="key" title="Chanje kòd sekrè" sub="PIN w ap itilize pou verifye ou menm" onClick={() => setPinOpen(true)} right={<Icon name="chevron-right" size={16} color={palette.muted3} />} />
        <RowItem icon="lock" title="Chanje modpas" sub="Modpas koneksyon nan app la" onClick={() => setPwOpen(true)} right={<Icon name="chevron-right" size={16} color={palette.muted3} />} />
        <RowItem icon="log-out" tone="danger" title="Dekonekte" sub="Fèmen sesyon aktyèl la" onClick={() => setConfirmSignout(true)} right={<Icon name="chevron-right" size={16} color={palette.muted3} />} />
      </Card>

      {isOwner && (
        <div style={{ marginTop: 12 }}>
          <Card style={{ padding: 16, background: palette.ink2, boxShadow: undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="briefcase" size={18} color="#fff" />
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 16, letterSpacing: -0.3 }}>Kourro</span>
                </div>
                <div style={{ color: palette.muted3, marginTop: 2, fontSize: 11 }}>{todayStr} • {stores.length}/{MAX_STORES} magazen • Aktif: {active?.name ?? "—"}</div>
              </div>
              <span style={{ background: "rgba(255,255,255,0.12)", padding: "5px 10px", borderRadius: radius.pill, color: "#fff", fontWeight: 800, fontSize: 10, letterSpacing: 0.4, flexShrink: 0 }}>{stores.length}/{MAX_STORES}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              <div style={{ flex: 1, background: palette.successDot, borderRadius: radius.sm, padding: 6, textAlign: "center" }}>
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>Aktif: {active?.name ?? "—"}</span>
              </div>
              <div style={{ flex: 1, background: palette.inkSoft, borderRadius: radius.sm, padding: 6, textAlign: "center" }}>
                <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{active?.location ?? ""}</span>
              </div>
            </div>
            {justSwitched && (
              <div style={{ marginTop: 8, background: palette.successBg, borderRadius: radius.sm, padding: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 12, color: palette.success }}>✓ Ou ap itilize kounye a: {stores.find(s => s.id === justSwitched)?.name}</span>
              </div>
            )}
          </Card>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <Card style={{ flex: 1, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="store" size={13} color={palette.muted2} />
                <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 700 }}>MAGAZEN</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: 18, color: palette.ink, marginTop: 4, letterSpacing: -0.4 }}>{stores.length}<span style={{ fontSize: 13, color: palette.muted3 }}>/{MAX_STORES}</span></div>
              <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2 }}>total kreye</div>
            </Card>
            <Card style={{ flex: 1, padding: 12, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="checkmark-circle" size={13} color={palette.success} />
                <span style={{ fontSize: 10, color: palette.muted2, fontWeight: 700 }}>AKTIF</span>
              </div>
              <div style={{ fontWeight: 900, fontSize: 16, color: palette.success, marginTop: 4, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active?.name ?? "—"}</div>
              <div style={{ fontSize: 10, color: palette.muted2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active?.location ?? ""}</div>
            </Card>
          </div>

          <Card style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 12, borderBottom: `0.5px solid ${palette.separator}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: palette.surface2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Icon name="layers" size={15} color={palette.ink} />
                <span style={{ fontWeight: 900, fontSize: 13, color: palette.ink }}>Magazen yo ({stores.length})</span>
              </div>
              <Button label="Nouvo" icon="plus" size="sm" onClick={() => { if (stores.length >= MAX_STORES) { toast("Limit rive", "Ou gen maksimòm 3 magazen. Pou kreye plis, ou bezwen aksè espesyal.", "warn"); return; } setNewName(""); setNewLocation(""); setError(""); setShowCreate(true); }} />
            </div>
            {stores.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: palette.muted2, fontSize: 12 }}>Pa gen magazen anrejistre.</div>
            ) : stores.map(s => {
              const isActive = s.id === activeStoreId;
              const blocked = !!s.disabled;
              return (
                <div
                  key={s.id}
                  onClick={() => { if (!isActive && !blocked) { setVerifyStore(s); setVerifyCode(""); setCodeError(""); } else if (blocked) { toast("Magazen bloke", "Magazen sa a sispann apre yon bès sekirite. Kontakte Konsole Sipò pou rektifye.", "warn"); } }}
                  style={{ padding: 12, borderBottom: `0.5px solid ${palette.separatorSoft}`, background: isActive ? palette.surface2 : blocked ? palette.dangerBg : palette.surface, opacity: blocked && !isActive ? 0.85 : 1, cursor: isActive || blocked ? "default" : "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: isActive ? palette.successBg : blocked ? palette.dangerBg : palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name="store" size={18} color={isActive ? palette.success : blocked ? palette.danger : palette.muted2} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: palette.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {isActive && <Pill tone="success">AKTIF</Pill>}
                        {blocked && <Pill tone="danger">BLOKE</Pill>}
                        {s.breachFlagged && !blocked && <Pill tone="warn">BÈS</Pill>}
                      </div>
                      <div style={{ fontSize: 11, color: palette.muted2, marginTop: 1 }}>{s.location} • Depi {new Date(s.createdAt).toLocaleDateString()}</div>
                    </div>
                    {isActive ? <Icon name="checkmark-circle" size={20} color={palette.success} /> : blocked ? <Icon name="lock" size={16} color={palette.danger} /> : <Icon name="chevron-right" size={16} color={palette.muted3} />}
                  </div>
                  <div style={{ marginTop: 8, background: palette.surface2, border: `0.5px solid ${palette.separator}`, borderRadius: radius.sm, padding: 8, display: "flex", alignItems: "center" }}>
                    <Icon name="lock" size={13} color={palette.muted2} />
                    <span style={{ fontSize: 11, color: palette.muted2, fontWeight: 700, marginLeft: 6 }}>Kòd sekrè</span>
                    <span style={{ fontSize: 11, color: palette.muted3, marginLeft: 6, fontStyle: "italic" }}>Sere deyò app la • pa vizib</span>
                    <div style={{ marginLeft: "auto", background: palette.surfaceGrouped, padding: "2px 6px", borderRadius: 4 }}>
                      <span style={{ fontSize: 11, color: palette.muted2, fontWeight: 700, letterSpacing: 2 }}>••••</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>

          <Card style={{ marginTop: 12, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: palette.surfaceGrouped, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="lock" size={18} color={appDisabled ? palette.danger : palette.muted2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: palette.ink }}>Aksè app (Pwopriyetè)</div>
              <div style={{ fontSize: 12, color: appDisabled ? palette.danger : palette.muted2, marginTop: 2 }}>{appDisabled ? "Li sèlman pwopriyetè a" : "Tout manm ka ekri"}</div>
            </div>
            <Button label={appDisabled ? "Aktive" : "Dezaktive"} variant={appDisabled ? "danger" : "primary"} onClick={toggleAppAccess} />
          </Card>

          <Card style={{ marginTop: 12, padding: 12, background: palette.surface2, borderColor: palette.separator }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="info" size={15} color={palette.muted2} />
              <span style={{ fontWeight: 800, fontSize: 12, color: palette.muted2 }}>Eskalad magazen</span>
            </div>
            <div style={{ fontSize: 11, color: palette.muted3, marginTop: 4, lineHeight: 1.5 }}>Tap yon lòt magazen epi antre kòd sekrè li pou chanje magazen aktif. Limit 3 san aksè espesyal.</div>
          </Card>
        </div>
      )}

      {editProfile && (
        <Overlay onClose={() => setEditProfile(false)} width={460}>
          <ModalHeader title="Modifye pwofil" onClose={() => setEditProfile(false)} sub="Enfòmasyon pèsonèl ou" />
          <Field label="Non konplè" required><TextInput value={pName} onChange={setPName} placeholder="Non konplè" /></Field>
          <Field label="Telefon"><TextInput value={pPhone} onChange={setPPhone} placeholder="+509 …" /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setEditProfile(false)} />
            <Button label="Anrejistre" style={{ flex: 1 }} onClick={saveProfile} />
          </div>
        </Overlay>
      )}

      {pinOpen && (
        <Overlay onClose={() => setPinOpen(false)} width={460}>
          <ModalHeader title="Chanje kòd sekrè" onClose={() => setPinOpen(false)} sub="PIN w ap itilize pou verifye aksè w" />
          <Field label="Kòd aktyèl" required><TextInput value={pinCurrent} onChange={setPinCurrent} placeholder="Kòd kounye a" type="password" /></Field>
          <Field label="Nouvo kòd" required><TextInput value={pinNew} onChange={setPinNew} placeholder="Nouvo kòd" type="password" /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setPinOpen(false)} />
            <Button label="Anrejistre" icon="key" style={{ flex: 1 }} onClick={savePin} />
          </div>
        </Overlay>
      )}

      {pwOpen && (
        <Overlay onClose={() => setPwOpen(false)} width={460}>
          <ModalHeader title="Chanje modpas" onClose={() => setPwOpen(false)} sub="Modpas koneksyon nan app la" />
          <Field label="Nouvo modpas" required><TextInput value={pwNew} onChange={setPwNew} placeholder="Nouvo modpas" type="password" /></Field>
          <Field label="Konfime modpas" required><TextInput value={pwConfirm} onChange={setPwConfirm} placeholder="Repete modpas la" type="password" /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => setPwOpen(false)} />
            <Button label="Anrejistre" icon="lock" style={{ flex: 1 }} onClick={savePassword} />
          </div>
        </Overlay>
      )}

      {confirmSignout && (
        <Confirm
          title="Dekonekte?"
          message="Ou pral fèmen sesyon aktyèl la. Ou dwe antre kòd sekrè w ankò pou konekte."
          confirmLabel="Dekonekte"
          tone="danger"
          onConfirm={async () => { try { await signOut(); } catch {} nav("/login"); setConfirmSignout(false); }}
          onCancel={() => setConfirmSignout(false)}
        />
      )}

      {showCreate && (
        <Overlay onClose={() => setShowCreate(false)} width={480} align="bottom">
          <ModalHeader title="Nouvo Magazen" onClose={() => setShowCreate(false)} sub={`${stores.length}/${MAX_STORES} kreye • Kòd sekrè 4 karaktè ap généré otomatikman`} />
          <Field label="Non magazen" required><TextInput value={newName} onChange={v => { setNewName(v); if (error) setError(""); }} placeholder="Non magazen" /></Field>
          <Field label="Lokal / site" required><TextInput value={newLocation} onChange={v => { setNewLocation(v); if (error) setError(""); }} placeholder="Lokal / site" /></Field>
          {stores.length >= MAX_STORES && (
            <div style={{ background: palette.warningBg, border: `0.5px solid ${palette.warningBd}`, borderRadius: radius.sm, padding: 8, marginTop: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: palette.warning, fontWeight: 700 }}>Limit 3 magazen rive jwenn — ou bezwen aksè espesyal.</span>
            </div>
          )}
          {error ? <div style={{ fontSize: 12, color: palette.danger, fontWeight: 700, marginTop: 8, marginBottom: 10, textAlign: "center" }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => { setShowCreate(false); setError(""); }} />
            <Button label="Kreye magazen" icon="plus" style={{ flex: 1 }} onClick={createStore} />
          </div>
        </Overlay>
      )}

      {createdCode && (
        <Overlay onClose={() => setCreatedCode(null)} width={480}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: radius.md, background: palette.warningBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <Icon name="warning" size={24} color={palette.warningDot} />
            </div>
            <div style={{ fontWeight: 900, fontSize: 16, marginTop: 12, color: palette.ink, letterSpacing: -0.3 }}>Kòd sekrè — Sere li kounye a</div>
            <div style={{ fontSize: 12, color: palette.muted2, marginTop: 6, lineHeight: 1.5 }}>Sa se sèl fwa ou pral wè kòd sa a nan app la. Ekri li epi sere li deyò app la (kaye, nòt an sekirite).</div>
            <div style={{ marginTop: 14, background: palette.ink2, borderRadius: radius.md, padding: "14px 24px", textAlign: "center" }}>
              <div style={{ color: palette.muted3, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Kòd magazen</div>
              <div style={{ color: "#fff", fontWeight: 900, fontSize: 24, letterSpacing: 4, marginTop: 4, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{createdCode}</div>
            </div>
            <div style={{ fontSize: 11, color: palette.danger, fontWeight: 700, marginTop: 12 }}>Apre ou fèmen, kòd la p ap janm parèt ankò — menm pwopriyetè pa ka wè li.</div>
            <Button label="Mwen sere li deyò app la" icon="checkmark" block style={{ marginTop: 14 }} onClick={() => setCreatedCode(null)} />
          </div>
        </Overlay>
      )}

      {verifyStore && (
        <Overlay onClose={() => { setVerifyStore(null); setVerifyCode(""); setCodeError(""); }} width={440}>
          <ModalHeader title="Chanje magazen" onClose={() => { setVerifyStore(null); setVerifyCode(""); setCodeError(""); }} />
          <div style={{ fontSize: 12.5, color: palette.muted, lineHeight: 1.5 }}>
            Ou pral chanje nan <b style={{ color: palette.ink }}>{verifyStore.name}</b>. Antre kòd sekrè magazen sa a.
          </div>
          <div style={{ marginTop: 12 }}>
            <TextInput value={verifyCode} onChange={v => { setVerifyCode(v); setCodeError(""); }} placeholder="Kòd sekrè" autoFocus />
          </div>
          {codeError ? <div style={{ fontSize: 12, color: palette.danger, fontWeight: 700, marginTop: 8 }}>{codeError}</div> : null}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button label="Anile" variant="ghost" style={{ flex: 1 }} onClick={() => { setVerifyStore(null); setVerifyCode(""); setCodeError(""); }} />
            <Button label="Chanje" icon="arrow-right" style={{ flex: 1 }} onClick={confirmSwitch} />
          </div>
        </Overlay>
      )}

      {!ready && <div style={{ textAlign: "center", padding: 30, color: palette.muted2, fontSize: 13 }}>Ap chaje…</div>}
    </div>
  );
}