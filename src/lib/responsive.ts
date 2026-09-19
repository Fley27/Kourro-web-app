import { useEffect, useState } from "react";

export const TABLET_MIN = 700;
export const LARGE_TABLET_MIN = 1024;

function readWidth(): number {
  if (typeof window === "undefined") return 1200;
  return window.innerWidth;
}

export function useResponsive() {
  const [width, setWidth] = useState(readWidth);
  const [height, setHeight] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isTablet = width >= TABLET_MIN;
  const isLargeTablet = width >= LARGE_TABLET_MIN;
  const isLandscape = width > height;
  const padH = isTablet ? 24 : 16;
  const gutter = isTablet ? 20 : 16;
  const contentMax = isTablet ? Math.max(560, Math.min(880, width - 64)) : width;
  const gridCols = isLargeTablet ? 3 : isTablet ? 2 : 1;
  const fabRight = 16;
  const isDesktop = width >= 1100;
  return { width, height, isTablet, isLargeTablet, isDesktop, isLandscape, padH, gutter, contentMax, gridCols, fabRight };
}

export type Responsive = ReturnType<typeof useResponsive>;

/** CSS width for centered max-width content column on tablets. */
export function contentW(isTablet: boolean, width: number, maxW = 880): string {
  if (!isTablet) return "100%";
  return `min(100%, ${Math.min(maxW, width - 32)}px)`;
}