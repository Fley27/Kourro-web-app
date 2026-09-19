import React, { useMemo, useState } from "react";
import { palette } from "../lib/theme";
import type { User } from "../lib/users";
import type { Employee } from "../lib/team";
import { Button, Card, Field, Overlay, SearchBar, TextInput, toast } from "./ui";
import { Icon } from "./Icon";

const GOLD = palette.accentGold;
const ROLE_META: Record<string, { label: string; color: string; bg: string; bd: string }> = {
  owner: { label: "OWNER", color: "#7A5C10", bg: palette.accentGoldSoft, bd: "#E3D6B8" },
  admin: { label: "ADMIN", color: "#1E40AF", bg: "#EFF6FF", bd: "#BFDBFE" },
  manager: { label: "MANAGER", color: "#92400E", bg: "#FFFBEB", bd: "#FDE68A" },
  cashier: { label: "KESYE", color: "#6D28D9", bg: "#F5F3FF", bd: "#DDD6FE" },
};
const ROLE_COLOR: Record<string, string> = { owner: "#16130c", admin: "#5856D6", manager: "#FF9F0A", cashier: "#837b69" };
const LEVEL: Record<string, number> = { owner: 4, admin: 3, manager: 2, cashier: 1 };

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? ROLE_META.cashier;
  return (
    <span style={{ background: m.bg, borderRadius: 4, padding: "2px 6px", fontSize: 11, fontWeight: 700, color: m.color, letterSpacing: 0.3 }}>
      {m.label}
    </span>
  );
}

function IOSSwitch({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 48, height: 29, borderRadius: 15, border: "none", cursor: "pointer",
        background: value ? "#34C759" : "#E5E5EA", position: "relative", transition: "background .18s ease",
      }}
    >
      <span style={{
        position: "absolute", top: 1.5, left: value ? 21 : 1.5, width: 26, height: 26, borderRadius: 13, background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)", transition: "left .18s ease",
      }} />
    </button>
  );
}

export function TeamPanel({ employees, setEmployees, currentUser, role, activeStore }: {
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  currentUser: User;
  role: User["role"];
  activeStore: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [modalView, setModalView] = useState<"detail" | "edit" | "selfEdit" | "reset">("detail");
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [selfEdit, setSelfEdit] = useState<Employee | null>(null);
  const [selfSecret, setSelfSecret] = useState("");
  const [selfPassword, setSelfPassword] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [editRole, setEditRole] = useState("cashier");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "cashier", phone: "", address: "", emergName: "", emergPhone: "", emergAddress: "" });
  const [error, setError] = useState("");

  const canManage = role === "admin" || role === "owner";
  const canAddRole = (target: string) => {
    if (target === "owner") return false;
    if (LEVEL[role] <= LEVEL[target]) return false;
    return role === "owner" || role === "admin";
  };
  const canEditRoleFor = (target: Employee, newRole: string) => {
    if (target.role === "owner" || newRole === "owner") return false;
    if (target.id === currentUser.id) return false;
    if (LEVEL[role] <= LEVEL[target.role]) return false;
    if (LEVEL[role] <= LEVEL[newRole]) return false;
    return true;
  };
  const canAffect = (target: Employee) => LEVEL[role] > LEVEL[target.role];
  const canToggle = (target: Employee) => target.role !== "owner" && target.id !== currentUser.id && canAffect(target);
  const canResetOther = (target: Employee) => target.id !== currentUser.id && target.role !== "owner" && canAffect(target);
  const canChangeSelf = (target: Employee) => target.id === currentUser.id;

  const currentStore = activeStore || currentUser.store || "Petyonvil";
  const visible = useMemo(() => {
    const inScope = employees.filter(e => e.store === currentStore || e.role === "owner");
    if (role === "cashier") return inScope;
    return inScope.filter(e => (LEVEL[e.role] ?? 1) <= LEVEL[role]);
  }, [employees, role, currentStore]);

  const activeCount = visible.filter(e => e.active).length;
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = visible;
    if (filter === "active") r = r.filter(e => e.active);
    if (filter === "inactive") r = r.filter(e => !e.active);
    if (q) r = r.filter(e => e.name.toLowerCase().includes(q) || e.role.includes(q) || String(e.phone ?? "").includes(q));
    return r;
  }, [visible, search, filter]);

  const canSeeSalary = (e: Employee) => !(role === "admin" && e.role === "admin" && e.id !== currentUser.id);

  const toggleActive = (e: Employee) => {
    if (e.role === "owner") { toast("Pa ka dezaktive Owner", "", "warn"); return; }
    setEmployees(prev => prev.map(x => x.id === e.id ? { ...x, active: !x.active } : x));
  };

  const addMember = () => {
    setError("");
    if (!form.name.trim()) return setError("Non obligatwa.");
    if (!form.phone.trim()) return setError("Telefon obligatwa.");
    if (!form.address.trim()) return setError("Adrès obligatwa.");
    if (!form.emergName.trim() || !form.emergPhone.trim() || !form.emergAddress.trim()) return setError("Kontak ijans konplè obligatwa: non, telefon, adrès.");
    if (!canAddRole(form.role)) return setError("Ou pa gen dwa kreye wòl sa a.");
    const id = `emp-${Date.now()}`;
    setEmployees(prev => [...prev, {
      id, name: form.name.trim(), role: form.role, phone: form.phone.trim(), address: form.address.trim(),
      store: currentStore, emergency: { name: form.emergName.trim(), phone: form.emergPhone.trim(), address: form.emergAddress.trim() },
      secret: String(prev.length + 1), password: `pass-${Math.random().toString(36).slice(2, 8)}`,
      lastAction: "Nouvo manm", kpi: "—", salary: form.role === "admin" ? "32,000 HTG" : form.role === "manager" ? "25,000 HTG" : "12,000 HTG",
      isOnline: false, active: true,
    }]);
    setShowAdd(false);
    setForm({ name: "", role: "cashier", phone: "", address: "", emergName: "", emergPhone: "", emergAddress: "" });
    toast("Ajoute anplwaye ✓");
  };

  return (
    <div style={{ width: "100%" }}>
      <Card style={{ padding: 12 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Chèche non, wòl, telefon…" />
        <div style={{ display: "flex", gap: 4, marginTop: 12, background: "#F2F2F7", borderRadius: 11, padding: 3, border: "0.5px solid #E5E5EA" }}>
          {([["all", "Tout"], ["active", "Aktif"], ["inactive", "Inaktif"]] as const).map(([id, label]) => {
            const active = filter === id;
            const count = id === "all" ? visible.length : id === "active" ? activeCount : visible.length - activeCount;
            return (
              <button key={id} onClick={() => setFilter(id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", borderRadius: 8, border: "none", background: active ? "#fff" : "transparent", fontWeight: active ? 700 : 600, fontSize: 12, color: active ? "#16130c" : "#837b69", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none", cursor: "pointer" }}>
                {label} <span style={{ fontSize: 11, color: active ? "#16130c" : "#a1967f" }}>{count}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {list.length === 0 ? (
        <Card style={{ padding: 32, textAlign: "center", color: palette.muted2, marginTop: 12 }}>
          {search || filter !== "all" ? "Pa gen rezilta" : "Pa gen anplwaye"}
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
          {list.map(e => {
            const m = ROLE_META[e.role] ?? ROLE_META.cashier;
            const isSelf = e.id === currentUser.id;
            return (
              <Card key={e.id} onClick={() => { setSelected(e); setModalView("detail"); }} style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, opacity: e.active ? 1 : 0.55 }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 50, height: 50, borderRadius: 25, background: ROLE_COLOR[e.role] ?? "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${e.role === "owner" ? GOLD : e.active ? "rgba(200,162,74,0.45)" : "rgba(0,0,0,0.08)"}`, color: e.role === "cashier" ? "#16130c" : "#fff", fontWeight: 700, fontSize: 15 }}>
                    {e.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <span style={{ position: "absolute", right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, background: e.isOnline ? "#34C759" : "#C7C7CC", border: "2.5px solid #fff" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#16130c", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                    {isSelf ? <span style={{ fontSize: 10, color: "#837b69", background: "#F2F2F7", padding: "2px 6px", borderRadius: 4 }}>OU</span> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <RoleBadge role={e.role} />
                    <span style={{ fontSize: 12, color: "#837b69" }}>{e.phone ?? "—"}</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: palette.muted2, marginTop: 2 }}>{canSeeSalary(e) ? `${e.salary} / mwa` : "Konfidansyèl"}</div>
                </div>
                {canToggle(e) ? <IOSSwitch value={e.active} onToggle={() => toggleActive(e)} /> : null}
              </Card>
            );
          })}
        </div>
      )}

      {canManage && (
        <Button label="Nouvo Manb" icon="user-add" onClick={() => setShowAdd(true)} style={{ position: "fixed", right: 28, bottom: 24, boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }} />
      )}

      {showAdd && (
        <Overlay onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: "#16130c", display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${GOLD}` }}>
              <Icon name="user-add" size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#16130c" }}>Nouvo Manb</div>
              <div style={{ fontSize: 12, color: "#837b69" }}>{role === "owner" ? "Admin · Manager · Cashier" : "Manager · Cashier"}</div>
            </div>
          </div>
          <Field label="Non konplè" required><TextInput value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Non konplè" /></Field>
          <Field label="Telefon" required><TextInput value={form.phone} onChange={v => setForm({ ...form, phone: v })} placeholder="+509 …" /></Field>
          <Field label="Adrès" required><TextInput value={form.address} onChange={v => setForm({ ...form, address: v })} placeholder="Adrès" /></Field>
          <Field label="Wòl" required>
            <div style={{ display: "flex", gap: 6, background: "#E9E9EB", borderRadius: 12, padding: 4 }}>
              {(["cashier", "manager", "admin"].filter(canAddRole) as string[]).map(r => (
                <button key={r} onClick={() => setForm({ ...form, role: r })} style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: form.role === r ? "#fff" : "transparent", fontWeight: 700, fontSize: 12, color: form.role === r ? "#16130c" : "#837b69", cursor: "pointer", boxShadow: form.role === r ? "0 1px 4px rgba(0,0,0,0.1)" : "none" }}>
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#9C7A1E", letterSpacing: 0.8, textTransform: "uppercase", margin: "4px 0 8px" }}>Kontak ijans</div>
          <Field label="Non ijans" required><TextInput value={form.emergName} onChange={v => setForm({ ...form, emergName: v })} /></Field>
          <Field label="Telefon ijans" required><TextInput value={form.emergPhone} onChange={v => setForm({ ...form, emergPhone: v })} /></Field>
          <Field label="Adrès ijans" required><TextInput value={form.emergAddress} onChange={v => setForm({ ...form, emergAddress: v })} /></Field>
          {error ? <div style={{ background: "#FFF1F2", border: "0.5px solid #FECDD3", borderRadius: 12, padding: 12, fontSize: 13, color: "#B00020", textAlign: "center", fontWeight: 600, marginBottom: 10 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 10 }}>
            <Button label="Ajoute anplwaye" icon="plus" block onClick={addMember} />
          </div>
          <Button label="Fèmen" variant="ghost" block onClick={() => setShowAdd(false)} style={{ marginTop: 8 }} />
        </Overlay>
      )}

      {selected && (
        <Overlay onClose={() => setSelected(null)} width={560}>
          {modalView === "detail" && (
            <>
              <div style={{ textAlign: "center", padding: "4px 0 14px" }}>
                <div style={{ position: "relative", display: "inline-block" }}>
                  <div style={{ width: 64, height: 64, borderRadius: 32, background: ROLE_COLOR[selected.role] ?? "#F2F2F7", display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${selected.role === "owner" ? GOLD : "rgba(200,162,74,0.45)"}`, color: selected.role === "cashier" ? "#16130c" : "#fff", fontWeight: 700, fontSize: 20 }}>
                    {selected.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <span style={{ position: "absolute", right: 0, bottom: 0, width: 15, height: 15, borderRadius: 8, background: selected.isOnline ? "#34C759" : "#C7C7CC", border: "3px solid #fff" }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: "#16130c", marginTop: 8 }}>{selected.name}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, justifyContent: "center" }}>
                  <RoleBadge role={selected.role} />
                  <span style={{ fontSize: 11, fontWeight: 500, color: selected.isOnline ? "#34C759" : "#837b69", background: selected.isOnline ? "#EAF6ED" : "#F2F2F7", padding: "3px 6px", borderRadius: 4 }}>
                    {selected.isOnline ? "En ligne" : "Hors ligne"}
                  </span>
                </div>
              </div>

              <div style={{ background: palette.surface2, borderRadius: 12, padding: 4 }}>
                <InfoRow label="Telefon" value={selected.phone ?? "—"} />
                <InfoRow label="Adrès" value={selected.address ?? "—"} />
                <InfoRow label="Magazen" value={selected.store ?? "—"} />
                <InfoRow label="Salè" value={canSeeSalary(selected) ? `${selected.salary} / mwa` : "Konfidansyèl"} />
                <InfoRow label="Kòd" value="••••" last />
              </div>

              {selected.emergency ? (
                <div style={{ marginTop: 14, fontSize: 11, fontWeight: 800, color: "#9C7A1E", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Kontak ijans</div>
              ) : null}
              {selected.emergency ? (
                <div style={{ background: palette.surface2, borderRadius: 12, padding: 4 }}>
                  <InfoRow label="Non" value={selected.emergency.name} />
                  <InfoRow label="Telefon" value={selected.emergency.phone} />
                  <InfoRow label="Adrès" value={selected.emergency.address} last />
                </div>
              ) : null}

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {canToggle(selected) && (
                  <ActionBtn icon={selected.active ? "pause" : "play"} label={selected.active ? "Dezaktive" : "Aktive"} onClick={() => toggleActive(selected)} />
                )}
                {canAffect(selected) && selected.role !== "owner" && selected.id !== currentUser.id && (
                  <ActionBtn icon="shield" label="Modifye wòl" onClick={() => { setEditing(selected); setEditRole(selected.role); setModalView("edit"); }} />
                )}
                {canChangeSelf(selected) && (
                  <ActionBtn icon="key" label="Chanje kòd / modpas" onClick={() => { setSelfEdit(selected); setSelfSecret(""); setSelfPassword(""); setModalView("selfEdit"); }} />
                )}
                {canResetOther(selected) && (
                  <ActionBtn icon="refresh" label="Reyinisyialize kòd / modpas" onClick={() => { setResetTarget(selected); setModalView("reset"); }} />
                )}
              </div>
              <Button label="Fèmen" onClick={() => setSelected(null)} style={{ marginTop: 14, width: "100%" }} />
            </>
          )}

          {modalView === "edit" && editing && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#16130c" }}>Modifye wòl</div>
                <div style={{ fontSize: 13, color: "#837b69", marginTop: 2 }}>{editing.role.toUpperCase()} → {editRole.toUpperCase()}</div>
              </div>
              {editing.role === "owner" ? <Notice tone="danger">Pa ka modifye aksè Owner.</Notice> : null}
              {editing.id === currentUser.id && role === "admin" ? <Notice tone="warn">Admin pa ka bese tèt li.</Notice> : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
                {(["admin", "manager", "cashier"] as const).filter(r => canEditRoleFor(editing, r)).map(r => (
                  <button key={r} onClick={() => setEditRole(r)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, border: "0.5px solid #E5E5EA", background: editRole === r ? palette.surfaceGrouped : palette.surface, fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#16130c" }}>
                    <span style={{ flex: 1 }}>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                    {editRole === r ? <Icon name="checkmark-circle" size={20} color="#16130c" /> : null}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <Button label="Anile" variant="soft" onClick={() => setModalView("detail")} style={{ flex: 1 }} />
                <Button label="Anrejistre" onClick={() => {
                  if (!canEditRoleFor(editing, editRole)) { toast("Refize", "Pa ka pwomouvwa nan Owner, pa ka manyen Owner, Admin pa ka bese tèt li.", "error"); return; }
                  setEmployees(prev => prev.map(x => x.id === editing.id ? { ...x, role: editRole as any } : x));
                  setSelected(null); setModalView("detail");
                  toast("Wòl ajou ✓");
                }} style={{ flex: 1 }} />
              </div>
            </>
          )}

          {modalView === "selfEdit" && selfEdit && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#16130c" }}>Chanje pa mwen</div>
                <div style={{ fontSize: 13, color: "#837b69", marginTop: 2 }}>Se sèlman ou ki ka chanje kòd / modpas ou.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <Field label="Nouvo kòd — kite vid"><TextInput value={selfSecret} onChange={setSelfSecret} placeholder="Nouvo kòd — kite vid" /></Field>
                <Field label="Nouvo modpas — kite vid"><TextInput value={selfPassword} onChange={setSelfPassword} placeholder="Nouvo modpas — kite vid" /></Field>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <Button label="Anile" variant="soft" onClick={() => setModalView("detail")} style={{ flex: 1 }} />
                <Button label="Anrejistre pa mwen" onClick={() => {
                  if (!selfSecret.trim() && !selfPassword.trim()) { toast("Antre kòd oswa modpas", "", "warn"); return; }
                  setEmployees(prev => prev.map(x => x.id === selfEdit.id ? { ...x, secret: selfSecret.trim() || x.secret, password: selfPassword.trim() || x.password } : x));
                  setSelfEdit(null); setSelfSecret(""); setSelfPassword(""); setSelected(null); setModalView("detail");
                  toast("Ajou ✓");
                }} style={{ flex: 1 }} />
              </div>
            </>
          )}

          {modalView === "reset" && resetTarget && (
            <>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#16130c" }}>Reyinisyialize</div>
                <div style={{ fontSize: 13, color: "#837b69", marginTop: 2 }}>Ou pa wè ansyen kòd/modpas. Reyinisyializasyon fòse itilizatè a mete nouvo pa li menm.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 14, gap: 6 }}>
                <button onClick={() => { const secret = String(1000 + Math.floor(Math.random() * 9000)).slice(-4); setEmployees(prev => prev.map(x => x.id === resetTarget.id ? { ...x, secret } : x)); setSelected(null); setModalView("detail"); toast(`Kòd reyinisyialize → ${secret}`, "", "success"); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, border: "0.5px solid #FFB1AE", background: "#FFF1F2", color: "#FF3B30", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  <Icon name="key" size={18} /> Reyinisyialize kòd
                </button>
                <button onClick={() => { setEmployees(prev => prev.map(x => x.id === resetTarget.id ? { ...x, password: `tmp-${Math.random().toString(36).slice(2, 8)}` } : x)); setSelected(null); setModalView("detail"); toast("Modpas reyinisyialize ✓", "", "success"); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 10, border: "0.5px solid #FFB1AE", background: "#FFF1F2", color: "#FF3B30", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  <Icon name="lock" size={18} /> Reyinisyialize modpas
                </button>
              </div>
              <Button label="Anile" variant="soft" block onClick={() => setModalView("detail")} style={{ marginTop: 14 }} />
            </>
          )}
        </Overlay>
      )}
    </div>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: last ? "none" : "0.5px solid #E5E5EA" }}>
      <span style={{ fontSize: 14, color: "#3C3C43" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#16130c" }}>{value}</span>
    </div>
  );
}

function ActionBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "none", background: "#FFF1F2", color: "#FF3B30", fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "danger" | "warn" }) {
  const c = tone === "danger" ? { bg: "#FFF1F2", bd: "#FECDD3", fg: "#FF3B30" } : { bg: "#FFFBEB", bd: "#FDE68A", fg: "#92400E" };
  return <div style={{ display: "flex", alignItems: "center", gap: 10, background: c.bg, border: `0.5px solid ${c.bd}`, borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 500, color: c.fg, marginTop: 12 }}>{children}</div>;
}