/**
 * Same bridge as mobile — root owns the open-tab count so the sidebar /
 * home badge reflects it no matter which page is on screen. `requestOpen`
 * routes to the POS page and drains into POSPage's tabs sheet.
 */
type CountListener = (n: number) => void;
type OpenListener = () => void;

let count = 0;
let pendingOpen = false;
const countLs = new Set<CountListener>();
const openLs = new Set<OpenListener>();

export const tabsUI = {
  setCount(n: number) {
    const v = Math.max(0, n | 0);
    if (v === count) return;
    count = v;
    countLs.forEach(l => { try { l(v); } catch {} });
  },
  subscribeCount(l: CountListener) {
    countLs.add(l);
    try { l(count); } catch {}
    return () => { countLs.delete(l); };
  },
  /** Called when the user taps the "open tabs" badge — routes to POS sheet. */
  requestOpen() {
    if (openLs.size) {
      openLs.forEach(fn => { try { fn(); } catch {} });
      return;
    }
    pendingOpen = true;
  },
  /** POSPage registers the real sheet-opener. Drains a pending request. */
  registerOpener(fn: OpenListener) {
    openLs.add(fn);
    if (pendingOpen) {
      pendingOpen = false;
      try { fn(); } catch {}
    }
    return () => { openLs.delete(fn); };
  },
};