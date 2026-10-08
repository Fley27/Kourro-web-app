// Connectivity for receipt-by-email gating. Web: navigator.onLine + events
// (no new deps). Defaults to online.
import { useEffect, useState } from "react";

function current(): boolean {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") return navigator.onLine;
  } catch {}
  return true;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(current());
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? "").trim());
}
