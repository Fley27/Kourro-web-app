// Jesyon Magazen — Sales Site Brand Theme
// Warm bone paper + deep ink + ember accent + gold nuance
// Mirrors sales-site/src/site.css

export const palette = {
  // ── Backgrounds (warm paper) ────────────────────────────────────
  bg: "#f6f1e4",
  bgWarm: "#efe7d2",

  // ── Surfaces (pressed paper, elevated) ──────────────────────────
  surface: "#ffffff",
  surface2: "#efe7d2",
  surfaceGrouped: "#e9dfc6",

  // ── Borders ─────────────────────────────────────────────────────
  hairline: "rgba(22,19,12,0.14)",
  hairlineStrong: "rgba(22,19,12,0.3)",
  separator: "#e2d8bd",
  separatorSoft: "#efe7d2",

  // ── Text (warm black on paper) ──────────────────────────────────
  ink: "#16130c",
  ink2: "#16130c", // ink surface — hero / sidebar / avatars
  inkSoft: "#4d473a",
  muted: "#837b69",
  muted2: "#6b6454",
  muted3: "#837b69",

  // ── Accent — signature ember ────────────────────────────────────
  accent: "#ff4d00",
  emberInk: "#fff6ee", // text on ember
  accentGold: "#c8a24a",
  accentGoldSoft: "rgba(200,162,74,0.16)",

  // ── Status (jewel tones — readable on paper) ────────────────────
  success: "#2f7d5b",
  successBg: "rgba(47,125,91,0.12)",
  successBd: "rgba(47,125,91,0.3)",
  successDot: "#2f7d5b",
  warning: "#a86e10",
  warningBg: "rgba(255,159,10,0.16)",
  warningBd: "rgba(200,162,74,0.4)",
  warningDot: "#c8a24a",
  danger: "#c0392b",
  dangerBg: "rgba(192,57,43,0.12)",
  dangerBd: "rgba(192,57,43,0.3)",
  dangerDot: "#c0392b",

  // ── Secondary accents ───────────────────────────────────────────
  blue: "#0a6bb5",
  blueBg: "rgba(10,107,181,0.12)",
  blueBd: "rgba(10,107,181,0.3)",
  violet: "#7c3aed",
  violetBg: "rgba(124,58,237,0.12)",
  violetBd: "rgba(124,58,237,0.3)",
  emerald: "#2f7d5b",
  emeraldSoft: "rgba(47,125,91,0.12)",
} as const;

export const radius = { xs: 10, sm: 12, md: 16, lg: 20, xl: 24, pill: 999 } as const;

/** Card shadows — warm ink shadows on paper. */
export const shadow = {
  soft: "0 4px 16px rgba(22,19,12,0.1)",
  card: "0 6px 20px rgba(22,19,12,0.14)",
  elevated: "0 12px 32px rgba(22,19,12,0.2)",
} as const;

export const theme = { palette, radius, shadow };
export default theme;
