// Simple in-memory pub/sub for realtime sales updates
type Listener = () => void;
const listeners = new Set<Listener>();

export const salesEvents = {
  emit() {
    for (const l of Array.from(listeners)) {
      try { l(); } catch {}
    }
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};