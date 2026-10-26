"use client";

import { useEffect, useId, useRef } from "react";
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

  if (!isOpen) return null;

  return (
      <dialog
        ref={dialogRef}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        onCancel={(event) => { event.preventDefault(); onClose(); }}
        onClose={onClose}
        onClick={(event) => {
          if (!closeOnOverlay || event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
        }}
        className={cn(
          "fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-h-[90dvh] overflow-hidden bg-surface text-text-main p-0 backdrop:bg-black/50",
          "rounded-xl shadow-[var(--shadow-elevated)]",
          "fade-in",
          sizes[size],
          className
        )}
      >
        {/* Header */}
        {(title || showTrafficLights) && (
          <div className="flex items-center justify-between gap-4 px-6 py-3 bg-surface-2">
            <div className="flex items-center">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-text-main">{title}</h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="size-11 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-3 hover:text-text-main transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 max-h-[calc(85dvh_-_150px)] overflow-y-auto custom-scrollbar">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-6 bg-surface-2">
            {footer}
          </div>
        )}
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
