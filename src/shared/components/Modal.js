"use client";

import { useEffect, useId, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/shared/utils/cn";
import Button from "./Button";

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnOverlay = true,
  showTrafficLights = false,
  className,
}) {
  const dialogRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    full: "max-w-4xl",
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);

  return (
      <dialog
        ref={dialogRef}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        onClose={onClose}
        onClick={(event) => {
          if (!closeOnOverlay || event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
        }}
        className={cn(
          "fixed inset-0 m-auto w-[calc(100%_-_1.5rem)] max-h-[90dvh] overflow-hidden border border-border-subtle bg-surface text-text-main p-0 backdrop:bg-black/45 backdrop:backdrop-blur-sm sm:w-[calc(100%_-_3rem)]",
          "rounded-[24px] shadow-[var(--shadow-elevated)]",
          "fade-in",
          sizes[size],
          className
        )}
      >
        {/* Keep the native element mounted until close() restores the invoker's
            focus. Removing an open dialog bypasses that browser behavior. */}
        {isOpen && <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex max-h-[90dvh] min-w-0 flex-col"
        >
        {/* Header */}
        {(title || showTrafficLights) && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-7">
            <div className="flex min-w-0 items-center">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold leading-6 tracking-[-0.025em] text-text-main break-words">{title}</h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-main motion-reduce:transition-none"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7 custom-scrollbar">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-2/50 p-4 sm:px-7 sm:py-5">
            {footer}
          </div>
        )}
        </motion.div>}
      </dialog>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  loading = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </>
      }
    >
      <p className="text-text-muted">{message}</p>
    </Modal>
  );
}
