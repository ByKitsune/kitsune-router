"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "kitsune-router:sidebar-collapsed";
const CHANGE_EVENT = "kitsune-router:sidebar-preference";
let fallbackCollapsed = false;
let storageUnavailable = false;

function readPreference() {
  if (storageUnavailable) return fallbackCollapsed;
  try { return window.localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return fallbackCollapsed; }
}

function subscribe(callback) {
  const onStorage = event => {
    if (event.key === STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function setPreference(collapsed) {
  fallbackCollapsed = collapsed;
  try { window.localStorage.setItem(STORAGE_KEY, String(collapsed)); }
  catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** A UI-only preference; server rendering always starts with the expanded rail. */
export default function useSidebarPreference() {
  const collapsed = useSyncExternalStore(subscribe, readPreference, () => false);
  return [collapsed, setPreference];
}
