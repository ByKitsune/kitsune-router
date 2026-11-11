"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/shared/utils/cn";

/** Native top-layer drawer: contained scroll, focus trap, Escape and focus return. */
export default function Drawer({ isOpen, onClose, title, children, width = "md", className }) {
  const dialog = useRef(null);
  const titleId = useId();
  const widths = { sm: "w-[400px]", md: "w-[500px]", lg: "w-[600px]", xl: "w-[800px]", full: "w-full" };
  useEffect(() => {
    const element = dialog.current;
    if (isOpen && element && !element.open) element.showModal();
    if (!isOpen && element?.open) element.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Dialog"}
      onClose={onClose}
      onKeyDown={event => {
        // Keep Tab on the panel's controls rather than letting a one-control
        // dialog cycle through browser chrome. A nested dialog owns its keys.
        if (event.key !== "Tab" || event.target.closest("dialog") !== event.currentTarget) return;
        const controls = Array.from(event.currentTarget.querySelectorAll("a[href], button, input, select, textarea, summary, [tabindex]"))
          .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert], [hidden]") && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); event.currentTarget.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) { event.preventDefault(); first.focus(); }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      className={cn("fixed inset-0 m-0 ml-auto h-dvh max-h-none max-w-full overflow-hidden border-0 border-l border-border-subtle bg-surface p-0 text-text-main shadow-elevated backdrop:bg-black/40 backdrop:backdrop-blur-sm", widths[width] || widths.md, className)}
    >
      {isOpen && <div className="slide-in-right flex h-full min-w-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-6">
          {title && <h2 id={titleId} className="min-w-0 break-words text-base font-semibold tracking-tight">{title}</h2>}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main">
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
      </div>}
    </dialog>
  );
}
