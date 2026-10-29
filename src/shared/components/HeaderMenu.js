"use client";

import { useState, useEffect, useRef, useId } from "react";
import PropTypes from "prop-types";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ellipsis, LogOut, Moon, Power, Sun } from "lucide-react";
import { useTheme } from "@/shared/hooks/useTheme";
import { ConfirmModal } from "./Modal";

function MenuItem({ icon: Icon, label, description, onClick, danger }) {
  return (
    <button type="button" role="menuitem" tabIndex={-1} onClick={onClick} className={`group flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${danger ? "text-danger hover:bg-danger/8" : "text-text-main hover:bg-surface-2"}`}>
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-danger/8" : "bg-surface-2 text-text-muted group-hover:bg-surface"}`}><Icon size={17} strokeWidth={1.7} aria-hidden="true" /></span>
      <span className="min-w-0 text-left"><span className="block font-medium">{label}</span>{description && <span className="mt-0.5 block text-[11px] font-normal leading-4 text-text-muted">{description}</span>}</span>
    </button>
  );
}

export default function HeaderMenu({ onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { toggleTheme, isDark } = useTheme();
  const reduceMotion = useReducedMotion();
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const focusEdge = useRef("first");
  const menuId = useId();

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch {
      // A successful shutdown can close the connection before its response.
    }
    setIsShuttingDown(false);
    setShutdownOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const items = panelRef.current?.querySelectorAll('[role="menuitem"]');
    items?.[focusEdge.current === "last" ? items.length - 1 : 0]?.focus();
    const closeOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  const close = (restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleMenuKeys = (event) => {
    const items = Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') || []);
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button ref={triggerRef} type="button" onClick={() => { focusEdge.current = "first"; setIsOpen(value => !value); }} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); focusEdge.current = event.key === "ArrowUp" ? "last" : "first"; setIsOpen(true); } }} className="flex size-11 items-center justify-center rounded-xl text-text-muted transition-[background-color,color,transform] hover:bg-surface-2 hover:text-text-main active:scale-95 motion-reduce:transform-none" title="Workspace actions" aria-label="Account and application menu" aria-haspopup="menu" aria-expanded={isOpen} aria-controls={menuId}>
          <Ellipsis size={21} aria-hidden="true" />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div ref={panelRef} id={menuId} role="menu" aria-label="Account and application actions" onKeyDown={handleMenuKeys} initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 4, scale: reduceMotion ? 1 : 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }} className="absolute right-0 top-full z-50 mt-3 w-[min(280px,calc(100vw-32px))] origin-top-right overflow-hidden rounded-[22px] border border-border-subtle bg-surface/95 p-2 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
              <p role="presentation" className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-subtle">Workspace controls</p>
              <MenuItem icon={isDark ? Sun : Moon} label="Appearance" description={`Switch to ${isDark ? "light" : "dark"} mode`} onClick={() => { toggleTheme(); close(); }} />
              <div role="separator" className="mx-3 my-2 border-t border-border-subtle" />
              <MenuItem icon={LogOut} label="Sign out" description="End this dashboard session" onClick={() => { close(); onLogout(); }} />
              <MenuItem icon={Power} label="Shut down gateway" description="Stop this local server" danger onClick={() => { close(); setShutdownOpen(true); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ConfirmModal isOpen={shutdownOpen} onClose={() => setShutdownOpen(false)} onConfirm={handleShutdown} title="Shut down gateway?" message="Active requests may be interrupted. You can start the gateway again from your terminal." confirmText="Shut down" cancelText="Cancel" variant="danger" loading={isShuttingDown} />
    </>
  );
}

HeaderMenu.propTypes = { onLogout: PropTypes.func.isRequired };
