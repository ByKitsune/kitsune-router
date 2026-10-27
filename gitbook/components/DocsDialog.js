"use client";

import { useEffect, useRef } from "react";

export default function DocsDialog({ open, onClose, id, labelledBy, describedBy, className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  const dismissBackdrop = (event) => {
    const dialog = ref.current;
    if (!dialog || "closedBy" in dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      dialog.close();
    }
  };

  return (
    <dialog
      ref={ref}
      id={id}
      className={`docs-dialog ${className}`}
      closedby="any"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={dismissBackdrop}
      onClose={() => { if (!ref.current?.open) onClose(); }}
    >
      {children}
    </dialog>
  );
}
