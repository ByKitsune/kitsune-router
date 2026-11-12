"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { translateHydratedRegion } from "./runtime";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const contents = { display: "contents" };

/** Place inside each independently hydrated Suspense/route region. */
export default function RuntimeI18nBoundary({ children }) {
  const element = useRef(null);
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  useEffect(() => {
    if (hydrated) translateHydratedRegion(element.current);
  }, [hydrated]);

  return <div ref={element} style={contents} data-i18n-hydration-pending={hydrated ? undefined : ""}>{children}</div>;
}
