/**
 * French/Haitian number style: narrow no-break space thousands,
 * comma decimals — "1 234 567" instead of "1,234,567".
 * Implemented manually (no Intl dependency) so output is identical
 * on every platform.
 */
const GROUP_SEP = "\u202F";
const DECIMAL_SEP = ",";

export function fmt(n: number | string | null | undefined, decimals = 0): string {
  const num = Number(n);
  const safe = Number.isFinite(num) ? num : 0;
  const fixed = safe.toFixed(Math.max(0, decimals));
  const neg = fixed.startsWith("-");
  const unsigned = neg ? fixed.slice(1) : fixed;
  const [intPart, decPart] = unsigned.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEP);
  const head = neg ? `-${grouped}` : grouped;
  if (decimals > 0) return `${head}${DECIMAL_SEP}${(decPart ?? "").padEnd(decimals, "0")}`;
  return head;
}

/** Whole-number HTG amount: "12 500 HTG". */
export function fmtHTG(n: number | string | null | undefined, decimals = 0): string {
  return `${fmt(n, decimals)} HTG`;
}

/** Monospace stack for price columns so digits/decimals line up. */
export const monoStyle: React.CSSProperties = {
  fontFamily: "Menlo, monospace",
  fontVariant: "tabular-nums",
};

export function shortTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}