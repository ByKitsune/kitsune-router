"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { initRuntimeI18n, reloadTranslations } from "./runtime";

export function RuntimeI18nProvider({ children }) {
  const pathname = usePathname();
  useEffect(() => {
    let mounted = true;
    let cleanup;
    initRuntimeI18n().then((stop) => { if (mounted) cleanup = stop; else stop(); });
    return () => { mounted = false; cleanup?.(); };
  }, []);
  useEffect(() => {
    if (!pathname) return;
    let nextFrame;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => { reloadTranslations().catch(() => {}); });
    });
    return () => { cancelAnimationFrame(frame); if (nextFrame !== undefined) cancelAnimationFrame(nextFrame); };
  }, [pathname]);
  return <>{children}</>;
}
