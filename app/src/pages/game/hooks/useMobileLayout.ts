import { useEffect, useState } from "react";

function computeIsMobileLayout(): boolean {
  if (typeof window === "undefined") return false;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  return narrow && portrait;
}

export function useMobileLayout(): boolean {
  const [isMobileLayout, setIsMobileLayout] = useState<boolean>(() => computeIsMobileLayout());

  useEffect(() => {
    const onResize = () => setIsMobileLayout(computeIsMobileLayout());
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return isMobileLayout;
}
