// In-app + browser notifications (web). `notifyLocal` mirrors the mobile call
// signature; it falls back to an in-app toast channel so no native module is
// required.

type ToastListener = (t: { id: number; title: string; body: string; tone: "info" | "success" | "warn" | "error" }) => void;
const toastLs = new Set<ToastListener>();
let toastId = 0;

export const toasts = {
  subscribe(fn: ToastListener) {
    toastLs.add(fn);
    return () => { toastLs.delete(fn); };
  },
  push(title: string, body: string, tone: "info" | "success" | "warn" | "error" = "info") {
    const t = { id: ++toastId, title, body, tone };
    toastLs.forEach(l => { try { l(t); } catch {} });
  },
};

let permAsked = false;
export async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission !== "denied" && !permAsked) {
      permAsked = true;
      const p = await Notification.requestPermission();
      if (p === "granted") new Notification(title, { body });
    }
  } catch {
    // best-effort; never break the underlying action
  }
  toasts.push(title, body, "success");
}

/** Mark a user's notifications read (web helper used by pages). */
export async function markAllNotifsRead(db: any, userId: string) {
  try {
    const notifs = (await db.getAllAsync("SELECT * FROM notifications WHERE user_id = ?", [userId])) as any[];
    for (const n of notifs) {
      if (n.status === "pending") {
        await db.runAsync("UPDATE notifications SET status = ? WHERE id = ?", ["read", n.id]);
      }
    }
  } catch {}
}