// Store secret-code utilities — uniqueness + security (port of mobile).
export type StoreItem = { id: string; name: string; location: string; code: string; createdAt: string; disabled?: boolean; breachFlagged?: boolean; breachedAt?: string; revokedBy?: string };

function genRawCode(): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

function usedCodes(stores: StoreItem[]): Set<string> {
  const set = new Set<string>();
  for (const s of (stores ?? [])) set.add(s.code.toUpperCase());
  return set;
}

export function generateUniqueCode(stores: StoreItem[]): string {
  const used = usedCodes(stores);
  let code = genRawCode();
  let guard = 0;
  while (used.has(code) && guard < 1000) {
    code = genRawCode();
    guard++;
  }
  return code;
}

export const SOFTWARE_OWNER_KEY = "SYS-OWNER-2026";

export function isSoftwareOwner(key: string): boolean {
  return String(key).trim().toUpperCase() === SOFTWARE_OWNER_KEY;
}