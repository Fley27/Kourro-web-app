import React from "react";

// Compact stroke-based icon set (24×24, currentColor) mirroring the Ionicons
// names used throughout the app. Falls back to a unicode dot for unknown names.
type IconName =
  | "cash" | "banknote" | "cart" | "box" | "package" | "people" | "user" | "store"
  | "bell" | "shield" | "key" | "log-out" | "search" | "plus" | "minus" | "close"
  | "checkmark" | "checkmark-circle" | "alert" | "warning" | "trending-up" | "trending-down"
  | "receipt" | "list" | "refresh" | "trash" | "home" | "grid" | "arrow-right" | "arrow-left"
  | "dollar" | "percent" | "download" | "print" | "eye" | "eye-off" | "edit" | "lock"
  | "wifi" | "clock" | "calendar" | "phone" | "pin" | "settings" | "chevron-down"
  | "chevron-right" | "filter" | "briefcase" | "card" | "tag" | "layers" | "upload"
  | "save" | "menu" | "external" | "info" | "cube" | "pricetag" | "sync" | "user-add"
  | "shield-checkmark" | "file-text" | "image" | "star" | "qrcode" | "gift" | "chat" | "warning-circle";

const PATHS: Record<string, string> = {
  cash: '<path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Z"/><path d="M2 10h20"/><path d="M15 15h5"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 3h2l2.6 12.4a1.8 1.8 0 0 0 1.8 1.5h8a1.8 1.8 0 0 0 1.8-1.5L21 8H6"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  package: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  people: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.4 2.8-5.5 6.2-5.5s6.2 2.1 6.2 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16 14.7c2.6.3 5.2 2.2 5.2 5.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  store: '<path d="M4 4h16l1 4H3l1-4Z"/><path d="M4 10v9h16v-9"/><path d="M9 19v-5h6v5"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z"/>',
  key: '<circle cx="8" cy="15" r="4.4"/><path d="M11.2 11.8L20 3l1 1-4 4 1 1 3-3 1 1-6 6-1.6-1.6"/>',
  "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  checkmark: '<path d="M20 6L9 17l-5-5"/>',
  "checkmark-circle": '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  alert: '<path d="M12 3l10 18H2L12 3Z"/><path d="M12 10v5M12 18h.01"/>',
  warning: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
  "trending-up": '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
  "trending-down": '<path d="M3 7l6 6 4-4 7 7"/><path d="M14 16h6v-6"/>',
  receipt: '<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z"/><path d="M9 8h6M9 12h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  "arrow-right": '<path d="M4 12h16M13 5l7 7-7 7"/>',
  "arrow-left": '<path d="M20 12H4M11 5l-7 7 7 7"/>',
  dollar: '<path d="M12 3v18"/><path d="M16 6.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 2 2 4 2.5 4 1.2 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  print: '<path d="M7 8V3h10v5"/><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="13" width="10" height="8" rx="1.5"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off": '<path d="M4 4l16 16"/><path d="M9.9 5.2C10.6 5.1 11.3 5 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.8 4"/><path d="M6.6 6.6C3.8 8.6 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.4 3.8-.9"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="M14 6l4 4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  wifi: '<path d="M2.5 8.5a14 14 0 0 1 19 0"/><path d="M5.5 12a9.5 9.5 0 0 1 13 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  phone: '<rect x="7" y="3.5" width="10" height="17" rx="2.5"/><path d="M11 18h2"/>',
  pin: '<path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  "chevron-down": '<path d="M6 9l6 6 6-6"/>',
  "chevron-right": '<path d="M9 6l6 6-6 6"/>',
  filter: '<path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  card: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 10h19M7 15h4"/>',
  tag: '<path d="M20 13.5L12 21l-9-9V3h9l9 9-1 1.5Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5Z"/><path d="M3 13l9 5 9-5"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 21h16"/>',
  save: '<path d="M5 3h11l5 5v13H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/>',
  cube: '<path d="M12 3v9"/><path d="M12 12l8-4.5M12 12l-8-4.5"/><path d="M4 7.5v9L12 21l8-4.5v-9"/>',
  pricetag: '<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  sync: '<path d="M20 5v6h-6"/><path d="M4 19v-6h6"/><path d="M20 11a8 8 0 0 0-14-3M4 13a8 8 0 0 0 14 3"/>',
  "user-add": '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.4 2.8-5.5 6.2-5.5s6.2 2.1 6.2 5.5"/><path d="M18 8v6M15 11h6"/>',
  "shield-checkmark": '<path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/>',
  "file-text": '<path d="M6 3h9l5 5v13H6V3Z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M3.5 17l5.5-5 3.5 3.5 2.5-2 5.5 5"/>',
  star: '<path d="M12 3l2.7 5.6 6.3.8-4.6 4.3 1.1 6.2L12 17l-5.5 2.9 1.1-6.2L3 9.4l6.3-.8L12 3Z"/>',
  qrcode: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M13.5 13.5h3v3h-3zM17 17h3.5M17 13.5V21"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4"/><path d="M5 12v9h14v-9M12 8v13"/>',
  chat: '<path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.5 0-3-.4-4.2-1L3 21l1.5-5.3a8.5 8.5 0 1 1 16.5-3.7Z"/>',
  "warning-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/>',
};

export function Icon({ name, size = 20, color = "currentColor", title, style }: { name: IconName | string; size?: number; color?: string; title?: string; style?: React.CSSProperties }) {
  const d = PATHS[name] ?? "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      style={{ flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

export default Icon;