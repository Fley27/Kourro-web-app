export type Role = "owner" | "admin" | "manager" | "cashier";
export type Gender = "male" | "female" | "other";
export type User = {
  id: string;
  name: string;
  role: Role;
  secret: string;
  phone?: string;
  gender?: Gender;
  store?: string;
  store_id?: string;
};

export const USERS: User[] = [
  { id: "owner-1", name: "Jacques Owner", role: "owner", secret: "1", phone: "+509 1000 0001", gender: "male", store: "Petyonvil" },
  { id: "admin-1", name: "Marie Admin", role: "admin", secret: "2", phone: "+509 1000 0002", gender: "female", store: "Petyonvil" },
  { id: "manager-1", name: "Pierre Manager", role: "manager", secret: "3", phone: "+509 1000 0003", gender: "male", store: "Dèlma" },
  { id: "cashier-1", name: "Sophie Cashier", role: "cashier", secret: "4", phone: "+509 1000 0004", gender: "female", store: "Petyonvil" },
];

export const getUserById = (id: string) => USERS.find(u => u.id === id);
export const getUserBySecret = (secret: string) => USERS.find(u => u.secret === secret);

/** Owner-only master key unlocking security center / danger zones. */
export const SOFTWARE_OWNER_KEY = "SOK12345";

const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, manager: 2, cashier: 1 };

export const rankOf = (role: Role) => ROLE_RANK[role] ?? 0;

/** can(u, target) — true when u may act on a user of role `target`. */
export function can(u: User | undefined | null, target: Role): boolean {
  if (!u) return false;
  return ROLE_RANK[u.role] >= ROLE_RANK[target];
}

export const isOwner = (u?: User | null) => u?.role === "owner";
export const isAdminish = (u?: User | null) => !!u && ROLE_RANK[u.role] >= ROLE_RANK.admin;